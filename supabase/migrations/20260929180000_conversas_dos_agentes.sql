-- Conversas e Coordenação com estado recuperável (CRM-14).
-- Um pedido a um Agente, ou à Coordenação do composer (ADR-0004), vira uma Execução guardada antes de rodar. A Edge
-- Function agent-conversation é quem chama o modelo, com a chave que só ela tem: ela reserva a Execução
-- (claim_agent_run), grava cada passo como um evento numerado (append_agent_run_event) e fecha a Execução com sucesso
-- ou falha (finish_agent_run). O navegador nunca fala com o modelo: ele cria o pedido pela função e acompanha os
-- eventos pelo banco (get_agent_run_events), então recarregar a página ou perder a conexão só retoma a leitura, sem
-- rodar o pedido de novo. O mesmo pedido reenviado (mesmo client_request_id) devolve a Execução que já existe.
-- A Conversa é de quem a começou: só ele a lê, como o documento da Sequência (ADR-0008). Ela pertence ao Workspace, e
-- sair do Workspace corta a leitura e a execução. A Coordenação não é um Agente: o evento dela não tem agent_id.
-- A única consulta que o Agente faz hoje é a das Contas-alvo do Workspace (agent_search_target_accounts), só com
-- nome, domínio, segmento e origem. Nenhuma Integração está conectada, então nenhum Agente age fora da Althius.

create table private.agent_conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  -- 'agente': a Conversa na página de um Agente; 'coordenada': a do composer da página de Agentes.
  kind text not null check (kind in ('agente', 'coordenada')),
  agent_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (workspace_id, id),
  check ((kind = 'agente') = (agent_id is not null)),
  -- A Conversa com um Agente criado vai embora com ele.
  foreign key (workspace_id, agent_id) references private.agents (workspace_id, id) on delete cascade
);

create index agent_conversations_owner_idx on private.agent_conversations (workspace_id, owner_id, updated_at desc);
create index agent_conversations_owner_fk_idx on private.agent_conversations (owner_id);
create index agent_conversations_agent_idx on private.agent_conversations (workspace_id, agent_id);

create table private.agent_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  conversation_id uuid not null,
  requested_by uuid not null references auth.users(id) on delete cascade,
  -- Gerado pelo navegador a cada pedido: repetir o envio devolve a mesma Execução.
  client_request_id uuid not null,
  request_text text not null check (request_text = btrim(request_text) and length(request_text) between 1 and 4000),
  mentions uuid[] not null default '{}',
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  error_code text,
  model text,
  created_at timestamptz not null default clock_timestamp(),
  started_at timestamptz,
  finished_at timestamptz,
  unique (requested_by, client_request_id),
  foreign key (workspace_id, conversation_id) references private.agent_conversations (workspace_id, id) on delete cascade,
  check ((status = 'failed') = (error_code is not null)),
  check ((status in ('succeeded', 'failed')) = (finished_at is not null))
);

-- Um pedido por vez em cada Conversa: o seguinte espera o anterior terminar.
create unique index agent_runs_one_open_per_conversation on private.agent_runs (conversation_id)
  where status in ('queued', 'running');
create index agent_runs_conversation_idx on private.agent_runs (conversation_id, created_at);
create index agent_runs_workspace_fk_idx on private.agent_runs (workspace_id, conversation_id);

-- Os passos da Execução, na ordem em que aconteceram. O nome do Agente fica no evento, para o histórico sobreviver a ele.
create table private.agent_run_events (
  run_id uuid not null references private.agent_runs(id) on delete cascade,
  seq integer not null check (seq > 0),
  kind text not null check (kind in ('chamada', 'ferramenta', 'feito', 'texto', 'resposta', 'falha')),
  agent_id uuid,
  agent_name text,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  primary key (run_id, seq),
  check ((agent_id is null) = (agent_name is null)),
  check (kind in ('resposta', 'falha') or agent_id is not null)
);

alter table private.agent_conversations enable row level security;
alter table private.agent_runs enable row level security;
alter table private.agent_run_events enable row level security;
revoke all on private.agent_conversations from public, anon, authenticated, service_role;
revoke all on private.agent_runs from public, anon, authenticated, service_role;
revoke all on private.agent_run_events from public, anon, authenticated, service_role;

-- Prazo de uma Execução: parada além dele (a função caiu no meio), ela vira falha na próxima leitura.
create function private.agent_run_deadline()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '10 minutes' $$;

revoke all on function private.agent_run_deadline() from public, anon, authenticated, service_role;

-- Grava um evento com o próximo número. Quem chama já travou a Execução.
create function private.append_run_event(p_run_id uuid, p_kind text, p_agent_id uuid, p_agent_name text, p_payload jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seq integer;
begin
  select coalesce(max(e.seq), 0) + 1 into v_seq from private.agent_run_events e where e.run_id = p_run_id;
  insert into private.agent_run_events (run_id, seq, kind, agent_id, agent_name, payload)
  values (p_run_id, v_seq, p_kind, p_agent_id, p_agent_name, coalesce(p_payload, '{}'::jsonb));
  return v_seq;
end;
$$;

revoke all on function private.append_run_event(uuid, text, uuid, text, jsonb) from public, anon, authenticated, service_role;

-- Fecha como falha uma Execução travada que passou do prazo. Devolve se fechou.
create function private.expire_run_if_stale(p_run_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run private.agent_runs%rowtype;
begin
  select * into v_run from private.agent_runs r where r.id = p_run_id for update;
  if v_run.status not in ('queued', 'running')
     or coalesce(v_run.started_at, v_run.created_at) > clock_timestamp() - private.agent_run_deadline() then
    return false;
  end if;
  perform private.append_run_event(p_run_id, 'falha', null, null, jsonb_build_object('motivo', 'timeout'));
  update private.agent_runs
  set status = 'failed', error_code = 'timeout', finished_at = clock_timestamp()
  where id = p_run_id;
  return true;
end;
$$;

revoke all on function private.expire_run_if_stale(uuid) from public, anon, authenticated, service_role;

-- Os eventos de uma Execução depois de p_after_seq, como o navegador e a função os leem.
create function private.run_events_json(p_run_id uuid, p_after_seq integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'seq', e.seq, 'kind', e.kind, 'agent_id', e.agent_id, 'agent_name', e.agent_name, 'payload', e.payload
    ) order by e.seq), '[]'::jsonb)
  from private.agent_run_events e
  where e.run_id = p_run_id and e.seq > coalesce(p_after_seq, 0)
$$;

revoke all on function private.run_events_json(uuid, integer) from public, anon, authenticated, service_role;

-- Um pedido: cria a Conversa (sem p_conversation_id) ou continua a de quem pede, e guarda a Execução na fila.
-- p_agent_id é o Agente da página (Conversa 'agente'); sem ele, é a Coordenação. p_mentions são os Agentes que o pedido
-- @menciona, todos do mesmo Workspace. Idempotente por p_client_request_id: o mesmo pedido devolve a mesma Execução.
create function public.start_agent_run(
  p_workspace_id uuid,
  p_conversation_id uuid,
  p_agent_id uuid,
  p_text text,
  p_mentions uuid[],
  p_client_request_id uuid
)
returns table (conversation_id uuid, run_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user();
  v_text text := btrim(coalesce(p_text, ''));
  v_mentions uuid[];
  v_conversation private.agent_conversations%rowtype;
  v_run_id uuid;
begin
  perform private.require_active_membership(p_workspace_id);
  if p_client_request_id is null then
    raise exception 'client request id required' using errcode = '22023';
  end if;

  -- O mesmo pedido de novo: a Execução que já existe, sem criar outra.
  select r.conversation_id, r.id, r.status into conversation_id, run_id, status
  from private.agent_runs r
  where r.requested_by = v_user_id and r.client_request_id = p_client_request_id and r.workspace_id = p_workspace_id;
  if found then
    return next;
    return;
  end if;

  if length(v_text) not between 1 and 4000 then
    raise exception 'invalid request text' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct m), '{}'::uuid[]) into v_mentions from unnest(coalesce(p_mentions, '{}')) m;
  if cardinality(v_mentions) > 4 or exists (
    select 1 from unnest(v_mentions) m
    where not exists (select 1 from private.agents a where a.id = m and a.workspace_id = p_workspace_id)
  ) then
    raise exception 'invalid mention' using errcode = '22023';
  end if;

  if p_conversation_id is null then
    if p_agent_id is not null
       and not exists (select 1 from private.agents a where a.id = p_agent_id and a.workspace_id = p_workspace_id) then
      raise exception 'agent not found' using errcode = 'P0002';
    end if;
    insert into private.agent_conversations (workspace_id, owner_id, kind, agent_id)
    values (p_workspace_id, v_user_id, case when p_agent_id is null then 'coordenada' else 'agente' end, p_agent_id)
    returning * into v_conversation;
  else
    select * into v_conversation from private.agent_conversations c
    where c.id = p_conversation_id and c.workspace_id = p_workspace_id and c.owner_id = v_user_id
    for update;
    if not found then
      raise exception 'conversation not found' using errcode = 'P0002';
    end if;
    if v_conversation.agent_id is distinct from p_agent_id then
      raise exception 'conversation belongs to another agent' using errcode = '22023';
    end if;
  end if;

  begin
    insert into private.agent_runs (workspace_id, conversation_id, requested_by, client_request_id, request_text, mentions)
    values (p_workspace_id, v_conversation.id, v_user_id, p_client_request_id, v_text, v_mentions)
    returning id into v_run_id;
  exception when unique_violation then
    -- O mesmo pedido chegou duas vezes ao mesmo tempo: a Execução do primeiro.
    select r.conversation_id, r.id, r.status into conversation_id, run_id, status
    from private.agent_runs r
    where r.requested_by = v_user_id and r.client_request_id = p_client_request_id and r.workspace_id = p_workspace_id;
    if found then
      return next;
      return;
    end if;
    -- Outro pedido desta Conversa ainda está na fila ou rodando (a menos que tenha passado do prazo).
    if exists (
      select 1 from private.agent_runs r
      where r.conversation_id = v_conversation.id and r.status in ('queued', 'running')
        and private.expire_run_if_stale(r.id)
    ) then
      insert into private.agent_runs (workspace_id, conversation_id, requested_by, client_request_id, request_text, mentions)
      values (p_workspace_id, v_conversation.id, v_user_id, p_client_request_id, v_text, v_mentions)
      returning id into v_run_id;
    else
      raise exception 'conversation busy' using errcode = '55006';
    end if;
  end;
  update private.agent_conversations c set updated_at = clock_timestamp() where c.id = v_conversation.id;

  conversation_id := v_conversation.id;
  run_id := v_run_id;
  status := 'queued';
  return next;
end;
$$;

-- O estado de uma Execução de quem pede e os eventos depois de p_after_seq. Uma Execução parada além do prazo é fechada
-- aqui como falha ('timeout'), para a tela não esperar para sempre.
create function public.get_agent_run_events(p_run_id uuid, p_after_seq integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user();
  v_run private.agent_runs%rowtype;
begin
  select * into v_run from private.agent_runs r where r.id = p_run_id and r.requested_by = v_user_id;
  if not found then
    raise exception 'run not found' using errcode = 'P0002';
  end if;
  perform private.require_active_membership(v_run.workspace_id);
  if private.expire_run_if_stale(p_run_id) then
    select * into v_run from private.agent_runs r where r.id = p_run_id;
  end if;
  return jsonb_build_object(
    'status', v_run.status,
    'error_code', v_run.error_code,
    'events', private.run_events_json(p_run_id, p_after_seq)
  );
end;
$$;

-- As Conversas de quem pede no Workspace, da mais recente para a mais antiga, com a Execução aberta, se houver.
create function public.list_agent_conversations(p_workspace_id uuid)
returns table (id uuid, kind text, agent_id uuid, updated_at timestamptz, open_run_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user();
begin
  perform private.require_active_membership(p_workspace_id);
  return query
    select c.id, c.kind, c.agent_id, c.updated_at,
      (select r.id from private.agent_runs r where r.conversation_id = c.id and r.status in ('queued', 'running'))
    from private.agent_conversations c
    where c.workspace_id = p_workspace_id and c.owner_id = v_user_id
    order by c.updated_at desc, c.id
    limit 50;
end;
$$;

-- Uma Conversa de quem pede, com as últimas 20 Execuções em ordem e os eventos de cada uma.
create function public.get_agent_conversation(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user();
  v_conversation private.agent_conversations%rowtype;
begin
  select * into v_conversation from private.agent_conversations c
  where c.id = p_conversation_id and c.owner_id = v_user_id;
  if not found then
    raise exception 'conversation not found' using errcode = 'P0002';
  end if;
  perform private.require_active_membership(v_conversation.workspace_id);
  return jsonb_build_object(
    'id', v_conversation.id,
    'kind', v_conversation.kind,
    'agent_id', v_conversation.agent_id,
    'runs', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', r.id, 'request_text', r.request_text, 'status', r.status, 'error_code', r.error_code,
          'created_at', r.created_at, 'events', private.run_events_json(r.id, 0)
        ) order by r.created_at, r.id)
      from (
        select * from private.agent_runs r
        where r.conversation_id = p_conversation_id
        order by r.created_at desc, r.id desc
        limit 20
      ) r
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.start_agent_run(uuid, uuid, uuid, text, uuid[], uuid) from public, anon;
revoke all on function public.get_agent_run_events(uuid, integer) from public, anon;
revoke all on function public.list_agent_conversations(uuid) from public, anon;
revoke all on function public.get_agent_conversation(uuid) from public, anon;
grant execute on function public.start_agent_run(uuid, uuid, uuid, text, uuid[], uuid) to authenticated;
grant execute on function public.get_agent_run_events(uuid, integer) to authenticated;
grant execute on function public.list_agent_conversations(uuid) to authenticated;
grant execute on function public.get_agent_conversation(uuid) to authenticated;

-- A partir daqui, só a função agent-conversation (service_role).

-- Reserva a Execução para rodar: só uma vez, só na fila, e só se quem pediu ainda participa do Workspace. Devolve o que o
-- modelo precisa saber, e nada além disso: o Workspace, os Agentes (Especialidade, instruções e tom de voz), o Agente da
-- página, as menções e as últimas 10 trocas terminadas da Conversa. Sem reserva, devolve null.
create function public.claim_agent_run(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run private.agent_runs%rowtype;
  v_conversation private.agent_conversations%rowtype;
begin
  select * into v_run from private.agent_runs r where r.id = p_run_id for update;
  if not found or v_run.status <> 'queued' then
    return null;
  end if;
  select * into v_conversation from private.agent_conversations c where c.id = v_run.conversation_id;
  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = v_run.workspace_id and m.user_id = v_run.requested_by and m.active
  ) then
    perform private.append_run_event(p_run_id, 'falha', null, null, jsonb_build_object('motivo', 'membership_inactive'));
    update private.agent_runs
    set status = 'failed', error_code = 'membership_inactive', finished_at = clock_timestamp()
    where id = p_run_id;
    return null;
  end if;
  update private.agent_runs set status = 'running', started_at = clock_timestamp() where id = p_run_id;

  return jsonb_build_object(
    'run_id', v_run.id,
    'kind', v_conversation.kind,
    'workspace_name', (select w.name from public.workspaces w where w.id = v_run.workspace_id),
    'request_text', v_run.request_text,
    'agent_id', v_conversation.agent_id,
    'mentions', to_jsonb(v_run.mentions),
    'agents', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', a.id, 'name', a.name, 'specialty', a.specialty, 'kind', a.kind,
          'instructions', coalesce(s.instructions, ''), 'voice_tone', coalesce(s.voice_tone, '')
        ) order by (a.kind = 'criado'), c.position, a.created_at, a.id)
      from private.agents a
      join private.specialty_catalog c on c.specialty = a.specialty
      left join private.agent_settings s on s.agent_id = a.id
      where a.workspace_id = v_run.workspace_id
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('request', h.request_text, 'answer', h.answer) order by h.created_at)
      from (
        select r.request_text, r.created_at,
          (select string_agg(coalesce(e.agent_name || ': ', '') || (e.payload ->> 'texto'), E'\n\n' order by e.seq)
           from private.agent_run_events e
           where e.run_id = r.id and e.kind in ('texto', 'resposta')) as answer
        from private.agent_runs r
        where r.conversation_id = v_run.conversation_id and r.status = 'succeeded' and r.id <> v_run.id
        order by r.created_at desc
        limit 10
      ) h
    ), '[]'::jsonb)
  );
end;
$$;

-- Grava um passo da Execução em andamento e devolve o número dele. O Agente do passo tem de ser do Workspace.
create function public.append_agent_run_event(p_run_id uuid, p_kind text, p_agent_id uuid, p_payload jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run private.agent_runs%rowtype;
  v_agent_name text;
begin
  select * into v_run from private.agent_runs r where r.id = p_run_id for update;
  if not found or v_run.status <> 'running' then
    raise exception 'run is not running' using errcode = '55000';
  end if;
  if p_agent_id is not null then
    select a.name into v_agent_name from private.agents a where a.id = p_agent_id and a.workspace_id = v_run.workspace_id;
    if v_agent_name is null then
      raise exception 'agent not found' using errcode = 'P0002';
    end if;
  end if;
  return private.append_run_event(p_run_id, p_kind, p_agent_id, v_agent_name, p_payload);
end;
$$;

-- Fecha a Execução em andamento. Sucesso só com a resposta já gravada; falha grava o motivo como evento, se a função
-- ainda não gravou.
create function public.finish_agent_run(p_run_id uuid, p_status text, p_error_code text, p_model text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run private.agent_runs%rowtype;
begin
  select * into v_run from private.agent_runs r where r.id = p_run_id for update;
  if not found or v_run.status <> 'running' then
    raise exception 'run is not running' using errcode = '55000';
  end if;
  if p_status = 'succeeded' then
    if not exists (select 1 from private.agent_run_events e where e.run_id = p_run_id and e.kind in ('texto', 'resposta')) then
      raise exception 'run has no answer' using errcode = '55000';
    end if;
  elsif p_status = 'failed' then
    if p_error_code is null or btrim(p_error_code) = '' then
      raise exception 'error code required' using errcode = '22023';
    end if;
    if not exists (select 1 from private.agent_run_events e where e.run_id = p_run_id and e.kind = 'falha') then
      perform private.append_run_event(p_run_id, 'falha', null, null, jsonb_build_object('motivo', p_error_code));
    end if;
  else
    raise exception 'invalid status' using errcode = '22023';
  end if;
  update private.agent_runs
  set status = p_status,
    error_code = case when p_status = 'failed' then p_error_code end,
    model = p_model,
    finished_at = clock_timestamp()
  where id = p_run_id;
end;
$$;

-- A consulta de Contas-alvo que o Agente faz, no Workspace da Execução em andamento: até 10 Contas não arquivadas nem
-- apagadas cujo nome ou domínio contém o termo, só com nome, domínio, segmento, origem e a última Interação.
create function public.agent_search_target_accounts(p_run_id uuid, p_query text)
returns table (name text, domain text, segment text, origin text, last_interaction_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_query text := btrim(coalesce(p_query, ''));
begin
  select r.workspace_id into v_workspace_id from private.agent_runs r where r.id = p_run_id and r.status = 'running';
  if v_workspace_id is null then
    raise exception 'run is not running' using errcode = '55000';
  end if;
  if length(v_query) > 200 then
    raise exception 'invalid query' using errcode = '22023';
  end if;
  return query
    select t.name, t.domain, t.segment, t.origin, t.last_interaction_at
    from public.target_accounts t
    where t.workspace_id = v_workspace_id and t.archived_at is null and t.deleted_at is null
      and (v_query = '' or strpos(lower(t.name), lower(v_query)) > 0 or strpos(lower(t.domain), lower(v_query)) > 0)
    order by t.last_interaction_at desc nulls last, t.name
    limit 10;
end;
$$;

revoke all on function public.claim_agent_run(uuid) from public, anon, authenticated;
revoke all on function public.append_agent_run_event(uuid, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.finish_agent_run(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.agent_search_target_accounts(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_agent_run(uuid) to service_role;
grant execute on function public.append_agent_run_event(uuid, text, uuid, jsonb) to service_role;
grant execute on function public.finish_agent_run(uuid, text, text, text) to service_role;
grant execute on function public.agent_search_target_accounts(uuid, text) to service_role;

-- O fio do Canal Slack (slack-canal 03; decisões Q8, Q19, Q20 e Q21). Uma mensagem com exatamente um @Agente que atende
-- no Slack abre um fio: a Althius cria uma Conversa direta com aquele Agente, cujo dono é quem mencionou, com origem
-- Slack, grava o fio (`team_id` + canal + `thread_ts`) e guarda uma Execução com o gatilho Canal na mesma fila de
-- private.agent_runs. Daí em diante vale o contrato de sempre: o worker do Hermes (ou a ponte) reserva, roda e fecha a
-- Execução sem saber que veio do Slack. Créditos e Permissões são os da Conversa.
--
-- Quando a Execução do Canal chega a um estado final, um gatilho chama pelo pg_net a Edge Function
-- `slack-channel-delivery`, com o id da Execução e um segredo interno. A função reserva a entrega uma vez só (a marca de
-- entregue na Execução) e posta a resposta no thread do fio. O endereço da função e o segredo ficam no Vault
-- (`slack_channel_delivery_url` e `slack_channel_delivery_secret`): sem eles, ou sem o pg_net, nada é chamado.
--
-- Funções compartilhadas redefinidas a partir da definição mais recente da `main`: claim_agent_run (20261020120000),
-- que passa a devolver também o gatilho (`trigger_kind`), para o motor rodar a Execução do Canal só com o Agente do fio.

-- 1. O gatilho Canal na Execução e a marca de entregue.
do $drop$
declare
  v_name text;
begin
  select con.conname into v_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'private'
    and rel.relname = 'agent_runs'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%trigger_kind%'
    and pg_get_constraintdef(con.oid) ilike '%rotina%'
    and pg_get_constraintdef(con.oid) not ilike '%routine_id%';
  if v_name is not null then
    execute format('alter table private.agent_runs drop constraint %I', v_name);
  end if;
end
$drop$;

alter table private.agent_runs
  add constraint agent_runs_trigger_kind_check check (trigger_kind in ('conversa', 'rotina', 'canal')),
  -- Quando a entrega da Execução do Canal foi reservada (postada ou, com o Canal retirado, só marcada). Nula nas outras.
  add column channel_delivered_at timestamptz,
  add constraint agent_runs_channel_delivery_check check (channel_delivered_at is null or trigger_kind = 'canal');

-- 2. A origem da Conversa: a Althius ou o Slack. Quem já existia é da Althius.
alter table private.agent_conversations
  add column origin text not null default 'althius' check (origin in ('althius', 'slack'));

-- 3. O fio do Slack: a chave é o workspace Slack, o canal (ou o DM) e o `thread_ts`. Um fio é uma Conversa só, de um
-- dono só, com um Agente só. A Conversa apagada leva o fio.
create table private.slack_channel_threads (
  team_id text not null check (team_id ~ '^[A-Z0-9]{2,32}$'),
  channel_id text not null check (channel_id ~ '^[A-Z0-9]{2,32}$'),
  thread_ts text not null check (thread_ts ~ '^[0-9]{1,12}\.[0-9]{1,8}$'),
  workspace_id uuid not null,
  conversation_id uuid not null unique,
  owner_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (team_id, channel_id, thread_ts),
  foreign key (workspace_id, conversation_id) references private.agent_conversations (workspace_id, id) on delete cascade,
  foreign key (workspace_id, agent_id) references private.agents (workspace_id, id) on delete cascade
);

create index slack_channel_threads_workspace_idx on private.slack_channel_threads (workspace_id, conversation_id);
create index slack_channel_threads_owner_idx on private.slack_channel_threads (owner_id);
create index slack_channel_threads_agent_idx on private.slack_channel_threads (workspace_id, agent_id);

alter table private.slack_channel_threads enable row level security;
revoke all on private.slack_channel_threads from public, anon, authenticated, service_role;

-- 4. A Execução pelo Canal, em nome da Conta de usuário que o servidor identificou pelo e-mail do Slack (no padrão de
-- begin_crm_handoff_by_agents). Confere a instalação ativa do `team_id` no Workspace (55000), a Participação ativa
-- (42501), o contrato (ADR-0025; P0001 "active contract required") e o Agente com o Slack na lista de canais da
-- Personalização (22023). Abre o fio (Conversa `agente` de origem Slack, dono quem mencionou) ou continua o do mesmo dono
-- e do mesmo Agente; o fio de outra pessoa (42501) ou de outro Agente (22023) é recusado. Grava o pedido com o gatilho
-- Canal, sem Menções: um fio, um Agente (Q20). O `event_id` do Slack vira o `client_request_id`, então o mesmo evento
-- devolve a mesma Execução. Com outra Execução aberta no fio: 55006 "conversation busy".
create function public.start_slack_channel_run(
  p_workspace_id uuid,
  p_user_id uuid,
  p_agent_id uuid,
  p_team_id text,
  p_channel_id text,
  p_thread_ts text,
  p_text text,
  p_event_id text
) returns table (conversation_id uuid, run_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_text text := btrim(coalesce(p_text, ''));
  v_request uuid;
  v_thread private.slack_channel_threads%rowtype;
  v_conversation_id uuid;
  v_run_id uuid;
begin
  if p_event_id is null or btrim(p_event_id) = '' then
    raise exception 'event id is required' using errcode = '22023';
  end if;
  v_request := md5('slack:' || p_event_id)::uuid;
  if not exists (
    select 1 from private.slack_channel_installations i
    where i.workspace_id = p_workspace_id and i.team_id = p_team_id and i.state = 'ativo'
  ) then
    raise exception 'slack channel is not installed' using errcode = '55000';
  end if;
  if p_user_id is null or not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = p_workspace_id and m.user_id = p_user_id and m.active
  ) then
    raise exception 'active workspace membership required' using errcode = '42501';
  end if;

  -- O mesmo evento de novo: a Execução que já existe, sem criar outra.
  return query
    select r.conversation_id, r.id, r.status from private.agent_runs r
    where r.requested_by = p_user_id and r.client_request_id = v_request and r.workspace_id = p_workspace_id;
  if found then
    return;
  end if;

  if private.automation_contract_block(p_workspace_id) is not null then
    raise exception 'active contract required' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from private.agents a
    join private.agent_settings s on s.agent_id = a.id
    where a.id = p_agent_id and a.workspace_id = p_workspace_id and 'slack' = any (s.channels)
  ) then
    raise exception 'agent does not answer in slack' using errcode = '22023';
  end if;
  if length(v_text) not between 1 and 4000 then
    raise exception 'invalid request text' using errcode = '22023';
  end if;

  -- Dois eventos do mesmo fio ao mesmo tempo abrem um fio só.
  perform pg_advisory_xact_lock(hashtext('slack_thread:' || p_team_id || ':' || p_channel_id || ':' || p_thread_ts));
  select * into v_thread from private.slack_channel_threads t
  where t.team_id = p_team_id and t.channel_id = p_channel_id and t.thread_ts = p_thread_ts;
  if found then
    if v_thread.workspace_id <> p_workspace_id or v_thread.owner_id <> p_user_id then
      raise exception 'thread belongs to another person' using errcode = '42501';
    end if;
    if v_thread.agent_id <> p_agent_id then
      raise exception 'thread belongs to another agent' using errcode = '22023';
    end if;
    v_conversation_id := v_thread.conversation_id;
  else
    insert into private.agent_conversations (workspace_id, owner_id, kind, agent_id, origin)
    values (p_workspace_id, p_user_id, 'agente', p_agent_id, 'slack')
    returning id into v_conversation_id;
    insert into private.slack_channel_threads (team_id, channel_id, thread_ts, workspace_id, conversation_id, owner_id, agent_id)
    values (p_team_id, p_channel_id, p_thread_ts, p_workspace_id, v_conversation_id, p_user_id, p_agent_id);
  end if;

  begin
    insert into private.agent_runs (workspace_id, conversation_id, requested_by, client_request_id, request_text, trigger_kind)
    values (p_workspace_id, v_conversation_id, p_user_id, v_request, v_text, 'canal')
    returning id into v_run_id;
  exception when unique_violation then
    -- O mesmo evento chegou duas vezes ao mesmo tempo: a Execução do primeiro.
    return query
      select r.conversation_id, r.id, r.status from private.agent_runs r
      where r.requested_by = p_user_id and r.client_request_id = v_request and r.workspace_id = p_workspace_id;
    if found then
      return;
    end if;
    -- Outro pedido deste fio ainda está na fila ou rodando (a menos que tenha passado do prazo).
    if exists (
      select 1 from private.agent_runs r
      where r.conversation_id = v_conversation_id and r.status in ('queued', 'running')
        and private.expire_run_if_stale(r.id)
    ) then
      insert into private.agent_runs (workspace_id, conversation_id, requested_by, client_request_id, request_text, trigger_kind)
      values (p_workspace_id, v_conversation_id, p_user_id, v_request, v_text, 'canal')
      returning id into v_run_id;
    else
      raise exception 'conversation busy' using errcode = '55006';
    end if;
  end;
  update private.agent_conversations c set updated_at = clock_timestamp() where c.id = v_conversation_id;

  return query select v_conversation_id, v_run_id, 'queued'::text;
end;
$$;

-- 5. A entrega no thread, uma vez só: marca a Execução do Canal já terminada como entregue e devolve o que postar (o
-- estado, o motivo da falha, a resposta, o fio) e o token do bot, nulo quando o Canal foi retirado (não se posta, só se
-- marca). Execução que não é do Canal, que não terminou ou que já foi entregue: nenhuma linha.
create function public.claim_slack_channel_delivery(p_run_id uuid)
returns table (
  status text, error_code text, answer text, team_id text, channel_id text, thread_ts text, bot_token text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_run private.agent_runs%rowtype;
  v_thread private.slack_channel_threads%rowtype;
  v_secret_name text;
begin
  select * into v_run from private.agent_runs r where r.id = p_run_id for update;
  if not found or v_run.trigger_kind <> 'canal' or v_run.status not in ('succeeded', 'failed')
     or v_run.channel_delivered_at is not null then
    return;
  end if;
  update private.agent_runs r set channel_delivered_at = clock_timestamp() where r.id = p_run_id;
  select * into v_thread from private.slack_channel_threads t where t.conversation_id = v_run.conversation_id;
  if not found then
    return;
  end if;
  select i.secret_name into v_secret_name from private.slack_channel_installations i
  where i.workspace_id = v_run.workspace_id and i.team_id = v_thread.team_id and i.state = 'ativo';
  return query select
    v_run.status,
    v_run.error_code,
    (select string_agg(e.payload ->> 'texto', E'\n\n' order by e.seq)
     from private.agent_run_events e
     where e.run_id = p_run_id and e.kind in ('texto', 'resposta') and coalesce(e.payload ->> 'texto', '') <> ''),
    v_thread.team_id,
    v_thread.channel_id,
    v_thread.thread_ts,
    case when v_secret_name is null then null else private.integration_secret_get(v_secret_name) end;
end;
$$;

-- O endereço da função de entrega e o segredo interno, do Vault. A Edge Function confere o segredo que recebe com o
-- mesmo valor, guardado nos segredos dela.
create function private.slack_channel_delivery_target()
returns table (url text, secret text)
language sql
stable
security definer
set search_path = ''
as $$
  select private.integration_secret_get('slack_channel_delivery_url'),
    private.integration_secret_get('slack_channel_delivery_secret')
$$;

-- 6. O gatilho: a Execução do Canal chegou a um estado final (sucesso, falha ou prazo vencido). Sem o pg_net, sem o
-- endereço ou sem o segredo no Vault, não chama nada. Uma falha ao chamar nunca desfaz o fechamento da Execução.
create function private.notify_slack_channel_delivery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'net' and p.proname = 'http_post'
  ) then
    return null;
  end if;
  select t.url, t.secret into v_url, v_secret from private.slack_channel_delivery_target() t;
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    return null;
  end if;
  begin
    execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 10000)'
    using v_url, jsonb_build_object('run_id', new.id),
      jsonb_build_object('Content-Type', 'application/json', 'x-slack-delivery-secret', v_secret);
  exception when others then
    raise warning 'slack channel delivery not requested for run %: %', new.id, sqlstate;
  end;
  return null;
end;
$$;

create trigger agent_runs_slack_channel_delivery
  after update of status on private.agent_runs
  for each row
  when (new.trigger_kind = 'canal' and new.status in ('succeeded', 'failed') and old.status is distinct from new.status)
  execute function private.notify_slack_channel_delivery();

-- 7. A reserva da Execução passa a dizer o gatilho. O resto é a definição de 20261020120000, sem mudança.
create or replace function public.claim_agent_run(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run private.agent_runs%rowtype;
  v_conversation private.agent_conversations%rowtype;
  v_estimate integer;
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
    perform private.close_run_credits(p_run_id);
    return null;
  end if;
  -- Execução de Rotina cuja Rotina foi pausada ou apagada depois de entrar na fila (a corrida entre o relógio e o clique
  -- em "pausar"): fecha sem chamar o modelo. Apagada, o `routine_id` ficou nulo.
  if v_run.trigger_kind = 'rotina' and not exists (
    select 1 from private.agent_routines r where r.id = v_run.routine_id and not r.paused
  ) then
    perform private.append_run_event(p_run_id, 'falha', null, null, jsonb_build_object('motivo', 'routine_paused'));
    update private.agent_runs
    set status = 'failed', error_code = 'routine_paused', finished_at = clock_timestamp()
    where id = p_run_id;
    perform private.close_run_credits(p_run_id);
    return null;
  end if;

  if v_run.trigger_kind = 'rotina' and private.automation_contract_block(v_run.workspace_id) is not null then
    perform private.append_run_event(p_run_id, 'falha', null, null, jsonb_build_object('motivo', 'contrato_inativo'));
    update private.agent_runs
    set status = 'failed', error_code = 'contrato_inativo', finished_at = clock_timestamp()
    where id = p_run_id;
    perform private.close_run_credits(p_run_id);
    return null;
  end if;

  if private.credits_enforced(v_run.workspace_id) then
    v_estimate := case
      when v_conversation.kind = 'coordenada' then 3
      else 1 + (
        select count(distinct a.id)::integer from private.agents a
        where a.workspace_id = v_run.workspace_id and a.id = any (v_run.mentions) and a.id is distinct from v_conversation.agent_id
      )
    end;
    begin
      perform public.reserve_credits(
        v_run.workspace_id, v_run.requested_by, 'agent_round', 'run:' || p_run_id::text, v_estimate,
        exists (select 1 from private.workspace_ai_keys k where k.workspace_id = v_run.workspace_id)
      );
    exception when others then
      if sqlerrm not in ('insufficient credits', 'monthly credit limit reached') then
        raise;
      end if;
      perform private.append_run_event(p_run_id, 'falha', null, null, jsonb_build_object('motivo', 'insufficient_credits'));
      update private.agent_runs
      set status = 'failed', error_code = 'insufficient_credits', finished_at = clock_timestamp()
      where id = p_run_id;
      perform private.close_run_credits(p_run_id);
      return null;
    end;
  end if;

  update private.agent_runs set status = 'running', started_at = clock_timestamp() where id = p_run_id;

  return jsonb_build_object(
    'run_id', v_run.id,
    'kind', v_conversation.kind,
    'trigger_kind', v_run.trigger_kind,
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

revoke all on function public.start_slack_channel_run(uuid, uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.claim_slack_channel_delivery(uuid) from public, anon, authenticated;
revoke all on function private.slack_channel_delivery_target() from public, anon, authenticated, service_role;
revoke all on function private.notify_slack_channel_delivery() from public, anon, authenticated, service_role;
grant execute on function public.start_slack_channel_run(uuid, uuid, uuid, text, text, text, text, text) to service_role;
grant execute on function public.claim_slack_channel_delivery(uuid) to service_role;

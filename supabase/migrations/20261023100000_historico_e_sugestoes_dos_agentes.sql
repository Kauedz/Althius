-- Histórico de Conversas por Agente e sugestões de pedido a partir dos dados do Workspace (PR-9).
-- Aditiva e idempotente. A Conversa segue só de quem a começou (ADR-0008): arquivar a tira da lista, sem apagar nada.
-- As sugestões são por regra, sem modelo: olham as Contas quentes e seus Sinais, as Candidatas novas da Descoberta, o
-- ICP e as Personas do Playbook, as Aprovações pendentes e as Sequências pausadas. Ficam guardadas por 6 horas, ou até
-- chegar um Sinal novo no Workspace; sem dados, voltam frases genéricas da Especialidade.

alter table private.agent_conversations add column if not exists archived_at timestamptz;

create index if not exists agent_conversations_history_idx
  on private.agent_conversations (workspace_id, owner_id, agent_id, updated_at desc)
  where archived_at is null;

-- As Conversas de quem pede com um Agente (ou com a Coordenação, quando p_agent_id é nulo), da mais recente à mais
-- antiga, em páginas: a próxima página pede as anteriores a p_before. O título é o nome dado ou o começo do primeiro pedido.
create or replace function public.list_agent_conversations_of_agent(
  p_workspace_id uuid,
  p_agent_id uuid,
  p_limit integer default 30,
  p_before timestamptz default null
)
returns table (
  id uuid,
  kind text,
  agent_id uuid,
  title text,
  named boolean,
  first_request text,
  updated_at timestamptz,
  open_run_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user();
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
begin
  perform private.require_active_membership(p_workspace_id);
  return query
    select c.id, c.kind, c.agent_id,
      coalesce(c.title, left(btrim(f.request_text), 60)),
      c.title is not null,
      f.request_text,
      c.updated_at,
      (select r.id from private.agent_runs r where r.conversation_id = c.id and r.status in ('queued', 'running'))
    from private.agent_conversations c
    left join lateral (
      select r.request_text from private.agent_runs r where r.conversation_id = c.id order by r.created_at, r.id limit 1
    ) f on true
    where c.workspace_id = p_workspace_id
      and c.owner_id = v_user_id
      and c.archived_at is null
      and (case when p_agent_id is null then c.kind = 'coordenada' else c.kind = 'agente' and c.agent_id = p_agent_id end)
      and (p_before is null or c.updated_at < p_before)
    order by c.updated_at desc, c.id
    limit v_limit;
end;
$$;

-- Arquiva a Conversa de quem a começou: ela some do histórico, e nada é apagado.
create or replace function public.archive_agent_conversation(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user();
  v_workspace_id uuid;
begin
  select c.workspace_id into v_workspace_id from private.agent_conversations c
  where c.id = p_conversation_id and c.owner_id = v_user_id;
  if v_workspace_id is null then
    raise exception 'conversation not found' using errcode = 'P0002';
  end if;
  perform private.require_active_membership(v_workspace_id);
  update private.agent_conversations set archived_at = coalesce(archived_at, clock_timestamp())
  where id = p_conversation_id;
end;
$$;

create table if not exists private.agent_prompt_suggestion_cache (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  suggestions jsonb not null check (jsonb_typeof(suggestions) = 'array'),
  computed_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  primary key (workspace_id, agent_id, user_id),
  foreign key (workspace_id, agent_id) references private.agents (workspace_id, id) on delete cascade
);

create index if not exists agent_prompt_suggestion_cache_user_idx on private.agent_prompt_suggestion_cache (user_id);

alter table private.agent_prompt_suggestion_cache enable row level security;
revoke all on private.agent_prompt_suggestion_cache from public, anon, authenticated, service_role;

-- As sugestões calculadas agora, pela Especialidade do Agente. Até 4, sem repetir.
create or replace function private.compute_agent_prompt_suggestions(p_workspace_id uuid, p_specialty text, p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_quente text;
  v_frase text;
  v_novas integer;
  v_aprovacoes integer;
  v_pausadas integer;
  v_icp boolean;
  v_personas boolean;
  v_lista jsonb := '[]'::jsonb;
begin
  -- A Conta mais quente: a com mais Sinais válidos, e o Sinal mais recente dela.
  select t.name, s.phrase into v_quente, v_frase
  from private.signals s
  join public.target_accounts t on t.workspace_id = s.workspace_id and t.id = s.target_account_id
  where s.workspace_id = p_workspace_id and private.signal_is_valid(s.fired_at)
  order by (select count(*) from private.signals x
            where x.workspace_id = s.workspace_id and x.target_account_id = s.target_account_id
              and private.signal_is_valid(x.fired_at)) desc,
    s.fired_at desc, t.name
  limit 1;

  select count(*)::int into v_novas from private.discovered_accounts d
  where d.workspace_id = p_workspace_id and d.state = 'nova';
  select count(*)::int into v_aprovacoes from private.approvals a
  where a.workspace_id = p_workspace_id and a.state = 'pendente' and a.expires_at > now();
  select count(*)::int into v_pausadas from public.sequences q
  where q.workspace_id = p_workspace_id and q.owner_user_id = p_user_id and q.status = 'pausada';
  select exists (select 1 from private.playbook_section_versions v where v.workspace_id = p_workspace_id and v.section = 'icp')
    into v_icp;
  select exists (select 1 from private.playbook_section_versions v where v.workspace_id = p_workspace_id and v.section = 'personas')
    into v_personas;

  if p_specialty = 'scopus' then
    if v_quente is not null then
      v_lista := v_lista || jsonb_build_object('id', 'scopus-aderencia-quente', 'texto', format('Pontue a aderência da %s ao nosso ICP', v_quente));
    end if;
    if v_novas > 0 then
      v_lista := v_lista || jsonb_build_object('id', 'scopus-descoberta', 'texto',
        format('Avalie %s contra o nosso ICP', case when v_novas = 1 then 'a Candidata nova da Descoberta' else format('as %s Candidatas novas da Descoberta', v_novas) end));
    end if;
    v_lista := v_lista || case when v_icp
      then jsonb_build_object('id', 'scopus-revisar-icp', 'texto', 'Revise o nosso ICP com as Contas que mostraram Sinais')
      else jsonb_build_object('id', 'scopus-primeiro-icp', 'texto', 'Monte o primeiro ICP do Workspace a partir dos nossos clientes') end;
    v_lista := v_lista || jsonb_build_object('id', 'scopus-contas', 'texto', 'Quais Contas-alvo mais se parecem com o nosso ICP?');
  elsif p_specialty = 'ethos' then
    if v_quente is not null then
      v_lista := v_lista || jsonb_build_object('id', 'ethos-comite-quente', 'texto', format('Monte as Personas do Comitê de compra da %s', v_quente));
    end if;
    v_lista := v_lista || case when v_personas
      then jsonb_build_object('id', 'ethos-objecoes', 'texto', 'Quais objeções as nossas Personas levantam hoje?')
      else jsonb_build_object('id', 'ethos-primeiras-personas', 'texto', 'Descreva as Personas do nosso Comitê de compra') end;
    if v_icp then
      v_lista := v_lista || jsonb_build_object('id', 'ethos-icp', 'texto', 'Quem decide a compra nas empresas do nosso ICP?');
    end if;
    v_lista := v_lista || jsonb_build_object('id', 'ethos-gatilhos', 'texto', 'Quais gatilhos fazem um diretor comercial agir?');
  elsif p_specialty = 'rhetor' then
    if v_quente is not null then
      v_lista := v_lista || jsonb_build_object('id', 'rhetor-abordagem-quente', 'texto',
        format('Escreva uma abordagem para a %s sobre: %s', v_quente, left(v_frase, 60)));
    end if;
    if v_pausadas > 0 then
      v_lista := v_lista || jsonb_build_object('id', 'rhetor-pausadas', 'texto',
        format('Revise %s e proponha a retomada', case when v_pausadas = 1 then 'a Sequência pausada' else format('as %s Sequências pausadas', v_pausadas) end));
    end if;
    if v_aprovacoes > 0 then
      v_lista := v_lista || jsonb_build_object('id', 'rhetor-aprovacoes', 'texto',
        format('Resuma %s antes de eu decidir', case when v_aprovacoes = 1 then 'a Aprovação pendente' else format('as %s Aprovações pendentes', v_aprovacoes) end));
    end if;
    v_lista := v_lista || jsonb_build_object('id', 'rhetor-cadencia', 'texto', 'Proponha uma cadência de 4 passos para as Contas quentes');
  else
    if v_quente is not null then
      v_lista := v_lista || jsonb_build_object('id', 'oraculum-quente', 'texto', format('Como os LLMs descrevem a %s hoje?', v_quente));
    end if;
    v_lista := v_lista || jsonb_build_object('id', 'oraculum-presenca', 'texto', 'Como os LLMs descrevem a nossa empresa hoje?');
    v_lista := v_lista || jsonb_build_object('id', 'oraculum-concorrentes', 'texto', 'Compare a nossa presença nos LLMs com a dos concorrentes');
    if v_icp then
      v_lista := v_lista || jsonb_build_object('id', 'oraculum-icp', 'texto', 'Que perguntas o nosso ICP faz aos LLMs antes de comprar?');
    end if;
  end if;

  -- Sem dado nenhum, as genéricas já completam 3; com dados, no máximo 4.
  if jsonb_array_length(v_lista) < 3 then
    v_lista := v_lista || jsonb_build_object('id', p_specialty || '-geral', 'texto', 'O que você pode fazer por mim hoje?');
  end if;
  if jsonb_array_length(v_lista) < 3 then
    v_lista := v_lista || jsonb_build_object('id', p_specialty || '-semana', 'texto', 'Quais Contas-alvo merecem atenção esta semana?');
  end if;
  return (select coalesce(jsonb_agg(e order by n), '[]'::jsonb) from jsonb_array_elements(v_lista) with ordinality as x(e, n) where n <= 4);
end;
$$;

revoke all on function private.compute_agent_prompt_suggestions(uuid, text, uuid) from public, anon, authenticated, service_role;

-- As sugestões da Conversa com um Agente: as guardadas, se não venceram e nenhum Sinal chegou depois; senão, calcula de novo.
create or replace function public.agent_prompt_suggestions(p_workspace_id uuid, p_agent_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user();
  v_specialty text;
  v_cache private.agent_prompt_suggestion_cache%rowtype;
  v_ultimo_sinal timestamptz;
  v_lista jsonb;
begin
  perform private.require_active_membership(p_workspace_id);
  select a.specialty into v_specialty from private.agents a where a.workspace_id = p_workspace_id and a.id = p_agent_id;
  if v_specialty is null then
    raise exception 'agent not found' using errcode = 'P0002';
  end if;

  select * into v_cache from private.agent_prompt_suggestion_cache c
  where c.workspace_id = p_workspace_id and c.agent_id = p_agent_id and c.user_id = v_user_id;
  select max(s.created_at) into v_ultimo_sinal from private.signals s where s.workspace_id = p_workspace_id;

  if v_cache.workspace_id is not null and v_cache.expires_at > clock_timestamp()
     and (v_ultimo_sinal is null or v_ultimo_sinal <= v_cache.computed_at) then
    return v_cache.suggestions;
  end if;

  v_lista := private.compute_agent_prompt_suggestions(p_workspace_id, v_specialty, v_user_id);
  insert into private.agent_prompt_suggestion_cache as c (workspace_id, agent_id, user_id, suggestions, computed_at, expires_at)
  values (p_workspace_id, p_agent_id, v_user_id, v_lista, clock_timestamp(), clock_timestamp() + interval '6 hours')
  on conflict (workspace_id, agent_id, user_id) do update
    set suggestions = excluded.suggestions, computed_at = excluded.computed_at, expires_at = excluded.expires_at;
  return v_lista;
end;
$$;

revoke all on function public.list_agent_conversations_of_agent(uuid, uuid, integer, timestamptz) from public, anon;
revoke all on function public.archive_agent_conversation(uuid) from public, anon;
revoke all on function public.agent_prompt_suggestions(uuid, uuid) from public, anon;
grant execute on function public.list_agent_conversations_of_agent(uuid, uuid, integer, timestamptz) to authenticated;
grant execute on function public.archive_agent_conversation(uuid) to authenticated;
grant execute on function public.agent_prompt_suggestions(uuid, uuid) to authenticated;

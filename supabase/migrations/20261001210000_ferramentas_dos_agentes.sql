-- As ferramentas dos Agentes (Etapa 5b, CRM-14 e CRM-15): o que o motor (a ponte `agent-conversation` ou o worker do
-- Hermes) precisa do banco para que o Scopus, o Ethos, o Rhetor e o Oraculum AJAM, e não só conversem. Tudo só do
-- servidor (chave de serviço), sempre a partir de uma Execução em andamento, e nunca com dado de outro Workspace:
--
--   agent_run_tools_context           o Workspace, quem pediu e as Permissões de cada Agente nas Integrações ligadas;
--   agent_read_accounts_and_signals   a leitura enxuta do Workspace: Contas-alvo, estágio, Sinais ativos e Contatos;
--   agent_request_account_discovery   o Scopus pede uma busca pelo ICP; ela fica aguardando a pessoa confirmar na Caixa
--                                     de Descobertas (o Agente propõe, a pessoa decide e só então gasta Créditos);
--   get_discovery_proposal            o pedido do Agente lido por quem confirma (a Edge Function `account-discovery`);
--   agent_propose_crm_handoff         o Agente propõe Enviar ao CRM: o banco monta o que vai e cria a Aprovação com
--                                     esse conteúdo exato (Propor: pendente; Executar: já liberada);
--   crm_handoff_approval              o executor lê a Aprovação de envio (com o Administrador que pediu a execução);
--   begin_approved_crm_handoff        o envio de uma Aprovação reservada, ligado a ela por `approval_id`;
--   approval_in_execution             o Acesso confere que a escrita do Agente com Propor tem Aprovação em execução.
--
-- O Agente nunca escolhe o conteúdo do que vai ao CRM: só a Conta e o CRM. O que vai é montado aqui, guardado na
-- Aprovação e enviado como está (um payload diferente do aprovado não sai, por `claim_approved_action`).

-- 1. O que vai ao CRM, montado num lugar só para a Aprovação: a empresa, os Contatos ativos e a nota (como em
--    `begin_crm_handoff`, que fica como está).
create function private.crm_handoff_payload(p_workspace_id uuid, p_target_account_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_account public.target_accounts%rowtype;
  v_contacts jsonb;
begin
  select * into v_account from public.target_accounts a
  where a.workspace_id = p_workspace_id and a.id = p_target_account_id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'nome', c.name, 'cargo', c.role, 'email', c.email, 'telefone', c.phone, 'linkedin', c.linkedin
    ) order by c.name, c.id), '[]'::jsonb)
    into v_contacts
  from public.contacts c
  where c.workspace_id = p_workspace_id and c.archived_at is null
    and exists (
      select 1 from public.contact_account_links l
      where l.workspace_id = p_workspace_id and l.contact_id = c.id
        and l.target_account_id = p_target_account_id and l.ended_at is null
    );

  return jsonb_build_object(
    'empresa', jsonb_build_object(
      'nome', v_account.name,
      'dominio', v_account.domain,
      'site', v_account.canonical_url,
      'cnpj', v_account.legal_identifier,
      'segmento', v_account.segment,
      'linkedin', v_account.linkedin_url
    ),
    'contatos', v_contacts,
    'nota', private.crm_handoff_note(p_workspace_id, p_target_account_id)
  );
end;
$$;

revoke all on function private.crm_handoff_payload(uuid, uuid) from public, anon, authenticated, service_role;

-- A Execução em andamento, ou 55000. Toda função daqui começa por ela: é o que prende o motor ao Workspace do pedido.
create function private.running_agent_run(p_run_id uuid)
returns private.agent_runs
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_run private.agent_runs%rowtype;
begin
  select * into v_run from private.agent_runs r where r.id = p_run_id;
  if not found or v_run.status <> 'running' then
    raise exception 'run is not running' using errcode = '55000';
  end if;
  return v_run;
end;
$$;

revoke all on function private.running_agent_run(uuid) from public, anon, authenticated, service_role;

-- 2. O contexto das ferramentas: o Workspace, quem pediu (o Acesso dele é o usado nas Integrações, ADR-0017) e, para
--    cada Agente do Workspace, a Permissão em cada Integração LIGADA no Workspace, com a categoria (CRM, Dados…).
create function public.agent_run_tools_context(p_run_id uuid)
returns table (workspace_id uuid, requested_by uuid, permissions jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_run private.agent_runs%rowtype := private.running_agent_run(p_run_id);
begin
  return query select
    v_run.workspace_id,
    v_run.requested_by,
    coalesce((
      select jsonb_agg(jsonb_build_object(
          'agent_id', p.agent_id, 'integration_id', p.integration_id, 'permission', p.permission,
          'category', c.category, 'name', c.name
        ) order by p.agent_id, p.integration_id)
      from private.agent_permissions p
      join private.integration_catalog c on c.id = p.integration_id
      where p.workspace_id = v_run.workspace_id
        and exists (
          select 1 from public.workspace_integrations w
          where w.workspace_id = v_run.workspace_id and w.integration_id = p.integration_id
        )
    ), '[]'::jsonb);
end;
$$;

-- 3. A leitura do Workspace para os Agentes: até 20 Contas-alvo ativas (as com Sinal ativo primeiro), com o estágio, os
--    Sinais ativos (até 5 por Conta) e os Contatos ativos (até 10 por Conta, só nome e cargo, e se há e-mail ou telefone:
--    o modelo não recebe o dado de contato). `p_only_hot` traz só as que têm Sinal ativo.
create function public.agent_read_accounts_and_signals(
  p_run_id uuid, p_query text default '', p_only_hot boolean default false, p_limit integer default 10
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_run private.agent_runs%rowtype := private.running_agent_run(p_run_id);
  v_query text := btrim(coalesce(p_query, ''));
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 20);
  v_result jsonb;
begin
  if length(v_query) > 200 then
    raise exception 'invalid query' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(conta order by quentes desc, ultima desc nulls last, nome), '[]'::jsonb) into v_result
  from (
    select
      t.name as nome,
      t.last_interaction_at as ultima,
      (select count(*) from private.signals s
        where s.workspace_id = t.workspace_id and s.target_account_id = t.id and private.signal_is_valid(s.fired_at)) as quentes,
      jsonb_build_object(
        'id', t.id,
        'nome', t.name,
        'dominio', t.domain,
        'segmento', t.segment,
        'estagio', coalesce(ps.stage, 'descoberta'),
        'responsavel_e_quem_pediu', exists (
          select 1 from public.sales_responsibilities r
          where r.workspace_id = t.workspace_id and r.target_account_id = t.id::text and r.owner_user_id = v_run.requested_by),
        'sinais', coalesce((
          select jsonb_agg(jsonb_build_object('frase', s.phrase, 'data', s.fired_at) order by s.fired_at desc)
          from (
            select s2.phrase, s2.fired_at from private.signals s2
            where s2.workspace_id = t.workspace_id and s2.target_account_id = t.id and private.signal_is_valid(s2.fired_at)
            order by s2.fired_at desc limit 5
          ) s), '[]'::jsonb),
        'contatos', coalesce((
          select jsonb_agg(jsonb_build_object('nome', c.name, 'cargo', c.role, 'tem_email', c.email is not null,
              'tem_telefone', c.phone is not null) order by c.name)
          from (
            select c2.name, c2.role, c2.email, c2.phone from public.contacts c2
            where c2.workspace_id = t.workspace_id and c2.archived_at is null
              and exists (
                select 1 from public.contact_account_links l
                where l.workspace_id = t.workspace_id and l.contact_id = c2.id and l.target_account_id = t.id
                  and l.ended_at is null)
            order by c2.name limit 10
          ) c), '[]'::jsonb)
      ) as conta
    from public.target_accounts t
    left join private.prospecting_stages ps on ps.workspace_id = t.workspace_id and ps.target_account_id = t.id
    where t.workspace_id = v_run.workspace_id and t.archived_at is null and t.deleted_at is null
      and (v_query = '' or strpos(lower(t.name), lower(v_query)) > 0 or strpos(lower(coalesce(t.domain, '')), lower(v_query)) > 0)
      and (not coalesce(p_only_hot, false) or exists (
        select 1 from private.signals s
        where s.workspace_id = t.workspace_id and s.target_account_id = t.id and private.signal_is_valid(s.fired_at)))
    order by quentes desc, t.last_interaction_at desc nulls last, t.name
    limit v_limit
  ) x;
  return v_result;
end;
$$;

-- 4. O Scopus pede uma busca de empresas pelo ICP. Ela nasce `aguardando_confirmacao`: nada roda nem é cobrado até uma
--    pessoa confirmar na Caixa de Descobertas (a confirmação passa por `begin_account_discovery`, que reserva os
--    Créditos e respeita os limites). Devolve o pedido, o custo estimado em Créditos, o saldo, quantas candidatas novas
--    já estão na Caixa e o estado do Actor. Só um pedido aguardando por Workspace: repetir devolve o mesmo
--    (`existente`). Só o Agente de Especialidade Scopus pede (42501).
create function public.agent_request_account_discovery(
  p_run_id uuid, p_agent_id uuid, p_criteria jsonb, p_max_results integer default 50, p_reason text default null
) returns table (
  discovery_run_id uuid, outcome text, estimated_credits numeric, available numeric, new_in_inbox integer, actor_state text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_run private.agent_runs%rowtype := private.running_agent_run(p_run_id);
  v_specialty text;
  v_existing private.discovery_runs%rowtype;
  v_id uuid;
  v_outcome text := 'pedido';
  v_price numeric;
  v_max integer := coalesce(p_max_results, 50);
begin
  select a.specialty into v_specialty from private.agents a where a.id = p_agent_id and a.workspace_id = v_run.workspace_id;
  if v_specialty is null then
    raise exception 'agent not found' using errcode = 'P0002';
  end if;
  if v_specialty <> 'scopus' then
    raise exception 'only the ICP specialist requests account discovery' using errcode = '42501';
  end if;
  if p_criteria is null or jsonb_typeof(p_criteria) <> 'object' or length(p_criteria::text) > 20000
    or v_max not between 1 and 100 then
    raise exception 'invalid discovery criteria' using errcode = '22023';
  end if;

  perform private.expire_stale_discovery_runs();
  perform pg_advisory_xact_lock(hashtext('agent_discovery:' || v_run.workspace_id::text));

  select * into v_existing from private.discovery_runs r
  where r.workspace_id = v_run.workspace_id and r.kind = 'contas' and r.state = 'aguardando_confirmacao'
  order by r.created_at desc limit 1;

  select c.credits * private.discovery_blocks(v_max) into v_price
  from private.credit_action_prices c where c.action = 'account_discovery';

  if v_existing.id is not null then
    v_id := v_existing.id;
    v_outcome := 'existente';
    v_price := v_existing.estimated_credits;
  else
    insert into private.discovery_runs (
      workspace_id, kind, requested_by, requested_by_agent_id, agent_reason, state, criteria, max_results,
      estimated_credits)
    values (
      v_run.workspace_id, 'contas', v_run.requested_by, p_agent_id, left(nullif(btrim(p_reason), ''), 500),
      'aguardando_confirmacao', p_criteria, v_max, coalesce(v_price, 0))
    returning id into v_id;
  end if;

  return query select
    v_id,
    v_outcome,
    coalesce(v_price, 0),
    (select t.booked - t.reserved from private.credit_totals(v_run.workspace_id) t),
    (select count(*)::integer from private.discovered_accounts d
      where d.workspace_id = v_run.workspace_id and d.state = 'nova'),
    case
      when exists (select 1 from private.discovery_actors a where a.purpose = 'buscar_contas' and a.state = 'available') then 'available'
      when exists (select 1 from private.discovery_actors a where a.purpose = 'buscar_contas' and a.state = 'testing') then 'testing'
      else 'none' end;
end;
$$;

-- 5. O pedido de busca de um Agente, para quem confirma (a Edge Function `account-discovery`, com a sessão da pessoa).
--    Só Participação ativa no Workspace do pedido; um pedido de outro Workspace não existe para ela.
create function public.get_discovery_proposal(p_run_id uuid)
returns table (workspace_id uuid, criteria jsonb, max_results integer, icp_version integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_run private.discovery_runs%rowtype;
begin
  select * into v_run from private.discovery_runs r where r.id = p_run_id and r.kind = 'contas';
  if v_run.id is null or not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = v_run.workspace_id and m.user_id = auth.uid() and m.active
  ) then
    raise exception 'discovery request not found' using errcode = 'P0002';
  end if;
  return query select v_run.workspace_id, v_run.criteria, v_run.max_results, v_run.icp_version;
end;
$$;

-- 6. O Agente propõe Enviar ao CRM. O banco confere tudo o que o envio vai conferir (a Conta ativa no Workspace, o CRM
--    ligado, quem pediu ativo, Vendedor responsável e com o Acesso conectado, nenhum envio em andamento ou feito) e cria
--    a Aprovação pela regra de sempre (`propose_agent_action`: Ler recusa, Propor fica pendente, Executar nasce
--    liberada). O conteúdo é montado aqui e guardado na Aprovação: `{tipo, integration_id, target_account_id, envio}`.
--    Uma Aprovação de envio ainda aberta para a mesma Conta é devolvida (`existente`) em vez de criar outra.
create function public.agent_propose_crm_handoff(
  p_run_id uuid, p_agent_id uuid, p_target_account_id uuid, p_integration_id text, p_justification text default ''
) returns table (approval_id uuid, outcome text, account_name text, integration_name text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_run private.agent_runs%rowtype := private.running_agent_run(p_run_id);
  v_account public.target_accounts%rowtype;
  v_crm text;
  v_state text;
  v_open private.approvals%rowtype;
  v_payload jsonb;
  v_contacts integer;
  v_result record;
begin
  if not exists (select 1 from private.agents a where a.id = p_agent_id and a.workspace_id = v_run.workspace_id) then
    raise exception 'agent not found' using errcode = 'P0002';
  end if;
  select * into v_account from public.target_accounts a
  where a.workspace_id = v_run.workspace_id and a.id = p_target_account_id
    and a.archived_at is null and a.deleted_at is null;
  if v_account.id is null then
    raise exception 'target account not found' using errcode = 'P0002';
  end if;
  select c.name into v_crm from private.integration_catalog c where c.id = p_integration_id and c.category = 'CRM';
  if v_crm is null then
    raise exception 'integration is not a CRM' using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = v_run.workspace_id and m.user_id = v_run.requested_by and m.active
  ) then
    raise exception 'active workspace membership required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.sales_responsibilities r
    where r.workspace_id = v_run.workspace_id and r.target_account_id = p_target_account_id::text
      and r.owner_user_id = v_run.requested_by
  ) then
    raise exception 'only the responsible seller can send this target account to the CRM' using errcode = '42501';
  end if;
  if exists (
    select 1 from private.crm_handoffs h
    where h.workspace_id = v_run.workspace_id and h.target_account_id = p_target_account_id
      and h.status in ('enviando', 'enviado')
  ) then
    raise exception 'target account already sent to the CRM' using errcode = '23505';
  end if;

  perform pg_advisory_xact_lock(hashtext('agent_crm_handoff:' || v_run.workspace_id::text || ':' || p_target_account_id::text));
  perform private.expire_approvals();
  select * into v_open from private.approvals a
  where a.workspace_id = v_run.workspace_id and a.target_account_id = p_target_account_id
    and a.payload ->> 'tipo' = 'envio_ao_crm' and a.state in ('pendente', 'aprovada', 'executando')
  order by a.created_at desc limit 1;
  if v_open.id is not null then
    return query select v_open.id, 'existente'::text, v_account.name, v_crm;
    return;
  end if;

  if not exists (
    select 1 from public.workspace_integrations w
    where w.workspace_id = v_run.workspace_id and w.integration_id = p_integration_id
  ) then
    raise exception 'integration not enabled in this workspace' using errcode = '55000';
  end if;
  select x.state into v_state from private.integration_accesses x
  where x.workspace_id = v_run.workspace_id and x.user_id = v_run.requested_by and x.integration_id = p_integration_id;
  if v_state is distinct from 'conectado' then
    raise exception 'integration access not connected' using errcode = '55000';
  end if;

  v_payload := jsonb_build_object(
    'tipo', 'envio_ao_crm',
    'integration_id', p_integration_id,
    'target_account_id', p_target_account_id,
    'envio', private.crm_handoff_payload(v_run.workspace_id, p_target_account_id)
  );
  v_contacts := jsonb_array_length(v_payload -> 'envio' -> 'contatos');

  select * into v_result from public.propose_agent_action(
    p_run_id, p_agent_id, p_integration_id,
    'Enviar a ' || v_account.name || ' ao ' || v_crm,
    v_payload,
    'Cria no ' || v_crm || ' a empresa, ' || v_contacts || case when v_contacts = 1 then ' Contato' else ' Contatos' end
      || ' e uma nota com os Sinais e a abordagem. Depois do envio, o ' || v_crm || ' é a fonte da verdade.',
    left(coalesce(p_justification, ''), 2000),
    p_target_account_id
  );
  return query select v_result.approval_id, v_result.outcome, v_account.name, v_crm;
end;
$$;

-- 7. A Aprovação de envio como o executor a lê. Com `p_admin_user_id` (a execução pedida pela tela logo depois de
--    aprovar), ele precisa ser Administrador ativo do Workspace da Aprovação (42501); sem ele, é o próprio motor, no
--    servidor, logo depois de propor. Uma Aprovação que não é de envio ao CRM não existe aqui (P0002).
create function public.crm_handoff_approval(p_approval_id uuid, p_admin_user_id uuid default null)
returns table (
  workspace_id uuid, agent_id uuid, integration_id text, requested_by uuid, target_account_id uuid, state text,
  payload jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v private.approvals%rowtype;
begin
  select * into v from private.approvals a where a.id = p_approval_id;
  if v.id is null or v.payload ->> 'tipo' is distinct from 'envio_ao_crm' then
    raise exception 'crm handoff approval not found' using errcode = 'P0002';
  end if;
  if p_admin_user_id is not null and not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = v.workspace_id and m.user_id = p_admin_user_id and m.active and m.role = 'admin'
  ) then
    raise exception 'only administrators can execute approvals' using errcode = '42501';
  end if;
  return query select v.workspace_id, v.agent_id, v.integration_id, v.requested_by, v.target_account_id, v.state, v.payload;
end;
$$;

-- 8. O envio de uma Aprovação já reservada (`claim_approved_action` devolveu 'go', estado executando). Confere de novo
--    o que `begin_crm_handoff` confere, para quem pediu ao Agente, e liga a tentativa à Aprovação (`approval_id`). O que
--    vai é o que a Aprovação guardou, nunca uma montagem nova: o que foi revisado é o que sai.
create function public.begin_approved_crm_handoff(p_approval_id uuid)
returns table (handoff_id uuid, access_kind text, user_id uuid, payload jsonb, previous_refs jsonb)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v private.approvals%rowtype;
  v_account_id uuid;
  v_integration text;
  v_kind text;
  v_state text;
  v_previous jsonb;
  v_id uuid;
begin
  select * into v from private.approvals a where a.id = p_approval_id for update;
  if v.id is null or v.payload ->> 'tipo' is distinct from 'envio_ao_crm' then
    raise exception 'crm handoff approval not found' using errcode = 'P0002';
  end if;
  if v.state <> 'executando' then
    raise exception 'the approval is not being executed' using errcode = '55000';
  end if;
  v_account_id := v.target_account_id;
  v_integration := v.integration_id;
  if v.requested_by is null or not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = v.workspace_id and m.user_id = v.requested_by and m.active
  ) then
    raise exception 'active workspace membership required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.target_accounts a
    where a.workspace_id = v.workspace_id and a.id = v_account_id and a.archived_at is null and a.deleted_at is null
  ) then
    raise exception 'target account not found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.sales_responsibilities r
    where r.workspace_id = v.workspace_id and r.target_account_id = v_account_id::text and r.owner_user_id = v.requested_by
  ) then
    raise exception 'only the responsible seller can send this target account to the CRM' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('crm_handoff:' || v.workspace_id::text || ':' || v_account_id::text));
  update private.crm_handoffs h
  set status = 'falhou',
      error = 'O envio anterior não terminou. Confira no CRM o que já foi criado antes de tentar de novo.',
      updated_at = now(),
      finished_at = now()
  where h.workspace_id = v.workspace_id and h.target_account_id = v_account_id
    and h.status = 'enviando' and h.updated_at < now() - interval '10 minutes';
  if exists (
    select 1 from private.crm_handoffs h
    where h.workspace_id = v.workspace_id and h.target_account_id = v_account_id and h.status in ('enviando', 'enviado')
  ) then
    raise exception 'target account already sent to the CRM' using errcode = '23505';
  end if;

  if not exists (
    select 1 from public.workspace_integrations wi where wi.workspace_id = v.workspace_id and wi.integration_id = v_integration
  ) then
    raise exception 'integration not enabled' using errcode = '55000';
  end if;
  select x.kind, x.state into v_kind, v_state from private.integration_accesses x
  where x.workspace_id = v.workspace_id and x.user_id = v.requested_by and x.integration_id = v_integration;
  if v_kind is null or v_state <> 'conectado' then
    raise exception 'integration access not connected' using errcode = '55000';
  end if;

  select h.crm_refs into v_previous from private.crm_handoffs h
  where h.workspace_id = v.workspace_id and h.target_account_id = v_account_id
    and h.integration_id = v_integration and h.status = 'falhou'
  order by h.attempt desc limit 1;

  insert into private.crm_handoffs (workspace_id, target_account_id, integration_id, requested_by, approval_id)
  values (v.workspace_id, v_account_id, v_integration, v.requested_by, v.id)
  returning id into v_id;

  return query select v_id, v_kind, v.requested_by, v.payload -> 'envio', coalesce(v_previous, '{}'::jsonb);
end;
$$;

-- 9. A escrita de um Agente com Propor só passa no Acesso (`chamarFerramenta`) quando há uma Aprovação deste Agente,
--    nesta Integração e neste Workspace, sendo executada agora.
create function public.approval_in_execution(
  p_approval_id uuid, p_workspace_id uuid, p_agent_id uuid, p_integration_id text
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.approvals a
    where a.id = p_approval_id and a.workspace_id = p_workspace_id and a.agent_id = p_agent_id
      and a.integration_id = p_integration_id and a.state = 'executando'
  );
$$;

revoke all on function public.agent_run_tools_context(uuid) from public, anon, authenticated;
revoke all on function public.agent_read_accounts_and_signals(uuid, text, boolean, integer) from public, anon, authenticated;
revoke all on function public.agent_request_account_discovery(uuid, uuid, jsonb, integer, text) from public, anon, authenticated;
revoke all on function public.get_discovery_proposal(uuid) from public, anon;
revoke all on function public.agent_propose_crm_handoff(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.crm_handoff_approval(uuid, uuid) from public, anon, authenticated;
revoke all on function public.begin_approved_crm_handoff(uuid) from public, anon, authenticated;
revoke all on function public.approval_in_execution(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.agent_run_tools_context(uuid) to service_role;
grant execute on function public.agent_read_accounts_and_signals(uuid, text, boolean, integer) to service_role;
grant execute on function public.agent_request_account_discovery(uuid, uuid, jsonb, integer, text) to service_role;
grant execute on function public.get_discovery_proposal(uuid) to authenticated;
grant execute on function public.agent_propose_crm_handoff(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.crm_handoff_approval(uuid, uuid) to service_role;
grant execute on function public.begin_approved_crm_handoff(uuid) to service_role;
grant execute on function public.approval_in_execution(uuid, uuid, uuid, text) to service_role;

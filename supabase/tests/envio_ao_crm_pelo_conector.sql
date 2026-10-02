begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(41);

-- Enviar ao CRM pelo conector (ADR-0023, migration 20261002112000): pela autorização (MCP), o envio vira um pedido aos
-- Agentes com a tentativa ligada à Execução, e só a chamada daquela Execução que declara o efeito `empresa_no_crm` a
-- fecha, no mesmo Workspace e para a mesma Conta. Ana (Admin) é a responsável pelas Contas do Norte e conectou o HubSpot
-- pela autorização e o Pipedrive pela chave de API; Bruno é Membro; Carla é Admin do Sul.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('5f000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5f000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5f000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@sul.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('ff000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('ff000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('ff000000-0000-0000-0000-000000000001', '5f000000-0000-0000-0000-000000000001', 'admin', true),
  ('ff000000-0000-0000-0000-000000000001', '5f000000-0000-0000-0000-000000000002', 'member', true),
  ('ff000000-0000-0000-0000-000000000002', '5f000000-0000-0000-0000-000000000003', 'admin', true);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '5f000000-0000-0000-0000-000000000001', true);
create temporary table contas on commit drop as
  select 'alfa' as k, id from public.save_target_account('ff000000-0000-0000-0000-000000000001', 'Alfa', 'https://alfa.test', null, null, 'Logística')
  union all select 'beta', id from public.save_target_account('ff000000-0000-0000-0000-000000000001', 'Beta', 'https://beta.test')
  union all select 'gama', id from public.save_target_account('ff000000-0000-0000-0000-000000000001', 'Gama', 'https://gama.test')
  union all select 'delta', id from public.save_target_account('ff000000-0000-0000-0000-000000000001', 'Delta', 'https://delta.test')
  union all select 'epsilon', id from public.save_target_account('ff000000-0000-0000-0000-000000000001', 'Épsilon', 'https://epsilon.test');
grant select on contas to authenticated, service_role;
select set_config('request.jwt.claim.sub', '5f000000-0000-0000-0000-000000000003', true);
insert into contas select 'omega', id from public.save_target_account('ff000000-0000-0000-0000-000000000002', 'Ômega', 'https://omega.test');
reset role;

insert into public.contacts (id, workspace_id, name, role, email, phone, created_by) values
  ('cf000000-0000-0000-0000-000000000001', 'ff000000-0000-0000-0000-000000000001', 'Maria Souza', 'Diretora de Operações', 'maria@alfa.test', '+5511999990001', '5f000000-0000-0000-0000-000000000001');
insert into public.contact_account_links (workspace_id, contact_id, target_account_id) values
  ('ff000000-0000-0000-0000-000000000001', 'cf000000-0000-0000-0000-000000000001', (select id from contas where k = 'alfa'));

insert into public.workspace_integrations (workspace_id, integration_id, enabled_by) values
  ('ff000000-0000-0000-0000-000000000001', 'hubspot', '5f000000-0000-0000-0000-000000000001'),
  ('ff000000-0000-0000-0000-000000000001', 'pipedrive', '5f000000-0000-0000-0000-000000000001'),
  ('ff000000-0000-0000-0000-000000000002', 'hubspot', '5f000000-0000-0000-0000-000000000003');
insert into private.integration_accesses (workspace_id, user_id, integration_id, kind, state, secret_name) values
  ('ff000000-0000-0000-0000-000000000001', '5f000000-0000-0000-0000-000000000001', 'hubspot', 'oauth_mcp', 'conectado', 'segredo-ana-hubspot'),
  ('ff000000-0000-0000-0000-000000000001', '5f000000-0000-0000-0000-000000000001', 'pipedrive', 'api_key', 'conectado', 'segredo-ana-pipedrive'),
  ('ff000000-0000-0000-0000-000000000002', '5f000000-0000-0000-0000-000000000003', 'hubspot', 'oauth_mcp', 'conectado', 'segredo-carla-hubspot');

create function pg_temp.agente(p_workspace text, p_especialidade text) returns uuid language sql as $$
  select id from private.agents where workspace_id = p_workspace::uuid and specialty = p_especialidade and kind = 'padrao'
$$;
create function pg_temp.conta(p text) returns uuid language sql as $$ select id from contas where k = p $$;
create function pg_temp.iniciar(p_conta text, p_usuario text, p_crm text, p_pedido uuid default gen_random_uuid())
returns table (handoff_id uuid, conversation_id uuid, run_id uuid, status text) language sql as $$
  select * from public.begin_crm_handoff_by_agents('ff000000-0000-0000-0000-000000000001', pg_temp.conta(p_conta),
    p_usuario::uuid, p_crm, p_pedido)
$$;
-- A chamada de ferramenta com o efeito, como `usar_conector` a propõe.
create function pg_temp.chamada(p_ferramenta text) returns jsonb language sql as $$
  select jsonb_build_object('tipo', 'ferramenta', 'integration_id', 'hubspot', 'ferramenta', p_ferramenta,
    'argumentos', jsonb_build_object('properties', jsonb_build_object('name', 'Alfa')), 'efeito', 'empresa_no_crm')
$$;
create function pg_temp.propor(p_run uuid, p_conta text) returns uuid language sql as $$
  select approval_id from public.propose_agent_action(p_run, pg_temp.agente('ff000000-0000-0000-0000-000000000001', 'rhetor'),
    'hubspot', 'Usar create_company no HubSpot', pg_temp.chamada('create_company'), 'Cria a empresa', '', pg_temp.conta(p_conta))
$$;
create function pg_temp.rodar(p_run uuid) returns void language sql as $$
  update private.agent_runs set status = 'running', started_at = clock_timestamp() where id = p_run
$$;
create function pg_temp.terminar(p_run uuid) returns void language sql as $$
  update private.agent_runs set status = 'succeeded', finished_at = clock_timestamp() where id = p_run
$$;
-- Ana aprova (ou recusa) no passo da Conversa, e o executor reserva e encerra.
create function pg_temp.decidir(p_aprovacao uuid, p_decisao text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claim.sub', '5f000000-0000-0000-0000-000000000001', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  v := public.decide_approval(p_aprovacao, p_decisao, 'conversa');
  return v;
end;
$$;
create function pg_temp.executar(p_aprovacao uuid, p_ok boolean) returns void language plpgsql as $$
begin
  if public.claim_approved_action(p_aprovacao, (select payload from private.approvals where id = p_aprovacao)) <> 'go' then
    raise exception 'não reservou';
  end if;
  perform public.finish_approved_action(p_aprovacao, p_ok, case when p_ok then null else 'O HubSpot recusou a empresa.' end);
end;
$$;
create temporary table t (k text primary key, id uuid) on commit drop;
grant all on t to authenticated, service_role;

update private.agent_permissions set permission = 'ler'
where workspace_id = 'ff000000-0000-0000-0000-000000000001' and integration_id = 'hubspot';

-- 1-2. Começar e fechar pelo efeito são só do servidor; a Conversa do envio se lê pelo app.
select ok(
  has_function_privilege('service_role', 'public.begin_crm_handoff_by_agents(uuid, uuid, uuid, text, uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.begin_crm_handoff_by_agents(uuid, uuid, uuid, text, uuid)', 'execute')
    and not has_function_privilege('anon', 'public.begin_crm_handoff_by_agents(uuid, uuid, uuid, text, uuid)', 'execute')
    and has_function_privilege('service_role', 'public.finish_crm_handoff_by_tool_approval(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.finish_crm_handoff_by_tool_approval(uuid)', 'execute')
    and has_function_privilege('service_role', 'public.finish_crm_handoff_by_tool_call(uuid, uuid, text, text, uuid, boolean, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.finish_crm_handoff_by_tool_call(uuid, uuid, text, text, uuid, boolean, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.begin_crm_handoff(uuid, uuid, uuid, text)', 'execute')
    and has_function_privilege('service_role', 'public.begin_approved_crm_handoff(uuid)', 'execute'),
  'começar pelos Agentes e fechar pelo efeito são só do servidor'
);
select ok(
  has_function_privilege('authenticated', 'public.list_crm_handoff_conversations(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.list_crm_handoff_conversations(uuid)', 'execute'),
  'a Conversa do envio se lê pelo app'
);

-- 3-6. O que `begin_crm_handoff` confere, e mais: o Acesso pela autorização e um Agente que escreve no CRM.
select throws_ok(
  $$select * from pg_temp.iniciar('alfa', '5f000000-0000-0000-0000-000000000002', 'hubspot')$$,
  '42501', 'only the responsible seller can send this target account to the CRM',
  'Bruno não é o responsável pela Alfa'
);
select throws_ok(
  $$select * from pg_temp.iniciar('alfa', '5f000000-0000-0000-0000-000000000001', 'pipedrive')$$,
  '55000', 'integration access is not by authorization',
  'pela chave de API, o envio é o da crm-handoff'
);
select throws_ok(
  $$select * from pg_temp.iniciar('alfa', '5f000000-0000-0000-0000-000000000001', 'hubspot')$$,
  '55000', 'no agent can write to this CRM',
  'sem um Agente com Propor ou Executar no HubSpot, não há quem escreva'
);
select throws_ok(
  format($$select * from public.begin_crm_handoff_by_agents('ff000000-0000-0000-0000-000000000001', %L,
    '5f000000-0000-0000-0000-000000000001', 'hubspot', gen_random_uuid())$$, pg_temp.conta('omega')),
  'P0002', 'target account not found',
  'uma Conta do Sul não existe no Norte'
);

-- 7-12. O pedido aos Agentes: a Conversa coordenada de Ana, a Execução na fila com o pacote e a tentativa ligada a ela.
update private.agent_permissions set permission = 'propor'
where agent_id = pg_temp.agente('ff000000-0000-0000-0000-000000000001', 'rhetor') and integration_id = 'hubspot';
insert into t values ('pedido-alfa', gen_random_uuid());
insert into t select 'handoff-alfa', handoff_id from pg_temp.iniciar('alfa', '5f000000-0000-0000-0000-000000000001', 'hubspot', (select id from t where k = 'pedido-alfa'));
insert into t select 'run-alfa', run_id from private.crm_handoffs where id = (select id from t where k = 'handoff-alfa');
select is(
  (select h.status || ' / ' || h.integration_id || ' / ' || (h.target_account_id = pg_temp.conta('alfa'))::text
   from private.crm_handoffs h where h.id = (select id from t where k = 'handoff-alfa')),
  'enviando / hubspot / true',
  'a tentativa nasce enviando, ligada à Execução'
);
select is(
  (select c.kind || ' / ' || c.title || ' / ' || (c.owner_id = '5f000000-0000-0000-0000-000000000001')::text
   from private.agent_runs r join private.agent_conversations c on c.id = r.conversation_id
   where r.id = (select id from t where k = 'run-alfa')),
  'coordenada / Enviar Alfa ao HubSpot / true',
  'numa Conversa coordenada nova, de Ana'
);
select ok(
  (select strpos(r.request_text, 'conta_id: ' || pg_temp.conta('alfa')::text) > 0
      and strpos(r.request_text, 'maria@alfa.test') > 0
      and strpos(r.request_text, 'empresa_no_crm') > 0
      and strpos(r.request_text, 'procure a empresa') > 0
      and r.status = 'queued'
   from private.agent_runs r where r.id = (select id from t where k = 'run-alfa')),
  'o pedido leva o pacote (a Conta, os Contatos e a nota) e o como fazer'
);
select is(
  (select r.mentions from private.agent_runs r where r.id = (select id from t where k = 'run-alfa')),
  array[pg_temp.agente('ff000000-0000-0000-0000-000000000001', 'rhetor')],
  'menciona o Agente que pode escrever no HubSpot'
);
select is(
  (select handoff_id from pg_temp.iniciar('alfa', '5f000000-0000-0000-0000-000000000001', 'hubspot', (select id from t where k = 'pedido-alfa'))),
  (select id from t where k = 'handoff-alfa'),
  'o mesmo pedido de novo devolve a mesma tentativa'
);
select throws_ok(
  format($$select * from public.begin_crm_handoff('ff000000-0000-0000-0000-000000000001', %L,
    '5f000000-0000-0000-0000-000000000001', 'hubspot')$$, pg_temp.conta('alfa')),
  '23505', 'target account already sent to the CRM',
  'enquanto os Agentes enviam, o envio pela chave de API não começa'
);

-- 13-14. Só quem pediu vê a Conversa do envio.
insert into t select 'conversa-alfa', conversation_id from private.agent_runs where id = (select id from t where k = 'run-alfa');
set local role authenticated;
select set_config('request.jwt.claim.sub', '5f000000-0000-0000-0000-000000000001', true);
select is(
  (select conversation_id from public.list_crm_handoff_conversations('ff000000-0000-0000-0000-000000000001')
   where target_account_id = pg_temp.conta('alfa')),
  (select id from t where k = 'conversa-alfa'),
  'Ana lê a Conversa do envio da Alfa'
);
select set_config('request.jwt.claim.sub', '5f000000-0000-0000-0000-000000000002', true);
select is((select count(*)::integer from public.list_crm_handoff_conversations('ff000000-0000-0000-0000-000000000001')), 0,
  'Bruno não lê a Conversa de Ana');
reset role;

-- 15-18. O Agente propõe a criação da empresa com o efeito. Enquanto a Aprovação está aberta, a tentativa espera, mesmo
-- depois de a Execução terminar e de passar o prazo de 10 minutos.
select pg_temp.rodar((select id from t where k = 'run-alfa'));
insert into t select 'ap-alfa', pg_temp.propor((select id from t where k = 'run-alfa'), 'alfa');
select is((select state from private.approvals where id = (select id from t where k = 'ap-alfa')), 'pendente',
  'a criação da empresa pede Aprovação (regra padrão)');
select throws_ok(
  format($$select public.finish_crm_handoff_by_tool_approval(%L)$$, (select id from t where k = 'ap-alfa')),
  '55000', 'the approval has not finished',
  'uma Aprovação pendente não fecha a tentativa'
);
select pg_temp.terminar((select id from t where k = 'run-alfa'));
update private.crm_handoffs set updated_at = now() - interval '1 hour' where id = (select id from t where k = 'handoff-alfa');
select throws_ok(
  format($$select * from public.begin_crm_handoff('ff000000-0000-0000-0000-000000000001', %L,
    '5f000000-0000-0000-0000-000000000001', 'hubspot')$$, pg_temp.conta('alfa')),
  '23505', 'target account already sent to the CRM',
  'a tentativa que espera a Aprovação não vence em 10 minutos'
);
select is((select status from private.crm_handoffs where id = (select id from t where k = 'handoff-alfa')), 'enviando',
  'e continua enviando depois de a Execução terminar');

-- 19-21. Recusas: uma Aprovação executada de outro Workspace, ou para outra Conta, não fecha a tentativa da Alfa.
with x as (
  insert into private.approvals (workspace_id, agent_id, integration_id, run_id, requested_by, action, payload, payload_hash,
  target_account_id, state)
  values ('ff000000-0000-0000-0000-000000000002', pg_temp.agente('ff000000-0000-0000-0000-000000000002', 'rhetor'), 'hubspot',
  (select id from t where k = 'run-alfa'), '5f000000-0000-0000-0000-000000000001', 'Usar create_company no HubSpot',
  pg_temp.chamada('create_company'), 'x', pg_temp.conta('alfa'), 'executada')
  returning id
)
insert into t select 'ap-sul', id from x;
select throws_ok(
  format($$select public.finish_crm_handoff_by_tool_approval(%L)$$, (select id from t where k = 'ap-sul')),
  'P0002', 'crm handoff attempt not found for this run',
  'uma Aprovação de outro Workspace não fecha a tentativa'
);
with x as (
  insert into private.approvals (workspace_id, agent_id, integration_id, run_id, requested_by, action, payload, payload_hash,
  target_account_id, state)
  values ('ff000000-0000-0000-0000-000000000001', pg_temp.agente('ff000000-0000-0000-0000-000000000001', 'rhetor'), 'hubspot',
  (select id from t where k = 'run-alfa'), '5f000000-0000-0000-0000-000000000001', 'Usar create_company no HubSpot',
  pg_temp.chamada('create_company'), 'x', pg_temp.conta('beta'), 'executada')
  returning id
)
insert into t select 'ap-beta-errada', id from x;
select throws_ok(
  format($$select public.finish_crm_handoff_by_tool_approval(%L)$$, (select id from t where k = 'ap-beta-errada')),
  'P0002', 'crm handoff attempt not found for this run',
  'uma Aprovação para outra Conta não fecha a tentativa da Alfa'
);
with x as (
  insert into private.approvals (workspace_id, agent_id, integration_id, run_id, requested_by, action, payload, payload_hash,
  target_account_id, state)
  values ('ff000000-0000-0000-0000-000000000001', pg_temp.agente('ff000000-0000-0000-0000-000000000001', 'rhetor'), 'hubspot',
  (select id from t where k = 'run-alfa'), '5f000000-0000-0000-0000-000000000001', 'Usar create_company no HubSpot',
  pg_temp.chamada('create_company') - 'efeito', 'x', pg_temp.conta('alfa'), 'executada')
  returning id
)
insert into t select 'ap-sem-efeito', id from x;
select throws_ok(
  format($$select public.finish_crm_handoff_by_tool_approval(%L)$$, (select id from t where k = 'ap-sem-efeito')),
  'P0002', 'tool approval with the crm effect not found',
  'uma chamada sem o efeito declarado não fecha a tentativa'
);

-- 22-26. Ana aprova no passo da Conversa; executada a chamada, a tentativa fecha como enviada e o cartão vai a No CRM.
select is(pg_temp.decidir((select id from t where k = 'ap-alfa'), 'aprovar'), 'aprovada', 'Ana aprova na Conversa');
reset role;
select pg_temp.executar((select id from t where k = 'ap-alfa'), true);
select is(public.finish_crm_handoff_by_tool_approval((select id from t where k = 'ap-alfa')), 'enviado',
  'a chamada executada com o efeito fecha a tentativa como enviada');
select is(
  (select stage from private.prospecting_stages where workspace_id = 'ff000000-0000-0000-0000-000000000001' and target_account_id = pg_temp.conta('alfa')),
  'no_crm',
  'o cartão da Alfa vai para No CRM'
);
select is(
  (select crm_refs -> 'conector' ->> 'ferramenta' from private.crm_handoffs where id = (select id from t where k = 'handoff-alfa')),
  'create_company',
  'a tentativa guarda qual ferramenta levou a empresa'
);
select throws_ok(
  format($$select public.finish_crm_handoff_by_tool_approval(%L)$$, (select id from t where k = 'ap-alfa')),
  'P0002', 'crm handoff attempt not found for this run',
  'uma tentativa já fechada não fecha de novo'
);

-- 27-29. A chamada que falhou: a tentativa fica como falha, com o motivo, e o cartão não se move.
update private.agent_permissions set permission = 'executar'
where agent_id = pg_temp.agente('ff000000-0000-0000-0000-000000000001', 'rhetor') and integration_id = 'hubspot';
insert into t select 'run-beta', run_id from pg_temp.iniciar('beta', '5f000000-0000-0000-0000-000000000001', 'hubspot');
select pg_temp.rodar((select id from t where k = 'run-beta'));
insert into t select 'ap-beta', pg_temp.propor((select id from t where k = 'run-beta'), 'beta');
select pg_temp.decidir((select id from t where k = 'ap-beta'), 'aprovar');
reset role;
select pg_temp.executar((select id from t where k = 'ap-beta'), false);
select is(public.finish_crm_handoff_by_tool_approval((select id from t where k = 'ap-beta')), 'falhou',
  'a chamada que falhou fecha a tentativa como falha');
select is(
  (select error from private.crm_handoffs where run_id = (select id from t where k = 'run-beta')),
  'O HubSpot recusou a empresa.',
  'com o motivo da chamada'
);
select ok(
  not exists (select 1 from private.prospecting_stages where workspace_id = 'ff000000-0000-0000-0000-000000000001'
    and target_account_id = pg_temp.conta('beta') and stage = 'no_crm'),
  'e o cartão da Beta não vai para No CRM'
);

-- 30-36. A chamada liberada sem Aprovação (Executar e "sempre"), durante a Execução: o banco confere de novo o que a liberou.
insert into t select 'run-gama', run_id from pg_temp.iniciar('gama', '5f000000-0000-0000-0000-000000000001', 'hubspot');
select pg_temp.rodar((select id from t where k = 'run-gama'));
create function pg_temp.direta(p_run uuid, p_conta text, p_ok boolean default true) returns text language sql as $$
  select public.finish_crm_handoff_by_tool_call(p_run, pg_temp.agente('ff000000-0000-0000-0000-000000000001', 'rhetor'),
    'hubspot', 'create_company', pg_temp.conta(p_conta), p_ok, null)
$$;
select throws_ok(
  format($$select pg_temp.direta(%L, 'gama')$$, (select id from t where k = 'run-gama')),
  '42501', 'the tool is not always allowed in this workspace',
  'sem a regra "sempre" decidida, a chamada direta não fecha a tentativa'
);
insert into private.integration_tool_rules (workspace_id, integration_id, tool_name, rule) values
  ('ff000000-0000-0000-0000-000000000001', 'hubspot', 'create_company', 'sempre');
update private.agent_permissions set permission = 'propor'
where agent_id = pg_temp.agente('ff000000-0000-0000-0000-000000000001', 'rhetor') and integration_id = 'hubspot';
select throws_ok(
  format($$select pg_temp.direta(%L, 'gama')$$, (select id from t where k = 'run-gama')),
  '42501', 'the agent may not execute in this integration',
  'com Propor, não há chamada direta'
);
update private.agent_permissions set permission = 'executar'
where agent_id = pg_temp.agente('ff000000-0000-0000-0000-000000000001', 'rhetor') and integration_id = 'hubspot';
select throws_ok(
  format($$select pg_temp.direta(%L, 'delta')$$, (select id from t where k = 'run-gama')),
  'P0002', 'crm handoff attempt not found for this run',
  'para outra Conta, não fecha'
);
insert into private.agent_conversations (id, workspace_id, owner_id, kind) values
  ('cf100000-0000-0000-0000-000000000001', 'ff000000-0000-0000-0000-000000000002', '5f000000-0000-0000-0000-000000000003', 'coordenada');
insert into private.agent_runs (id, workspace_id, conversation_id, requested_by, client_request_id, request_text, status, started_at) values
  ('af000000-0000-0000-0000-000000000009', 'ff000000-0000-0000-0000-000000000002', 'cf100000-0000-0000-0000-000000000001',
   '5f000000-0000-0000-0000-000000000003', gen_random_uuid(), 'Envie a Gama', 'running', now());
select throws_ok(
  $$select pg_temp.direta('af000000-0000-0000-0000-000000000009', 'gama')$$,
  '42501', 'the agent may not execute in this integration',
  'pela Execução de outro Workspace, o Agente do Norte não fecha nada'
);
select is(pg_temp.direta((select id from t where k = 'run-gama'), 'gama'), 'enviado',
  'a chamada direta liberada fecha a tentativa da mesma Execução');
select is(
  (select stage from private.prospecting_stages where workspace_id = 'ff000000-0000-0000-0000-000000000001' and target_account_id = pg_temp.conta('gama')),
  'no_crm',
  'e o cartão da Gama vai para No CRM'
);
select pg_temp.terminar((select id from t where k = 'run-gama'));
select throws_ok(
  format($$select pg_temp.direta(%L, 'gama')$$, (select id from t where k = 'run-gama')),
  '55000', 'run is not running',
  'depois de a Execução terminar, nada se fecha pela chamada direta'
);

-- 37-38. A Aprovação com o efeito recusada, depois de a Execução terminar: a tentativa vira falha e a Conta pode tentar de novo.
insert into t select 'run-delta', run_id from pg_temp.iniciar('delta', '5f000000-0000-0000-0000-000000000001', 'hubspot');
select pg_temp.rodar((select id from t where k = 'run-delta'));
delete from private.integration_tool_rules where workspace_id = 'ff000000-0000-0000-0000-000000000001';
insert into t select 'ap-delta', pg_temp.propor((select id from t where k = 'run-delta'), 'delta');
select pg_temp.terminar((select id from t where k = 'run-delta'));
select pg_temp.decidir((select id from t where k = 'ap-delta'), 'recusar');
reset role;
select is(
  (select status || ' / ' || error from private.crm_handoffs where run_id = (select id from t where k = 'run-delta')),
  'falhou / A Aprovação para levar a empresa ao CRM foi recusada. Nada foi marcado como enviado.',
  'a recusa encerra a tentativa como falha'
);
select lives_ok(
  $$select * from pg_temp.iniciar('delta', '5f000000-0000-0000-0000-000000000001', 'hubspot')$$,
  'e a Delta pode ser pedida de novo'
);

-- 39-41. A Execução que termina sem nenhuma chamada com o efeito: a tentativa vira falha.
insert into t select 'run-epsilon', run_id from pg_temp.iniciar('epsilon', '5f000000-0000-0000-0000-000000000001', 'hubspot');
select pg_temp.rodar((select id from t where k = 'run-epsilon'));
select is((select status from private.crm_handoffs where run_id = (select id from t where k = 'run-epsilon')), 'enviando',
  'enquanto a Execução roda, a tentativa espera');
select pg_temp.terminar((select id from t where k = 'run-epsilon'));
select is(
  (select status from private.crm_handoffs where run_id = (select id from t where k = 'run-epsilon')),
  'falhou',
  'a Execução que termina sem levar a empresa encerra a tentativa como falha'
);
select ok(
  (select error like 'Os Agentes terminaram sem levar a empresa ao CRM%' from private.crm_handoffs
   where run_id = (select id from t where k = 'run-epsilon')),
  'com o motivo para a tela'
);

select * from finish();
rollback;

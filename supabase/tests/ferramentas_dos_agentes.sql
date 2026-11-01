begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(37);
create function pg_temp.semear_agentes_padrao(p_workspace_id uuid) returns void
language plpgsql
as $$
begin
  with novos as (
    insert into private.agents (workspace_id, specialty, kind)
    select p_workspace_id, c.specialty, 'padrao' from private.specialty_catalog c
    on conflict do nothing returning id, workspace_id, specialty
  ), configuracao as (
    insert into private.agent_settings (agent_id, workspace_id, channels)
    select n.id, n.workspace_id, array['whatsapp']::text[] from novos n
  )
  insert into private.agent_permissions (agent_id, workspace_id, integration_id, permission)
  select n.id, n.workspace_id, d.integration_id, d.permission from novos n
  join private.specialty_default_permissions d on d.specialty = n.specialty;
end;
$$;


-- As ferramentas dos Agentes (Etapa 5b): a leitura do Workspace, o pedido de busca pelo ICP e a proposta de Enviar ao CRM,
-- sempre a partir de uma Execução em andamento. Ana (Admin) é a responsável pela Alfa e pela Beta no Norte e pediu a
-- Execução; Bruno (Membro) pediu outra; Carla é do Sul, com a Execução dela e a Ômega.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('5d000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5d000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5d000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@sul.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('fd000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('fd000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
select pg_temp.semear_agentes_padrao(w.id) from public.workspaces w;
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('fd000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000001', 'admin', true),
  ('fd000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000002', 'member', true),
  ('fd000000-0000-0000-0000-000000000002', '5d000000-0000-0000-0000-000000000003', 'admin', true);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '5d000000-0000-0000-0000-000000000001', true);
create temporary table contas on commit drop as
  select 'alfa' as k, id from public.save_target_account('fd000000-0000-0000-0000-000000000001', 'Alfa', 'https://alfa.test', null, null, 'Logística')
  union all
  select 'beta', id from public.save_target_account('fd000000-0000-0000-0000-000000000001', 'Beta', 'https://beta.test');
grant select on contas to authenticated, service_role;
select set_config('request.jwt.claim.sub', '5d000000-0000-0000-0000-000000000003', true);
insert into contas select 'omega', id from public.save_target_account('fd000000-0000-0000-0000-000000000002', 'Ômega', 'https://omega.test');
reset role;

insert into public.contacts (id, workspace_id, name, role, email, phone, created_by) values
  ('cd000000-0000-0000-0000-000000000001', 'fd000000-0000-0000-0000-000000000001', 'Maria Souza', 'Diretora de Operações', 'maria@alfa.test', '+5511999990001', '5d000000-0000-0000-0000-000000000001');
insert into public.contact_account_links (workspace_id, contact_id, target_account_id) values
  ('fd000000-0000-0000-0000-000000000001', 'cd000000-0000-0000-0000-000000000001', (select id from contas where k = 'alfa'));
insert into private.signals (workspace_id, target_account_id, signal_type, event_key, phrase, fired_at) values
  ('fd000000-0000-0000-0000-000000000001', (select id from contas where k = 'alfa'), 'vaga_linkedin', 'vaga-1', 'Abriu vaga de Gerente de Logística', now() - interval '2 days'),
  ('fd000000-0000-0000-0000-000000000001', (select id from contas where k = 'alfa'), 'vaga_linkedin', 'vaga-0', 'Vaga antiga de Analista', now() - interval '40 days'),
  ('fd000000-0000-0000-0000-000000000002', (select id from contas where k = 'omega'), 'vaga_linkedin', 'vaga-9', 'Sinal do Sul', now() - interval '1 day');

-- O Norte ligou o HubSpot; Ana conectou o dela pela chave de API.
insert into public.workspace_integrations (workspace_id, integration_id, enabled_by) values
  ('fd000000-0000-0000-0000-000000000001', 'hubspot', '5d000000-0000-0000-0000-000000000001');
insert into private.integration_accesses (workspace_id, user_id, integration_id, kind, state, secret_name) values
  ('fd000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000001', 'hubspot', 'api_key', 'conectado', 'segredo-ana-hubspot');

insert into private.agent_conversations (id, workspace_id, owner_id, kind) values
  ('cd100000-0000-0000-0000-000000000001', 'fd000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000001', 'coordenada'),
  ('cd100000-0000-0000-0000-000000000002', 'fd000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000002', 'coordenada'),
  ('cd100000-0000-0000-0000-000000000003', 'fd000000-0000-0000-0000-000000000002', '5d000000-0000-0000-0000-000000000003', 'coordenada'),
  ('cd100000-0000-0000-0000-000000000004', 'fd000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000001', 'coordenada');
insert into private.agent_runs (id, workspace_id, conversation_id, requested_by, client_request_id, request_text, status, started_at) values
  ('ad000000-0000-0000-0000-000000000001', 'fd000000-0000-0000-0000-000000000001', 'cd100000-0000-0000-0000-000000000001',
   '5d000000-0000-0000-0000-000000000001', gen_random_uuid(), 'Ache contas quentes e leve ao CRM', 'running', now()),
  ('ad000000-0000-0000-0000-000000000002', 'fd000000-0000-0000-0000-000000000001', 'cd100000-0000-0000-0000-000000000002',
   '5d000000-0000-0000-0000-000000000002', gen_random_uuid(), 'Envie a Alfa', 'running', now()),
  ('ad000000-0000-0000-0000-000000000003', 'fd000000-0000-0000-0000-000000000002', 'cd100000-0000-0000-0000-000000000003',
   '5d000000-0000-0000-0000-000000000003', gen_random_uuid(), 'O que temos?', 'running', now());
insert into private.agent_runs (id, workspace_id, conversation_id, requested_by, client_request_id, request_text) values
  ('ad000000-0000-0000-0000-000000000009', 'fd000000-0000-0000-0000-000000000001', 'cd100000-0000-0000-0000-000000000004',
   '5d000000-0000-0000-0000-000000000001', gen_random_uuid(), 'Na fila');

create temporary table agentes on commit drop as
  select workspace_id, specialty, id from private.agents where kind = 'padrao';
grant select on agentes to authenticated, service_role;
create function pg_temp.agente(p_workspace text, p_especialidade text) returns uuid language sql as $$
  select id from agentes where workspace_id = p_workspace::uuid and specialty = p_especialidade
$$;
create temporary table ap (k text primary key, id uuid) on commit drop;
grant all on ap to authenticated, service_role;

-- 1-3. Só o servidor usa as ferramentas; o pedido de busca de um Agente é lido pelo app de quem confirma.
select ok(
  has_function_privilege('service_role', 'public.agent_read_accounts_and_signals(uuid, text, boolean, integer)', 'execute')
    and not has_function_privilege('authenticated', 'public.agent_read_accounts_and_signals(uuid, text, boolean, integer)', 'execute')
    and not has_function_privilege('anon', 'public.agent_read_accounts_and_signals(uuid, text, boolean, integer)', 'execute')
    and has_function_privilege('service_role', 'public.agent_run_tools_context(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.agent_run_tools_context(uuid)', 'execute'),
  'a leitura do Workspace para os Agentes é só do servidor'
);
select ok(
  not has_function_privilege('authenticated', 'public.agent_request_account_discovery(uuid, uuid, jsonb, integer, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.agent_propose_crm_handoff(uuid, uuid, uuid, text, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.crm_handoff_approval(uuid, uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.begin_approved_crm_handoff(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.approval_in_execution(uuid, uuid, uuid, text)', 'execute')
    and has_function_privilege('service_role', 'public.agent_propose_crm_handoff(uuid, uuid, uuid, text, text)', 'execute')
    and has_function_privilege('service_role', 'public.begin_approved_crm_handoff(uuid)', 'execute'),
  'pedir busca, propor e executar o envio são só do servidor'
);
select ok(
  has_function_privilege('authenticated', 'public.get_discovery_proposal(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.get_discovery_proposal(uuid)', 'execute'),
  'o participante lê o pedido de busca de um Agente para confirmar'
);

reset role;

-- 4-9. A leitura enxuta: só o Workspace da Execução, as quentes primeiro, Sinais ativos, Contatos sem o dado de contato.
select is(
  (select jsonb_agg(c ->> 'nome') from jsonb_array_elements(public.agent_read_accounts_and_signals('ad000000-0000-0000-0000-000000000001')) c),
  '["Alfa", "Beta"]'::jsonb,
  'a Execução do Norte lê a Alfa (com Sinal ativo) antes da Beta, e nada do Sul'
);
select is(
  (select jsonb_agg(c ->> 'nome') from jsonb_array_elements(public.agent_read_accounts_and_signals('ad000000-0000-0000-0000-000000000003')) c),
  '["Ômega"]'::jsonb,
  'a Execução do Sul só lê a Ômega'
);
select is(
  (select c -> 'sinais' -> 0 ->> 'frase' || ' / ' || jsonb_array_length(c -> 'sinais')
   from jsonb_array_elements(public.agent_read_accounts_and_signals('ad000000-0000-0000-0000-000000000001', 'alfa')) c),
  'Abriu vaga de Gerente de Logística / 1',
  'só os Sinais ainda válidos entram'
);
select is(
  (select c -> 'contatos' from jsonb_array_elements(public.agent_read_accounts_and_signals('ad000000-0000-0000-0000-000000000001', 'alfa')) c),
  '[{"nome": "Maria Souza", "cargo": "Diretora de Operações", "tem_email": true, "tem_telefone": true}]'::jsonb,
  'os Contatos vêm com nome e cargo, sem o e-mail nem o telefone'
);
select is(
  jsonb_array_length(public.agent_read_accounts_and_signals('ad000000-0000-0000-0000-000000000001', '', true)),
  1,
  'só as quentes, quando pedido'
);
select throws_ok(
  $$select public.agent_read_accounts_and_signals('ad000000-0000-0000-0000-000000000009')$$,
  '55000', 'run is not running',
  'uma Execução que não está rodando não lê nada'
);

-- 10. O contexto: as Permissões só das Integrações ligadas no Workspace.
select is(
  (select (select jsonb_agg(distinct p ->> 'integration_id') from jsonb_array_elements(permissions) p)
   from public.agent_run_tools_context('ad000000-0000-0000-0000-000000000001')),
  '["hubspot"]'::jsonb,
  'o contexto traz só as Permissões nas Integrações ligadas (o HubSpot)'
);

-- 11-17. A busca pelo ICP: só o Scopus pede, ela espera a confirmação, sem reservar Créditos, e é lida por quem participa.
select throws_ok(
  $$select * from public.agent_request_account_discovery('ad000000-0000-0000-0000-000000000001',
    pg_temp.agente('fd000000-0000-0000-0000-000000000001', 'rhetor'), '{"setores": ["Logística"]}', 50, 'teste')$$,
  '42501', 'only the ICP specialist requests account discovery',
  'o Rhetor não pede busca de contas'
);
insert into ap select 'busca', discovery_run_id from public.agent_request_account_discovery('ad000000-0000-0000-0000-000000000001',
  pg_temp.agente('fd000000-0000-0000-0000-000000000001', 'scopus'), '{"setores": ["Logística"]}', 50, 'Empresas de logística com vaga aberta');
select is(
  (select state || '/' || coalesce(reservation_id::text, 'sem reserva') || '/' || estimated_credits::text
   from private.discovery_runs where id = (select id from ap where k = 'busca')),
  'aguardando_confirmacao/sem reserva/5.00',
  'o pedido do Scopus aguarda a confirmação, com o custo estimado e nada reservado'
);
select is(
  (select r.requested_by_agent_id from private.discovery_runs r where r.id = (select id from ap where k = 'busca')),
  pg_temp.agente('fd000000-0000-0000-0000-000000000001', 'scopus'),
  'o pedido guarda o Agente que pediu'
);
select is(
  (select discovery_run_id::text || '/' || outcome from public.agent_request_account_discovery('ad000000-0000-0000-0000-000000000001',
    pg_temp.agente('fd000000-0000-0000-0000-000000000001', 'scopus'), '{"setores": ["Varejo"]}', 50, null)),
  (select id::text from ap where k = 'busca') || '/existente',
  'pedir de novo devolve o pedido que ainda espera'
);
select throws_ok(
  $$select * from public.agent_request_account_discovery('ad000000-0000-0000-0000-000000000001',
    pg_temp.agente('fd000000-0000-0000-0000-000000000002', 'scopus'), '{}', 50, null)$$,
  'P0002', 'agent not found',
  'o Agente de outro Workspace não pede pelo Norte'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '5d000000-0000-0000-0000-000000000002', true);
select is(
  (select max_results from public.get_discovery_proposal((select id from ap where k = 'busca'))),
  50,
  'Bruno, do Norte, lê o pedido para confirmar'
);
select set_config('request.jwt.claim.sub', '5d000000-0000-0000-0000-000000000003', true);
select throws_ok(
  format($$select * from public.get_discovery_proposal(%L)$$, (select id from ap where k = 'busca')),
  'P0002', 'discovery request not found',
  'Carla, do Sul, não enxerga o pedido do Norte'
);
reset role;
reset role;

-- 18-23. A proposta de Enviar ao CRM: o Scopus tem Propor no HubSpot, então nasce pendente, com o conteúdo montado pelo
-- banco, sem enviar nada.
insert into ap select 'envio', approval_id from public.agent_propose_crm_handoff('ad000000-0000-0000-0000-000000000001',
  pg_temp.agente('fd000000-0000-0000-0000-000000000001', 'scopus'), (select id from contas where k = 'alfa'), 'hubspot',
  'A Alfa abriu vaga de Gerente de Logística');
select is(
  (select state || '/' || (payload ->> 'tipo') || '/' || (payload -> 'envio' -> 'empresa' ->> 'nome') || '/'
     || jsonb_array_length(payload -> 'envio' -> 'contatos') || '/' || action
   from private.approvals where id = (select id from ap where k = 'envio')),
  'pendente/envio_ao_crm/Alfa/1/Enviar a Alfa ao HubSpot',
  'com Propor, a Aprovação nasce pendente, com a empresa e os Contatos que vão'
);
select is(
  (select target_account_id from private.approvals where id = (select id from ap where k = 'envio')),
  (select id from contas where k = 'alfa'),
  'a Aprovação aponta a Conta-alvo'
);
select is(
  (select count(*)::integer from private.crm_handoffs where workspace_id = 'fd000000-0000-0000-0000-000000000001'),
  0,
  'propor não começa envio nenhum'
);
select is(
  (select approval_id::text || '/' || outcome from public.agent_propose_crm_handoff('ad000000-0000-0000-0000-000000000001',
    pg_temp.agente('fd000000-0000-0000-0000-000000000001', 'rhetor'), (select id from contas where k = 'alfa'), 'hubspot', '')),
  (select id::text from ap where k = 'envio') || '/existente',
  'a mesma Conta com uma Aprovação de envio aberta devolve a mesma, sem duplicar'
);
select throws_ok(
  format($$select * from public.begin_approved_crm_handoff(%L)$$, (select id from ap where k = 'envio')),
  '55000', 'the approval is not being executed',
  'sem aprovar e reservar, o envio não começa'
);
select is(
  public.claim_approved_action((select id from ap where k = 'envio'), (select payload from private.approvals where id = (select id from ap where k = 'envio'))),
  'not_approved',
  'a pendente não se reserva'
);

-- 24-26. As recusas da proposta: quem pediu não é o responsável; a Conta é de outro Workspace; a Permissão é Ler.
select throws_ok(
  format($$select * from public.agent_propose_crm_handoff('ad000000-0000-0000-0000-000000000002', %L, %L, 'hubspot', '')$$,
    pg_temp.agente('fd000000-0000-0000-0000-000000000001', 'scopus'), (select id from contas where k = 'beta')),
  '42501', 'only the responsible seller can send this target account to the CRM',
  'a Execução do Bruno não propõe enviar a Beta, que é da Ana'
);
select throws_ok(
  format($$select * from public.agent_propose_crm_handoff('ad000000-0000-0000-0000-000000000001', %L, %L, 'hubspot', '')$$,
    pg_temp.agente('fd000000-0000-0000-0000-000000000001', 'scopus'), (select id from contas where k = 'omega')),
  'P0002', 'target account not found',
  'uma Conta do Sul não existe para a Execução do Norte'
);
update private.agent_permissions set permission = 'ler'
where agent_id = pg_temp.agente('fd000000-0000-0000-0000-000000000001', 'rhetor') and integration_id = 'hubspot';
select throws_ok(
  format($$select * from public.agent_propose_crm_handoff('ad000000-0000-0000-0000-000000000001', %L, %L, 'hubspot', '')$$,
    pg_temp.agente('fd000000-0000-0000-0000-000000000001', 'rhetor'), (select id from contas where k = 'beta')),
  '42501', 'the agent may only read this integration',
  'com a Permissão Ler, o Agente não propõe'
);

-- 27-29. A execução pela tela: só um Administrador; um conteúdo diferente do aprovado não se reserva.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '5d000000-0000-0000-0000-000000000001', true);
select is(public.decide_approval((select id from ap where k = 'envio'), 'aprovar', 'fila'), 'aprovada', 'Ana aprova o envio');
reset role;
reset role;
select throws_ok(
  format($$select * from public.crm_handoff_approval(%L, '5d000000-0000-0000-0000-000000000002')$$, (select id from ap where k = 'envio')),
  '42501', 'only administrators can execute approvals',
  'Bruno, Membro, não pede a execução'
);
select is(
  public.claim_approved_action((select id from ap where k = 'envio'),
    jsonb_set((select payload from private.approvals where id = (select id from ap where k = 'envio')), '{envio,empresa,nome}', '"Outra"')),
  'payload_changed',
  'um conteúdo alterado não se reserva'
);

-- 30-34. A execução: reservada com o conteúdo aprovado, o envio nasce ligado à Aprovação e leva o que foi aprovado.
select is(
  public.claim_approved_action((select id from ap where k = 'envio'), (select payload from public.crm_handoff_approval((select id from ap where k = 'envio'), '5d000000-0000-0000-0000-000000000001'))),
  'go',
  'o conteúdo aprovado se reserva'
);
select ok(
  public.approval_in_execution((select id from ap where k = 'envio'), 'fd000000-0000-0000-0000-000000000001',
    pg_temp.agente('fd000000-0000-0000-0000-000000000001', 'scopus'), 'hubspot')
    and not public.approval_in_execution((select id from ap where k = 'envio'), 'fd000000-0000-0000-0000-000000000001',
    pg_temp.agente('fd000000-0000-0000-0000-000000000001', 'rhetor'), 'hubspot'),
  'a Aprovação em execução vale só para o Agente dela'
);
insert into ap select 'handoff', handoff_id from public.begin_approved_crm_handoff((select id from ap where k = 'envio'));
select is(
  (select approval_id from private.crm_handoffs where id = (select id from ap where k = 'handoff')),
  (select id from ap where k = 'envio'),
  'o envio fica ligado à Aprovação'
);
select is(
  (select h.requested_by from private.crm_handoffs h where h.id = (select id from ap where k = 'handoff')),
  '5d000000-0000-0000-0000-000000000001'::uuid,
  'pelo Acesso de quem pediu ao Agente'
);
select is(public.finish_crm_handoff((select id from ap where k = 'handoff'), true, '{"empresa": "1"}', null), 'enviado', 'o envio conclui');
select lives_ok(
  format($$select public.finish_approved_action(%L, true, null)$$, (select id from ap where k = 'envio')),
  'e a Aprovação fecha como executada'
);

-- 35-36. Com Executar, a Aprovação nasce liberada pela Permissão; a Conta já enviada não se propõe de novo.
update private.agent_permissions set permission = 'executar'
where agent_id = pg_temp.agente('fd000000-0000-0000-0000-000000000001', 'ethos') and integration_id = 'hubspot';
select is(
  (select outcome from public.agent_propose_crm_handoff('ad000000-0000-0000-0000-000000000001',
    pg_temp.agente('fd000000-0000-0000-0000-000000000001', 'ethos'), (select id from contas where k = 'beta'), 'hubspot', '')),
  'liberada',
  'com Executar, a Aprovação nasce liberada'
);
select throws_ok(
  format($$select * from public.agent_propose_crm_handoff('ad000000-0000-0000-0000-000000000001', %L, %L, 'hubspot', '')$$,
    pg_temp.agente('fd000000-0000-0000-0000-000000000001', 'ethos'), (select id from contas where k = 'alfa')),
  '23505', 'target account already sent to the CRM',
  'a Alfa, já no CRM, não se propõe de novo'
);

select * from finish();
rollback;

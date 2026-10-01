begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(34);

-- Enviar ao CRM (kanban-de-prospeccao 05, ADR-0020): o Vendedor responsável leva a Conta-alvo, os Contatos e uma nota
-- ao CRM conectado, pelo PRÓPRIO Acesso. Ana (Admin) é a responsável pela Alfa no Norte; Bruno (Membro) não é; Eva saiu
-- do Norte; Carla é do Sul.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('5c000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5c000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5c000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@sul.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5c000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'eva@norte.test', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('fc000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('fc000000-0000-0000-0000-000000000002', 'empresa', 'Sul');

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('fc000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', 'admin', true),
  ('fc000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000002', 'member', true),
  ('fc000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000005', 'member', true),
  ('fc000000-0000-0000-0000-000000000002', '5c000000-0000-0000-0000-000000000003', 'admin', true);

-- Ana cadastra a Alfa e a Beta (é a responsável pelas duas); Eva cadastra a Gama e depois sai do Workspace.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '5c000000-0000-0000-0000-000000000001', true);
create temporary table contas on commit drop as
  select 'alfa' as k, id from public.save_target_account('fc000000-0000-0000-0000-000000000001', 'Alfa', 'https://alfa.test', '12.345.678/0001-90', null, 'Logística')
  union all
  select 'beta', id from public.save_target_account('fc000000-0000-0000-0000-000000000001', 'Beta', 'https://beta.test');
grant select on contas to authenticated, service_role;
select set_config('request.jwt.claim.sub', '5c000000-0000-0000-0000-000000000005', true);
insert into contas select 'gama', id from public.save_target_account('fc000000-0000-0000-0000-000000000001', 'Gama', 'https://gama.test');
reset role;
update public.workspace_memberships set active = false
where workspace_id = 'fc000000-0000-0000-0000-000000000001' and user_id = '5c000000-0000-0000-0000-000000000005';

-- Os Contatos da Alfa: Maria (ativa), João (Vínculo encerrado) e Rita (arquivada).
insert into public.contacts (id, workspace_id, name, role, email, phone, linkedin, created_by, archived_at) values
  ('c0000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000001', 'Maria Souza', 'Diretora de Operações', 'maria@alfa.test', '+5511999990001', 'https://www.linkedin.com/in/maria', '5c000000-0000-0000-0000-000000000001', null),
  ('c0000000-0000-0000-0000-000000000002', 'fc000000-0000-0000-0000-000000000001', 'João Lima', null, 'joao@alfa.test', null, null, '5c000000-0000-0000-0000-000000000001', null),
  ('c0000000-0000-0000-0000-000000000003', 'fc000000-0000-0000-0000-000000000001', 'Rita Alves', null, 'rita@alfa.test', null, null, '5c000000-0000-0000-0000-000000000001', null);
insert into public.contact_account_links (workspace_id, contact_id, target_account_id, ended_at) values
  ('fc000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', (select id from contas where k = 'alfa'), null),
  ('fc000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', (select id from contas where k = 'alfa'), now()),
  ('fc000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', (select id from contas where k = 'alfa'), null);
update public.contacts set archived_at = now() where id = 'c0000000-0000-0000-0000-000000000003';

-- Um Sinal válido e um vencido na Alfa.
insert into private.signals (workspace_id, target_account_id, signal_type, event_key, phrase, fired_at) values
  ('fc000000-0000-0000-0000-000000000001', (select id from contas where k = 'alfa'), 'vaga_linkedin', 'vaga-1', 'Abriu vaga de Gerente de Logística', now() - interval '2 days'),
  ('fc000000-0000-0000-0000-000000000001', (select id from contas where k = 'alfa'), 'vaga_linkedin', 'vaga-0', 'Vaga antiga de Analista', now() - interval '40 days');

-- O Norte habilitou o HubSpot, o Pipedrive (CRMs) e o Notion (não é CRM). Ana conectou os três; Bruno, o HubSpot.
insert into public.workspace_integrations (workspace_id, integration_id, enabled_by) values
  ('fc000000-0000-0000-0000-000000000001', 'hubspot', '5c000000-0000-0000-0000-000000000001'),
  ('fc000000-0000-0000-0000-000000000001', 'pipedrive', '5c000000-0000-0000-0000-000000000001'),
  ('fc000000-0000-0000-0000-000000000001', 'notion', '5c000000-0000-0000-0000-000000000001');
insert into private.integration_accesses (workspace_id, user_id, integration_id, kind, state, secret_name) values
  ('fc000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', 'hubspot', 'api_key', 'conectado', 'segredo-ana-hubspot'),
  ('fc000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', 'pipedrive', 'api_key', 'precisa_reconectar', 'segredo-ana-pipedrive'),
  ('fc000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', 'notion', 'oauth_mcp', 'conectado', 'segredo-ana-notion'),
  ('fc000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000002', 'hubspot', 'api_key', 'conectado', 'segredo-bruno-hubspot');

create temporary table guardado (k text primary key, v text) on commit drop;
grant all on guardado to authenticated, service_role;

-- 1-3. A tabela é do servidor; o navegador só lista; começar e concluir são só da chave de serviço.
select ok(
  (select relrowsecurity from pg_class where oid = 'private.crm_handoffs'::regclass)
    and not has_table_privilege('authenticated', 'private.crm_handoffs', 'select')
    and not has_table_privilege('service_role', 'private.crm_handoffs', 'select'),
  'RLS ligado e nenhum papel lê a tabela dos envios direto'
);
select ok(
  has_function_privilege('service_role', 'public.begin_crm_handoff(uuid, uuid, uuid, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.begin_crm_handoff(uuid, uuid, uuid, text)', 'execute')
    and not has_function_privilege('anon', 'public.begin_crm_handoff(uuid, uuid, uuid, text)', 'execute')
    and has_function_privilege('service_role', 'public.finish_crm_handoff(uuid, boolean, jsonb, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.finish_crm_handoff(uuid, boolean, jsonb, text)', 'execute')
    and has_function_privilege('service_role', 'public.save_crm_handoff_progress(uuid, jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.save_crm_handoff_progress(uuid, jsonb)', 'execute'),
  'começar e concluir o envio são só do servidor'
);
select ok(
  has_function_privilege('authenticated', 'public.list_crm_handoffs(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.list_crm_handoffs(uuid)', 'execute'),
  'o participante lista o estado dos envios'
);

set local role service_role;

-- 4-9. Quem pode começar: só o Vendedor responsável, ativo, numa Integração de CRM habilitada e conectada.
select throws_ok(
  format($$select * from public.begin_crm_handoff('fc000000-0000-0000-0000-000000000001', %L, '5c000000-0000-0000-0000-000000000002', 'hubspot')$$,
    (select id from contas where k = 'alfa')),
  '42501', 'only the responsible seller can send this target account to the CRM',
  'Bruno não é o responsável pela Alfa'
);
select throws_ok(
  format($$select * from public.begin_crm_handoff('fc000000-0000-0000-0000-000000000001', %L, '5c000000-0000-0000-0000-000000000005', 'hubspot')$$,
    (select id from contas where k = 'gama')),
  '42501', 'active workspace membership required',
  'Eva saiu do Workspace: nem a Conta de que era responsável ela envia'
);
select throws_ok(
  format($$select * from public.begin_crm_handoff('fc000000-0000-0000-0000-000000000002', %L, '5c000000-0000-0000-0000-000000000003', 'hubspot')$$,
    (select id from contas where k = 'alfa')),
  'P0002', 'target account not found',
  'Carla, do Sul, não alcança uma Conta do Norte'
);
select throws_ok(
  format($$select * from public.begin_crm_handoff('fc000000-0000-0000-0000-000000000001', %L, '5c000000-0000-0000-0000-000000000001', 'notion')$$,
    (select id from contas where k = 'alfa')),
  '55000', 'integration is not a CRM',
  'o Notion não é um CRM'
);
select throws_ok(
  format($$select * from public.begin_crm_handoff('fc000000-0000-0000-0000-000000000001', %L, '5c000000-0000-0000-0000-000000000001', 'pipedrive')$$,
    (select id from contas where k = 'alfa')),
  '55000', 'integration access not connected',
  'o Acesso de Ana ao Pipedrive precisa reconectar'
);
select throws_ok(
  format($$select * from public.begin_crm_handoff('fc000000-0000-0000-0000-000000000001', %L, '5c000000-0000-0000-0000-000000000001', 'rd-station')$$,
    (select id from contas where k = 'alfa')),
  '55000', 'integration not enabled',
  'o RD Station CRM não está habilitado no Norte'
);

-- 10-16. Ana começa o envio da Alfa ao HubSpot: o pedido leva a empresa, os Contatos ativos e a nota.
select lives_ok(
  format($$insert into guardado select 'h1', row_to_json(b)::text from public.begin_crm_handoff('fc000000-0000-0000-0000-000000000001', %L, '5c000000-0000-0000-0000-000000000001', 'hubspot') b$$,
    (select id from contas where k = 'alfa')),
  'a responsável começa o envio'
);
select is(
  (select v::jsonb ->> 'access_kind' from guardado where k = 'h1'),
  'api_key',
  'o servidor sabe por qual caminho o Acesso foi conectado'
);
select is(
  (select v::jsonb -> 'payload' -> 'empresa' from guardado where k = 'h1'),
  jsonb_build_object('nome', 'Alfa', 'dominio', 'alfa.test', 'site', 'https://alfa.test', 'cnpj', '12.345.678/0001-90',
    'segmento', 'Logística', 'linkedin', null),
  'a empresa vai com nome, domínio, site, CNPJ e segmento'
);
select is(
  (select v::jsonb -> 'payload' -> 'contatos' from guardado where k = 'h1'),
  jsonb_build_array(jsonb_build_object('id', 'c0000000-0000-0000-0000-000000000001', 'nome', 'Maria Souza',
    'cargo', 'Diretora de Operações', 'email', 'maria@alfa.test', 'telefone', '+5511999990001',
    'linkedin', 'https://www.linkedin.com/in/maria')),
  'só os Contatos com Vínculo ativo e não arquivados vão'
);
select ok(
  (select v::jsonb -> 'payload' ->> 'nota' from guardado where k = 'h1') like '%Abriu vaga de Gerente de Logística%'
    and (select v::jsonb -> 'payload' ->> 'nota' from guardado where k = 'h1') not like '%Vaga antiga%'
    and (select v::jsonb -> 'payload' ->> 'nota' from guardado where k = 'h1') like '%Sinais ativos%',
  'a nota, em português, traz os Sinais ainda válidos e não os vencidos'
);
select is(
  (select v::jsonb -> 'previous_refs' from guardado where k = 'h1'),
  '{}'::jsonb,
  'na primeira tentativa não há nada criado antes'
);
select throws_ok(
  format($$select * from public.begin_crm_handoff('fc000000-0000-0000-0000-000000000001', %L, '5c000000-0000-0000-0000-000000000001', 'hubspot')$$,
    (select id from contas where k = 'alfa')),
  '23505', 'target account already sent to the CRM',
  'um segundo envio não começa enquanto o primeiro está em andamento'
);

-- 17-20. A falha fica registrada com o que já foi criado e permite tentar de novo, sem refazer o que existe.
select is(
  public.finish_crm_handoff((select (v::jsonb ->> 'handoff_id')::uuid from guardado where k = 'h1'), false,
    '{"empresa": "hs-company-1"}'::jsonb, 'O HubSpot recusou o Contato Maria Souza.'),
  'falhou',
  'a falha é registrada'
);
select throws_ok(
  format($$select public.finish_crm_handoff(%L, true, '{}'::jsonb, null)$$, (select v::jsonb ->> 'handoff_id' from guardado where k = 'h1')),
  '55000', 'handoff already finished',
  'um envio concluído não se conclui de novo'
);
select lives_ok(
  format($$insert into guardado select 'h2', row_to_json(b)::text from public.begin_crm_handoff('fc000000-0000-0000-0000-000000000001', %L, '5c000000-0000-0000-0000-000000000001', 'hubspot') b$$,
    (select id from contas where k = 'alfa')),
  'depois da falha, a responsável tenta de novo'
);
select is(
  (select v::jsonb -> 'previous_refs' from guardado where k = 'h2'),
  '{"empresa": "hs-company-1"}'::jsonb,
  'a nova tentativa recebe o que a anterior já criou no CRM'
);

-- 21-24. O servidor grava o progresso; uma tentativa que caiu no meio (sem progresso há mais de 10 minutos) é encerrada
-- como falha e passa o que já criou para a seguinte.
select lives_ok(
  format($$select public.save_crm_handoff_progress(%L, '{"empresa": "hs-company-1", "contatos": {"c0000000-0000-0000-0000-000000000001": "hs-contact-1"}}'::jsonb)$$,
    (select v::jsonb ->> 'handoff_id' from guardado where k = 'h2')),
  'o progresso fica gravado enquanto o envio anda'
);
reset role;
update private.crm_handoffs set updated_at = now() - interval '11 minutes'
where id = (select (v::jsonb ->> 'handoff_id')::uuid from guardado where k = 'h2');
set local role service_role;
select lives_ok(
  format($$insert into guardado select 'h3', row_to_json(b)::text from public.begin_crm_handoff('fc000000-0000-0000-0000-000000000001', %L, '5c000000-0000-0000-0000-000000000001', 'hubspot') b$$,
    (select id from contas where k = 'alfa')),
  'uma tentativa parada há mais de 10 minutos não trava a Conta'
);
select is(
  (select v::jsonb -> 'previous_refs' from guardado where k = 'h3'),
  '{"empresa": "hs-company-1", "contatos": {"c0000000-0000-0000-0000-000000000001": "hs-contact-1"}}'::jsonb,
  'a tentativa nova recebe o que a parada já tinha criado'
);
select throws_ok(
  format($$select public.save_crm_handoff_progress(%L, '{}'::jsonb)$$, (select v::jsonb ->> 'handoff_id' from guardado where k = 'h2')),
  '55000', 'handoff not in progress',
  'a tentativa parada foi encerrada e não grava mais progresso'
);

-- 25-29. O envio que dá certo leva o cartão para No CRM, registrando quem, e não deixa enviar de novo.
select is(
  public.finish_crm_handoff((select (v::jsonb ->> 'handoff_id')::uuid from guardado where k = 'h3'), true,
    '{"empresa": "hs-company-1", "contatos": {"c0000000-0000-0000-0000-000000000001": "hs-contact-1"}, "nota": "hs-note-1"}'::jsonb, null),
  'enviado',
  'o envio é concluído'
);
reset role;
select is(
  (select stage from private.prospecting_stages where target_account_id = (select id from contas where k = 'alfa')),
  'no_crm',
  'a Conta enviada está em No CRM'
);
select is(
  (select moved_by::text || '|' || event from private.prospecting_stage_history
   where target_account_id = (select id from contas where k = 'alfa') and to_stage = 'no_crm'),
  '5c000000-0000-0000-0000-000000000001|enviada_ao_crm',
  'o histórico guarda quem enviou e o evento'
);
set local role service_role;
select throws_ok(
  format($$select * from public.begin_crm_handoff('fc000000-0000-0000-0000-000000000001', %L, '5c000000-0000-0000-0000-000000000001', 'hubspot')$$,
    (select id from contas where k = 'alfa')),
  '23505', 'target account already sent to the CRM',
  'depois do envio, a Althius não escreve de novo'
);
select throws_ok(
  $$select public.finish_crm_handoff('00000000-0000-0000-0000-00000000dead', true, '{}'::jsonb, null)$$,
  'P0002', 'handoff not found',
  'um envio desconhecido não se conclui'
);

-- 30-34. A lista: o estado por Conta, só do Workspace de quem lê e só para quem participa.
set local role authenticated;
select set_config('request.jwt.claim.sub', '5c000000-0000-0000-0000-000000000002', true);
select is(
  (select status || '|' || integration_id || '|' || (crm_refs ->> 'empresa')
   from public.list_crm_handoffs('fc000000-0000-0000-0000-000000000001')
   where target_account_id = (select id from contas where k = 'alfa')),
  'enviado|hubspot|hs-company-1',
  'qualquer participante ativo vê que a Alfa foi enviada ao HubSpot (a última tentativa vale)'
);
select is(
  (select count(*)::integer from public.list_crm_handoffs('fc000000-0000-0000-0000-000000000001')),
  1,
  'uma linha por Conta enviada ou tentada'
);
select throws_ok(
  $$select * from public.list_crm_handoffs('fc000000-0000-0000-0000-000000000002')$$,
  '42501', null,
  'Bruno não lê os envios do Sul'
);
select set_config('request.jwt.claim.sub', '5c000000-0000-0000-0000-000000000003', true);
select is(
  (select count(*)::integer from public.list_crm_handoffs('fc000000-0000-0000-0000-000000000002')),
  0,
  'o Sul não vê nada do Norte'
);
select set_config('request.jwt.claim.sub', '5c000000-0000-0000-0000-000000000001', true);
select is(
  (select error from public.list_crm_handoffs('fc000000-0000-0000-0000-000000000001')
   where target_account_id = (select id from contas where k = 'alfa')),
  null,
  'o envio que deu certo não carrega a mensagem da falha anterior'
);

select * from finish();
rollback;

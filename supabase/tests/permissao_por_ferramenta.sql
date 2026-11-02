begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(30);
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


-- A Permissão por ferramenta do conector (ADR-0022, migration 20261002110000): o Administrador decide, por Workspace, se
-- cada ferramenta de uma Integração roda sempre, pede Aprovação ou fica bloqueada. Ela se soma à Permissão do Agente na
-- Integração (ADR-0002) sem enfraquecê-la.

-- Ana (Admin) e Bruno (Membro) do Norte; Carla é Admin do Sul.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('5e000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5e000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5e000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@sul.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('fe000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('fe000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
select pg_temp.semear_agentes_padrao(w.id) from public.workspaces w;
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('fe000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000001', 'admin', true),
  ('fe000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000002', 'member', true),
  ('fe000000-0000-0000-0000-000000000002', '5e000000-0000-0000-0000-000000000003', 'admin', true);
insert into public.workspace_integrations (workspace_id, integration_id, enabled_by) values
  ('fe000000-0000-0000-0000-000000000001', 'hubspot', '5e000000-0000-0000-0000-000000000001'),
  ('fe000000-0000-0000-0000-000000000001', 'clay', '5e000000-0000-0000-0000-000000000001'),
  ('fe000000-0000-0000-0000-000000000002', 'hubspot', '5e000000-0000-0000-0000-000000000003');
insert into private.agent_conversations (id, workspace_id, owner_id, kind) values
  ('ce000000-0000-0000-0000-000000000001', 'fe000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000002', 'coordenada');
insert into private.agent_runs (id, workspace_id, conversation_id, requested_by, client_request_id, request_text) values
  ('ae000000-0000-0000-0000-000000000001', 'fe000000-0000-0000-0000-000000000001', 'ce000000-0000-0000-0000-000000000001',
   '5e000000-0000-0000-0000-000000000002', gen_random_uuid(), 'Crie a Alfa no HubSpot');

create function pg_temp.scopus() returns uuid language sql as $$
  select id from private.agents where workspace_id = 'fe000000-0000-0000-0000-000000000001' and specialty = 'scopus' and kind = 'padrao'
$$;
create function pg_temp.entrar_como(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true)
$$;
create function pg_temp.chamada(p_integracao text, p_ferramenta text) returns jsonb language sql as $$
  select jsonb_build_object('tipo', 'ferramenta', 'integration_id', p_integracao, 'ferramenta', p_ferramenta,
    'argumentos', jsonb_build_object('properties', jsonb_build_object('name', 'Alfa')))
$$;
create function pg_temp.propor(p_integracao text, p_payload jsonb) returns table (approval_id uuid, outcome text) language sql as $$
  select * from public.propose_agent_action('ae000000-0000-0000-0000-000000000001', pg_temp.scopus(), p_integracao,
    'Usar create_company no HubSpot', p_payload, 'Cria uma empresa no HubSpot', 'A Alfa teve um Sinal')
$$;
create function pg_temp.permissao(p text) returns void language sql as $$
  update private.agent_permissions set permission = p where agent_id = pg_temp.scopus() and integration_id = 'hubspot'
$$;
create temporary table ap (k text primary key, id uuid) on commit drop;

-- 1. A tabela não se lê por fora; ler e definir são do app; as funções de serviço não são.
select ok(
  not has_table_privilege('authenticated', 'private.integration_tool_rules', 'select')
    and not has_table_privilege('service_role', 'private.integration_tool_rules', 'select')
    and has_function_privilege('authenticated', 'public.list_integration_tool_rules(uuid, text)', 'execute')
    and has_function_privilege('authenticated', 'public.set_integration_tool_rule(uuid, text, text, text)', 'execute')
    and not has_function_privilege('anon', 'public.list_integration_tool_rules(uuid, text)', 'execute')
    and not has_function_privilege('anon', 'public.set_integration_tool_rule(uuid, text, text, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.integration_tool_rules_for_use(uuid, text)', 'execute')
    and has_function_privilege('service_role', 'public.integration_tool_rules_for_use(uuid, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.tool_approval(uuid, uuid)', 'execute')
    and has_function_privilege('service_role', 'public.tool_approval(uuid, uuid)', 'execute'),
  'tabela fechada; ler e definir pelo app; o resto, só o servidor'
);

-- 2. Sem linha, nada está definido: o padrão (leitura sempre, escrita pede Aprovação) é do servidor.
select pg_temp.entrar_como('5e000000-0000-0000-0000-000000000002');
select is((select count(*)::integer from public.list_integration_tool_rules('fe000000-0000-0000-0000-000000000001', 'hubspot')), 0,
  'o Membro lê as regras; sem decisão, nenhuma');

-- 3. Só o Administrador decide.
select throws_ok(
  $$select public.set_integration_tool_rule('fe000000-0000-0000-0000-000000000001', 'hubspot', 'create_company', 'sempre')$$,
  '42501', 'only administrators can set tool rules', 'o Membro não muda a regra'
);
select pg_temp.entrar_como('5e000000-0000-0000-0000-000000000003');
select throws_ok(
  $$select * from public.list_integration_tool_rules('fe000000-0000-0000-0000-000000000001', 'hubspot')$$,
  '42501', 'active workspace membership required', 'quem é de outro Workspace não lê as regras'
);
select throws_ok(
  $$select public.set_integration_tool_rule('fe000000-0000-0000-0000-000000000001', 'hubspot', 'create_company', 'sempre')$$,
  '42501', 'active workspace membership required', 'nem a Admin de outro Workspace muda'
);

-- 4. A Ana decide; uma regra desconhecida, uma ferramenta vazia ou uma Integração não ligada são recusadas.
select pg_temp.entrar_como('5e000000-0000-0000-0000-000000000001');
select is(public.set_integration_tool_rule('fe000000-0000-0000-0000-000000000001', 'hubspot', 'create_company', 'bloqueada'),
  'bloqueada', 'a Administradora bloqueia uma ferramenta');
select is(
  (select tool_name || ':' || rule from public.list_integration_tool_rules('fe000000-0000-0000-0000-000000000001', 'hubspot')),
  'create_company:bloqueada', 'e todos do Workspace veem a regra'
);
select throws_ok(
  $$select public.set_integration_tool_rule('fe000000-0000-0000-0000-000000000001', 'hubspot', 'create_company', 'talvez')$$,
  '22023', 'unknown tool rule', 'regra desconhecida'
);
select throws_ok(
  $$select public.set_integration_tool_rule('fe000000-0000-0000-0000-000000000001', 'hubspot', '  ', 'sempre')$$,
  '22023', 'invalid tool name', 'ferramenta vazia'
);
select throws_ok(
  $$select public.set_integration_tool_rule('fe000000-0000-0000-0000-000000000001', 'notion', 'notion-create-pages', 'sempre')$$,
  '22023', 'integration not enabled', 'Integração não ligada no Workspace'
);

-- 5. A regra de um Workspace não vale no outro.
select pg_temp.entrar_como('5e000000-0000-0000-0000-000000000003');
select is((select count(*)::integer from public.list_integration_tool_rules('fe000000-0000-0000-0000-000000000002', 'hubspot')), 0,
  'o Sul não vê a regra do Norte');

-- 6. Bloqueada vence tudo: nem com Executar o Agente propõe.
reset role;
select pg_temp.permissao('executar');
select throws_ok(
  $$select * from pg_temp.propor('hubspot', pg_temp.chamada('hubspot', 'create_company'))$$,
  '42501', 'the tool is blocked in this workspace', 'ferramenta bloqueada não vira Aprovação'
);

-- 7. Sem regra, a escrita pede Aprovação mesmo com Executar; com "sempre" e Executar, nasce liberada.
select pg_temp.entrar_como('5e000000-0000-0000-0000-000000000001');
select is(public.set_integration_tool_rule('fe000000-0000-0000-0000-000000000001', 'hubspot', 'create_company', null), null,
  'tirar a regra volta ao padrão');
reset role;
insert into ap select 'padrao', approval_id from pg_temp.propor('hubspot', pg_temp.chamada('hubspot', 'create_company'));
select is((select state from private.approvals where id = (select id from ap where k = 'padrao')), 'pendente',
  'sem regra, a ferramenta que escreve pede Aprovação, mesmo com Executar');
select pg_temp.entrar_como('5e000000-0000-0000-0000-000000000001');
select public.set_integration_tool_rule('fe000000-0000-0000-0000-000000000001', 'hubspot', 'create_note', 'sempre');
reset role;
insert into ap select 'sempre', approval_id from pg_temp.propor('hubspot', pg_temp.chamada('hubspot', 'create_note'));
select is((select state || ':' || decided_by_kind from private.approvals where id = (select id from ap where k = 'sempre')),
  'aprovada:permissao', '"sempre" com Executar nasce liberada pela Permissão');

-- 8. "aprovacao" pede Aprovação com Executar; "sempre" com Propor também pede.
select pg_temp.entrar_como('5e000000-0000-0000-0000-000000000001');
select public.set_integration_tool_rule('fe000000-0000-0000-0000-000000000001', 'hubspot', 'create_contact', 'aprovacao');
reset role;
select is((select outcome from pg_temp.propor('hubspot', pg_temp.chamada('hubspot', 'create_contact'))), 'pendente',
  '"aprovacao" exige Aprovação mesmo com Executar');
select pg_temp.permissao('propor');
select is((select outcome from pg_temp.propor('hubspot', pg_temp.chamada('hubspot', 'create_note'))), 'pendente',
  '"sempre" com Propor pede Aprovação');

-- 9. Ler nunca escreve; o payload precisa ser de uma chamada desta Integração.
select pg_temp.permissao('ler');
select throws_ok(
  $$select * from pg_temp.propor('hubspot', pg_temp.chamada('hubspot', 'create_note'))$$,
  '42501', 'the agent may only read this integration', 'com Ler, nem a ferramenta "sempre" vira Aprovação'
);
select pg_temp.permissao('executar');
select throws_ok(
  $$select * from pg_temp.propor('hubspot', pg_temp.chamada('clay', 'create_note'))$$,
  '22023', 'invalid tool call payload', 'o payload aponta para outra Integração'
);

-- 10. Um payload que não é de ferramenta segue como antes: Executar nasce liberada.
select is((select outcome from pg_temp.propor('hubspot', '{"name": "Alfa"}'::jsonb)), 'liberada',
  'as outras Aprovações não mudam');

-- 11. Reservar confere a regra de novo: liberada pela Permissão com "sempre", e a regra mudou para "aprovacao".
select pg_temp.entrar_como('5e000000-0000-0000-0000-000000000001');
select public.set_integration_tool_rule('fe000000-0000-0000-0000-000000000001', 'hubspot', 'create_note', 'aprovacao');
reset role;
select is(public.claim_approved_action((select id from ap where k = 'sempre'), pg_temp.chamada('hubspot', 'create_note')),
  'tool_rule_changed', 'a regra mudou depois de liberada: nada sai');
select is((select state from private.approvals where id = (select id from ap where k = 'sempre')), 'aprovada',
  'e a Aprovação não muda');

-- 12. A Ana aprova a pendente; se a ferramenta for bloqueada antes de sair, nada sai.
select pg_temp.entrar_como('5e000000-0000-0000-0000-000000000001');
select public.decide_approval((select id from ap where k = 'padrao'), 'aprovar', 'conversa');
select public.set_integration_tool_rule('fe000000-0000-0000-0000-000000000001', 'hubspot', 'create_company', 'bloqueada');
reset role;
select is(public.claim_approved_action((select id from ap where k = 'padrao'), pg_temp.chamada('hubspot', 'create_company')),
  'tool_blocked', 'bloqueada depois de aprovada: nada sai');

-- 13. Desbloqueada, a chamada aprovada sai uma vez, exatamente aquela.
select pg_temp.entrar_como('5e000000-0000-0000-0000-000000000001');
select public.set_integration_tool_rule('fe000000-0000-0000-0000-000000000001', 'hubspot', 'create_company', 'aprovacao');
reset role;
select is(public.claim_approved_action((select id from ap where k = 'padrao'),
  jsonb_set(pg_temp.chamada('hubspot', 'create_company'), '{argumentos,properties,name}', '"Beta"')),
  'payload_changed', 'outros argumentos não saem');
select is(public.claim_approved_action((select id from ap where k = 'padrao'), pg_temp.chamada('hubspot', 'create_company')),
  'go', 'a chamada aprovada é reservada');
select is(public.claim_approved_action((select id from ap where k = 'padrao'), pg_temp.chamada('hubspot', 'create_company')),
  'not_approved', 'e não é reservada duas vezes');

-- 14. O executor lê a Aprovação de ferramenta; com o Administrador que pediu a execução, só se ele for Admin ativo.
select is(
  (select payload ->> 'ferramenta' from public.tool_approval((select id from ap where k = 'padrao'), '5e000000-0000-0000-0000-000000000001')),
  'create_company', 'a Administradora executa a Aprovação de ferramenta'
);
select throws_ok(
  format($$select * from public.tool_approval(%L, '5e000000-0000-0000-0000-000000000002')$$, (select id from ap where k = 'padrao')),
  '42501', 'only administrators can execute approvals', 'o Membro não pede a execução'
);
insert into ap select 'outra', approval_id from pg_temp.propor('hubspot', '{"tipo": "envio_ao_crm"}'::jsonb);
select throws_ok(
  format($$select * from public.tool_approval(%L)$$, (select id from ap where k = 'outra')),
  'P0002', 'tool approval not found', 'uma Aprovação que não é de ferramenta não existe aqui'
);

-- 15. O servidor lê as regras do Workspace do pedido, e só dele.
select is(
  (select array_agg(tool_name || ':' || rule order by tool_name) from public.integration_tool_rules_for_use('fe000000-0000-0000-0000-000000000001', 'hubspot')),
  array['create_company:aprovacao', 'create_contact:aprovacao', 'create_note:aprovacao'],
  'as regras do Norte para o servidor'
);

select * from finish();
rollback;

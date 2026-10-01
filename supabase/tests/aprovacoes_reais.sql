begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(30);

-- Ana (Admin) e Bruno (Membro) do Norte; Carla é Admin do Sul.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('5a000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5a000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5a000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@sul.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('fa000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('fa000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 'admin', true),
  ('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000002', 'member', true),
  ('fa000000-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-000000000003', 'admin', true);

-- O HubSpot ligado no Norte; uma Execução pedida pelo Bruno.
insert into public.workspace_integrations (workspace_id, integration_id, enabled_by) values
  ('fa000000-0000-0000-0000-000000000001', 'hubspot', '5a000000-0000-0000-0000-000000000001'),
  ('fa000000-0000-0000-0000-000000000001', 'clay', '5a000000-0000-0000-0000-000000000001');
insert into private.agent_conversations (id, workspace_id, owner_id, kind) values
  ('ca000000-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000002', 'coordenada');
insert into private.agent_runs (id, workspace_id, conversation_id, requested_by, client_request_id, request_text) values
  ('aa000000-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001',
   '5a000000-0000-0000-0000-000000000002', gen_random_uuid(), 'Envie a Alfa ao HubSpot');

create function pg_temp.agente(p_workspace text, p_especialidade text) returns uuid language sql as $$
  select id from private.agents where workspace_id = p_workspace::uuid and specialty = p_especialidade and kind = 'padrao'
$$;
create function pg_temp.entrar_como(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true)
$$;
create function pg_temp.propor(p_integracao text, p_payload jsonb) returns table (approval_id uuid, outcome text) language sql as $$
  select * from public.propose_agent_action('aa000000-0000-0000-0000-000000000001',
    pg_temp.agente('fa000000-0000-0000-0000-000000000001', 'scopus'), p_integracao, 'Criar a empresa Alfa no HubSpot', p_payload,
    'Uma empresa nova no CRM', 'A Alfa teve um Sinal de expansão')
$$;
create function pg_temp.estado(p uuid) returns text language sql as $$ select state from private.approvals where id = p $$;
create temporary table ap (k text primary key, id uuid) on commit drop;

-- 1. As tabelas não se leem por fora; propor, reservar e encerrar são só do servidor; ler e decidir são do app.
select ok(
  not has_table_privilege('authenticated', 'private.approvals', 'select')
    and not has_table_privilege('service_role', 'private.approvals', 'select')
    and not has_function_privilege('authenticated', 'public.propose_agent_action(uuid, uuid, text, text, jsonb, text, text, uuid)', 'execute')
    and has_function_privilege('service_role', 'public.propose_agent_action(uuid, uuid, text, text, jsonb, text, text, uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.claim_approved_action(uuid, jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.finish_approved_action(uuid, boolean, text)', 'execute')
    and has_function_privilege('authenticated', 'public.decide_approval(uuid, text, text)', 'execute')
    and not has_function_privilege('anon', 'public.list_approvals(uuid)', 'execute'),
  'as permissões: tabela fechada, propor e executar pelo servidor, ler e decidir pelo app'
);

-- 2. Permissão Ler recusa; Integração desligada recusa; Propor nasce pendente.
select throws_ok(
  $$select * from pg_temp.propor('clay', '{}'::jsonb)$$,
  '42501', 'the agent may only read this integration', 'com a Permissão Ler, a ação é recusada'
);
update private.agent_permissions set permission = 'propor'
where agent_id = pg_temp.agente('fa000000-0000-0000-0000-000000000001', 'scopus') and integration_id = 'apollo';
select throws_ok(
  $$select * from pg_temp.propor('apollo', '{}'::jsonb)$$,
  '55000', 'integration not enabled in this workspace', 'sem a Integração ligada no Workspace, a ação é recusada'
);
insert into ap select 'p1', approval_id from pg_temp.propor('hubspot', '{"name": "Alfa", "domain": "alfa.test"}');
select is(pg_temp.estado((select id from ap where k = 'p1')), 'pendente', 'com a Permissão Propor, nasce pendente');
select is(
  (select requested_by from private.approvals where id = (select id from ap where k = 'p1')), '5a000000-0000-0000-0000-000000000002'::uuid,
  'guarda quem pediu (o autor da Execução)'
);
select is(
  (select expires_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour' from private.approvals where id = (select id from ap where k = 'p1')),
  true, 'e vence em 7 dias'
);

-- 3. Todo Participante vê a fila; o Workspace de outro não.
select pg_temp.entrar_como('5a000000-0000-0000-0000-000000000002');
select is((select count(*)::integer from public.list_approvals('fa000000-0000-0000-0000-000000000001')), 1, 'o Membro vê a fila');
select pg_temp.entrar_como('5a000000-0000-0000-0000-000000000003');
select throws_ok(
  $$select * from public.list_approvals('fa000000-0000-0000-0000-000000000001')$$,
  '42501', 'active workspace membership required', 'quem é de outro Workspace não vê a fila'
);

-- 4. Só o Administrador decide (decisão do Nan); a Admin de outro Workspace também não.
select pg_temp.entrar_como('5a000000-0000-0000-0000-000000000002');
select throws_ok(
  format($$select public.decide_approval(%L, 'aprovar')$$, (select id from ap where k = 'p1')),
  '42501', 'only administrators can decide approvals', 'o Membro não decide'
);
select pg_temp.entrar_como('5a000000-0000-0000-0000-000000000003');
select throws_ok(
  format($$select public.decide_approval(%L, 'aprovar')$$, (select id from ap where k = 'p1')),
  '42501', 'active workspace membership required', 'a Admin de outro Workspace não decide'
);

-- 5. Antes de aprovar, o servidor não reserva.
reset role;
select is(public.claim_approved_action((select id from ap where k = 'p1'), '{"name": "Alfa", "domain": "alfa.test"}'), 'not_approved',
  'pendente não sai');

-- 6. A Ana aprova na fila; decidir de novo é recusado.
select pg_temp.entrar_como('5a000000-0000-0000-0000-000000000001');
select is(public.decide_approval((select id from ap where k = 'p1'), 'aprovar', 'fila'), 'aprovada', 'a Administradora aprova');
select throws_ok(
  format($$select public.decide_approval(%L, 'recusar')$$, (select id from ap where k = 'p1')),
  '55000', 'the approval was already decided', 'uma decisão não se decide de novo'
);
select is(
  (select row(decided_by_kind, decided_by, decided_where)::text from private.approvals where id = (select id from ap where k = 'p1')),
  '(pessoa,5a000000-0000-0000-0000-000000000001,fila)', 'guarda quem decidiu e onde'
);

-- 7. O payload diferente do revisado não sai; o igual reserva e encerra.
reset role;
select is(public.claim_approved_action((select id from ap where k = 'p1'), '{"name": "Alfa", "domain": "outra.test"}'), 'payload_changed',
  'um payload diferente do aprovado não sai');
select is(public.claim_approved_action((select id from ap where k = 'p1'), '{"domain": "alfa.test", "name": "Alfa"}'), 'go',
  'o mesmo payload, em qualquer ordem de campos, reserva');
select is(pg_temp.estado((select id from ap where k = 'p1')), 'executando', 'e fica executando');
select is(public.claim_approved_action((select id from ap where k = 'p1'), '{"name": "Alfa", "domain": "alfa.test"}'), 'not_approved',
  'uma reserva não se repete (sem envio duplicado)');
select lives_ok(format($$select public.finish_approved_action(%L, true)$$, (select id from ap where k = 'p1')), 'o servidor encerra');
select is(pg_temp.estado((select id from ap where k = 'p1')), 'executada', 'e a Aprovação fica executada');

-- 8. Recusar e cancelar.
insert into ap select 'p2', approval_id from pg_temp.propor('hubspot', '{"name": "Beta"}');
insert into ap select 'p3', approval_id from pg_temp.propor('hubspot', '{"name": "Gama"}');
select pg_temp.entrar_como('5a000000-0000-0000-0000-000000000001');
select is(public.decide_approval((select id from ap where k = 'p2'), 'recusar', 'conversa'), 'recusada', 'a Administradora recusa');
select pg_temp.entrar_como('5a000000-0000-0000-0000-000000000002');
select lives_ok(format($$select public.cancel_approval(%L)$$, (select id from ap where k = 'p3')), 'quem pediu cancela');
select is(pg_temp.estado((select id from ap where k = 'p3')), 'cancelada', 'e fica cancelada');

-- 9. A pendente vencida expira; decidir depois do prazo é recusado.
reset role;
insert into ap select 'p4', approval_id from pg_temp.propor('hubspot', '{"name": "Delta"}');
update private.approvals set expires_at = now() - interval '1 minute' where id = (select id from ap where k = 'p4');
select pg_temp.entrar_como('5a000000-0000-0000-0000-000000000001');
select is(public.decide_approval((select id from ap where k = 'p4'), 'aprovar'), 'expirada',
  'decidir depois do prazo não aprova: a pendente expira');
reset role;
select is(pg_temp.estado((select id from ap where k = 'p4')), 'expirada', 'e a pendente vencida fica expirada');

-- 10. Executar: nasce liberada pela Permissão; perder a Permissão antes de sair barra a execução.
update private.agent_permissions set permission = 'executar'
where agent_id = pg_temp.agente('fa000000-0000-0000-0000-000000000001', 'scopus') and integration_id = 'hubspot';
insert into ap select 'p5', approval_id from pg_temp.propor('hubspot', '{"name": "Épsilon"}');
select is(
  (select row(state, decided_by_kind)::text from private.approvals where id = (select id from ap where k = 'p5')),
  '(aprovada,permissao)', 'com Executar, nasce liberada pela Permissão'
);
update private.agent_permissions set permission = 'propor'
where agent_id = pg_temp.agente('fa000000-0000-0000-0000-000000000001', 'scopus') and integration_id = 'hubspot';
select is(public.claim_approved_action((select id from ap where k = 'p5'), '{"name": "Épsilon"}'), 'permission_revoked',
  'a Permissão rebaixada antes de sair barra a execução');

-- 11. Quem pediu e saiu do Workspace barra a execução; a Integração desligada também.
insert into ap select 'p6', approval_id from pg_temp.propor('hubspot', '{"name": "Zeta"}');
select pg_temp.entrar_como('5a000000-0000-0000-0000-000000000001');
select public.decide_approval((select id from ap where k = 'p6'), 'aprovar');
reset role;
update public.workspace_memberships set active = false
where workspace_id = 'fa000000-0000-0000-0000-000000000001' and user_id = '5a000000-0000-0000-0000-000000000002';
select is(public.claim_approved_action((select id from ap where k = 'p6'), '{"name": "Zeta"}'), 'requester_inactive',
  'quem pediu e saiu barra a execução');
update public.workspace_memberships set active = true
where workspace_id = 'fa000000-0000-0000-0000-000000000001' and user_id = '5a000000-0000-0000-0000-000000000002';
delete from public.workspace_integrations where workspace_id = 'fa000000-0000-0000-0000-000000000001' and integration_id = 'hubspot';
select is(public.claim_approved_action((select id from ap where k = 'p6'), '{"name": "Zeta"}'), 'integration_disabled',
  'a Integração desligada barra a execução');

-- 12. O histórico: cada mudança de estado de p1, em ordem.
select pg_temp.entrar_como('5a000000-0000-0000-0000-000000000002');
select is(
  (select array_agg(to_state) from public.list_approval_events((select id from ap where k = 'p1'))),
  array['pendente', 'aprovada', 'executando', 'executada'], 'o histórico guarda cada estado, em ordem'
);

select * from finish();
rollback;

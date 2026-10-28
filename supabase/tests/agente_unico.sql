begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(42);

-- Ana (Admin) e Bruno (Membro) do Norte; Carla é do Sul.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values
  ('6b000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@agente.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('6b000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@agente.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('6b000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@agente.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('fb000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('fb000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('fb000000-0000-0000-0000-000000000001', '6b000000-0000-0000-0000-000000000001', 'admin', true),
  ('fb000000-0000-0000-0000-000000000001', '6b000000-0000-0000-0000-000000000002', 'member', true),
  ('fb000000-0000-0000-0000-000000000002', '6b000000-0000-0000-0000-000000000003', 'admin', true);

create temporary table ids (chave text primary key, valor uuid);
grant all on ids to authenticated;

-- 1. O esquema: tabelas privadas, com RLS e sem acesso direto de quem entra pelo navegador.
select ok((select relrowsecurity from pg_class where oid = 'private.agente_conversas'::regclass), 'conversas têm RLS');
select ok((select relrowsecurity from pg_class where oid = 'private.agente_turnos'::regclass), 'turnos têm RLS');
select ok((select relrowsecurity from pg_class where oid = 'private.agente_passos'::regclass), 'passos têm RLS');
select ok(not has_table_privilege('authenticated', 'private.agente_passos', 'select'), 'o navegador não lê os passos direto');
select ok(not has_function_privilege('authenticated', 'public.agente_gravar_passo(uuid, text, text, text, text, jsonb)', 'execute'),
  'o navegador não grava passos');
select ok(not has_function_privilege('authenticated', 'public.agente_assumir_passo(uuid, uuid, text)', 'execute'),
  'o navegador não decide passos sem a função');
select ok(not has_function_privilege('anon', 'public.agente_iniciar_turno(uuid, uuid, text, uuid)', 'execute'),
  'anon não inicia turno');
select ok(has_function_privilege('service_role', 'public.agente_reservar_turno(uuid)', 'execute'), 'a função reserva turnos');

-- 2. Bruno pede: nasce a conversa e o turno na fila.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '6b000000-0000-0000-0000-000000000002', true);
insert into ids select 'conversa', conversa_id from public.agente_iniciar_turno(
  'fb000000-0000-0000-0000-000000000001', null, '  Ache   empresas de logística  ', 'ee000000-0000-0000-0000-000000000001');
insert into ids select 'turno1', turno_id from public.agente_iniciar_turno(
  'fb000000-0000-0000-0000-000000000001', null, 'Ache empresas de logística', 'ee000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.agente_listar_conversas('fb000000-0000-0000-0000-000000000001', 30)), 1,
  'o mesmo client_request_id não abre outra conversa');
select is((select titulo from public.agente_listar_conversas('fb000000-0000-0000-0000-000000000001', 30)),
  'Ache empresas de logística', 'o título é o pedido, sem espaços sobrando');
select is((public.agente_ler_conversa((select valor from ids where chave = 'conversa')) -> 'turnos' -> 0 ->> 'status'), 'fila',
  'o turno nasce na fila');
select is((public.agente_ler_conversa((select valor from ids where chave = 'conversa')) ->> 'teto')::int, 50, 'o teto padrão é 50');
select throws_ok(
  $$select * from public.agente_iniciar_turno('fb000000-0000-0000-0000-000000000001',
    (select valor from ids where chave = 'conversa'), 'Outro pedido', 'ee000000-0000-0000-0000-000000000002')$$,
  '55006', null, 'com um turno na fila, a conversa está ocupada');
select throws_ok(
  $$select * from public.agente_iniciar_turno('fb000000-0000-0000-0000-000000000001', null, '   ', 'ee000000-0000-0000-0000-000000000003')$$,
  '22023', null, 'pedido vazio é inválido');
select throws_ok(
  $$select * from public.agente_iniciar_turno('fb000000-0000-0000-0000-000000000002', null, 'Oi', 'ee000000-0000-0000-0000-000000000004')$$,
  '42501', null, 'quem não participa do Workspace não pede');
select throws_ok($$select public.agente_definir_teto('fb000000-0000-0000-0000-000000000001', 80)$$,
  '42501', null, 'só o Admin muda o teto');

-- 3. Carla e Ana não veem a conversa do Bruno.
select set_config('request.jwt.claim.sub', '6b000000-0000-0000-0000-000000000003', true);
select throws_ok($$select public.agente_ler_conversa((select valor from ids where chave = 'conversa'))$$,
  'P0002', null, 'a conversa de outra pessoa não existe para quem lê');
select throws_ok(
  $$select * from public.agente_iniciar_turno('fb000000-0000-0000-0000-000000000002',
    (select valor from ids where chave = 'conversa'), 'Oi', 'ee000000-0000-0000-0000-000000000005')$$,
  'P0002', null, 'não se continua a conversa de outra pessoa');
select set_config('request.jwt.claim.sub', '6b000000-0000-0000-0000-000000000001', true);
select is((select count(*)::int from public.agente_listar_conversas('fb000000-0000-0000-0000-000000000001', 30)), 0,
  'a Admin não lista a conversa do Bruno');
select is(public.agente_definir_teto('fb000000-0000-0000-0000-000000000001', 80), 80, 'a Admin muda o teto do Workspace');
select is(public.agente_teto('fb000000-0000-0000-0000-000000000001'), 80, 'o teto novo vale');
select throws_ok($$select public.agente_definir_teto('fb000000-0000-0000-0000-000000000001', 0)$$,
  '22023', null, 'teto fora de 1..10000 é inválido');
reset role;

-- 4. A função reserva, grava passos e fecha.
select is((public.agente_reservar_turno((select valor from ids where chave = 'turno1')) ->> 'teto')::int, 80,
  'a reserva traz o teto do Workspace');
select is(public.agente_reservar_turno((select valor from ids where chave = 'turno1')), null,
  'um turno já reservado não é reservado de novo');
insert into ids select 'passo1', public.agente_gravar_passo((select valor from ids where chave = 'turno1'),
  'buscar_empresas', 'Buscar 20 empresas', 'rodando', null, '{"quantidade": 20}');
select lives_ok($$select public.agente_atualizar_passo((select valor from ids where chave = 'passo1'), 'ok',
  '{"cartoes": []}', 'Achei 3 empresas.', 5, null, null)$$, 'o passo conclui com custo');
select is((select creditos_gastos from private.agente_conversas where id = (select valor from ids where chave = 'conversa')),
  5.00::numeric, 'o custo soma no gasto da conversa');
select lives_ok($$select public.agente_atualizar_passo((select valor from ids where chave = 'passo1'), 'ok',
  '{"cartoes": []}', 'De novo.', 5, null, null)$$, 'atualizar um passo já ok não falha');
select is((select creditos_gastos from private.agente_conversas where id = (select valor from ids where chave = 'conversa')),
  5.00::numeric, 'mas não soma o custo duas vezes');
select throws_ok($$select public.agente_atualizar_passo((select valor from ids where chave = 'passo1'), 'erro',
  null, null, 0, null, 'x')$$, '55000', null, 'um passo fechado não muda de estado');
insert into ids select 'passo2', public.agente_gravar_passo((select valor from ids where chave = 'turno1'),
  'enriquecer_comite', 'Enriquecer o comitê', 'aguardando_confirmacao', 'teto', '{"contaId": "x"}');
select throws_ok($$select public.agente_gravar_passo((select valor from ids where chave = 'turno1'),
  'enriquecer_comite', 'Sem motivo', 'aguardando_confirmacao', null, '{}')$$, '23514', null,
  'um passo que aguarda confirmação tem motivo');
select lives_ok($$select public.agente_fechar_turno((select valor from ids where chave = 'turno1'), 'aguardando',
  'Isso passa do teto. Confirma?', null)$$, 'o turno fecha aguardando a pessoa');

-- 5. A decisão: só quem pediu, só uma vez.
select throws_ok($$select public.agente_assumir_passo((select valor from ids where chave = 'passo2'),
  '6b000000-0000-0000-0000-000000000001', 'confirmar')$$, 'P0002', null, 'outra pessoa não confirma o passo');
select is((public.agente_assumir_passo((select valor from ids where chave = 'passo2'),
  '6b000000-0000-0000-0000-000000000002', 'confirmar') ->> 'decisao'), 'confirmar', 'quem pediu confirma');
select throws_ok($$select public.agente_assumir_passo((select valor from ids where chave = 'passo2'),
  '6b000000-0000-0000-0000-000000000002', 'confirmar')$$, '55000', null, 'a segunda decisão é recusada');
select is((select status from private.agente_turnos where id = (select valor from ids where chave = 'turno1')), 'fila',
  'confirmar põe o turno de volta na fila');
select is((public.agente_reservar_turno((select valor from ids where chave = 'turno1')) -> 'retomar' ->> 'ferramenta'),
  'enriquecer_comite', 'a reserva traz o passo confirmado para retomar');
select lives_ok($$select public.agente_fechar_turno((select valor from ids where chave = 'turno1'), 'concluido', 'Pronto.', null)$$,
  'o turno conclui');
select throws_ok($$select public.agente_fechar_turno((select valor from ids where chave = 'turno1'), 'concluido', 'De novo.', null)$$,
  '55000', null, 'um turno fechado não fecha de novo');

-- 6. Um pedido novo cancela o passo que aguardava; o turno preso expira.
set local role authenticated;
select set_config('request.jwt.claim.sub', '6b000000-0000-0000-0000-000000000002', true);
insert into ids select 'turno2', turno_id from public.agente_iniciar_turno('fb000000-0000-0000-0000-000000000001',
  (select valor from ids where chave = 'conversa'), 'Agora outra coisa', 'ee000000-0000-0000-0000-000000000006');
reset role;
select is(public.agente_passo_do_usuario((select valor from ids where chave = 'passo1'),
  '6b000000-0000-0000-0000-000000000002') ->> 'ferramenta', 'buscar_empresas', 'quem pediu lê o próprio passo');
select throws_ok($$select public.agente_passo_do_usuario((select valor from ids where chave = 'passo1'),
  '6b000000-0000-0000-0000-000000000003')$$, 'P0002', null, 'outra pessoa não lê o passo');
update private.agente_turnos set lease_until = now() - interval '1 minute' where id = (select valor from ids where chave = 'turno2');
select is(private.agente_expirar_turnos_vencidos(), 1, 'o turno vencido expira');
select is((select error_code from private.agente_turnos where id = (select valor from ids where chave = 'turno2')), 'turn_expired',
  'com o código turn_expired');

select * from finish();
rollback;

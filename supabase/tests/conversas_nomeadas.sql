begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(16);

-- Norte: Ana e Bruno (Membros) e Eva (removida). Sul: Carla.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('63000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('63000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('63000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@sul.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('63000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'eva@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('aaaaaaaa-3000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('aaaaaaaa-3000-0000-0000-000000000002', 'empresa', 'Sul');

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('aaaaaaaa-3000-0000-0000-000000000001', '63000000-0000-0000-0000-000000000001', 'member', true),
  ('aaaaaaaa-3000-0000-0000-000000000001', '63000000-0000-0000-0000-000000000002', 'member', true),
  ('aaaaaaaa-3000-0000-0000-000000000001', '63000000-0000-0000-0000-000000000005', 'member', true),
  ('aaaaaaaa-3000-0000-0000-000000000002', '63000000-0000-0000-0000-000000000003', 'member', true);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- A Ana começa duas Conversas; o Bruno, uma; a Eva, uma (e depois sai do Workspace).
select set_config('request.jwt.claim.sub', '63000000-0000-0000-0000-000000000001', true);
select set_config('t.conv_a1', (select conversation_id::text from public.start_agent_run('aaaaaaaa-3000-0000-0000-000000000001',
  null, null, 'Montem o ICP e as Personas', '{}', 'c3000000-0000-0000-0000-000000000001')), true);
select set_config('t.conv_a2', (select conversation_id::text from public.start_agent_run('aaaaaaaa-3000-0000-0000-000000000001',
  null, null, 'Campanha do quarto trimestre', '{}', 'c3000000-0000-0000-0000-000000000002')), true);
select set_config('request.jwt.claim.sub', '63000000-0000-0000-0000-000000000002', true);
select set_config('t.conv_b', (select conversation_id::text from public.start_agent_run('aaaaaaaa-3000-0000-0000-000000000001',
  null, null, 'Pedido do Bruno', '{}', 'c3000000-0000-0000-0000-000000000003')), true);
select set_config('request.jwt.claim.sub', '63000000-0000-0000-0000-000000000005', true);
select set_config('t.conv_e', (select conversation_id::text from public.start_agent_run('aaaaaaaa-3000-0000-0000-000000000001',
  null, null, 'Pedido da Eva', '{}', 'c3000000-0000-0000-0000-000000000004')), true);
reset role;
update public.workspace_memberships set active = false
  where user_id = '63000000-0000-0000-0000-000000000005';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- A lista é de quem começou a Conversa, com o primeiro pedido e sem nome.
select set_config('request.jwt.claim.sub', '63000000-0000-0000-0000-000000000001', true);
select is(
  (select count(*)::int from public.list_named_agent_conversations('aaaaaaaa-3000-0000-0000-000000000001')),
  2, 'a Ana lista só as duas Conversas dela');
select is(
  (select first_request from public.list_named_agent_conversations('aaaaaaaa-3000-0000-0000-000000000001')
   where id = current_setting('t.conv_a1')::uuid),
  'Montem o ICP e as Personas', 'sem nome, a lista traz o primeiro pedido para mostrar');
select is(
  (select title from public.list_named_agent_conversations('aaaaaaaa-3000-0000-0000-000000000001')
   where id = current_setting('t.conv_a1')::uuid),
  null, 'a Conversa nasce sem nome');

-- Renomear.
select lives_ok(
  $$select public.rename_agent_conversation(current_setting('t.conv_a1')::uuid, '  ICP da Norte  ')$$,
  'a Ana dá nome à Conversa dela');
select is(
  (select title from public.list_named_agent_conversations('aaaaaaaa-3000-0000-0000-000000000001')
   where id = current_setting('t.conv_a1')::uuid),
  'ICP da Norte', 'o nome é guardado sem os espaços das pontas');
select is(
  (select id from public.list_named_agent_conversations('aaaaaaaa-3000-0000-0000-000000000001') limit 1),
  current_setting('t.conv_a2')::uuid, 'renomear não muda a ordem da lista: a mais recente segue no topo');
select throws_ok(
  $$select public.rename_agent_conversation(current_setting('t.conv_a1')::uuid, repeat('a', 81))$$,
  '22023', 'invalid title', 'um nome acima de 80 caracteres é recusado');
select lives_ok(
  $$select public.rename_agent_conversation(current_setting('t.conv_a1')::uuid, '   ')$$,
  'um nome em branco volta ao padrão');
select is(
  (select title from public.list_named_agent_conversations('aaaaaaaa-3000-0000-0000-000000000001')
   where id = current_setting('t.conv_a1')::uuid),
  null, 'e a Conversa volta a não ter nome');

-- A Conversa é privada de quem a começou.
select set_config('request.jwt.claim.sub', '63000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.rename_agent_conversation(current_setting('t.conv_a2')::uuid, 'Do Bruno')$$,
  'P0002', 'conversation not found', 'o Bruno não renomeia a Conversa da Ana');
select is(
  (select array_agg(first_request) from public.list_named_agent_conversations('aaaaaaaa-3000-0000-0000-000000000001')),
  array['Pedido do Bruno'], 'e não a vê na lista dele');

-- Quem saiu do Workspace e quem é de fora não usam nada.
select set_config('request.jwt.claim.sub', '63000000-0000-0000-0000-000000000005', true);
select throws_ok(
  $$select public.rename_agent_conversation(current_setting('t.conv_e')::uuid, 'Depois de sair')$$,
  '42501', 'active workspace membership required', 'quem saiu do Workspace não renomeia');
select throws_ok(
  $$select * from public.list_named_agent_conversations('aaaaaaaa-3000-0000-0000-000000000001')$$,
  '42501', 'active workspace membership required', 'nem lista as Conversas dele');
select set_config('request.jwt.claim.sub', '63000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select * from public.list_named_agent_conversations('aaaaaaaa-3000-0000-0000-000000000001')$$,
  '42501', 'active workspace membership required', 'a Carla, do Sul, não lista nada do Norte');

reset role;
set local role anon;
select throws_ok(
  $$select public.rename_agent_conversation(current_setting('t.conv_a2')::uuid, 'Anônimo')$$,
  '42501', null, 'anon não renomeia');
select throws_ok(
  $$select * from public.list_named_agent_conversations('aaaaaaaa-3000-0000-0000-000000000001')$$,
  '42501', null, 'anon não lista');

select * from finish();
rollback;

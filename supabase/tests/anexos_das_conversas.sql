begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(21);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('6a000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte10.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('6a000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte10.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('6a000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@sul10.com.br', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('aaaaaaaa-a000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('aaaaaaaa-a000-0000-0000-000000000002', 'empresa', 'Sul');

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('aaaaaaaa-a000-0000-0000-000000000001', '6a000000-0000-0000-0000-000000000001', 'member', true),
  ('aaaaaaaa-a000-0000-0000-000000000001', '6a000000-0000-0000-0000-000000000002', 'member', true),
  ('aaaaaaaa-a000-0000-0000-000000000002', '6a000000-0000-0000-0000-000000000003', 'member', true);

select ok((select relrowsecurity from pg_class where oid = 'private.agent_message_attachments'::regclass),
  'a tabela dos anexos tem RLS ligada');
select ok(not has_table_privilege('authenticated', 'private.agent_message_attachments', 'select'),
  'o navegador não lê a tabela dos anexos');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '6a000000-0000-0000-0000-000000000001', true);

select set_config('t.a1', (select attachment_id::text from public.register_agent_attachment(
  'aaaaaaaa-a000-0000-0000-000000000001', 'proposta.pdf', 'application/pdf', 2048, 'Texto da proposta')), true);
select set_config('t.a2', (select attachment_id::text from public.register_agent_attachment(
  'aaaaaaaa-a000-0000-0000-000000000001', '../../foto.png', 'image/png', 1024)), true);

select throws_ok(
  $$select * from public.register_agent_attachment('aaaaaaaa-a000-0000-0000-000000000001', 'v.mp4', 'video/mp4', 10)$$,
  '22023', 'attachment type not supported', 'um tipo fora da lista é recusado');
select throws_ok(
  $$select * from public.register_agent_attachment('aaaaaaaa-a000-0000-0000-000000000001', 'g.pdf', 'application/pdf', 10485761)$$,
  '22023', 'attachment too large', 'acima de 10 MB é recusado');
select throws_ok(
  $$select * from public.register_agent_attachment('aaaaaaaa-a000-0000-0000-000000000002', 'x.pdf', 'application/pdf', 10)$$,
  '42501', null, 'em outro Workspace, não sobe');
select throws_ok(
  $$select public.mark_agent_attachment_stored(current_setting('t.a1')::uuid)$$,
  '42501', null, 'o navegador não marca o arquivo como guardado');
select throws_ok(
  $$select public.reserve_agent_attachments('aaaaaaaa-a000-0000-0000-000000000001', 'cd000000-0000-0000-0000-000000000001',
    array[current_setting('t.a1')::uuid])$$,
  'P0002', 'attachment not found', 'um anexo ainda não guardado não entra no pedido');

reset role;
select public.mark_agent_attachment_stored(current_setting('t.a1')::uuid);
select public.mark_agent_attachment_stored(current_setting('t.a2')::uuid);
select is((select file_name from private.agent_message_attachments where id = current_setting('t.a2')::uuid),
  '.._.._foto.png', 'o nome guardado não tem barras');
select is((select path from private.agent_message_attachments where id = current_setting('t.a1')::uuid),
  'conversas/aaaaaaaa-a000-0000-0000-000000000001/' || current_setting('t.a1') || '/arquivo', 'o caminho nunca usa o nome');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- O Bruno não usa nem abre o anexo da Ana.
select set_config('request.jwt.claim.sub', '6a000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.reserve_agent_attachments('aaaaaaaa-a000-0000-0000-000000000001', 'cd000000-0000-0000-0000-000000000009',
    array[current_setting('t.a1')::uuid])$$,
  'P0002', 'attachment not found', 'o Bruno não põe o anexo da Ana num pedido dele');
select throws_ok(
  $$select public.get_agent_attachment_path(current_setting('t.a1')::uuid)$$,
  'P0002', 'attachment not found', 'o Bruno não abre o anexo da Ana');
select is(public.remove_agent_attachment(current_setting('t.a1')::uuid), false, 'o Bruno não remove o anexo da Ana');

-- A Ana reserva os dois e manda o pedido com o mesmo client_request_id.
select set_config('request.jwt.claim.sub', '6a000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.reserve_agent_attachments('aaaaaaaa-a000-0000-0000-000000000001', 'cd000000-0000-0000-0000-000000000001',
    array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()])$$,
  '22023', 'too many attachments', 'mais de 5 anexos num pedido é recusado');
select is(public.reserve_agent_attachments('aaaaaaaa-a000-0000-0000-000000000001', 'cd000000-0000-0000-0000-000000000001',
  array[current_setting('t.a1')::uuid, current_setting('t.a2')::uuid]), 2, 'a Ana reserva os dois anexos');
select set_config('t.run', (select run_id::text from public.start_agent_run('aaaaaaaa-a000-0000-0000-000000000001',
  null, null, 'Leia a proposta', '{}', 'cd000000-0000-0000-0000-000000000001')), true);

select is((select count(*)::int from public.list_agent_conversation_attachments(
  (select id from public.list_named_agent_conversations('aaaaaaaa-a000-0000-0000-000000000001') limit 1))),
  2, 'a Conversa mostra os dois anexos do pedido');
select is(public.get_agent_attachment_path(current_setting('t.a1')::uuid),
  'conversas/aaaaaaaa-a000-0000-0000-000000000001/' || current_setting('t.a1') || '/arquivo', 'a Ana abre o anexo dela');
select is(public.remove_agent_attachment(current_setting('t.a1')::uuid), false, 'um anexo já enviado não sai pelo composer');

reset role;
select is((select count(*)::int from public.agent_run_attachments(current_setting('t.run')::uuid) where extracted_text = 'Texto da proposta'),
  1, 'o motor lê o texto extraído pela Execução');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Parar.
select set_config('request.jwt.claim.sub', '6a000000-0000-0000-0000-000000000002', true);
select throws_ok($$select public.cancel_agent_run(current_setting('t.run')::uuid)$$, 'P0002', 'run not found',
  'o Bruno não para o pedido da Ana');
select set_config('request.jwt.claim.sub', '6a000000-0000-0000-0000-000000000001', true);
select is(public.cancel_agent_run(current_setting('t.run')::uuid), true, 'a Ana para o pedido dela');
reset role;
select is((select status || ':' || error_code from private.agent_runs where id = current_setting('t.run')::uuid),
  'failed:cancelled', 'o pedido parado fecha como falha cancelled');

select * from finish();
rollback;

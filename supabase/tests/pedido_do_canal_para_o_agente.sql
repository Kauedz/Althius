begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(7);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values
  ('e7e00000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'ana@canal-agente.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('e7e00000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'bia@canal-agente.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values ('e7e10000-0000-4000-8000-000000000001', 'empresa', 'Canal para o agente');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('e7e10000-0000-4000-8000-000000000001', 'e7e00000-0000-4000-8000-000000000001', 'admin', true),
  ('e7e10000-0000-4000-8000-000000000001', 'e7e00000-0000-4000-8000-000000000002', 'admin', true);
insert into private.agent_conversations (id, workspace_id, owner_id, kind, origin) values
  ('e7e20000-0000-4000-8000-000000000001', 'e7e10000-0000-4000-8000-000000000001', 'e7e00000-0000-4000-8000-000000000001', 'coordenada', 'slack'),
  ('e7e20000-0000-4000-8000-000000000002', 'e7e10000-0000-4000-8000-000000000001', 'e7e00000-0000-4000-8000-000000000001', 'coordenada', 'althius');
insert into private.agent_runs (id, workspace_id, conversation_id, requested_by, client_request_id, request_text, trigger_kind) values
  ('e7e30000-0000-4000-8000-000000000001', 'e7e10000-0000-4000-8000-000000000001', 'e7e20000-0000-4000-8000-000000000001',
   'e7e00000-0000-4000-8000-000000000001', gen_random_uuid(), 'Ache 10 empresas de logística no PR', 'canal'),
  ('e7e30000-0000-4000-8000-000000000002', 'e7e10000-0000-4000-8000-000000000001', 'e7e20000-0000-4000-8000-000000000002',
   'e7e00000-0000-4000-8000-000000000001', gen_random_uuid(), 'Pedido do app', 'conversa');

select ok(not has_function_privilege('anon', 'public.get_my_channel_request(uuid)', 'execute'), 'anon não lê pedido de Canal');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e7e00000-0000-4000-8000-000000000001', true);
select results_eq(
  $$select request_text, origin from public.get_my_channel_request('e7e30000-0000-4000-8000-000000000001')$$,
  $$values ('Ache 10 empresas de logística no PR'::text, 'slack'::text)$$,
  'quem pediu pelo Canal lê o texto e a origem');
select throws_ok($$select * from public.get_my_channel_request('e7e30000-0000-4000-8000-000000000002')$$, 'P0002', null,
  'pedido feito no app não é pedido de Canal');
select throws_ok($$select * from public.get_my_channel_request('e7e30000-0000-4000-8000-000000000009')$$, 'P0002', null,
  'Execução que não existe');

select set_config('request.jwt.claim.sub', 'e7e00000-0000-4000-8000-000000000002', true);
select throws_ok($$select * from public.get_my_channel_request('e7e30000-0000-4000-8000-000000000001')$$, 'P0002', null,
  'outra pessoa do Workspace não lê o pedido de quem pediu');

reset role;
update public.workspace_memberships set active = false
where workspace_id = 'e7e10000-0000-4000-8000-000000000001' and user_id = 'e7e00000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e7e00000-0000-4000-8000-000000000001', true);
select throws_ok($$select * from public.get_my_channel_request('e7e30000-0000-4000-8000-000000000001')$$, null, null,
  'quem saiu do Workspace não lê mais');
reset role;
select is((select count(*)::int from private.agent_runs where id = 'e7e30000-0000-4000-8000-000000000001' and status = 'queued'), 1,
  'ler não muda a Execução');

select * from finish();
rollback;

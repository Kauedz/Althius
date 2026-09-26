begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(16);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'sender-owner@example.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'sender-peer@example.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'sender-admin@example.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('20000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'sender-outsider@example.test', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces(id, kind, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'empresa', 'Workspace da empresa'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'empresa', 'Workspace da empresa');

insert into public.workspace_memberships(workspace_id, user_id, role, active) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000001', 'member', true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000002', 'member', true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000003', 'admin', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '10000000-0000-0000-0000-000000000001', 'member', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '20000000-0000-0000-0000-000000000001', 'admin', true);

create temporary table created_sender_attempt(id uuid);
create temporary table created_sender_account(id uuid);
create temporary table created_reconnect_attempt(id uuid);
grant insert, select on created_sender_attempt, created_sender_account, created_reconnect_attempt
  to authenticated, service_role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
insert into created_sender_attempt
select attempt_id from public.create_sender_connection_attempt(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'email', null
);
select is((select count(*)::int from created_sender_attempt), 1,
  'active Workspace member starts a new email connection attempt');
select is((select count(*)::int from public.list_owned_sender_accounts(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')), 0,
  'new account is not reported as connected before hosted auth callback');

reset role;
set local role service_role;
select is(public.complete_sender_connection_attempt(
  (select id from created_sender_attempt), 'unipile-google-account-1', 'GOOGLE', 'CREATION_SUCCESS'
), 'completed', 'verified callback links the expected email provider to its initiator');
-- Nenhum papel da API lê o schema private; o id da Conta remetente é buscado como dono do banco.
reset role;
insert into created_sender_account
select id from private.sender_accounts where unipile_account_id = 'unipile-google-account-1';
set local role service_role;
select is(public.apply_unipile_sender_status('unipile-google-account-1', 'SYNC_SUCCESS'), true,
  'v1 sync success marks the account ready');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select is((select status from public.list_owned_sender_accounts(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')), 'ready',
  'owner sees the private sender account lifecycle state');
select throws_ok(
  $$select * from public.get_owned_sender_account_for_disconnect(
    (select id from created_sender_account),
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  )$$,
  '42501', 'sender account not found or not owned by active user',
  'owner cannot use the account through a different Workspace'
);
insert into created_reconnect_attempt
select attempt_id from public.create_sender_connection_attempt(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'email', (select id from created_sender_account)
);
reset role;
set local role service_role;
select is(public.complete_sender_connection_attempt(
  (select id from created_reconnect_attempt), 'unipile-google-account-1', 'GOOGLE', 'RECONNECTED'
), 'completed', 'reconnection preserves the existing Unipile identity');
select is(public.apply_unipile_sender_status('unipile-google-account-1', 'SYNC_SUCCESS'), true,
  'completed provider sync is accepted during reconnection');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select is((select status from public.list_owned_sender_accounts(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')), 'syncing',
  'reconnection remains gated while the missed-message reconciliation is pending');
select is((select reconciliation_required from public.list_owned_sender_accounts(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')), true,
  'reconnection cannot clear its reconciliation gate from a lifecycle event alone');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select is((select count(*)::int from public.list_owned_sender_accounts(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')), 0,
  'another Workspace member cannot see the owner sender account');
select throws_ok(
  $$select * from public.create_sender_connection_attempt(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'email', 'ffffffff-ffff-ffff-ffff-ffffffffffff'
  )$$,
  '42501', 'sender account not found or not owned by active user',
  'another member cannot reconnect the owner sender account'
);
select throws_ok(
  $$select count(*) from private.sender_accounts$$,
  '42501', 'permission denied for schema private',
  'sender account records are not readable through direct client queries'
);
select throws_ok(
  $$select public.complete_sender_connection_attempt(
    'ffffffff-ffff-ffff-ffff-ffffffffffff', 'unipile-google-account-2', 'GOOGLE', 'CREATION_SUCCESS'
  )$$,
  '42501', 'permission denied for function complete_sender_connection_attempt',
  'authenticated members cannot forge hosted auth callbacks'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select is((select count(*)::int from public.list_owned_sender_accounts(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')), 0,
  'Workspace administrator cannot inspect another member sender account');

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select * from public.list_owned_sender_accounts('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$,
  '42501', 'active workspace membership required',
  'another Workspace cannot query sender account state'
);

select * from finish();
rollback;

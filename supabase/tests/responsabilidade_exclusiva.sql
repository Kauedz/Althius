begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(12);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner@example.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'member@example.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'admin@example.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('20000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'other-workspace@example.test', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces(id, kind, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'empresa', 'Workspace da empresa'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'empresa', 'Workspace da empresa');

insert into public.workspace_memberships(workspace_id, user_id, role, active) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000001', 'member', true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000002', 'member', true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000003', 'admin', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '20000000-0000-0000-0000-000000000001', 'admin', true);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
-- A Sequência é de uma Conta-alvo real (CRM-17), sob a responsabilidade de quem a cadastrou.
create temporary table conta_alvo on commit drop as
  select id from public.save_target_account('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Empresa Alvo', 'https://empresa-alvo.test');
select lives_ok(
  $$select public.create_sequence('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', (select id::text from conta_alvo), '{"steps":[{"canal":"email","body":"private"}]}'::jsonb, '{"status":"ativa"}'::jsonb)$$,
  'active owner creates the sequence'
);

select is((select count(*)::int from public.sequences where target_account_id = (select id::text from conta_alvo)), 1,
  'only one sequence exists for the target');
select is((select count(*)::int from public.sales_responsibilities where target_account_id = (select id::text from conta_alvo)), 1,
  'only one seller owns the target');
select is((select count(*)::int from public.sequences where target_account_id = (select id::text from conta_alvo) and public_summary = '{"status":"ativa"}'::jsonb), 1,
  'public projection contains the safe summary');
select is((select count(*)::int from information_schema.columns where table_schema = 'public' and table_name = 'sequences' and column_name = 'private_document'), 0,
  'private document is not in public relation');
select lives_ok(
  $$select public.update_owned_sequence((select id from public.sequences where target_account_id = (select id::text from conta_alvo)), '{"steps":[{"canal":"email","body":"updated"}]}'::jsonb, null, null)$$,
  'active owner can update the sequence'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.create_sequence('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', (select id::text from conta_alvo), '{}'::jsonb, '{}'::jsonb)$$,
  '42501', 'target account already has another responsible seller',
  'another member cannot take over the target'
);
select throws_ok(
  $$select public.update_owned_sequence((select id from public.sequences where target_account_id = (select id::text from conta_alvo)), '{"steps":[]}'::jsonb, null, 'pausada')$$,
  '42501', 'sequence not found or not owned by active user',
  'another member cannot mutate the sequence'
);
select throws_ok(
  $$select count(*) from private.sequence_documents$$,
  '42501', 'permission denied for schema private',
  'another member cannot read private documents'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.create_sequence('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', (select id::text from conta_alvo), '{}'::jsonb, '{}'::jsonb)$$,
  '42501', 'target account already has another responsible seller',
  'workspace admin cannot take over the target'
);
select throws_ok(
  $$select count(*) from private.sequence_documents$$,
  '42501', 'permission denied for schema private',
  'workspace admin cannot read private documents'
);

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select is((select count(*)::int from public.sequences where target_account_id = (select id::text from conta_alvo)), 0,
  'a different workspace cannot read the public summary');

select * from finish();
rollback;

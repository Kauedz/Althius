begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(9);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values
  ('d0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'admin@ca04.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('d0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'membro@ca04.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values ('d1000000-0000-0000-0000-000000000001', 'empresa', 'Workspace CA04');
insert into private.workspace_contracts (workspace_id, tier_id, starts_at)
  values ('d1000000-0000-0000-0000-000000000001', 'escala', date_trunc('month', now())) on conflict (workspace_id) do nothing;
select col_default_is('private', 'whatsapp_channel_settings', 'ever_enabled', 'false', 'ever_enabled defaults to false');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'admin', true),
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'member', true);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000002', true);
select is((select state from public.whatsapp_channel_status('d1000000-0000-0000-0000-000000000001')), 'nao_habilitado', 'member sees WhatsApp disabled');
select throws_ok($$select public.set_whatsapp_channel_enabled('d1000000-0000-0000-0000-000000000001', true)$$, '42501', null,
  'member cannot enable the channel');
select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000001', true);
select is(public.set_whatsapp_channel_enabled('d1000000-0000-0000-0000-000000000001', true), true, 'admin enables WhatsApp');
select is((select state from public.whatsapp_channel_status('d1000000-0000-0000-0000-000000000001')), 'ativo', 'member-visible state is active');
reset role;
select is((select count(*)::int from private.agent_settings s join private.agents a on a.id = s.agent_id
  where a.workspace_id = 'd1000000-0000-0000-0000-000000000001' and a.kind = 'padrao' and 'whatsapp' = any(s.channels)),
  4, 'all default agents include WhatsApp');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000001', true);
select is(public.set_whatsapp_channel_enabled('d1000000-0000-0000-0000-000000000001', false), false, 'admin withdraws WhatsApp');
select is((select state from public.whatsapp_channel_status('d1000000-0000-0000-0000-000000000001')), 'retirado', 'withdrawal keeps a distinct state');
reset role;
select is((select count(*)::int from private.agent_settings s join private.agents a on a.id = s.agent_id
  where a.workspace_id = 'd1000000-0000-0000-0000-000000000001' and a.kind = 'padrao' and 'whatsapp' = any(s.channels)),
  4, 'withdrawal preserves agent channel settings');

select * from finish();
rollback;

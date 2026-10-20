begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(3);

-- Usuários: Ana (Admin Norte), Bruno (Membro Norte), Carla (Admin Sul), Diego (sem participação).
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('50000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.com.br', '', now(), now(), now(), '{}', '{"full_name":"Ana Lima"}', false, false),
  ('50000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.com.br', '', now(), now(), now(), '{}', '{"full_name":"Bruno Reis"}', false, false),
  ('50000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@sul.com.br', '', now(), now(), now(), '{}', '{"full_name":"Carla Dias"}', false, false),
  ('50000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'diego@fora.com.br', '', now(), now(), now(), '{}', '{"full_name":"Diego Silva"}', false, false);

insert into public.workspaces (id, kind, name) values
  ('ee000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('ee000000-0000-0000-0000-000000000002', 'empresa', 'Sul');

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('ee000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'admin', true),
  ('ee000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 'member', true),
  ('ee000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000003', 'admin', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);
select is((select array_agg(id order by id) from public.list_workspace_integrations('ee000000-0000-0000-0000-000000000001')), array['hubspot', 'notion']::text[], 'Conexões lista somente HubSpot e Notion');
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000002', true);
select is((select array_agg(id order by id) from public.list_workspace_integrations('ee000000-0000-0000-0000-000000000001')), array['hubspot', 'notion']::text[], 'Membro também vê somente HubSpot e Notion');
reset role;
select is((select array_agg(id order by id) from private.integration_catalog where not available), array['apollo', 'bitrix24', 'calendly', 'clay', 'google-ads', 'google-calendar', 'google-sheets', 'lusha', 'make', 'meta-ads', 'pipedrive', 'rd-station', 'salesforce', 'slack', 'tiktok-ads', 'zapier', 'zoho-crm']::text[], 'Integrações ocultas continuam no catálogo para preservar suas referências (Make e Zapier entraram ocultos em 20261104135000)');
select * from finish();
rollback;

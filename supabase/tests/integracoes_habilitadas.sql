begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(17);

-- Workspace da empresa com Ana (Administradora), Beto (Membro) e Dora (Participação removida).
-- Caio administra só outro Workspace.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('70000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('70000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'beto@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('70000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'caio@outro.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('70000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'dora@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('71000000-0000-0000-0000-000000000001', 'empresa', 'Cliente'),
  ('71000000-0000-0000-0000-000000000002', 'empresa', 'Outro');

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'admin', true),
  ('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', 'member', true),
  ('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000004', 'member', false),
  ('71000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000003', 'admin', true);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- O catálogo de Conexões é o mesmo para todo Workspace.
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000002', true);
select set_eq(
  $$select id from public.connection_catalog where kind = 'canal'$$,
  array['slack', 'whatsapp', 'teams', 'email'],
  'o catálogo tem os quatro Canais');
select is_empty(
  $$select id from public.connection_catalog where kind = 'canal' and available$$,
  'nenhum Canal está disponível: todos aparecem Em breve');
select set_eq(
  $$select id from public.connection_catalog where kind = 'integracao' and available$$,
  array['hubspot', 'notion'],
  'só HubSpot e Notion estão disponíveis para habilitar');
select is(
  (select category from public.connection_catalog where id = 'hubspot'), 'CRM',
  'uma Integração tem categoria');

-- Beto (Membro) não habilita.
select throws_ok(
  $$select public.enable_integration('71000000-0000-0000-0000-000000000001', 'hubspot')$$,
  '42501', 'only an admin can enable an integration', 'um Membro não habilita uma Integração');

-- Ana (Administradora) habilita o HubSpot, e repetir não muda quem habilitou.
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000001', true);
select is(
  (select enabled_by from public.enable_integration('71000000-0000-0000-0000-000000000001', 'hubspot')),
  '70000000-0000-0000-0000-000000000001'::uuid, 'a Administradora habilita o HubSpot no Workspace');
select is(
  (select count(*)::int from public.enable_integration('71000000-0000-0000-0000-000000000001', 'hubspot')), 1,
  'habilitar de novo devolve a mesma habilitação');
select is(
  (select count(*)::int from public.workspace_integrations), 1, 'habilitar de novo não cria outra linha');
select throws_ok(
  $$select public.enable_integration('71000000-0000-0000-0000-000000000001', 'slack')$$,
  '22023', 'connection not available', 'um Canal não se habilita como Integração');
select throws_ok(
  $$select public.enable_integration('71000000-0000-0000-0000-000000000001', 'clay')$$,
  '22023', 'connection not available', 'uma Integração Em breve não se habilita');
select throws_ok(
  $$insert into public.workspace_integrations (workspace_id, integration_id, enabled_by)
    values ('71000000-0000-0000-0000-000000000001', 'notion', '70000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'o cliente não habilita por fora do backend');
select throws_ok(
  $$update public.connection_catalog set available = true where id = 'clay'$$,
  '42501', null, 'o cliente não altera o catálogo');

-- Beto (Membro ativo) vê a habilitação; Dora (Participação removida) não vê nem habilita.
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000002', true);
select is(
  (select integration_id from public.workspace_integrations
   where workspace_id = '71000000-0000-0000-0000-000000000001'), 'hubspot',
  'um Membro ativo vê as Integrações habilitadas do Workspace');
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000004', true);
select is_empty($$select * from public.workspace_integrations$$,
  'uma Participação removida não vê as Integrações habilitadas');

-- Caio não vê nem habilita no Workspace de outro, e habilita no próprio.
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.enable_integration('71000000-0000-0000-0000-000000000001', 'notion')$$,
  '42501', 'only an admin can enable an integration', 'ninguém habilita no Workspace de outro');
select lives_ok(
  $$select public.enable_integration('71000000-0000-0000-0000-000000000002', 'notion')$$,
  'um Administrador habilita no próprio Workspace');
select set_eq(
  $$select workspace_id::text || ':' || integration_id from public.workspace_integrations$$,
  array['71000000-0000-0000-0000-000000000002:notion'],
  'cada Workspace vê só as próprias habilitações');

select * from finish();
rollback;

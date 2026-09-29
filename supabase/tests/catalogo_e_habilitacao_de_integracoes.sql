begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(24);

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

-- 1. Anônimo não lista nem habilita.
set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok(
  $$select * from public.list_workspace_integrations('ee000000-0000-0000-0000-000000000001')$$,
  '42501', 'authentication required',
  'anônimo não lista integrações do workspace'
);
select throws_ok(
  $$select public.enable_workspace_integration('ee000000-0000-0000-0000-000000000001', 'hubspot')$$,
  '42501', 'authentication required',
  'anônimo não habilita integração'
);

-- 2. Autenticado sem participação no Workspace Norte não lista nem habilita.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000004', true);
select throws_ok(
  $$select * from public.list_workspace_integrations('ee000000-0000-0000-0000-000000000001')$$,
  '42501', 'active workspace membership required',
  'usuário sem participação ativa não lista integrações'
);
select throws_ok(
  $$select public.enable_workspace_integration('ee000000-0000-0000-0000-000000000001', 'hubspot')$$,
  '42501', 'active workspace membership required',
  'usuário sem participação ativa não habilita integração'
);

-- 3. Membro ativo (Bruno) pode listar o catálogo no seu Workspace.
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000002', true);

select is(
  (select count(*)::integer from public.list_workspace_integrations('ee000000-0000-0000-0000-000000000001')),
  7,
  'membro lista as 7 integrações do catálogo'
);

select is(
  (select status from public.list_workspace_integrations('ee000000-0000-0000-0000-000000000001') where id = 'hubspot'),
  'nao_habilitada',
  'HubSpot nasce como não habilitada'
);

select is(
  (select status from public.list_workspace_integrations('ee000000-0000-0000-0000-000000000001') where id = 'notion'),
  'nao_habilitada',
  'Notion nasce como não habilitada'
);

select is(
  (select status from public.list_workspace_integrations('ee000000-0000-0000-0000-000000000001') where id = 'clay'),
  'em_breve',
  'Clay tem status em_breve'
);

-- 4. Membro ativo (Bruno) NÃO pode habilitar integração.
select throws_ok(
  $$select public.enable_workspace_integration('ee000000-0000-0000-0000-000000000001', 'hubspot')$$,
  '42501', 'only administrators can enable integrations',
  'membro não consegue habilitar integração por chamada direta'
);

-- 5. Membro não consegue inserir diretamente na tabela public.workspace_integrations (RLS/permissões).
select throws_ok(
  $$insert into public.workspace_integrations (workspace_id, integration_id, enabled_by) values ('ee000000-0000-0000-0000-000000000001', 'hubspot', '50000000-0000-0000-0000-000000000002')$$,
  '42501', null,
  'membro não consegue inserir diretamente em public.workspace_integrations'
);

-- 6. Administradora ativa (Ana) no Workspace Norte.
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);

-- Tentativa de habilitar integração que não existe.
select throws_ok(
  $$select public.enable_workspace_integration('ee000000-0000-0000-0000-000000000001', 'inexistente')$$,
  '22023', 'integration not found',
  'recusa integração que não existe no catálogo'
);

-- Tentativa de habilitar integração em_breve.
select throws_ok(
  $$select public.enable_workspace_integration('ee000000-0000-0000-0000-000000000001', 'clay')$$,
  '22023', 'integration is not available for enablement',
  'recusa habilitar integração que ainda está em breve'
);

-- Habilita HubSpot com sucesso.
select lives_ok(
  $$select public.enable_workspace_integration('ee000000-0000-0000-0000-000000000001', 'hubspot')$$,
  'administrador habilita HubSpot com sucesso'
);

select is(
  (select status from public.list_workspace_integrations('ee000000-0000-0000-0000-000000000001') where id = 'hubspot'),
  'habilitada',
  'HubSpot passa para o status habilitada'
);

select is(
  (select enabled_by from public.list_workspace_integrations('ee000000-0000-0000-0000-000000000001') where id = 'hubspot'),
  '50000000-0000-0000-0000-000000000001'::uuid,
  'registra quem habilitou a integração'
);

select ok(
  (select enabled_at is not null from public.list_workspace_integrations('ee000000-0000-0000-0000-000000000001') where id = 'hubspot'),
  'registra quando habilitou a integração'
);

-- Habilitar novamente é idempotente.
select lives_ok(
  $$select public.enable_workspace_integration('ee000000-0000-0000-0000-000000000001', 'hubspot')$$,
  'habilitar novamente é idempotente'
);

-- Habilita Notion.
select lives_ok(
  $$select public.enable_workspace_integration('ee000000-0000-0000-0000-000000000001', 'notion')$$,
  'administrador habilita Notion com sucesso'
);

select is(
  (select status from public.list_workspace_integrations('ee000000-0000-0000-0000-000000000001') where id = 'notion'),
  'habilitada',
  'Notion passa para o status habilitada'
);

-- 7. Membro (Bruno) lê as integrações habilitadas pelo RLS.
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000002', true);

select is(
  (select status from public.list_workspace_integrations('ee000000-0000-0000-0000-000000000001') where id = 'hubspot'),
  'habilitada',
  'membro vê HubSpot habilitada'
);

select is(
  (select count(*)::integer from public.workspace_integrations where workspace_id = 'ee000000-0000-0000-0000-000000000001'),
  2,
  'membro lê exatamente as integrações habilitadas do próprio workspace via select com RLS'
);

-- 8. Isolamento entre Workspaces (Sul não vê integrações do Norte).
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000003', true);

select is(
  (select status from public.list_workspace_integrations('ee000000-0000-0000-0000-000000000002') where id = 'hubspot'),
  'nao_habilitada',
  'no Workspace Sul, HubSpot permanece não habilitada'
);

select is(
  (select count(*)::integer from public.workspace_integrations where workspace_id = 'ee000000-0000-0000-0000-000000000001'),
  0,
  'participante do Workspace Sul não vê linhas do Workspace Norte em public.workspace_integrations (RLS)'
);

select is(
  (select count(*)::integer from public.workspace_integrations where workspace_id = 'ee000000-0000-0000-0000-000000000002'),
  0,
  'Workspace Sul tem zero integrações habilitadas'
);

rollback;

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(11);

-- Onde não há Vault (o Postgres puro do pgtap-local.sh), um esqueleto do que a migration usa dele; no Supabase e no CI o
-- Vault de verdade vale.
do $vault$
begin
  if to_regnamespace('vault') is null then
    create schema vault;
    create table vault.secrets (
      id uuid primary key default gen_random_uuid(),
      name text unique,
      secret text not null,
      created_at timestamptz not null default now()
    );
    create view vault.decrypted_secrets as select id, name, secret, secret as decrypted_secret from vault.secrets;
    create function vault.create_secret(new_secret text, new_name text default null)
    returns uuid language sql as 'insert into vault.secrets (name, secret) values (new_name, new_secret) returning id';
    create function vault.update_secret(secret_id uuid, new_secret text default null, new_name text default null)
    returns void language sql as 'update vault.secrets set secret = coalesce(new_secret, secret), name = coalesce(new_name, name) where id = secret_id';
  end if;
end
$vault$;

-- Ana (Admin) e Bruno (Membro) do Norte; Diego (Membro, depois desativado) do Norte; Carla (Admin) do Sul.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('5a000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5a000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5a000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'diego@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5a000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'carla@sul.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('fa000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('fa000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 'admin', true),
  ('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000002', 'member', true),
  ('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000003', 'member', true),
  ('fa000000-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-000000000004', 'admin', true);

create temporary table guardado (k text primary key, v text) on commit drop;
grant all on guardado to anon, authenticated, service_role;


set local role authenticated;
select set_config('request.jwt.claim.sub', '5a000000-0000-0000-0000-000000000001', true);
select public.enable_workspace_integration('fa000000-0000-0000-0000-000000000001', 'hubspot');
select public.enable_workspace_integration('fa000000-0000-0000-0000-000000000001', 'notion');
set local role service_role;
select public.save_integration_api_key('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 'hubspot', 'token-admin-31', 'Ana', 'portal-31');
select public.save_integration_api_key('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000002', 'hubspot', 'token-membro-31', 'Bruno', 'portal-31');
insert into guardado select 'pendente', state from public.start_integration_connect('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000002', 'hubspot', 'https://mcp.hubspot.com', 'https://x.test/cb', 'https://mcp.hubspot.com/oauth/v3/token', 'cid-hubspot', null, null);
insert into guardado select 'notion', state from public.start_integration_connect('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 'notion', 'https://mcp.notion.com', 'https://x.test/cb', 'https://mcp.notion.com/token', 'cid-notion', null, null);
select public.complete_integration_connect((select v from guardado where k = 'notion'), 'token-notion-31', 'refresh-notion-31', 1800, 'Ana', null, null);
set local role authenticated;
select set_config('request.jwt.claim.sub', '5a000000-0000-0000-0000-000000000002', true);
select throws_ok($$select public.disable_workspace_integration('fa000000-0000-0000-0000-000000000001', 'hubspot')$$, '42501', 'only administrators can enable integrations', 'Membro não desabilita por RPC');
reset role;
insert into public.workspace_memberships (workspace_id, user_id, role, active) values ('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000004', 'admin', true);
update public.workspace_memberships set active = false where workspace_id = 'fa000000-0000-0000-0000-000000000001' and user_id = '5a000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '5a000000-0000-0000-0000-000000000001', true);
select throws_ok($$select public.disable_workspace_integration('fa000000-0000-0000-0000-000000000001', 'hubspot')$$, '42501', 'active workspace membership required', 'Administrador sem Participação ativa é recusado');
reset role;
update public.workspace_memberships set active = true where workspace_id = 'fa000000-0000-0000-0000-000000000001' and user_id = '5a000000-0000-0000-0000-000000000001';
set local role authenticated;
select is(public.disable_workspace_integration('fa000000-0000-0000-0000-000000000001', 'hubspot'), 2, 'Administrador desconecta os dois participantes');
select is((select status from public.list_workspace_integrations('fa000000-0000-0000-0000-000000000001') where id = 'hubspot'), 'nao_habilitada', 'HubSpot volta a não habilitada');
reset role;
select is((select count(*)::integer from private.integration_accesses where workspace_id = 'fa000000-0000-0000-0000-000000000001' and integration_id = 'hubspot'), 0, 'Todos os Acessos ao HubSpot somem');
select is((select count(*)::integer from vault.decrypted_secrets where decrypted_secret like '%token-admin-31%' or decrypted_secret like '%token-membro-31%'), 0, 'Segredos dos dois participantes somem do Vault');
select is((select count(*)::integer from private.integration_connect_attempts where state = (select v from guardado where k = 'pendente')), 0, 'Tentativa OAuth pendente é cancelada');
select is((select count(*)::integer from public.workspace_integrations where workspace_id = 'fa000000-0000-0000-0000-000000000001' and integration_id = 'notion'), 1, 'Notion permanece habilitado');
select is((select count(*)::integer from private.integration_accesses where workspace_id = 'fa000000-0000-0000-0000-000000000001' and integration_id = 'notion'), 1, 'Acesso ao Notion permanece');
select is((select count(*)::integer from vault.decrypted_secrets where decrypted_secret like '%token-notion-31%'), 1, 'Segredo do Notion permanece');
select ok(not has_function_privilege('anon', 'public.disable_workspace_integration(uuid,text)', 'execute'), 'Anônimo não executa a RPC');
select * from finish();
rollback;

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(10);

do $vault$
begin
  if to_regnamespace('vault') is null then
    create schema vault;
    create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, secret text not null, created_at timestamptz not null default now());
    create view vault.decrypted_secrets as select id, name, secret, secret as decrypted_secret from vault.secrets;
    create function vault.create_secret(new_secret text, new_name text default null) returns uuid language sql as 'insert into vault.secrets (name, secret) values (new_name, new_secret) returning id';
    create function vault.update_secret(secret_id uuid, new_secret text default null, new_name text default null) returns void language sql as 'update vault.secrets set secret = coalesce(new_secret, secret), name = coalesce(new_name, name) where id = secret_id';
  end if;
end
$vault$;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values
 ('5f320000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'admin@test', '', now(), now(), now(), '{}', '{}', false, false),
 ('5f320000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'member@test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values ('ff320000-0000-0000-0000-000000000001', 'empresa', 'Teste');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
 ('ff320000-0000-0000-0000-000000000001', '5f320000-0000-0000-0000-000000000001', 'admin', true),
 ('ff320000-0000-0000-0000-000000000001', '5f320000-0000-0000-0000-000000000002', 'member', true);
set local role authenticated;
select set_config('request.jwt.claim.sub', '5f320000-0000-0000-0000-000000000001', true);
select public.enable_workspace_integration('ff320000-0000-0000-0000-000000000001', 'hubspot');
set local role service_role;
select public.save_integration_api_key('ff320000-0000-0000-0000-000000000001', '5f320000-0000-0000-0000-000000000001', 'hubspot', 'token-admin-32', 'Ana', 'portal-32');
select public.save_integration_api_key('ff320000-0000-0000-0000-000000000001', '5f320000-0000-0000-0000-000000000002', 'hubspot', 'token-membro-32', 'Bia', 'portal-32');
select is((select count(*)::integer from public.integration_accesses_for_revocation('ff320000-0000-0000-0000-000000000001', '5f320000-0000-0000-0000-000000000001', 'hubspot')), 2, 'Administrador ativo lista os Acessos no servidor');
select throws_ok($$select * from public.integration_accesses_for_revocation('ff320000-0000-0000-0000-000000000001', '5f320000-0000-0000-0000-000000000002', 'hubspot')$$, '42501', 'only administrators can enable integrations', 'Membro não lista segredos para retirada');
select is(public.disable_workspace_integration_with_revocation_results(
 'ff320000-0000-0000-0000-000000000001', '5f320000-0000-0000-0000-000000000001', 'hubspot',
 '[{"user_id":"5f320000-0000-0000-0000-000000000001","result":"falhou"},{"user_id":"5f320000-0000-0000-0000-000000000002","result":"nao_suportado"}]'::jsonb
), 2, 'retirada remove os dois Acessos mesmo com revogação sem suporte ou falha');
reset role;
select is((select count(*)::integer from private.integration_revocation_results where workspace_id = 'ff320000-0000-0000-0000-000000000001' and result in ('falhou', 'nao_suportado')), 2, 'resultado da revogação fica registrado sem tokens');
select is((select count(*)::integer from public.workspace_integrations where workspace_id = 'ff320000-0000-0000-0000-000000000001'), 0, 'retirada remove a habilitação');
select is((select count(*)::integer from vault.decrypted_secrets where decrypted_secret like '%token-admin-32%' or decrypted_secret like '%token-membro-32%'), 0, 'segredos dos Acessos removidos do Vault');
select ok(not has_function_privilege('authenticated', 'public.disable_workspace_integration_with_revocation_results(uuid,uuid,text,jsonb)', 'execute'), 'rota de serviço não pode ser chamada diretamente');
select ok(not has_function_privilege('authenticated', 'public.disable_workspace_integration(uuid,text)', 'execute'), 'RPC antiga não permite contornar revogação');
set local role authenticated;
select set_config('request.jwt.claim.sub', '5f320000-0000-0000-0000-000000000001', true);
select is((select count(*)::integer from public.integration_revocation_results_for_user('ff320000-0000-0000-0000-000000000001', '5f320000-0000-0000-0000-000000000001') where result = 'falhou'), 1, 'a pessoa consulta o próprio resultado depois da retirada');
select throws_ok($$select * from public.integration_revocation_results_for_user('ff320000-0000-0000-0000-000000000001', '5f320000-0000-0000-0000-000000000002')$$, '42501', 'not allowed', 'a pessoa não consulta o resultado de outro participante');
select * from finish();
rollback;

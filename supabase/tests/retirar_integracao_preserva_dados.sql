begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(6);

-- Retirar uma Integração do Workspace (conexoes-funcionais 07) apaga os Acessos dela e nada do trabalho comercial: as
-- Contas-alvo, os Contatos, os Vínculos e as Interações continuam (spec de Conexões, "Retirar uma Integração").

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

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values ('5e070000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values ('fe070000-0000-0000-0000-000000000001', 'empresa', 'Norte');
insert into public.workspace_memberships (workspace_id, user_id, role, active)
values ('fe070000-0000-0000-0000-000000000001', '5e070000-0000-0000-0000-000000000001', 'admin', true);

-- O trabalho comercial do Workspace: uma Conta-alvo, um Contato com Vínculo e uma Interação.
insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, created_by)
values ('a7070000-0000-0000-0000-000000000001', 'fe070000-0000-0000-0000-000000000001', 'Alfa', 'https://alfa.test', 'alfa.test',
        '5e070000-0000-0000-0000-000000000001');
insert into public.contacts (id, workspace_id, name, created_by)
values ('c7070000-0000-0000-0000-000000000001', 'fe070000-0000-0000-0000-000000000001', 'Bia Alfa', '5e070000-0000-0000-0000-000000000001');
insert into public.contact_account_links (workspace_id, contact_id, target_account_id, created_by)
values ('fe070000-0000-0000-0000-000000000001', 'c7070000-0000-0000-0000-000000000001', 'a7070000-0000-0000-0000-000000000001',
        '5e070000-0000-0000-0000-000000000001');
insert into public.account_interactions (workspace_id, target_account_id, kind, recorded_by)
values ('fe070000-0000-0000-0000-000000000001', 'a7070000-0000-0000-0000-000000000001', 'reuniao', '5e070000-0000-0000-0000-000000000001');

-- A Ana habilita o HubSpot e conecta o próprio Acesso.
set local role authenticated;
select set_config('request.jwt.claim.sub', '5e070000-0000-0000-0000-000000000001', true);
select public.enable_workspace_integration('fe070000-0000-0000-0000-000000000001', 'hubspot');
set local role service_role;
select public.save_integration_api_key('fe070000-0000-0000-0000-000000000001', '5e070000-0000-0000-0000-000000000001', 'hubspot', 'token-ana-07', 'Ana', 'portal-07');

-- Ela retira o HubSpot.
set local role authenticated;
select public.disable_workspace_integration('fe070000-0000-0000-0000-000000000001', 'hubspot');
reset role;

select is((select count(*)::integer from private.integration_accesses where workspace_id = 'fe070000-0000-0000-0000-000000000001'), 0,
  'retirar apaga os Acessos da Integração');
select is((select count(*)::integer from public.workspace_integrations where workspace_id = 'fe070000-0000-0000-0000-000000000001'), 0,
  'retirar apaga a habilitação, com o portal fixado');
select is((select count(*)::integer from public.target_accounts where workspace_id = 'fe070000-0000-0000-0000-000000000001'), 1,
  'a Conta-alvo continua');
select is((select count(*)::integer from public.contacts where workspace_id = 'fe070000-0000-0000-0000-000000000001'), 1,
  'o Contato continua');
select is((select count(*)::integer from public.contact_account_links where workspace_id = 'fe070000-0000-0000-0000-000000000001'), 1,
  'o Vínculo do Contato continua');
select is((select count(*)::integer from public.account_interactions where workspace_id = 'fe070000-0000-0000-0000-000000000001'), 1,
  'a Interação continua');

select * from finish();
rollback;

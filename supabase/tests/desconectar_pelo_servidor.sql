begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(9);

-- Onde não há Vault (Postgres puro), o mesmo esqueleto de acessos_as_integracoes.sql; no Supabase e no CI vale o de verdade.
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

-- Ana (Admin) e Bruno (Membro) do Norte; Diego (Membro desativado) do Norte; Carla (Admin) do Sul.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('5d000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5d000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5d000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'diego@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5d000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'carla@sul.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('fd000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('fd000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('fd000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000001', 'admin', true),
  ('fd000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000002', 'member', true),
  ('fd000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000003', 'member', true),
  ('fd000000-0000-0000-0000-000000000002', '5d000000-0000-0000-0000-000000000004', 'admin', true);
insert into public.workspace_integrations (workspace_id, integration_id, enabled_by) values
  ('fd000000-0000-0000-0000-000000000001', 'lusha', '5d000000-0000-0000-0000-000000000001');

-- Ana, Bruno e Diego conectam a própria chave do Lusha; depois a Participação do Diego é desativada.
set local role service_role;
select public.save_integration_api_key('fd000000-0000-0000-0000-000000000001', u, 'lusha', 'chave-' || right(u::text, 1) || '-abcdefgh', null, null)
from unnest(array['5d000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000002', '5d000000-0000-0000-0000-000000000003']::uuid[]) as u;
reset role;
update public.workspace_memberships set active = false
where workspace_id = 'fd000000-0000-0000-0000-000000000001' and user_id = '5d000000-0000-0000-0000-000000000003';
create temporary table segredo_do_bruno on commit drop as
  select secret_name from private.integration_accesses where user_id = '5d000000-0000-0000-0000-000000000002';

-- 1. Só o servidor chama.
select ok(
  has_function_privilege('service_role', 'public.disconnect_integration_access_for_user(uuid, uuid, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.disconnect_integration_access_for_user(uuid, uuid, text)', 'execute')
    and not has_function_privilege('anon', 'public.disconnect_integration_access_for_user(uuid, uuid, text)', 'execute'),
  'desconectar pelo servidor é só da chave de serviço'
);

set local role service_role;
-- 2-4. Apaga só o Acesso do Bruno, e o segredo dele sai do Vault.
select is(
  public.disconnect_integration_access_for_user('fd000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000002', 'lusha'),
  true,
  'o Acesso do Bruno é apagado'
);
select is(
  public.disconnect_integration_access_for_user('fd000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000002', 'lusha'),
  false,
  'desconectar de novo diz que não havia Acesso'
);
reset role;
select is(
  (select array_agg(user_id order by user_id) from private.integration_accesses where workspace_id = 'fd000000-0000-0000-0000-000000000001'),
  array['5d000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000003']::uuid[],
  'os Acessos da Ana e do Diego continuam'
);
select is(
  (select count(*)::integer from vault.secrets s join segredo_do_bruno b on b.secret_name = s.name),
  0,
  'o segredo do Bruno sai do Vault'
);

set local role service_role;
-- 5-6. Quem não participa, ou participa desativado, não apaga nada.
select throws_ok(
  $$select public.disconnect_integration_access_for_user('fd000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000004', 'lusha')$$,
  '42501', 'active workspace membership required',
  'a Carla, do Sul, não desconecta nada no Norte'
);
select throws_ok(
  $$select public.disconnect_integration_access_for_user('fd000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000003', 'lusha')$$,
  '42501', 'active workspace membership required',
  'a Participação desativada não desconecta pelo servidor'
);
-- 7. O que sobrou de uma Integração que não está habilitada ainda sai (não exige a habilitação).
reset role;
insert into private.integration_accesses (workspace_id, user_id, integration_id, kind, secret_name) values
  ('fd000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000001', 'notion', 'oauth_mcp', 'segredo-orfao-notion');
set local role service_role;
select is(
  public.disconnect_integration_access_for_user('fd000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000001', 'notion'),
  true,
  'o Acesso que sobrou de uma Integração não habilitada é apagado'
);
-- 8. E não toca no Acesso da Ana ao Lusha.
reset role;
select is(
  (select count(*)::integer from private.integration_accesses where user_id = '5d000000-0000-0000-0000-000000000001'),
  1,
  'o Acesso da Ana ao Lusha continua'
);

select * from finish();
rollback;

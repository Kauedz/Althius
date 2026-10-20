begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(3);

-- O Lusha conecta pelo OAuth do servidor MCP e pela chave de API (migration 20261104131000, conector-lusha 02).
select is(
  (select kinds from private.integration_connection_profiles where integration_id = 'lusha'),
  array['oauth_mcp', 'api_key']::text[],
  'o Lusha conecta pela autorização no app e pela chave de API'
);
select is(
  (select pins_portal from private.integration_connection_profiles where integration_id = 'lusha'),
  false,
  'o Lusha continua sem portal fixo'
);

-- A recusa que acessos_as_integracoes.sql fazia com o Lusha, agora com uma Integração que continua só por chave de API
-- (o RD Station), liberada e habilitada só dentro deste teste.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values ('5c000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@lusha.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values ('fc000000-0000-0000-0000-000000000001', 'empresa', 'Norte');
insert into public.workspace_memberships (workspace_id, user_id, role, active)
values ('fc000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', 'admin', true);
update private.integration_catalog set available = true where id = 'rd-station';
insert into public.workspace_integrations (workspace_id, integration_id, enabled_by)
values ('fc000000-0000-0000-0000-000000000001', 'rd-station', '5c000000-0000-0000-0000-000000000001');
set local role service_role;
select throws_ok(
  $$select * from public.start_integration_connect('fc000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', 'rd-station', 'https://x.test', 'https://x.test/cb', 'https://x.test/token', 'cid', null, 'https://app.test')$$,
  '22023', 'integration kind not supported',
  'uma Integração só por chave de API não abre tentativa de OAuth'
);
reset role;

select * from finish();
rollback;

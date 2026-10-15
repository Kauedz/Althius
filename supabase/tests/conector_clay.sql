begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(2);

-- O perfil de conexão do Clay (migration 20261102140000, ticket 11): só OAuth pelo servidor MCP, portal não fixo.
select is(
  (select kinds from private.integration_connection_profiles where integration_id = 'clay'),
  array['oauth_mcp']::text[],
  'o Clay conecta só pelo OAuth do servidor MCP'
);
select is(
  (select pins_portal from private.integration_connection_profiles where integration_id = 'clay'),
  false,
  'o Clay não fixa portal no Workspace'
);

select * from finish();
rollback;

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(2);

-- O Apollo gasta créditos do Cliente (migration 20261104132000, conector-apollo 01).
select is(
  (select writes from private.integration_catalog where id = 'apollo'),
  true,
  'o Apollo conta como Integração que escreve ou gasta'
);
-- Os dois caminhos continuam: OAuth e chave de API (agora pelo servidor MCP, sem mudança no banco).
select is(
  (select kinds from private.integration_connection_profiles where integration_id = 'apollo'),
  array['oauth_mcp', 'api_key']::text[],
  'o Apollo conecta pela autorização no app e pela chave de API'
);

select * from finish();
rollback;

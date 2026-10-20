begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(3);

-- Make e Zapier no catálogo (migration 20261104135000).
select is(
  (select array_agg(id || ':' || category || ':' || writes::text || ':' || available::text order by id)
     from private.integration_catalog where id in ('make', 'zapier')),
  array['make:Automação:true:false', 'zapier:Automação:true:false'],
  'Make e Zapier entram em Automação, gastam e ficam ocultos até o teste real'
);
select is(
  (select array_agg(integration_id || ':' || array_to_string(kinds, ',') || ':' || pins_portal::text order by integration_id)
     from private.integration_connection_profiles where integration_id in ('make', 'zapier')),
  array['make:oauth_mcp:false', 'zapier:oauth_mcp,api_key:false'],
  'o Make conecta pela autorização no app; o Zapier também pelo token de conexão'
);
select is(
  (select count(*)::integer from public.workspace_integrations where integration_id in ('make', 'zapier')),
  0,
  'ninguém tem Make nem Zapier habilitado ainda'
);

select * from finish();
rollback;

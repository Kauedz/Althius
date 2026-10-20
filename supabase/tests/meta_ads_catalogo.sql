begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(3);

-- O estado esperado do Meta Ads no catálogo (conector-meta-ads 03): gasta, conecta só pela autorização no app e sem
-- portal fixo (uma pessoa pode ter várias contas de anúncio). Trava o seed de 20260929140000 e 20261001160000.
select is((select writes from private.integration_catalog where id = 'meta-ads'), true, 'o Meta Ads escreve ou gasta');
select is(
  (select kinds from private.integration_connection_profiles where integration_id = 'meta-ads'),
  array['oauth_mcp']::text[],
  'o Meta Ads conecta só pela autorização no app'
);
select is(
  (select pins_portal from private.integration_connection_profiles where integration_id = 'meta-ads'),
  false,
  'o Meta Ads não fixa portal'
);

select * from finish();
rollback;

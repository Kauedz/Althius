begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(2);

-- O Clay gasta créditos do Cliente (migration 20261104120000, conector-clay 01).
select is(
  (select writes from private.integration_catalog where id = 'clay'),
  true,
  'o Clay conta como Integração que escreve ou gasta'
);
-- O padrão das Especialidades no Clay é Propor (migration 20261104133000, decisão do usuário em 19/10/2026).
select is(
  (select array_agg(distinct permission) from private.specialty_default_permissions where integration_id = 'clay'),
  array['propor']::text[],
  'o padrão das Especialidades no Clay é Propor'
);

select * from finish();
rollback;

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
-- O padrão das Especialidades continua o de antes (Ler): com todas as ferramentas do Clay contando como gasto, Ler não
-- chama nenhuma, e subir o padrão espera decisão.
select is(
  (select array_agg(distinct permission) from private.specialty_default_permissions where integration_id = 'clay'),
  array['ler']::text[],
  'o padrão das Especialidades no Clay continua Ler'
);

select * from finish();
rollback;

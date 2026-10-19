begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(1);

-- O Lusha gasta créditos do Cliente (migration 20261104130000, conector-lusha 01).
select is(
  (select writes from private.integration_catalog where id = 'lusha'),
  true,
  'o Lusha conta como Integração que escreve ou gasta'
);

select * from finish();
rollback;

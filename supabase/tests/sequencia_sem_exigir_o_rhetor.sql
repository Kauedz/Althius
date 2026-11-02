begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(1);
select pass('a cobertura da regra nova está em sequencia_volta_ao_rhetor.sql');
select * from finish();
rollback;

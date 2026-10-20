begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(1);

-- O Bitrix24 fixa o portal do Workspace (migration 20261104134000, conector-bitrix24 01).
select is(
  (select pins_portal from private.integration_connection_profiles where integration_id = 'bitrix24'),
  true,
  'o Bitrix24 fixa o portal, como um CRM'
);

select * from finish();
rollback;

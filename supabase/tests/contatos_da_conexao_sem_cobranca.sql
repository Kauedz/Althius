-- Trilha C 6c: o contato achado pela conexão do Cliente (Apollo, CRM) grava com a origem, mas não cobra Créditos
-- Althius; o do Apify segue cobrando, e nada achado continua liberando a reserva.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(10);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values ('c6100000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@c6.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values ('c6200000-0000-0000-0000-000000000001', 'empresa', 'Norte C6');
insert into private.workspace_contracts (workspace_id, tier_id, starts_at)
values ('c6200000-0000-0000-0000-000000000001', 'escala', date_trunc('month', now())) on conflict (workspace_id) do nothing;
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('c6200000-0000-0000-0000-000000000001', 'c6100000-0000-0000-0000-000000000001', 'admin', true);
select public.grant_credits('c6200000-0000-0000-0000-000000000001', 100, 'plano', 'Saldo inicial do C6');
insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, created_by) values
  ('c6300000-0000-0000-0000-000000000001', 'c6200000-0000-0000-0000-000000000001', 'Acme C6', 'https://acme-c6.test', 'acme-c6.test', 'c6100000-0000-0000-0000-000000000001');
insert into public.sales_responsibilities (workspace_id, target_account_id, owner_user_id) values
  ('c6200000-0000-0000-0000-000000000001', 'c6300000-0000-0000-0000-000000000001', 'c6100000-0000-0000-0000-000000000001');

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'c6100000-0000-0000-0000-000000000001', true);

create temporary table ids (chave text primary key, valor uuid not null);
grant select, insert on ids to authenticated;
create function pg_temp.id(p_chave text) returns uuid language sql as $f$ select valor from ids where chave = p_chave $f$;
create function pg_temp.disponivel() returns numeric language sql as $f$
  select available from public.get_credit_balance('c6200000-0000-0000-0000-000000000001')
$f$;
create temporary table saldo (momento text primary key, valor numeric);
grant select, insert on saldo to authenticated;

-- 1. A regra das fontes do Cliente.
select is(array[private.is_customer_contact_source('apollo'), private.is_customer_contact_source('CRM:hubspot'),
                private.is_customer_contact_source('apify:harvestapi~linkedin-profile-scraper'),
                private.is_customer_contact_source('apollonia'), private.is_customer_contact_source(null)],
  array[true, true, false, false, false], 'Apollo e CRM são do Cliente; Apify e o resto não');

-- 2. Revelar: o e-mail do Apollo grava com a origem e debita zero; o do Apify debita.
insert into ids select 'sara', id from public.create_contact(
  'c6300000-0000-0000-0000-000000000001', 'Sara C6', 'Diretora', null, null, 'https://www.linkedin.com/in/sara-c6');
insert into ids select 'ugo', id from public.create_contact(
  'c6300000-0000-0000-0000-000000000001', 'Ugo C6', 'Gerente', null, null, 'https://www.linkedin.com/in/ugo-c6');
insert into saldo values ('antes_apollo', pg_temp.disponivel());
insert into ids select 'res_apollo', b.reservation_id
from public.begin_reveal_contact('c6200000-0000-0000-0000-000000000001', pg_temp.id('sara'), 'email') b;
select is((select f.success::text || ':' || f.debited_credits
           from public.finish_reveal_contact(pg_temp.id('res_apollo'), pg_temp.id('sara'), 'email', 'sara@acme-c6.test', 'apollo') f),
  'true:0', 'o e-mail achado pelo Apollo do Cliente grava e não debita');
select is((select email from public.contacts where id = pg_temp.id('sara')), 'sara@acme-c6.test', 'o e-mail do Apollo fica no Contato');
select is(pg_temp.disponivel(), (select valor from saldo where momento = 'antes_apollo'), 'o saldo não muda com o Apollo');
select is((select status from private.credit_reservations where id = pg_temp.id('res_apollo')), 'released',
  'a reserva do Apollo é liberada');

insert into saldo values ('antes_apify', pg_temp.disponivel());
insert into ids select 'res_apify', b.reservation_id
from public.begin_reveal_contact('c6200000-0000-0000-0000-000000000001', pg_temp.id('ugo'), 'email') b;
select is((select f.success::text || ':' || (f.debited_credits > 0)::text
           from public.finish_reveal_contact(pg_temp.id('res_apify'), pg_temp.id('ugo'), 'email', 'ugo@acme-c6.test',
             'apify:harvestapi~linkedin-profile-scraper') f),
  'true:true', 'o e-mail achado pelo Apify segue cobrando');
select ok(pg_temp.disponivel() < (select valor from saldo where momento = 'antes_apify'), 'o saldo cai com o Apify');

-- 3. Comitê: só as pessoas novas achadas pela Althius cobram; as do Apollo entram sem cobrança.
insert into saldo values ('antes_comite', pg_temp.disponivel());
insert into ids select 'busca', b.run_id from public.begin_committee_discovery(
  'c6200000-0000-0000-0000-000000000001', 'c6300000-0000-0000-0000-000000000001', 'busca-c6', 5) b;
select count(*) from public.record_proposed_contact('c6200000-0000-0000-0000-000000000001', 'c6300000-0000-0000-0000-000000000001',
  pg_temp.id('busca'), 'Bruno Apify', null, null, 'https://www.linkedin.com/in/bruno-c6', null, null, null,
  'harvestapi~linkedin-company-employees', 'apify', '{}'::jsonb);
select count(*) from public.record_proposed_contact('c6200000-0000-0000-0000-000000000001', 'c6300000-0000-0000-0000-000000000001',
  pg_temp.id('busca'), 'Carla Apollo', null, null, 'https://www.linkedin.com/in/carla-c6', null, null, null,
  'apollo', 'apollo', '{}'::jsonb);
select count(*) from public.record_proposed_contact('c6200000-0000-0000-0000-000000000001', 'c6300000-0000-0000-0000-000000000001',
  pg_temp.id('busca'), 'Davi Apollo', null, null, 'https://www.linkedin.com/in/davi-c6', null, null, null,
  'apollo', 'apollo', '{}'::jsonb);
select public.finish_committee_discovery(pg_temp.id('busca'), true, 3, 0.02, null, 'apify-c6');
select is((select r.state || ' ' || r.found || '/' || r.added from private.discovery_runs r where r.id = pg_temp.id('busca')),
  'concluida 3/3', 'as três pessoas novas entram no comitê');
select is(pg_temp.disponivel(), (select valor from saldo where momento = 'antes_comite') - 1,
  'só a pessoa achada pelo Apify debita 1 crédito');
select is((select c.settled_quantity::integer from private.discovery_runs r join private.credit_reservations c on c.id = r.reservation_id
           where r.id = pg_temp.id('busca')), 1, 'a reserva liquida 1, não 3');

select * from finish();
rollback;

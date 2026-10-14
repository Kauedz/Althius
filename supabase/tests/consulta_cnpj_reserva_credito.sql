begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(19);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('b1100000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@cnpj.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('b1100000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@outro-cnpj.test', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('b1200000-0000-0000-0000-000000000001', 'empresa', 'Workspace da Receita'),
  ('b1200000-0000-0000-0000-000000000002', 'empresa', 'Workspace de Fora');
insert into private.workspace_contracts (workspace_id, tier_id, starts_at) select w.id, 'escala', date_trunc('month', now()) from public.workspaces w on conflict (workspace_id) do nothing; -- contrato de teste (acesso-e-planos)

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('b1200000-0000-0000-0000-000000000001', 'b1100000-0000-0000-0000-000000000001', 'admin', true),
  ('b1200000-0000-0000-0000-000000000002', 'b1100000-0000-0000-0000-000000000002', 'admin', true);

insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, created_by) values
  ('b1300000-0000-0000-0000-000000000001', 'b1200000-0000-0000-0000-000000000001', 'LogiFlow Brasil S.A.', 'https://logiflow-cnpj.test', 'logiflow-cnpj.test', 'b1100000-0000-0000-0000-000000000001');

insert into public.sales_responsibilities (workspace_id, target_account_id, owner_user_id) values
  ('b1200000-0000-0000-0000-000000000001', 'b1300000-0000-0000-0000-000000000001', 'b1100000-0000-0000-0000-000000000001');

select is(
  (select credits from private.credit_action_prices where action = 'cnpj_receita'),
  1.00::numeric,
  'a consulta de CNPJ custa 1 crédito'
);

select is(
  (select string_agg(action || '=' || credits::text, ',' order by action) from public.list_credit_action_prices()),
  'account_discovery=5.00,account_scan=1.00,agent_round=1.00,cnpj_receita=1.00,email_revealed=2.00,person_collected=1.00,phone_revealed=5.00',
  'a consulta de CNPJ e a Descoberta aparecem na tabela de preços, e a cascata não é uma ação à parte'
);

select ok(
  not has_function_privilege('anon', 'public.begin_cnpj_receita(uuid, uuid, text)', 'execute')
    and has_function_privilege('authenticated', 'public.begin_cnpj_receita(uuid, uuid, text)', 'execute')
    and not has_function_privilege('anon', 'public.finish_cnpj_receita(uuid, boolean)', 'execute')
    and not has_function_privilege('authenticated', 'public.finish_cnpj_receita(uuid, boolean)', 'execute')
    and has_function_privilege('service_role', 'public.finish_cnpj_receita(uuid, boolean)', 'execute'),
  'quem está na sessão reserva; só o servidor liquida ou libera'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1100000-0000-0000-0000-000000000001', true);

select throws_ok(
  $$select * from public.begin_cnpj_receita(
      'b1200000-0000-0000-0000-000000000001'::uuid,
      'b1300000-0000-0000-0000-000000000001'::uuid,
      'sem-saldo')$$,
  'P0001',
  'insufficient credits',
  'sem saldo a consulta não reserva'
);

reset role;

select is(
  (select count(*) from private.credit_reservations
    where workspace_id = 'b1200000-0000-0000-0000-000000000001' and action = 'cnpj_receita'),
  0::bigint,
  'a recusa por saldo não deixa reserva'
);

select public.grant_credits('b1200000-0000-0000-0000-000000000001', 1, 'ajuste', 'crédito para a consulta de teste');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1100000-0000-0000-0000-000000000002', true);

select throws_ok(
  $$select * from public.begin_cnpj_receita(
      'b1200000-0000-0000-0000-000000000001'::uuid,
      'b1300000-0000-0000-0000-000000000001'::uuid,
      'de-fora')$$,
  '42501',
  'active workspace membership required',
  'outro Workspace não reserva a consulta'
);

select set_config('request.jwt.claim.sub', 'b1100000-0000-0000-0000-000000000001', true);

create temporary table reserva_libera as
  select * from public.begin_cnpj_receita(
    'b1200000-0000-0000-0000-000000000001'::uuid,
    'b1300000-0000-0000-0000-000000000001'::uuid,
    'libera'
  );

select is(
  (select count(*) from reserva_libera),
  1::bigint,
  'a reserva da consulta devolve um id'
);

reset role;

select is(
  (select amount from private.credit_reservations where id = (select reservation_id from reserva_libera)),
  1.00::numeric,
  'a reserva prende 1 crédito'
);

select is(
  (select user_id from private.credit_reservations where id = (select reservation_id from reserva_libera)),
  'b1100000-0000-0000-0000-000000000001'::uuid,
  'a reserva é da pessoa da sessão'
);

select is(
  (select status from private.credit_reservations where id = (select reservation_id from reserva_libera)),
  'reserved',
  'a consulta reservada ainda não debitou'
);

select is(
  (select debited_credits from public.finish_cnpj_receita((select reservation_id from reserva_libera), false)),
  0::numeric,
  'não achar o CNPJ libera a reserva e debita zero'
);

select is(
  (select status from private.credit_reservations where id = (select reservation_id from reserva_libera)),
  'released',
  'a reserva liberada não fica presa'
);

select is(
  (select count(*) from private.credit_entries where reservation_id = (select reservation_id from reserva_libera)),
  0::bigint,
  'liberar não lança saída no extrato'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1100000-0000-0000-0000-000000000001', true);

create temporary table reserva_liquida as
  select * from public.begin_cnpj_receita(
    'b1200000-0000-0000-0000-000000000001'::uuid,
    'b1300000-0000-0000-0000-000000000001'::uuid,
    'liquida'
  );

reset role;

select is(
  (select debited_credits from public.finish_cnpj_receita((select reservation_id from reserva_liquida), true)),
  1.00::numeric,
  'achar o CNPJ liquida 1 crédito'
);

select is(
  (select status from private.credit_reservations where id = (select reservation_id from reserva_liquida)),
  'settled',
  'a consulta achada fica liquidada'
);

select is(
  (select amount from private.credit_entries where reservation_id = (select reservation_id from reserva_liquida)),
  -1.00::numeric,
  'o extrato sai com 1 crédito'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1100000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$select public.save_account_receita_enrichment(
      'b1200000-0000-0000-0000-000000000001'::uuid,
      'b1300000-0000-0000-0000-000000000001'::uuid,
      '07.526.557/0001-00',
      '{"razaoSocial": "LOGIFLOW BRASIL S.A."}'::jsonb)$$,
  'quem participa grava a Receita na Conta'
);

reset role;

select is(
  (select receita_data->>'razaoSocial' from public.target_accounts where id = 'b1300000-0000-0000-0000-000000000001'::uuid),
  'LOGIFLOW BRASIL S.A.',
  'a Receita ficou gravada na Conta'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1100000-0000-0000-0000-000000000002', true);

select is(
  (select count(*) from public.target_accounts where id = 'b1300000-0000-0000-0000-000000000001'::uuid),
  0::bigint,
  'outro Workspace não lê o receita_data'
);

select * from finish();
rollback;

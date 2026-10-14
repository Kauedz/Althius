begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(34);

-- Ana (Admin) e Bruno (Membro) no Norte; Carla é de fora; Eva saiu.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('54000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('54000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('54000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@fora.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('54000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'eva@norte.test', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('f4000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('f4000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into private.workspace_contracts (workspace_id, tier_id) select w.id, 'escala' from public.workspaces w on conflict (workspace_id) do nothing; -- contrato de teste (acesso-e-planos)
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('f4000000-0000-0000-0000-000000000001', '54000000-0000-0000-0000-000000000001', 'admin', true),
  ('f4000000-0000-0000-0000-000000000001', '54000000-0000-0000-0000-000000000002', 'member', true),
  ('f4000000-0000-0000-0000-000000000001', '54000000-0000-0000-0000-000000000005', 'member', false),
  ('f4000000-0000-0000-0000-000000000002', '54000000-0000-0000-0000-000000000003', 'admin', true);

create temporary table r (k text primary key, id uuid) on commit drop;

-- 1. As tabelas e as funções de serviço ficam fora do alcance do app.
select ok(
  not has_table_privilege('authenticated', 'private.credit_entries', 'select')
    and not has_table_privilege('service_role', 'private.credit_reservations', 'select'),
  'ninguém do app lê as tabelas de crédito direto'
);
select ok(
  not has_function_privilege('authenticated', 'public.reserve_credits(uuid, uuid, text, text, integer, boolean)', 'execute')
    and not has_function_privilege('authenticated', 'public.grant_credits(uuid, numeric, text, text)', 'execute')
    and has_function_privilege('service_role', 'public.settle_credits(uuid, integer)', 'execute'),
  'reservar, liquidar e dar créditos é só do servidor'
);

-- 2. Tabela provisória da sabatina.
select is(
  (select string_agg(action || '=' || credits::text, ',' order by action) from public.list_credit_action_prices()),
  'account_scan=1.00,agent_round=1.00,email_revealed=2.00,person_collected=1.00,phone_revealed=5.00',
  'os preços provisórios em créditos'
);

-- 3. Entrada por plano e saldo.
select isnt(public.grant_credits('f4000000-0000-0000-0000-000000000001', 20, 'plano', 'Plano de setembro'), null, 'entrada do plano');
select throws_ok(
  $$select public.grant_credits('f4000000-0000-0000-0000-000000000001', -5, 'plano')$$,
  '22023', 'invalid credit amount', 'plano não entra negativo'
);
select throws_ok(
  $$select public.grant_credits('f4000000-0000-0000-0000-000000000001', 5, 'brinde')$$,
  '22023', 'invalid credit entry kind', 'tipo de entrada fora da lista é recusado'
);

-- 4. Reserva idempotente, liquidação e liberação.
insert into r select 'agente', public.reserve_credits('f4000000-0000-0000-0000-000000000001',
  '54000000-0000-0000-0000-000000000002', 'agent_round', 'run:1:rodada:1', 3);
select is(
  public.reserve_credits('f4000000-0000-0000-0000-000000000001', '54000000-0000-0000-0000-000000000002', 'agent_round', 'run:1:rodada:1', 3),
  (select id from r where k = 'agente'), 'a mesma chave devolve a mesma reserva'
);
select is(
  (select count(*)::integer from private.credit_reservations where action_key = 'run:1:rodada:1'), 1,
  'repetir a reserva não cria outra'
);
select is(
  (select sum(amount) from private.credit_reservations where status = 'reserved'), 3.00::numeric,
  'a reserva prende 3 créditos'
);
select is(public.settle_credits((select id from r where k = 'agente')), 3.00::numeric, 'liquidar debita o reservado');
select is(public.settle_credits((select id from r where k = 'agente')), 3.00::numeric, 'liquidar de novo não debita outra vez');
select is(
  (select count(*)::integer from private.credit_entries where reservation_id = (select id from r where k = 'agente')), 1,
  'uma saída só no extrato'
);
select throws_ok(
  format($$select public.release_credits(%L)$$, (select id from r where k = 'agente')),
  '55000', 'credit reservation was settled', 'reserva liquidada não se libera'
);

insert into r select 'varredura', public.reserve_credits('f4000000-0000-0000-0000-000000000001',
  '54000000-0000-0000-0000-000000000002', 'account_scan', 'scan:1', 4);
select lives_ok(format($$select public.release_credits(%L)$$, (select id from r where k = 'varredura')), 'a ação que não rodou libera a reserva');
select lives_ok(format($$select public.release_credits(%L)$$, (select id from r where k = 'varredura')), 'liberar de novo não faz nada');
select throws_ok(
  format($$select public.settle_credits(%L)$$, (select id from r where k = 'varredura')),
  '55000', 'credit reservation was released', 'reserva liberada não se liquida'
);

-- 5. Enriquecimento só debita o que achou.
insert into r select 'email', public.reserve_credits('f4000000-0000-0000-0000-000000000001',
  '54000000-0000-0000-0000-000000000002', 'email_revealed', 'enrich:1:email', 3);
select is(public.settle_credits((select id from r where k = 'email'), 1), 2.00::numeric, 'de 3 e-mails reservados, achou 1: debita 2');
insert into r select 'telefone', public.reserve_credits('f4000000-0000-0000-0000-000000000001',
  '54000000-0000-0000-0000-000000000002', 'phone_revealed', 'enrich:1:phone', 1);
select is(public.settle_credits((select id from r where k = 'telefone'), 0), 0::numeric, 'não achou o telefone: não debita');
select is((select status from private.credit_reservations where id = (select id from r where k = 'telefone')), 'released', 'e a reserva volta ao saldo');
select is(public.settle_credits((select id from r where k = 'email'), 3), 2.00::numeric, 'liquidar de novo com outra quantidade não muda o débito');

-- 6. Chave de IA do cliente: 20% da rodada.
insert into r select 'propria', public.reserve_credits('f4000000-0000-0000-0000-000000000001',
  '54000000-0000-0000-0000-000000000002', 'agent_round', 'run:2:rodada:1', 5, true);
select is((select amount from private.credit_reservations where id = (select id from r where k = 'propria')), 1.00::numeric, '5 rodadas com a chave do cliente custam 1');
select throws_ok(
  $$select public.reserve_credits('f4000000-0000-0000-0000-000000000001', null, 'account_scan', 'scan:x', 1, true)$$,
  '22023', 'own AI key applies only to agent rounds', 'chave do cliente vale só para Agentes'
);

-- 7. Saldo nunca negativo. Lançado: 20 - 3 - 2 = 15; reservado: 1 (a própria); disponível 14.
select throws_ok(
  $$select public.reserve_credits('f4000000-0000-0000-0000-000000000001', null, 'account_scan', 'scan:grande', 15)$$,
  'P0001', 'insufficient credits', 'sem saldo disponível, não reserva'
);
select is((select count(*)::integer from private.credit_reservations where action_key = 'scan:grande'), 0, 'e nada fica reservado');
select throws_ok(
  $$select public.grant_credits('f4000000-0000-0000-0000-000000000001', -50, 'ajuste')$$,
  'P0001', 'insufficient credits', 'ajuste não deixa o saldo negativo'
);
select throws_ok(
  $$select public.reserve_credits('f4000000-0000-0000-0000-000000000001', '54000000-0000-0000-0000-000000000005', 'account_scan', 'scan:eva', 1)$$,
  '42501', 'active workspace membership required', 'quem saiu não gasta crédito do Workspace'
);
select throws_ok(
  $$select public.reserve_credits('f4000000-0000-0000-0000-000000000002', null, 'account_scan', 'scan:sul', 1)$$,
  'P0001', 'insufficient credits', 'o saldo é de cada Workspace'
);

-- 8. Limite mensal por participante, só pelo Administrador.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '54000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.set_member_credit_limit('f4000000-0000-0000-0000-000000000001', '54000000-0000-0000-0000-000000000002', 100)$$,
  '42501', 'only administrators can set credit limits', 'Membro não define limite'
);
select is(
  (select row(balance, reserved, available, my_month_usage, my_monthly_limit)::text
   from public.get_credit_balance('f4000000-0000-0000-0000-000000000001')),
  '(15.00,1.00,14.00,6.00,)', 'o Membro vê o saldo e o próprio gasto do mês'
);
select is(
  (select count(*)::integer from public.list_credit_entries('f4000000-0000-0000-0000-000000000001')), 3,
  'o Membro vê as entradas e as próprias ações'
);
select set_config('request.jwt.claim.sub', '54000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.set_member_credit_limit('f4000000-0000-0000-0000-000000000001', '54000000-0000-0000-0000-000000000002', 7)$$,
  'o Administrador define o limite do Bruno'
);
reset role;
select throws_ok(
  $$select public.reserve_credits('f4000000-0000-0000-0000-000000000001', '54000000-0000-0000-0000-000000000002', 'account_scan', 'scan:2', 2)$$,
  'P0001', 'monthly credit limit reached', 'o Bruno (6 usados, limite 7) não passa do limite'
);
select isnt(
  public.reserve_credits('f4000000-0000-0000-0000-000000000001', '54000000-0000-0000-0000-000000000001', 'account_scan', 'scan:3', 2),
  null, 'a Ana, sem limite próprio, usa o saldo do Workspace'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '54000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select * from public.get_credit_balance('f4000000-0000-0000-0000-000000000001')$$,
  '42501', 'active workspace membership required', 'quem é de fora não vê o saldo'
);

select * from finish();
rollback;

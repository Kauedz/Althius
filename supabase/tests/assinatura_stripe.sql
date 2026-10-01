begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(27);

-- Ana (Admin) e Bruno (Membro) do Norte, criado depois da cobrança (sem assinatura); o Sul tem a marca manual.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('5b000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5b000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5b000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@sul.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('fb000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('fb000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('fb000000-0000-0000-0000-000000000001', '5b000000-0000-0000-0000-000000000001', 'admin', true),
  ('fb000000-0000-0000-0000-000000000001', '5b000000-0000-0000-0000-000000000002', 'member', true),
  ('fb000000-0000-0000-0000-000000000002', '5b000000-0000-0000-0000-000000000003', 'admin', true);
select public.set_manual_release('fb000000-0000-0000-0000-000000000002', true, 'cortesia');

create function pg_temp.entrar_como(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true)
$$;
create function pg_temp.acesso(p uuid) returns text language sql as $$
  select row(released, reason, paid_seats, used_seats)::text from public.workspace_access(p)
$$;

-- 1. Permissões: as tabelas não se leem por fora; o webhook e os ajustes são só do servidor.
select ok(
  not has_table_privilege('authenticated', 'private.workspace_subscriptions', 'select')
    and not has_table_privilege('service_role', 'private.workspace_subscriptions', 'select')
    and not has_function_privilege('authenticated', 'public.apply_stripe_subscription(uuid, text, text, text, integer, timestamptz, timestamptz)', 'execute')
    and has_function_privilege('service_role', 'public.apply_stripe_subscription(uuid, text, text, text, integer, timestamptz, timestamptz)', 'execute')
    and not has_function_privilege('authenticated', 'public.grant_seat_credits(text, uuid, integer)', 'execute')
    and not has_function_privilege('authenticated', 'public.set_manual_release(uuid, boolean, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.set_billing_settings(numeric, integer, boolean)', 'execute')
    and has_function_privilege('authenticated', 'public.workspace_access(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.workspace_access(uuid)', 'execute'),
  'as permissões: tabelas fechadas, Stripe e ajustes só pelo servidor, o acesso pelo app'
);

-- 2. Com a cobrança desligada (o padrão até o Stripe ir ao ar), todo Workspace abre.
select pg_temp.entrar_como('5b000000-0000-0000-0000-000000000002');
select is(pg_temp.acesso('fb000000-0000-0000-0000-000000000001'), '(t,cobranca_desligada,,2)', 'com a cobrança desligada, o Norte abre');
reset role;
select public.set_billing_settings(p_enforced => true);
select is((select enforced from private.billing_settings), true, 'ligar a cobrança é do servidor');

-- 2b. Ligada a cobrança: sem assinatura, o Workspace fica bloqueado; a marca manual libera.
select pg_temp.entrar_como('5b000000-0000-0000-0000-000000000002');
select is(pg_temp.acesso('fb000000-0000-0000-0000-000000000001'), '(f,sem_assinatura,,2)', 'sem assinatura, o Norte fica bloqueado');
select pg_temp.entrar_como('5b000000-0000-0000-0000-000000000003');
select is(pg_temp.acesso('fb000000-0000-0000-0000-000000000002'), '(t,liberado_manual,,1)', 'a marca manual libera o Sul');
select throws_ok(
  $$select * from public.workspace_access('fb000000-0000-0000-0000-000000000001')$$,
  '42501', 'active workspace membership required', 'quem não participa não lê o acesso'
);

-- 3. Só o Administrador abre o checkout.
select pg_temp.entrar_como('5b000000-0000-0000-0000-000000000002');
select throws_ok(
  $$select * from public.billing_context('fb000000-0000-0000-0000-000000000001')$$,
  '42501', 'only administrators can manage the subscription', 'o Membro não mexe na assinatura'
);
select pg_temp.entrar_como('5b000000-0000-0000-0000-000000000001');
select is(
  (select row(workspace_name, stripe_customer_id, used_seats)::text from public.billing_context('fb000000-0000-0000-0000-000000000001')),
  '(Norte,,2)', 'a Administradora recebe o nome, o cliente (ainda nenhum) e os assentos em uso'
);

-- 4. O webhook: cliente, assinatura ativa, e o Workspace abre.
reset role;
select public.record_stripe_customer('fb000000-0000-0000-0000-000000000001', 'cus_norte');
select is(public.workspace_by_stripe_customer('cus_norte'), 'fb000000-0000-0000-0000-000000000001'::uuid, 'o cliente do Stripe leva ao Workspace');
select is(
  public.apply_stripe_subscription('fb000000-0000-0000-0000-000000000001', 'cus_norte', 'sub_norte', 'active', 2, now() + interval '30 days'),
  'ativa', 'a assinatura ativa do Stripe vira ativa'
);
select pg_temp.entrar_como('5b000000-0000-0000-0000-000000000002');
select is(pg_temp.acesso('fb000000-0000-0000-0000-000000000001'), '(t,ativa,2,2)', 'com a assinatura ativa, o Norte abre');

-- 5. Atrasada: aberta durante a carência; vencida a carência, fecha; cancelada, fecha.
reset role;
select is(
  public.apply_stripe_subscription('fb000000-0000-0000-0000-000000000001', 'cus_norte', 'sub_norte', 'past_due', 2, now() - interval '2 days'),
  'atrasada', 'a fatura atrasada vira atrasada'
);
select pg_temp.entrar_como('5b000000-0000-0000-0000-000000000002');
select is((select released from public.workspace_access('fb000000-0000-0000-0000-000000000001')), true, 'atrasada há 2 dias, segue aberto na carência de 7');
reset role;
select public.apply_stripe_subscription('fb000000-0000-0000-0000-000000000001', 'cus_norte', 'sub_norte', 'unpaid', 2, now() - interval '8 days');
select pg_temp.entrar_como('5b000000-0000-0000-0000-000000000002');
select is((select released from public.workspace_access('fb000000-0000-0000-0000-000000000001')), false, 'passada a carência, fecha');
reset role;
select is(
  public.apply_stripe_subscription('fb000000-0000-0000-0000-000000000001', 'cus_norte', 'sub_norte', 'canceled', 2, now()),
  'cancelada', 'a assinatura cancelada vira cancelada'
);
select pg_temp.entrar_como('5b000000-0000-0000-0000-000000000002');
select is(pg_temp.acesso('fb000000-0000-0000-0000-000000000001'), '(f,cancelada,2,2)', 'cancelada, fecha');
reset role;
select is(
  public.apply_stripe_subscription('fb000000-0000-0000-0000-000000000001', null, 'sub_norte', 'incomplete', 2, null),
  'sem_assinatura', 'um checkout incompleto não abre'
);
select is(public.workspace_by_stripe_customer('cus_norte'), 'fb000000-0000-0000-0000-000000000001'::uuid, 'e não apaga o cliente guardado');

-- 5b. Um evento mais velho, chegando atrasado, não desfaz o mais novo.
select public.apply_stripe_subscription('fb000000-0000-0000-0000-000000000001', 'cus_norte', 'sub_norte', 'active', 3, now() + interval '30 days', '2026-10-01T12:00:00Z');
select is(
  public.apply_stripe_subscription('fb000000-0000-0000-0000-000000000001', 'cus_norte', 'sub_norte', 'canceled', 3, now(), '2026-10-01T11:00:00Z'),
  'ativa', 'o cancelamento mais velho que a reativação não fecha o Workspace'
);
select is(
  (select seats from private.workspace_subscriptions where workspace_id = 'fb000000-0000-0000-0000-000000000001'), 3,
  'e os assentos do evento mais novo ficam'
);

-- 6. A cota por fatura: zero enquanto o Nan não fecha o valor; depois, assentos × cota, uma vez por fatura.
select is(public.grant_seat_credits('in_1', 'fb000000-0000-0000-0000-000000000001', 2), 0::numeric, 'com a cota em zero, a fatura não lança crédito');
select public.set_billing_settings(100, 7);  -- não mexe no interruptor
select is(public.grant_seat_credits('in_2', 'fb000000-0000-0000-0000-000000000001', 3), 300::numeric, 'com 100 por assento, 3 assentos trazem 300');
select is(public.grant_seat_credits('in_2', 'fb000000-0000-0000-0000-000000000001', 3), 0::numeric, 'a mesma fatura não lança de novo');
select is(
  (select sum(amount) from private.credit_entries where workspace_id = 'fb000000-0000-0000-0000-000000000001' and kind = 'plano'),
  300::numeric, 'o saldo recebeu uma vez só por fatura'
);

select is(public.grant_seat_credits('in_3', 'fb000000-0000-0000-0000-000000000001', null), 300::numeric,
  'sem os assentos na fatura, vale o que a assinatura guardou (3)');

-- 7. Cada evento do Stripe é tratado uma vez só.
select is(public.claim_stripe_event('evt_1', 'invoice.paid'), true, 'o primeiro evento é tratado');
select is(public.claim_stripe_event('evt_1', 'invoice.paid'), false, 'o reenvio não');

select * from finish();
rollback;

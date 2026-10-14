begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(36);

-- Ana participa do Norte (normal) e do Livre (ilimitado por coluna, fora da Equipe).
-- Kaue é o fundador que passa a existir depois da migração.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('e0a17e00-0000-4000-8000-000000000021', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('e0a17e00-0000-4000-8000-000000000022', 'authenticated', 'authenticated', 'bruno@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('de76a0e7-0434-4833-9698-a005ec187025', 'authenticated', 'authenticated', 'kauezanato@althius.com.br', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('e0a17e00-0000-4000-8000-000000000010', 'empresa', 'Norte'),
  ('e0a17e00-0000-4000-8000-000000000011', 'empresa', 'Livre'),
  ('e0a17e00-0000-4000-8000-000000000012', 'empresa', 'Isento');
insert into private.workspace_contracts (workspace_id, tier_id) select w.id, 'escala' from public.workspaces w on conflict (workspace_id) do nothing; -- contrato de teste (acesso-e-planos)
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('e0a17e00-0000-4000-8000-000000000010', 'e0a17e00-0000-4000-8000-000000000021', 'admin', true),
  ('e0a17e00-0000-4000-8000-000000000010', 'e0a17e00-0000-4000-8000-000000000022', 'member', true),
  ('e0a17e00-0000-4000-8000-000000000011', 'e0a17e00-0000-4000-8000-000000000021', 'admin', true),
  ('e0a17e00-0000-4000-8000-000000000011', 'e0a17e00-0000-4000-8000-000000000022', 'member', false),
  ('e0a17e00-0000-4000-8000-000000000012', 'e0a17e00-0000-4000-8000-000000000021', 'admin', true);
insert into private.workspace_billing (workspace_id, credits_enforced, unlimited_credits)
values ('e0a17e00-0000-4000-8000-000000000011', true, true);
insert into private.credit_member_limits (workspace_id, user_id, monthly_limit) values
  ('e0a17e00-0000-4000-8000-000000000010', 'e0a17e00-0000-4000-8000-000000000021', 0),
  ('e0a17e00-0000-4000-8000-000000000011', 'e0a17e00-0000-4000-8000-000000000021', 0);

-- 1. A Equipe nasce uma vez, ilimitada, sem teto e liberada. Quem não existia no Auth entra na segunda chamada.
select ok(
  (select column_default from information_schema.columns
    where table_schema = 'private' and table_name = 'workspace_billing' and column_name = 'unlimited_credits') like '%false%',
  'unlimited_credits nasce falso'
);
select is(
  (select count(*)::int from public.workspaces where id = 'e0a17e00-0000-4000-8000-000000000001' and kind = 'empresa' and name = 'Equipe Althius'),
  1, 'a Equipe Althius existe uma vez, como Workspace da empresa'
);
select is(
  (select unlimited_credits from private.workspace_billing where workspace_id = 'e0a17e00-0000-4000-8000-000000000001'),
  true, 'a Equipe tem créditos ilimitados'
);
select is(
  (select credits_enforced from private.workspace_billing where workspace_id = 'e0a17e00-0000-4000-8000-000000000001'),
  true, 'a cobrança da Equipe fica ligada para o uso entrar no extrato'
);
select ok(
  (select monthly_cap_usd is null from private.workspace_signal_budget where workspace_id = 'e0a17e00-0000-4000-8000-000000000001'),
  'o teto de Sinais da Equipe é nulo'
);
select is(
  (select manual_release from private.workspace_subscriptions where workspace_id = 'e0a17e00-0000-4000-8000-000000000001'),
  true, 'a Equipe fica liberada quando a cobrança global ligar'
);
select is(private.ensure_equipe_althius_workspace(), 'e0a17e00-0000-4000-8000-000000000001'::uuid, 'chamar de novo devolve o mesmo Workspace');
select is((select count(*)::int from public.workspaces where name = 'Equipe Althius'), 1, 'chamar de novo não cria outra Equipe');
select is(
  (select role || ':' || active::text from public.workspace_memberships
    where workspace_id = 'e0a17e00-0000-4000-8000-000000000001' and user_id = 'de76a0e7-0434-4833-9698-a005ec187025'),
  'admin:true', 'o fundador que já tem Conta vira Administrador'
);
select is(
  (select count(*)::int from private.company_workspace_requests
    where user_id = 'de76a0e7-0434-4833-9698-a005ec187025' and workspace_id = 'e0a17e00-0000-4000-8000-000000000001'),
  1, 'o pedido de criação da Equipe fica registrado para o primeiro fundador'
);

-- 2. Reserva sem saldo: falha no normal, passa no ilimitado, e o uso fica no extrato.
select is(private.credits_unlimited('e0a17e00-0000-4000-8000-000000000010'), false, 'o Norte não é ilimitado');
select throws_ok(
  $$select public.reserve_credits('e0a17e00-0000-4000-8000-000000000010', null, 'account_scan', 'scan:normal', 1)$$,
  'P0001', 'insufficient credits', 'sem saldo, o Workspace normal não reserva'
);
create temporary table r (k text primary key, id uuid) on commit drop;
insert into r select 'livre', public.reserve_credits('e0a17e00-0000-4000-8000-000000000011', null, 'account_scan', 'scan:livre', 1);
select isnt((select id from r where k = 'livre'), null, 'sem saldo, o Workspace ilimitado reserva');
select is(
  public.reserve_credits('e0a17e00-0000-4000-8000-000000000011', null, 'account_scan', 'scan:livre', 1),
  (select id from r where k = 'livre'), 'a mesma chave devolve a mesma reserva'
);
select isnt(public.settle_credits((select id from r where k = 'livre')), null, 'liquidar o ilimitado debita');
select ok(
  (select amount < 0 from private.credit_entries where reservation_id = (select id from r where k = 'livre')),
  'o uso do ilimitado fica no extrato, mesmo com saldo negativo'
);
select throws_ok(
  $$select public.reserve_credits('e0a17e00-0000-4000-8000-000000000011', 'e0a17e00-0000-4000-8000-000000000022', 'account_scan', 'scan:saiu', 1)$$,
  '42501', 'active workspace membership required', 'quem saiu não gasta nem no ilimitado'
);
select public.grant_credits('e0a17e00-0000-4000-8000-000000000010', 10, 'plano');
select throws_ok(
  $$select public.reserve_credits('e0a17e00-0000-4000-8000-000000000010', 'e0a17e00-0000-4000-8000-000000000021', 'account_scan', 'scan:limite', 1)$$,
  'P0001', 'monthly credit limit reached', 'limite mensal zero barra o Workspace normal'
);
select isnt(
  public.reserve_credits('e0a17e00-0000-4000-8000-000000000011', 'e0a17e00-0000-4000-8000-000000000021', 'account_scan', 'scan:sem-limite', 1),
  null, 'limite mensal zero não barra o ilimitado'
);

-- 3. Teto de Sinais: dólar do mês e automático da varredura.
insert into private.action_costs (workspace_id, action_type, provider, model_or_actor, source_ref, cost_usd) values
  ('e0a17e00-0000-4000-8000-000000000010', 'apify_actor', 'apify', 'actor-teste', 'equipe-norte', 25),
  ('e0a17e00-0000-4000-8000-000000000011', 'apify_actor', 'apify', 'actor-teste', 'equipe-livre', 25),
  ('e0a17e00-0000-4000-8000-000000000012', 'apify_actor', 'apify', 'actor-teste', 'equipe-isento', 25);
update private.workspace_signal_budget set monthly_cap_usd = null
where workspace_id = 'e0a17e00-0000-4000-8000-000000000012';
select is(private.signal_budget_block('e0a17e00-0000-4000-8000-000000000010', 0), 'teto_atingido', 'US$ 25 no mês estoura o teto de US$ 20');
select ok(private.signal_budget_block('e0a17e00-0000-4000-8000-000000000011', 0) is null, 'o ilimitado não é bloqueado pelo gasto do mês');
select ok(private.signal_budget_block('e0a17e00-0000-4000-8000-000000000012', 0) is null, 'teto gravado nulo é isento, mesmo sem créditos ilimitados');

insert into private.automation_settings (workspace_id, scope, mode, monthly_cap) values
  ('e0a17e00-0000-4000-8000-000000000010', 'acao:varredura', 'automatico', 1),
  ('e0a17e00-0000-4000-8000-000000000011', 'acao:varredura', 'confirmar', null);
insert into private.automation_spend (workspace_id, scope, month, spent) values
  ('e0a17e00-0000-4000-8000-000000000010', 'acao:varredura', date_trunc('month', now())::date, 1);
select is(
  public.consume_automation_cap('e0a17e00-0000-4000-8000-000000000010', 'acao:varredura', 1),
  'teto_atingido', 'o automático no teto para o Workspace normal'
);
select is(
  public.consume_automation_cap('e0a17e00-0000-4000-8000-000000000011', 'acao:varredura', 1),
  'ok', 'o ilimitado não para em confirmar nem no teto da varredura'
);

-- 4. Quem participa vê "ilimitado" e o teto nulo. Sem linha, o teto continua 20.
delete from private.workspace_signal_budget where workspace_id = 'e0a17e00-0000-4000-8000-000000000010';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'de76a0e7-0434-4833-9698-a005ec187025', true);
select ok(public.workspace_signal_monthly_cap('e0a17e00-0000-4000-8000-000000000001') is null, 'a Equipe mostra teto nulo para quem participa');
select is((select unlimited from public.get_credit_balance('e0a17e00-0000-4000-8000-000000000001')), true, 'o saldo da Equipe diz que é ilimitado');
select set_config('request.jwt.claim.sub', 'e0a17e00-0000-4000-8000-000000000021', true);
select is(public.workspace_signal_monthly_cap('e0a17e00-0000-4000-8000-000000000010'), 20::numeric, 'sem linha de teto, o Workspace segue com US$ 20');
select is((select unlimited from public.get_credit_balance('e0a17e00-0000-4000-8000-000000000010')), false, 'o saldo do Norte não é ilimitado');
reset role;

-- 5. A varredura e a cascata: o Teto para o normal e não para o ilimitado.
select public.set_signal_actor_state('curious_coder~linkedin-jobs-scraper', 'available', 'v1');
insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, created_by) values
  ('e0a17e00-0000-4000-8000-000000000031', 'e0a17e00-0000-4000-8000-000000000010', 'Alfa', 'https://alfa.test', 'alfa.test', 'e0a17e00-0000-4000-8000-000000000021'),
  ('e0a17e00-0000-4000-8000-000000000032', 'e0a17e00-0000-4000-8000-000000000011', 'Beta', 'https://beta.test', 'beta.test', 'e0a17e00-0000-4000-8000-000000000021');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'e0a17e00-0000-4000-8000-000000000021', true);
create temporary table mon (ws uuid primary key, id uuid) on commit drop;
insert into mon
select 'e0a17e00-0000-4000-8000-000000000010',
  public.save_signal_monitor('e0a17e00-0000-4000-8000-000000000010', null, 'vaga_linkedin', 'Vagas', 'ativo',
    '{"accountIds":["e0a17e00-0000-4000-8000-000000000031"]}', '{"palavras":["dados"]}', 12);
insert into mon
select 'e0a17e00-0000-4000-8000-000000000011',
  public.save_signal_monitor('e0a17e00-0000-4000-8000-000000000011', null, 'vaga_linkedin', 'Vagas', 'ativo',
    '{"accountIds":["e0a17e00-0000-4000-8000-000000000032"]}', '{"palavras":["dados"]}', 12);
reset role;

-- O Norte já gastou US$ 25: o teto de dólar responde antes do saldo.
select is(
  (select outcome from public.begin_account_scan(
    'e0a17e00-0000-4000-8000-000000000010', null, (select id from mon where ws = 'e0a17e00-0000-4000-8000-000000000010'),
    'e0a17e00-0000-4000-8000-000000000031', '2026-10-14 12:00+00')),
  'teto_atingido', 'a varredura do Norte para no teto de Sinais'
);
select is(
  (select outcome from public.begin_account_scan(
    'e0a17e00-0000-4000-8000-000000000011', null, (select id from mon where ws = 'e0a17e00-0000-4000-8000-000000000011'),
    'e0a17e00-0000-4000-8000-000000000032', '2026-10-14 12:00+00')),
  'go', 'a varredura do ilimitado abre sem saldo, em confirmar e com o mês estourado'
);

insert into private.signal_cascades (signal_type, icp, name, state) values ('equipe_teste', 'A', 'Teste da equipe', 'available');
select is(
  (select outcome from public.begin_cascade_run(
    'e0a17e00-0000-4000-8000-000000000010', null, 'equipe_teste', 'conversa', null, 'equipe:norte', 0.01)),
  'teto_atingido', 'a cascata do Norte para no teto de dólar do mês'
);
select is(
  (select outcome from public.begin_cascade_run(
    'e0a17e00-0000-4000-8000-000000000011', null, 'equipe_teste', 'conversa', null, 'equipe:livre', 0.01)),
  'go', 'a cascata do ilimitado abre sem saldo'
);
select is(
  (select cap_usd from private.signal_cascade_runs where idempotency_key = 'equipe:livre'),
  0.5000::numeric, 'o teto técnico de uma execução continua o do tipo'
);

-- Sem gasto de actor, o teto diário ainda barra o normal. O Isento não gastou o suficiente? Isento has spend 25 but null cap.
-- Use a fresh workspace without spend for the daily cap, after clearing the Norte spend path: Norte is already blocked by USD.
update private.signal_cascade_settings set daily_credit_cap = 0;
delete from private.action_costs where source_ref = 'equipe-isento';
select is(
  (select outcome from public.begin_cascade_run(
    'e0a17e00-0000-4000-8000-000000000012', null, 'equipe_teste', 'conversa', null, 'equipe:dia', 0.01)),
  'limite_diario', 'teto diário zero barra o Workspace normal'
);
select is(
  (select outcome from public.begin_cascade_run(
    'e0a17e00-0000-4000-8000-000000000011', null, 'equipe_teste', 'conversa', null, 'equipe:dia-livre', 0.01)),
  'go', 'teto diário zero não barra o ilimitado'
);

select ok(
  not has_function_privilege('authenticated', 'public.workspace_credits_unlimited(uuid)', 'execute')
    and has_function_privilege('service_role', 'public.workspace_credits_unlimited(uuid)', 'execute')
    and not has_function_privilege('anon', 'private.ensure_equipe_althius_workspace()', 'execute'),
  'saber se é ilimitado é do servidor; criar a Equipe não é do app'
);

select * from finish();
rollback;

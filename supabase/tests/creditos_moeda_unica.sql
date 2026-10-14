begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(83);

-- Créditos como moeda única (creditos-moeda-unica): preço fixo por Sinal, o Monitoramento cobra por Conta varrida, a rodada
-- de Agente custa 1, 3 ou 0,2, a renovação mensal zera o plano e deixa o pacote, o limite do contrato é um só e a guarda em
-- dólar vem da faixa. Pessoas: Ana (Administradora dos Workspaces), Dora (staff da Althius).
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('cd000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('cd000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'dora@althius.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into private.althius_staff (user_id) values ('cd000000-0000-4000-8000-000000000002');

-- Norte: Profissional (guarda US$ 195), usado nos Monitoramentos. Renova: Profissional há 45 dias, para a renovação.
-- Novo: contrato que começou agora (primeiro período). Parado: contrato suspenso. Pacote: lotes e ordem de gasto.
-- Limite: limite mensal de 5 créditos. Livre: ilimitado.
insert into public.workspaces (id, kind, name) values
  ('cd100000-0000-4000-8000-000000000001', 'empresa', 'Norte'),
  ('cd100000-0000-4000-8000-000000000002', 'empresa', 'Renova'),
  ('cd100000-0000-4000-8000-000000000003', 'empresa', 'Novo'),
  ('cd100000-0000-4000-8000-000000000004', 'empresa', 'Parado'),
  ('cd100000-0000-4000-8000-000000000005', 'empresa', 'Pacote'),
  ('cd100000-0000-4000-8000-000000000006', 'empresa', 'Limite'),
  ('cd100000-0000-4000-8000-000000000007', 'empresa', 'Livre');
insert into private.workspace_contracts (workspace_id, tier_id, status, starts_at, monthly_credit_limit) values
  ('cd100000-0000-4000-8000-000000000001', 'profissional', 'ativo', date_trunc('month', now()), 100000),
  ('cd100000-0000-4000-8000-000000000002', 'essencial', 'ativo', now() - interval '45 days', 100000),
  ('cd100000-0000-4000-8000-000000000003', 'essencial', 'ativo', now(), null),
  ('cd100000-0000-4000-8000-000000000004', 'essencial', 'suspenso', now() - interval '45 days', null),
  ('cd100000-0000-4000-8000-000000000005', 'essencial', 'ativo', date_trunc('month', now()), 100000),
  ('cd100000-0000-4000-8000-000000000006', 'essencial', 'ativo', date_trunc('month', now()), 5),
  ('cd100000-0000-4000-8000-000000000007', 'essencial', 'ativo', date_trunc('month', now()), 5);
insert into private.workspace_billing (workspace_id, credits_enforced, unlimited_credits)
values ('cd100000-0000-4000-8000-000000000007', true, true);
insert into public.workspace_memberships (workspace_id, user_id, role, active)
select w.id, 'cd000000-0000-4000-8000-000000000001', 'admin', true from public.workspaces w where w.id::text like 'cd100000-%';
select public.grant_credits('cd100000-0000-4000-8000-000000000001', 1000, 'plano', 'saldo de teste');
select public.grant_credits('cd100000-0000-4000-8000-000000000006', 1000, 'plano', 'saldo de teste');
select public.grant_credits('cd100000-0000-4000-8000-000000000007', 1000, 'plano', 'saldo de teste');

insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, created_by) values
  ('cd200000-0000-4000-8000-000000000001', 'cd100000-0000-4000-8000-000000000001', 'Alfa', 'https://alfa.test', 'alfa.test', 'cd000000-0000-4000-8000-000000000001'),
  ('cd200000-0000-4000-8000-000000000002', 'cd100000-0000-4000-8000-000000000006', 'Beta', 'https://beta.test', 'beta.test', 'cd000000-0000-4000-8000-000000000001');
select public.set_signal_actor_state(a.actor_id, 'available', 'v1')
from private.signal_actors a where a.signal_type in ('vaga_linkedin', 'avaliacoes_google_maps');
insert into private.signal_monitors (id, workspace_id, signal_type, name, state, next_run_at) values
  ('cd300000-0000-4000-8000-000000000001', 'cd100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'Vagas', 'ativo', now()),
  ('cd300000-0000-4000-8000-000000000002', 'cd100000-0000-4000-8000-000000000001', 'avaliacoes_google_maps', 'Avaliações', 'ativo', now()),
  ('cd300000-0000-4000-8000-000000000003', 'cd100000-0000-4000-8000-000000000006', 'vaga_linkedin', 'Vagas do Limite', 'ativo', now());

-- O Norte vem com a Automação em automático, dentro do limite do contrato (como um Workspace provisionado).
select private.seed_contract_automation('cd100000-0000-4000-8000-000000000001');

-- 1. O preço fixo por Sinal, em créditos, e os rótulos sem dólar.
select is(
  (select string_agg(id || '=' || credits_per_account, ',' order by id) from public.signal_catalog
   where workspace_id is null and id in ('abertura-de-vagas', 'anuncios-meta', 'publicacoes-da-empresa', 'nova-lideranca',
     'nova-empresa-aberta', 'avaliacoes-google-maps', 'financiamento-bndes-finep', 'sem-resposta')),
  'abertura-de-vagas=2,anuncios-meta=2,avaliacoes-google-maps=1,financiamento-bndes-finep=1,nova-empresa-aberta=1,nova-lideranca=2,publicacoes-da-empresa=2,sem-resposta=0',
  'faixa 1 (fontes públicas) custa 1, faixa 2 (vagas, anúncios, publicações, pessoas) custa 2, histórico do Workspace custa 0');
select is((select count(*)::int from public.signal_catalog
  where workspace_id is null
    and id not in ('nova-mercadoria-importada', 'mudanca-regulatoria-e-licenca', 'calendario-e-plano-safra')
    and credits_per_account not between 0 and 2), 0,
  'nenhum card por Conta passa de 2 créditos; os 3 de Mercado cobram 3 por execução');
select is((select estimated_cost_label from public.signal_catalog where id = 'abertura-de-vagas'), '2 créditos por Conta varrida', 'o rótulo diz o preço em créditos');
select is((select estimated_cost_label from public.signal_catalog where id = 'nova-empresa-aberta'), '1 crédito por Conta varrida', 'no singular, para 1');
select is((select estimated_cost_label from public.signal_catalog where id = 'nova-mercadoria-importada'), '3 créditos por execução', 'o Sinal de Mercado custa 3 por execução');
select is((select count(*)::int from public.signal_catalog where workspace_id is null and (estimated_cost_label ~* 'US\$|dólar|teto')), 0,
  'nenhum rótulo do catálogo tem dólar nem teto');
select is(
  (select private.credits_per_account('vaga_linkedin') || ',' || private.credits_per_account('avaliacoes_google_maps') || ',' || private.credits_per_account('tipo_que_ninguem_cita')),
  '2,1,1', 'o preço de um tipo técnico é o do card que o cita; tipo desconhecido cobra 1');
select is((select credits_per_run from private.signal_cascade_settings), 3, 'a execução de Mercado custa 3 créditos');

-- 2. O Monitoramento cobra créditos por Conta varrida: o preço do Sinal, pelo signal-runner.
create temporary table varredura on commit drop as
  select * from public.begin_account_scan('cd100000-0000-4000-8000-000000000001', 'cd000000-0000-4000-8000-000000000001',
    'cd300000-0000-4000-8000-000000000001', 'cd200000-0000-4000-8000-000000000001', '2026-10-17 12:00+00');
select is((select outcome from varredura), 'go', 'a varredura de uma Conta abre');
select is((select quantity || ':' || amount from private.credit_reservations where id = (select reservation_id from varredura)), '2:2.00',
  'Vagas, faixa 2, reserva 2 créditos por Conta varrida');
select lives_ok($$select public.end_account_scan((select reservation_id from varredura), true)$$, 'concluída');
select is((select -sum(amount) from private.credit_entries where reservation_id = (select reservation_id from varredura)), 2.00, 'e debita 2 créditos');
create temporary table varredura2 on commit drop as
  select * from public.begin_account_scan('cd100000-0000-4000-8000-000000000001', 'cd000000-0000-4000-8000-000000000001',
    'cd300000-0000-4000-8000-000000000002', 'cd200000-0000-4000-8000-000000000001', '2026-10-17 12:00+00');
select is((select quantity || ':' || amount from private.credit_reservations where id = (select reservation_id from varredura2)), '1:1.00',
  'Avaliações, faixa 1, reserva 1 crédito por Conta');
select is((select outcome from public.begin_account_scan('cd100000-0000-4000-8000-000000000001', 'cd000000-0000-4000-8000-000000000001',
    'cd300000-0000-4000-8000-000000000001', 'cd200000-0000-4000-8000-000000000001', '2026-10-17 12:00+00')), 'done',
  'repetir a rodada não cobra de novo');

-- A busca de uma Conta (clique) cobra pelos Monitoramentos que roda: 2 + 1.
select is((select monitors || ':' || credits from private.rescan_cost('cd100000-0000-4000-8000-000000000001')), '2:3.00',
  'buscar de novo custa a soma dos preços dos Monitoramentos ativos (2 + 1)');
insert into private.signal_rescans (id, workspace_id, target_account_id, origin, requested_by)
values ('cd400000-0000-4000-8000-000000000001', 'cd100000-0000-4000-8000-000000000001', 'cd200000-0000-4000-8000-000000000001', 'manual', 'cd000000-0000-4000-8000-000000000001');
create temporary table busca on commit drop as
  select * from public.begin_rescan_scan('cd400000-0000-4000-8000-000000000001', 'cd300000-0000-4000-8000-000000000001');
select is((select quantity::text from private.credit_reservations where id = (select reservation_id from busca)), '2',
  'a busca reserva o preço do Sinal por varredura');

-- 3. A cascata: preço fixo. Mercado, 3 por execução; Conta, o preço do Sinal × as Contas da execução; o custo da fonte não entra.
create temporary table mercado on commit drop as
  select * from public.begin_cascade_run('cd100000-0000-4000-8000-000000000001', null, 'ncm_nova_na_pauta', 'conversa', null, 'm1', 0.0, null, true);
select is((select outcome || ':' || est_credits from mercado), 'go:3', 'Sinal de Mercado reserva 3 créditos por execução');
select is((select est_credits from public.begin_cascade_run('cd100000-0000-4000-8000-000000000001', null, 'licenca_instalacao_dou', 'conversa', null, 'm2', 99.0, null, true)), 3,
  'o custo estimado da fonte não muda o preço de Mercado');
create temporary table conta5 on commit drop as
  select * from public.begin_cascade_run('cd100000-0000-4000-8000-000000000001', null, 'vaga_comex', 'conversa', null, 'c5', 0.0, null, true, 5);
select is((select est_credits from conta5), 10, 'Sinal de Conta reserva 2 créditos × 5 Contas');
select is((select est_credits from public.begin_cascade_run('cd100000-0000-4000-8000-000000000001', null, 'troca_de_sede', 'conversa', null, 'c6', 0.0, null, true, 7)), 7,
  'faixa 1: 1 crédito × 7 Contas');
select is((select est_credits from public.begin_cascade_run('cd100000-0000-4000-8000-000000000001', null, 'vaga_comex', 'conversa', null, 'c7', 0.0, null, true)), 2,
  'sem o número de Contas, vale uma');
select is((select credits_charged from public.finish_cascade_run((select run_id from conta5), 'succeeded', 0.0001, 0, 0, 0, null)), 10,
  'concluída, cobra o preço fixo das 5 Contas, mesmo com custo de fonte quase zero');
select is((select credits_charged from public.finish_cascade_run((select run_id from mercado), 'failed', 0.5, 0, 0, 0, 'A fonte pública está indisponível agora.')), 0,
  'falha não cobra, nem com custo de fonte gasto');
select is((select credits_charged from public.finish_cascade_run(
  (select run_id from public.begin_cascade_run('cd100000-0000-4000-8000-000000000001', null, 'ncm_nova_na_pauta', 'conversa', null, 'm3', 0.0, null, true)),
  'partial', 0.1, 2, 1, 0, 'Alguns Sinais não puderam ser gravados.')), 3, 'parcial com Sinal cobra o preço');
select is((select credits_charged from public.finish_cascade_run(
  (select run_id from public.begin_cascade_run('cd100000-0000-4000-8000-000000000001', null, 'ncm_nova_na_pauta', 'conversa', null, 'm4', 0.0, null, true)),
  'partial', 0.1, 0, 0, 0, 'Nada saiu.')), 0, 'parcial sem nada não cobra');

-- 4. A rodada de Agente: 1 no modelo padrão, 3 no da Anthropic, 0,2 com a chave do cliente.
create function pg_temp.preco_da_rodada(p_chave text, p_propria boolean default false) returns numeric language plpgsql as $f$
declare
  v_id uuid;
  v_unit numeric;
begin
  v_id := public.reserve_credits('cd100000-0000-4000-8000-000000000001', null, 'agent_round', p_chave, 1, p_propria);
  select r.unit_credits into v_unit from private.credit_reservations r where r.id = v_id;
  return v_unit;
end;
$f$;
select is(pg_temp.preco_da_rodada('rodada-1'), 1.00, 'no modelo padrão, a rodada custa 1 crédito');
select is(pg_temp.preco_da_rodada('rodada-2', true), 0.20, 'com a chave do cliente, 0,2');
select ok(not has_function_privilege('authenticated', 'public.set_platform_model(text)', 'execute')
  and has_function_privilege('service_role', 'public.set_platform_model(text)', 'execute'), 'trocar o modelo da plataforma é só do servidor');
select throws_ok($$select public.set_platform_model('outro')$$, '22023', 'invalid platform model', 'só padrão ou Anthropic');
select lives_ok($$select public.set_platform_model('anthropic')$$, 'o modelo da plataforma passa a ser o da Anthropic');
select is(pg_temp.preco_da_rodada('rodada-3'), 3.00, 'no modelo da Anthropic, a rodada custa 3 créditos');
select is(pg_temp.preco_da_rodada('rodada-4', true), 0.20, 'e com a chave do cliente continua 0,2');
select is((select credits from public.list_credit_action_prices() where action = 'agent_round'), 3.00, 'a tabela de preços mostra o preço do modelo da plataforma');
select public.set_platform_model('padrao');
select is((select credits from public.list_credit_action_prices() where action = 'agent_round'), 1.00, 'e volta a 1 no modelo padrão');

-- 5. A tabela de preços: Descoberta e consulta de CNPJ aparecem; a cascata não é uma ação à parte.
select is(
  (select string_agg(action, ',' order by action) from public.list_credit_action_prices()),
  'account_discovery,account_scan,agent_round,cnpj_receita,email_revealed,person_collected,phone_revealed',
  'a tabela mostra a Descoberta e o CNPJ, e não a cascata');
select is((select credits from public.list_credit_action_prices() where action = 'account_discovery'), 5.00, 'Descoberta: 5 créditos');
select ok((select description from public.list_credit_action_prices() where action = 'account_discovery') ~ '5 créditos a cada 50 empresas', 'a cada 50 empresas');

-- 6. O limite mensal é um só: o do contrato (aqui, 5), conferido na reserva, no período do contrato.
create function pg_temp.dica() returns text language plpgsql as $f$
declare v_hint text;
begin
  perform public.reserve_credits('cd100000-0000-4000-8000-000000000006', null, 'person_collected', 'estoura', 3);
  return 'sem recusa';
exception when others then
  get stacked diagnostics v_hint = pg_exception_hint;
  return sqlerrm || '|' || v_hint;
end;
$f$;
select lives_ok($$select public.reserve_credits('cd100000-0000-4000-8000-000000000006', null, 'person_collected', 'dentro', 4)$$, 'dentro do limite, reserva');
select is(pg_temp.dica(), 'monthly credit limit reached|workspace_limit', 'passando do limite do contrato, recusa com a dica do limite do Workspace');
select is((select outcome from public.begin_account_scan('cd100000-0000-4000-8000-000000000006', null,
    'cd300000-0000-4000-8000-000000000003', 'cd200000-0000-4000-8000-000000000002', '2026-10-17 12:00+00')),
  'teto_atingido', 'a varredura que passaria do limite vira "limite do mês atingido"');
select is((select count(*)::int from private.credit_reservations where workspace_id = 'cd100000-0000-4000-8000-000000000006' and action = 'account_scan'), 0,
  'e nada fica reservado');
select lives_ok($$select public.reserve_credits('cd100000-0000-4000-8000-000000000007', null, 'person_collected', 'livre', 50)$$,
  'o Workspace ilimitado não tem limite');
select is(private.workspace_monthly_limit('cd100000-0000-4000-8000-000000000003'), 3000::numeric, 'sem limite próprio, vale os créditos da faixa');
select is(private.workspace_monthly_limit('cd100000-0000-4000-8000-000000000007'), null, 'o ilimitado não tem limite');

-- 7. O período do contrato: do aniversário ao seguinte; sem contrato, o mês do calendário.
select ok(private.credit_period_start('cd100000-0000-4000-8000-000000000002') > now() - interval '32 days'
  and private.credit_period_start('cd100000-0000-4000-8000-000000000002') <= now(), 'o período de um contrato de 45 dias começou nos últimos 31 dias');
select is(extract(day from private.credit_period_start('cd100000-0000-4000-8000-000000000002'))::int,
  least(extract(day from now() - interval '45 days')::int,
    extract(day from (date_trunc('month', private.credit_period_start('cd100000-0000-4000-8000-000000000002')) + interval '1 month - 1 day'))::int),
  'e começou no dia do aniversário do contrato');
select is(private.credit_period_start(gen_random_uuid()), date_trunc('month', now()), 'sem contrato, o mês do calendário');

-- 8. Os lotes: o plano é gasto primeiro, o pacote depois. O pacote vale 12 meses.
select public.grant_credits('cd100000-0000-4000-8000-000000000005', 3000, 'plano', 'créditos iniciais');
select public.grant_credits('cd100000-0000-4000-8000-000000000005', 100, 'pacote', 'pacote avulso');
select ok((select expires_at between now() + interval '11 months' and now() + interval '13 months'
  from private.credit_entries where workspace_id = 'cd100000-0000-4000-8000-000000000005' and kind = 'pacote'), 'o pacote registra a validade de 12 meses');
select is((select count(*)::int from private.credit_entries where workspace_id = 'cd100000-0000-4000-8000-000000000005' and kind = 'plano' and expires_at is not null), 0,
  'o plano não vence');
create function pg_temp.gastar(p_ws uuid, p_chave text, p_qtd integer) returns void language sql as $f$
  select public.settle_credits(public.reserve_credits(p_ws, null, 'person_collected', p_chave, p_qtd), null)
$f$;
create function pg_temp.lotes(p_ws uuid) returns text language sql as $f$
  select string_agg(kind || '=' || remaining, ',' order by kind) from private.credit_lots where workspace_id = p_ws and remaining > 0
$f$;
select is(pg_temp.lotes('cd100000-0000-4000-8000-000000000005'), 'pacote=100.00,plano=3000.00', 'dois lotes abertos');
select pg_temp.gastar('cd100000-0000-4000-8000-000000000005', 'g1', 2900);
select is(pg_temp.lotes('cd100000-0000-4000-8000-000000000005'), 'pacote=100.00,plano=100.00', 'o gasto sai do plano primeiro');
select pg_temp.gastar('cd100000-0000-4000-8000-000000000005', 'g2', 150);
select is(pg_temp.lotes('cd100000-0000-4000-8000-000000000005'), 'pacote=50.00', 'acabado o plano, o gasto sai do pacote');
select is((select t.booked from private.credit_totals('cd100000-0000-4000-8000-000000000005') t), 50.00, 'e o saldo é o do extrato (50)');

-- 9. A renovação mensal: o restante do plano sai, o pacote fica, e entram os créditos da faixa.
select public.grant_credits('cd100000-0000-4000-8000-000000000002', 3000, 'plano', 'créditos iniciais');
select pg_temp.gastar('cd100000-0000-4000-8000-000000000002', 'r1', 500);
select public.grant_credits('cd100000-0000-4000-8000-000000000002', 200, 'pacote', 'pacote avulso');
insert into private.automation_settings (workspace_id, scope, mode, monthly_cap)
values ('cd100000-0000-4000-8000-000000000002', 'acao:varredura', 'automatico', 100);
insert into private.automation_spend (workspace_id, scope, month, spent)
values ('cd100000-0000-4000-8000-000000000002', 'acao:varredura', date_trunc('month', now())::date, 50);
select is((select t.booked from private.credit_totals('cd100000-0000-4000-8000-000000000002') t), 2700.00, 'antes da renovação: 3000 do plano − 500 + 200 de pacote');
select is(private.renew_contract_credits('cd100000-0000-4000-8000-000000000002'), true, 'o contrato com o aniversário vencido renova');
select is(
  (select amount from private.credit_entries where workspace_id = 'cd100000-0000-4000-8000-000000000002' and kind = 'ajuste'), -2500.00,
  'o restante do plano (2.500) sai num lançamento de ajuste negativo');
select is((select t.booked from private.credit_totals('cd100000-0000-4000-8000-000000000002') t), 3200.00,
  'o saldo é o plano novo (3.000, a faixa) mais o pacote que ficou (200)');
select is(pg_temp.lotes('cd100000-0000-4000-8000-000000000002'), 'pacote=200.00,plano=3000.00', 'o pacote não é tocado pela renovação');
select is((select kind || ':' || amount from private.credit_entries where workspace_id = 'cd100000-0000-4000-8000-000000000002' and note like 'Renovação mensal%'), 'plano:3000.00',
  'os créditos da faixa entram como plano');
select is((select spent from private.automation_spend where workspace_id = 'cd100000-0000-4000-8000-000000000002'), 0.00, 'o automático começa o período do zero');
select is(private.renew_contract_credits('cd100000-0000-4000-8000-000000000002'), false, 'repetir o job no mesmo período não renova de novo');
select is((select count(*)::int from private.contract_renewals where workspace_id = 'cd100000-0000-4000-8000-000000000002'), 1, 'uma renovação por período');
select is(private.renew_contract_credits('cd100000-0000-4000-8000-000000000003'), false, 'o primeiro período é o do provisionamento: nada a renovar');
select is(private.renew_contract_credits('cd100000-0000-4000-8000-000000000004'), false, 'contrato suspenso não renova');
select is(private.renew_contract_credits('e0a17e00-0000-4000-8000-000000000001'), false, 'a Equipe, ilimitada, não renova');

-- O pacote vencido sai do saldo; o que ainda vale fica.
update private.credit_entries set expires_at = now() - interval '1 day' where workspace_id = 'cd100000-0000-4000-8000-000000000005' and kind = 'pacote';
update private.credit_lots set expires_at = now() - interval '1 day' where workspace_id = 'cd100000-0000-4000-8000-000000000005' and kind = 'pacote';
select is(private.renew_all_contracts() >= 0, true, 'o job roda');
select is((select amount from private.credit_entries where workspace_id = 'cd100000-0000-4000-8000-000000000005' and note = 'Validade do pacote de créditos'), -50.00,
  'o que sobrou do pacote vencido sai do saldo');
select is((select t.booked from private.credit_totals('cd100000-0000-4000-8000-000000000005') t), 0.00, 'o saldo do pacote vencido é zero');
select ok(not has_function_privilege('authenticated', 'private.renew_all_contracts()', 'execute'), 'o job não é chamado pelo cliente');

-- 10. A Automação em automático, dentro do limite do contrato.
delete from private.automation_settings where workspace_id = 'cd100000-0000-4000-8000-000000000001';
select private.seed_contract_automation('cd100000-0000-4000-8000-000000000001');
select is((select string_agg(scope || '=' || mode || ':' || monthly_cap, ',' order by scope) from private.automation_settings where workspace_id = 'cd100000-0000-4000-8000-000000000001'),
  'acao:agentes=automatico:100000.00,acao:enriquecimento=automatico:100000.00,acao:varredura=automatico:100000.00',
  'os três tipos de ação vêm em automático, com o limite do contrato como teto');
update private.automation_settings set mode = 'confirmar', monthly_cap = null where workspace_id = 'cd100000-0000-4000-8000-000000000001' and scope = 'acao:varredura';
select private.seed_contract_automation('cd100000-0000-4000-8000-000000000001');
select is((select mode from private.automation_settings where workspace_id = 'cd100000-0000-4000-8000-000000000001' and scope = 'acao:varredura'), 'confirmar',
  'a migração não sobrescreve a escolha de um Administrador');
select is((select count(*)::int from private.automation_settings where workspace_id = 'e0a17e00-0000-4000-8000-000000000001'), 0, 'a Equipe, ilimitada, não precisa de teto');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'cd000000-0000-4000-8000-000000000002', true);
create temporary table provisionado on commit drop as select * from public.staff_provision_workspace('Cliente Novo', 'admin@cliente.test', 'profissional', null);
grant select on provisionado to authenticated;
reset role;
select is((select string_agg(scope || '=' || mode || ':' || monthly_cap, ',' order by scope) from private.automation_settings where workspace_id = (select workspace_id from provisionado)),
  'acao:agentes=automatico:4500.00,acao:enriquecimento=automatico:4500.00,acao:varredura=automatico:4500.00',
  'um Workspace provisionado já nasce com a Automação em automático, com os créditos do plano como teto');

-- 11. A guarda interna em dólar vem da faixa, por período, e nunca é mostrada.
insert into private.action_costs (workspace_id, action_type, provider, model_or_actor, source_ref, cost_usd, occurred_at) values
  ('cd100000-0000-4000-8000-000000000001', 'apify_actor', 'apify', 'actor-teste', 'antes-do-periodo', 500, private.credit_period_start('cd100000-0000-4000-8000-000000000001') - interval '1 day');
select ok(private.signal_budget_block('cd100000-0000-4000-8000-000000000001', 0) is null, 'o gasto de antes do período do contrato não conta');
insert into private.action_costs (workspace_id, action_type, provider, model_or_actor, source_ref, cost_usd) values
  ('cd100000-0000-4000-8000-000000000001', 'apify_actor', 'apify', 'actor-teste', 'neste-periodo-1', 190);
select ok(private.signal_budget_block('cd100000-0000-4000-8000-000000000001', 0) is null, 'US$ 190 de US$ 195 da faixa Profissional ainda cabem');
insert into private.action_costs (workspace_id, action_type, provider, model_or_actor, source_ref, cost_usd) values
  ('cd100000-0000-4000-8000-000000000001', 'apify_actor', 'apify', 'actor-teste', 'neste-periodo-2', 10);
select is(private.signal_budget_block('cd100000-0000-4000-8000-000000000001', 0), 'teto_atingido', 'passou da guarda da faixa: a busca para');
select is((select monthly_cap_usd from private.workspace_signal_budget where workspace_id = (select workspace_id from provisionado)), 195.00,
  'a linha do teto do Workspace provisionado é a guarda da faixa');
select ok(not has_function_privilege('authenticated', 'public.workspace_signal_monthly_cap(uuid)', 'execute'), 'o cliente não lê o dólar');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('get_contract_summary', 'get_credit_balance', 'list_credit_action_prices', 'list_visible_signal_catalog', 'list_credit_entries')
    and pg_get_function_result(p.oid) ~* 'usd|dolar'), 0,
  'nenhuma função que o cliente chama devolve dólar');
select ok(not has_column_privilege('authenticated', 'public.signal_catalog', 'estimated_cost_usd', 'select')
  and has_column_privilege('authenticated', 'public.signal_catalog', 'credits_per_account', 'select'),
  'o cliente lê o preço em créditos do card, e não o dólar de custo');

-- 12. Atingido o limite: o Aviso diz só a mensagem do produto.
insert into private.automation_settings (workspace_id, scope, mode, monthly_cap)
values ('cd100000-0000-4000-8000-000000000006', 'acao:varredura', 'automatico', 1);
select is(public.consume_automation_cap('cd100000-0000-4000-8000-000000000006', 'acao:varredura', 1), 'ok', 'o primeiro gasto cabe no teto');
select is((select body from private.workspace_notices where workspace_id = 'cd100000-0000-4000-8000-000000000006'),
  'Limite do mês atingido. A Automação volta na renovação ou fale com a equipe Althius.', 'o Aviso do limite atingido diz só a mensagem do produto');

-- 13. O uso do período no resumo do contrato.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'cd000000-0000-4000-8000-000000000001', true);
select is((select month_usage from public.get_contract_summary('cd100000-0000-4000-8000-000000000005')), 3050.00, 'o resumo soma o uso do período do contrato');
reset role;

select * from finish();
rollback;

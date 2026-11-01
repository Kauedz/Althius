begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(73);

-- O rollout só de vagas (migration 20261219010000) pôs "out" os actors e desligou as cascatas que não são de vagas, e a
-- cascata do Indeed no mercado (20261219020000) nasce disponível. Este teste é anterior aos dois e confere cada fonte no
-- estado que as migrations de antes deixavam, então volta a ele só nesta transação: os 5 actors validados disponíveis, os
-- outros em teste e as cascatas em teste.
update private.signal_actors
set state = case when actor_id in (
    'harvestapi~linkedin-profile-scraper', 'harvestapi~linkedin-profile-search', 'harvestapi~linkedin-post-search',
    'silva95gustavo~linkedin-ad-library-scraper', 'compass~google-maps-reviews-scraper'
  ) then 'available' else 'testing' end
where state = 'out';
update private.signal_cascades set state = 'testing' where state = 'disabled' or signal_type = 'vaga_indeed_mercado';

-- Cascatas de Sinais (sinais em cascata, fatia 2): o registro de cascatas, a reserva e a liquidação do custo real, o
-- rastro por passo e o isolamento por Workspace. Empresas fictícias.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('c1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('c1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'carla@sul.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('c2000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('c2000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into private.workspace_contracts (workspace_id, tier_id, starts_at) select w.id, 'escala', date_trunc('month', now()) from public.workspaces w on conflict (workspace_id) do nothing; -- contrato de teste (acesso-e-planos)
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'admin', true),
  ('c2000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002', 'admin', true);
insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, linkedin_url, legal_identifier, created_by) values
  ('c3000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'Alfa Importadora', 'https://alfa.test', 'alfa.test', 'https://linkedin.com/company/alfa', '11.222.333/0001-81', 'c1000000-0000-0000-0000-000000000001'),
  ('c3000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000002', 'Beta Trading', 'https://beta.test', 'beta.test', null, null, 'c1000000-0000-0000-0000-000000000002');
select public.grant_credits('c2000000-0000-0000-0000-000000000001', 100, 'plano', 'saldo de teste');
select public.grant_credits('c2000000-0000-0000-0000-000000000002', 1, 'plano', 'saldo de teste');

-- 1. O registro de cascatas é só do servidor.
select ok(
  not has_table_privilege('authenticated', 'private.signal_cascades', 'select')
    and not has_table_privilege('service_role', 'private.signal_cascade_runs', 'select')
    and not has_table_privilege('authenticated', 'private.signal_cascade_run_steps', 'select'),
  'ninguém do app lê as tabelas de cascata direto'
);
select ok(
  not has_function_privilege('authenticated', 'public.begin_cascade_run(uuid, uuid, text, text, uuid, text, numeric, integer, boolean, integer)', 'execute')
    and not has_function_privilege('authenticated', 'public.finish_cascade_run(uuid, text, numeric, integer, integer, integer, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.signal_cascade_for_type(text)', 'execute')
    and not has_function_privilege('authenticated', 'public.signal_cascade_catalog()', 'execute')
    and has_function_privilege('service_role', 'public.begin_cascade_run(uuid, uuid, text, text, uuid, text, numeric, integer, boolean, integer)', 'execute')
    and has_function_privilege('service_role', 'public.finish_cascade_run(uuid, text, numeric, integer, integer, integer, text)', 'execute'),
  'abrir, fechar e ler cascatas é só do servidor'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'private.signal_cascade_runs'::regclass)
    and (select relrowsecurity from pg_class where oid = 'private.signal_cascade_run_steps'::regclass)
    and (select relrowsecurity from pg_class where oid = 'private.signal_cascades'::regclass),
  'RLS ligado em todas as tabelas de cascata'
);

-- 2. A primeira cascata (A1) vem registrada, em teste, com os passos na ordem.
select is(
  (select state from private.signal_cascades where signal_type = 'vaga_comex'), 'testing',
  'a cascata A1 nasce em teste, como todo actor novo');
select is(
  (select array_agg(handler order by ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'vaga_comex'),
  array['linkedin_vagas', 'confirmar_vaga_comex', 'linkedin_empresa', 'casar_com_contas', 'cnpj_da_conta'],
  'os passos do A1: vagas, confirmação, empresa, casamento com as Contas e CNPJ');
select is(
  (select jsonb_array_length(public.signal_cascade_for_type('vaga_comex') -> 'steps')), 5,
  'signal_cascade_for_type devolve a definição com os passos');
select is(
  (select public.signal_cascade_for_type('nao_existe')), null::jsonb, 'tipo sem cascata devolve nulo');

-- 3. Modelo de preço: aluguel nunca entra, nem como passo nem como alternativa.
select throws_ok(
  $$ insert into private.signal_cascade_steps (cascade_id, ordem, kind, handler, actor_id, price_model)
     select id, 8, 'actor', 'passo_x', 'alguem~aluguel', 'FLAT_PRICE_PER_MONTH' from private.signal_cascades where signal_type = 'vaga_comex' $$,
  '23514', null, 'um actor de aluguel é recusado no registro');
select throws_ok(
  $$ insert into private.signal_cascade_steps (cascade_id, ordem, kind, handler, actor_id, price_model, fallbacks)
     select id, 9, 'actor', 'passo_x', 'alguem~pago', 'PAY_PER_EVENT', '[{"kind":"actor","actorId":"outro~aluguel","priceModel":"FLAT_PRICE_PER_MONTH"}]'::jsonb
     from private.signal_cascades where signal_type = 'vaga_comex' $$,
  '23514', null, 'a alternativa de aluguel também é recusada');
select throws_ok(
  $$ insert into private.signal_cascade_steps (cascade_id, ordem, kind, handler, actor_id, price_model)
     select id, 10, 'actor', 'passo_x', null, 'PAY_PER_EVENT' from private.signal_cascades where signal_type = 'vaga_comex' $$,
  '23514', null, 'um passo de actor precisa do actor');
select lives_ok(
  $$ insert into private.signal_cascade_steps (cascade_id, ordem, kind, handler, actor_id, price_model)
     select id, 11, 'actor', 'passo_x', 'alguem~so-computacao', 'COMPUTE_ONLY' from private.signal_cascades where signal_type = 'vaga_comex' $$,
  'um actor só de computação (Free) entra');
delete from private.signal_cascade_steps where ordem >= 8;

-- 4. "Sem fonte" é um estado válido, com o motivo, e nunca tem passo.
select throws_ok(
  $$ insert into private.signal_cascades (signal_type, icp, name, state) values ('sem_fonte_sem_motivo', 'A', 'x', 'sem_fonte') $$,
  '23514', null, 'sem_fonte exige o motivo');
insert into private.signal_cascades (signal_type, icp, name, state, sem_fonte_motivo)
values ('radar_teste', 'A', 'Radar de teste', 'sem_fonte', 'A consulta é individual e exige verificação humana; não há fonte pública em massa.');
select throws_ok(
  $$ insert into private.signal_cascade_steps (cascade_id, ordem, kind, handler) select id, 1, 'regra', 'passo_x' from private.signal_cascades where signal_type = 'radar_teste' $$,
  '23514', null, 'um Sinal sem fonte não tem passos');
select throws_ok(
  $$ insert into private.signal_cascades (signal_type, icp, name, state, sem_fonte_motivo) values ('marca_vazada', 'A', 'x', 'sem_fonte', 'Sem actor adequado na Apify.') $$,
  '23514', null, 'o motivo não cita o fornecedor nem o actor');
select ok(
  exists (select 1 from private.signal_catalog where signal_type = 'vaga_comex' and origin = 'externo'),
  'a cascata entra no catálogo de Sinais (os Sinais e Monitoramentos apontam para ele)');
select throws_ok(
  $$ insert into private.signal_cascades (signal_type, icp, name) values ('vaga_linkedin', 'A', 'repete um actor do registro') $$,
  '23514', null, 'um tipo de Sinal não tem actor e cascata ao mesmo tempo');

-- 5. Nenhum texto gravado leva a marca nem um token.
select throws_ok(
  $$ insert into private.signal_cascade_runs (workspace_id, cascade_id, origin, idempotency_key, state, friendly_error, est_cost_usd, est_credits, cap_usd)
     select 'c2000000-0000-0000-0000-000000000001', id, 'conversa', 'marca-1', 'failed', 'O Apify falhou', 0.1, 1, 0.5 from private.signal_cascades where signal_type = 'vaga_comex' $$,
  '23514', null, 'o erro amigável da execução não cita o fornecedor');
select throws_ok(
  $$ insert into private.signal_cascade_runs (workspace_id, cascade_id, origin, idempotency_key, state)
     select 'c2000000-0000-0000-0000-000000000001', id, 'conversa', 'marca-2', 'running' from private.signal_cascades where signal_type = 'vaga_comex' $$,
  '23502', null, 'a execução sem estimativa é recusada');

-- 6. Abrir uma execução: sem_fonte e em teste não reservam nada.
select is((select outcome from public.begin_cascade_run('c2000000-0000-0000-0000-000000000001', null, 'radar_teste', 'conversa', null, 'k-radar', 0.2, null, false)),
  'sem_fonte', 'sem fonte: nada é reservado');
select is((select outcome from public.begin_cascade_run('c2000000-0000-0000-0000-000000000001', null, 'vaga_comex', 'conversa', null, 'k-teste', 0.2, null, false)),
  'em_teste', 'cascata em teste não roda sem o aval de quem chama');
select is((select outcome from public.begin_cascade_run('c2000000-0000-0000-0000-000000000001', null, 'nao_existe', 'conversa', null, 'k-x', 0.2, null, false)),
  'sem_cascata', 'tipo desconhecido');
select is((select count(*)::integer from private.credit_reservations where action = 'cascata_de_sinais'), 0,
  'sem_fonte, em teste e desconhecido não reservaram crédito');

select public.set_signal_cascade_state('vaga_comex', 'available', '1');
create temporary table abertura on commit drop as
  select * from public.begin_cascade_run('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'vaga_comex', 'conversa', null, 'k-1', 0.30, null, false);
select is((select outcome from abertura), 'go', 'cascata disponível abre a execução');
select is(
  (select est_credits from abertura), 2,
  'reserva o preço fixo: vaga é faixa 2, 2 créditos por Conta, numa Conta (o custo da fonte não entra)');
select is(
  (select amount from private.credit_reservations where id = (select reservation_id from abertura)), 2.00,
  'a reserva no extrato é de 2 créditos');
select is(
  (select state from private.signal_cascade_runs where id = (select run_id from abertura)), 'running',
  'a execução fica registrada como em andamento');

-- 7. Idempotência: a mesma chave devolve a mesma execução e a mesma reserva, sem reservar de novo.
select is(
  (select row(outcome, run_id, reservation_id)::text from public.begin_cascade_run('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'vaga_comex', 'conversa', null, 'k-1', 0.30, null, false)),
  (select row('em_andamento', run_id, reservation_id)::text from abertura), 'a mesma chave aponta a mesma execução em andamento');
select is((select count(*)::integer from private.credit_reservations where action = 'cascata_de_sinais'), 1, 'repetir não reserva duas vezes');

-- Uma execução presa há mais de 20 minutos é fechada como falha e solta a reserva; a chave fica gasta.
create temporary table presa on commit drop as
  select * from public.begin_cascade_run('c2000000-0000-0000-0000-000000000001', null, 'vaga_comex', 'conversa', null, 'k-presa', 0.30, null, false);
update private.signal_cascade_runs set started_at = now() - interval '1 hour' where id = (select run_id from presa);
select is(
  (select outcome from public.begin_cascade_run('c2000000-0000-0000-0000-000000000001', null, 'vaga_comex', 'conversa', null, 'k-presa', 0.30, null, false)), 'done',
  'a execução presa há mais de 20 minutos é dada como terminada');
select is(
  (select row(r.state, v.status)::text from private.signal_cascade_runs r join private.credit_reservations v on v.id = r.reservation_id where r.id = (select run_id from presa)),
  '(failed,released)', 'a execução presa vira falha e a reserva é liberada');

-- 8. O teto pedido por quem chama limita a reserva.
select is(
  (select est_credits from public.begin_cascade_run('c2000000-0000-0000-0000-000000000001', null, 'vaga_comex', 'conversa', null, 'k-teto', 5.00, 2, false)), 2,
  'o teto de 2 créditos pedido vale mais que a estimativa');
select is(
  (select cap_usd from public.begin_cascade_run('c2000000-0000-0000-0000-000000000001', null, 'vaga_comex', 'conversa', null, 'k-teto', 5.00, 2, false)), 0.2000::numeric,
  'o teto em dólar da execução sai do teto em créditos: 2 × 0,30 ÷ 3 = US$ 0,20');

-- 9. Sem saldo: nada é reservado nem registrado.
select is(
  (select outcome from public.begin_cascade_run('c2000000-0000-0000-0000-000000000002', null, 'vaga_comex', 'conversa', null, 'k-sul', 0.30, null, false)), 'no_credits',
  'Workspace com 1 crédito não abre uma cascata de 3');
select is((select count(*)::integer from private.signal_cascade_runs where workspace_id = 'c2000000-0000-0000-0000-000000000002'), 0, 'a recusa não deixa execução');

-- 10. Liquidação: o preço é fixo. Concluída, cobra o que reservou; o custo real da fonte só alimenta a guarda em dólar.
create temporary table fechamento on commit drop as
  select * from public.finish_cascade_run((select run_id from abertura), 'succeeded', 0.25, 0, 0, 0, null);
select is((select credits_charged from fechamento), 2, 'concluída, cobra o preço fixo (2 créditos), seja qual for o custo da fonte');
select is(
  (select status from private.credit_reservations where id = (select reservation_id from abertura)), 'settled',
  'a reserva foi liquidada');
select is(
  (select settled_quantity from private.credit_reservations where id = (select reservation_id from abertura)), 2,
  'os 2 reservados foram cobrados');
select is(
  (select row(state, real_cost_usd, credits_charged)::text from private.signal_cascade_runs where id = (select run_id from abertura)),
  '(succeeded,0.250000,2)', 'a execução guarda o custo real e os créditos cobrados');
select is(
  (select credits_charged from public.finish_cascade_run((select run_id from abertura), 'succeeded', 9.99, 0, 0, 0, null)), 2,
  'fechar de novo devolve o mesmo e não cobra de novo');

-- o custo irrisório da fonte não muda o preço: concluída, cobra o preço fixo
create temporary table abertura2 on commit drop as
  select * from public.begin_cascade_run('c2000000-0000-0000-0000-000000000001', null, 'vaga_comex', 'conversa', null, 'k-2', 0.30, null, false);
select is(
  (select credits_charged from public.finish_cascade_run((select run_id from abertura2), 'succeeded', 0.002, 1, 1, 0, null)), 2,
  'custo irrisório com Sinal gerado cobra o preço fixo de 2 créditos');

-- sem resultado e sem custo: libera a reserva, cobra zero
create temporary table abertura3 on commit drop as
  select * from public.begin_cascade_run('c2000000-0000-0000-0000-000000000001', null, 'vaga_comex', 'conversa', null, 'k-3', 0.30, null, false);
select is(
  (select credits_charged from public.finish_cascade_run((select run_id from abertura3), 'failed', 0, 0, 0, 0, 'A fonte pública está indisponível agora.')), 0,
  'falha sem custo não cobra');
select is(
  (select status from private.credit_reservations where id = (select reservation_id from abertura3)), 'released',
  'a reserva da falha total foi liberada');

-- aborto: o preço é fixo e a execução não entregou, então não cobra
create temporary table abertura4 on commit drop as
  select * from public.begin_cascade_run('c2000000-0000-0000-0000-000000000001', null, 'vaga_comex', 'conversa', null, 'k-4', 0.30, null, false);
select is(
  (select credits_charged from public.finish_cascade_run((select run_id from abertura4), 'aborted', 0.10, 0, 0, 0, 'O teto da busca foi atingido.')), 0,
  'abortada por teto não cobra, mesmo com custo de fonte já gasto: a guarda interna absorve');

-- o custo real da fonte não muda o que o cliente paga
create temporary table abertura5 on commit drop as
  select * from public.begin_cascade_run('c2000000-0000-0000-0000-000000000001', null, 'vaga_comex', 'conversa', null, 'k-5', 0.30, null, false);
select is(
  (select credits_charged from public.finish_cascade_run((select run_id from abertura5), 'succeeded', 50, 3, 3, 0, null)), 2,
  'um custo muito acima do estimado não muda o preço fixo');

-- 11. O rastro por passo: run id do Apify, actor, custo e erro real ficam gravados.
create temporary table passo on commit drop as
  select public.start_cascade_step((select run_id from abertura), 1, 1, 'linkedin_vagas', 'actor', 'curious_coder~linkedin-jobs-scraper', 0) as id;
select lives_ok(
  $$ select public.finish_cascade_step((select id from passo), 'failed', 'run-abc', '1.7.18', 1, 0, 0.0001, 402, 'Insufficient credit') $$,
  'o fim do passo grava run id, build, conta usada, custo, status HTTP e o erro real');
select is(
  (select row(apify_run_id, token_index, http_status, real_error, state)::text from private.signal_cascade_run_steps where id = (select id from passo)),
  '(run-abc,1,402,"Insufficient credit",failed)', 'o passo guarda o erro real, sem segredo');
select throws_ok(
  $$ select public.finish_cascade_step((select id from passo), 'failed', 'run-abc', '1', 0, 0, 0, 402, 'token apify_api_ABCDEFGHIJ1234567890 vazou') $$,
  '23514', null, 'um token no erro real é recusado pelo banco');
select is(
  (select row(model_or_actor, cost_usd, source_ref)::text from private.action_costs where source_ref = 'run-abc'),
  '(curious_coder~linkedin-jobs-scraper,0.000100,run-abc)', 'o custo real do run vai para o relatório de custos');
select lives_ok(
  $$ select public.finish_cascade_step((select id from passo), 'failed', 'run-abc', '1.7.18', 1, 0, 0.0001, 402, 'Insufficient credit') $$,
  'fechar o passo de novo não duplica o custo');
select is((select count(*)::integer from private.action_costs where source_ref = 'run-abc'), 1, 'uma linha de custo por run do Apify');

-- 12. A execução do Monitoramento: uma por dia por Monitoramento, e o automático confere o teto.
insert into private.signal_monitors (id, workspace_id, signal_type, name, state, audience, created_by, next_run_at)
values ('c4000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'vaga_comex', 'Comex', 'ativo',
  '{"accountIds":["c3000000-0000-0000-0000-000000000001"]}', 'c1000000-0000-0000-0000-000000000001', now());
select is(
  (select outcome from public.begin_cascade_run('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'vaga_comex', 'monitor', 'c4000000-0000-0000-0000-000000000001', 'm-1', 0.30, null, false)),
  'confirmar', 'o automático em "confirmar" não roda sozinho e não deixa reserva');
select is((select count(*)::integer from private.credit_reservations where action_key = 'cascade:m-1'), 0, 'a recusa do automático solta a reserva');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000001', true);
select public.save_automation_setting('c2000000-0000-0000-0000-000000000001', 'acao:varredura', 'automatico', 10);
reset role;
create temporary table abertura6 on commit drop as
  select * from public.begin_cascade_run('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'vaga_comex', 'monitor', 'c4000000-0000-0000-0000-000000000001', 'm-2', 0.30, null, false);
select is((select outcome from abertura6), 'go', 'com o automático ligado e o teto aprovado, a execução abre');
select is(
  (select outcome from public.begin_cascade_run('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'vaga_comex', 'monitor', 'c4000000-0000-0000-0000-000000000001', 'm-3', 0.30, null, false)),
  'ja_rodou_hoje', 'o Monitoramento automático roda uma vez por dia');
select is(
  (select spent from private.automation_spend where workspace_id = 'c2000000-0000-0000-0000-000000000001' and scope = 'acao:varredura'), 2.00,
  'a execução consumiu 2 créditos (o preço fixo) do teto do automático');
select public.finish_cascade_run((select run_id from abertura6), 'succeeded', 0.25, 0, 0, 0, null);
select is(
  (select spent from private.automation_spend where workspace_id = 'c2000000-0000-0000-0000-000000000001' and scope = 'acao:varredura'), 2.00,
  'o que sobrou da reserva (1 crédito) volta ao teto do automático');

-- 13. Teto diário do Workspace.
update private.signal_cascade_settings set daily_credit_cap = 5;
select is(
  (select outcome from public.begin_cascade_run('c2000000-0000-0000-0000-000000000001', null, 'vaga_comex', 'conversa', null, 'k-dia', 0.30, null, false)),
  'limite_diario', 'o Workspace que já gastou perto do teto do dia não abre outra cascata');
update private.signal_cascade_settings set daily_credit_cap = 50;

-- 14. Isolamento: as Contas e as execuções são de um Workspace só.
select is(
  (select jsonb_array_length(public.signal_cascade_accounts('c2000000-0000-0000-0000-000000000001', array['c3000000-0000-0000-0000-000000000002']::uuid[], 100))), 0,
  'a Conta de outro Workspace não sai pelo Workspace errado');
select is(
  (select jsonb_array_length(public.signal_cascade_accounts('c2000000-0000-0000-0000-000000000001', null, 100))), 1,
  'sem lista, devolve as Contas ativas do próprio Workspace');
select is(
  (select public.signal_cascade_accounts('c2000000-0000-0000-0000-000000000001', null, 100) -> 0 ->> 'cnpj'), '11.222.333/0001-81',
  'a Conta traz o CNPJ, para o passo de Receita');
select throws_ok(
  $$ select public.record_signal('c2000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000002', null, 'vaga_comex', 'k', 'Abriu vaga', now(), 'LinkedIn Vagas', 'x') $$,
  'P0002', null, 'gravar o Sinal numa Conta de outro Workspace é recusado');
select is(
  (select public.record_signal('c2000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001', null, 'vaga_comex', 'vaga|alfa|analista|2026', 'Abriu vaga de Analista de Comex', now(), 'LinkedIn Vagas', 'x')), true,
  'o Sinal da cascata é gravado pelo record_signal de sempre');
select is(
  (select public.record_signal('c2000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001', null, 'vaga_comex', 'vaga|alfa|analista|2026', 'Abriu vaga de Analista de Comex', now(), 'LinkedIn Vagas', 'x')), false,
  'o mesmo acontecimento não cria Sinal de novo');

-- 15. O Monitoramento de uma cascata disponível é reivindicado como o de um actor; em teste, não.
update private.signal_monitors set next_run_at = now(), claimed_until = null;
select ok(private.signal_monitors_due(), 'o relógio vê o Monitoramento da cascata disponível');
select is(
  (select signal_type from public.claim_due_signal_monitors(5) limit 1), 'vaga_comex', 'a varredura reivindica o Monitoramento da cascata');
update private.signal_monitors set claimed_until = null;
select public.set_signal_cascade_state('vaga_comex', 'testing');
select is((select count(*)::integer from public.claim_due_signal_monitors(5)), 0, 'cascata em teste não é varrida');
select is((select private.available_signal_origin('vaga_comex')), null, 'cascata em teste não aceita Monitoramento novo');
select public.set_signal_cascade_state('vaga_comex', 'available');
select is((select private.available_signal_origin('vaga_comex')), 'externo', 'cascata disponível aceita Monitoramento');

-- 16. O diagnóstico do relógio: uma linha, só leitura, sem segredo.
select is(
  (select (private.signal_runner_diagnostics() ->> 'cascades_available')::integer), 1, 'o diagnóstico conta a cascata disponível');
select ok(
  not (private.signal_runner_diagnostics()::text ~* '(token|apify_api)'),
  'o diagnóstico não devolve token nem segredo');
select is(
  (select (private.signal_runner_diagnostics() ->> 'monitors_runnable_and_due')::integer), 1, 'o diagnóstico vê o Monitoramento rodável e vencido');

-- 17. O que a tela e o preço mostram.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000001', true);
select is(
  (select state from public.list_signal_catalog() where signal_type = 'vaga_comex'), 'available',
  'o catálogo mostra o estado da cascata');
reset role;
select ok(
  not exists (select 1 from public.list_credit_action_prices() where action = 'cascata_de_sinais'),
  'a ação interna da cascata não entra na tabela de preços da tela');

select * from finish();
rollback;

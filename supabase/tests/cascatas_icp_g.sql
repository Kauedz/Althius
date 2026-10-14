begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(23);

-- ICP G (corretoras de benefícios): dois Sinais de Conta em teste, com cascata de fotografia mensal, e três sem fonte.
select is(
  (select array_agg(signal_type || ':' || state || ':' || scope order by signal_type) from private.signal_cascades where icp = 'G'),
  array['caged_por_empresa:sem_fonte:conta', 'cruzando_faixa_de_headcount:testing:conta', 'frota_crescendo:sem_fonte:conta',
        'nova_filial_icp_g:testing:conta', 'renovacao_de_apolice:sem_fonte:conta'],
  'o estado e o escopo de cada Sinal do ICP G');
select is(
  (select array_agg(s.handler order by s.ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'cruzando_faixa_de_headcount'),
  array['g_contas_para_headcount', 'g_headcount_linkedin', 'g_cruzou_faixa_de_funcionarios'], 'os passos de headcount');
select is(
  (select array_agg(s.handler order by s.ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'nova_filial_icp_g'),
  array['g_contas_para_filiais', 'g_mapa_de_filiais', 'g_nova_filial'], 'os passos de nova filial');
select ok(
  (select bool_and(s.handler like 'g\_%') from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.icp = 'G'),
  'todo handler do ICP G leva o prefixo g_ (não colide com o ICP F)');
select is(
  (select array_agg(s.kind || ':' || s.price_model order by s.ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'nova_filial_icp_g'),
  array['regra:NONE', 'actor:PAY_PER_EVENT', 'regra:NONE'], 'só o passo da fonte custa, por evento (nada de aluguel mensal)');
select is(
  (select array_agg(s.actor_id order by c.signal_type) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.icp = 'G' and s.kind = 'actor'),
  array['harvestapi~linkedin-company', 'johnatan029~branch-network'], 'o actor de cada cascata fica só na coluna técnica');
select is(
  (select (s.est_fixed_usd, s.est_per_item_usd, s.est_items, s.max_items)::text from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id
    where c.signal_type = 'cruzando_faixa_de_headcount' and s.kind = 'actor'),
  '(0.000050,0.004000,100,100)', 'a página da empresa custa US$ 0,004 por empresa, até 100 por rodada');
select is(
  (select (s.est_fixed_usd, s.est_per_item_usd, s.est_items, s.max_items)::text from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id
    where c.signal_type = 'nova_filial_icp_g' and s.kind = 'actor'),
  '(0.000050,0.010000,40,40)', 'o mapa de filiais custa US$ 0,01 por mapa, até 40 por rodada');
select ok(
  (select bool_and(c.cap_usd >= (select sum(s.est_fixed_usd + s.est_per_item_usd * coalesce(s.max_items, s.est_items)) from private.signal_cascade_steps s where s.cascade_id = c.id))
   from private.signal_cascades c where c.icp = 'G' and c.state <> 'sem_fonte'),
  'o pior caso de cada cascata cabe no teto');
select is(
  (select input_template -> 'faixas' from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id
    where c.signal_type = 'cruzando_faixa_de_headcount' and s.handler = 'g_cruzou_faixa_de_funcionarios'),
  '[50, 100, 200]'::jsonb, 'os limiares de headcount ficam no modelo de entrada e são configuráveis');
select is(
  (select count(*)::integer from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.state = 'sem_fonte' and c.icp = 'G'),
  0, 'o Sinal sem fonte não tem passos');
select ok(
  (select bool_and(sem_fonte_motivo is not null and sem_fonte_motivo !~* '(apify|\yactors?\y)') from private.signal_cascades where state = 'sem_fonte' and icp = 'G'),
  'o motivo de não ter fonte existe e não cita fornecedor');
select ok(
  (select bool_and(name !~* '(apify|\yactors?\y)' and coalesce(notes, '') !~* '(apify|\yactors?\y)') from private.signal_cascades where icp = 'G'),
  'nome e notas dos Sinais do ICP G não citam fornecedor');
select ok(
  not exists (select 1 from public.signal_cascade_catalog() k where k.icp = 'G' and (k.name || coalesce(k.sem_fonte_motivo, '')) ~* '(apify|\yactors?\y)'),
  'o catálogo que o Hermes lê não cita fornecedor');
select ok(
  not exists (select 1 from private.signal_cascades c where c.icp = 'G' and c.state = 'available'),
  'nenhum Sinal novo nasce disponível');
select ok(
  not exists (select 1 from private.signal_cascades c where c.icp = 'G' and c.sem_fonte_motivo ~* '(saúde|saude|plano de)'),
  'nenhuma cascata do ICP G toca em dado de saúde (LGPD)');

-- Entram no catálogo e o catálogo do servidor devolve o motivo.
select ok((select sem_fonte_motivo like '%CNPJ%' from public.signal_cascade_catalog() where signal_type = 'caged_por_empresa'), 'o catálogo explica o CAGED sem CNPJ');

-- Sem fonte nunca reserva crédito; em teste espera o aval; com ele reserva e a rodada sem custo não cobra.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values ('e1000000-0000-0000-0000-0000000000a7', 'authenticated', 'authenticated', 'ana@corretora.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values ('e2000000-0000-0000-0000-0000000000a7', 'empresa', 'Corretora');
insert into private.workspace_contracts (workspace_id, tier_id) select w.id, 'escala' from public.workspaces w on conflict (workspace_id) do nothing; -- contrato de teste (acesso-e-planos)
insert into public.workspace_memberships (workspace_id, user_id, role, active) values ('e2000000-0000-0000-0000-0000000000a7', 'e1000000-0000-0000-0000-0000000000a7', 'admin', true);
select public.grant_credits('e2000000-0000-0000-0000-0000000000a7', 50, 'plano', 'saldo de teste');
select is(
  (select outcome from public.begin_cascade_run('e2000000-0000-0000-0000-0000000000a7', null, 'frota_crescendo', 'conversa', null, 'k-g1', 0.1, null, true)),
  'sem_fonte', 'o Sinal sem fonte não reserva nem com o aval de teste');
select throws_ok($$ select public.set_signal_cascade_state('renovacao_de_apolice', 'available') $$, '55000', null, 'e não pode ser liberado');
select is(
  (select outcome from public.begin_cascade_run('e2000000-0000-0000-0000-0000000000a7', null, 'nova_filial_icp_g', 'conversa', null, 'k-g2', 0.4, null, false)),
  'em_teste', 'a cascata de filial em teste espera o aval');
create temporary table ab on commit drop as
  select * from public.begin_cascade_run('e2000000-0000-0000-0000-0000000000a7', null, 'cruzando_faixa_de_headcount', 'conversa', null, 'k-g3', 0.4, null, true);
select is((select outcome || ':' || (est_credits > 0)::text from ab), 'go:true', 'com o aval, a cascata reserva crédito');
select is(
  (select credits_charged from public.finish_cascade_run((select run_id from ab), 'succeeded', 0, 0, 0, 0, null)), 0,
  'sem consumo e sem Sinal novo, nada é cobrado');
select is(
  (select status from private.credit_reservations where action_key = 'cascade:k-g3'), 'released', 'e a reserva é liberada');

select * from finish();
rollback;

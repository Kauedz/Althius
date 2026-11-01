begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(16);

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

-- ICP A, fora o A1: os quatro Sinais registrados (dois de mercado em teste, dois sem fonte), sem citar fornecedor.
select is(
  (select array_agg(signal_type || ':' || state || ':' || scope order by signal_type) from private.signal_cascades where icp = 'A' and signal_type <> 'vaga_comex'),
  array['habilitacao_radar:sem_fonte:conta', 'ncm_nova_na_pauta:testing:mercado', 'novo_importador:sem_fonte:conta', 'volume_por_porto:testing:mercado'],
  'o estado e o escopo de cada Sinal do ICP A');
select is(
  (select array_agg(s.handler order by s.ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'ncm_nova_na_pauta'),
  array['comexstat_ncm_janelas', 'ncms_novas_na_pauta'], 'os passos de A3');
select is(
  (select array_agg(s.handler order by s.ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'volume_por_porto'),
  array['comexstat_urf_mensal', 'volume_por_porto'], 'os passos de A4');
select is(
  (select array_agg(s.kind || ':' || s.price_model order by s.ordem) from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'ncm_nova_na_pauta'),
  array['fonte_publica:FREE', 'regra:NONE'], 'a fonte aberta e a regra não custam à plataforma');
select is(
  (select count(*)::integer from private.signal_cascade_steps s join private.signal_cascades c on c.id = s.cascade_id where c.signal_type in ('novo_importador', 'habilitacao_radar')),
  0, 'o Sinal sem fonte não tem passos');
select ok(
  (select bool_and(sem_fonte_motivo is not null and sem_fonte_motivo !~* '(apify|\yactors?\y)') from private.signal_cascades where state = 'sem_fonte' and icp = 'A'),
  'o motivo de não ter fonte existe e não cita fornecedor');
select ok(
  not exists (select 1 from private.signal_cascades c where c.icp = 'A' and c.signal_type <> 'vaga_comex' and c.state = 'available'),
  'nenhum Sinal novo nasce disponível');
select ok(
  (select bool_and(cap_usd <= 0.05) from private.signal_cascades where signal_type in ('ncm_nova_na_pauta', 'volume_por_porto')),
  'o teto de uma cascata sem custo de fonte é baixo');

-- Entram no catálogo, e o catálogo do servidor devolve o motivo.
select is((select state from public.signal_cascade_catalog() where signal_type = 'habilitacao_radar'), 'sem_fonte', 'o catálogo mostra o Sinal sem fonte');
select ok((select sem_fonte_motivo like '%verificação humana%' from public.signal_cascade_catalog() where signal_type = 'habilitacao_radar'), 'com o motivo');

-- Sem fonte nunca reserva crédito e nunca vira disponível.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values ('e1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values ('e2000000-0000-0000-0000-000000000001', 'empresa', 'Norte');
insert into private.workspace_contracts (workspace_id, tier_id, starts_at) select w.id, 'escala', date_trunc('month', now()) from public.workspaces w on conflict (workspace_id) do nothing; -- contrato de teste (acesso-e-planos)
insert into public.workspace_memberships (workspace_id, user_id, role, active) values ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'admin', true);
select public.grant_credits('e2000000-0000-0000-0000-000000000001', 50, 'plano', 'saldo de teste');
select is(
  (select outcome from public.begin_cascade_run('e2000000-0000-0000-0000-000000000001', null, 'novo_importador', 'conversa', null, 'k-sf', 0.1, null, true)),
  'sem_fonte', 'o Sinal sem fonte não reserva nem com o aval de teste');
select throws_ok($$ select public.set_signal_cascade_state('habilitacao_radar', 'available') $$, '55000', null, 'e não pode ser liberado');

-- O Sinal de mercado em teste não roda sem o aval; com ele, reserva e grava no feed.
select is(
  (select outcome from public.begin_cascade_run('e2000000-0000-0000-0000-000000000001', null, 'ncm_nova_na_pauta', 'conversa', null, 'k-m1', 0.0, null, false)),
  'em_teste', 'o Sinal de mercado em teste espera o aval');
create temporary table ab on commit drop as
  select * from public.begin_cascade_run('e2000000-0000-0000-0000-000000000001', null, 'ncm_nova_na_pauta', 'conversa', null, 'k-m2', 0.0, null, true);
select is((select outcome || ':' || est_credits from ab), 'go:3', 'com o aval, a cascata de Mercado reserva o preço fixo: 3 créditos por execução');
select is(
  (select credits_charged from public.finish_cascade_run((select run_id from ab), 'succeeded', 0, 0, 0, 0, null)), 3,
  'concluída, a execução de Mercado cobra o preço fixo, ache ou não um Sinal novo');
select is(
  (select status from private.credit_reservations where action_key = 'cascade:k-m2'), 'settled', 'e a reserva é liquidada');

select * from finish();
rollback;

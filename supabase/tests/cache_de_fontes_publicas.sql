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

-- Cópia das fontes públicas e execução adiada (sinais em cascata, ticket 16).

select ok(
  (select relrowsecurity from pg_class where oid = 'private.public_source_cache'::regclass),
  'RLS ligado na cópia das fontes');
select ok(
  not has_table_privilege('anon', 'private.public_source_cache', 'select')
    and not has_table_privilege('authenticated', 'private.public_source_cache', 'select')
    and not has_table_privilege('authenticated', 'private.public_source_cache', 'insert')
    and not has_table_privilege('service_role', 'private.public_source_cache', 'select'),
  'anon, authenticated e a chave de serviço não leem a tabela direto');
select ok(
  not has_function_privilege('authenticated', 'public.read_public_source_cache(text, text, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.write_public_source_cache(text, text, text, jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.read_public_source_cache(text, text, text)', 'execute')
    and has_function_privilege('service_role', 'public.read_public_source_cache(text, text, text)', 'execute')
    and has_function_privilege('service_role', 'public.write_public_source_cache(text, text, text, jsonb)', 'execute'),
  'só a chave de serviço lê e grava a cópia');

set local role service_role;
select lives_ok(
  $$ select public.write_public_source_cache('comexstat', 'dates/updated', '2026-09', '{"data":{"year":"2026","monthNumber":"09"}}'::jsonb) $$,
  'a chave de serviço grava a cópia do mês');
select is(
  public.read_public_source_cache('comexstat', 'dates/updated', '2026-09') -> 'data' ->> 'year',
  '2026', 'e lê de volta o mês pedido');
reset role;

select public.write_public_source_cache('consumidores_livres', 'lista', '2026-08', '{"raizes":["11111111"],"mes":"202608"}'::jsonb);
select public.write_public_source_cache('consumidores_livres', 'lista', '2026-09', '{"raizes":["22222222"],"mes":"202609"}'::jsonb);
update private.public_source_cache set fetched_at = now() - interval '50 days'
where source = 'consumidores_livres' and reference_month = '2026-08';
select is(
  public.read_public_source_cache('consumidores_livres', 'lista', null) -> 'raizes' ->> 0,
  '22222222', 'sem mês, volta a cópia mais nova dos últimos 40 dias');
select is(
  public.read_public_source_cache('consumidores_livres', 'lista', '2026-08') -> 'raizes' ->> 0,
  '11111111', 'com o mês, a cópia volta mesmo antiga');
select throws_ok(
  $$ select public.write_public_source_cache('comexstat', 'grande', '2026-10', jsonb_build_object('t', repeat('a', 2000001))) $$,
  '22023', null, 'payload grande demais é recusado');

select ok(
  (select notes like '%exclusão não foi feita%' and notes like '%limite de leitura%' and notes like '%cópia já guardada%'
   from private.signal_cascades where signal_type = 'grupo_a_cativo'),
  'a nota do Grupo A mantém a degradação e cita a cópia do mês');
select is(private.kick_comexstat_cache(), false, 'sem URL da função, o aquecimento não dispara');

create function pg_temp.job_do_cache() returns text language plpgsql as $fn$
declare
  v text;
begin
  if to_regclass('cron.job') is null then
    return 'sem pg_cron';
  end if;
  execute $q$select schedule || ' ' || command from cron.job where jobname = 'althius-comexstat-cache'$q$ into v;
  return v;
end
$fn$;
select ok(
  pg_temp.job_do_cache() in ('sem pg_cron', '0 6 * * * select private.kick_comexstat_cache()'),
  'o relógio diário pede o aquecimento, onde o agendador existe');

-- Execução adiada: cobra zero mesmo com Sinal visto, libera a reserva, e não gasta a tentativa do dia.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values ('a6100000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'nara@norte.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values ('a6000000-0000-0000-0000-000000000001', 'empresa', 'Norte Cache');
insert into private.workspace_contracts (workspace_id, tier_id, starts_at) select w.id, 'escala', date_trunc('month', now()) from public.workspaces w on conflict (workspace_id) do nothing; -- contrato de teste (acesso-e-planos)
insert into public.workspace_memberships (workspace_id, user_id, role, active)
values ('a6000000-0000-0000-0000-000000000001', 'a6100000-0000-0000-0000-000000000001', 'admin', true);
select public.grant_credits('a6000000-0000-0000-0000-000000000001', 50, 'plano', 'saldo de teste');

create temporary table ab on commit drop as
  select * from public.begin_cascade_run('a6000000-0000-0000-0000-000000000001', null, 'ncm_nova_na_pauta', 'conversa', null, 'k-adiado', 0, null, true);
select is(
  (select credits_charged from public.finish_cascade_run((select run_id from ab), 'adiado', 0, 4, 3, 0,
    'A estatística de comércio exterior está limitando as consultas. A busca fica para a próxima tentativa e nenhum crédito é cobrado.')),
  0, 'adiado cobra zero mesmo tendo visto Sinal');
select is(
  (select status from private.credit_reservations where action_key = 'cascade:k-adiado'),
  'released', 'e a reserva é liberada');
select is(
  (select state from private.signal_cascade_runs where id = (select run_id from ab)),
  'adiado', 'a execução fica adiada, não falha');

select public.set_signal_cascade_state('vaga_comex', 'available');
insert into private.signal_monitors (id, workspace_id, signal_type, name, state, audience, created_by, next_run_at)
values ('a6400000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000001', 'vaga_comex', 'Comex', 'ativo',
  '{"accountIds":[]}', 'a6100000-0000-0000-0000-000000000001', now());
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a6100000-0000-0000-0000-000000000001', true);
select public.save_automation_setting('a6000000-0000-0000-0000-000000000001', 'acao:varredura', 'automatico', 10);
reset role;
create temporary table mon1 on commit drop as
  select * from public.begin_cascade_run(
    'a6000000-0000-0000-0000-000000000001', 'a6100000-0000-0000-0000-000000000001', 'vaga_comex', 'monitor',
    'a6400000-0000-0000-0000-000000000001', 'm-adiado', 0.30, null, false);
select public.finish_cascade_run((select run_id from mon1), 'adiado', 0, 0, 1, 0,
  'A estatística de comércio exterior está limitando as consultas. A busca fica para a próxima tentativa e nenhum crédito é cobrado.');
select is(
  (select outcome from public.begin_cascade_run(
    'a6000000-0000-0000-0000-000000000001', 'a6100000-0000-0000-0000-000000000001', 'vaga_comex', 'monitor',
    'a6400000-0000-0000-0000-000000000001', 'm-depois', 0.30, null, false)),
  'go', 'um Monitoramento adiado não impede a tentativa seguinte no mesmo dia');
select is(
  (select outcome from public.begin_cascade_run(
    'a6000000-0000-0000-0000-000000000001', 'a6100000-0000-0000-0000-000000000001', 'vaga_comex', 'monitor',
    'a6400000-0000-0000-0000-000000000001', 'm-terceira', 0.30, null, false)),
  'ja_rodou_hoje', 'uma execução em andamento ainda segura o dia');

select * from finish();
rollback;

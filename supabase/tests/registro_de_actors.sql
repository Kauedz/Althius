begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(18);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('65000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('65000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values ('aaaaaaaa-5000-0000-0000-000000000001', 'empresa', 'Norte');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('aaaaaaaa-5000-0000-0000-000000000001', '65000000-0000-0000-0000-000000000001', 'admin', true);

-- O registro de lançamento: os 9 actors, o do Google (PR-7) e os de Equipes e Publicações (PR-8), todos em teste, sem preço nem versão inventados.
select is((select count(*)::int from private.signal_actors), 12, 'os 9 actors do lançamento, o do Google e os de Equipes e Publicações estão cadastrados');
select is(
  (select jsonb_build_object('available', count(*) filter (where state = 'available'), 'testing', count(*) filter (where state = 'testing')) from private.signal_actors),
  jsonb_build_object('available', 5, 'testing', 7), 'os 5 validados com id do run nascem disponíveis, os outros 7 seguem em teste');
select is((select count(*)::int from private.signal_actors where known_price is not null or version is not null), 0,
  'preço e versão ficam em branco até alguém conferir no Apify');
select is(
  (select array_agg(actor_id order by actor_id) from private.signal_actors where signal_type in ('vaga_linkedin', 'anuncio_meta')),
  array['curious_coder~facebook-ads-library-scraper', 'curious_coder~linkedin-jobs-scraper'], 'cada Sinal tem o seu actor');
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private' and c.relname = 'signal_actors' and c.relrowsecurity
      and not has_table_privilege('authenticated', c.oid, 'select') and not has_table_privilege('service_role', c.oid, 'select')),
  1, 'a tabela tem RLS e nenhum papel do app a lê direto');
select throws_ok(
  $$insert into private.signal_actors (actor_id, signal_type) values ('sem-til', 'x_y')$$,
  '23514', null, 'o id do actor precisa ser usuario~actor');
select throws_ok(
  $$insert into private.signal_actors (actor_id, signal_type) values ('a~b', 'vaga_linkedin')$$,
  '23505', null, 'um Sinal não tem dois actors');

-- O catálogo do cliente: só o Sinal e o estado.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '65000000-0000-0000-0000-000000000002', true);
select is((select count(*)::int from public.list_signal_actors()), 12, 'qualquer Conta de usuário vê o catálogo');
select is(
  (select array_to_string(p.proargnames, ',') from pg_proc p
   where p.proname = 'list_signal_actors' and p.pronamespace = 'public'::regnamespace),
  'signal_type,state', 'e ela só devolve o Sinal e o estado: nada de preço, teto ou notas');
select throws_ok($$select * from public.signal_actor_for_scan('curious_coder~linkedin-jobs-scraper')$$,
  '42501', null, 'a Conta de usuário não lê o registro de varredura');
select throws_ok($$select public.set_signal_actor_state('curious_coder~linkedin-jobs-scraper', 'available')$$,
  '42501', null, 'e não muda o estado de um actor');
reset role;
set local role anon;
select throws_ok($$select * from public.list_signal_actors()$$, '42501', null, 'anon não vê o catálogo');

-- A função de serviço.
reset role;
set local role service_role;
select is(
  (select jsonb_build_object('estado', state, 'teto', max_cost_usd) from public.signal_actor_for_scan('curious_coder~linkedin-jobs-scraper')),
  jsonb_build_object('estado', 'testing', 'teto', 0.5), 'a varredura lê o estado e o teto do registro');
select is((select count(*)::int from public.signal_actor_for_scan('quem~nao-existe')), 0, 'um actor fora do registro não volta nada');
select lives_ok($$select public.set_signal_actor_state('curious_coder~linkedin-jobs-scraper', 'available', '1.2.3')$$,
  'depois de testado, a função de serviço marca o actor como disponível');
select is(
  (select jsonb_build_object('estado', state, 'versao', version) from public.signal_actor_for_scan('curious_coder~linkedin-jobs-scraper')),
  jsonb_build_object('estado', 'available', 'versao', '1.2.3'), 'e o estado e a versão ficam gravados');
select throws_ok($$select public.set_signal_actor_state('curious_coder~linkedin-jobs-scraper', 'quase')$$,
  '22023', 'invalid state', 'um estado que não existe é recusado');
select lives_ok(
  $$select public.record_signal_scan_cost('aaaaaaaa-5000-0000-0000-000000000001', 'curious_coder~linkedin-jobs-scraper', 'run-1', 12, 0.031)$$,
  'o custo da varredura entra no relatório de custos');

select * from finish();
rollback;

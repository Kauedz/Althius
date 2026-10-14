begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(17);

-- Equipes e Publicações (PR-8): a foto de headcount por Conta (RLS, só o servidor, Conta do Workspace), a base de 90 dias,
-- a contagem de vagas, os actors em teste e o preço de 2 créditos por Conta. Pessoas e empresas fictícias.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('e8000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('e8100000-0000-4000-8000-000000000001', 'empresa', 'Norte'),
  ('e8100000-0000-4000-8000-000000000002', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('e8100000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-000000000001', 'admin', true);
insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, created_by) values
  ('e8200000-0000-4000-8000-000000000001', 'e8100000-0000-4000-8000-000000000001', 'Alfa', 'https://alfa.test', 'alfa.test', 'e8000000-0000-4000-8000-000000000001'),
  ('e8200000-0000-4000-8000-000000000002', 'e8100000-0000-4000-8000-000000000002', 'Beta', 'https://beta.test', 'beta.test', 'e8000000-0000-4000-8000-000000000001');

-- 1. A tabela: RLS ligada e nenhum papel do app a lê direto.
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private' and c.relname = 'account_headcount_snapshots' and c.relrowsecurity
      and not has_table_privilege('authenticated', c.oid, 'select')
      and not has_table_privilege('anon', c.oid, 'select')
      and not has_table_privilege('service_role', c.oid, 'select')),
  1, 'a foto de headcount tem RLS e nenhum papel do app a lê direto');

-- 2. Gravar: a Conta precisa ser do Workspace; o mesmo dia atualiza.
select lives_ok(
  $$select public.record_account_headcount('e8100000-0000-4000-8000-000000000001', 'e8200000-0000-4000-8000-000000000001',
    (now() at time zone 'utc')::date - 80, 40, 'LinkedIn (página da empresa)')$$,
  'grava a foto de uma Conta do Workspace');
select lives_ok(
  $$select public.record_account_headcount('e8100000-0000-4000-8000-000000000001', 'e8200000-0000-4000-8000-000000000001',
    (now() at time zone 'utc')::date - 120, 30, 'LinkedIn (página da empresa)')$$,
  'grava uma foto mais antiga que a janela');
select lives_ok(
  $$select public.record_account_headcount('e8100000-0000-4000-8000-000000000001', 'e8200000-0000-4000-8000-000000000001',
    (now() at time zone 'utc')::date - 80, 41, 'LinkedIn (página da empresa)')$$,
  'a foto do mesmo dia é atualizada, não duplicada');
select is((select count(*)::int from private.account_headcount_snapshots where target_account_id = 'e8200000-0000-4000-8000-000000000001'),
  2, 'uma foto por Conta e dia');
select throws_ok(
  $$select public.record_account_headcount('e8100000-0000-4000-8000-000000000001', 'e8200000-0000-4000-8000-000000000002',
    (now() at time zone 'utc')::date, 10, 'x')$$,
  'P0002', null, 'a Conta de outro Workspace é recusada');
select throws_ok(
  $$select public.record_account_headcount('e8100000-0000-4000-8000-000000000001', 'e8200000-0000-4000-8000-000000000001',
    (now() at time zone 'utc')::date, 0, 'x')$$,
  '22023', null, 'headcount zero é recusado');

-- 3. A base de 90 dias: a foto mais antiga dentro da janela, só do Workspace.
select is(
  (select headcount from public.account_headcount_base('e8100000-0000-4000-8000-000000000001',
    'e8200000-0000-4000-8000-000000000001', (now() at time zone 'utc')::date - 90, (now() at time zone 'utc')::date)),
  41, 'a base é a foto mais antiga dos últimos 90 dias');
select is(
  (select count(*)::int from public.account_headcount_base('e8100000-0000-4000-8000-000000000002',
    'e8200000-0000-4000-8000-000000000001', (now() at time zone 'utc')::date - 90, (now() at time zone 'utc')::date)),
  0, 'outro Workspace não vê a foto');

-- 4. As vagas da Conta nos últimos 90 dias.
insert into private.signals (workspace_id, target_account_id, signal_type, event_key, phrase, fired_at) values
  ('e8100000-0000-4000-8000-000000000001', 'e8200000-0000-4000-8000-000000000001', 'vaga_linkedin', 'v1', 'Vaga 1', now() - interval '10 days'),
  ('e8100000-0000-4000-8000-000000000001', 'e8200000-0000-4000-8000-000000000001', 'vaga_indeed', 'v2', 'Vaga 2', now() - interval '20 days'),
  ('e8100000-0000-4000-8000-000000000001', 'e8200000-0000-4000-8000-000000000001', 'vaga_linkedin', 'v3', 'Vaga 3', now() - interval '200 days'),
  ('e8100000-0000-4000-8000-000000000001', 'e8200000-0000-4000-8000-000000000001', 'anuncio_meta', 'a1', 'Anúncio', now() - interval '5 days');
select is(public.count_account_job_signals('e8100000-0000-4000-8000-000000000001', 'e8200000-0000-4000-8000-000000000001',
  now() - interval '90 days'), 2, 'conta só as vagas dos últimos 90 dias');

-- 5. Só o servidor chama as funções.
select is(
  (select count(*)::int from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('record_account_headcount', 'account_headcount_base', 'count_account_job_signals')
     and not has_function_privilege('authenticated', p.oid, 'execute')
     and not has_function_privilege('anon', p.oid, 'execute')
     and has_function_privilege('service_role', p.oid, 'execute')),
  3, 'as três funções são só do servidor');

-- 6. Os actors em teste, sem preço nem versão.
select is(
  (select string_agg(actor_id || '=' || signal_type || ':' || state, ',' order by actor_id) from private.signal_actors
   where signal_type in ('crescimento_de_equipes', 'publicacao_da_empresa')),
  'harvestapi~linkedin-company=crescimento_de_equipes:testing,harvestapi~linkedin-company-posts=publicacao_da_empresa:testing',
  'os dois actors entram em teste');
select is((select count(*)::int from private.signal_actors
  where signal_type in ('crescimento_de_equipes', 'publicacao_da_empresa') and (known_price is not null or version is not null)),
  0, 'sem preço nem versão até a amostra real');

-- 7. O preço: 2 créditos por Conta varrida nos dois tipos.
select is(private.credits_per_account('crescimento_de_equipes'), 2, 'Equipe crescendo custa 2 créditos por Conta');
select is(private.credits_per_account('publicacao_da_empresa'), 2, 'Publicações custam 2 créditos por Conta');
select is(
  (select collector_types from public.signal_catalog where id = 'publicacoes-da-empresa' and workspace_id is null),
  array['publicacao_da_empresa'], 'o card Publicações da empresa tem o coletor');

-- 8. O tipo genérico segue rodável pela cascata enquanto o actor está em teste.
select is(
  (select count(*)::int from private.signal_type_cascades where signal_type = 'crescimento_de_equipes'),
  1, 'a cascata de headcount continua atendendo o tipo');

select * from finish();
rollback;

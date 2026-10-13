begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(16);

-- A leitura da tela para os Sinais de mercado (ticket 16): só o feed do ICP do Workspace de quem participa, sem dado
-- pessoal e sem o que a cascata guarda por dentro (fonte, evidência, chave, payload).

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('e1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('e1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'carla@sul.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('e1000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'eva@norte.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('e2000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('e2000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'admin', true),
  ('e2000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000002', 'admin', true),
  ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000003', 'member', false);

select public.record_market_signal(
  'e2000000-0000-0000-0000-000000000001', 'volume_por_porto', 'porto|santos|2026-09',
  'Volume importado pelo porto de Santos subiu', '2026-09-01T00:00:00Z',
  'Comex Stat', 'segredo-evidencia-xyz', '{"contato":"Maria Souza","email":"maria@x.com"}');
select public.record_market_signal(
  'e2000000-0000-0000-0000-000000000001', 'volume_por_porto', 'porto|email|2026-10',
  'Aviso para maria@x.com sobre o porto', '2026-10-02T00:00:00Z', 's', 'e', '{}');
select public.record_market_signal(
  'e2000000-0000-0000-0000-000000000001', 'volume_por_porto', 'porto|cpf|2026-10',
  'Cadastro 123.456.789-09 no porto', '2026-10-03T00:00:00Z', 's', 'e', '{}');
select public.record_market_signal(
  'e2000000-0000-0000-0000-000000000001', 'volume_por_porto', 'porto|marca|2026-10',
  'Coleta Apify do porto de Santos', '2026-10-04T00:00:00Z', 's', 'e', '{}');
select public.record_market_signal(
  'e2000000-0000-0000-0000-000000000001', 'setor_afetado_cbs_ibs', 'setor|b|2026-10',
  'Setor de serviços foi afetado', '2026-10-05T00:00:00Z', 's', 'e', '{}');
select public.record_market_signal(
  'e2000000-0000-0000-0000-000000000002', 'volume_por_porto', 'porto|sul|2026-10',
  'Volume do Workspace Sul', '2026-10-06T00:00:00Z', 's', 'e', '{}');
insert into private.market_signals (workspace_id, signal_type, event_key, phrase, fired_at, source, evidence, payload)
values (
  'e2000000-0000-0000-0000-000000000001', 'vaga_comex', 'conta-nao-entra',
  'Sinal de conta vazado', now(), 'segredo-fonte', 'segredo-evidencia-conta', '{"email":"pessoa@empresa.com"}');

select ok(
  (select prosecdef from pg_proc where oid = 'public.list_market_signals_for_workspace_icp(uuid, text)'::regprocedure)
    and (select proconfig::text from pg_proc where oid = 'public.list_market_signals_for_workspace_icp(uuid, text)'::regprocedure) like '%search_path=%',
  'a leitura é security definer com search_path vazio');
select ok(
  has_function_privilege('authenticated', 'public.list_market_signals_for_workspace_icp(uuid, text)', 'execute')
    and not has_function_privilege('anon', 'public.list_market_signals_for_workspace_icp(uuid, text)', 'execute')
    and not has_function_privilege('public', 'public.list_market_signals_for_workspace_icp(uuid, text)', 'execute'),
  'só quem está autenticado executa');
select ok(
  not exists (
    select 1 from pg_proc p
    join pg_type t on t.oid = p.prorettype
    where p.oid = 'public.list_market_signals_for_workspace_icp(uuid, text)'::regprocedure
      and pg_get_function_result(p.oid) ~* 'source|evidence|payload|event_key'
  ),
  'a resposta não tem fonte, evidência, chave nem payload');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000001', true);

select is(
  (select count(*)::integer from public.list_market_signals_for_workspace_icp('e2000000-0000-0000-0000-000000000001', 'A')),
  4, 'o participante vê os Sinais de mercado do ICP A do próprio Workspace');
select is(
  (select phrase from public.list_market_signals_for_workspace_icp('e2000000-0000-0000-0000-000000000001', 'A')
   where signal_type = 'volume_por_porto' and phrase like 'Volume importado%'),
  'Volume importado pelo porto de Santos subiu', 'a frase de mercado sai como foi gravada');
select is(
  (select count(*)::integer from public.list_market_signals_for_workspace_icp('e2000000-0000-0000-0000-000000000001', 'A')
   where phrase = 'Sinal de mercado registrado.'),
  3, 'e-mail, CPF e nome de fornecedor na frase viram uma frase neutra');
select ok(
  (select string_agg(id::text || signal_type || name || phrase, ' ')
   from public.list_market_signals_for_workspace_icp('e2000000-0000-0000-0000-000000000001', 'A'))
    !~* 'segredo-evidencia|Maria Souza|maria@|Apify|Sinal de conta vazado|pessoa@',
  'a leitura não devolve dado pessoal nem o que ficou por dentro do feed');
select is(
  (select count(*)::integer from public.list_market_signals_for_workspace_icp('e2000000-0000-0000-0000-000000000001', 'B')),
  1, 'o ICP B traz o Sinal dele, não o do A');
select is(
  (select phrase from public.list_market_signals_for_workspace_icp('e2000000-0000-0000-0000-000000000001', 'A')
   order by fired_at desc, id desc limit 1),
  'Sinal de mercado registrado.', 'o mais novo vem primeiro');
select throws_ok(
  $$ select * from public.list_market_signals_for_workspace_icp('e2000000-0000-0000-0000-000000000002', 'A') $$,
  '42501', null, 'o feed de outro Workspace é recusado');
select throws_ok(
  $$ select * from public.list_market_signals_for_workspace_icp('e2000000-0000-0000-0000-000000000001', 'Z') $$,
  '22023', null, 'ICP fora de A a H é recusado');
select throws_ok(
  $$ select * from private.market_signals $$,
  '42501', null, 'a tabela continua fora do alcance de quem está autenticado');

select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$ select * from public.list_market_signals_for_workspace_icp('e2000000-0000-0000-0000-000000000001', 'A') $$,
  '42501', null, 'quem saiu do Workspace não vê o feed');

reset role;
select ok(
  not has_table_privilege('authenticated', 'private.market_signals', 'select'),
  'authenticated não lê a tabela, nem por RLS');

select * from finish();
rollback;

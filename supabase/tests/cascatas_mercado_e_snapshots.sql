begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(23);

-- Sinais de mercado e fotografias das cascatas (sinais em cascata, infraestrutura dos ICPs). Um Sinal de mercado acontece no
-- mercado todo (Comex Stat, DOU, Plano Safra): não é de uma Conta, então não passa pelo record_signal; grava no feed do
-- Workspace que pagou a busca. A fotografia guarda o estado de uma empresa (CNPJ) ou Conta para a próxima rodada comparar.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('d1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('d1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'carla@sul.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('d1000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'eva@norte.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('d2000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('d2000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'admin', true),
  ('d2000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000002', 'admin', true),
  ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000003', 'member', false);

-- Uma cascata de mercado e uma por Conta, só para o teste.
insert into private.signal_cascades (signal_type, icp, name, scope, state) values
  ('mercado_teste', 'A', 'Mercado de teste', 'mercado', 'available'),
  ('conta_teste', 'A', 'Conta de teste', 'conta', 'available');

select ok(
  not has_table_privilege('authenticated', 'private.market_signals', 'select')
    and not has_table_privilege('service_role', 'private.signal_snapshots', 'select')
    and (select relrowsecurity from pg_class where oid = 'private.market_signals'::regclass)
    and (select relrowsecurity from pg_class where oid = 'private.signal_snapshots'::regclass),
  'as tabelas são só do servidor, com RLS ligado');
select ok(
  not has_function_privilege('authenticated', 'public.record_market_signal(uuid, text, text, text, timestamptz, text, text, jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.signal_snapshots_put(uuid, text, jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.signal_snapshots_get(uuid, text, text[], timestamptz)', 'execute')
    and has_function_privilege('service_role', 'public.record_market_signal(uuid, text, text, text, timestamptz, text, text, jsonb)', 'execute')
    and has_function_privilege('authenticated', 'public.list_market_signals(uuid, integer)', 'execute'),
  'gravar é do servidor; ler o feed é de quem participa do Workspace');

-- 1. Gravar um Sinal de mercado.
select is(
  public.record_market_signal('d2000000-0000-0000-0000-000000000001', 'mercado_teste', 'ncm|84799999|2026-10', 'NCM 8479.99.99 entrou na pauta de importação', '2026-10-06T00:00:00Z', 'Comex Stat', 'US$ 1,2 mi FOB nos últimos 3 meses.', '{"fob": 1200000}'),
  true, 'o Sinal de mercado novo é gravado');
select is(
  public.record_market_signal('d2000000-0000-0000-0000-000000000001', 'mercado_teste', 'ncm|84799999|2026-10', 'NCM 8479.99.99 entrou na pauta de importação', '2026-10-06T00:00:00Z', 'Comex Stat', 'outra evidência', '{}'),
  false, 'o mesmo acontecimento conta uma vez');
select throws_ok(
  $$ select public.record_market_signal('d2000000-0000-0000-0000-000000000001', 'conta_teste', 'k', 'x', now(), 's', 'e', '{}') $$,
  '22023', null, 'um tipo que é por Conta não grava no feed de mercado');
select throws_ok(
  $$ select public.record_market_signal('d2000000-0000-0000-0000-000000000001', 'nao_existe', 'k', 'x', now(), 's', 'e', '{}') $$,
  '22023', null, 'um tipo desconhecido é recusado');
select throws_ok(
  $$ select public.record_market_signal('d2000000-0000-0000-0000-000000000001', 'mercado_teste', 'k2', 'x', now() + interval '3 days', 's', 'e', '{}') $$,
  '22023', null, 'a data não pode estar no futuro');
select throws_ok(
  $$ select public.record_market_signal('d2000000-0000-0000-0000-0000000000ff', 'mercado_teste', 'k3', 'x', now(), 's', 'e', '{}') $$,
  'P0002', null, 'Workspace que não existe');
select is(
  public.record_market_signal('d2000000-0000-0000-0000-000000000002', 'mercado_teste', 'ncm|84799999|2026-10', 'mesma chave em outro Workspace', '2026-10-06T00:00:00Z', 'Comex Stat', 'e', '{}'),
  true, 'a mesma chave em outro Workspace é outro registro (cada Workspace tem o seu feed)');

-- 2. O feed é do Workspace, para quem participa dele.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'd1000000-0000-0000-0000-000000000001', true);
select is((select count(*)::integer from public.list_market_signals('d2000000-0000-0000-0000-000000000001', 50)), 1, 'o participante vê o feed do próprio Workspace');
select is((select phrase from public.list_market_signals('d2000000-0000-0000-0000-000000000001', 50)), 'NCM 8479.99.99 entrou na pauta de importação', 'com a frase gravada');
select is((select (payload ->> 'fob')::integer from public.list_market_signals('d2000000-0000-0000-0000-000000000001', 50)), 1200000, 'e os números');
select throws_ok(
  $$ select * from public.list_market_signals('d2000000-0000-0000-0000-000000000002', 50) $$,
  '42501', null, 'o feed de outro Workspace é recusado');
select set_config('request.jwt.claim.sub', 'd1000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$ select * from public.list_market_signals('d2000000-0000-0000-0000-000000000001', 50) $$,
  '42501', null, 'quem saiu do Workspace não vê o feed');
reset role;

-- 3. Fotografias: gravar, ler a mais recente e comparar na próxima rodada.
select is(
  public.signal_snapshots_put('d2000000-0000-0000-0000-000000000001', 'conta_teste',
    '[{"subjectKey":"11222333000181","data":{"processos":2,"funcionarios":48},"takenAt":"2026-07-01T00:00:00Z"},{"subjectKey":"22333444000172","data":{"processos":0}}]'),
  2, 'grava as fotografias de uma rodada');
select public.signal_snapshots_put('d2000000-0000-0000-0000-000000000001', 'conta_teste',
  '[{"subjectKey":"11222333000181","data":{"processos":5,"funcionarios":52},"takenAt":"2026-10-01T00:00:00Z"}]');
select is(
  (select data ->> 'processos' from public.signal_snapshots_get('d2000000-0000-0000-0000-000000000001', 'conta_teste', array['11222333000181'], null)),
  '5', 'a leitura devolve a fotografia mais recente');
select is(
  (select data ->> 'processos' from public.signal_snapshots_get('d2000000-0000-0000-0000-000000000001', 'conta_teste', array['11222333000181'], '2026-09-01T00:00:00Z')),
  '2', 'ou a mais recente antes de uma data (a comparação com 90 dias atrás)');
select is(
  (select count(*)::integer from public.signal_snapshots_get('d2000000-0000-0000-0000-000000000002', 'conta_teste', array['11222333000181'], null)),
  0, 'a fotografia de um Workspace não aparece em outro');
select throws_ok(
  $$ select public.signal_snapshots_put('d2000000-0000-0000-0000-000000000001', 'nao_existe', '[{"subjectKey":"x","data":{}}]') $$,
  '22023', null, 'o tipo precisa existir');
select throws_ok(
  $$ select public.signal_snapshots_put('d2000000-0000-0000-0000-000000000001', 'conta_teste', '[{"subjectKey":"","data":{}}]') $$,
  '22023', null, 'a chave do assunto é obrigatória');
select is(
  public.signal_snapshots_put('d2000000-0000-0000-0000-000000000001', 'conta_teste', '[{"subjectKey":"11222333000181","data":{"processos":6},"takenAt":"2026-10-01T00:00:00Z"}]'),
  1, 'regravar a fotografia do mesmo instante a substitui');
select is(
  (select data ->> 'processos' from public.signal_snapshots_get('d2000000-0000-0000-0000-000000000001', 'conta_teste', array['11222333000181'], null)),
  '6', 'e a leitura vê a nova');

-- 4. Apagar o Workspace leva o feed e as fotografias.
delete from public.workspaces where id = 'd2000000-0000-0000-0000-000000000002';
select is((select count(*)::integer from private.market_signals where workspace_id = 'd2000000-0000-0000-0000-000000000002'), 0, 'apagar o Workspace apaga o feed dele');

select * from finish();
rollback;

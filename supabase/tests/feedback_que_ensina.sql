begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(14);

-- Ana (Admin) e Bruno (Membro) do Norte; Carla é do Sul.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('5b000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5b000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5b000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@sul.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('fb000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('fb000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into private.workspace_contracts (workspace_id, tier_id, starts_at) select w.id, 'escala', date_trunc('month', now()) from public.workspaces w on conflict (workspace_id) do nothing;
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('fb000000-0000-0000-0000-000000000001', '5b000000-0000-0000-0000-000000000001', 'admin', true),
  ('fb000000-0000-0000-0000-000000000001', '5b000000-0000-0000-0000-000000000002', 'member', true),
  ('fb000000-0000-0000-0000-000000000002', '5b000000-0000-0000-0000-000000000003', 'admin', true);

-- Oito candidatas de Logística e uma de Energia, todas novas.
insert into private.discovered_accounts (id, workspace_id, name, domain, domain_key, name_key, source_actor, sector, uf, fit_score)
select ('cb000000-0000-0000-0000-00000000000' || i)::uuid, 'fb000000-0000-0000-0000-000000000001', 'Log ' || i, 'log' || i || '.test',
  'log' || i || '.test', 'log ' || i, 'teste', 'Logística', 'SP', 60
from generate_series(1, 8) i;
insert into private.discovered_accounts (id, workspace_id, name, domain, domain_key, name_key, source_actor, sector, uf, fit_score)
values ('cb000000-0000-0000-0000-000000000009', 'fb000000-0000-0000-0000-000000000001', 'Energia Um', 'en1.test', 'en1.test', 'energia um', 'teste', 'Energia', 'MG', 20);

-- 1. A regra do ajuste (mesmos pontos de account-discovery/aprendizado.test.ts).
select is(private.discovery_learned_effective(-5, 2, now(), now()), 0::numeric, 'menos de 3 decisões não contam');
select is(private.discovery_learned_effective(-40, 16, now(), now()), -15::numeric, 'o ajuste vale no máximo -15');
select is(round(private.discovery_learned_effective(-10, 4, now() - interval '60 days', now()), 4), -5::numeric,
  'o ajuste cai pela metade em 60 dias');

-- 2. O Membro descarta com motivo.
select set_config('request.jwt.claims', '{"sub":"5b000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.discard_discovered_account_with_code('cb000000-0000-0000-0000-000000000001', 'xyz')$$,
  '22023', null, 'o motivo estruturado tem de ser um dos conhecidos');
select public.discard_discovered_account_with_code(('cb000000-0000-0000-0000-00000000000' || i)::uuid, 'setor', 'fora do setor')
from generate_series(1, 2) i;
select is((select count(*)::int from public.list_discovery_learning('fb000000-0000-0000-0000-000000000001')), 0,
  'com 2 descartes, nada aprendido ainda');
select public.discard_discovered_account_with_code(('cb000000-0000-0000-0000-00000000000' || i)::uuid, 'setor', null)
from generate_series(3, 6) i;
select results_eq(
  $$select dimension, value, adjustment, evidence_count from public.list_discovery_learning('fb000000-0000-0000-0000-000000000001')$$,
  $$values ('setor'::text, 'logística'::text, -15.0::numeric, 6)$$,
  'seis descartes por setor: -15 para Logística');
reset role;
select is((select discard_reason_code from private.discovered_accounts where id = 'cb000000-0000-0000-0000-000000000001'), 'setor',
  'o descarte guarda o motivo estruturado');
select is(private.discovery_fit_adjusted(60, 'cb000000-0000-0000-0000-000000000007', now()), 45::numeric,
  'a nota da candidata parecida perde 15 pontos de Encaixe');
set local role authenticated;
select throws_ok($$select public.reset_discovery_learning('fb000000-0000-0000-0000-000000000001')$$,
  null, null, 'o Membro não recomeça o aprendizado');
reset role;

-- 3. O aceite ensina para o outro lado.
update private.discovered_accounts set state = 'aceita', decided_at = now() where id = 'cb000000-0000-0000-0000-000000000007';
select is((select evidence_count from private.discovery_learned_weights
  where workspace_id = 'fb000000-0000-0000-0000-000000000001' and dimension = 'regiao' and value = 'sp'), 1,
  'aceitar soma evidência nas dimensões da candidata');
select is(private.discovery_fit_adjusted(20, 'cb000000-0000-0000-0000-000000000009', now()), 20::numeric,
  'outro setor não é afetado');

-- 4. Outro Workspace não lê; o Administrador recomeça.
select set_config('request.jwt.claims', '{"sub":"5b000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select * from public.list_discovery_learning('fb000000-0000-0000-0000-000000000001')$$,
  null, null, 'quem é de outro Workspace não lê o aprendizado');
select throws_ok($$select count(*) from private.discovery_learned_weights$$, null, null,
  'a tabela não é lida diretamente');
reset role;
select set_config('request.jwt.claims', '{"sub":"5b000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is(public.reset_discovery_learning('fb000000-0000-0000-0000-000000000001', 'setor', 'Logística'), 1,
  'o Administrador desfaz um ajuste');
reset role;

select * from finish();
rollback;

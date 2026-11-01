begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(12);

-- Sinais first 08: a origem do Monitoramento (created_via). O composer grava 'composer'; /sinais/novo fica com o padrão
-- 'sinais_novo'; editar o Plano não troca a origem; valor fora da lista é recusado; a lista devolve a origem só para
-- quem participa do Workspace. Ana: Administradora do Norte. Bia: Administradora do Sul.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('f8500000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'ana@origem.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('f8500000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'bia@origem.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('f8510000-0000-4000-8000-000000000001', 'empresa', 'Norte'),
  ('f8510000-0000-4000-8000-000000000002', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('f8510000-0000-4000-8000-000000000001', 'f8500000-0000-4000-8000-000000000001', 'admin', true),
  ('f8510000-0000-4000-8000-000000000002', 'f8500000-0000-4000-8000-000000000002', 'admin', true);
insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, created_by) values
  ('f8520000-0000-4000-8000-000000000001', 'f8510000-0000-4000-8000-000000000001', 'Alfa', 'https://alfa.origem.test',
   'alfa.origem.test', 'f8500000-0000-4000-8000-000000000001');

update private.signal_actors set state = 'testing';
select public.set_signal_actor_state(a.actor_id, 'available', 'v1')
from private.signal_actors a where a.signal_type = 'vaga_linkedin';

create temporary table r (k text primary key, id uuid) on commit drop;
grant all on r to authenticated;
create temporary table base (p jsonb) on commit drop;
grant select on base to authenticated;
insert into base values (jsonb_build_object(
  'versao', 1, 'origem', 'briefing',
  'escopo', jsonb_build_object('tipo', 'contas', 'contaIds', jsonb_build_array('f8520000-0000-4000-8000-000000000001')),
  'sinais', jsonb_build_array(jsonb_build_object('tipo', 'vaga_linkedin', 'criterios', '{"palavras":"dados"}'::jsonb)),
  'explicacao', 'Acompanha vagas de dados na Conta escolhida.',
  'maxEmpresasPorRodada', 25));

-- 1. A coluna: obrigatória, com padrão 'sinais_novo' e CHECK.
select is((select column_default from information_schema.columns
           where table_schema = 'private' and table_name = 'signal_monitors' and column_name = 'created_via'),
  '''sinais_novo''::text', 'a coluna created_via tem padrão sinais_novo');
select is((select is_nullable from information_schema.columns
           where table_schema = 'private' and table_name = 'signal_monitors' and column_name = 'created_via'),
  'NO', 'a coluna created_via é obrigatória');
select is((select count(*)::int from pg_constraint where conname = 'signal_monitors_created_via_check'), 1,
  'há um CHECK para os valores da origem');

-- 2. Salvar pelo composer e pelo fluxo de sempre.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'f8500000-0000-4000-8000-000000000001', true);
insert into r select 'composer', public.save_signal_plan('f8510000-0000-4000-8000-000000000001', 'Sinal do composer', 'pedido',
  (select p from base), null, 'composer');
insert into r select 'novo', public.save_signal_plan('f8510000-0000-4000-8000-000000000001', 'Sinal de sempre', 'pedido',
  (select p from base));
select is((select created_via from public.list_signal_monitors('f8510000-0000-4000-8000-000000000001') where id = (select id from r where k = 'composer')),
  'composer', 'a lista devolve a origem composer');
select is((select created_via from public.list_signal_monitors('f8510000-0000-4000-8000-000000000001') where id = (select id from r where k = 'novo')),
  'sinais_novo', 'sem origem informada, o Sinal fica com sinais_novo');
select throws_ok(
  $$select public.save_signal_plan('f8510000-0000-4000-8000-000000000001', 'Inválido', 'pedido', (select p from base), null, 'outro')$$,
  '22023', 'invalid signal creation origin', 'origem fora da lista é recusada');

-- 3. Editar o Plano (sem origem, como o editor faz) não troca a origem.
select public.save_signal_plan('f8510000-0000-4000-8000-000000000001', 'Sinal editado', 'pedido atualizado',
  (select p from base), (select id from r where k = 'composer'));
select is((select created_via from public.list_signal_monitors('f8510000-0000-4000-8000-000000000001') where id = (select id from r where k = 'composer')),
  'composer', 'editar o Plano mantém a origem composer');
select is((select plan_version from public.list_signal_monitors('f8510000-0000-4000-8000-000000000001') where id = (select id from r where k = 'composer')),
  2, 'editar o Plano sobe a versão como antes');

-- 4. Isolamento: quem não participa não lê nem grava no Workspace.
select set_config('request.jwt.claim.sub', 'f8500000-0000-4000-8000-000000000002', true);
select throws_ok($$select * from public.list_signal_monitors('f8510000-0000-4000-8000-000000000001')$$, '42501',
  'active workspace membership required', 'quem é de outro Workspace não lê a origem');
select throws_ok(
  $$select public.save_signal_plan('f8510000-0000-4000-8000-000000000001', 'Bia', 'pedido', (select p from base), null, 'composer')$$,
  '42501', 'active workspace membership required', 'quem é de outro Workspace não salva pelo composer');
select is((select count(*)::int from public.list_signal_monitors('f8510000-0000-4000-8000-000000000002')), 0,
  'o Sul não vê os Sinais do Norte');

-- 5. No banco, os registros têm a origem certa (leitura direta como dono).
reset role;
select is((select array_agg(created_via order by name) from private.signal_monitors
           where workspace_id = 'f8510000-0000-4000-8000-000000000001'),
  array['sinais_novo', 'composer'], 'a tabela guarda sinais_novo e composer');

select * from finish();
rollback;

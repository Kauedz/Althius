begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(11);

-- Norte (Ana, Administradora) e Sul (Carla, Administradora). O Playbook do Norte tem Empresa, ICP e Objeções; o do Sul,
-- só a Empresa.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('62000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('62000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@sul.com.br', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('aaaaaaaa-2000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('aaaaaaaa-2000-0000-0000-000000000002', 'empresa', 'Sul');
insert into private.workspace_contracts (workspace_id, tier_id, starts_at) select w.id, 'escala', date_trunc('month', now()) from public.workspaces w on conflict (workspace_id) do nothing; -- contrato de teste (acesso-e-planos)
select public.grant_credits(w.id, 1000, 'plano', 'saldo de teste') from public.workspaces w where w.id <> 'e0a17e00-0000-4000-8000-000000000001'; -- a rodada de Agente sempre reserva (acesso-e-planos)

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('aaaaaaaa-2000-0000-0000-000000000001', '62000000-0000-0000-0000-000000000001', 'admin', true),
  ('aaaaaaaa-2000-0000-0000-000000000002', '62000000-0000-0000-0000-000000000003', 'admin', true);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '62000000-0000-0000-0000-000000000001', true);
select public.save_playbook_section('aaaaaaaa-2000-0000-0000-000000000001', 'empresa', '{"texto":"A Norte vende software para incorporadoras."}');
select public.save_playbook_section('aaaaaaaa-2000-0000-0000-000000000001', 'icp', '{"texto":"Incorporadoras de médio porte."}');
select public.save_playbook_section('aaaaaaaa-2000-0000-0000-000000000001', 'objecoes', '{"texto":"Já temos um sistema."}');
select set_config('t.run_norte', (select run_id::text from public.start_agent_run('aaaaaaaa-2000-0000-0000-000000000001',
  null, null, 'Qual é o nosso ICP?', '{}', 'c2000000-0000-0000-0000-000000000001')), true);
select set_config('t.run_norte_fechada', (select run_id::text from public.start_agent_run('aaaaaaaa-2000-0000-0000-000000000001',
  null, null, 'Outro pedido', '{}', 'c2000000-0000-0000-0000-000000000002')), true);
select set_config('request.jwt.claim.sub', '62000000-0000-0000-0000-000000000003', true);
select public.save_playbook_section('aaaaaaaa-2000-0000-0000-000000000002', 'empresa', '{"texto":"A Sul vende seguros."}');
select set_config('t.run_sul', (select run_id::text from public.start_agent_run('aaaaaaaa-2000-0000-0000-000000000002',
  null, null, 'Oi', '{}', 'c2000000-0000-0000-0000-000000000003')), true);

-- Quem chama o Playbook da Execução é só a função (service_role).
select throws_ok(
  $$select public.agent_run_playbook(current_setting('t.run_norte')::uuid, 'scopus')$$,
  '42501', null, 'a Conta de usuário não chama a leitura do Playbook da Execução');
reset role;
set local role anon;
select throws_ok(
  $$select public.agent_run_playbook(current_setting('t.run_norte')::uuid, 'scopus')$$,
  '42501', null, 'anon não chama a leitura do Playbook da Execução');

reset role;
set local role service_role;
-- Uma Execução que ainda não foi reservada não entrega o Playbook.
select throws_ok(
  $$select public.agent_run_playbook(current_setting('t.run_norte')::uuid, 'scopus')$$,
  '55000', 'run is not running', 'uma Execução na fila ainda não lê o Playbook');

select public.claim_agent_run(current_setting('t.run_norte')::uuid);
select public.claim_agent_run(current_setting('t.run_sul')::uuid);

select is(
  (select array_agg(e ->> 'section') from jsonb_array_elements(
    public.agent_run_playbook(current_setting('t.run_norte')::uuid, 'scopus')) e),
  array['empresa', 'icp'], 'o Scopus recebe a Empresa e o ICP do Workspace da Execução');
select is(
  (select e -> 'content' ->> 'texto' from jsonb_array_elements(
    public.agent_run_playbook(current_setting('t.run_norte')::uuid, 'scopus')) e where e ->> 'section' = 'icp'),
  'Incorporadoras de médio porte.', 'com o conteúdo vigente da seção');
select is(
  (select array_agg(e ->> 'section') from jsonb_array_elements(
    public.agent_run_playbook(current_setting('t.run_norte')::uuid, 'ethos')) e),
  array['empresa', 'objecoes'], 'o Ethos recebe a Empresa e as Objeções, e não o ICP');
select is(
  (select array_agg(e ->> 'section') from jsonb_array_elements(
    public.agent_run_playbook(current_setting('t.run_norte')::uuid, 'oraculum')) e),
  array['empresa', 'icp'], 'o Oraculum recebe a Empresa e o ICP');
select is(
  (select array_agg(e ->> 'section') from jsonb_array_elements(
    public.agent_run_playbook(current_setting('t.run_sul')::uuid, 'scopus')) e),
  array['empresa'], 'o Sul só tem a Empresa: o Scopus recebe só ela');
select is(
  (select e -> 'content' ->> 'texto' from jsonb_array_elements(
    public.agent_run_playbook(current_setting('t.run_sul')::uuid, 'scopus')) e),
  'A Sul vende seguros.', 'e o Sul nunca lê o Playbook do Norte');
select throws_ok(
  $$select public.agent_run_playbook(current_setting('t.run_norte')::uuid, 'inexistente')$$,
  '22023', 'unknown specialty', 'uma Especialidade que não existe é recusada');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'agent_run_playbook' and p.prosecdef
      and p.proconfig @> array['search_path=""']),
  1, 'a função é security definer com search_path vazio');

select * from finish();
rollback;

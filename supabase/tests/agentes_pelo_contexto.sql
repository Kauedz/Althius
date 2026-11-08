begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(16);

-- contexto-da-empresa 06: a Execução dos Agentes lê o Contexto da empresa do seu Workspace, fixa a versão que usou e
-- não lê o Playbook. Norte (Ana, Administradora; Bia, Membro) tem contexto; Sul (Carla) não tem.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('e0600000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@contexto-norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('e0600000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bia@contexto-norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('e0600000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@contexto-sul.test', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('e0600000-0000-0000-0000-000000000010', 'empresa', 'Norte do contexto'),
  ('e0600000-0000-0000-0000-000000000020', 'empresa', 'Sul do contexto');
insert into private.workspace_contracts (workspace_id, tier_id, starts_at)
  select w.id, 'escala', date_trunc('month', now()) from public.workspaces w
  where w.id in ('e0600000-0000-0000-0000-000000000010', 'e0600000-0000-0000-0000-000000000020')
  on conflict (workspace_id) do nothing;
select public.grant_credits(w.id, 1000, 'plano', 'saldo de teste') from public.workspaces w
  where w.id in ('e0600000-0000-0000-0000-000000000010', 'e0600000-0000-0000-0000-000000000020');

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('e0600000-0000-0000-0000-000000000010', 'e0600000-0000-0000-0000-000000000001', 'admin', true),
  ('e0600000-0000-0000-0000-000000000010', 'e0600000-0000-0000-0000-000000000002', 'member', true),
  ('e0600000-0000-0000-0000-000000000020', 'e0600000-0000-0000-0000-000000000003', 'admin', true);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'e0600000-0000-0000-0000-000000000001', true);
select public.save_company_context('e0600000-0000-0000-0000-000000000010',
  'A Norte vende software para incorporadoras.', 'Incorporadoras de médio porte no Sul.', 'Diretor de obras.', null);
select set_config('t.run1', (select run_id::text from public.start_agent_run('e0600000-0000-0000-0000-000000000010',
  null, null, 'Monte uma Sequência', '{}', 'c0600000-0000-0000-0000-000000000001')), true);
select set_config('t.run2', (select run_id::text from public.start_agent_run('e0600000-0000-0000-0000-000000000010',
  null, null, 'Outro pedido', '{}', 'c0600000-0000-0000-0000-000000000002')), true);
select set_config('request.jwt.claim.sub', 'e0600000-0000-0000-0000-000000000003', true);
select set_config('t.run_sul', (select run_id::text from public.start_agent_run('e0600000-0000-0000-0000-000000000020',
  null, null, 'Oi', '{}', 'c0600000-0000-0000-0000-000000000003')), true);

-- Só a função do motor lê o contexto da Execução.
select throws_ok(
  $$select public.agent_run_company_context(current_setting('t.run1')::uuid)$$,
  '42501', null, 'a Conta de usuário não chama a leitura do contexto da Execução');

-- Um Membro não grava o contexto: os Agentes leem, mas a escrita continua só do Administrador.
select set_config('request.jwt.claim.sub', 'e0600000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.save_company_context('e0600000-0000-0000-0000-000000000010', 'x', 'y', 'z', 1)$$,
  '42501', null, 'um Membro continua sem gravar o Contexto da empresa');

reset role;
set local role service_role;
select throws_ok(
  $$select public.agent_run_company_context(current_setting('t.run1')::uuid)$$,
  '55000', 'run is not running', 'uma Execução na fila ainda não lê o contexto');

select public.claim_agent_run(current_setting('t.run1')::uuid);
select public.claim_agent_run(current_setting('t.run_sul')::uuid);

select is(public.agent_run_company_context(current_setting('t.run1')::uuid) ->> 'empresa',
  'A Norte vende software para incorporadoras.', 'a Execução recebe a Empresa vigente');
select is(public.agent_run_company_context(current_setting('t.run1')::uuid) ->> 'icp',
  'Incorporadoras de médio porte no Sul.', 'o Perfil de cliente ideal');
select is(public.agent_run_company_context(current_setting('t.run1')::uuid) ->> 'personas',
  'Diretor de obras.', 'e as Personas');
select is((public.agent_run_company_context(current_setting('t.run1')::uuid) ->> 'version')::integer, 1, 'com a versão');

-- Um Administrador salva a versão 2 no meio da Execução.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0600000-0000-0000-0000-000000000001', true);
select public.save_company_context('e0600000-0000-0000-0000-000000000010',
  'A Norte vende software para incorporadoras e construtoras.', 'Construtoras.', 'Diretor de obras.', 1);
reset role;
set local role service_role;

select is((public.agent_run_company_context(current_setting('t.run1')::uuid) ->> 'version')::integer, 1,
  'a Execução em andamento continua na versão que começou a usar');
reset role;
select is((select company_context_version from private.agent_runs where id = current_setting('t.run1')::uuid), 1,
  'e a versão usada fica registrada na Execução');

set local role service_role;
select public.claim_agent_run(current_setting('t.run2')::uuid);
select is(public.agent_run_company_context(current_setting('t.run2')::uuid) ->> 'icp', 'Construtoras.',
  'a próxima Execução usa a versão nova');
select is((public.agent_run_company_context(current_setting('t.run2')::uuid) ->> 'version')::integer, 2, 'a versão 2');

select is(public.agent_run_company_context(current_setting('t.run_sul')::uuid),
  '{"version": null, "empresa": "", "icp": "", "personas": ""}'::jsonb,
  'o Sul, sem contexto, recebe os textos vazios e nunca o contexto do Norte');
reset role;
select is((select company_context_version from private.agent_runs where id = current_setting('t.run_sul')::uuid), 0,
  'a Execução registra que rodou sem contexto');

select is(
  (select e ->> 'id' from jsonb_array_elements(private.compute_agent_prompt_suggestions(
    'e0600000-0000-0000-0000-000000000020', 'scopus', 'e0600000-0000-0000-0000-000000000003')) e
   where e ->> 'id' like 'scopus-%icp'),
  'scopus-primeiro-icp', 'sem Perfil de cliente ideal no contexto, o Scopus sugere ajudar a escrevê-lo');
select is(
  (select e ->> 'id' from jsonb_array_elements(private.compute_agent_prompt_suggestions(
    'e0600000-0000-0000-0000-000000000010', 'scopus', 'e0600000-0000-0000-0000-000000000001')) e
   where e ->> 'id' like 'scopus-%icp'),
  'scopus-revisar-icp', 'com o Perfil de cliente ideal no contexto, sugere revisá-lo');

-- A Carla salva o primeiro contexto do Sul no meio da Execução: ela continua sem contexto até o fim.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0600000-0000-0000-0000-000000000003', true);
select public.save_company_context('e0600000-0000-0000-0000-000000000020', 'A Sul vende seguros.', 'Corretoras.', 'Gerente.', null);
reset role;
set local role service_role;
select is(public.agent_run_company_context(current_setting('t.run_sul')::uuid) ->> 'empresa', '',
  'a Execução que começou sem contexto não muda no meio');
reset role;

select * from finish();
rollback;

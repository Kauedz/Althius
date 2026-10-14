begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(10);

-- Usuários e Workspaces de teste
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('61000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@enriquecimento.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('61000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@enriquecimento.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('61000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'externo@outro.test', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('62000000-0000-0000-0000-000000000001', 'empresa', 'Workspace Enriquecimento'),
  ('62000000-0000-0000-0000-000000000002', 'empresa', 'Workspace Outro');
insert into private.workspace_contracts (workspace_id, tier_id) select w.id, 'escala' from public.workspaces w on conflict (workspace_id) do nothing; -- contrato de teste (acesso-e-planos)

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('62000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', 'admin', true),
  ('62000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000002', 'member', true),
  ('62000000-0000-0000-0000-000000000002', '61000000-0000-0000-0000-000000000003', 'admin', true);

-- Saldo inicial de 100 créditos para o Workspace
select public.grant_credits('62000000-0000-0000-0000-000000000001', 100, 'plano', 'Saldo inicial de teste');

-- Cria Conta-alvo para os testes de enriquecimento
insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, created_by) values
  ('63000000-0000-0000-0000-000000000001', '62000000-0000-0000-0000-000000000001', 'LogiFlow Brasil S.A.', 'https://logiflow.test', 'logiflow.test', '61000000-0000-0000-0000-000000000001');

insert into public.sales_responsibilities (workspace_id, target_account_id, owner_user_id) values
  ('62000000-0000-0000-0000-000000000001', '63000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001');


set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
create temporary table conta_linkedin as select * from public.save_target_account(
  '62000000-0000-0000-0000-000000000001', 'TOTVS', 'https://www.linkedin.com/company/totvs');
select is((select domain from conta_linkedin), null::text, 'LinkedIn não vira domínio empresarial por RPC direta');
select is((select linkedin_url from conta_linkedin), 'https://www.linkedin.com/company/totvs', 'RPC recupera LinkedIn mesmo com cliente antigo');
select is((select canonical_url from conta_linkedin), 'https://linkedin.com/company/totvs', 'chave canônica continua idempotente');
select is((select id from public.save_target_account('62000000-0000-0000-0000-000000000001', 'TOTVS', 'https://www.linkedin.com/company/totvs', null, 'https://www.linkedin.com/company/totvs')), (select id from conta_linkedin), 'cliente novo atualiza a mesma Conta');
create temporary table execucao as select * from public.begin_committee_discovery('62000000-0000-0000-0000-000000000001', '63000000-0000-0000-0000-000000000001', 'custo-real-1', 1);
reset role;
select public.finish_committee_discovery((select run_id from execucao), true, 1, 0.04, null, 'apify-real');
select is((select apify_run_id from private.discovery_runs where id = (select run_id from execucao)), 'apify-real', 'sucesso grava run id');
select is((select actual_cost_usd from private.discovery_runs where id = (select run_id from execucao)), 0.04::numeric, 'sucesso grava custo');
set local role authenticated;
create temporary table falha as select * from public.begin_committee_discovery('62000000-0000-0000-0000-000000000001', '63000000-0000-0000-0000-000000000001', 'custo-real-2', 1);
reset role;
select public.finish_committee_discovery((select run_id from falha), false, 0, 0.02, 'timeout', 'apify-falha');
select is((select apify_run_id from private.discovery_runs where id = (select run_id from falha)), 'apify-falha', 'falha também grava run id');
select is((select actual_cost_usd from private.discovery_runs where id = (select run_id from falha)), 0.02::numeric, 'falha também grava custo');
select ok(has_function_privilege('service_role', 'public.finish_committee_discovery(uuid,boolean,integer,numeric,text,text)', 'EXECUTE'), 'service_role finaliza');
select ok(not has_function_privilege('authenticated', 'public.finish_committee_discovery(uuid,boolean,integer,numeric,text,text)', 'EXECUTE'), 'sessão comum não finaliza');
select * from finish();
rollback;

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(7);

-- Ajustes de Mercado e Equipe: os 3 cards de Mercado custam 3 por execução também no credits_per_account, e o Workspace
-- ilimitado não tem limite de usuários.
select is(
  (select string_agg(id || ':' || credits_per_account, ',' order by id) from public.signal_catalog
   where workspace_id is null and id in ('nova-mercadoria-importada', 'mudanca-regulatoria-e-licenca', 'calendario-e-plano-safra')),
  'calendario-e-plano-safra:3,mudanca-regulatoria-e-licenca:3,nova-mercadoria-importada:3',
  'os 3 cards de Mercado custam 3 créditos');
select is(
  (select count(*)::int from public.signal_catalog
   where workspace_id is null and id in ('nova-mercadoria-importada', 'mudanca-regulatoria-e-licenca', 'calendario-e-plano-safra')
     and estimated_cost_label = '3 créditos por execução'),
  3, 'e o rótulo continua "3 créditos por execução"');

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('ae000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'ana@equipe.test', '', now(), now(), now(), '{}', '{}', false, false);

-- Equipe: Essencial (2 usuários), mas ilimitada. Comum: Essencial, sem ser ilimitada.
insert into public.workspaces (id, kind, name) values
  ('ae100000-0000-4000-8000-000000000001', 'empresa', 'Equipe'),
  ('ae100000-0000-4000-8000-000000000002', 'empresa', 'Comum');
insert into private.workspace_contracts (workspace_id, tier_id, status, starts_at, billing_mode) values
  ('ae100000-0000-4000-8000-000000000001', 'essencial', 'ativo', now() - interval '1 day', 'contrato'),
  ('ae100000-0000-4000-8000-000000000002', 'essencial', 'ativo', now() - interval '1 day', 'contrato');
insert into private.workspace_billing (workspace_id, credits_enforced, unlimited_credits)
values ('ae100000-0000-4000-8000-000000000001', false, true)
on conflict (workspace_id) do update set unlimited_credits = true;
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('ae100000-0000-4000-8000-000000000001', 'ae000000-0000-4000-8000-000000000001', 'admin', true),
  ('ae100000-0000-4000-8000-000000000002', 'ae000000-0000-4000-8000-000000000001', 'admin', true);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'ae000000-0000-4000-8000-000000000001', true);

select is((select max_users from public.get_contract_summary('ae100000-0000-4000-8000-000000000001')), null::integer,
  'no Workspace ilimitado, o resumo não traz limite de usuários');
select is((select max_users from public.get_contract_summary('ae100000-0000-4000-8000-000000000002')), 2,
  'no Workspace comum, o resumo traz o máximo da faixa');

select lives_ok($$select public.invite_to_workspace('ae100000-0000-4000-8000-000000000001', 'b@equipe.test', 'member')$$,
  'a Equipe convida o segundo');
select lives_ok($$select public.invite_to_workspace('ae100000-0000-4000-8000-000000000001', 'c@equipe.test', 'member')$$,
  'e o terceiro, acima do máximo da faixa');
select lives_ok($$select public.invite_to_workspace('ae100000-0000-4000-8000-000000000001', 'd@equipe.test', 'member')$$,
  'e o quarto');
reset role;

select * from finish();
rollback;

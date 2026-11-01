begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(13);

-- O extrato por Sinal (Fase 8): cada débito aponta o Monitoramento que o gerou, quando há um.
select has_function('public', 'list_credit_statement', array['uuid', 'integer'], 'o RPC do extrato por Sinal existe');
select is((select prosecdef from pg_proc where oid = 'public.list_credit_statement(uuid,integer)'::regprocedure), true, 'roda como security definer');
select ok(
  not has_function_privilege('anon', 'public.list_credit_statement(uuid,integer)', 'execute')
    and has_function_privilege('authenticated', 'public.list_credit_statement(uuid,integer)', 'execute'),
  'só authenticated chama; anon não');

-- Ana (Admin) e Bruno (Membro) no Norte; Carla é do Sul.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values
  ('5c000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5c000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5c000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'carla@sul.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('5c100000-0000-4000-8000-000000000001', 'empresa', 'Norte'),
  ('5c100000-0000-4000-8000-000000000002', 'empresa', 'Sul');
insert into private.workspace_contracts (workspace_id, tier_id, starts_at)
select w.id, 'escala', date_trunc('month', now()) from public.workspaces w
where w.id in ('5c100000-0000-4000-8000-000000000001', '5c100000-0000-4000-8000-000000000002')
on conflict (workspace_id) do nothing;
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('5c100000-0000-4000-8000-000000000001', '5c000000-0000-4000-8000-000000000001', 'admin', true),
  ('5c100000-0000-4000-8000-000000000001', '5c000000-0000-4000-8000-000000000002', 'member', true),
  ('5c100000-0000-4000-8000-000000000002', '5c000000-0000-4000-8000-000000000003', 'admin', true);

-- Dois Monitoramentos no Norte e um no Sul (o do Sul nunca pode dar nome a débito do Norte).
insert into private.signal_monitors (id, workspace_id, signal_type, name, state, audience, criteria, every_hours, created_by) values
  ('5c200000-0000-4000-8000-000000000001', '5c100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'Vagas de compras', 'rascunho', '{}', '{}', 24, '5c000000-0000-4000-8000-000000000001'),
  ('5c200000-0000-4000-8000-000000000002', '5c100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'Novos CNPJs', 'rascunho', '{}', '{}', 24, '5c000000-0000-4000-8000-000000000001'),
  ('5c200000-0000-4000-8000-000000000003', '5c100000-0000-4000-8000-000000000002', 'vaga_linkedin', 'Monitor do Sul', 'rascunho', '{}', '{}', 24, '5c000000-0000-4000-8000-000000000003');

-- Reservas liquidadas e suas saídas, como o servidor as deixaria.
insert into private.credit_reservations (id, workspace_id, user_id, action, action_key, quantity, unit_credits, amount, status, settled_quantity) values
  ('5c300000-0000-4000-8000-000000000001', '5c100000-0000-4000-8000-000000000001', '5c000000-0000-4000-8000-000000000002', 'account_scan',
   'scan:5c200000-0000-4000-8000-000000000001:5c900000-0000-4000-8000-000000000001:2026-10-28', 1, 1, 1, 'settled', 1),
  ('5c300000-0000-4000-8000-000000000002', '5c100000-0000-4000-8000-000000000001', '5c000000-0000-4000-8000-000000000001', 'account_scan',
   'rescan-manual:5c800000-0000-4000-8000-000000000001:5c200000-0000-4000-8000-000000000002', 1, 1, 1, 'settled', 1),
  ('5c300000-0000-4000-8000-000000000003', '5c100000-0000-4000-8000-000000000001', '5c000000-0000-4000-8000-000000000001', 'cascata_de_sinais',
   'cascade:k-extrato-1', 1, 3, 3, 'settled', 1),
  ('5c300000-0000-4000-8000-000000000004', '5c100000-0000-4000-8000-000000000001', '5c000000-0000-4000-8000-000000000001', 'cnpj_receita',
   'cnpj:5c900000-0000-4000-8000-000000000001:00000000000191', 1, 1, 1, 'settled', 1),
  ('5c300000-0000-4000-8000-000000000005', '5c100000-0000-4000-8000-000000000001', '5c000000-0000-4000-8000-000000000001', 'account_scan',
   'scan:nao-e-uuid:xyz', 1, 1, 1, 'settled', 1),
  ('5c300000-0000-4000-8000-000000000006', '5c100000-0000-4000-8000-000000000001', '5c000000-0000-4000-8000-000000000001', 'account_scan',
   'scan:5c200000-0000-4000-8000-000000000003:5c900000-0000-4000-8000-000000000001:2026-10-28', 1, 1, 1, 'settled', 1);
insert into private.signal_cascade_runs (workspace_id, cascade_id, origin, monitor_id, idempotency_key, reservation_id, est_cost_usd, est_credits, cap_usd)
select '5c100000-0000-4000-8000-000000000001', id, 'monitor', '5c200000-0000-4000-8000-000000000002', 'k-extrato-1',
       '5c300000-0000-4000-8000-000000000003', 0.1, 3, 0.5
from private.signal_cascades where signal_type = 'vaga_comex';

insert into private.credit_entries (workspace_id, amount, kind, reservation_id, user_id, note, created_at) values
  ('5c100000-0000-4000-8000-000000000001', 100, 'plano', null, null, 'Plano de outubro', now() - interval '1 day'),
  ('5c100000-0000-4000-8000-000000000001', -1, 'acao', '5c300000-0000-4000-8000-000000000001', '5c000000-0000-4000-8000-000000000002', null, now()),
  ('5c100000-0000-4000-8000-000000000001', -1, 'acao', '5c300000-0000-4000-8000-000000000002', '5c000000-0000-4000-8000-000000000001', null, now()),
  ('5c100000-0000-4000-8000-000000000001', -3, 'acao', '5c300000-0000-4000-8000-000000000003', '5c000000-0000-4000-8000-000000000001', null, now()),
  ('5c100000-0000-4000-8000-000000000001', -1, 'acao', '5c300000-0000-4000-8000-000000000004', '5c000000-0000-4000-8000-000000000001', null, now()),
  ('5c100000-0000-4000-8000-000000000001', -1, 'acao', '5c300000-0000-4000-8000-000000000005', '5c000000-0000-4000-8000-000000000001', null, now()),
  ('5c100000-0000-4000-8000-000000000001', -1, 'acao', '5c300000-0000-4000-8000-000000000006', '5c000000-0000-4000-8000-000000000001', null, now());

-- A Ana (Administradora) vê tudo, com o Sinal de cada débito.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '5c000000-0000-4000-8000-000000000001', true);
select is((select count(*)::integer from public.list_credit_statement('5c100000-0000-4000-8000-000000000001', 50)), 7, 'a Administradora vê as 7 linhas do Norte');
select is(
  (select string_agg(coalesce(action, 'entrada') || '=' || coalesce(signal_name, '-'), ',' order by coalesce(action, 'entrada') collate "C", coalesce(signal_name, '-') collate "C")
   from public.list_credit_statement('5c100000-0000-4000-8000-000000000001', 50)),
  'account_scan=-,account_scan=-,account_scan=Novos CNPJs,account_scan=Vagas de compras,cascata_de_sinais=Novos CNPJs,cnpj_receita=-,entrada=-',
  'scan e rescan pelo Monitoramento da chave, cascata pela execução; CNPJ, entrada e chave malformada ficam sem Sinal');
select is(
  (select signal_id from public.list_credit_statement('5c100000-0000-4000-8000-000000000001', 50) where action = 'cascata_de_sinais'),
  '5c200000-0000-4000-8000-000000000002'::uuid, 'a cascata aponta o Monitoramento da sua execução');
select is(
  (select count(*)::integer from public.list_credit_statement('5c100000-0000-4000-8000-000000000001', 50) where signal_name = 'Monitor do Sul'),
  0, 'um Monitoramento de outro Workspace nunca dá nome a débito do Norte');
select is((select count(*)::integer from public.list_credit_statement('5c100000-0000-4000-8000-000000000001', 2)), 2, 'o limite pedido é respeitado');
select lives_ok($$select * from public.list_credit_statement('5c100000-0000-4000-8000-000000000001', null)$$, 'limite nulo e chave malformada não levantam erro');

-- O Bruno (Membro) vê as entradas e só as próprias ações.
select set_config('request.jwt.claim.sub', '5c000000-0000-4000-8000-000000000002', true);
select is((select count(*)::integer from public.list_credit_statement('5c100000-0000-4000-8000-000000000001', 50)), 2, 'o Membro vê a entrada e a própria ação');
select is(
  (select signal_name from public.list_credit_statement('5c100000-0000-4000-8000-000000000001', 50) where kind = 'acao'),
  'Vagas de compras', 'e a própria ação vem com o Sinal');

-- A Carla é de outro Workspace.
select set_config('request.jwt.claim.sub', '5c000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select * from public.list_credit_statement('5c100000-0000-4000-8000-000000000001', 50)$$,
  '42501', 'active workspace membership required', 'quem é de fora não lê o extrato');
reset role;

select has_function('public', 'list_credit_entries', array['uuid', 'integer'], 'o leitor antigo continua lá');

select * from finish();
rollback;

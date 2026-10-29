begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(19);
create function pg_temp.semear_agentes_padrao(p_workspace_id uuid) returns void
language plpgsql
as $$
begin
  with novos as (
    insert into private.agents (workspace_id, specialty, kind)
    select p_workspace_id, c.specialty, 'padrao' from private.specialty_catalog c
    on conflict do nothing returning id, workspace_id, specialty
  ), configuracao as (
    insert into private.agent_settings (agent_id, workspace_id, channels)
    select n.id, n.workspace_id, array['whatsapp']::text[] from novos n
  )
  insert into private.agent_permissions (agent_id, workspace_id, integration_id, permission)
  select n.id, n.workspace_id, d.integration_id, d.permission from novos n
  join private.specialty_default_permissions d on d.specialty = n.specialty;
end;
$$;


-- Ana (Admin) e Bruno (Membro) do Norte; Eva saiu do Norte; Sul é outro Workspace.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('58000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('58000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('58000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'eva@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('58000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'sul@sul.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('f8000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('f8000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
select pg_temp.semear_agentes_padrao(w.id) from public.workspaces w;
insert into private.workspace_contracts (workspace_id, tier_id, starts_at) select w.id, 'escala', date_trunc('month', now()) from public.workspaces w on conflict (workspace_id) do nothing; -- contrato de teste (acesso-e-planos)
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('f8000000-0000-0000-0000-000000000001', '58000000-0000-0000-0000-000000000001', 'admin', true),
  ('f8000000-0000-0000-0000-000000000001', '58000000-0000-0000-0000-000000000002', 'member', true),
  ('f8000000-0000-0000-0000-000000000001', '58000000-0000-0000-0000-000000000005', 'member', false),
  ('f8000000-0000-0000-0000-000000000002', '58000000-0000-0000-0000-000000000006', 'admin', true);
create function pg_temp.agente(p_workspace text) returns text language sql as $$
  select id::text from private.agents where workspace_id = p_workspace::uuid and specialty = 'scopus'
$$;
insert into private.agent_conversations (id, workspace_id, owner_id, kind) values
  ('c8000000-0000-0000-0000-000000000001', 'f8000000-0000-0000-0000-000000000001', '58000000-0000-0000-0000-000000000001', 'coordenada'),
  ('c8000000-0000-0000-0000-000000000002', 'f8000000-0000-0000-0000-000000000001', '58000000-0000-0000-0000-000000000002', 'coordenada'),
  ('c8000000-0000-0000-0000-000000000003', 'f8000000-0000-0000-0000-000000000001', '58000000-0000-0000-0000-000000000005', 'coordenada'),
  ('c8000000-0000-0000-0000-000000000004', 'f8000000-0000-0000-0000-000000000002', '58000000-0000-0000-0000-000000000006', 'coordenada');
insert into private.agent_runs (id, workspace_id, conversation_id, requested_by, client_request_id, request_text) values
  ('e8000000-0000-0000-0000-000000000001', 'f8000000-0000-0000-0000-000000000001', 'c8000000-0000-0000-0000-000000000001', '58000000-0000-0000-0000-000000000001', gen_random_uuid(), 'Quem são os melhores alvos?'),
  ('e8000000-0000-0000-0000-000000000002', 'f8000000-0000-0000-0000-000000000001', 'c8000000-0000-0000-0000-000000000002', '58000000-0000-0000-0000-000000000002', gen_random_uuid(), 'Resuma a Alfa'),
  ('e8000000-0000-0000-0000-000000000003', 'f8000000-0000-0000-0000-000000000001', 'c8000000-0000-0000-0000-000000000003', '58000000-0000-0000-0000-000000000005', gen_random_uuid(), 'Pedido de quem saiu'),
  ('e8000000-0000-0000-0000-000000000004', 'f8000000-0000-0000-0000-000000000002', 'c8000000-0000-0000-0000-000000000004', '58000000-0000-0000-0000-000000000006', gen_random_uuid(), 'Pedido do Sul');

create temporary table r (k text primary key, id uuid) on commit drop;
create function pg_temp.rodada(p_run text, p_agent text, p_round integer, p_own boolean default false)
returns text language sql as $$
  select outcome || ':' || coalesce(reservation_id::text, '-')
  from public.begin_agent_round(p_run::uuid, p_agent::uuid, p_round, p_own)
$$;

-- 1. Só o servidor abre, fecha e liga a cobrança.
select ok(
  not has_function_privilege('authenticated', 'public.begin_agent_round(uuid, uuid, integer, boolean)', 'execute')
    and not has_function_privilege('authenticated', 'public.end_agent_round(uuid, boolean)', 'execute')
    and not has_function_privilege('authenticated', 'public.set_credits_enforced(uuid, boolean)', 'execute')
    and has_function_privilege('service_role', 'public.begin_agent_round(uuid, uuid, integer, boolean)', 'execute')
    and has_function_privilege('service_role', 'public.end_agent_round(uuid, boolean)', 'execute')
    and has_function_privilege('service_role', 'public.set_credits_enforced(uuid, boolean)', 'execute'),
  'abrir e fechar a rodada de um Agente e ligar a cobrança são só do servidor'
);
select ok(not has_table_privilege('authenticated', 'private.workspace_billing', 'select'), 'a tabela da cobrança não é lida direto');

-- 2. A rodada sempre reserva (acesso-e-planos): mesmo sem ligar a cobrança, sem saldo o Agente não roda.
select is(split_part(pg_temp.rodada('e8000000-0000-0000-0000-000000000001', pg_temp.agente('f8000000-0000-0000-0000-000000000001'), 1), ':', 1), 'no_credits', 'sem ligar a cobrança, a rodada já exige saldo');
select is((select count(*)::integer from private.credit_reservations), 0, 'e nada fica reservado');

-- 3. Ligar a cobrança (dormente) não muda nada: sem saldo o Agente não roda.
select public.set_credits_enforced('f8000000-0000-0000-0000-000000000001', true);
select is(split_part(pg_temp.rodada('e8000000-0000-0000-0000-000000000001', pg_temp.agente('f8000000-0000-0000-0000-000000000001'), 1), ':', 1), 'no_credits', 'sem saldo, a rodada não abre');
select is((select count(*)::integer from private.credit_reservations), 0, 'e nada fica reservado');
select is(split_part(pg_temp.rodada('e8000000-0000-0000-0000-000000000004', pg_temp.agente('f8000000-0000-0000-0000-000000000002'), 1), ':', 1), 'no_credits', 'o Workspace que nunca ligou a cobrança também não roda sem saldo');

-- 4. Com saldo: um Agente por rodada é um débito, e repetir a rodada não cobra duas vezes.
select public.grant_credits('f8000000-0000-0000-0000-000000000001', 5, 'plano');
insert into r select 'r1', split_part(pg_temp.rodada('e8000000-0000-0000-0000-000000000001', pg_temp.agente('f8000000-0000-0000-0000-000000000001'), 1), ':', 2)::uuid;
select isnt((select id from r where k = 'r1'), null, 'com saldo, a rodada abre e reserva 1 crédito');
select is(
  pg_temp.rodada('e8000000-0000-0000-0000-000000000001', pg_temp.agente('f8000000-0000-0000-0000-000000000001'), 1),
  'go:' || (select id from r where k = 'r1'), 'repetir a rodada devolve a mesma reserva'
);
select lives_ok(format($$select public.end_agent_round(%L, true)$$, (select id from r where k = 'r1')), 'rodada concluída');
select is((select t.booked from private.credit_totals('f8000000-0000-0000-0000-000000000001') t), 4.00::numeric, 'debitou 1 crédito');
select is(
  pg_temp.rodada('e8000000-0000-0000-0000-000000000001', pg_temp.agente('f8000000-0000-0000-0000-000000000001'), 1),
  'paid:' || (select id from r where k = 'r1'), 'a rodada já paga roda de novo sem cobrar'
);

-- 5. A rodada que falhou não cobra, e a nova tentativa cobra só se concluir.
insert into r select 'r2', split_part(pg_temp.rodada('e8000000-0000-0000-0000-000000000001', pg_temp.agente('f8000000-0000-0000-0000-000000000001'), 2), ':', 2)::uuid;
select lives_ok(format($$select public.end_agent_round(%L, false)$$, (select id from r where k = 'r2')), 'rodada que falhou');
select is((select t.booked from private.credit_totals('f8000000-0000-0000-0000-000000000001') t), 4.00::numeric, 'não debitou');
select is(
  split_part(pg_temp.rodada('e8000000-0000-0000-0000-000000000001', pg_temp.agente('f8000000-0000-0000-0000-000000000001'), 2), ':', 1), 'go',
  'a nova tentativa da mesma rodada abre outra reserva'
);

-- 6. A chave de IA do próprio cliente paga 20% da rodada.
insert into r select 'r3', split_part(pg_temp.rodada('e8000000-0000-0000-0000-000000000001', pg_temp.agente('f8000000-0000-0000-0000-000000000001'), 3, true), ':', 2)::uuid;
select is((select amount from private.credit_reservations where id = (select id from r where k = 'r3')), 0.20::numeric, 'a rodada com a chave do cliente custa 0,20');

-- 7. O limite mensal do participante vale; quem saiu não trava a rodada (o crédito é do Workspace).
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '58000000-0000-0000-0000-000000000001', true);
select public.set_member_credit_limit('f8000000-0000-0000-0000-000000000001', '58000000-0000-0000-0000-000000000002', 0);
reset role;
select is(split_part(pg_temp.rodada('e8000000-0000-0000-0000-000000000002', pg_temp.agente('f8000000-0000-0000-0000-000000000001'), 1), ':', 1), 'no_credits', 'no limite mensal do participante, a rodada dele não abre');
select is(split_part(pg_temp.rodada('e8000000-0000-0000-0000-000000000003', pg_temp.agente('f8000000-0000-0000-0000-000000000001'), 1), ':', 1), 'go', 'quem saiu do Workspace não trava a rodada');

-- 8. Execução ou Agente que não existem no Workspace.
select throws_ok(
  $$select * from public.begin_agent_round(gen_random_uuid(), pg_temp.agente('f8000000-0000-0000-0000-000000000001')::uuid, 1, false)$$,
  'P0002', 'agent run not found', 'Execução inexistente é recusada'
);

select * from finish();
rollback;

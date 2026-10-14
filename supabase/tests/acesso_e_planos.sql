begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(77);

-- Acesso e planos: o Workspace só gasta com contrato ativo (ou ilimitado), a rodada de Agente sempre reserva, o plano
-- limita os usuários, só o staff provisiona Workspace e o visitante fala com a equipe por um pedido com limite.
-- Pessoas: Ana (Administradora dos Workspaces com contrato), Bruno e Carla (membros), Dora (staff da Althius),
-- Eva (visitante, sem Participação), Fabio (visitante).
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('ac000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('ac000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('ac000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'carla@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('ac000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'dora@althius.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('ac000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'eva@visitante.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('ac000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'fabio@visitante.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into private.althius_staff (user_id) values ('ac000000-0000-4000-8000-000000000004');

-- Norte: Essencial (2 usuários), contrato ativo. Sul: sem contrato. Leste: contrato suspenso. Oeste: contrato que ainda
-- não começou. Livre: ilimitado, sem contrato. Centro: Escala em modo saas.
insert into public.workspaces (id, kind, name) values
  ('ac100000-0000-4000-8000-000000000001', 'empresa', 'Norte'),
  ('ac100000-0000-4000-8000-000000000002', 'empresa', 'Sul'),
  ('ac100000-0000-4000-8000-000000000003', 'empresa', 'Leste'),
  ('ac100000-0000-4000-8000-000000000004', 'empresa', 'Oeste'),
  ('ac100000-0000-4000-8000-000000000005', 'empresa', 'Livre'),
  ('ac100000-0000-4000-8000-000000000006', 'empresa', 'Centro');
insert into private.workspace_contracts (workspace_id, tier_id, status, starts_at, billing_mode) values
  ('ac100000-0000-4000-8000-000000000001', 'essencial', 'ativo', now() - interval '1 day', 'contrato'),
  ('ac100000-0000-4000-8000-000000000003', 'profissional', 'suspenso', now() - interval '1 day', 'contrato'),
  ('ac100000-0000-4000-8000-000000000004', 'escala', 'ativo', now() + interval '10 days', 'contrato'),
  ('ac100000-0000-4000-8000-000000000006', 'escala', 'ativo', now() - interval '1 day', 'saas');
insert into private.workspace_billing (workspace_id, credits_enforced, unlimited_credits)
values ('ac100000-0000-4000-8000-000000000005', false, true);
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('ac100000-0000-4000-8000-000000000001', 'ac000000-0000-4000-8000-000000000001', 'admin', true),
  ('ac100000-0000-4000-8000-000000000002', 'ac000000-0000-4000-8000-000000000001', 'admin', true),
  ('ac100000-0000-4000-8000-000000000003', 'ac000000-0000-4000-8000-000000000001', 'admin', true),
  ('ac100000-0000-4000-8000-000000000004', 'ac000000-0000-4000-8000-000000000001', 'admin', true),
  ('ac100000-0000-4000-8000-000000000005', 'ac000000-0000-4000-8000-000000000001', 'admin', true),
  ('ac100000-0000-4000-8000-000000000006', 'ac000000-0000-4000-8000-000000000001', 'admin', true);
select public.grant_credits(w.id, 100, 'plano', 'saldo de teste') from public.workspaces w
where w.id::text like 'ac100000-%';

-- Lê um convite pendente pelo dono da conexão (o cliente não lê o schema private).
create function pg_temp.convite(p_workspace uuid, p_email text, p_coluna text)
returns text language sql security definer as $f$
  select case p_coluna when 'id' then i.id::text else i.token end
  from private.workspace_invitations i where i.workspace_id = p_workspace and i.email = p_email and i.status = 'pendente'
$f$;
grant execute on function pg_temp.convite(uuid, text, text) to authenticated;

-- 1. As faixas e o que o cliente não lê.
select is(
  (select string_agg(id || ':' || max_users || ':' || monthly_credits || ':' || internal_usd_guard, ',' order by max_users)
   from private.contract_tiers),
  'essencial:2:3000:140.00,profissional:3:4500:195.00,escala:5:6000:280.00',
  'as três faixas: usuários, créditos mensais e a guarda interna em dólar');
select ok(
  not has_table_privilege('authenticated', 'private.contract_tiers', 'select')
    and not has_table_privilege('authenticated', 'private.workspace_contracts', 'select')
    and not has_table_privilege('authenticated', 'private.access_requests', 'select')
    and not has_table_privilege('service_role', 'private.workspace_contracts', 'insert'),
  'faixas, contratos e pedidos de acesso não são lidos nem escritos direto');
select throws_ok(
  $$insert into private.workspace_contracts (workspace_id, tier_id, billing_mode) values ('ac100000-0000-4000-8000-000000000002', 'escala', 'cartao')$$,
  '23514', null, 'o modo de cobrança é contrato ou saas');
select is((select billing_mode from private.workspace_contracts where workspace_id = 'ac100000-0000-4000-8000-000000000001'),
  'contrato', 'o modo de cobrança padrão é contrato');

-- 2. A Equipe Althius tem contrato ativo e continua ilimitada e sem Teto; os de teste não ganham contrato.
select is(
  (select tier_id || ':' || status from private.workspace_contracts where workspace_id = 'e0a17e00-0000-4000-8000-000000000001'),
  'escala:ativo', 'a Equipe Althius tem contrato ativo');
select is(private.credits_unlimited('e0a17e00-0000-4000-8000-000000000001'), true, 'e continua ilimitada');
select ok((select monthly_cap_usd is null from private.workspace_signal_budget where workspace_id = 'e0a17e00-0000-4000-8000-000000000001'),
  'e sem Teto');
select is((select count(*)::int from private.workspace_contracts where workspace_id = 'ac100000-0000-4000-8000-000000000002'), 0,
  'um Workspace sem contrato continua sem contrato');

-- 3. A guarda: sem contrato ativo, a reserva recusa.
select lives_ok(
  $$select public.reserve_credits('ac100000-0000-4000-8000-000000000001', 'ac000000-0000-4000-8000-000000000001', 'person_collected', 'g1', 1, false)$$,
  'com contrato ativo, a reserva passa');
select throws_ok(
  $$select public.reserve_credits('ac100000-0000-4000-8000-000000000002', 'ac000000-0000-4000-8000-000000000001', 'person_collected', 'g2', 1, false)$$,
  'P0001', 'insufficient credits', 'sem contrato, a ação paga é recusada, mesmo com saldo');
select throws_ok(
  $$select public.reserve_credits('ac100000-0000-4000-8000-000000000003', 'ac000000-0000-4000-8000-000000000001', 'person_collected', 'g3', 1, false)$$,
  'P0001', 'insufficient credits', 'contrato suspenso: recusada');
select throws_ok(
  $$select public.reserve_credits('ac100000-0000-4000-8000-000000000004', 'ac000000-0000-4000-8000-000000000001', 'person_collected', 'g4', 1, false)$$,
  'P0001', 'insufficient credits', 'contrato que ainda não começou: recusada');
select lives_ok(
  $$select public.reserve_credits('ac100000-0000-4000-8000-000000000005', 'ac000000-0000-4000-8000-000000000001', 'person_collected', 'g5', 1, false)$$,
  'ilimitado passa sem contrato');
select lives_ok(
  $$select public.reserve_credits('ac100000-0000-4000-8000-000000000006', 'ac000000-0000-4000-8000-000000000001', 'person_collected', 'g6', 1, false)$$,
  'contrato em modo saas também vale para gastar');
create function pg_temp.dica_da_recusa() returns text language plpgsql as $f$
declare
  v_hint text;
  v_detail text;
begin
  perform public.reserve_credits('ac100000-0000-4000-8000-000000000002', 'ac000000-0000-4000-8000-000000000001', 'person_collected', 'g2b', 1, false);
  return 'sem recusa';
exception when others then
  get stacked diagnostics v_hint = pg_exception_hint, v_detail = pg_exception_detail;
  return v_hint || '|' || v_detail;
end;
$f$;
select is(pg_temp.dica_da_recusa(), 'contract|active contract required',
  'a recusa diz que falta contrato, para a tela distinguir de saldo');
select is((select count(*)::int from private.credit_reservations where workspace_id in
  ('ac100000-0000-4000-8000-000000000002', 'ac100000-0000-4000-8000-000000000003', 'ac100000-0000-4000-8000-000000000004')),
  0, 'e nada fica reservado');

-- 4. A rodada de Agente sempre reserva, sem ligar credits_enforced.
select is(private.credits_enforced('ac100000-0000-4000-8000-000000000001'), true,
  'a cobrança vale sempre, mesmo sem a coluna ligada');
insert into private.agent_conversations (id, workspace_id, owner_id, kind, agent_id)
select 'ac200000-0000-4000-8000-000000000001', 'ac100000-0000-4000-8000-000000000001', 'ac000000-0000-4000-8000-000000000001', 'agente', a.id
from private.agents a where a.workspace_id = 'ac100000-0000-4000-8000-000000000001' and a.specialty = 'scopus' and a.kind = 'padrao';
insert into private.agent_conversations (id, workspace_id, owner_id, kind, agent_id)
select 'ac200000-0000-4000-8000-000000000002', 'ac100000-0000-4000-8000-000000000002', 'ac000000-0000-4000-8000-000000000001', 'agente', a.id
from private.agents a where a.workspace_id = 'ac100000-0000-4000-8000-000000000002' and a.specialty = 'scopus' and a.kind = 'padrao';
insert into private.agent_runs (id, workspace_id, conversation_id, requested_by, client_request_id, request_text) values
  ('ac300000-0000-4000-8000-000000000001', 'ac100000-0000-4000-8000-000000000001', 'ac200000-0000-4000-8000-000000000001', 'ac000000-0000-4000-8000-000000000001', gen_random_uuid(), 'Com contrato'),
  ('ac300000-0000-4000-8000-000000000002', 'ac100000-0000-4000-8000-000000000002', 'ac200000-0000-4000-8000-000000000002', 'ac000000-0000-4000-8000-000000000001', gen_random_uuid(), 'Sem contrato');
select isnt(public.claim_agent_run('ac300000-0000-4000-8000-000000000001'), null::jsonb,
  'com contrato e saldo, a Execução abre');
select is((select status || '|' || quantity from private.credit_reservations
           where workspace_id = 'ac100000-0000-4000-8000-000000000001' and action_key = 'run:ac300000-0000-4000-8000-000000000001'),
  'reserved|1', 'e o claim reservou a estimativa, sem a cobrança ligada');
select is(public.claim_agent_run('ac300000-0000-4000-8000-000000000002'), null::jsonb,
  'sem contrato, a Execução não abre');
select is((select status || '|' || error_code from private.agent_runs where id = 'ac300000-0000-4000-8000-000000000002'),
  'failed|insufficient_credits', 'e fecha pelo motivo claro');
select is((select outcome from public.begin_agent_round('ac300000-0000-4000-8000-000000000001',
  (select agent_id from private.agent_conversations where id = 'ac200000-0000-4000-8000-000000000001'), 1, false)),
  'go', 'a rodada de Agente com contrato sai da reserva (nunca "free")');

-- 5. O acesso ao Workspace sai do contrato quando o modo é contrato.
select set_config('request.jwt.claim.sub', 'ac000000-0000-4000-8000-000000000001', true);
update private.billing_settings set enforced = true;
set local role authenticated;
select is((select released || ':' || reason from public.workspace_access('ac100000-0000-4000-8000-000000000001')),
  'true:contrato', 'contrato ativo libera, mesmo com a cobrança do Stripe ligada');
select is((select released || ':' || reason from public.workspace_access('ac100000-0000-4000-8000-000000000003')),
  'false:contrato_suspenso', 'contrato suspenso fecha');
select is((select released || ':' || reason from public.workspace_access('ac100000-0000-4000-8000-000000000004')),
  'false:contrato_a_iniciar', 'contrato que ainda não começou fecha');
select is((select released || ':' || reason from public.workspace_access('ac100000-0000-4000-8000-000000000006')),
  'false:sem_assinatura', 'no modo saas vale o caminho do Stripe de antes');
select is((select released || ':' || reason from public.workspace_access('ac100000-0000-4000-8000-000000000002')),
  'false:sem_assinatura', 'sem contrato vale o caminho do Stripe de antes');
reset role;
update private.billing_settings set enforced = false;

-- 6. Quais Workspaces contratados a pessoa tem, e o resumo do contrato.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select array_agg(workspace_id order by workspace_id) from public.list_my_contracted_workspaces()),
  array['ac100000-0000-4000-8000-000000000001', 'ac100000-0000-4000-8000-000000000006']::uuid[],
  'só os Workspaces com contrato ativo contam como contratados');
select set_config('request.jwt.claim.sub', 'ac000000-0000-4000-8000-000000000005', true);
select is((select count(*)::int from public.list_my_contracted_workspaces()), 0, 'quem não participa de nenhum é visitante');
select set_config('request.jwt.claim.sub', 'ac000000-0000-4000-8000-000000000001', true);
select is(
  (select tier_name || '|' || status || '|' || max_users || '|' || monthly_credits || '|' || monthly_credit_limit || '|' || active_users
   from public.get_contract_summary('ac100000-0000-4000-8000-000000000001')),
  'Essencial|ativo|2|3000|3000|1', 'o resumo traz a faixa, o limite mensal e os usuários');
select is((select count(*)::int from public.get_contract_summary('ac100000-0000-4000-8000-000000000002')), 0,
  'sem contrato, o resumo vem vazio');
select is((select month_usage from public.get_contract_summary('ac100000-0000-4000-8000-000000000001')), 2.00::numeric,
  'o uso do mês soma o reservado');
select set_config('request.jwt.claim.sub', 'ac000000-0000-4000-8000-000000000005', true);
select throws_ok($$select * from public.get_contract_summary('ac100000-0000-4000-8000-000000000001')$$,
  '42501', 'active workspace membership required', 'só participante lê o resumo');
reset role;

-- 7. O limite de usuários nos convites. Norte é Essencial: 2 usuários. Ana é a primeira.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'ac000000-0000-4000-8000-000000000001', true);
select lives_ok($$select public.invite_to_workspace('ac100000-0000-4000-8000-000000000001', 'bruno@norte.test', 'member')$$,
  'o segundo usuário cabe no plano');
select throws_ok($$select public.invite_to_workspace('ac100000-0000-4000-8000-000000000001', 'carla@norte.test', 'member')$$,
  'P0001', 'Seu plano permite até 2 usuários. Fale com a equipe Althius para ampliar.',
  'participantes ativos mais convites pendentes chegam ao máximo: recusa com a mensagem do plano');
select is((select count(*)::int from public.list_workspace_invitations('ac100000-0000-4000-8000-000000000001')),
  1, 'e o convite recusado não foi gravado');
select lives_ok(
  $$select public.revoke_workspace_invitation(pg_temp.convite('ac100000-0000-4000-8000-000000000001', 'bruno@norte.test', 'id')::uuid)$$,
  'revogar o convite libera a vaga');
select lives_ok($$select public.invite_to_workspace('ac100000-0000-4000-8000-000000000001', 'carla@norte.test', 'member')$$,
  'e um novo convite cabe');
reset role;
update private.workspace_invitations set expires_at = now() - interval '1 day'
where workspace_id = 'ac100000-0000-4000-8000-000000000001' and email = 'carla@norte.test';
set local role authenticated;
select lives_ok($$select public.invite_to_workspace('ac100000-0000-4000-8000-000000000001', 'bruno@norte.test', 'member')$$,
  'convite expirado não conta como pendente');
select lives_ok($$select public.invite_to_workspace('ac100000-0000-4000-8000-000000000002', 'bruno@norte.test', 'member')$$,
  'Workspace sem contrato não tem limite de usuários');
select lives_ok($$select public.invite_to_workspace('ac100000-0000-4000-8000-000000000005', 'bruno@norte.test', 'member')$$,
  'Workspace ilimitado não tem limite de usuários');
reset role;
-- Um convite aceito entra direto: Bruno aceita e passa a participar do Norte, que agora está cheio.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'ac000000-0000-4000-8000-000000000002', true);
select is((select id from public.accept_workspace_invitation(
  pg_temp.convite('ac100000-0000-4000-8000-000000000001', 'bruno@norte.test', 'token'))),
  'ac100000-0000-4000-8000-000000000001'::uuid, 'o convidado de um Workspace contratado entra direto');
select is((select count(*)::int from public.list_my_contracted_workspaces()), 1, 'e já o enxerga como contratado');
reset role;

-- 8. O staff provisiona Workspace; quem não é staff, não.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'ac000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select * from public.staff_provision_workspace('Cliente Novo', 'admin@cliente.test', 'profissional', null)$$,
  '42501', 'only the Althius team provisions workspaces', 'quem não é staff é recusado');
select is((select count(*)::int from public.workspaces where name = 'Cliente Novo'), 0, 'e nada foi criado');
select set_config('request.jwt.claim.sub', 'ac000000-0000-4000-8000-000000000004', true);
select throws_ok($$select * from public.staff_provision_workspace('Cliente Novo', 'admin@cliente.test', 'inexistente', null)$$,
  '22023', 'unknown contract tier', 'faixa inexistente é recusada');
select throws_ok($$select * from public.staff_provision_workspace('Cliente Novo', 'sem-arroba', 'essencial', null)$$,
  '22023', 'invalid email', 'e-mail inválido é recusado');
select throws_ok($$select * from public.staff_provision_workspace('   ', 'admin@cliente.test', 'essencial', null)$$,
  '22023', 'invalid workspace name', 'nome em branco é recusado');
select is((select count(*)::int from public.workspaces where name = 'Cliente Novo'), 0, 'recusas não criam Workspace');
create temporary table provisionado on commit drop as
  select * from public.staff_provision_workspace('Cliente Novo', 'Admin@Cliente.test', 'profissional', null);
grant select on provisionado to authenticated;
reset role;
select is((select kind from public.workspaces where id = (select workspace_id from provisionado)), 'empresa',
  'o staff cria um Workspace da empresa');
select is(
  (select tier_id || '|' || status || '|' || billing_mode || '|' || monthly_credit_limit from private.workspace_contracts
   where workspace_id = (select workspace_id from provisionado)),
  'profissional|ativo|contrato|4500.00', 'com contrato ativo da faixa, em modo contrato, e o limite mensal da faixa');
select is((select t.booked from private.credit_totals((select workspace_id from provisionado)) t), 4500.00::numeric,
  'os créditos do mês entram como plano');
select is((select kind || '|' || amount from private.credit_entries where workspace_id = (select workspace_id from provisionado)),
  'plano|4500.00', 'no extrato, como lançamento do plano');
select is((select monthly_cap_usd from private.workspace_signal_budget where workspace_id = (select workspace_id from provisionado)),
  195.00::numeric, 'o Teto interno é a guarda da faixa');
select is(
  (select email || '|' || role || '|' || status from private.workspace_invitations where id = (select invitation_id from provisionado)),
  'admin@cliente.test|admin|pendente', 'o administrador é convidado, com o e-mail normalizado');
select ok((select length(invitation_token) >= 64 from provisionado), 'e o link volta no retorno');
select is((select count(*)::int from public.workspace_memberships where workspace_id = (select workspace_id from provisionado)), 0,
  'o staff não vira participante do Workspace do cliente');
select is((select count(*)::int from private.workspace_participation_events where workspace_id = (select workspace_id from provisionado)), 2,
  'a criação e o convite ficam no histórico de participação');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'ac000000-0000-4000-8000-000000000004', true);
select is((select count(*)::int from public.staff_provision_workspace('Cliente Dois', 'dois@cliente.test', 'essencial', 10)), 1,
  'o staff provisiona de novo');
reset role;
select is((select t.booked from private.credit_totals((select id from public.workspaces where name = 'Cliente Dois')) t), 10.00::numeric,
  'com créditos iniciais informados, vale o informado');
select ok(not has_function_privilege('anon', 'public.staff_provision_workspace(text, text, text, numeric)', 'execute'),
  'o visitante anônimo não chama o provisionamento');

-- 9. O pedido "Fale com a equipe Althius".
set local role authenticated;
select set_config('request.jwt.claim.sub', 'ac000000-0000-4000-8000-000000000005', true);
create temporary table pedido on commit drop as
  select public.submit_access_request('Eva Dias', 'Cliente SA', '11 99999-0000', 'Quero conhecer a Althius.') as id;
grant select on pedido to authenticated;
select isnt((select id from pedido), null::uuid, 'o visitante envia o pedido de acesso');
select throws_ok($$select public.submit_access_request('', 'Cliente SA', '11 99999-0000', 'Oi')$$,
  '22023', 'invalid access request', 'nome em branco é recusado');
select throws_ok($$select public.submit_access_request('Eva', 'Cliente SA', '123', 'Oi')$$,
  '22023', 'invalid access request', 'telefone curto é recusado');
select throws_ok($$select * from private.access_requests$$, '42501', null, 'o cliente não lê a tabela de pedidos');
select is((select name || '|' || company || '|' || email from public.claim_access_request_notice((select id from pedido))),
  'Eva Dias|Cliente SA|eva@visitante.test', 'a Edge Function reserva o aviso com a sessão de quem pediu');
select is((select count(*)::int from public.claim_access_request_notice((select id from pedido))), 0, 'e o aviso sai uma vez só');
select lives_ok($$select public.release_access_request_notice((select id from pedido))$$, 'se o provedor recusar, o aviso é solto');
select is((select count(*)::int from public.claim_access_request_notice((select id from pedido))), 1, 'e pode ser reservado de novo');
select set_config('request.jwt.claim.sub', 'ac000000-0000-4000-8000-000000000006', true);
select is((select count(*)::int from public.claim_access_request_notice((select id from pedido))), 0,
  'outra pessoa não reserva o aviso do pedido alheio');
select set_config('request.jwt.claim.sub', 'ac000000-0000-4000-8000-000000000005', true);
select lives_ok($$select public.submit_access_request('Eva Dias', 'Cliente SA', '11 99999-0000', 'Mais um.')$$, 'segundo');
select lives_ok($$select public.submit_access_request('Eva Dias', 'Cliente SA', '11 99999-0000', 'Mais um.')$$, 'terceiro');
select lives_ok($$select public.submit_access_request('Eva Dias', 'Cliente SA', '11 99999-0000', 'Mais um.')$$, 'quarto');
select lives_ok($$select public.submit_access_request('Eva Dias', 'Cliente SA', '11 99999-0000', 'Mais um.')$$, 'quinto');
select throws_ok($$select public.submit_access_request('Eva Dias', 'Cliente SA', '11 99999-0000', 'Mais um.')$$,
  'P0001', 'too many access requests', 'o sexto pedido em 24 horas passa do limite por usuário');
select set_config('request.jwt.claim.sub', 'ac000000-0000-4000-8000-000000000006', true);
select lives_ok($$select public.submit_access_request('Fabio', 'Outra SA', '11 98888-0000', 'Oi')$$, 'e o limite é de cada usuário');
reset role;
set local role anon;
select throws_ok($$select public.submit_access_request('Anon', 'X', '11 98888-0000', 'Oi')$$,
  '42501', 'permission denied for function submit_access_request', 'sem sessão, ninguém envia');
reset role;

select * from finish();
rollback;

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(89);

-- Reserva de Créditos antes de executar (orquestracao, ticket 02). O claim reserva a estimativa da Execução; a rodada de
-- cada Agente consome essa reserva e só reserva de novo quando ela acaba; o fim da Execução liquida o que as rodadas
-- concluídas custaram e solta o resto. Norte assinou (cobrança ligada, com saldo), Leste assinou e está sem saldo, Sul
-- não assinou (cobrança desligada) e é onde as Rotinas mostram o teto, que vale com a cobrança desligada.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('7a000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('7a000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('7a000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@sul.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('7a000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'dario@leste.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('7b000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('7b000000-0000-0000-0000-000000000002', 'empresa', 'Sul'),
  ('7b000000-0000-0000-0000-000000000003', 'empresa', 'Leste');
insert into private.workspace_contracts (workspace_id, tier_id) select w.id, 'escala' from public.workspaces w on conflict (workspace_id) do nothing; -- contrato de teste (acesso-e-planos)
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('7b000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-000000000001', 'admin', true),
  ('7b000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-000000000002', 'member', true),
  ('7b000000-0000-0000-0000-000000000002', '7a000000-0000-0000-0000-000000000003', 'admin', true),
  ('7b000000-0000-0000-0000-000000000003', '7a000000-0000-0000-0000-000000000004', 'admin', true);

create temporary table ids (chave text primary key, valor uuid) on commit drop;
grant all on ids to authenticated, service_role;
create function pg_temp.i(p_chave text) returns uuid language sql as $f$ select valor from pg_temp.ids where chave = p_chave $f$;
insert into ids select 'scopus', a.id from private.agents a
where a.workspace_id = '7b000000-0000-0000-0000-000000000001' and a.specialty = 'scopus' and a.kind = 'padrao';
insert into ids select 'rhetor', a.id from private.agents a
where a.workspace_id = '7b000000-0000-0000-0000-000000000001' and a.specialty = 'rhetor' and a.kind = 'padrao';
insert into ids select 'scopus_sul', a.id from private.agents a
where a.workspace_id = '7b000000-0000-0000-0000-000000000002' and a.specialty = 'scopus' and a.kind = 'padrao';
insert into ids select 'scopus_leste', a.id from private.agents a
where a.workspace_id = '7b000000-0000-0000-0000-000000000003' and a.specialty = 'scopus' and a.kind = 'padrao';

-- Um pedido na fila: a Conversa (do tipo pedido) e a Execução `queued`. Devolve a Execução.
create function pg_temp.pedido(p_nome text, p_ws uuid, p_user uuid, p_kind text, p_agent uuid, p_mentions uuid[] default '{}')
returns uuid language plpgsql as $f$
declare
  v_conv uuid;
  v_run uuid;
begin
  insert into private.agent_conversations (workspace_id, owner_id, kind, agent_id)
  values (p_ws, p_user, p_kind, case when p_kind = 'agente' then p_agent end) returning id into v_conv;
  insert into private.agent_runs (workspace_id, conversation_id, requested_by, client_request_id, request_text, mentions)
  values (p_ws, v_conv, p_user, gen_random_uuid(), 'Pedido ' || p_nome, p_mentions) returning id into v_run;
  insert into pg_temp.ids values ('run:' || p_nome, v_run);
  return v_run;
end;
$f$;
-- O claim: devolve se a Execução abriu.
create function pg_temp.claim(p_nome text) returns boolean language sql as $f$
  select public.claim_agent_run(pg_temp.i('run:' || p_nome)) is not null
$f$;
-- A reserva de estimativa da Execução: estado, quantidade, valor e quantidade liquidada.
create function pg_temp.estimativa(p_nome text) returns text language sql as $f$
  select coalesce((select status || '|' || quantity || '|' || amount || '|' || coalesce(settled_quantity::text, '-')
    from private.credit_reservations where action_key = 'run:' || pg_temp.i('run:' || p_nome)::text), 'nenhuma')
$f$;
-- A rodada de um Agente: o desfecho do begin_agent_round, guardando o id devolvido.
create function pg_temp.abrir(p_nome text, p_agente text, p_rodada integer) returns text language plpgsql as $f$
declare
  v record;
begin
  select * into v from public.begin_agent_round(pg_temp.i('run:' || p_nome), pg_temp.i(p_agente), p_rodada, false);
  if v.reservation_id is not null then
    insert into pg_temp.ids values ('rodada:' || p_nome || ':' || p_agente || ':' || p_rodada, v.reservation_id)
    on conflict (chave) do update set valor = excluded.valor;
  end if;
  return v.outcome;
end;
$f$;
create function pg_temp.concluir(p_nome text, p_agente text, p_rodada integer, p_ok boolean) returns void language sql as $f$
  select public.end_agent_round(pg_temp.i('rodada:' || p_nome || ':' || p_agente || ':' || p_rodada), p_ok)
$f$;
create function pg_temp.sucesso(p_nome text) returns void language plpgsql as $f$
begin
  perform private.append_run_event(pg_temp.i('run:' || p_nome), 'resposta', null, null, '{"texto":"feito"}');
  perform public.finish_agent_run(pg_temp.i('run:' || p_nome), 'succeeded', null, 'm');
end;
$f$;
create function pg_temp.falha(p_nome text, p_codigo text) returns void language sql as $f$
  select public.finish_agent_run(pg_temp.i('run:' || p_nome), 'failed', p_codigo, null)
$f$;
create function pg_temp.motivo(p_nome text) returns text language sql as $f$
  select status || '|' || coalesce(error_code, '-') from private.agent_runs where id = pg_temp.i('run:' || p_nome)
$f$;
create function pg_temp.disponivel(p_ws uuid) returns numeric language sql as $f$
  select t.booked - t.reserved from private.credit_totals(p_ws) t
$f$;
create function pg_temp.lancamentos(p_nome text) returns integer language sql as $f$
  select count(*)::int from private.credit_entries e join private.credit_reservations r on r.id = e.reservation_id
  where e.kind = 'acao' and (r.action_key = 'run:' || pg_temp.i('run:' || p_nome)::text
    or r.action_key like 'agent:' || pg_temp.i('run:' || p_nome)::text || ':%')
$f$;

-- 1. Estrutura: o acerto é do servidor, e nenhum papel do app lê o caderno das rodadas direto.
select ok(
  not has_function_privilege('authenticated', 'private.close_run_credits(uuid)', 'execute')
    and not has_function_privilege('service_role', 'private.close_run_credits(uuid)', 'execute'),
  'fechar os créditos da Execução não é chamado pelo app');
select ok(
  not has_table_privilege('authenticated', 'private.agent_run_rounds', 'select')
    and not has_table_privilege('anon', 'private.agent_run_rounds', 'select')
    and not has_table_privilege('service_role', 'private.agent_run_rounds', 'select'),
  'o caderno das rodadas não é lido direto');
select ok(
  not has_function_privilege('authenticated', 'public.claim_agent_run(uuid)', 'execute')
    and has_function_privilege('service_role', 'public.claim_agent_run(uuid)', 'execute')
    and has_function_privilege('service_role', 'public.finish_agent_run(uuid, text, text, text)', 'execute'),
  'o claim e o fim da Execução continuam só do servidor');

-- 2. Sul nunca ligou a cobrança: a rodada sempre reserva (acesso-e-planos), então sem saldo a Execução não abre.
select public.grant_credits('7b000000-0000-0000-0000-000000000001', 20, 'plano');
select public.set_credits_enforced('7b000000-0000-0000-0000-000000000001', true);
select public.set_credits_enforced('7b000000-0000-0000-0000-000000000003', true);
select pg_temp.pedido('sul1', '7b000000-0000-0000-0000-000000000002', '7a000000-0000-0000-0000-000000000003', 'agente', pg_temp.i('scopus_sul'));
select ok(not pg_temp.claim('sul1'), 'sem a cobrança ligada e sem saldo, a Execução não abre');
select is((select count(*)::int from private.credit_reservations where workspace_id = '7b000000-0000-0000-0000-000000000002'), 0, 'e nada é reservado');
select is(pg_temp.motivo('sul1'), 'failed|insufficient_credits', 'a Execução fecha pelo motivo claro');
select lives_ok($$select public.grant_credits('7b000000-0000-0000-0000-000000000002', 1000, 'plano', 'saldo do contrato')$$, 'o contrato traz o saldo do mês');
select is(pg_temp.disponivel('7b000000-0000-0000-0000-000000000002'), 1000.00::numeric, 'e o Sul passa a ter saldo');

-- 3. Cobrança ligada, saldo suficiente: o claim reserva a estimativa antes de qualquer evento de modelo.
select pg_temp.pedido('a1', '7b000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-000000000001', 'agente', pg_temp.i('scopus'));
select ok(pg_temp.claim('a1'), 'com saldo, a Execução abre');
select is(pg_temp.estimativa('a1'), 'reserved|1|1.00|-', 'o claim reservou a estimativa (1 Agente, 1 rodada) antes de qualquer evento');
select is((select count(*)::int from private.agent_run_events where run_id = pg_temp.i('run:a1')), 0, 'sem nenhum evento ainda');
select is(public.claim_agent_run(pg_temp.i('run:a1')), null, 'reclamar de novo devolve null');
select is((select count(*)::int from private.credit_reservations where action_key = 'run:' || pg_temp.i('run:a1')::text), 1, 'e não cria segunda reserva');
select is(pg_temp.disponivel('7b000000-0000-0000-0000-000000000001'), 19.00::numeric, 'o saldo disponível já desconta a estimativa');

-- 4. A rodada consome a estimativa em vez de reservar de novo; fechar com sucesso e acertar debita uma vez só.
select is(pg_temp.abrir('a1', 'scopus', 1), 'go', 'a rodada dentro da estimativa abre');
select is((select count(*)::int from private.credit_reservations where action_key like 'agent:%'), 0, 'e não reserva de novo');
select is(pg_temp.abrir('a1', 'scopus', 1), 'go', 'repetir a rodada aberta devolve a mesma');
select lives_ok($$select pg_temp.concluir('a1', 'scopus', 1, true)$$, 'a rodada conclui');
select is(pg_temp.abrir('a1', 'scopus', 1), 'paid', 'a rodada concluída não cobra de novo');
select lives_ok($$select pg_temp.sucesso('a1')$$, 'a Execução fecha com sucesso');
select is(pg_temp.estimativa('a1'), 'settled|1|1.00|1', 'o acerto liquida a reserva com as rodadas concluídas');
select is(pg_temp.lancamentos('a1'), 1, 'e o extrato tem um único lançamento para a Execução');
select is(pg_temp.disponivel('7b000000-0000-0000-0000-000000000001'), 19.00::numeric, 'o saldo é o inicial menos 1');

-- 5. Reservou 3 e concluiu 1: debita 1 e devolve o resto. A Coordenação estima 3 Agentes.
select pg_temp.pedido('c1', '7b000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-000000000001', 'coordenada', null);
select ok(pg_temp.claim('c1'), 'a Coordenação abre');
select is(pg_temp.estimativa('c1'), 'reserved|3|3.00|-', 'a Coordenação reserva 3 Agentes por 1 rodada');
select is(pg_temp.disponivel('7b000000-0000-0000-0000-000000000001'), 16.00::numeric, 'e o disponível cai 3');
select is(pg_temp.abrir('c1', 'scopus', 1), 'go', 'um Agente fala');
select pg_temp.concluir('c1', 'scopus', 1, true);
select pg_temp.sucesso('c1');
select is(pg_temp.estimativa('c1'), 'settled|3|3.00|1', 'liquidou 1 de 3');
select is(pg_temp.disponivel('7b000000-0000-0000-0000-000000000001'), 18.00::numeric, 'o disponível volta a ser o saldo menos 1 de cada Execução');

-- 6. Falha sem rodada concluída: solta tudo; falha depois de uma rodada concluída debita só essa.
select pg_temp.pedido('f1', '7b000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-000000000001', 'coordenada', null);
select pg_temp.claim('f1');
select pg_temp.abrir('f1', 'scopus', 1);
select pg_temp.concluir('f1', 'scopus', 1, false);
select pg_temp.falha('f1', 'model_unreachable');
select is(pg_temp.estimativa('f1'), 'released|3|3.00|0', 'falha sem rodada concluída: a reserva é solta');
select is(pg_temp.lancamentos('f1'), 0, 'e nada é debitado');
select is(pg_temp.disponivel('7b000000-0000-0000-0000-000000000001'), 18.00::numeric, 'o saldo não mudou');
select pg_temp.pedido('f2', '7b000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-000000000001', 'coordenada', null);
select pg_temp.claim('f2');
select pg_temp.abrir('f2', 'scopus', 1);
select pg_temp.concluir('f2', 'scopus', 1, true);
select pg_temp.abrir('f2', 'rhetor', 1);
select pg_temp.falha('f2', 'model_unreachable');
select is(pg_temp.estimativa('f2'), 'settled|3|3.00|1', 'falha depois de uma rodada concluída: debita só ela');
select is(pg_temp.disponivel('7b000000-0000-0000-0000-000000000001'), 17.00::numeric, 'e a rodada que não concluiu não foi cobrada');

-- 7. Rodada além da estimativa: reserva mais uma, e o acerto soma as duas.
select pg_temp.pedido('x1', '7b000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-000000000001', 'agente', pg_temp.i('scopus'));
select pg_temp.claim('x1');
select pg_temp.abrir('x1', 'scopus', 1);
select pg_temp.concluir('x1', 'scopus', 1, true);
select is(pg_temp.abrir('x1', 'scopus', 2), 'go', 'a segunda rodada passa da estimativa');
select is((select count(*)::int from private.credit_reservations where action_key = 'agent:' || pg_temp.i('run:x1')::text || ':' || pg_temp.i('scopus')::text || ':2'), 1, 'e reserva mais uma');
select pg_temp.concluir('x1', 'scopus', 2, true);
select pg_temp.sucesso('x1');
select is(pg_temp.lancamentos('x1'), 2, 'as duas reservas viram um lançamento cada');
select is(pg_temp.disponivel('7b000000-0000-0000-0000-000000000001'), 15.00::numeric, 'e o saldo cai 2');

-- 8. Sem saldo na porta (Leste): o claim fecha a Execução e nada fica reservado.
select pg_temp.pedido('l1', '7b000000-0000-0000-0000-000000000003', '7a000000-0000-0000-0000-000000000004', 'agente', pg_temp.i('scopus_leste'));
select ok(not pg_temp.claim('l1'), 'sem saldo, o claim devolve null');
select is(pg_temp.motivo('l1'), 'failed|insufficient_credits', 'e a Execução falha por falta de crédito');
select is((select count(*)::int from private.credit_reservations where workspace_id = '7b000000-0000-0000-0000-000000000003'), 0, 'sem reserva aberta');
select is((select count(*)::int from private.agent_run_events where run_id = pg_temp.i('run:l1') and kind = 'falha'), 1, 'e o motivo fica no evento de falha');

-- 9. O limite mensal da pessoa vale na porta (Bruno com limite 0).
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '7a000000-0000-0000-0000-000000000001', true);
select public.set_member_credit_limit('7b000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-000000000002', 0);
reset role;
select pg_temp.pedido('b1', '7b000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-000000000002', 'agente', pg_temp.i('scopus'));
select ok(not pg_temp.claim('b1'), 'acima do limite mensal da pessoa, o claim devolve null');
select is(pg_temp.motivo('b1'), 'failed|insufficient_credits', 'com o mesmo motivo');

-- 10. Rodada extra sem saldo: a Execução mantém o que as rodadas anteriores concluíram (Leste com 1 crédito).
select public.grant_credits('7b000000-0000-0000-0000-000000000003', 1, 'plano');
select pg_temp.pedido('l2', '7b000000-0000-0000-0000-000000000003', '7a000000-0000-0000-0000-000000000004', 'agente', pg_temp.i('scopus_leste'));
select ok(pg_temp.claim('l2'), 'com 1 crédito, a Execução abre');
select is(pg_temp.abrir('l2', 'scopus_leste', 1), 'go', 'e a primeira rodada cabe na estimativa');
select pg_temp.concluir('l2', 'scopus_leste', 1, true);
select is(pg_temp.abrir('l2', 'scopus_leste', 2), 'no_credits', 'a rodada extra sem saldo não abre');
select pg_temp.falha('l2', 'insufficient_credits');
select is(pg_temp.estimativa('l2'), 'settled|1|1.00|1', 'e o que a primeira rodada concluiu fica debitado');

-- 11. A chave de IA do cliente: a reserva e o acerto saem a 20% por rodada.
insert into private.workspace_ai_keys (workspace_id, provider, model, secret_name)
values ('7b000000-0000-0000-0000-000000000001', 'anthropic', 'modelo', 'segredo');
select pg_temp.pedido('k1', '7b000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-000000000001', 'agente', pg_temp.i('scopus'));
select pg_temp.claim('k1');
select is(pg_temp.estimativa('k1'), 'reserved|1|0.20|-', 'a reserva da porta sai a 20%');
select pg_temp.abrir('k1', 'scopus', 1);
select pg_temp.concluir('k1', 'scopus', 1, true);
select pg_temp.sucesso('k1');
select is((select -e.amount from private.credit_entries e join private.credit_reservations r on r.id = e.reservation_id
  where r.action_key = 'run:' || pg_temp.i('run:k1')::text), 0.20::numeric, 'e o acerto debita 0,20');
delete from private.workspace_ai_keys where workspace_id = '7b000000-0000-0000-0000-000000000001';

-- 12. Execução presa que vira timeout solta a reserva na mesma transação; a faxina continua como rede de segurança.
select pg_temp.pedido('t1', '7b000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-000000000001', 'agente', pg_temp.i('scopus'));
select pg_temp.claim('t1');
update private.agent_runs set started_at = clock_timestamp() - interval '11 minutes' where id = pg_temp.i('run:t1');
select ok(private.expire_run_if_stale(pg_temp.i('run:t1')), 'a Execução parada fecha');
select is(pg_temp.motivo('t1'), 'failed|timeout', 'como timeout');
select is(pg_temp.estimativa('t1'), 'released|1|1.00|0', 'e solta a reserva na hora');
select has_function('private', 'release_stale_credit_reservations', array['interval'], 'a faxina de 2 horas continua existindo');

-- 13. O teto de automático (acao:agentes) não bloqueia a Conversa que a pessoa abre, e não é gasto por ela.
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a000000-0000-0000-0000-000000000001', true);
select public.save_automation_setting('7b000000-0000-0000-0000-000000000001', 'acao:agentes', 'automatico', 1);
reset role;
select is(public.consume_automation_cap('7b000000-0000-0000-0000-000000000001', 'acao:agentes', 1), 'ok', 'o teto do automático chega ao fim');
select is(public.consume_automation_cap('7b000000-0000-0000-0000-000000000001', 'acao:agentes', 1), 'teto_atingido', 'e o próximo automático para');
select pg_temp.pedido('p1', '7b000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-000000000001', 'agente', pg_temp.i('scopus'));
select ok(pg_temp.claim('p1'), 'a Conversa da pessoa abre mesmo assim');
select is(pg_temp.abrir('p1', 'scopus', 1), 'go', 'e a rodada dela abre');
select is((select spent from private.automation_spend where workspace_id = '7b000000-0000-0000-0000-000000000001' and scope = 'acao:agentes'), 1.00::numeric, 'sem gastar o teto do automático');
select pg_temp.concluir('p1', 'scopus', 1, true);
select pg_temp.sucesso('p1');

-- 14. Rotina: o cron soma a estimativa provisória (3) ao teto `rotina:<id>`; o fim da Execução devolve a diferença.
-- Sul não assinou, e o teto vale mesmo assim. Carla cria as Rotinas e aprova o teto de cada uma.
insert into ids select 'rhetor_sul', a.id from private.agents a
where a.workspace_id = '7b000000-0000-0000-0000-000000000002' and a.specialty = 'rhetor' and a.kind = 'padrao';
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a000000-0000-0000-0000-000000000003', true);
insert into ids select 'rot_a', public.create_agent_routine(pg_temp.i('scopus_sul'), 'Reavaliar as Contas-alvo', 'diaria', null, '09:00', null);
insert into ids select 'rot_b', public.create_agent_routine(pg_temp.i('scopus_sul'), 'Resumo da semana', 'diaria', null, '09:00', null);
insert into ids select 'rot_c', public.create_agent_routine(pg_temp.i('scopus_sul'), 'Fechamento do mês', 'diaria', null, '09:00', null);
select public.save_automation_setting('7b000000-0000-0000-0000-000000000002', 'rotina:' || pg_temp.i('rot_a')::text, 'automatico', 5);
select public.save_automation_setting('7b000000-0000-0000-0000-000000000002', 'rotina:' || pg_temp.i('rot_b')::text, 'automatico', 3);
select public.save_automation_setting('7b000000-0000-0000-0000-000000000002', 'rotina:' || pg_temp.i('rot_c')::text, 'automatico', 5);
reset role;
create function pg_temp.gasto(p_rotina text) returns numeric language sql as $f$
  select coalesce((select g.spent from private.automation_spend g
    where g.workspace_id = '7b000000-0000-0000-0000-000000000002' and g.scope = 'rotina:' || pg_temp.i(p_rotina)::text
      and g.month = date_trunc('month', now())::date), 0)
$f$;
-- Dispara a Rotina neste relógio e guarda a Execução que ela criou como `run:<nome>`.
create function pg_temp.disparar(p_rotina text, p_nome text, p_dia integer default 5) returns text language plpgsql as $f$
declare
  v_saida text;
  v_hora timestamptz := make_timestamptz(2026, 1, p_dia, 12, 0, 0, 'UTC');
begin
  update private.agent_routines set next_run_at = v_hora where id = pg_temp.i(p_rotina);
  select outcome into v_saida from private.enqueue_due_agent_routines(v_hora) where routine_id = pg_temp.i(p_rotina);
  delete from pg_temp.ids where chave = 'run:' || p_nome;
  insert into pg_temp.ids select 'run:' || p_nome, id from private.agent_runs
  where routine_id = pg_temp.i(p_rotina) and status = 'queued';
  return v_saida;
end;
$f$;
-- As outras duas ficam longe do relógio.
update private.agent_routines set next_run_at = '2030-01-01 12:00:00+00';

select is(pg_temp.disparar('rot_a', 'ra1'), 'criada', 'a Rotina com teto de 5 cria a Execução');
select is(pg_temp.gasto('rot_a'), 3.00::numeric, 'e o cron soma a estimativa provisória (3)');
select ok(pg_temp.claim('ra1'), 'o claim abre a Execução da Rotina');
select is(pg_temp.estimativa('ra1'), 'reserved|1|1.00|-', 'a rodada sempre reserva: o claim reserva a estimativa na porta');
select is(pg_temp.abrir('ra1', 'scopus_sul', 1), 'go', 'a rodada sai da estimativa e fica contada para o teto');
select pg_temp.concluir('ra1', 'scopus_sul', 1, true);
select pg_temp.sucesso('ra1');
select is(pg_temp.gasto('rot_a'), 1.00::numeric, 'a Execução usou 1 rodada: o gasto do escopo no mês é 1, não 3');

select is(pg_temp.disparar('rot_c', 'rc1'), 'criada', 'a Rotina que falha antes de rodar cria a Execução');
select ok(pg_temp.claim('rc1'), 'o claim abre');
select pg_temp.falha('rc1', 'model_unreachable');
select is(pg_temp.gasto('rot_c'), 0.00::numeric, 'sem rodada concluída, o teto volta inteiro');
select is(pg_temp.disparar('rot_c', 'rc2', 6), 'criada', 'a Rotina dispara de novo');
update private.agent_runs set created_at = clock_timestamp() - interval '11 minutes' where id = pg_temp.i('run:rc2');
select ok(private.expire_run_if_stale(pg_temp.i('run:rc2')), 'a Execução que ficou na fila além do prazo expira');
select is(pg_temp.gasto('rot_c'), 0.00::numeric, 'e devolve o teto que o cron somou');

-- Teto de 3: o cron esgota o teto. A Execução em andamento que pede rodada além do que o cron somou consulta o teto e
-- fecha sem chamar o modelo; a próxima Execução da Rotina não nasce.
select is(pg_temp.disparar('rot_b', 'rb1'), 'criada', 'a Rotina com teto de 3 cria a Execução');
select ok(pg_temp.claim('rb1'), 'e abre');
select is(pg_temp.abrir('rb1', 'scopus_sul', 1) || pg_temp.abrir('rb1', 'scopus_sul', 2) || pg_temp.abrir('rb1', 'scopus_sul', 3), 'gogogo', 'as 3 rodadas que o cron já somou abrem');
select pg_temp.concluir('rb1', 'scopus_sul', 1, true);
select pg_temp.concluir('rb1', 'scopus_sul', 2, true);
select pg_temp.concluir('rb1', 'scopus_sul', 3, true);
select is(pg_temp.abrir('rb1', 'rhetor_sul', 1), 'cap_reached', 'a rodada além do que o teto já contou é barrada');
select is((select count(*)::int from private.agent_run_events where run_id = pg_temp.i('run:rb1') and kind = 'chamada'), 0, 'sem nenhuma chamada ao modelo');
select pg_temp.falha('rb1', 'automation_cap_reached');
select is(pg_temp.motivo('rb1'), 'failed|automation_cap_reached', 'a Execução fecha por teto atingido');
select is(pg_temp.gasto('rot_b'), 3.00::numeric, 'as 3 rodadas concluídas ficam no teto');
select is(pg_temp.disparar('rot_b', 'rb2', 6), 'teto_atingido', 'a próxima Execução da Rotina não nasce');

-- Rotina de um Workspace que assinou: a estimativa vai à reserva, e o teto acerta do mesmo jeito.
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a000000-0000-0000-0000-000000000001', true);
insert into ids select 'rot_n', public.create_agent_routine(pg_temp.i('scopus'), 'Rotina do Norte', 'diaria', null, '09:00', null);
select public.save_automation_setting('7b000000-0000-0000-0000-000000000001', 'rotina:' || pg_temp.i('rot_n')::text, 'automatico', 5);
reset role;
update private.agent_routines set next_run_at = '2030-01-01 12:00:00+00' where id <> pg_temp.i('rot_n');
create function pg_temp.gasto_norte(p_rotina text) returns numeric language sql as $f$
  select coalesce((select g.spent from private.automation_spend g
    where g.workspace_id = '7b000000-0000-0000-0000-000000000001' and g.scope = 'rotina:' || pg_temp.i(p_rotina)::text
      and g.month = date_trunc('month', now())::date), 0)
$f$;
select is(pg_temp.disparar('rot_n', 'rn1'), 'criada', 'a Rotina do Norte cria a Execução');
select ok(pg_temp.claim('rn1'), 'o claim abre');
select is(pg_temp.estimativa('rn1'), 'reserved|1|1.00|-', 'e reserva a estimativa da Conversa de um Agente');
select pg_temp.abrir('rn1', 'scopus', 1);
select pg_temp.concluir('rn1', 'scopus', 1, true);
select pg_temp.sucesso('rn1');
select is(pg_temp.estimativa('rn1') || ' | ' || pg_temp.gasto_norte('rot_n')::text, 'settled|1|1.00|1 | 1.00', 'debita 1 crédito e deixa 1 no teto');

-- 15. Isolamento e coerência dos livros: nenhuma reserva ou teto de um Workspace mexe em outro, nada fica reservado, e
-- o crédito segue em credit_entries, sem tocar no custo em dólar.
select is((select count(*)::int from private.credit_reservations where workspace_id = '7b000000-0000-0000-0000-000000000002' and status = 'reserved'), 0, 'Sul não tem reserva aberta');
select is((select count(*)::int from private.credit_reservations where workspace_id = '7b000000-0000-0000-0000-000000000003' and status = 'reserved'), 0, 'Leste não tem reserva aberta');
select is((select reserved from private.credit_totals('7b000000-0000-0000-0000-000000000001')), 0::numeric, 'Norte não tem reserva aberta');
select is(
  (select t.booked from private.credit_totals('7b000000-0000-0000-0000-000000000001') t),
  20 + (select coalesce(sum(e.amount), 0) from private.credit_entries e where e.workspace_id = '7b000000-0000-0000-0000-000000000001' and e.kind = 'acao'),
  'o saldo de Norte é o plano menos os lançamentos de ação');
select is((select count(*)::int from private.action_costs), 0, 'o custo em dólar fica fora do livro de créditos');
select is((select count(*)::int from private.automation_spend where workspace_id = '7b000000-0000-0000-0000-000000000003'), 0, 'o teto de Norte e de Sul nunca mexe em Leste');

select * from finish();
rollback;

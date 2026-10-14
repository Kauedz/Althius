begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(89);

-- Rotinas que rodam sozinhas (orquestracao, ticket 01). O pg_cron cria uma Execução do tipo `rotina` na mesma fila de
-- private.agent_runs quando chega a hora de cada Rotina ativa; o worker não muda. Cada Rotina tem o teto mensal dela
-- (escopo `rotina:<id>`), e sem teto aprovado ela não roda.
-- O relógio do cron é o argumento p_now: os horários abaixo são fixos (Brasília é UTC-3, então 09:00 é 12:00 UTC) e só
-- a retomada de uma Rotina pausada usa o relógio do banco, comparada com ele.
-- Norte: Ana e Dora são Administradoras, Bruno é Membro. Sul: Carla é Administradora.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('6e000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('6e000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('6e000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@sul.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('6e000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'dora@norte.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('6f000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('6f000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into private.workspace_contracts (workspace_id, tier_id, starts_at) select w.id, 'escala', date_trunc('month', now()) from public.workspaces w on conflict (workspace_id) do nothing; -- contrato de teste (acesso-e-planos)
select public.grant_credits(w.id, 1000, 'plano', 'saldo de teste') from public.workspaces w where w.id <> 'e0a17e00-0000-4000-8000-000000000001'; -- a rodada de Agente sempre reserva (acesso-e-planos)
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('6f000000-0000-0000-0000-000000000001', '6e000000-0000-0000-0000-000000000001', 'admin', true),
  ('6f000000-0000-0000-0000-000000000001', '6e000000-0000-0000-0000-000000000002', 'member', true),
  ('6f000000-0000-0000-0000-000000000001', '6e000000-0000-0000-0000-000000000004', 'admin', true),
  ('6f000000-0000-0000-0000-000000000002', '6e000000-0000-0000-0000-000000000003', 'admin', true);

create temporary table ids (chave text primary key, valor uuid) on commit drop;
grant all on ids to authenticated, service_role;
create function pg_temp.i(p_chave text) returns uuid language sql as $f$ select valor from pg_temp.ids where chave = p_chave $f$;
grant execute on function pg_temp.i(text) to authenticated, service_role;
insert into ids select 'scopus', a.id from private.agents a
where a.workspace_id = '6f000000-0000-0000-0000-000000000001' and a.specialty = 'scopus' and a.kind = 'padrao';
insert into ids select 'scopus_sul', a.id from private.agents a
where a.workspace_id = '6f000000-0000-0000-0000-000000000002' and a.specialty = 'scopus' and a.kind = 'padrao';

-- Quantas Execuções a Rotina criou, e a última (a mais nova).
create function pg_temp.execucoes(p_rotina text) returns integer language sql as $f$
  select count(*)::int from private.agent_runs where routine_id = pg_temp.i(p_rotina)
$f$;
create function pg_temp.ultima(p_rotina text) returns uuid language sql as $f$
  select id from private.agent_runs where routine_id = pg_temp.i(p_rotina) order by created_at desc, id desc limit 1
$f$;
-- O que o cron fez com a Rotina neste relógio: o resultado, ou nada quando ela não venceu.
create function pg_temp.cron(p_rotina text, p_now timestamptz) returns text language sql as $f$
  select outcome from private.enqueue_due_agent_routines(p_now) where routine_id = pg_temp.i(p_rotina)
$f$;
-- Nenhuma Rotina vence até o teste armar a dele: o próximo horário de todas vai para longe.
create function pg_temp.zerar() returns void language sql as $f$
  update private.agent_routines set next_run_at = '2030-01-01 12:00:00+00'
$f$;
-- Arma a Rotina como se ela tivesse sido criada neste relógio.
create function pg_temp.armar(p_rotina text, p_desde timestamptz) returns timestamptz language sql as $f$
  update private.agent_routines r
  set next_run_at = private.next_routine_run(r.frequency, r.weekday, r.run_time, r.day_of_month, p_desde)
  where r.id = pg_temp.i(p_rotina)
  returning r.next_run_at
$f$;
create function pg_temp.gasto(p_rotina text) returns numeric language sql as $f$
  select coalesce((select g.spent from private.automation_spend g
    where g.workspace_id = '6f000000-0000-0000-0000-000000000001' and g.scope = 'rotina:' || pg_temp.i(p_rotina)::text
      and g.month = date_trunc('month', now())::date), 0)
$f$;

-- 1. Estrutura: o relógio é do cron e do servidor; nenhum papel do app lê as colunas novas direto.
select ok(
  not has_function_privilege('anon', 'private.enqueue_due_agent_routines(timestamptz)', 'execute')
    and not has_function_privilege('authenticated', 'private.enqueue_due_agent_routines(timestamptz)', 'execute')
    and has_function_privilege('service_role', 'private.enqueue_due_agent_routines(timestamptz)', 'execute'),
  'enfileirar as Rotinas vencidas é só do cron e do servidor');
select ok(
  not has_function_privilege('authenticated', 'private.next_routine_run(text, text, text, integer, timestamptz)', 'execute'),
  'calcular o próximo horário não é chamado pelo app');
select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'private' and table_name = 'agent_routines'
      and column_name in ('owner_id', 'day_of_month', 'next_run_at', 'last_fired_at', 'conversation_id')),
  5, 'a Rotina ganhou dono, dia do mês, próxima e última execução e a Conversa');
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private' and c.relname in ('agent_routines', 'agent_runs')
      and (has_table_privilege('authenticated', c.oid, 'select') or has_table_privilege('anon', c.oid, 'select')
        or has_table_privilege('service_role', c.oid, 'select'))),
  0, 'nenhum papel do app lê as tabelas das Rotinas e das Execuções direto');

-- 2. A Administradora cria Rotinas; o banco confere o dia do mês e preenche o dono e o próximo horário.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '6e000000-0000-0000-0000-000000000001', true);
insert into ids select 'diaria', public.create_agent_routine(pg_temp.i('scopus'), 'Reavaliar as Contas-alvo', 'diaria', null, '09:00', null);
insert into ids select 'semanal', public.create_agent_routine(pg_temp.i('scopus'), 'Resumo da semana', 'semanal', 'segunda', '09:00', null);
insert into ids select 'mensal', public.create_agent_routine(pg_temp.i('scopus'), 'Fechamento do mês', 'mensal', null, '09:00', null, 15);
select throws_ok(
  $$select public.create_agent_routine(pg_temp.i('scopus'), 'Sem dia', 'mensal', null, '09:00', null)$$,
  '22023', 'invalid day of month', 'a Rotina mensal precisa do dia do mês');
select throws_ok(
  $$select public.create_agent_routine(pg_temp.i('scopus'), 'Dia demais', 'mensal', null, '09:00', null, 29)$$,
  '22023', 'invalid day of month', 'o dia do mês vai de 1 a 28');
select throws_ok(
  $$select public.create_agent_routine(pg_temp.i('scopus'), 'Dia solto', 'diaria', null, '09:00', null, 15)$$,
  '22023', 'invalid day of month', 'só a Rotina mensal tem dia do mês');
reset role;
select is(
  (select owner_id from private.agent_routines where id = pg_temp.i('diaria')),
  '6e000000-0000-0000-0000-000000000001'::uuid, 'o dono da Rotina é quem a criou');
select ok(
  (select next_run_at > now() and next_run_at <= now() + interval '1 day' from private.agent_routines where id = pg_temp.i('diaria')),
  'a Rotina nasce com o próximo horário no futuro');

-- 3. A Administradora aprova o teto de cada Rotina; a Rotina aparece em Automação e tetos, com o nome do Agente.
set local role authenticated;
select set_config('request.jwt.claim.sub', '6e000000-0000-0000-0000-000000000001', true);
select is(
  (select kind || ' | ' || name || ' | ' || mode from public.list_automation_settings('6f000000-0000-0000-0000-000000000001')
    where scope = 'rotina:' || pg_temp.i('diaria')::text),
  'rotina | Rotina · Scopus · Reavaliar as Contas-alvo | confirmar', 'a Rotina é um escopo da página de Automação e tetos');
select throws_ok(
  $$select public.save_automation_setting('6f000000-0000-0000-0000-000000000001', 'rotina:' || pg_temp.i('diaria')::text, 'automatico', null)$$,
  '22023', 'automatic mode requires an approved monthly cap', 'o automático da Rotina sem teto é recusado');
select lives_ok(
  $$select public.save_automation_setting('6f000000-0000-0000-0000-000000000001', 'rotina:' || pg_temp.i('diaria')::text, 'automatico', 100)$$,
  'a Administradora aprova o teto da Rotina diária');
select public.save_automation_setting('6f000000-0000-0000-0000-000000000001', 'rotina:' || pg_temp.i('semanal')::text, 'automatico', 100);
select public.save_automation_setting('6f000000-0000-0000-0000-000000000001', 'rotina:' || pg_temp.i('mensal')::text, 'automatico', 100);
select set_config('request.jwt.claim.sub', '6e000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.save_automation_setting('6f000000-0000-0000-0000-000000000001', 'rotina:' || pg_temp.i('diaria')::text, 'confirmar', null)$$,
  '42501', 'only administrators can change automation', 'o Membro não muda o teto da Rotina');
select is(
  (select r.monthly_cap::text || ' | ' || r.month_spent::text || ' | ' || coalesce(r.blocked_reason, 'roda') || ' | ' || coalesce(r.day_of_month::text, '-')
    from public.list_agent_routines(pg_temp.i('scopus')) r where r.id = pg_temp.i('diaria')),
  '100.00 | 0 | roda | -', 'o Membro lê a Rotina com o teto, o gasto do mês e que ela roda');
select is(
  (select coalesce(r.blocked_reason, 'roda') || ' | ' || r.day_of_month::text from public.list_agent_routines(pg_temp.i('scopus')) r where r.id = pg_temp.i('mensal')),
  'roda | 15', 'e a Rotina mensal mostra o dia do mês');
select ok(
  (select 'rotina:' || pg_temp.i('diaria')::text = any (array_agg(scope))
    from public.list_runnable_automation_scopes('6f000000-0000-0000-0000-000000000001')),
  'a Rotina tem executor: o escopo dela roda sozinho');
reset role;

-- 4. O próximo horário, na hora de Brasília: diária, semanal (por dia da semana) e mensal (por dia do mês).
select is(private.next_routine_run('diaria', null, '09:00', null, '2026-10-12 11:00:00+00'), '2026-10-12 12:00:00+00'::timestamptz,
  'diária às 08:00 de Brasília: é hoje às 09:00');
select is(private.next_routine_run('diaria', null, '09:00', null, '2026-10-12 12:00:00+00'), '2026-10-13 12:00:00+00'::timestamptz,
  'diária às 09:00 em ponto: o próximo é amanhã');
select is(private.next_routine_run('semanal', 'segunda', '09:00', null, '2026-10-12 11:00:00+00'), '2026-10-12 12:00:00+00'::timestamptz,
  'semanal na segunda antes do horário: é hoje');
select is(private.next_routine_run('semanal', 'segunda', '09:00', null, '2026-10-13 11:00:00+00'), '2026-10-19 12:00:00+00'::timestamptz,
  'semanal na terça: a próxima segunda');
select is(private.next_routine_run('semanal', 'domingo', '09:00', null, '2026-10-12 11:00:00+00'), '2026-10-18 12:00:00+00'::timestamptz,
  'semanal no domingo: o domingo seguinte');
select is(private.next_routine_run('semanal', 'sábado', '09:00', null, '2026-10-12 11:00:00+00'), '2026-10-17 12:00:00+00'::timestamptz,
  'semanal no sábado: o sábado seguinte');
select is(private.next_routine_run('mensal', null, '09:00', 15, '2026-10-12 11:00:00+00'), '2026-10-15 12:00:00+00'::timestamptz,
  'mensal no dia 15, antes dele: é neste mês');
select is(private.next_routine_run('mensal', null, '09:00', 15, '2026-10-16 11:00:00+00'), '2026-11-15 12:00:00+00'::timestamptz,
  'mensal no dia 15, depois dele: o mês seguinte');
select is(private.next_routine_run('mensal', null, '09:00', 15, '2026-12-20 11:00:00+00'), '2027-01-15 12:00:00+00'::timestamptz,
  'mensal em dezembro: janeiro do ano seguinte');
select is(private.next_routine_run('diaria', null, '23:30', null, '2026-10-12 12:00:00+00'), '2026-10-13 02:30:00+00'::timestamptz,
  'o horário é o de Brasília, não o UTC');

-- 5. Diária às 09:00: às 08:59 o cron não cria nada; às 09:00 cria uma Execução na fila; repetir não cria a segunda.
select pg_temp.zerar();
select is(pg_temp.armar('diaria', '2026-10-12 11:00:00+00'), '2026-10-12 12:00:00+00'::timestamptz, 'a Rotina diária espera as 09:00');
select is(pg_temp.cron('diaria', '2026-10-12 11:59:00+00'), null, 'às 08:59 o cron não faz nada');
select is(pg_temp.execucoes('diaria'), 0, 'e nenhuma Execução existe');
select is(pg_temp.cron('diaria', '2026-10-12 12:00:00+00'), 'criada', 'às 09:00 o cron cria a Execução');
select is(
  (select r.status || ' | ' || r.trigger_kind || ' | ' || (r.routine_id = pg_temp.i('diaria'))::text || ' | ' || r.request_text
    from private.agent_runs r where r.id = pg_temp.ultima('diaria')),
  'queued | rotina | true | Reavaliar as Contas-alvo', 'a Execução está na fila, com a Rotina e o texto da tarefa');
select is(
  (select r.requested_by from private.agent_runs r where r.id = pg_temp.ultima('diaria')),
  '6e000000-0000-0000-0000-000000000001'::uuid, 'quem pediu é o dono da Rotina');
select is(
  (select c.kind || ' | ' || (c.agent_id = pg_temp.i('scopus'))::text || ' | ' || (c.owner_id = '6e000000-0000-0000-0000-000000000001')::text
    from private.agent_runs r join private.agent_conversations c on c.id = r.conversation_id
    where r.id = pg_temp.ultima('diaria')),
  'agente | true | true', 'a Conversa é do Agente da Rotina e do dono, como um pedido na página do Agente');
select is(pg_temp.cron('diaria', '2026-10-12 12:00:00+00'), null, 'rodar o cron de novo no mesmo horário não faz nada');
select is(pg_temp.execucoes('diaria'), 1, 'e a segunda Execução não existe');
select is(
  (select next_run_at from private.agent_routines where id = pg_temp.i('diaria')),
  '2026-10-13 12:00:00+00'::timestamptz, 'o próximo horário avançou para amanhã');
select is(
  pg_temp.gasto('diaria'),
  3 * (select credits from private.credit_action_prices where action = 'agent_round'),
  'o teto da Rotina foi consumido com a estimativa de 3 rodadas');

-- 6. A Execução anterior ainda na fila: o horário seguinte é pulado, sem gastar o teto e sem criar outra.
select is(pg_temp.cron('diaria', '2026-10-13 12:00:00+00'), 'execucao_aberta', 'com a Execução anterior na fila, o horário é pulado');
select is(pg_temp.execucoes('diaria'), 1, 'a fila guarda uma Execução por Rotina');
select is(
  (select next_run_at from private.agent_routines where id = pg_temp.i('diaria')),
  '2026-10-14 12:00:00+00'::timestamptz, 'o horário pulado avançou');
select is(pg_temp.gasto('diaria'), 3 * (select credits from private.credit_action_prices where action = 'agent_round'),
  'o horário pulado não gasta o teto');

-- 7. Uma Execução parada além do prazo (o worker não está no ar) não prende a Rotina: fecha como timeout e a seguinte sai.
update private.agent_runs set created_at = clock_timestamp() - interval '11 minutes' where id = pg_temp.ultima('diaria');
select is(pg_temp.cron('diaria', '2026-10-14 12:00:00+00'), 'criada', 'a Execução parada além do prazo não impede a seguinte');
select is(pg_temp.execucoes('diaria'), 2, 'a Rotina tem duas Execuções');
select is(
  (select count(*)::int from private.agent_runs where routine_id = pg_temp.i('diaria') and status = 'failed' and error_code = 'timeout'),
  1, 'e a parada foi fechada como timeout');

-- 8. Terminada a Execução, o horário seguinte cria outra na mesma Conversa.
update private.agent_runs set status = 'succeeded', finished_at = clock_timestamp() where id = pg_temp.ultima('diaria');
select is(pg_temp.cron('diaria', '2026-10-15 12:00:00+00'), 'criada', 'terminada a anterior, o horário seguinte cria a Execução');
select is(
  (select count(distinct conversation_id)::int from private.agent_runs where routine_id = pg_temp.i('diaria')),
  1, 'a Rotina usa sempre a mesma Conversa');

-- 9. Semanal e mensal só disparam no dia delas e avançam para o próximo horário.
select pg_temp.zerar();
select pg_temp.armar('semanal', '2026-10-12 11:00:00+00');
select is(pg_temp.cron('semanal', '2026-10-12 11:59:00+00'), null, 'a semanal da segunda não dispara antes das 09:00');
select is(pg_temp.cron('semanal', '2026-10-12 12:00:00+00'), 'criada', 'a semanal dispara na segunda às 09:00');
select is(
  (select next_run_at from private.agent_routines where id = pg_temp.i('semanal')),
  '2026-10-19 12:00:00+00'::timestamptz, 'e a próxima é a segunda seguinte');
select pg_temp.zerar();
select pg_temp.armar('mensal', '2026-10-12 11:00:00+00');
select is(pg_temp.cron('mensal', '2026-10-14 12:00:00+00'), null, 'a mensal do dia 15 não dispara no dia 14');
select is(pg_temp.cron('mensal', '2026-10-15 12:00:00+00'), 'criada', 'a mensal dispara no dia 15 às 09:00');
select is(
  (select next_run_at from private.agent_routines where id = pg_temp.i('mensal')),
  '2026-11-15 12:00:00+00'::timestamptz, 'e a próxima é o dia 15 do mês seguinte');

-- 10. Pausada não dispara; retomar não gera rajada: o próximo horário é o próximo futuro e nada perdido é recuperado.
select pg_temp.zerar();
update private.agent_runs set status = 'succeeded', finished_at = clock_timestamp() where routine_id = pg_temp.i('diaria') and status = 'queued';
set local role authenticated;
select set_config('request.jwt.claim.sub', '6e000000-0000-0000-0000-000000000001', true);
select public.set_agent_routine_paused(pg_temp.i('diaria'), true);
reset role;
update private.agent_routines set next_run_at = '2026-10-01 12:00:00+00' where id = pg_temp.i('diaria');
select is(pg_temp.cron('diaria', '2026-10-20 12:00:00+00'), null, 'a Rotina pausada não cria Execução, mesmo vencida');
set local role authenticated;
select set_config('request.jwt.claim.sub', '6e000000-0000-0000-0000-000000000001', true);
select public.set_agent_routine_paused(pg_temp.i('diaria'), false);
reset role;
select ok(
  (select next_run_at > now() and next_run_at <= now() + interval '1 day' from private.agent_routines where id = pg_temp.i('diaria')),
  'retomar põe o próximo horário no futuro');
select is(pg_temp.cron('diaria', now()), null, 'retomar não recupera o horário perdido');

-- 11. Execução de Rotina na fila: o claim a devolve como pedido de Agente; pausada ou apagada antes do claim, é fechada.
select pg_temp.zerar();
set local role authenticated;
select set_config('request.jwt.claim.sub', '6e000000-0000-0000-0000-000000000001', true);
insert into ids select 'normal', public.create_agent_routine(pg_temp.i('scopus'), 'Rotina normal', 'diaria', null, '09:00', null);
insert into ids select 'pausavel', public.create_agent_routine(pg_temp.i('scopus'), 'Rotina pausável', 'diaria', null, '09:00', null);
insert into ids select 'apagavel', public.create_agent_routine(pg_temp.i('scopus'), 'Rotina apagável', 'diaria', null, '09:00', null);
select public.save_automation_setting('6f000000-0000-0000-0000-000000000001', 'rotina:' || pg_temp.i('normal')::text, 'automatico', 100);
select public.save_automation_setting('6f000000-0000-0000-0000-000000000001', 'rotina:' || pg_temp.i('pausavel')::text, 'automatico', 100);
select public.save_automation_setting('6f000000-0000-0000-0000-000000000001', 'rotina:' || pg_temp.i('apagavel')::text, 'automatico', 100);
reset role;
select pg_temp.zerar();
select pg_temp.armar('normal', '2026-10-12 11:00:00+00');
select pg_temp.armar('pausavel', '2026-10-12 11:00:00+00');
select pg_temp.armar('apagavel', '2026-10-12 11:00:00+00');
select count(*) from private.enqueue_due_agent_routines('2026-10-12 12:00:00+00');
select is(
  (select count(*)::int from public.list_queued_agent_runs(50) q
    where q.run_id in (pg_temp.ultima('normal'), pg_temp.ultima('pausavel'), pg_temp.ultima('apagavel'))),
  3, 'a fila de pedidos lista as Execuções de Rotina');
insert into ids select 'run_normal', pg_temp.ultima('normal');
insert into ids select 'run_pausavel', pg_temp.ultima('pausavel');
set local role service_role;
select is(
  (select public.claim_agent_run(pg_temp.i('run_normal')) ->> 'kind'), 'agente', 'o claim devolve a Execução de Rotina como pedido de Agente');
reset role;
select is(
  (select r.status from private.agent_runs r where r.id = pg_temp.ultima('normal')), 'running', 'e a reserva vale uma vez só');
select is(
  (select (public.claim_agent_run(pg_temp.i('run_normal')) is null)::text), 'true', 'reservar de novo devolve nada');
create temporary table claim_normal on commit drop as
  select r.request_text, c.agent_id from private.agent_runs r join private.agent_conversations c on c.id = r.conversation_id
  where r.id = pg_temp.ultima('normal');
select is(
  (select (agent_id = pg_temp.i('scopus'))::text || ' | ' || request_text from claim_normal),
  'true | Rotina normal', 'o Agente e o texto do pedido são os da Rotina');

set local role authenticated;
select set_config('request.jwt.claim.sub', '6e000000-0000-0000-0000-000000000001', true);
select public.set_agent_routine_paused(pg_temp.i('pausavel'), true);
select public.delete_agent_routine(pg_temp.i('apagavel'));
reset role;
set local role service_role;
select is((select public.claim_agent_run(pg_temp.i('run_pausavel')) is null)::text, 'true', 'a Rotina pausada antes do claim: nada é reservado');
reset role;
select is(
  (select r.status || ' | ' || r.error_code from private.agent_runs r where r.id = pg_temp.ultima('pausavel')),
  'failed | routine_paused', 'e a Execução fecha como routine_paused');
select is(
  (select count(*)::int from private.agent_run_events e where e.run_id = pg_temp.ultima('pausavel') and e.kind <> 'falha'),
  0, 'sem nenhum evento do modelo');
insert into ids select 'run_apagada', r.id from private.agent_runs r where r.trigger_kind = 'rotina' and r.routine_id is null;
set local role service_role;
select is((select public.claim_agent_run(pg_temp.i('run_apagada')) is null)::text, 'true', 'a Rotina apagada antes do claim: nada é reservado');
reset role;
select is(
  (select r.status || ' | ' || r.error_code from private.agent_runs r where r.id = pg_temp.i('run_apagada')),
  'failed | routine_paused', 'e a Execução da Rotina apagada fecha como routine_paused, e o histórico fica');
select is(
  (select count(*)::int from private.automation_settings where scope = 'rotina:' || pg_temp.i('apagavel')::text),
  0, 'apagar a Rotina leva o teto dela junto');

-- 12. O dono saiu do Workspace: o cron pausa a Rotina e não cria; uma Execução já na fila fecha com membership_inactive.
select pg_temp.zerar();
set local role authenticated;
select set_config('request.jwt.claim.sub', '6e000000-0000-0000-0000-000000000004', true);
insert into ids select 'dora1', public.create_agent_routine(pg_temp.i('scopus'), 'Rotina da Dora', 'diaria', null, '09:00', null);
insert into ids select 'dora2', public.create_agent_routine(pg_temp.i('scopus'), 'Outra da Dora', 'diaria', null, '09:00', null);
select public.save_automation_setting('6f000000-0000-0000-0000-000000000001', 'rotina:' || pg_temp.i('dora1')::text, 'automatico', 100);
select public.save_automation_setting('6f000000-0000-0000-0000-000000000001', 'rotina:' || pg_temp.i('dora2')::text, 'automatico', 100);
reset role;
select pg_temp.zerar();
select pg_temp.armar('dora1', '2026-10-12 11:00:00+00');
select pg_temp.cron('dora1', '2026-10-12 12:00:00+00');
select is(pg_temp.execucoes('dora1'), 1, 'com a dona no Workspace, a Rotina dela roda');
insert into ids select 'run_dora1', pg_temp.ultima('dora1');
update public.workspace_memberships set active = false
where workspace_id = '6f000000-0000-0000-0000-000000000001' and user_id = '6e000000-0000-0000-0000-000000000004';
select pg_temp.armar('dora2', '2026-10-12 11:00:00+00');
select is(pg_temp.cron('dora2', '2026-10-12 12:00:00+00'), 'sem_dono', 'dona fora do Workspace: o cron não cria a Execução');
select is(pg_temp.execucoes('dora2'), 0, 'e nenhuma Execução existe');
select is((select paused from private.agent_routines where id = pg_temp.i('dora2')), true, 'a Rotina fica pausada');
set local role service_role;
select is((select public.claim_agent_run(pg_temp.i('run_dora1')) is null)::text, 'true', 'a Execução já na fila não é reservada');
reset role;
select is(
  (select r.error_code from private.agent_runs r where r.id = pg_temp.i('run_dora1')),
  'membership_inactive', 'e fecha com membership_inactive, como hoje');

-- 13. Teto: sem teto aprovado ou no teto, o cron não cria e devolve o motivo; o teto de uma Rotina não barra a outra.
select pg_temp.zerar();
set local role authenticated;
select set_config('request.jwt.claim.sub', '6e000000-0000-0000-0000-000000000001', true);
insert into ids select 'sem_teto', public.create_agent_routine(pg_temp.i('scopus'), 'Sem teto aprovado', 'diaria', null, '09:00', null);
insert into ids select 'pequeno', public.create_agent_routine(pg_temp.i('scopus'), 'Teto pequeno', 'diaria', null, '09:00', null);
insert into ids select 'folga', public.create_agent_routine(pg_temp.i('scopus'), 'Teto folgado', 'diaria', null, '09:00', null);
select public.save_automation_setting('6f000000-0000-0000-0000-000000000001', 'rotina:' || pg_temp.i('pequeno')::text, 'automatico', 2);
select public.save_automation_setting('6f000000-0000-0000-0000-000000000001', 'rotina:' || pg_temp.i('folga')::text, 'automatico', 100);
reset role;
select pg_temp.zerar();
select pg_temp.armar('sem_teto', '2026-10-12 11:00:00+00');
select pg_temp.armar('pequeno', '2026-10-12 11:00:00+00');
select pg_temp.armar('folga', '2026-10-12 11:00:00+00');
create temporary table rodada on commit drop as
  select * from private.enqueue_due_agent_routines('2026-10-12 12:00:00+00');
select is((select outcome from rodada where routine_id = pg_temp.i('sem_teto')), 'confirmar', 'sem teto aprovado (em confirmar), o cron devolve o motivo');
select is((select outcome from rodada where routine_id = pg_temp.i('pequeno')), 'teto_atingido', 'com o teto menor que a estimativa, o cron devolve teto_atingido');
select is((select outcome from rodada where routine_id = pg_temp.i('folga')), 'criada', 'a Rotina do mesmo Agente com teto de sobra roda');
select is(pg_temp.execucoes('sem_teto') + pg_temp.execucoes('pequeno'), 0, 'as barradas não criam Execução');
select is(
  (select count(*)::int from private.workspace_notices
    where workspace_id = '6f000000-0000-0000-0000-000000000001' and kind = 'teto_atingido' and title like '%Teto pequeno%'),
  1, 'ao bater o teto sai um Aviso do Workspace');
select pg_temp.armar('pequeno', '2026-10-13 11:00:00+00');
select is(pg_temp.cron('pequeno', '2026-10-13 12:00:00+00'), 'teto_atingido', 'no dia seguinte a Rotina segue barrada');
select is(
  (select count(*)::int from private.workspace_notices
    where workspace_id = '6f000000-0000-0000-0000-000000000001' and kind = 'teto_atingido' and title like '%Teto pequeno%'),
  1, 'e o Aviso saiu uma vez só');
set local role authenticated;
select set_config('request.jwt.claim.sub', '6e000000-0000-0000-0000-000000000001', true);
select is(
  (select status from public.start_agent_run('6f000000-0000-0000-0000-000000000001', null, pg_temp.i('scopus'), 'Olá, Scopus',
    '{}', 'c6e00000-0000-0000-0000-000000000001')),
  'queued', 'a Conversa com o mesmo Agente não é barrada pelo teto da Rotina');
reset role;

-- 14. Isolamento: um Workspace nunca dispara, lista nem consome o teto de Rotina de outro.
select pg_temp.zerar();
set local role authenticated;
select set_config('request.jwt.claim.sub', '6e000000-0000-0000-0000-000000000003', true);
insert into ids select 'sul', public.create_agent_routine(pg_temp.i('scopus_sul'), 'Rotina do Sul', 'diaria', null, '09:00', null);
select public.save_automation_setting('6f000000-0000-0000-0000-000000000002', 'rotina:' || pg_temp.i('sul')::text, 'automatico', 100);
select throws_ok(
  $$select public.save_automation_setting('6f000000-0000-0000-0000-000000000002', 'rotina:' || pg_temp.i('diaria')::text, 'confirmar', null)$$,
  '22023', 'unknown automation scope', 'a Administradora do Sul não mexe no teto de uma Rotina do Norte');
select throws_ok(
  $$select * from public.list_automation_settings('6f000000-0000-0000-0000-000000000001')$$,
  '42501', 'active workspace membership required', 'nem lê os tetos do Norte');
select is(
  (select count(*)::int from public.list_automation_settings('6f000000-0000-0000-0000-000000000002') where kind = 'rotina'),
  1, 'a página do Sul lista só a Rotina do Sul');
reset role;
select pg_temp.zerar();
select pg_temp.armar('sul', '2026-10-13 11:00:00+00');
select pg_temp.armar('normal', '2026-10-13 11:00:00+00');
update private.agent_runs set status = 'succeeded', finished_at = clock_timestamp() where routine_id = pg_temp.i('normal');
select count(*) from private.enqueue_due_agent_routines('2026-10-13 12:00:00+00');
select is(pg_temp.execucoes('sul'), 1, 'a Rotina do Sul rodou no horário dela');
select is(
  (select count(*)::int from private.agent_runs r join private.agent_routines o on o.id = r.routine_id
    where r.workspace_id <> o.workspace_id),
  0, 'toda Execução de Rotina é do Workspace da Rotina');
select is(
  (select g.spent from private.automation_spend g
    where g.scope = 'rotina:' || pg_temp.i('sul')::text and g.workspace_id = '6f000000-0000-0000-0000-000000000002'),
  3 * (select credits from private.credit_action_prices where action = 'agent_round'),
  'a Rotina do Sul gasta o teto dela, no Workspace dela');
select is(
  (select count(*)::int from private.automation_spend g join private.agent_routines o on g.scope = 'rotina:' || o.id::text
    where g.workspace_id <> o.workspace_id),
  0, 'nenhum teto de Rotina é consumido em outro Workspace');

-- 15. O relógio só é ligado onde existe pg_cron (Supabase e o CI), de 5 em 5 minutos.
create function pg_temp.job_das_rotinas() returns text language plpgsql as $f$
declare
  v text;
begin
  if to_regclass('cron.job') is null then
    return 'sem pg_cron';
  end if;
  execute $q$select schedule || ' ' || command from cron.job where jobname = 'althius-agent-routines'$q$ into v;
  return v;
end
$f$;
select ok(pg_temp.job_das_rotinas() in ('sem pg_cron', '*/5 * * * * select * from private.enqueue_due_agent_routines()'),
  'where pg_cron exists, the routines run every 5 minutes');
select isnt(pg_temp.job_das_rotinas(), null, 'the job exists wherever pg_cron exists');

select * from finish();
rollback;

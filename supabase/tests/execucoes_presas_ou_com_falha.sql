begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(25);

select has_function('private', 'expire_stale_agent_runs', array[]::text[], 'o relógio de Execuções paradas existe');
select has_function('public', 'retry_agent_run', array['uuid', 'uuid']::text[], 'a RPC de nova tentativa existe');
select is(private.routine_failure_alert_threshold(), 3, 'o padrão do Aviso é três falhas seguidas');
create function pg_temp.tem_job_do_relogio() returns boolean language plpgsql as $$
declare
  v_existe boolean;
begin
  if to_regclass('cron.job') is null then return true; end if;
  execute 'select exists (select 1 from cron.job where jobname = ''althius-stale-agent-runs'' and schedule = ''*/5 * * * *'')' into v_existe;
  return v_existe;
end;
$$;
select ok(pg_temp.tem_job_do_relogio(), 'o job está agendado a cada cinco minutos onde pg_cron existe');

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values
  ('a3000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin@exec.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('a3000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'member@exec.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values ('a3000000-0000-4000-8000-000000000010', 'empresa', 'Execuções');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('a3000000-0000-4000-8000-000000000010', 'a3000000-0000-4000-8000-000000000001', 'admin', true),
  ('a3000000-0000-4000-8000-000000000010', 'a3000000-0000-4000-8000-000000000002', 'member', true);
select set_config('t.agent', (select id::text from private.agents
  where workspace_id = 'a3000000-0000-4000-8000-000000000010' and specialty = 'scopus' and kind = 'padrao'), true);
select set_config('t.agentes_antes', (select count(*)::text from private.agents), true);
insert into private.agent_routines (id, workspace_id, agent_id, task, frequency, run_time, updated_by, owner_id)
values ('a3000000-0000-4000-8000-000000000020', 'a3000000-0000-4000-8000-000000000010',
  current_setting('t.agent')::uuid, 'Resuma o mercado', 'diaria', '08:00', 'a3000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001');
insert into private.agent_conversations (id, workspace_id, owner_id, kind, agent_id) values
  ('a3000000-0000-4000-8000-000000000030', 'a3000000-0000-4000-8000-000000000010', 'a3000000-0000-4000-8000-000000000001', 'agente', current_setting('t.agent')::uuid),
  ('a3000000-0000-4000-8000-000000000031', 'a3000000-0000-4000-8000-000000000010', 'a3000000-0000-4000-8000-000000000002', 'agente', current_setting('t.agent')::uuid),
  ('a3000000-0000-4000-8000-000000000032', 'a3000000-0000-4000-8000-000000000010', 'a3000000-0000-4000-8000-000000000001', 'agente', current_setting('t.agent')::uuid),
  ('a3000000-0000-4000-8000-000000000033', 'a3000000-0000-4000-8000-000000000010', 'a3000000-0000-4000-8000-000000000001', 'agente', current_setting('t.agent')::uuid),
  ('a3000000-0000-4000-8000-000000000034', 'a3000000-0000-4000-8000-000000000010', 'a3000000-0000-4000-8000-000000000001', 'agente', current_setting('t.agent')::uuid),
  ('a3000000-0000-4000-8000-000000000035', 'a3000000-0000-4000-8000-000000000010', 'a3000000-0000-4000-8000-000000000001', 'agente', current_setting('t.agent')::uuid),
  ('a3000000-0000-4000-8000-000000000036', 'a3000000-0000-4000-8000-000000000010', 'a3000000-0000-4000-8000-000000000001', 'agente', current_setting('t.agent')::uuid);

-- Duas paradas vencidas (uma em cada fase) e uma Execução recente.
insert into private.agent_runs (id, workspace_id, conversation_id, requested_by, client_request_id, request_text,
  created_at, status, started_at, trigger_kind) values
  ('a3000000-0000-4000-8000-000000000040', 'a3000000-0000-4000-8000-000000000010', 'a3000000-0000-4000-8000-000000000030', 'a3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000041', 'Fila parada', now() - interval '11 minutes', 'queued', null, 'conversa'),
  ('a3000000-0000-4000-8000-000000000042', 'a3000000-0000-4000-8000-000000000010', 'a3000000-0000-4000-8000-000000000031', 'a3000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000043', 'Motor parado', now() - interval '20 minutes', 'running', now() - interval '11 minutes', 'conversa'),
  ('a3000000-0000-4000-8000-000000000044', 'a3000000-0000-4000-8000-000000000010', 'a3000000-0000-4000-8000-000000000032', 'a3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000045', 'Ainda no prazo', now() - interval '9 minutes', 'queued', null, 'conversa');
select is(private.expire_stale_agent_runs(), 2, 'o relógio fecha as Execuções vencidas sem abrir a Conversa');
select is((select error_code from private.agent_runs where id = 'a3000000-0000-4000-8000-000000000040'), 'timeout_queued', 'identifica pedido que ninguém pegou');
select is((select error_code from private.agent_runs where id = 'a3000000-0000-4000-8000-000000000042'), 'timeout_running', 'identifica motor parado durante a Execução');
select is((select count(*)::int from private.agent_run_events where run_id in ('a3000000-0000-4000-8000-000000000040', 'a3000000-0000-4000-8000-000000000042') and kind = 'falha'), 2, 'cada expiração gera um evento de falha');
select is(private.expire_stale_agent_runs(), 0, 'rodar o relógio de novo não repete a falha');
select is((select status from private.agent_runs where id = 'a3000000-0000-4000-8000-000000000044'), 'queued', 'Execução de nove minutos não é tocada');

-- O Administrador pode retomar Execução de Rotina, com chave idempotente, na mesma Conversa.
insert into private.agent_runs (id, workspace_id, conversation_id, requested_by, client_request_id, request_text,
  status, error_code, finished_at, trigger_kind, routine_id)
values ('a3000000-0000-4000-8000-000000000050', 'a3000000-0000-4000-8000-000000000010', 'a3000000-0000-4000-8000-000000000030',
  'a3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000051', 'Resuma o mercado',
  'failed', 'timeout_running', now(), 'rotina', 'a3000000-0000-4000-8000-000000000020');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000001', true);
select is((select id from public.retry_agent_run('a3000000-0000-4000-8000-000000000050', 'a3000000-0000-4000-8000-000000000052')),
  (select id from public.retry_agent_run('a3000000-0000-4000-8000-000000000050', 'a3000000-0000-4000-8000-000000000052')), 'repetir a RPC com a mesma chave devolve a mesma Execução');
select ok(exists (select 1 from public.list_agent_run_attention('a3000000-0000-4000-8000-000000000010', current_setting('t.agent')::uuid)
  where id = 'a3000000-0000-4000-8000-000000000050' and retried_by is not null), 'a Atividade relaciona a nova Execução à original');
select throws_ok($$select * from public.retry_agent_run('a3000000-0000-4000-8000-000000000050', 'a3000000-0000-4000-8000-000000000053')$$,
  '55006', 'conversation busy', 'não abre outra Execução enquanto a Conversa está ocupada');
select is((select count(*)::int from public.list_agent_run_attention('a3000000-0000-4000-8000-000000000010', current_setting('t.agent')::uuid)
  where id = 'a3000000-0000-4000-8000-000000000042'), 0, 'Administrador não lê Execução de Conversa pessoal de outra pessoa');
select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000002', true);
select is((select array_agg(id) from public.list_agent_run_attention('a3000000-0000-4000-8000-000000000010', current_setting('t.agent')::uuid)),
  array['a3000000-0000-4000-8000-000000000042']::uuid[], 'Membro vê somente a própria Conversa pessoal');
select throws_ok($$select * from public.retry_agent_run('a3000000-0000-4000-8000-000000000050', 'a3000000-0000-4000-8000-000000000054')$$,
  '42501', 'not allowed to retry this run', 'Membro não retoma a Execução de outra pessoa');
reset role;
update private.agent_runs set error_code = 'membership_inactive' where id = 'a3000000-0000-4000-8000-000000000042';
set local role authenticated;
select throws_ok($$select * from public.retry_agent_run('a3000000-0000-4000-8000-000000000042', 'a3000000-0000-4000-8000-000000000055')$$,
  '22023', 'run cannot be retried', 'membership_inactive não permite tentar de novo');
select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000001', true);
select throws_ok($$select * from public.retry_agent_run('a3000000-0000-4000-8000-000000000044', 'a3000000-0000-4000-8000-000000000056')$$,
  '22023', 'run cannot be retried', 'Execução ainda na fila não permite tentar de novo');
reset role;
select is((select request_text || '|' || status || '|' || retry_of::text from private.agent_runs where retry_of = 'a3000000-0000-4000-8000-000000000050'),
  'Resuma o mercado|queued|a3000000-0000-4000-8000-000000000050', 'a nova Execução preserva o pedido e aponta para a original');

-- As falhas da Rotina contam por Rotina; teto e crédito não entram na sequência.
insert into private.agent_runs (id, workspace_id, conversation_id, requested_by, client_request_id, request_text,
  status, trigger_kind, routine_id) values
  ('a3000000-0000-4000-8000-000000000060', 'a3000000-0000-4000-8000-000000000010', 'a3000000-0000-4000-8000-000000000034', 'a3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000061', 'Falha 1', 'queued', 'rotina', 'a3000000-0000-4000-8000-000000000020'),
  ('a3000000-0000-4000-8000-000000000062', 'a3000000-0000-4000-8000-000000000010', 'a3000000-0000-4000-8000-000000000035', 'a3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000063', 'Falha 2', 'queued', 'rotina', 'a3000000-0000-4000-8000-000000000020'),
  ('a3000000-0000-4000-8000-000000000064', 'a3000000-0000-4000-8000-000000000010', 'a3000000-0000-4000-8000-000000000036', 'a3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000065', 'Falha 3', 'queued', 'rotina', 'a3000000-0000-4000-8000-000000000020');
update private.agent_runs set status = 'failed', error_code = 'model_timeout', finished_at = now()
  where id in ('a3000000-0000-4000-8000-000000000060', 'a3000000-0000-4000-8000-000000000062', 'a3000000-0000-4000-8000-000000000064');
select is((select count(*)::int from private.workspace_notices where workspace_id = 'a3000000-0000-4000-8000-000000000010' and kind = 'rotina_falhando'), 1, 'a terceira falha gera um único Aviso');
insert into private.agent_runs (id, workspace_id, conversation_id, requested_by, client_request_id, request_text,
  status, trigger_kind, routine_id)
values ('a3000000-0000-4000-8000-000000000066', 'a3000000-0000-4000-8000-000000000010', 'a3000000-0000-4000-8000-000000000034',
  'a3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000067', 'Falha 4', 'queued', 'rotina', 'a3000000-0000-4000-8000-000000000020');
update private.agent_runs set status = 'failed', error_code = 'model_timeout', finished_at = now()
  where id = 'a3000000-0000-4000-8000-000000000066';
select is((select count(*)::int from private.workspace_notices where workspace_id = 'a3000000-0000-4000-8000-000000000010' and kind = 'rotina_falhando'), 1, 'a quarta falha não repete o Aviso');
insert into private.agent_runs (id, workspace_id, conversation_id, requested_by, client_request_id, request_text,
  status, trigger_kind, routine_id)
values ('a3000000-0000-4000-8000-000000000068', 'a3000000-0000-4000-8000-000000000010', 'a3000000-0000-4000-8000-000000000034',
  'a3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000069', 'Teto atingido', 'queued', 'rotina', 'a3000000-0000-4000-8000-000000000020');
update private.agent_runs set status = 'failed', error_code = 'automation_cap_reached', finished_at = now()
  where id = 'a3000000-0000-4000-8000-000000000068';
select is((select failure_streak from private.agent_routine_failure_state where routine_id = 'a3000000-0000-4000-8000-000000000020'), 4, 'falha por teto não conta na sequência');
select ok(not (select paused from private.agent_routines where id = 'a3000000-0000-4000-8000-000000000020'), 'o Aviso não pausa a Rotina');
update private.agent_runs set status = 'succeeded', error_code = null, finished_at = now()
  where id = 'a3000000-0000-4000-8000-000000000060';
select is((select failure_streak from private.agent_routine_failure_state where routine_id = 'a3000000-0000-4000-8000-000000000020'), 0, 'sucesso zera a sequência de falhas');
select is((select count(*)::int from private.agents), current_setting('t.agentes_antes')::int, 'o caminho não cria Agentes');

select * from finish();
rollback;

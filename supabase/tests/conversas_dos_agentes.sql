begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(61);

-- Workspace Norte: Ana é Administradora, Bruno é Membro e Eva já foi removida. Workspace Sul: Carla é Administradora.
-- O Norte tem a Conta-alvo Alfa e a Beta, arquivada; o Sul tem a Sulina. Os Agentes padrão nascem com cada Workspace.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('61400000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('61400000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('61400000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@sul.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('61400000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'eva@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('aaaaaaaa-1400-0000-0000-000000000001', 'empresa', 'Norte'),
  ('aaaaaaaa-1400-0000-0000-000000000002', 'empresa', 'Sul');

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('aaaaaaaa-1400-0000-0000-000000000001', '61400000-0000-0000-0000-000000000001', 'admin', true),
  ('aaaaaaaa-1400-0000-0000-000000000001', '61400000-0000-0000-0000-000000000002', 'member', true),
  ('aaaaaaaa-1400-0000-0000-000000000001', '61400000-0000-0000-0000-000000000005', 'member', false),
  ('aaaaaaaa-1400-0000-0000-000000000002', '61400000-0000-0000-0000-000000000003', 'admin', true);

insert into public.target_accounts (workspace_id, name, canonical_url, domain, segment, created_by, archived_at) values
  ('aaaaaaaa-1400-0000-0000-000000000001', 'Alfa Incorporadora', 'https://alfa.com.br', 'alfa.com.br', 'Incorporação',
   '61400000-0000-0000-0000-000000000001', null),
  ('aaaaaaaa-1400-0000-0000-000000000001', 'Beta Alfaiataria', 'https://beta.com.br', 'beta.com.br', null,
   '61400000-0000-0000-0000-000000000001', now()),
  ('aaaaaaaa-1400-0000-0000-000000000002', 'Sulina Alfa', 'https://sulina.com.br', 'sulina.com.br', null,
   '61400000-0000-0000-0000-000000000003', null);

-- Os Agentes, pelo nome, para usar nas chamadas de outro papel.
select set_config('t.scopus', (select id::text from private.agents
  where workspace_id = 'aaaaaaaa-1400-0000-0000-000000000001' and name = 'Scopus'), true);
select set_config('t.rhetor', (select id::text from private.agents
  where workspace_id = 'aaaaaaaa-1400-0000-0000-000000000001' and name = 'Rhetor'), true);
select set_config('t.scopus_sul', (select id::text from private.agents
  where workspace_id = 'aaaaaaaa-1400-0000-0000-000000000002' and name = 'Scopus'), true);

-- Estrutura: RLS nas tabelas, nenhum papel lê direto, funções security definer com search_path vazio, e a divisão de
-- quem executa o quê: a Conta de usuário pede e lê; só a função (service_role) roda a Execução.
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private' and c.relkind = 'r' and c.relrowsecurity
      and c.relname in ('agent_conversations', 'agent_runs', 'agent_run_events')),
  3, 'as tabelas das Conversas têm RLS ligado');
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private' and c.relname in ('agent_conversations', 'agent_runs', 'agent_run_events')
      and (has_table_privilege('authenticated', c.oid, 'select') or has_table_privilege('anon', c.oid, 'select')
        or has_table_privilege('service_role', c.oid, 'select'))),
  0, 'nenhum papel do app lê as tabelas das Conversas direto');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('start_agent_run', 'get_agent_run_events', 'list_agent_conversations', 'get_agent_conversation',
        'claim_agent_run', 'append_agent_run_event', 'finish_agent_run', 'agent_search_target_accounts')
      and p.prosecdef and p.proconfig @> array['search_path=""']),
  8, 'as funções das Conversas são security definer com search_path vazio');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('start_agent_run', 'get_agent_run_events', 'list_agent_conversations', 'get_agent_conversation')
      and (has_function_privilege('anon', p.oid, 'execute') or not has_function_privilege('authenticated', p.oid, 'execute'))),
  0, 'pedir e ler é só da Conta de usuário autenticada, nunca de anon');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('claim_agent_run', 'append_agent_run_event', 'finish_agent_run', 'agent_search_target_accounts')
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')
        or not has_function_privilege('service_role', p.oid, 'execute'))),
  0, 'rodar a Execução é só da função, com service_role');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$select * from public.start_agent_run('aaaaaaaa-1400-0000-0000-000000000001', null, null, 'Oi', '{}',
    'c1400000-0000-0000-0000-000000000001')$$,
  '42501', 'authentication required', 'sem sessão não há pedido');

-- Ana pede à Coordenação e @menciona o Scopus.
select set_config('request.jwt.claim.sub', '61400000-0000-0000-0000-000000000001', true);
select is(
  (select status from public.start_agent_run('aaaaaaaa-1400-0000-0000-000000000001', null, null,
    '  Quais Contas da Alfa temos?  ', array[current_setting('t.scopus')::uuid],
    'c1400000-0000-0000-0000-000000000001')),
  'queued', 'o pedido à Coordenação entra na fila');
select is(
  (select run_id from public.start_agent_run('aaaaaaaa-1400-0000-0000-000000000001', null, null,
    'Quais Contas da Alfa temos?', '{}', 'c1400000-0000-0000-0000-000000000001')),
  (select run_id from public.start_agent_run('aaaaaaaa-1400-0000-0000-000000000001', null, null,
    'outro texto', '{}', 'c1400000-0000-0000-0000-000000000001')),
  'o mesmo pedido reenviado devolve a mesma Execução');

reset role;
select is((select count(*)::int from private.agent_runs), 1, 'reenviar não cria outra Execução');
select is(
  (select request_text || '|' || array_to_string(mentions, ',') from private.agent_runs),
  'Quais Contas da Alfa temos?|' || current_setting('t.scopus'), 'o texto é guardado sem espaços nas pontas, com a menção');
select is(
  (select kind || ':' || coalesce(agent_id::text, '-') from private.agent_conversations), 'coordenada:-',
  'sem Agente, a Conversa é da Coordenação');
select set_config('t.conv', (select id::text from private.agent_conversations), true);
select set_config('t.run1', (select id::text from private.agent_runs), true);
set local role authenticated;

select throws_ok(
  $$select * from public.start_agent_run('aaaaaaaa-1400-0000-0000-000000000001', current_setting('t.conv')::uuid, null,
    'Mais uma coisa', '{}', 'c1400000-0000-0000-0000-000000000002')$$,
  '55006', 'conversation busy', 'um pedido por vez em cada Conversa');
select throws_ok(
  $$select * from public.start_agent_run('aaaaaaaa-1400-0000-0000-000000000001', null, null, '   ', '{}',
    'c1400000-0000-0000-0000-000000000003')$$,
  '22023', 'invalid request text', 'pedido vazio é recusado');
select throws_ok(
  $$select * from public.start_agent_run('aaaaaaaa-1400-0000-0000-000000000001', null, null, repeat('a', 4001), '{}',
    'c1400000-0000-0000-0000-000000000003')$$,
  '22023', 'invalid request text', 'pedido acima de 4000 caracteres é recusado');
select throws_ok(
  $$select * from public.start_agent_run('aaaaaaaa-1400-0000-0000-000000000001', null, null, 'Oi',
    array[current_setting('t.scopus_sul')::uuid], 'c1400000-0000-0000-0000-000000000003')$$,
  '22023', 'invalid mention', 'não se menciona um Agente de outro Workspace');
select throws_ok(
  $$select * from public.start_agent_run('aaaaaaaa-1400-0000-0000-000000000001', null,
    current_setting('t.scopus_sul')::uuid, 'Oi', '{}', 'c1400000-0000-0000-0000-000000000003')$$,
  'P0002', 'agent not found', 'não se conversa com um Agente de outro Workspace');
select throws_ok(
  $$select * from public.start_agent_run('aaaaaaaa-1400-0000-0000-000000000001', current_setting('t.conv')::uuid,
    current_setting('t.scopus')::uuid, 'Oi', '{}', 'c1400000-0000-0000-0000-000000000003')$$,
  '22023', 'conversation belongs to another agent', 'a Conversa da Coordenação não vira Conversa de um Agente');
select is(
  (select status from public.start_agent_run('aaaaaaaa-1400-0000-0000-000000000001', null,
    current_setting('t.scopus')::uuid, 'Resuma a Alfa', '{}', 'c1400000-0000-0000-0000-000000000004')),
  'queued', 'a Conversa na página do Scopus também entra na fila');
select is(
  (select count(*)::int from public.list_agent_conversations('aaaaaaaa-1400-0000-0000-000000000001')
    where open_run_id is not null),
  2, 'a Ana vê as duas Conversas, cada uma com a Execução aberta');
select is(
  public.get_agent_run_events(current_setting('t.run1')::uuid, 0),
  '{"status": "queued", "error_code": null, "events": []}'::jsonb, 'na fila, a Execução ainda não tem eventos');
select throws_ok(
  $$select public.claim_agent_run(current_setting('t.run1')::uuid)$$,
  '42501', null, 'a Conta de usuário não roda a Execução');

-- A Conversa é de quem a começou.
select set_config('request.jwt.claim.sub', '61400000-0000-0000-0000-000000000002', true);
select is(
  (select count(*)::int from public.list_agent_conversations('aaaaaaaa-1400-0000-0000-000000000001')),
  0, 'o Bruno, do mesmo Workspace, não vê as Conversas da Ana');
select throws_ok(
  $$select public.get_agent_run_events(current_setting('t.run1')::uuid, 0)$$,
  'P0002', 'run not found', 'o Bruno não lê a Execução da Ana');
select throws_ok(
  $$select public.get_agent_conversation(current_setting('t.conv')::uuid)$$,
  'P0002', 'conversation not found', 'o Bruno não lê a Conversa da Ana');
select throws_ok(
  $$select * from public.start_agent_run('aaaaaaaa-1400-0000-0000-000000000001', current_setting('t.conv')::uuid, null,
    'Oi', '{}', 'c1400000-0000-0000-0000-000000000005')$$,
  'P0002', 'conversation not found', 'o Bruno não continua a Conversa da Ana');
select set_config('request.jwt.claim.sub', '61400000-0000-0000-0000-000000000005', true);
select throws_ok(
  $$select * from public.start_agent_run('aaaaaaaa-1400-0000-0000-000000000001', null, null, 'Oi', '{}',
    'c1400000-0000-0000-0000-000000000006')$$,
  '42501', 'active workspace membership required', 'quem saiu do Workspace não pede nada');
select set_config('request.jwt.claim.sub', '61400000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select * from public.list_agent_conversations('aaaaaaaa-1400-0000-0000-000000000001')$$,
  '42501', 'active workspace membership required', 'a Carla, do Sul, não lê nada do Norte');

reset role;
set local role anon;
select throws_ok(
  $$select * from public.start_agent_run('aaaaaaaa-1400-0000-0000-000000000001', null, null, 'Oi', '{}',
    'c1400000-0000-0000-0000-000000000007')$$,
  '42501', null, 'anon não pede nada');

-- A função roda a Execução da Coordenação.
reset role;
set local role service_role;
select is(
  (select jsonb_build_object('kind', c ->> 'kind', 'workspace', c ->> 'workspace_name', 'request', c ->> 'request_text',
    'agents', jsonb_array_length(c -> 'agents'), 'mentions', c -> 'mentions', 'history', c -> 'history')
   from public.claim_agent_run(current_setting('t.run1')::uuid) c),
  jsonb_build_object('kind', 'coordenada', 'workspace', 'Norte', 'request', 'Quais Contas da Alfa temos?', 'agents', 4,
    'mentions', jsonb_build_array(current_setting('t.scopus')), 'history', '[]'::jsonb),
  'a reserva traz o pedido, os Agentes do Workspace e as menções');
select is(public.claim_agent_run(current_setting('t.run1')::uuid), null, 'a Execução é reservada uma vez só');
select is(
  public.append_agent_run_event(current_setting('t.run1')::uuid, 'chamada', current_setting('t.scopus')::uuid, '{}'),
  1, 'o primeiro passo recebe o número 1');
select throws_ok(
  $$select public.append_agent_run_event(current_setting('t.run1')::uuid, 'chamada',
    current_setting('t.scopus_sul')::uuid, '{}')$$,
  'P0002', 'agent not found', 'um passo não cita um Agente de outro Workspace');
select throws_ok(
  $$select public.append_agent_run_event(current_setting('t.run1')::uuid, 'feito', null, '{}')$$,
  '23514', null, 'só a resposta e a falha ficam sem Agente: a Coordenação não é um Agente');
select is(
  (select string_agg(name, ', ') from public.agent_search_target_accounts(current_setting('t.run1')::uuid, 'ALFA')),
  'Alfa Incorporadora', 'a consulta acha só as Contas-alvo não arquivadas do Workspace da Execução');
select is(
  (select count(*)::int from public.agent_search_target_accounts(current_setting('t.run1')::uuid, '')),
  1, 'sem termo, a consulta lista as Contas-alvo ativas do Workspace');
select throws_ok(
  $$select public.finish_agent_run(current_setting('t.run1')::uuid, 'succeeded', null, 'claude-opus-5-5')$$,
  '55000', 'run has no answer', 'não há sucesso sem resposta gravada');
select is(
  public.append_agent_run_event(current_setting('t.run1')::uuid, 'feito', current_setting('t.scopus')::uuid,
    '{"texto": "Achei a Alfa Incorporadora."}'),
  2, 'o Scopus termina a etapa');
select is(
  public.append_agent_run_event(current_setting('t.run1')::uuid, 'resposta', null,
    '{"texto": "Temos a Alfa Incorporadora."}'),
  3, 'a Coordenação junta a resposta');
select lives_ok(
  $$select public.finish_agent_run(current_setting('t.run1')::uuid, 'succeeded', null, 'claude-opus-5-5')$$,
  'com a resposta gravada, a Execução termina com sucesso');
select throws_ok(
  $$select public.append_agent_run_event(current_setting('t.run1')::uuid, 'resposta', null, '{}')$$,
  '55000', 'run is not running', 'nada se grava numa Execução terminada');
select throws_ok(
  $$select * from public.agent_search_target_accounts(current_setting('t.run1')::uuid, 'alfa')$$,
  '55000', 'run is not running', 'nem se consulta por ela');

-- Ana acompanha pelo banco, de onde parou, e continua a Conversa.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '61400000-0000-0000-0000-000000000001', true);
select is(
  (select jsonb_build_object('status', e ->> 'status', 'kinds',
    (select jsonb_agg(x ->> 'kind' order by (x ->> 'seq')::int) from jsonb_array_elements(e -> 'events') x))
   from public.get_agent_run_events(current_setting('t.run1')::uuid, 1) e),
  '{"status": "succeeded", "kinds": ["feito", "resposta"]}'::jsonb, 'a leitura retoma depois do último passo lido');
select is(
  (select e -> 'events' -> 0 ->> 'agent_name' from public.get_agent_run_events(current_setting('t.run1')::uuid, 0) e),
  'Scopus', 'o passo leva o nome do Agente');
select is(
  (select status from public.start_agent_run('aaaaaaaa-1400-0000-0000-000000000001', current_setting('t.conv')::uuid,
    null, 'E a Beta?', '{}', 'c1400000-0000-0000-0000-000000000008')),
  'queued', 'terminado o pedido, a Conversa aceita o seguinte');
select is(
  (select jsonb_build_object('runs', jsonb_array_length(c -> 'runs'), 'events', jsonb_array_length(c -> 'runs' -> 0 -> 'events'))
   from public.get_agent_conversation(current_setting('t.conv')::uuid) c),
  '{"runs": 2, "events": 3}'::jsonb, 'reabrir a Conversa traz os pedidos em ordem, com os passos');

reset role;
select set_config('t.run2', (select id::text from private.agent_runs
  where client_request_id = 'c1400000-0000-0000-0000-000000000008'), true);
set local role service_role;
select is(
  (select c -> 'history' from public.claim_agent_run(current_setting('t.run2')::uuid) c),
  '[{"request": "Quais Contas da Alfa temos?", "answer": "Temos a Alfa Incorporadora."}]'::jsonb,
  'o pedido seguinte recebe o que já foi respondido na Conversa');
select throws_ok(
  $$select public.finish_agent_run(current_setting('t.run2')::uuid, 'failed', null, null)$$,
  '22023', 'error code required', 'uma falha tem motivo');
select lives_ok(
  $$select public.finish_agent_run(current_setting('t.run2')::uuid, 'failed', 'model_error', 'claude-opus-5-5')$$,
  'a falha do modelo fecha a Execução');

reset role;
select is(
  (select r.status || ':' || r.error_code || ':' || e.kind || ':' || (e.payload ->> 'motivo')
   from private.agent_runs r join private.agent_run_events e on e.run_id = r.id
   where r.id = current_setting('t.run2')::uuid),
  'failed:model_error:falha:model_error', 'a falha fica gravada como passo, sem resposta inventada');

-- Uma Execução que parou no meio (a função caiu) vira falha na leitura seguinte, e libera a Conversa.
update private.agent_runs set created_at = now() - interval '11 minutes'
where client_request_id = 'c1400000-0000-0000-0000-000000000004';
select set_config('t.run3', (select id::text from private.agent_runs
  where client_request_id = 'c1400000-0000-0000-0000-000000000004'), true);
set local role authenticated;
select is(
  (select (e ->> 'status') || ':' || (e ->> 'error_code') || ':' || (e -> 'events' -> 0 ->> 'kind')
   from public.get_agent_run_events(current_setting('t.run3')::uuid, 0) e),
  'failed:timeout:falha', 'a Execução parada além do prazo é fechada como falha');
reset role;
set local role service_role;
select is(public.claim_agent_run(current_setting('t.run3')::uuid), null, 'e a função não a roda mais');

-- Quem saiu do Workspace depois de pedir: a Execução não roda.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '61400000-0000-0000-0000-000000000002', true);
select is(
  (select status from public.start_agent_run('aaaaaaaa-1400-0000-0000-000000000001', null, null, 'Oi', '{}',
    'c1400000-0000-0000-0000-000000000009')),
  'queued', 'o pedido do Bruno entra na fila');
reset role;
update public.workspace_memberships set active = false
where workspace_id = 'aaaaaaaa-1400-0000-0000-000000000001' and user_id = '61400000-0000-0000-0000-000000000002';
select set_config('t.run4', (select id::text from private.agent_runs
  where client_request_id = 'c1400000-0000-0000-0000-000000000009'), true);
set local role service_role;
select is(public.claim_agent_run(current_setting('t.run4')::uuid), null, 'a Execução de quem saiu não é reservada');
reset role;
select is(
  (select status || ':' || error_code from private.agent_runs where id = current_setting('t.run4')::uuid),
  'failed:membership_inactive', 'e fica como falha, com o motivo');

-- A Conversa com um Agente criado sai com ele.
set local role authenticated;
select set_config('request.jwt.claim.sub', '61400000-0000-0000-0000-000000000001', true);
select set_config('t.criado', (select public.create_agent('aaaaaaaa-1400-0000-0000-000000000001', 'rhetor', 'Norte', '')::text), true);
select lives_ok(
  $$select * from public.start_agent_run('aaaaaaaa-1400-0000-0000-000000000001', null,
    current_setting('t.criado')::uuid, 'Oi', '{}', 'c1400000-0000-0000-0000-000000000010')$$,
  'a Ana conversa com o Agente criado');
select lives_ok($$select public.delete_agent(current_setting('t.criado')::uuid)$$, 'o Agente criado é excluído');
reset role;
select is(
  (select count(*)::int from private.agent_conversations where agent_id = current_setting('t.criado')::uuid),
  0, 'a Conversa com ele sai junto');

-- A fila para o motor externo (Hermes): só a função lista, e só o que está na fila.
reset role;
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'list_queued_agent_runs'
      and p.prosecdef and p.proconfig @> array['search_path=""']
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('authenticated', p.oid, 'execute')
      and has_function_privilege('service_role', p.oid, 'execute')),
  1, 'só a função lista a fila, com security definer e search_path vazio');
set local role authenticated;
select set_config('request.jwt.claim.sub', '61400000-0000-0000-0000-000000000001', true);
select is(
  (select status from public.start_agent_run('aaaaaaaa-1400-0000-0000-000000000001', null, null, 'Para o Hermes', '{}',
    'c1400000-0000-0000-0000-000000000011')),
  'queued', 'um pedido novo entra na fila');
reset role;
select set_config('t.fila', coalesce((select array_agg(r.id order by r.created_at, r.id)::text
  from private.agent_runs r where r.status = 'queued'), '{}'), true);
set local role service_role;
select is(
  coalesce((select array_agg(q.run_id order by q.created_at, q.run_id) from public.list_queued_agent_runs(10) q)::text, '{}'),
  current_setting('t.fila'),
  'a fila traz só os pedidos que ainda não rodaram, do mais antigo ao mais novo');
select is(
  (select count(*)::int from public.list_queued_agent_runs(1)),
  1,
  'a fila respeita o limite');
reset role;

select * from finish();
rollback;

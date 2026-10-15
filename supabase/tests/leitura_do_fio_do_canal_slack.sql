begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(9);

-- Ler o fio do Canal Slack pela chave (slack-canal 04): o dono (id e nome que a Althius mostra) e o Agente do fio, só do
-- Workspace pedido, nunca o e-mail; nenhuma linha quando o thread não é um fio.

-- Ana (Norte, com nome em Meu perfil), Diego (Norte, só com o nome do cadastro), Edu (Norte, sem nome nenhum), Carla (Sul).
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('5f000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}',
   '{"full_name": "Ana do Cadastro"}', false, false),
  ('5f000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'diego@norte.test', '', now(), now(), now(), '{}',
   '{"name": "Diego Lima"}', false, false),
  ('5f000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'edu@norte.test', '', now(), now(), now(), '{}',
   '{}', false, false),
  ('5f000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'carla@sul.test', '', now(), now(), now(), '{}',
   '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('ff000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('ff000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('ff000000-0000-0000-0000-000000000001', '5f000000-0000-0000-0000-000000000001', 'admin', true),
  ('ff000000-0000-0000-0000-000000000001', '5f000000-0000-0000-0000-000000000002', 'member', true),
  ('ff000000-0000-0000-0000-000000000001', '5f000000-0000-0000-0000-000000000003', 'member', true),
  ('ff000000-0000-0000-0000-000000000002', '5f000000-0000-0000-0000-000000000004', 'admin', true);
insert into private.user_profiles (user_id, display_name) values ('5f000000-0000-0000-0000-000000000001', 'Ana Souza');

-- Três fios no Norte (Ana com o Scopus, Diego com o Rhetor, Edu com o Scopus) e um no Sul, com a mesma chave de canal e
-- thread do primeiro, mas outro team_id.
create function pg_temp.fio(p_ws uuid, p_user uuid, p_agente text, p_team text, p_canal text, p_ts text)
returns void language plpgsql as $f$
declare
  v_agent uuid := (select a.id from private.agents a where a.workspace_id = p_ws and a.name = p_agente);
  v_conversation uuid;
begin
  insert into private.agent_conversations (workspace_id, owner_id, kind, agent_id, origin)
  values (p_ws, p_user, 'agente', v_agent, 'slack') returning id into v_conversation;
  insert into private.slack_channel_threads (team_id, channel_id, thread_ts, workspace_id, conversation_id, owner_id, agent_id)
  values (p_team, p_canal, p_ts, p_ws, v_conversation, p_user, v_agent);
end
$f$;
select pg_temp.fio('ff000000-0000-0000-0000-000000000001', '5f000000-0000-0000-0000-000000000001', 'Scopus',
  'T2NORTE', 'C2GERAL', '1700000000.000100');
select pg_temp.fio('ff000000-0000-0000-0000-000000000001', '5f000000-0000-0000-0000-000000000002', 'Rhetor',
  'T2NORTE', 'D2DIEGO', '1700000000.000200');
select pg_temp.fio('ff000000-0000-0000-0000-000000000001', '5f000000-0000-0000-0000-000000000003', 'Scopus',
  'T2NORTE', 'C2GERAL', '1700000000.000300');
select pg_temp.fio('ff000000-0000-0000-0000-000000000002', '5f000000-0000-0000-0000-000000000004', 'Scopus',
  'T2SUL', 'C2GERAL', '1700000000.000100');

-- 1-2. Só do service role, security definer com search_path vazio.
select ok(
  not has_function_privilege('authenticated', 'public.slack_channel_thread(uuid, text, text, text)', 'execute')
    and not has_function_privilege('anon', 'public.slack_channel_thread(uuid, text, text, text)', 'execute')
    and has_function_privilege('service_role', 'public.slack_channel_thread(uuid, text, text, text)', 'execute'),
  'a leitura do fio é só do service role'
);
select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_proc p
   where p.oid = 'public.slack_channel_thread(uuid, text, text, text)'::regprocedure),
  'a leitura do fio é security definer com search_path vazio'
);

-- O id do Scopus do Norte, lido antes de virar service role (que não lê o schema private direto).
select set_config('teste.scopus_norte', (select a.id::text from private.agents a
  where a.workspace_id = 'ff000000-0000-0000-0000-000000000001' and a.name = 'Scopus'), true);

set local role service_role;

-- 3-5. O dono com o nome de Meu perfil, do cadastro, ou sem nome; e o Agente do fio.
select is(
  (select t.owner_id::text || '|' || t.owner_name || '|' || t.agent_name
   from public.slack_channel_thread('ff000000-0000-0000-0000-000000000001', 'T2NORTE', 'C2GERAL', '1700000000.000100') t),
  '5f000000-0000-0000-0000-000000000001|Ana Souza|Scopus',
  'o fio da Ana: o nome de Meu perfil vence o do cadastro, e o Agente é o Scopus'
);
select is(
  (select t.owner_name || '|' || t.agent_name
   from public.slack_channel_thread('ff000000-0000-0000-0000-000000000001', 'T2NORTE', 'D2DIEGO', '1700000000.000200') t),
  'Diego Lima|Rhetor',
  'sem Meu perfil, o nome do cadastro; o fio do DM também se lê pela chave'
);
select is(
  (select coalesce(t.owner_name, 'sem nome') || '|' || (t.agent_id = current_setting('teste.scopus_norte')::uuid)::text
   from public.slack_channel_thread('ff000000-0000-0000-0000-000000000001', 'T2NORTE', 'C2GERAL', '1700000000.000300') t),
  'sem nome|true',
  'sem nome nenhum, o nome vem nulo e nunca o e-mail'
);

-- 6-8. Nenhuma linha para o thread que não é fio, nem para o fio de outro Workspace.
select is(
  (select count(*)::int from public.slack_channel_thread('ff000000-0000-0000-0000-000000000001', 'T2NORTE', 'C2GERAL', '1700000009.000100')),
  0, 'thread que não é fio: nenhuma linha'
);
select is(
  (select count(*)::int from public.slack_channel_thread('ff000000-0000-0000-0000-000000000001', 'T2SUL', 'C2GERAL', '1700000000.000100')),
  0, 'o fio do Sul não aparece para o Norte'
);
select is(
  (select t.agent_name from public.slack_channel_thread('ff000000-0000-0000-0000-000000000002', 'T2SUL', 'C2GERAL', '1700000000.000100') t),
  'Scopus', 'e o Sul lê o seu'
);
reset role;

-- 9. Continuar o fio é a mesma Conversa, então o Agente recebe o que já foi dito: a Execução seguinte do fio da Ana leva
-- a pergunta e a resposta da anterior no histórico (claim_agent_run, sem mudança).
insert into private.workspace_contracts (workspace_id, tier_id, starts_at)
values ('ff000000-0000-0000-0000-000000000001', 'escala', date_trunc('month', now()));
select public.grant_credits('ff000000-0000-0000-0000-000000000001', 20, 'plano');
insert into private.agent_runs (id, workspace_id, conversation_id, requested_by, client_request_id, request_text, trigger_kind,
                                status, started_at, finished_at)
select 'af000000-0000-0000-0000-000000000001', t.workspace_id, t.conversation_id, t.owner_id, gen_random_uuid(),
  'Quais contas estão quentes?', 'canal', 'succeeded', now() - interval '2 minutes', now() - interval '1 minute'
from private.slack_channel_threads t where t.team_id = 'T2NORTE' and t.channel_id = 'C2GERAL' and t.thread_ts = '1700000000.000100';
insert into private.agent_run_events (run_id, seq, kind, payload)
values ('af000000-0000-0000-0000-000000000001', 1, 'resposta', '{"texto": "A Alfa e a Beta."}');
insert into private.agent_runs (id, workspace_id, conversation_id, requested_by, client_request_id, request_text, trigger_kind)
select 'af000000-0000-0000-0000-000000000002', t.workspace_id, t.conversation_id, t.owner_id, gen_random_uuid(),
  'E a segunda delas?', 'canal'
from private.slack_channel_threads t where t.team_id = 'T2NORTE' and t.channel_id = 'C2GERAL' and t.thread_ts = '1700000000.000100';
select is(
  public.claim_agent_run('af000000-0000-0000-0000-000000000002') -> 'history',
  '[{"request": "Quais contas estão quentes?", "answer": "A Alfa e a Beta."}]'::jsonb,
  'a Execução que continua o fio leva o histórico da Conversa'
);

select * from finish();
rollback;

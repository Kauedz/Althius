begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(22);

-- A Conversa do Slack na Althius (slack-canal 06): as RPCs que listam e abrem Conversas devolvem a origem, e a Conversa
-- do Slack aparece só para o dono, nunca para outro participante do mesmo Workspace nem para outro Workspace. O
-- histórico por Agente e as sugestões do PR-9 continuam.

-- Norte: Ana e Bruno (Membros). Sul: Carla.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('66000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('66000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('66000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@sul.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('f6000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('f6000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('f6000000-0000-0000-0000-000000000001', '66000000-0000-0000-0000-000000000001', 'member', true),
  ('f6000000-0000-0000-0000-000000000001', '66000000-0000-0000-0000-000000000002', 'member', true),
  ('f6000000-0000-0000-0000-000000000002', '66000000-0000-0000-0000-000000000003', 'member', true);

-- A Ana tem uma Conversa coordenada da Althius (sem origem informada, como as antigas) e uma Conversa do Slack com o
-- Scopus. O Bruno tem uma Conversa da Althius.
insert into private.agent_conversations (id, workspace_id, owner_id, kind, agent_id, origin, updated_at)
select 'c6000000-0000-0000-0000-000000000002', 'f6000000-0000-0000-0000-000000000001',
  '66000000-0000-0000-0000-000000000001', 'agente', a.id, 'slack', now()
from private.agents a where a.workspace_id = 'f6000000-0000-0000-0000-000000000001' and a.name = 'Scopus';
insert into private.agent_conversations (id, workspace_id, owner_id, kind, updated_at) values
  ('c6000000-0000-0000-0000-000000000001', 'f6000000-0000-0000-0000-000000000001',
   '66000000-0000-0000-0000-000000000001', 'coordenada', now() - interval '1 hour'),
  ('c6000000-0000-0000-0000-000000000003', 'f6000000-0000-0000-0000-000000000001',
   '66000000-0000-0000-0000-000000000002', 'coordenada', now());
insert into private.agent_runs (workspace_id, conversation_id, requested_by, client_request_id, request_text, status,
                                trigger_kind, finished_at)
values
  ('f6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000002', '66000000-0000-0000-0000-000000000001',
   gen_random_uuid(), 'Quem são as Contas Quentes?', 'queued', 'canal', null),
  ('f6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', '66000000-0000-0000-0000-000000000001',
   gen_random_uuid(), 'Resuma o funil.', 'succeeded', 'conversa', now());

-- 1-3. As permissões e a forma das funções não mudam.
select ok(
  has_function_privilege('authenticated', 'public.list_agent_conversations(uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.list_named_agent_conversations(uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.get_agent_conversation(uuid)', 'execute'),
  'quem está logado lista e abre as próprias Conversas'
);
select ok(
  not has_function_privilege('anon', 'public.list_agent_conversations(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.list_named_agent_conversations(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.get_agent_conversation(uuid)', 'execute'),
  'o visitante anônimo não lista nem abre Conversas'
);
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('list_agent_conversations', 'list_named_agent_conversations', 'get_agent_conversation')
     and p.prosecdef and p.proconfig @> array['search_path=""']),
  3, 'as três funções são security definer com search_path vazio, uma de cada'
);

-- 4-5. O histórico por Agente e as sugestões do PR-9 continuam para quem está logado.
select ok(
  has_function_privilege('authenticated', 'public.list_agent_conversations_of_agent(uuid, uuid, integer, timestamptz)', 'execute')
    and not has_function_privilege('anon', 'public.list_agent_conversations_of_agent(uuid, uuid, integer, timestamptz)', 'execute'),
  'o histórico por Agente continua só para quem está logado'
);
select ok(
  has_function_privilege('authenticated', 'public.agent_prompt_suggestions(uuid, uuid)', 'execute'),
  'as sugestões do Agente continuam'
);

-- O id do Scopus é lido antes de virar o papel da sessão: o papel authenticated não lê o schema private.
select set_config(
  'test.scopus_id',
  (select a.id::text from private.agents a
    where a.workspace_id = 'f6000000-0000-0000-0000-000000000001' and a.name = 'Scopus'),
  true
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- 6-12. A Ana vê as duas, cada uma com a sua origem; a antiga vem como Althius.
select set_config('request.jwt.claim.sub', '66000000-0000-0000-0000-000000000001', true);
select results_eq(
  $$ select id, origin from public.list_agent_conversations('f6000000-0000-0000-0000-000000000001') $$,
  $$ values ('c6000000-0000-0000-0000-000000000002'::uuid, 'slack'::text),
            ('c6000000-0000-0000-0000-000000000001'::uuid, 'althius'::text) $$,
  'a lista das Conversas traz a do Slack e a da Althius, cada uma com a origem'
);
select results_eq(
  $$ select id, origin from public.list_named_agent_conversations('f6000000-0000-0000-0000-000000000001') $$,
  $$ values ('c6000000-0000-0000-0000-000000000002'::uuid, 'slack'::text),
            ('c6000000-0000-0000-0000-000000000001'::uuid, 'althius'::text) $$,
  'a lista nomeada traz a origem também'
);
select is(
  (select first_request from public.list_named_agent_conversations('f6000000-0000-0000-0000-000000000001')
   where id = 'c6000000-0000-0000-0000-000000000002'),
  'Quem são as Contas Quentes?', 'a Conversa do Slack mostra o primeiro pedido feito no thread'
);
select isnt(
  (select open_run_id from public.list_named_agent_conversations('f6000000-0000-0000-0000-000000000001')
   where id = 'c6000000-0000-0000-0000-000000000002'),
  null, 'a Execução do Canal na fila conta como em andamento'
);
select is(
  public.get_agent_conversation('c6000000-0000-0000-0000-000000000002') ->> 'origin', 'slack',
  'abrir a Conversa do Slack devolve a origem'
);
select is(
  public.get_agent_conversation('c6000000-0000-0000-0000-000000000001') ->> 'origin', 'althius',
  'abrir a Conversa da Althius devolve a origem padrão'
);
select is(
  jsonb_array_length(public.get_agent_conversation('c6000000-0000-0000-0000-000000000002') -> 'runs'), 1,
  'a Conversa do Slack traz o pedido com os passos, como qualquer Conversa'
);

-- 13-15. O histórico por Agente devolve a origem e não perde o filtro do PR-9.
select results_eq(
  $$ select id, origin from public.list_agent_conversations_of_agent(
       'f6000000-0000-0000-0000-000000000001',
       current_setting('test.scopus_id')::uuid) $$,
  $$ values ('c6000000-0000-0000-0000-000000000002'::uuid, 'slack'::text) $$,
  'o histórico do Scopus traz só a Conversa do Slack da Ana, com a origem'
);
select is(
  (select named from public.list_agent_conversations_of_agent(
     'f6000000-0000-0000-0000-000000000001',
     current_setting('test.scopus_id')::uuid)
   where id = 'c6000000-0000-0000-0000-000000000002'),
  false, 'sem nome dado, o histórico não trata o título automático como nome'
);
select results_eq(
  $$ select id, origin from public.list_agent_conversations_of_agent('f6000000-0000-0000-0000-000000000001', null) $$,
  $$ values ('c6000000-0000-0000-0000-000000000002'::uuid, 'slack'::text),
            ('c6000000-0000-0000-0000-000000000001'::uuid, 'althius'::text) $$,
  'a lista da Coordenação traz a Conversa do Slack e a da Althius'
);

-- 16-19. O Bruno, no mesmo Workspace, não vê a Conversa do Slack da Ana.
select set_config('request.jwt.claim.sub', '66000000-0000-0000-0000-000000000002', true);
select results_eq(
  $$ select id, origin from public.list_agent_conversations('f6000000-0000-0000-0000-000000000001') $$,
  $$ values ('c6000000-0000-0000-0000-000000000003'::uuid, 'althius'::text) $$,
  'outro participante lista só a Conversa dele'
);
select is(
  (select count(*)::int from public.list_named_agent_conversations('f6000000-0000-0000-0000-000000000001')
   where id = 'c6000000-0000-0000-0000-000000000002'),
  0, 'a lista nomeada do outro participante não traz a Conversa do Slack da Ana'
);
select throws_ok(
  $$ select public.get_agent_conversation('c6000000-0000-0000-0000-000000000002') $$,
  'P0002', 'conversation not found', 'outro participante não abre a Conversa do Slack da Ana'
);
select is(
  (select count(*)::int from public.list_agent_conversations('f6000000-0000-0000-0000-000000000001') where origin = 'slack'),
  0, 'nenhuma Conversa do Slack aparece para quem não mencionou'
);

-- 20-22. A Carla, de outro Workspace, não lista nem abre.
select set_config('request.jwt.claim.sub', '66000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$ select * from public.list_agent_conversations('f6000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'outro Workspace não lista as Conversas do Norte'
);
select throws_ok(
  $$ select * from public.list_named_agent_conversations('f6000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'outro Workspace não lista as Conversas nomeadas do Norte'
);
select throws_ok(
  $$ select public.get_agent_conversation('c6000000-0000-0000-0000-000000000002') $$,
  'P0002', 'conversation not found', 'outro Workspace não abre a Conversa do Slack'
);

select * from finish();
rollback;

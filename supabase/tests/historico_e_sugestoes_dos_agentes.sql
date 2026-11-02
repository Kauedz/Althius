begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(18);
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


-- Norte: Ana e Bruno. Sul: Carla.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('69000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte9.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('69000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte9.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('69000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@sul9.com.br', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('aaaaaaaa-9000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('aaaaaaaa-9000-0000-0000-000000000002', 'empresa', 'Sul');
select pg_temp.semear_agentes_padrao(w.id) from public.workspaces w;

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('aaaaaaaa-9000-0000-0000-000000000001', '69000000-0000-0000-0000-000000000001', 'member', true),
  ('aaaaaaaa-9000-0000-0000-000000000001', '69000000-0000-0000-0000-000000000002', 'member', true),
  ('aaaaaaaa-9000-0000-0000-000000000002', '69000000-0000-0000-0000-000000000003', 'member', true);

select set_config('t.scopus', (select id::text from private.agents
  where workspace_id = 'aaaaaaaa-9000-0000-0000-000000000001' and name = 'Scopus'), true);
select set_config('t.rhetor', (select id::text from private.agents
  where workspace_id = 'aaaaaaaa-9000-0000-0000-000000000001' and name = 'Rhetor'), true);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- A Ana fala duas vezes com o Scopus e uma com a Coordenação; o Bruno, uma com o Scopus.
select set_config('request.jwt.claim.sub', '69000000-0000-0000-0000-000000000001', true);
select set_config('t.s1', (select conversation_id::text from public.start_agent_run('aaaaaaaa-9000-0000-0000-000000000001',
  null, current_setting('t.scopus')::uuid, repeat('Pontue a aderência da Alfa ao ICP ', 4), '{}', 'c9000000-0000-0000-0000-000000000001')), true);
select set_config('t.s2', (select conversation_id::text from public.start_agent_run('aaaaaaaa-9000-0000-0000-000000000001',
  null, current_setting('t.scopus')::uuid, 'Revise o ICP', '{}', 'c9000000-0000-0000-0000-000000000002')), true);
select set_config('t.c1', (select conversation_id::text from public.start_agent_run('aaaaaaaa-9000-0000-0000-000000000001',
  null, null, 'Pedido coordenado', '{}', 'c9000000-0000-0000-0000-000000000003')), true);
select set_config('request.jwt.claim.sub', '69000000-0000-0000-0000-000000000002', true);
select public.start_agent_run('aaaaaaaa-9000-0000-0000-000000000001',
  null, current_setting('t.scopus')::uuid, 'Pedido do Bruno', '{}', 'c9000000-0000-0000-0000-000000000004');

reset role;
update private.agent_conversations set updated_at = now() - interval '3 days' where id = current_setting('t.s1')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '69000000-0000-0000-0000-000000000001', true);

select is(
  (select count(*)::int from public.list_agent_conversations_of_agent('aaaaaaaa-9000-0000-0000-000000000001', current_setting('t.scopus')::uuid)),
  2, 'a Ana vê só as duas Conversas dela com o Scopus');
select is(
  (select id from public.list_agent_conversations_of_agent('aaaaaaaa-9000-0000-0000-000000000001', current_setting('t.scopus')::uuid) limit 1),
  current_setting('t.s2')::uuid, 'a mais recente vem primeiro');
select is(
  (select length(title) from public.list_agent_conversations_of_agent('aaaaaaaa-9000-0000-0000-000000000001', current_setting('t.scopus')::uuid)
   where id = current_setting('t.s1')::uuid),
  60, 'sem nome, o título é o começo do primeiro pedido, com até 60 caracteres');
select is(
  (select named from public.list_agent_conversations_of_agent('aaaaaaaa-9000-0000-0000-000000000001', current_setting('t.scopus')::uuid)
   where id = current_setting('t.s1')::uuid),
  false, 'o título automático não conta como nome dado');
select is(
  (select id from public.list_agent_conversations_of_agent('aaaaaaaa-9000-0000-0000-000000000001', null)),
  current_setting('t.c1')::uuid, 'sem Agente, a lista é a da Coordenação');
select is(
  (select array_agg(id) from public.list_agent_conversations_of_agent('aaaaaaaa-9000-0000-0000-000000000001', current_setting('t.scopus')::uuid, 1)),
  array[current_setting('t.s2')::uuid], 'a página respeita o limite');
select is(
  (select array_agg(id) from public.list_agent_conversations_of_agent('aaaaaaaa-9000-0000-0000-000000000001', current_setting('t.scopus')::uuid, 30,
    (select updated_at from public.list_agent_conversations_of_agent('aaaaaaaa-9000-0000-0000-000000000001', current_setting('t.scopus')::uuid, 1)))),
  array[current_setting('t.s1')::uuid], 'a próxima página traz as anteriores');

-- Renomear vale no título.
select public.rename_agent_conversation(current_setting('t.s2')::uuid, 'ICP revisado');
select is(
  (select title from public.list_agent_conversations_of_agent('aaaaaaaa-9000-0000-0000-000000000001', current_setting('t.scopus')::uuid)
   where id = current_setting('t.s2')::uuid),
  'ICP revisado', 'o nome dado vira o título');

-- Arquivar.
select set_config('request.jwt.claim.sub', '69000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.archive_agent_conversation(current_setting('t.s2')::uuid)$$,
  'P0002', 'conversation not found', 'o Bruno não arquiva a Conversa da Ana');
select set_config('request.jwt.claim.sub', '69000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select * from public.list_agent_conversations_of_agent('aaaaaaaa-9000-0000-0000-000000000001', current_setting('t.scopus')::uuid)$$,
  '42501', null, 'quem não é do Workspace não lista');
select set_config('request.jwt.claim.sub', '69000000-0000-0000-0000-000000000001', true);
select lives_ok($$select public.archive_agent_conversation(current_setting('t.s2')::uuid)$$, 'a Ana arquiva a Conversa dela');
select is(
  (select count(*)::int from public.list_agent_conversations_of_agent('aaaaaaaa-9000-0000-0000-000000000001', current_setting('t.scopus')::uuid)),
  1, 'a arquivada sai do histórico');

-- Sugestões sem dados: genéricas, de 3 a 4.
select ok(
  jsonb_array_length(public.agent_prompt_suggestions('aaaaaaaa-9000-0000-0000-000000000001', current_setting('t.rhetor')::uuid)) between 3 and 4,
  'sem dados, o Rhetor sugere de 3 a 4 pedidos genéricos');
select is(
  (select count(*)::int from jsonb_array_elements(public.agent_prompt_suggestions('aaaaaaaa-9000-0000-0000-000000000001', current_setting('t.scopus')::uuid)) e
   where e ->> 'texto' like '%Alfa%'),
  0, 'sem Sinais, nenhuma Conta aparece');

-- Um Sinal novo invalida o cache e traz a Conta quente.
reset role;
insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, created_by) values
  ('d9000000-0000-4000-8000-000000000001', 'aaaaaaaa-9000-0000-0000-000000000001', 'Alfa', 'https://alfa-pr9.test', 'alfa-pr9.test',
   '69000000-0000-0000-0000-000000000001');
insert into private.signals (workspace_id, target_account_id, signal_type, event_key, phrase, fired_at) values
  ('aaaaaaaa-9000-0000-0000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'vaga_linkedin', 'vaga-pr9',
   'Abriu vaga de Gerente de Logística', now() - interval '1 day');
update private.agent_prompt_suggestion_cache set computed_at = now() - interval '1 minute';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '69000000-0000-0000-0000-000000000001', true);

select is(
  public.agent_prompt_suggestions('aaaaaaaa-9000-0000-0000-000000000001', current_setting('t.scopus')::uuid) -> 0 ->> 'texto',
  'Pontue a aderência da Alfa ao nosso ICP', 'com Sinal novo, a Conta quente vira a primeira sugestão');
select ok(
  (public.agent_prompt_suggestions('aaaaaaaa-9000-0000-0000-000000000001', current_setting('t.rhetor')::uuid) -> 0 ->> 'texto')
    like '%Alfa sobre: Abriu vaga%', 'o Rhetor sugere a abordagem pelo Sinal');
select ok(
  jsonb_array_length(public.agent_prompt_suggestions('aaaaaaaa-9000-0000-0000-000000000001', current_setting('t.scopus')::uuid)) <= 4,
  'nunca mais de 4 sugestões');

reset role;
select is(
  (select count(*)::int from private.agent_prompt_suggestion_cache where workspace_id = 'aaaaaaaa-9000-0000-0000-000000000001'
     and expires_at > now() + interval '5 hours'),
  2, 'o cache guarda por 6 horas, por Agente e pessoa');

select * from finish();
rollback;

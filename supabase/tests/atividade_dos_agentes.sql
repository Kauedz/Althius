begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(9);
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
  ('6a000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte10.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('6a000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte10.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('6a000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@sul10.com.br', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('aaaaaaaa-a000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('aaaaaaaa-a000-0000-0000-000000000002', 'empresa', 'Sul');
select pg_temp.semear_agentes_padrao(w.id) from public.workspaces w;

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('aaaaaaaa-a000-0000-0000-000000000001', '6a000000-0000-0000-0000-000000000001', 'member', true),
  ('aaaaaaaa-a000-0000-0000-000000000001', '6a000000-0000-0000-0000-000000000002', 'member', true),
  ('aaaaaaaa-a000-0000-0000-000000000002', '6a000000-0000-0000-0000-000000000003', 'member', true);

select set_config('t.scopus', (select id::text from private.agents
  where workspace_id = 'aaaaaaaa-a000-0000-0000-000000000001' and name = 'Scopus'), true);
select set_config('t.rhetor', (select id::text from private.agents
  where workspace_id = 'aaaaaaaa-a000-0000-0000-000000000001' and name = 'Rhetor'), true);

-- A Ana tem uma Conversa com o Scopus (aberta pela Conversa e por uma Menção no Slack) e uma com o Rhetor; o Bruno, uma
-- com o Scopus. A Coordenação da Ana não é de um Agente.
insert into private.agent_conversations (id, workspace_id, owner_id, kind, agent_id) values
  ('ca000000-0000-0000-0000-000000000001', 'aaaaaaaa-a000-0000-0000-000000000001', '6a000000-0000-0000-0000-000000000001', 'agente', current_setting('t.scopus')::uuid),
  ('ca000000-0000-0000-0000-000000000002', 'aaaaaaaa-a000-0000-0000-000000000001', '6a000000-0000-0000-0000-000000000001', 'agente', current_setting('t.rhetor')::uuid),
  ('ca000000-0000-0000-0000-000000000003', 'aaaaaaaa-a000-0000-0000-000000000001', '6a000000-0000-0000-0000-000000000002', 'agente', current_setting('t.scopus')::uuid),
  ('ca000000-0000-0000-0000-000000000004', 'aaaaaaaa-a000-0000-0000-000000000001', '6a000000-0000-0000-0000-000000000001', 'coordenada', null);

insert into private.agent_runs (id, workspace_id, conversation_id, requested_by, client_request_id, request_text, status,
                                error_code, trigger_kind, created_at, started_at, finished_at) values
  ('ea000000-0000-0000-0000-000000000001', 'aaaaaaaa-a000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001',
   '6a000000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000001', 'Pontue a Alfa', 'succeeded',
   null, 'conversa', now() - interval '2 hours', now() - interval '2 hours', now() - interval '2 hours'),
  ('ea000000-0000-0000-0000-000000000002', 'aaaaaaaa-a000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001',
   '6a000000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000002', 'Resuma a Alfa no Slack', 'failed',
   'model_error', 'canal', now() - interval '1 hour', now() - interval '1 hour', now() - interval '1 hour'),
  ('ea000000-0000-0000-0000-000000000003', 'aaaaaaaa-a000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000002',
   '6a000000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000003', 'Escreva um e-mail', 'succeeded',
   null, 'conversa', now() - interval '3 hours', now() - interval '3 hours', now() - interval '3 hours'),
  ('ea000000-0000-0000-0000-000000000004', 'aaaaaaaa-a000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000003',
   '6a000000-0000-0000-0000-000000000002', 'da000000-0000-0000-0000-000000000004', 'Pedido do Bruno', 'succeeded',
   null, 'conversa', now() - interval '30 minutes', now() - interval '30 minutes', now() - interval '30 minutes'),
  ('ea000000-0000-0000-0000-000000000005', 'aaaaaaaa-a000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000004',
   '6a000000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000005', 'Pedido coordenado', 'succeeded',
   null, 'conversa', now() - interval '10 minutes', now() - interval '10 minutes', now() - interval '10 minutes');

insert into private.agent_run_events (run_id, seq, kind, payload) values
  ('ea000000-0000-0000-0000-000000000001', 1, 'resposta', '{"texto": "A Alfa tem nota 91."}');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '6a000000-0000-0000-0000-000000000001', true);

select is(
  (select array_agg(id) from public.agent_activity('aaaaaaaa-a000-0000-0000-000000000001', current_setting('t.scopus')::uuid)),
  array['ea000000-0000-0000-0000-000000000002', 'ea000000-0000-0000-0000-000000000001']::uuid[],
  'a Ana vê as Execuções das Conversas dela com o Scopus, a mais recente primeiro, sem as do Bruno');
select is(
  (select trigger_kind from public.agent_activity('aaaaaaaa-a000-0000-0000-000000000001', current_setting('t.scopus')::uuid) limit 1),
  'canal', 'a Execução aberta pelo Slack entra com o gatilho Canal');
select is(
  (select agent_name || ' · ' || result_text from public.agent_activity('aaaaaaaa-a000-0000-0000-000000000001', current_setting('t.scopus')::uuid)
   where id = 'ea000000-0000-0000-0000-000000000001'),
  'Scopus · A Alfa tem nota 91.', 'traz o nome do Agente e o começo da resposta');
select is(
  (select array_agg(id) from public.agent_activity('aaaaaaaa-a000-0000-0000-000000000001', current_setting('t.scopus')::uuid, 'canal')),
  array['ea000000-0000-0000-0000-000000000002']::uuid[], 'filtra pelo gatilho');
select is(
  (select array_agg(id) from public.agent_activity('aaaaaaaa-a000-0000-0000-000000000001')),
  array['ea000000-0000-0000-0000-000000000002', 'ea000000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-000000000003']::uuid[],
  'sem Agente, traz todos os Agentes da Ana e deixa a Coordenação de fora');
select is(
  (select array_agg(id) from public.agent_activity('aaaaaaaa-a000-0000-0000-000000000001', null, null, 1,
    (select created_at from public.agent_activity('aaaaaaaa-a000-0000-0000-000000000001', null, null, 1)))),
  array['ea000000-0000-0000-0000-000000000001']::uuid[], 'pagina pelo limite e pelo momento da última vista');

select set_config('request.jwt.claim.sub', '6a000000-0000-0000-0000-000000000002', true);
select is(
  (select array_agg(id) from public.agent_activity('aaaaaaaa-a000-0000-0000-000000000001', current_setting('t.scopus')::uuid)),
  array['ea000000-0000-0000-0000-000000000004']::uuid[], 'o Bruno vê só a dele');

select set_config('request.jwt.claim.sub', '6a000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select * from public.agent_activity('aaaaaaaa-a000-0000-0000-000000000001')$$,
  '42501', 'active workspace membership required', 'quem não participa do Workspace é recusado');

reset role;
update public.workspace_memberships set active = false
where workspace_id = 'aaaaaaaa-a000-0000-0000-000000000001' and user_id = '6a000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '6a000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select * from public.agent_activity('aaaaaaaa-a000-0000-0000-000000000001')$$,
  '42501', 'active workspace membership required', 'sair do Workspace corta a leitura');

select * from finish();
rollback;

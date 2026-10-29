begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(42);
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


-- O fio do Canal Slack (slack-canal 03): a Execução pelo Canal abre ou continua o fio, com a Conversa `agente` de origem
-- Slack de quem mencionou; o gatilho chama a entrega só para a Execução do Canal em estado final; a entrega é reservada
-- uma vez só.

-- Onde não há Vault nem pg_net (o Postgres puro do pgtap-local.sh), um esqueleto do que a migration usa deles; no Supabase
-- e no CI valem os de verdade. O falso do pg_net grava na mesma fila que o de verdade (net.http_request_queue).
do $esqueleto$
begin
  if to_regnamespace('vault') is null then
    create schema vault;
    create table vault.secrets (
      id uuid primary key default gen_random_uuid(),
      name text unique,
      secret text not null,
      created_at timestamptz not null default now()
    );
    create view vault.decrypted_secrets as select id, name, secret, secret as decrypted_secret from vault.secrets;
    create function vault.create_secret(new_secret text, new_name text default null)
    returns uuid language sql as 'insert into vault.secrets (name, secret) values (new_name, new_secret) returning id';
    create function vault.update_secret(secret_id uuid, new_secret text default null, new_name text default null)
    returns void language sql as 'update vault.secrets set secret = coalesce(new_secret, secret), name = coalesce(new_name, name) where id = secret_id';
  end if;
  if to_regnamespace('net') is null then
    create schema net;
    create table net.http_request_queue (
      id bigserial primary key,
      url text not null,
      headers jsonb,
      body bytea,
      timeout_milliseconds integer
    );
    create function net.http_post(
      url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}',
      timeout_milliseconds integer default 5000
    ) returns bigint language sql as
      'insert into net.http_request_queue (url, headers, body, timeout_milliseconds)
       values (url, headers, convert_to(body::text, ''utf8''), timeout_milliseconds) returning id';
  end if;
end
$esqueleto$;

select vault.create_secret('https://proj.supabase.co/functions/v1/slack-channel-delivery', 'slack_channel_delivery_url');
select vault.create_secret('segredo-interno-da-entrega', 'slack_channel_delivery_secret');

-- Ana (Admin do Norte), Bruno (Participação removida do Norte), Carla (Admin do Sul), Diego (Membro do Norte).
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('5e000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5e000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5e000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@sul.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5e000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'diego@norte.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('fe000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('fe000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
select pg_temp.semear_agentes_padrao(w.id) from public.workspaces w;
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('fe000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000001', 'admin', true),
  ('fe000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000002', 'member', false),
  ('fe000000-0000-0000-0000-000000000002', '5e000000-0000-0000-0000-000000000003', 'admin', true),
  ('fe000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000004', 'member', true);
-- O Norte tem contrato e saldo; o Sul instalou o Canal mas não tem contrato.
insert into private.workspace_contracts (workspace_id, tier_id, starts_at)
values ('fe000000-0000-0000-0000-000000000001', 'escala', date_trunc('month', now()));
select public.grant_credits('fe000000-0000-0000-0000-000000000001', 20, 'plano');

select private.integration_secret_put('slack-channel:fe000000-0000-0000-0000-000000000001', 'xoxb-norte');
select private.integration_secret_put('slack-channel:fe000000-0000-0000-0000-000000000002', 'xoxb-sul');
insert into private.slack_channel_installations (workspace_id, team_id, bot_user_id, state, secret_name, installed_by) values
  ('fe000000-0000-0000-0000-000000000001', 'T1NORTE', 'U1BOTN', 'ativo', 'slack-channel:fe000000-0000-0000-0000-000000000001',
   '5e000000-0000-0000-0000-000000000001'),
  ('fe000000-0000-0000-0000-000000000002', 'T1SUL', 'U1BOTS', 'ativo', 'slack-channel:fe000000-0000-0000-0000-000000000002',
   '5e000000-0000-0000-0000-000000000003');

-- No Norte, o Scopus e o Rhetor atendem no Slack; o Ethos não. No Sul, o Scopus atende.
update private.agent_settings s set channels = array['slack'] from private.agents a
where a.id = s.agent_id and a.workspace_id = 'fe000000-0000-0000-0000-000000000001' and a.name in ('Scopus', 'Rhetor');
update private.agent_settings s set channels = array['slack'] from private.agents a
where a.id = s.agent_id and a.workspace_id = 'fe000000-0000-0000-0000-000000000002' and a.name = 'Scopus';

create temporary table ids (chave text primary key, valor uuid) on commit drop;
grant all on ids to service_role;
create function pg_temp.i(p_chave text) returns uuid language sql as $f$ select valor from pg_temp.ids where chave = p_chave $f$;
insert into ids select lower(a.name), a.id from private.agents a
where a.workspace_id = 'fe000000-0000-0000-0000-000000000001' and a.name in ('Scopus', 'Rhetor', 'Ethos');
insert into ids select 'scopus_sul', a.id from private.agents a
where a.workspace_id = 'fe000000-0000-0000-0000-000000000002' and a.name = 'Scopus';

-- Uma Conversa da Althius do Norte, para provar a origem padrão e que a Execução de Conversa não chama a entrega.
insert into private.agent_conversations (id, workspace_id, owner_id, kind) values
  ('ce000000-0000-0000-0000-000000000001', 'fe000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000001', 'coordenada');
insert into private.agent_runs (id, workspace_id, conversation_id, requested_by, client_request_id, request_text, status, started_at)
values ('ae000000-0000-0000-0000-000000000001', 'fe000000-0000-0000-0000-000000000001', 'ce000000-0000-0000-0000-000000000001',
        '5e000000-0000-0000-0000-000000000001', gen_random_uuid(), 'Resuma o funil.', 'running', now());

-- Abre o fio pela RPC (como a função de eventos) e devolve a Execução.
create function pg_temp.abrir(
  p_ws uuid, p_user uuid, p_agent uuid, p_team text, p_canal text, p_ts text, p_texto text, p_evento text
) returns uuid language sql as $f$
  select r.run_id from public.start_slack_channel_run(p_ws, p_user, p_agent, p_team, p_canal, p_ts, p_texto, p_evento) r
$f$;
grant execute on function pg_temp.abrir(uuid, uuid, uuid, text, text, text, text, text) to service_role;
-- Os pedidos de entrega que o gatilho pôs na fila do pg_net para uma Execução.
create function pg_temp.entregas(p_run uuid) returns integer language sql as $f$
  select count(*)::integer from net.http_request_queue q where convert_from(q.body, 'utf8') like '%' || p_run::text || '%'
$f$;

-- 1-4. Nada disto é do navegador.
select ok(
  not has_table_privilege('authenticated', 'private.slack_channel_threads', 'select')
    and not has_table_privilege('service_role', 'private.slack_channel_threads', 'select')
    and (select c.relrowsecurity from pg_class c where c.oid = 'private.slack_channel_threads'::regclass),
  'o fio tem RLS explícito e nenhum acesso direto'
);
select ok(
  not has_function_privilege('authenticated', 'public.start_slack_channel_run(uuid, uuid, uuid, text, text, text, text, text)', 'execute')
    and not has_function_privilege('anon', 'public.start_slack_channel_run(uuid, uuid, uuid, text, text, text, text, text)', 'execute')
    and has_function_privilege('service_role', 'public.start_slack_channel_run(uuid, uuid, uuid, text, text, text, text, text)', 'execute'),
  'a Execução pelo Canal é só do service role'
);
select ok(
  not has_function_privilege('authenticated', 'public.claim_slack_channel_delivery(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.claim_slack_channel_delivery(uuid)', 'execute')
    and has_function_privilege('service_role', 'public.claim_slack_channel_delivery(uuid)', 'execute'),
  'a reserva da entrega é só do service role'
);
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('start_slack_channel_run', 'claim_slack_channel_delivery')
     and p.prosecdef and p.proconfig @> array['search_path=""']),
  2, 'as funções do fio são security definer com search_path vazio'
);

-- 5. A Conversa que já existia é da Althius.
select is((select origin from private.agent_conversations where id = 'ce000000-0000-0000-0000-000000000001'), 'althius',
  'a origem padrão da Conversa é a Althius');

set local role service_role;

-- 6-11. Ana menciona o Scopus solta no canal: o fio nasce no ts dela, com a Conversa dela.
insert into ids values ('run1', pg_temp.abrir('fe000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000001',
  pg_temp.i('scopus'), 'T1NORTE', 'C1GERAL', '1700000000.000100', '  @Scopus quem são as contas quentes?  ', 'Ev000001'));
reset role;
select is(
  (select r.status || '|' || r.trigger_kind || '|' || r.request_text || '|' || cardinality(r.mentions)
   from private.agent_runs r where r.id = pg_temp.i('run1')),
  'queued|canal|@Scopus quem são as contas quentes?|0',
  'a Execução entra na fila com o gatilho Canal, o texto e nenhuma Menção'
);
select is(
  (select c.kind || '|' || c.owner_id || '|' || c.agent_id || '|' || c.origin
   from private.agent_runs r join private.agent_conversations c on c.id = r.conversation_id where r.id = pg_temp.i('run1')),
  'agente|5e000000-0000-0000-0000-000000000001|' || pg_temp.i('scopus') || '|slack',
  'a Conversa é direta com o Agente, de quem mencionou, com origem Slack'
);
select is(
  (select t.workspace_id || '|' || t.owner_id || '|' || t.agent_id from private.slack_channel_threads t
   join private.agent_runs r on r.conversation_id = t.conversation_id
   where r.id = pg_temp.i('run1') and t.team_id = 'T1NORTE' and t.channel_id = 'C1GERAL' and t.thread_ts = '1700000000.000100'),
  'fe000000-0000-0000-0000-000000000001|5e000000-0000-0000-0000-000000000001|' || pg_temp.i('scopus'),
  'o fio é gravado pela chave team_id, canal e thread_ts, apontando para dono e Agente'
);
set local role service_role;
select is(
  pg_temp.abrir('fe000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000001',
    pg_temp.i('scopus'), 'T1NORTE', 'C1GERAL', '1700000000.000100', '@Scopus quem são as contas quentes?', 'Ev000001'),
  pg_temp.i('run1'), 'o mesmo event_id devolve a mesma Execução'
);
reset role;
select is((select count(*)::int from private.agent_runs where trigger_kind = 'canal'), 1, 'e não cria outra');
select is((select count(*)::int from private.agent_conversations where origin = 'slack'), 1, 'nem outra Conversa');

-- 12-20. As recusas, sem criar Execução.
set local role service_role;
select throws_ok(
  $$select pg_temp.abrir('fe000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000001',
    pg_temp.i('scopus'), 'T1NORTE', 'C1GERAL', '1700000000.000100', 'e a Alfa?', 'Ev000002')$$,
  '55006', 'conversation busy', 'com uma Execução aberta no fio, "ocupado"'
);
select throws_ok(
  $$select pg_temp.abrir('fe000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000002',
    pg_temp.i('scopus'), 'T1NORTE', 'C1GERAL', '1700000000.000900', '@Scopus oi', 'Ev000003')$$,
  '42501', 'active workspace membership required', 'sem Participação ativa, recusa'
);
select throws_ok(
  $$select pg_temp.abrir('fe000000-0000-0000-0000-000000000002', '5e000000-0000-0000-0000-000000000003',
    pg_temp.i('scopus_sul'), 'T1SUL', 'C1SUL', '1700000000.000100', '@Scopus oi', 'Ev000004')$$,
  'P0001', 'active contract required', 'sem contrato ativo, recusa'
);
select throws_ok(
  $$select pg_temp.abrir('fe000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000001',
    pg_temp.i('ethos'), 'T1NORTE', 'C1GERAL', '1700000000.000900', '@Ethos oi', 'Ev000005')$$,
  '22023', 'agent does not answer in slack', 'Agente fora da lista de canais, recusa'
);
select throws_ok(
  $$select pg_temp.abrir('fe000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000001',
    pg_temp.i('scopus_sul'), 'T1NORTE', 'C1GERAL', '1700000000.000900', '@Scopus oi', 'Ev000006')$$,
  '22023', 'agent does not answer in slack', 'o Agente de outro Workspace não serve'
);
select throws_ok(
  $$select pg_temp.abrir('fe000000-0000-0000-0000-000000000002', '5e000000-0000-0000-0000-000000000003',
    pg_temp.i('scopus_sul'), 'T1NORTE', 'C1GERAL', '1700000000.000900', '@Scopus oi', 'Ev000007')$$,
  '55000', 'slack channel is not installed', 'o workspace Slack de outro Workspace não serve'
);
select throws_ok(
  $$select pg_temp.abrir('fe000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000004',
    pg_temp.i('scopus'), 'T1NORTE', 'C1GERAL', '1700000000.000100', 'posso entrar?', 'Ev000008')$$,
  '42501', 'thread belongs to another person', 'o fio de outra pessoa é recusado'
);
select throws_ok(
  $$select pg_temp.abrir('fe000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000001',
    pg_temp.i('rhetor'), 'T1NORTE', 'C1GERAL', '1700000000.000100', '@Rhetor escreva', 'Ev000009')$$,
  '22023', 'thread belongs to another agent', 'outro Agente no fio é recusado'
);
reset role;
select is((select count(*)::int from private.agent_runs where trigger_kind = 'canal'), 1, 'nenhuma recusa cria Execução');

-- 21-23. O motor reserva como qualquer Execução: diz o gatilho e cobra pela mesma regra da Conversa.
set local role service_role;
select is((public.claim_agent_run(pg_temp.i('run1')) ->> 'trigger_kind'), 'canal', 'a reserva diz o gatilho Canal');
reset role;
select is(
  (select status || '|' || quantity from private.credit_reservations where action_key = 'run:' || pg_temp.i('run1')::text),
  'reserved|1', 'a Execução do Canal reserva os Créditos da rodada como a Conversa'
);
select is(pg_temp.entregas(pg_temp.i('run1')), 0, 'reservar (na fila → rodando) não chama a entrega');

-- 24-27. Termina bem: o gatilho chama a entrega uma vez, com o segredo interno.
set local role service_role;
select public.append_agent_run_event(pg_temp.i('run1'), 'texto', pg_temp.i('scopus'), '{"texto": "A Alfa e a Beta."}');
select public.finish_agent_run(pg_temp.i('run1'), 'succeeded', null, 'hermes');
reset role;
select is(pg_temp.entregas(pg_temp.i('run1')), 1, 'a Execução do Canal terminada chama a entrega');
select is(
  (select q.url || '|' || (q.headers ->> 'x-slack-delivery-secret') from net.http_request_queue q
   where convert_from(q.body, 'utf8') like '%' || pg_temp.i('run1')::text || '%'),
  'https://proj.supabase.co/functions/v1/slack-channel-delivery|segredo-interno-da-entrega',
  'no endereço do Vault, com o segredo interno'
);
set local role service_role;
select public.finish_agent_run('ae000000-0000-0000-0000-000000000001', 'failed', 'model_error', 'hermes');
reset role;
select is(pg_temp.entregas('ae000000-0000-0000-0000-000000000001'), 0, 'a Execução de Conversa não chama a entrega');
select is(
  (select convert_from(q.body, 'utf8')::jsonb from net.http_request_queue q
   where convert_from(q.body, 'utf8') like '%' || pg_temp.i('run1')::text || '%'),
  jsonb_build_object('run_id', pg_temp.i('run1')), 'o pedido leva só o id da Execução'
);

-- 28-32. A entrega é reservada uma vez só e traz a resposta, o fio e o token.
set local role service_role;
select is(
  (select d.status || '|' || coalesce(d.error_code, '-') || '|' || d.answer || '|' || d.team_id || '|' || d.channel_id || '|'
     || d.thread_ts || '|' || d.bot_token
   from public.claim_slack_channel_delivery(pg_temp.i('run1')) d),
  'succeeded|-|A Alfa e a Beta.|T1NORTE|C1GERAL|1700000000.000100|xoxb-norte',
  'a entrega traz a resposta final, o fio e o token do bot'
);
select is((select count(*)::int from public.claim_slack_channel_delivery(pg_temp.i('run1'))), 0, 'a segunda vez não traz nada');
select is((select count(*)::int from public.claim_slack_channel_delivery('ae000000-0000-0000-0000-000000000001')), 0,
  'a Execução de Conversa não tem entrega');
reset role;
select isnt((select channel_delivered_at from private.agent_runs where id = pg_temp.i('run1')), null, 'a Execução fica marcada como entregue');
select throws_ok(
  $$update private.agent_runs set channel_delivered_at = now() where id = 'ae000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'só a Execução do Canal tem a marca de entregue'
);

-- 33-36. No mesmo fio, a mesma pessoa continua com o mesmo Agente: a mesma Conversa, outra Execução. Ainda na fila, a
-- entrega não é reservada.
set local role service_role;
insert into ids values ('run2', pg_temp.abrir('fe000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000001',
  pg_temp.i('scopus'), 'T1NORTE', 'C1GERAL', '1700000000.000100', 'e a Gama?', 'Ev000010'));
select is((select count(*)::int from public.claim_slack_channel_delivery(pg_temp.i('run2'))), 0, 'a Execução na fila não é entregue');
reset role;
select is(
  (select count(distinct conversation_id)::int from private.agent_runs where id in (pg_temp.i('run1'), pg_temp.i('run2'))),
  1, 'continuar o fio é a mesma Conversa'
);
select is((select count(*)::int from private.slack_channel_threads), 1, 'e o mesmo fio');

-- No DM, cada mensagem solta abre um fio próprio, no ts dela, mesmo com o mesmo Agente.
set local role service_role;
insert into ids values ('dm1', pg_temp.abrir('fe000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000001',
  pg_temp.i('rhetor'), 'T1NORTE', 'D1ANA', '1700000001.000100', '@Rhetor um e-mail', 'Ev000011'));
insert into ids values ('dm2', pg_temp.abrir('fe000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000001',
  pg_temp.i('scopus'), 'T1NORTE', 'D1ANA', '1700000002.000100', '@Scopus outra coisa', 'Ev000012'));
reset role;
select is(
  (select count(distinct conversation_id)::int from private.agent_runs where id in (pg_temp.i('dm1'), pg_temp.i('dm2'))),
  2, 'no DM, outra mensagem solta abre outro fio'
);

-- 37-39. Prazo vencido também é estado final: chama a entrega. Com o Canal retirado, a entrega sai sem token (só marca).
update private.agent_runs set created_at = now() - interval '1 hour' where id = pg_temp.i('dm1');
select ok(private.expire_run_if_stale(pg_temp.i('dm1')), 'a Execução do DM passou do prazo');
select is(pg_temp.entregas(pg_temp.i('dm1')), 1, 'a Execução vencida por prazo chama a entrega');
update private.slack_channel_installations set state = 'retirado', withdrawn_at = now(), withdrawn_reason = 'administrador'
where workspace_id = 'fe000000-0000-0000-0000-000000000001';
set local role service_role;
select is(
  (select d.status || '|' || d.error_code || '|' || coalesce(d.answer, '-') || '|' || d.thread_ts || '|' || coalesce(d.bot_token, 'sem token')
   from public.claim_slack_channel_delivery(pg_temp.i('dm1')) d),
  'failed|timeout|-|1700000001.000100|sem token',
  'com o Canal retirado, a entrega vem sem token, e a falha com o motivo'
);

-- 40-42. Retirado, o Canal não abre fio; e nada do que já existe some.
select throws_ok(
  $$select pg_temp.abrir('fe000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000001',
    pg_temp.i('scopus'), 'T1NORTE', 'C1GERAL', '1700000003.000100', '@Scopus oi', 'Ev000013')$$,
  '55000', 'slack channel is not installed', 'Canal retirado não abre fio'
);
reset role;
select is((select count(*)::int from private.agent_runs where trigger_kind = 'canal'), 4, 'as Execuções do Canal ficam');
select is((select count(*)::int from private.slack_channel_threads), 3, 'e os fios também');

select * from finish();
rollback;

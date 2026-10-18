begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(27);

-- O limite de uso do Canal Slack (slack-canal 08) e a entrega confirmada depois do post (slack-canal 09).

-- Onde não há Vault nem pg_net (o Postgres puro do pgtap-local.sh), um esqueleto do que as migrations usam deles; no
-- Supabase e no CI valem os de verdade. O falso do pg_net grava na mesma fila que o de verdade (net.http_request_queue).
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

-- Ana (Admin do Norte) e Diego (Membro do Norte). O Norte tem contrato, saldo, o Canal instalado e o HubSpot ligado.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('5d000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5d000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'diego@norte.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values ('fd000000-0000-0000-0000-000000000001', 'empresa', 'Norte');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('fd000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000001', 'admin', true),
  ('fd000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000002', 'member', true);
insert into private.workspace_contracts (workspace_id, tier_id, starts_at)
values ('fd000000-0000-0000-0000-000000000001', 'escala', date_trunc('month', now()));
select public.grant_credits('fd000000-0000-0000-0000-000000000001', 500, 'plano');
select private.integration_secret_put('slack-channel:fd000000-0000-0000-0000-000000000001', 'xoxb-norte');
insert into private.slack_channel_installations (workspace_id, team_id, bot_user_id, state, secret_name, installed_by) values
  ('fd000000-0000-0000-0000-000000000001', 'T1NORTE', 'U1BOTN', 'ativo', 'slack-channel:fd000000-0000-0000-0000-000000000001',
   '5d000000-0000-0000-0000-000000000001');
insert into public.workspace_integrations (workspace_id, integration_id, enabled_by) values
  ('fd000000-0000-0000-0000-000000000001', 'hubspot', '5d000000-0000-0000-0000-000000000001');

create temporary table ids (chave text primary key, valor uuid) on commit drop;
grant all on ids to service_role;
create function pg_temp.i(p_chave text) returns uuid language sql as $f$ select valor from pg_temp.ids where chave = p_chave $f$;
insert into ids select 'scopus', a.id from private.agents a
where a.workspace_id = 'fd000000-0000-0000-0000-000000000001' and a.name = 'Scopus';
-- O Scopus atende no Slack e propõe no HubSpot.
update private.agent_settings set channels = array['slack'] where agent_id = pg_temp.i('scopus');
insert into private.agent_permissions (agent_id, workspace_id, integration_id, permission)
values (pg_temp.i('scopus'), 'fd000000-0000-0000-0000-000000000001', 'hubspot', 'propor')
on conflict (agent_id, integration_id) do update set permission = excluded.permission;

-- Uma Execução de Conversa parada além do prazo: o relógio do Canal não é dela.
insert into private.agent_conversations (id, workspace_id, owner_id, kind) values
  ('cd000000-0000-0000-0000-000000000001', 'fd000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000001', 'coordenada');
insert into private.agent_runs (id, workspace_id, conversation_id, requested_by, client_request_id, request_text, status, started_at, created_at)
values ('ad000000-0000-0000-0000-000000000001', 'fd000000-0000-0000-0000-000000000001', 'cd000000-0000-0000-0000-000000000001',
        '5d000000-0000-0000-0000-000000000001', gen_random_uuid(), 'Resuma o funil.', 'running', now() - interval '1 hour',
        now() - interval '1 hour');

create function pg_temp.abrir(p_user uuid, p_ts text, p_texto text, p_evento text) returns uuid language sql as $f$
  select r.run_id from public.start_slack_channel_run('fd000000-0000-0000-0000-000000000001', p_user, pg_temp.i('scopus'),
    'T1NORTE', 'C1GERAL', p_ts, p_texto, p_evento) r
$f$;
grant execute on function pg_temp.abrir(uuid, text, text, text) to service_role;
create function pg_temp.propor(p_run uuid, p_acao text) returns text language sql as $f$
  select p.outcome from public.propose_agent_action(p_run, pg_temp.i('scopus'), 'hubspot', p_acao, '{"name": "Alfa"}',
    'Uma empresa nova no CRM', 'A Alfa teve um Sinal de expansão') p
$f$;
grant execute on function pg_temp.propor(uuid, text) to service_role;
create function pg_temp.entregas(p_run uuid) returns integer language sql as $f$
  select count(*)::integer from net.http_request_queue q where convert_from(q.body, 'utf8') like '%' || p_run::text || '%'
$f$;
create function pg_temp.entrar_como(p uuid) returns void language sql as $f$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true)
$f$;
-- O relógio está agendado onde o pg_cron existe (no Supabase e no CI).
create function pg_temp.relogio_agendado() returns boolean language plpgsql as $f$
declare
  v boolean;
begin
  if to_regclass('cron.job') is null then
    return not exists (select 1 from pg_available_extensions where name = 'pg_cron');
  end if;
  execute $q$select exists (select 1 from cron.job where jobname = 'althius-slack-channel-delivery-retry'
    and command = 'select private.retry_slack_channel_deliveries()')$q$ into v;
  return v;
end
$f$;


-- 1-3. As RPCs novas são só do service role; o relógio de nova tentativa é só do banco e está agendado.
select ok(
  not has_function_privilege('authenticated', 'public.slack_channel_usage_limit(uuid, uuid)', 'execute')
    and not has_function_privilege('anon', 'public.slack_channel_usage_limit(uuid, uuid)', 'execute')
    and has_function_privilege('service_role', 'public.slack_channel_usage_limit(uuid, uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.confirm_slack_channel_delivery(uuid)', 'execute')
    and has_function_privilege('service_role', 'public.confirm_slack_channel_delivery(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.fail_slack_channel_delivery(uuid, text, boolean)', 'execute')
    and has_function_privilege('service_role', 'public.fail_slack_channel_delivery(uuid, text, boolean)', 'execute'),
  'o limite, a confirmação e a falha da entrega são só do service role'
);
select ok(
  not has_function_privilege('service_role', 'private.retry_slack_channel_deliveries()', 'execute')
    and not has_function_privilege('authenticated', 'private.retry_slack_channel_deliveries()', 'execute'),
  'o relógio de nova tentativa não é chamado de fora'
);
select ok(pg_temp.relogio_agendado(), 'o relógio de nova tentativa da entrega está agendado');

-- 4-9. O limite de uso (slack-canal 08). Os padrões ficam na instalação e são ajustáveis por Workspace.
select is(
  (select i.person_limit || '|' || i.person_window || '|' || i.workspace_limit || '|' || i.workspace_window
   from private.slack_channel_installations i where i.workspace_id = 'fd000000-0000-0000-0000-000000000001'),
  '20|00:10:00|200|01:00:00', 'os padrões: 20 por pessoa em 10 minutos, 200 por Workspace em 1 hora'
);
update private.slack_channel_installations set person_limit = 2, workspace_limit = 3
where workspace_id = 'fd000000-0000-0000-0000-000000000001';
set local role service_role;
insert into ids values ('l1', pg_temp.abrir('5d000000-0000-0000-0000-000000000001', '1700000100.000100', '@Scopus a', 'EvL1'));
select is(public.slack_channel_usage_limit('fd000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000001'),
  'ok', 'abaixo do limite: ok');
insert into ids values ('l2', pg_temp.abrir('5d000000-0000-0000-0000-000000000001', '1700000101.000100', '@Scopus b', 'EvL2'));
select is(public.slack_channel_usage_limit('fd000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000001'),
  'pessoa', 'a Ana chegou ao limite dela');
select is(public.slack_channel_usage_limit('fd000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000002'),
  'ok', 'o limite da Ana não é o do Diego');
insert into ids values ('l3', pg_temp.abrir('5d000000-0000-0000-0000-000000000002', '1700000102.000100', '@Scopus c', 'EvL3'));
select is(public.slack_channel_usage_limit('fd000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000002'),
  'workspace', 'o Workspace chegou ao limite dele');
select is(public.slack_channel_usage_limit('fd000000-0000-0000-0000-000000000002', '5d000000-0000-0000-0000-000000000002'),
  'ok', 'outro Workspace não conta os pedidos deste');
reset role;
update private.agent_runs set created_at = now() - interval '2 hours'
where id in (pg_temp.i('l1'), pg_temp.i('l2'), pg_temp.i('l3'));
select is(public.slack_channel_usage_limit('fd000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000001'),
  'ok', 'fora da janela, os pedidos não contam');
update private.slack_channel_installations set person_limit = 20, workspace_limit = 200
where workspace_id = 'fd000000-0000-0000-0000-000000000001';

-- 10-18. A entrega confirmada (slack-canal 09): reservar, postar, confirmar; a falha solta a reserva.
set local role service_role;
insert into ids values ('e1', pg_temp.abrir('5d000000-0000-0000-0000-000000000001', '1700000200.000100', '@Scopus e1', 'EvE1'));
select public.claim_agent_run(pg_temp.i('e1'));
select public.append_agent_run_event(pg_temp.i('e1'), 'texto', pg_temp.i('scopus'), '{"texto": "Resposta e1."}');
select public.finish_agent_run(pg_temp.i('e1'), 'succeeded', null, 'hermes');
select is((select d.answer from public.claim_slack_channel_delivery(pg_temp.i('e1')) d), 'Resposta e1.', 'a reserva traz a resposta');
reset role;
select is(
  (select (channel_posted_at is null) || '|' || channel_delivery_attempts from private.agent_runs where id = pg_temp.i('e1')),
  'true|1', 'reservada não é postada: uma tentativa, sem confirmação'
);
set local role service_role;
select is((select count(*)::int from public.claim_slack_channel_delivery(pg_temp.i('e1'))), 0,
  'enquanto a reserva vale, ninguém mais reserva');
select is(public.fail_slack_channel_delivery(pg_temp.i('e1'), 'indisponivel:429'), 'nova_tentativa',
  'a falha do Slack solta a reserva para nova tentativa');
select is((select count(*)::int from public.claim_slack_channel_delivery(pg_temp.i('e1'))), 1, 'e a entrega pode ser reservada de novo');
select ok(public.confirm_slack_channel_delivery(pg_temp.i('e1')), 'o Slack aceitou: confirma');
select is((select count(*)::int from public.claim_slack_channel_delivery(pg_temp.i('e1'))), 0, 'confirmada, nunca mais é reservada');
select is(public.fail_slack_channel_delivery(pg_temp.i('e1'), 'x'), 'nada', 'confirmada, a falha não muda nada');
reset role;
select is(
  (select (channel_posted_at is not null) || '|' || channel_delivery_attempts from private.agent_runs where id = pg_temp.i('e1')),
  'true|2', 'postada na segunda tentativa'
);

-- 19-21. Desistir: na 5ª tentativa, ou numa recusa definitiva do Slack.
set local role service_role;
insert into ids values ('e2', pg_temp.abrir('5d000000-0000-0000-0000-000000000001', '1700000201.000100', '@Scopus e2', 'EvE2'));
select public.claim_agent_run(pg_temp.i('e2'));
select public.finish_agent_run(pg_temp.i('e2'), 'failed', 'model_error', 'hermes');
select count(*) from public.claim_slack_channel_delivery(pg_temp.i('e2'));
reset role;
update private.agent_runs set channel_delivery_attempts = 5 where id = pg_temp.i('e2');
set local role service_role;
select is(public.fail_slack_channel_delivery(pg_temp.i('e2'), 'indisponivel:503'), 'desistiu', 'na 5ª tentativa, desiste');
insert into ids values ('e3', pg_temp.abrir('5d000000-0000-0000-0000-000000000001', '1700000202.000100', '@Scopus e3', 'EvE3'));
select public.claim_agent_run(pg_temp.i('e3'));
select public.finish_agent_run(pg_temp.i('e3'), 'failed', 'model_error', 'hermes');
select count(*) from public.claim_slack_channel_delivery(pg_temp.i('e3'));
select is(public.fail_slack_channel_delivery(pg_temp.i('e3'), 'recusado:channel_not_found', true), 'desistiu',
  'a recusa definitiva desiste na primeira');
select is((select count(*)::int from public.claim_slack_channel_delivery(pg_temp.i('e3'))), 0, 'desistida, nunca mais é reservada');
reset role;

-- 22-24. O relógio pede de novo a entrega pendente (inclusive a que o pg_net perdeu), e não a confirmada nem a desistida.
set local role service_role;
insert into ids values ('e4', pg_temp.abrir('5d000000-0000-0000-0000-000000000001', '1700000203.000100', '@Scopus e4', 'EvE4'));
select public.claim_agent_run(pg_temp.i('e4'));
select public.append_agent_run_event(pg_temp.i('e4'), 'texto', pg_temp.i('scopus'), '{"texto": "Resposta e4."}');
select public.finish_agent_run(pg_temp.i('e4'), 'succeeded', null, 'hermes');
reset role;
update private.agent_runs
set created_at = now() - interval '7 minutes', started_at = now() - interval '6 minutes',
  finished_at = now() - interval '5 minutes'
where id in (pg_temp.i('e1'), pg_temp.i('e3'), pg_temp.i('e4'));
create temporary table antes on commit drop as
  select k.chave, pg_temp.entregas(k.valor) as n from ids k where k.chave in ('e1', 'e3', 'e4');
select ok(private.retry_slack_channel_deliveries() >= 1, 'o relógio pede ao menos uma entrega');
select is(pg_temp.entregas(pg_temp.i('e4')) - (select n from antes where chave = 'e4'), 1, 'a pendente é pedida de novo');
select is(
  pg_temp.entregas(pg_temp.i('e1')) - (select n from antes where chave = 'e1')
    + pg_temp.entregas(pg_temp.i('e3')) - (select n from antes where chave = 'e3'),
  0, 'a confirmada e a desistida não são pedidas'
);

-- 25-26. Canal retirado: a reserva vem sem token e já marca a desistência com o motivo.
update private.slack_channel_installations set state = 'retirado', withdrawn_at = now()
where workspace_id = 'fd000000-0000-0000-0000-000000000001';
set local role service_role;
select is((select count(*)::int from public.claim_slack_channel_delivery(pg_temp.i('e4')) d where d.bot_token is null), 1,
  'com o Canal retirado, a reserva vem sem token');
reset role;
select is((select channel_delivery_error from private.agent_runs where id = pg_temp.i('e4')), 'canal_retirado',
  'e a entrega fica marcada como desistida, sem postar');

select * from finish();
rollback;

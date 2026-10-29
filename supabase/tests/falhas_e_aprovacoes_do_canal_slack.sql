begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(20);
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


-- Falhas e Aprovações no thread do Canal Slack (slack-canal 05): a Aprovação pedida pela Execução do Canal fica na fila
-- com o gatilho Canal e a entrega traz a ação dela; a falha chega à entrega com o motivo; o relógio vence as Execuções do
-- Canal paradas além do prazo, e a falha por prazo chama a entrega sem ninguém escrever de novo.

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
select pg_temp.semear_agentes_padrao(w.id) from public.workspaces w;
insert into private.workspace_contracts (workspace_id, tier_id, starts_at)
values ('fd000000-0000-0000-0000-000000000001', 'escala', date_trunc('month', now()));
select public.grant_credits('fd000000-0000-0000-0000-000000000001', 20, 'plano');
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
  execute $q$select exists (select 1 from cron.job where jobname = 'althius-slack-channel-expiry'
    and command = 'select private.expire_stale_slack_channel_runs()')$q$ into v;
  return v;
end
$f$;

-- 1-3. A reserva da entrega continua só do service role; o relógio é só do banco.
select ok(
  not has_function_privilege('authenticated', 'public.claim_slack_channel_delivery(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.claim_slack_channel_delivery(uuid)', 'execute')
    and has_function_privilege('service_role', 'public.claim_slack_channel_delivery(uuid)', 'execute'),
  'a reserva da entrega é só do service role'
);
select ok(
  not has_function_privilege('authenticated', 'private.expire_stale_slack_channel_runs()', 'execute')
    and not has_function_privilege('service_role', 'private.expire_stale_slack_channel_runs()', 'execute'),
  'o relógio do prazo não é chamado de fora'
);
select ok(pg_temp.relogio_agendado(), 'o relógio do prazo do Canal está agendado');

-- 4-8. O Diego pede ao Scopus uma ação no HubSpot: com a Permissão Propor, a Aprovação nasce pendente, na fila da
-- Althius, e guarda o gatilho Canal pela Execução que a propôs.
set local role service_role;
insert into ids values ('run1', pg_temp.abrir('5d000000-0000-0000-0000-000000000002', '1700000000.000100',
  '@Scopus crie a Alfa no HubSpot', 'Ev000001'));
select isnt(public.claim_agent_run(pg_temp.i('run1')), null, 'o motor reserva a Execução do Canal');
select is(pg_temp.propor(pg_temp.i('run1'), 'Criar a empresa Alfa no HubSpot'), 'pendente', 'com a Permissão Propor, nasce pendente');
reset role;
select is(
  (select r.trigger_kind from private.approvals a join private.agent_runs r on r.id = a.run_id where a.run_id = pg_temp.i('run1')),
  'canal', 'a Aprovação guarda o gatilho Canal da Execução que a propôs'
);
select is(
  (select a.requested_by from private.approvals a where a.run_id = pg_temp.i('run1')),
  '5d000000-0000-0000-0000-000000000002'::uuid, 'e quem pediu é quem mencionou no Slack'
);
select pg_temp.entrar_como('5d000000-0000-0000-0000-000000000001');
set local role authenticated;
select is(
  (select l.action || '|' || l.state from public.list_approvals('fd000000-0000-0000-0000-000000000001') l),
  'Criar a empresa Alfa no HubSpot|pendente', 'a Aprovação aguarda na fila da Althius'
);
reset role;
-- 8b. A mesma Aprovação, vista pela fila (list_approvals), chega à Execução do Canal pelo run_id: o gatilho Canal.
select is(
  (select string_agg(r.trigger_kind, ',') from public.list_approvals('fd000000-0000-0000-0000-000000000001') l
     join private.approvals a on a.id = l.id join private.agent_runs r on r.id = a.run_id),
  'canal', 'a Aprovação da fila chega ao gatilho Canal pelo run_id'
);

-- 9-11. Com a Permissão Executar, a ação nasce liberada e não aguarda na fila. A Execução termina bem e a entrega traz a
-- resposta e só a ação pendente, uma vez só.
update private.agent_permissions set permission = 'executar' where agent_id = pg_temp.i('scopus') and integration_id = 'hubspot';
set local role service_role;
select is(pg_temp.propor(pg_temp.i('run1'), 'Atualizar o domínio da Alfa'), 'liberada', 'com Executar, nasce liberada');
select public.append_agent_run_event(pg_temp.i('run1'), 'texto', pg_temp.i('scopus'), '{"texto": "Propus criar a Alfa."}');
select public.finish_agent_run(pg_temp.i('run1'), 'succeeded', null, 'hermes');
select is(
  (select d.status || '|' || d.answer || '|' || d.thread_ts || '|' || array_to_string(d.pending_approvals, ';')
   from public.claim_slack_channel_delivery(pg_temp.i('run1')) d),
  'succeeded|Propus criar a Alfa.|1700000000.000100|Criar a empresa Alfa no HubSpot',
  'a entrega traz a resposta e a Aprovação que aguarda na fila'
);
select is((select count(*)::int from public.claim_slack_channel_delivery(pg_temp.i('run1'))), 0, 'e é reservada uma vez só');
reset role;

-- 12-14. A Execução que falha chama a entrega com o motivo, sem Aprovação pendente (uma lista vazia, não nula): aqui o
-- Diego perdeu a Participação entre o pedido e a reserva.
set local role service_role;
insert into ids values ('run2', pg_temp.abrir('5d000000-0000-0000-0000-000000000002', '1700000001.000100',
  '@Scopus e a Beta?', 'Ev000002'));
reset role;
update public.workspace_memberships set active = false
where workspace_id = 'fd000000-0000-0000-0000-000000000001' and user_id = '5d000000-0000-0000-0000-000000000002';
set local role service_role;
select is(public.claim_agent_run(pg_temp.i('run2')), null, 'sem Participação, a Execução não roda');
reset role;
select is(pg_temp.entregas(pg_temp.i('run2')), 1, 'a Execução que falhou chama a entrega');
set local role service_role;
select is(
  (select d.status || '|' || d.error_code || '|' || coalesce(d.answer, '-') || '|' || cardinality(d.pending_approvals)
   from public.claim_slack_channel_delivery(pg_temp.i('run2')) d),
  'failed|membership_inactive|-|0', 'a entrega traz a falha com o motivo, sem resposta e sem Aprovação'
);
reset role;

-- 15-19. O relógio vence só a Execução do Canal parada além do prazo; a falha por prazo chama a entrega.
set local role service_role;
insert into ids values ('parada', pg_temp.abrir('5d000000-0000-0000-0000-000000000001', '1700000002.000100',
  '@Scopus resuma a Alfa', 'Ev000003'));
insert into ids values ('nova', pg_temp.abrir('5d000000-0000-0000-0000-000000000001', '1700000003.000100',
  '@Scopus resuma a Beta', 'Ev000004'));
reset role;
update private.agent_runs set created_at = now() - interval '1 hour' where id = pg_temp.i('parada');
select is(private.expire_stale_slack_channel_runs(), 1, 'o relógio vence uma Execução');
select is(
  (select status || '|' || error_code from private.agent_runs where id = pg_temp.i('parada')),
  'failed|timeout', 'a Execução do Canal parada além do prazo falha por prazo'
);
select is(pg_temp.entregas(pg_temp.i('parada')), 1, 'e a falha por prazo chama a entrega');
select is((select status from private.agent_runs where id = pg_temp.i('nova')), 'queued', 'a Execução dentro do prazo continua na fila');
select is(
  (select status from private.agent_runs where id = 'ad000000-0000-0000-0000-000000000001'), 'running',
  'a Execução de Conversa não é do relógio do Canal'
);

select * from finish();
rollback;

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(24);

-- Onde não há Vault (o Postgres puro do pgtap-local.sh), um esqueleto do que a migration usa dele; no Supabase e no CI o
-- Vault de verdade vale.
do $vault$
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
end
$vault$;

-- Ana (Admin do Norte), Bruno (Participação removida do Norte), Carla (Admin do Sul), Diego (e-mail não verificado,
-- Participação ativa no Norte) e Eva, que nunca participou de nada.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('5d000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5d000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5d000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@sul.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5d000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'diego@norte.test', '', null, now(), now(), '{}', '{}', false, false),
  ('5d000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'eva@fora.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('fd000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('fd000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('fd000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000001', 'admin', true),
  ('fd000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000002', 'member', false),
  ('fd000000-0000-0000-0000-000000000002', '5d000000-0000-0000-0000-000000000003', 'admin', true),
  ('fd000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000004', 'member', true);

-- O Norte instalou o Canal (T0NORTE); o Sul instalou e retirou (T0SUL).
select private.integration_secret_put('slack-channel:fd000000-0000-0000-0000-000000000001', 'xoxb-norte');
insert into private.slack_channel_installations (workspace_id, team_id, bot_user_id, state, secret_name, installed_by)
values ('fd000000-0000-0000-0000-000000000001', 'T0NORTE', 'U0BOTN', 'ativo', 'slack-channel:fd000000-0000-0000-0000-000000000001',
        '5d000000-0000-0000-0000-000000000001');
insert into private.slack_channel_installations (workspace_id, team_id, bot_user_id, state, secret_name, withdrawn_at, withdrawn_reason)
values ('fd000000-0000-0000-0000-000000000002', 'T0SUL', 'U0BOTS', 'retirado', 'slack-channel:fd000000-0000-0000-0000-000000000002',
        now(), 'administrador');

-- No Norte, o Scopus atende no Slack; um Agente criado, o "Scopus · Enterprise LATAM", também; o Ethos não.
update private.agent_settings s set channels = array['slack'] from private.agents a
where a.id = s.agent_id and a.workspace_id = 'fd000000-0000-0000-0000-000000000001' and a.name = 'Scopus';
insert into private.agents (workspace_id, specialty, kind, complement)
values ('fd000000-0000-0000-0000-000000000001', 'scopus', 'criado', 'Enterprise LATAM');
insert into private.agent_settings (agent_id, workspace_id, channels)
select a.id, a.workspace_id, array['slack', 'email'] from private.agents a
where a.workspace_id = 'fd000000-0000-0000-0000-000000000001' and a.kind = 'criado';

-- Uma Conversa e uma Execução do Norte, para provar que a retirada pelo Slack não apaga nada.
insert into private.agent_conversations (id, workspace_id, owner_id, kind) values
  ('cd000000-0000-0000-0000-000000000001', 'fd000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000001', 'coordenada');
insert into private.agent_runs (workspace_id, conversation_id, requested_by, client_request_id, request_text, status, finished_at)
values ('fd000000-0000-0000-0000-000000000001', 'cd000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000001',
        gen_random_uuid(), 'Resuma o funil.', 'succeeded', now());

-- 1-3. Nada disto é do navegador: nem a tabela das reservas, nem as funções.
select ok(
  not has_table_privilege('authenticated', 'private.slack_channel_events', 'select')
    and not has_table_privilege('service_role', 'private.slack_channel_events', 'select')
    and (select c.relrowsecurity from pg_class c where c.oid = 'private.slack_channel_events'::regclass),
  'a reserva dos eventos tem RLS explícito e nenhum acesso direto'
);
select ok(
  not has_function_privilege('authenticated', 'public.claim_slack_channel_event(text, text, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.slack_channel_active_installation(text)', 'execute')
    and not has_function_privilege('authenticated', 'public.slack_channel_account_by_email(uuid, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.slack_channel_agents(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.withdraw_slack_channel_by_slack(text, text)', 'execute')
    and not has_function_privilege('anon', 'public.claim_slack_channel_event(text, text, text)', 'execute')
    and not has_function_privilege('anon', 'public.slack_channel_active_installation(text)', 'execute')
    and not has_function_privilege('anon', 'public.slack_channel_account_by_email(uuid, text)', 'execute')
    and not has_function_privilege('anon', 'public.slack_channel_agents(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.withdraw_slack_channel_by_slack(text, text)', 'execute'),
  'nenhuma função dos eventos é do navegador'
);
select ok(
  has_function_privilege('service_role', 'public.claim_slack_channel_event(text, text, text)', 'execute')
    and has_function_privilege('service_role', 'public.slack_channel_active_installation(text)', 'execute')
    and has_function_privilege('service_role', 'public.slack_channel_account_by_email(uuid, text)', 'execute')
    and has_function_privilege('service_role', 'public.slack_channel_agents(uuid)', 'execute')
    and has_function_privilege('service_role', 'public.withdraw_slack_channel_by_slack(text, text)', 'execute'),
  'o servidor chama todas'
);

-- 4-6. Cada event_id é reservado uma vez só; o reenvio devolve false.
select is(public.claim_slack_channel_event('Ev0001', 'T0NORTE', 'app_mention'), true, 'o primeiro evento é reservado');
select is(public.claim_slack_channel_event('Ev0001', 'T0NORTE', 'app_mention'), false, 'o reenvio do mesmo event_id não é reservado de novo');
select is(
  (select count(*)::int from private.slack_channel_events where event_id = 'Ev0001'),
  1,
  'fica uma reserva só, com o id, o team_id e o tipo'
);

-- 7-9. A instalação ativa devolve o Workspace, o bot e o token; a retirada e um Slack desconhecido não devolvem nada.
select is(
  (select row(workspace_id, bot_user_id, bot_token)::text from public.slack_channel_active_installation('T0NORTE')),
  row('fd000000-0000-0000-0000-000000000001'::uuid, 'U0BOTN', 'xoxb-norte')::text,
  'o Slack do Norte tem instalação ativa, com o token do Vault'
);
select is((select count(*)::int from public.slack_channel_active_installation('T0SUL')), 0, 'a instalação retirada não responde');
select is((select count(*)::int from public.slack_channel_active_installation('T0NINGUEM')), 0, 'um Slack desconhecido não responde');

-- 10-15. A Conta de usuário só com e-mail verificado e Participação ativa no Workspace.
select is(
  public.slack_channel_account_by_email('fd000000-0000-0000-0000-000000000001', '  ANA@norte.test '),
  '5d000000-0000-0000-0000-000000000001'::uuid,
  'a Ana é reconhecida pelo e-mail, sem diferenciar maiúsculas'
);
select is(
  public.slack_channel_account_by_email('fd000000-0000-0000-0000-000000000001', 'bruno@norte.test'),
  null,
  'a Participação removida não é reconhecida'
);
select is(
  public.slack_channel_account_by_email('fd000000-0000-0000-0000-000000000001', 'diego@norte.test'),
  null,
  'o e-mail não verificado não é reconhecido'
);
select is(
  public.slack_channel_account_by_email('fd000000-0000-0000-0000-000000000001', 'carla@sul.test'),
  null,
  'a Participação em outro Workspace não vale aqui'
);
select is(
  public.slack_channel_account_by_email('fd000000-0000-0000-0000-000000000001', 'eva@fora.test'),
  null,
  'quem não participa de nada não é reconhecido'
);
select ok(
  (select count(*) from auth.users) = 5
    and (select count(*) from public.workspace_memberships where workspace_id = 'fd000000-0000-0000-0000-000000000001') = 3,
  'procurar a pessoa não cria Conta nem Participação'
);

-- 16-18. Os Agentes do Workspace, com o Slack na lista de canais ou não.
select is(
  (select in_slack from public.slack_channel_agents('fd000000-0000-0000-0000-000000000001') where name = 'Scopus'),
  true,
  'o Scopus atende no Slack'
);
select is(
  (select in_slack from public.slack_channel_agents('fd000000-0000-0000-0000-000000000001') where name = 'Ethos'),
  false,
  'o Ethos não atende no Slack, mas aparece para a recusa'
);
select is(
  (select count(*)::int from public.slack_channel_agents('fd000000-0000-0000-0000-000000000001') where in_slack),
  2,
  'o Agente criado com o Slack também atende; os Agentes do Sul não aparecem'
);

-- 19-24. O Slack desinstalou o app: a instalação fica retirada com o motivo, o token sai do Vault e nada mais some.
select throws_ok(
  $$select public.withdraw_slack_channel_by_slack('T0NORTE', 'administrador')$$,
  '22023', 'invalid withdrawal reason',
  'o Slack não retira com o motivo do Administrador'
);
select is(public.withdraw_slack_channel_by_slack('T0NORTE', 'desinstalado'), true, 'a desinstalação retira a instalação ativa');
select is(
  (select row(state, withdrawn_reason, withdrawn_by is null, withdrawn_at is not null)::text
   from private.slack_channel_installations where team_id = 'T0NORTE'),
  row('retirado', 'desinstalado', true, true)::text,
  'a instalação fica retirada, pelo Slack, com o team_id'
);
select ok(
  not exists (select 1 from vault.secrets where name = 'slack-channel:fd000000-0000-0000-0000-000000000001')
    and (select count(*)::int from public.slack_channel_active_installation('T0NORTE')) = 0,
  'o token sai do Vault e o bot para de responder'
);
select is(public.withdraw_slack_channel_by_slack('T0NORTE', 'token_revogado'), false, 'um aviso repetido não muda nada');
select ok(
  exists (select 1 from private.agent_conversations where id = 'cd000000-0000-0000-0000-000000000001')
    and exists (select 1 from private.agent_runs where conversation_id = 'cd000000-0000-0000-0000-000000000001')
    and (select withdrawn_reason from private.slack_channel_installations where team_id = 'T0NORTE') = 'desinstalado',
  'Conversas e Execuções ficam, e o primeiro motivo também'
);

select * from finish();
rollback;

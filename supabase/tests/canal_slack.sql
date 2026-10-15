begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(34);

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

-- Ana (Admin) e Bruno (Membro) do Norte; Carla (Admin) do Sul; Diego, que nunca participou de nada.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('5c000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5c000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5c000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@sul.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5c000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'diego@fora.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('fc000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('fc000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('fc000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', 'admin', true),
  ('fc000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000002', 'member', true),
  ('fc000000-0000-0000-0000-000000000002', '5c000000-0000-0000-0000-000000000003', 'admin', true);

-- Uma Conversa e uma Execução do Norte, para provar que retirar o Canal não apaga nada.
insert into private.agent_conversations (id, workspace_id, owner_id, kind) values
  ('cc000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', 'coordenada');
insert into private.agent_runs (workspace_id, conversation_id, requested_by, client_request_id, request_text, status, finished_at)
values ('fc000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001',
        gen_random_uuid(), 'Resuma o funil.', 'succeeded', now());

create temporary table guardado (k text primary key, v text) on commit drop;
grant all on guardado to anon, authenticated, service_role;

-- 1-4. Nada disto é do navegador: nem as tabelas, nem as funções de serviço.
select ok(
  not has_table_privilege('authenticated', 'private.slack_channel_installations', 'select')
    and not has_table_privilege('service_role', 'private.slack_channel_installations', 'select')
    and not has_table_privilege('authenticated', 'private.slack_channel_install_attempts', 'select')
    and not has_table_privilege('service_role', 'private.slack_channel_install_attempts', 'select'),
  'as tabelas do Canal Slack não têm acesso direto'
);
select ok(
  (select bool_and(c.relrowsecurity) from pg_class c
   where c.oid in ('private.slack_channel_installations'::regclass, 'private.slack_channel_install_attempts'::regclass)),
  'as tabelas do Canal Slack têm RLS explícito'
);
select ok(
  not has_function_privilege('authenticated', 'public.start_slack_channel_install(uuid, uuid, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.slack_channel_install_attempt(text)', 'execute')
    and not has_function_privilege('authenticated', 'public.complete_slack_channel_install(text, text, text, text, text, text, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.slack_channel_token_for_withdrawal(uuid, uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.withdraw_slack_channel(uuid, uuid)', 'execute')
    and not has_function_privilege('anon', 'public.slack_channel_status(uuid)', 'execute'),
  'as funções de serviço não são do navegador, e o estado não é de anônimo'
);
select ok(
  has_function_privilege('service_role', 'public.start_slack_channel_install(uuid, uuid, text)', 'execute')
    and has_function_privilege('service_role', 'public.complete_slack_channel_install(text, text, text, text, text, text, text)', 'execute')
    and has_function_privilege('service_role', 'public.withdraw_slack_channel(uuid, uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.slack_channel_status(uuid)', 'execute'),
  'o servidor instala e retira; o participante lê o estado'
);

-- 5-7. Antes de instalar, o Canal aparece não instalado para quem participa; quem não participa não lê.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '5c000000-0000-0000-0000-000000000002', true);
select is(
  (select state from public.slack_channel_status('fc000000-0000-0000-0000-000000000001')),
  'nao_instalado',
  'o Membro vê o Canal não instalado'
);
select throws_ok(
  $$select * from public.slack_channel_status('fc000000-0000-0000-0000-000000000002')$$,
  '42501', 'active workspace membership required',
  'o Membro do Norte não lê o Canal do Sul'
);
select set_config('request.jwt.claim.sub', '5c000000-0000-0000-0000-000000000004', true);
select throws_ok(
  $$select * from public.slack_channel_status('fc000000-0000-0000-0000-000000000001')$$,
  '42501', 'active workspace membership required',
  'quem não participa não lê o Canal'
);

-- 8-10. Só um Administrador ativo inicia a instalação. Daqui em diante, como o dono (o privilégio do servidor já foi
-- provado no 4), para conferir as tabelas privadas.
reset role;
select throws_ok(
  $$select public.start_slack_channel_install('fc000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000002', null)$$,
  '42501', 'only administrators can manage the slack channel',
  'o Membro não inicia a instalação'
);
select throws_ok(
  $$select public.start_slack_channel_install('fc000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000003', null)$$,
  '42501', 'only administrators can manage the slack channel',
  'o Administrador do Sul não instala no Norte'
);
insert into guardado values ('norte-1', public.start_slack_channel_install(
  'fc000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', 'https://app.althius.test'));
select is(
  (select row(status, workspace_id, return_to)::text from public.slack_channel_install_attempt((select v from guardado where k = 'norte-1'))),
  row('ok', 'fc000000-0000-0000-0000-000000000001'::uuid, 'https://app.althius.test')::text,
  'a tentativa da Ana vale, com a origem para voltar'
);

-- 11-12. Um state forjado não conhece nada; a conclusão também não.
select is(
  (select count(*)::int from public.slack_channel_install_attempt('forjado-0000000000000000000000000000000000')),
  0,
  'um state desconhecido não devolve linha'
);
select throws_ok(
  $$select public.complete_slack_channel_install('forjado-0000000000000000000000000000000000', 'T0NORTE', 'Norte', 'U0BOT', 'A0APP', 'xoxb-1', 'chat:write')$$,
  'P0002', 'install attempt not found',
  'a conclusão recusa um state desconhecido'
);

-- 13-17. A primeira instalação fixa o team_id e guarda o token no Vault.
select lives_ok(
  $$select public.complete_slack_channel_install((select v from guardado where k = 'norte-1'), 'T0NORTE', 'Norte no Slack', 'U0BOTN', 'A0ALTHIUS', 'xoxb-norte-1', 'app_mentions:read,chat:write')$$,
  'a Ana conclui a instalação no Slack do Norte'
);
select is(
  (select row(team_id, team_name, bot_user_id, state, installed_by)::text from private.slack_channel_installations
   where workspace_id = 'fc000000-0000-0000-0000-000000000001'),
  row('T0NORTE', 'Norte no Slack', 'U0BOTN', 'ativo', '5c000000-0000-0000-0000-000000000001'::uuid)::text,
  'a instalação fica ativa, com o Slack fixado e quem instalou'
);
select is(
  (select s.decrypted_secret from vault.decrypted_secrets s
   join private.slack_channel_installations i on i.secret_name = s.name
   where i.workspace_id = 'fc000000-0000-0000-0000-000000000001'),
  'xoxb-norte-1',
  'o token do bot fica no Vault, e o banco só guarda o nome'
);
select throws_ok(
  $$select public.complete_slack_channel_install((select v from guardado where k = 'norte-1'), 'T0NORTE', 'Norte', 'U0BOTN', 'A0ALTHIUS', 'xoxb-norte-2', null)$$,
  '55000', 'install attempt already used',
  'o retorno repetido não vale'
);
select is(
  (select status from public.slack_channel_install_attempt((select v from guardado where k = 'norte-1'))),
  'usada',
  'a tentativa consumida aparece como usada'
);

-- 18-19. Reinstalar no Norte com outro Slack é recusado, e o Slack fixado não muda.
insert into guardado values ('norte-2', public.start_slack_channel_install(
  'fc000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', null));
select throws_ok(
  $$select public.complete_slack_channel_install((select v from guardado where k = 'norte-2'), 'T0OUTRO', 'Outro', 'U0BOTO', 'A0ALTHIUS', 'xoxb-outro', null)$$,
  'P0001', 'slack team mismatch',
  'o Norte não troca de Slack'
);
select is(
  (select row(team_id, state)::text from private.slack_channel_installations where workspace_id = 'fc000000-0000-0000-0000-000000000001'),
  row('T0NORTE', 'ativo')::text,
  'a recusa não muda a instalação do Norte'
);

-- 20-21. O Slack do Norte não serve ao Sul.
insert into guardado values ('sul-1', public.start_slack_channel_install(
  'fc000000-0000-0000-0000-000000000002', '5c000000-0000-0000-0000-000000000003', null));
select throws_ok(
  $$select public.complete_slack_channel_install((select v from guardado where k = 'sul-1'), 'T0NORTE', 'Norte no Slack', 'U0BOTN', 'A0ALTHIUS', 'xoxb-norte-sul', null)$$,
  'P0001', 'slack team in another workspace',
  'um Slack já ligado ao Norte é recusado no Sul'
);
select is(
  (select count(*)::int from private.slack_channel_installations where workspace_id = 'fc000000-0000-0000-0000-000000000002'),
  0,
  'o Sul fica sem instalação'
);

-- 22-23. O Membro não retira; ninguém lê o token sem ser Administrador.
select throws_ok(
  $$select public.slack_channel_token_for_withdrawal('fc000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000002')$$,
  '42501', 'only administrators can manage the slack channel',
  'o Membro não lê o token para retirar'
);
select throws_ok(
  $$select public.withdraw_slack_channel('fc000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000002')$$,
  '42501', 'only administrators can manage the slack channel',
  'o Membro não retira o Canal'
);

-- 24-28. A Ana retira: o token sai do Vault, a linha fica retirada, Conversas e Execuções ficam.
select is(
  public.slack_channel_token_for_withdrawal('fc000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001'),
  'xoxb-norte-1',
  'a Ana recebe o token para revogar no Slack'
);
select lives_ok(
  $$select public.withdraw_slack_channel('fc000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001')$$,
  'a Ana retira o Canal'
);
select is(
  (select row(team_id, state, withdrawn_by, withdrawn_reason)::text from private.slack_channel_installations
   where workspace_id = 'fc000000-0000-0000-0000-000000000001'),
  row('T0NORTE', 'retirado', '5c000000-0000-0000-0000-000000000001'::uuid, 'administrador')::text,
  'a instalação fica retirada, com o Slack ainda fixado'
);
select is(
  (select count(*)::int from vault.secrets where name = 'slack-channel:fc000000-0000-0000-0000-000000000001'),
  0,
  'o token revogado sai do Vault'
);
select is(
  (select row((select count(*) from private.agent_conversations where workspace_id = 'fc000000-0000-0000-0000-000000000001'),
              (select count(*) from private.agent_runs where workspace_id = 'fc000000-0000-0000-0000-000000000001'))::text),
  row(1, 1)::text,
  'retirar não apaga Conversas nem Execuções'
);

-- 29-30. Retirar de novo não tem o que retirar.
select throws_ok(
  $$select public.withdraw_slack_channel('fc000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001')$$,
  'P0002', 'slack channel not installed',
  'um Canal já retirado não se retira de novo'
);
select throws_ok(
  $$select public.slack_channel_token_for_withdrawal('fc000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001')$$,
  'P0002', 'slack channel not installed',
  'um Canal retirado não tem token'
);

-- 31. Retirado, o Slack do Norte continua fora do alcance do Sul.
select throws_ok(
  $$select public.complete_slack_channel_install((select v from guardado where k = 'sul-1'), 'T0NORTE', 'Norte no Slack', 'U0BOTN', 'A0ALTHIUS', 'xoxb-norte-sul', null)$$,
  'P0001', 'slack team in another workspace',
  'um Slack retirado do Norte ainda não serve ao Sul'
);

-- 32-34. Reinstalar no mesmo Slack volta a ativo, e o Membro vê; o Sul continua sem nada.
insert into guardado values ('norte-3', public.start_slack_channel_install(
  'fc000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', null));
select public.complete_slack_channel_install((select v from guardado where k = 'norte-3'), 'T0NORTE', 'Norte no Slack', 'U0BOTN', 'A0ALTHIUS', 'xoxb-norte-3', null);
select is(
  (select row(state, withdrawn_at, (select s.decrypted_secret from vault.decrypted_secrets s where s.name = i.secret_name))::text
   from private.slack_channel_installations i where i.workspace_id = 'fc000000-0000-0000-0000-000000000001'),
  row('ativo', null::timestamptz, 'xoxb-norte-3')::text,
  'reinstalar no mesmo Slack volta a ativo com o token novo'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '5c000000-0000-0000-0000-000000000002', true);
select is(
  (select row(state, team_name)::text from public.slack_channel_status('fc000000-0000-0000-0000-000000000001')),
  row('ativo', 'Norte no Slack')::text,
  'o Membro vê o Canal ativo e o nome do Slack'
);
select set_config('request.jwt.claim.sub', '5c000000-0000-0000-0000-000000000003', true);
select is(
  (select state from public.slack_channel_status('fc000000-0000-0000-0000-000000000002')),
  'nao_instalado',
  'o Sul continua sem Canal'
);

select * from finish();
rollback;

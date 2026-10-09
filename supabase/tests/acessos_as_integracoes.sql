begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(66);

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

-- Ana (Admin) e Bruno (Membro) do Norte; Diego (Membro, depois desativado) do Norte; Carla (Admin) do Sul.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('5a000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5a000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5a000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'diego@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5a000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'carla@sul.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('fa000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('fa000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 'admin', true),
  ('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000002', 'member', true),
  ('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000003', 'member', true),
  ('fa000000-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-000000000004', 'admin', true);

create temporary table guardado (k text primary key, v text) on commit drop;
grant all on guardado to anon, authenticated, service_role;

-- Ana (Administradora) habilita as Integrações do Norte.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '5a000000-0000-0000-0000-000000000001', true);
select public.enable_workspace_integration('fa000000-0000-0000-0000-000000000001', 'hubspot');
select public.enable_workspace_integration('fa000000-0000-0000-0000-000000000001', 'notion');
select public.enable_workspace_integration('fa000000-0000-0000-0000-000000000001', 'lusha');

-- 1-3. O catálogo: toda Integração com perfil de conexão é habilitável; as demais continuam "Em breve".
select is(
  (select array_agg(id order by id) from public.list_workspace_integrations('fa000000-0000-0000-0000-000000000001')
    where status = 'nao_habilitada'),
  null::text[],
  'as Integrações ocultas não aparecem como não habilitadas'
);
select is(
  (select array_agg(id order by id) from public.list_workspace_integrations('fa000000-0000-0000-0000-000000000001')
    where status = 'em_breve'),
  null::text[],
  'o catálogo visível não oferece Integrações em breve'
);
select throws_ok(
  $$select public.enable_workspace_integration('fa000000-0000-0000-0000-000000000001', 'google-ads')$$,
  '22023', 'integration is not available for enablement',
  'não se habilita uma Integração em breve'
);

-- 4. O que é do servidor não é do navegador: nem as tabelas, nem as funções de serviço.
reset role;
select ok(
  not has_table_privilege('authenticated', 'private.integration_accesses', 'select')
    and not has_table_privilege('service_role', 'private.integration_accesses', 'select')
    and not has_table_privilege('authenticated', 'private.integration_connect_attempts', 'select')
    and not has_table_privilege('authenticated', 'private.integration_oauth_clients', 'select')
    and not has_function_privilege('authenticated', 'public.integration_access_for_use(uuid, uuid, text)', 'execute')
    and not has_function_privilege('anon', 'public.integration_access_for_use(uuid, uuid, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.start_integration_connect(uuid, uuid, text, text, text, text, text, text, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.complete_integration_connect(text, text, text, integer, text, text, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.save_integration_api_key(uuid, uuid, text, text, text, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.rotate_integration_access(uuid, text, text, integer)', 'execute')
    and has_function_privilege('service_role', 'public.integration_access_for_use(uuid, uuid, text)', 'execute')
    and has_function_privilege('service_role', 'public.complete_integration_connect(text, text, text, integer, text, text, text)', 'execute')
    and has_function_privilege('authenticated', 'public.integration_access_status(uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.disconnect_integration_access(uuid, text)', 'execute')
    and not has_function_privilege('anon', 'public.integration_access_status(uuid)', 'execute'),
  'tabelas privadas e funções de token só para o servidor; estado e desconectar para o participante'
);

-- Daqui, o servidor (a Edge Function com a chave de serviço).
set local role service_role;

-- 5-8. Iniciar a tentativa exige Participação ativa e Integração habilitada com o caminho de OAuth.
select throws_ok(
  $$select * from public.start_integration_connect('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000002', 'apollo', 'https://mcp.apollo.io', 'https://x.test/cb', 'https://mcp.apollo.io/token', 'cid', null, 'https://app.test')$$,
  '22023', 'integration not enabled',
  'não se conecta uma Integração que o Administrador não habilitou'
);
select throws_ok(
  $$select * from public.start_integration_connect('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000004', 'hubspot', 'https://mcp.hubspot.com', 'https://x.test/cb', 'https://mcp.hubspot.com/oauth/v3/token', 'cid', null, 'https://app.test')$$,
  '42501', 'active workspace membership required',
  'quem não participa do Workspace não inicia a conexão'
);
select throws_ok(
  $$select * from public.start_integration_connect('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000002', 'lusha', 'https://mcp.lusha.com', 'https://x.test/cb', 'https://mcp.lusha.com/token', 'cid', null, 'https://app.test')$$,
  '22023', 'integration kind not supported',
  'o Lusha só conecta por chave de API: sem OAuth não há tentativa'
);
select lives_ok(
  $$insert into guardado select 'st_bruno', state || ' ' || code_verifier from public.start_integration_connect('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000002', 'hubspot', 'https://mcp.hubspot.com', 'https://x.test/cb', 'https://mcp.hubspot.com/oauth/v3/token', 'cid-hubspot', 'https://mcp.hubspot.com', 'https://app.test')$$,
  'um participante ativo inicia a conexão de uma Integração habilitada'
);

-- 9-11. O retorno do OAuth: o state certo devolve o verificador; um state forjado não devolve nada.
select is(
  (select length(split_part(v, ' ', 1)) * 1000 + length(split_part(v, ' ', 2)) from guardado where k = 'st_bruno'),
  64064,
  'o state e o verificador PKCE têm 64 caracteres aleatórios'
);
select is(
  (select count(*)::integer from public.integration_connect_attempt('state-forjado-que-nunca-foi-emitido-por-ninguem')),
  0,
  'um state forjado não casa com tentativa nenhuma'
);
select is(
  (select code_verifier || '|' || status || '|' || issuer || '|' || client_id
     from public.integration_connect_attempt((select split_part(v, ' ', 1) from guardado where k = 'st_bruno'))),
  (select split_part(v, ' ', 2) from guardado where k = 'st_bruno') || '|ok|https://mcp.hubspot.com|cid-hubspot',
  'o state certo devolve o que a tentativa guardou'
);

-- 12. Um retorno forjado não associa nada.
select throws_ok(
  $$select public.complete_integration_connect('state-forjado-que-nunca-foi-emitido-por-ninguem', 'tok', 'ref', 1800, 'x@y.test', 'hub-111', null)$$,
  'P0002', 'connect attempt not found',
  'concluir com um state forjado não grava Acesso nenhum'
);

-- 13-16. Concluir grava o Acesso com o token no Vault; o portal do HubSpot fica fixado; repetir o retorno não vale.
select lives_ok(
  $$select public.complete_integration_connect((select split_part(v, ' ', 1) from guardado where k = 'st_bruno'), 'acc-1', 'ref-1', 1800, 'bruno@norte.test', 'hub-111', 'crm.objects.contacts.read')$$,
  'o retorno certo conclui a conexão do Bruno'
);
reset role;
select is(
  (select count(*)::integer from private.integration_accesses
    where workspace_id = 'fa000000-0000-0000-0000-000000000001' and user_id = '5a000000-0000-0000-0000-000000000002'
      and integration_id = 'hubspot' and kind = 'oauth_mcp' and state = 'conectado'),
  1,
  'o Acesso do Bruno ficou conectado'
);
select is(
  (select app_portal from public.workspace_integrations
    where workspace_id = 'fa000000-0000-0000-0000-000000000001' and integration_id = 'hubspot'),
  'hub-111',
  'o primeiro Acesso fixou o portal do HubSpot no Workspace'
);
select ok(
  not exists (
    select 1 from private.integration_accesses a
    where a::text like '%acc-1%' or a::text like '%ref-1%'
  ) and exists (
    select 1 from vault.decrypted_secrets s
    where s.name like 'integration-access:%' and s.decrypted_secret::jsonb ->> 'access_token' = 'acc-1'
      and s.decrypted_secret::jsonb ->> 'refresh_token' = 'ref-1'
  ),
  'o token está no Vault e em nenhuma coluna da tabela do Acesso'
);
set local role service_role;
select throws_ok(
  $$select public.complete_integration_connect((select split_part(v, ' ', 1) from guardado where k = 'st_bruno'), 'acc-2', 'ref-2', 1800, 'bruno@norte.test', 'hub-111', null)$$,
  '55000', 'connect attempt already used',
  'um retorno repetido não vale'
);
select is(
  (select status from public.integration_connect_attempt((select split_part(v, ' ', 1) from guardado where k = 'st_bruno'))),
  'usada',
  'a tentativa usada diz que foi usada, sem devolver o verificador'
);

-- 17-18. Prazo: a tentativa vencida não conclui.
select lives_ok(
  $$insert into guardado select 'st_ana', state from public.start_integration_connect('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 'hubspot', 'https://mcp.hubspot.com', 'https://x.test/cb', 'https://mcp.hubspot.com/oauth/v3/token', 'cid-hubspot', null, null)$$,
  'a Ana inicia a conexão dela'
);
reset role;
update private.integration_connect_attempts set expires_at = now() - interval '1 minute'
where state = (select v from guardado where k = 'st_ana');
set local role service_role;
select is(
  (select status || '|' || coalesce(code_verifier, 'sem verificador')
     from public.integration_connect_attempt((select v from guardado where k = 'st_ana'))),
  'expirada|sem verificador',
  'a tentativa vencida diz que expirou'
);
select throws_ok(
  $$select public.complete_integration_connect((select v from guardado where k = 'st_ana'), 'acc-a', 'ref-a', 1800, 'ana@norte.test', 'hub-111', null)$$,
  '55000', 'connect attempt expired',
  'concluir depois do prazo não grava Acesso'
);

-- 19-21. Participação desativada entre o início e o retorno: o retorno não vale.
select lives_ok(
  $$insert into guardado select 'st_diego', state from public.start_integration_connect('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000003', 'hubspot', 'https://mcp.hubspot.com', 'https://x.test/cb', 'https://mcp.hubspot.com/oauth/v3/token', 'cid-hubspot', null, null)$$,
  'o Diego inicia a conexão enquanto está ativo'
);
reset role;
update public.workspace_memberships set active = false
where workspace_id = 'fa000000-0000-0000-0000-000000000001' and user_id = '5a000000-0000-0000-0000-000000000003';
set local role service_role;
select is(
  (select status from public.integration_connect_attempt((select v from guardado where k = 'st_diego'))),
  'participacao_inativa',
  'o retorno de quem foi desativado é reconhecido como tal'
);
select throws_ok(
  $$select public.complete_integration_connect((select v from guardado where k = 'st_diego'), 'acc-d', 'ref-d', 1800, 'diego@norte.test', 'hub-111', null)$$,
  '42501', 'active workspace membership required',
  'a Participação desativada não conclui a conexão'
);
select throws_ok(
  $$select * from public.integration_access_for_use('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000003', 'hubspot')$$,
  '42501', 'active workspace membership required',
  'e o Acesso de quem foi desativado não é usado'
);

-- 22-24. O portal fixado: um Acesso a outro portal é recusado; o mesmo portal vale.
select lives_ok(
  $$insert into guardado select 'st_ana2', state from public.start_integration_connect('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 'hubspot', 'https://mcp.hubspot.com', 'https://x.test/cb', 'https://mcp.hubspot.com/oauth/v3/token', 'cid-hubspot', null, null)$$,
  'a Ana inicia outra tentativa (substitui a vencida)'
);
select throws_ok(
  $$select public.complete_integration_connect((select v from guardado where k = 'st_ana2'), 'acc-a', 'ref-a', 1800, 'ana@outra-empresa.test', 'hub-999', null)$$,
  'P0001', 'integration portal mismatch',
  'um Acesso a outro portal do HubSpot é recusado'
);
select throws_ok(
  $$select public.complete_integration_connect((select v from guardado where k = 'st_ana2'), 'acc-a', 'ref-a', 1800, 'ana@norte.test', null, null)$$,
  '22023', 'integration portal unknown',
  'sem identificar o portal, o HubSpot não conecta'
);
select lives_ok(
  $$select public.complete_integration_connect((select v from guardado where k = 'st_ana2'), 'acc-a', 'ref-a', 1800, 'ana@norte.test', 'hub-111', null)$$,
  'o mesmo portal conecta (a recusa não consumiu a tentativa)'
);

-- 25-27. Cada participante só usa o PRÓPRIO Acesso.
select is(
  (select secret::jsonb ->> 'access_token' from public.integration_access_for_use('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000002', 'hubspot')),
  'acc-1',
  'o servidor lê o token do Bruno quando age em nome do Bruno'
);
select is(
  (select secret::jsonb ->> 'access_token' from public.integration_access_for_use('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 'hubspot')),
  'acc-a',
  'e o da Ana quando age em nome da Ana: nunca o de outro'
);
select is(
  (select count(*)::integer from public.integration_access_for_use('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 'notion')),
  0,
  'sem Acesso a uma Integração, não há o que usar'
);

-- 28-31. O estado do Workspace para a tela: o próprio Acesso e a contagem, sem token e sem a conta dos outros.
set local role authenticated;
select set_config('request.jwt.claim.sub', '5a000000-0000-0000-0000-000000000002', true);
select is(
  (select state || '|' || kind || '|' || account_label || '|' || connected_count
     from public.integration_access_status('fa000000-0000-0000-0000-000000000001') where integration_id = 'hubspot'),
  'conectado|oauth_mcp|bruno@norte.test|2',
  'o Bruno vê o próprio Acesso e que 2 participantes conectaram'
);
select is(
  (select state || '|' || coalesce(account_label, 'sem conta') || '|' || connected_count
     from public.integration_access_status('fa000000-0000-0000-0000-000000000001') where integration_id = 'notion'),
  'desconectado|sem conta|0',
  'sem Acesso, o estado é desconectado'
);
select ok(
  not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'workspace_integrations' and c.column_name ~* 'token|secret|key'
  ) and (
    select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'integration_access_status'
      and pg_get_function_result(p.oid) ~* 'token|secret|api_key'
  ) = 0,
  'o estado não tem coluna de token nem de segredo'
);
select throws_ok(
  $$select * from public.integration_access_status('fa000000-0000-0000-0000-000000000002')$$,
  '42501', 'active workspace membership required',
  'quem é de outro Workspace não vê o estado dos Acessos deste'
);

-- 32-35. Renovação: o refresh token novo é gravado junto com o access token novo.
set local role service_role;
select lives_ok(
  $$select public.rotate_integration_access(
    (select access_id from public.integration_access_for_use('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000002', 'hubspot')),
    'acc-1b', 'ref-1b', 1800)$$,
  'a renovação grava o par novo'
);
select is(
  (select secret::jsonb ->> 'access_token' || '|' || (secret::jsonb ->> 'refresh_token')
     from public.integration_access_for_use('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000002', 'hubspot')),
  'acc-1b|ref-1b',
  'o access token e o refresh token trocam juntos'
);
select lives_ok(
  $$select public.rotate_integration_access(
    (select access_id from public.integration_access_for_use('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000002', 'hubspot')),
    'acc-1c', null, 1800)$$,
  'um provedor que não devolve refresh token novo não apaga o antigo'
);
select is(
  (select secret::jsonb ->> 'access_token' || '|' || (secret::jsonb ->> 'refresh_token') || '|' || (secret::jsonb ->> 'token_endpoint')
     from public.integration_access_for_use('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000002', 'hubspot')),
  'acc-1c|ref-1b|https://mcp.hubspot.com/oauth/v3/token',
  'o refresh token antigo fica e o endereço da renovação continua guardado'
);

-- 36-40. Renovação recusada: o Acesso passa a "Precisa reconectar" e o segredo é esvaziado.
select lives_ok(
  $$select public.mark_integration_access_reconnect(
    (select access_id from public.integration_access_for_use('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000002', 'hubspot')),
    'O HubSpot recusou a renovação.')$$,
  'a renovação recusada marca o Acesso'
);
select is(
  (select state || '|' || coalesce(secret, 'sem segredo')
     from public.integration_access_for_use('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000002', 'hubspot')),
  'precisa_reconectar|sem segredo',
  'um Acesso a reconectar não entrega token'
);
select throws_ok(
  $$select public.rotate_integration_access(
    (select access_id from public.integration_access_for_use('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000002', 'hubspot')),
    'acc-x', 'ref-x', 1800)$$,
  '55000', 'integration access needs reconnect',
  'um Acesso a reconectar não renova sozinho'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '5a000000-0000-0000-0000-000000000002', true);
select is(
  (select state || '|' || failure || '|' || connected_count
     from public.integration_access_status('fa000000-0000-0000-0000-000000000001') where integration_id = 'hubspot'),
  'precisa_reconectar|O HubSpot recusou a renovação.|1',
  'a tela vê "precisa reconectar" e a contagem só inclui quem está conectado'
);

-- 41. Reconectar pelo mesmo caminho volta a "conectado" e troca o segredo.
set local role service_role;
select lives_ok(
  $$select public.complete_integration_connect(
    (select state from public.start_integration_connect('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000002', 'hubspot', 'https://mcp.hubspot.com', 'https://x.test/cb', 'https://mcp.hubspot.com/oauth/v3/token', 'cid-hubspot', null, null)),
    'acc-1d', 'ref-1d', 1800, 'bruno@norte.test', 'hub-111', null)$$,
  'reconectar substitui o Acesso do mesmo participante'
);
select is(
  (select state || '|' || (secret::jsonb ->> 'access_token')
     from public.integration_access_for_use('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000002', 'hubspot')),
  'conectado|acc-1d',
  'o Acesso volta a conectado com o token novo'
);

-- 43-46. Chave de API: só nas Integrações que têm o caminho, e o portal do HubSpot também vale.
select throws_ok(
  $$select public.save_integration_api_key('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000002', 'notion', 'chave', 'x', null)$$,
  '22023', 'integration kind not supported',
  'o Notion não conecta por chave de API'
);
select throws_ok(
  $$select public.save_integration_api_key('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000002', 'lusha', '   ', 'x', null)$$,
  '22023', 'api key is required',
  'chave vazia não é aceita'
);
select lives_ok(
  $$select public.save_integration_api_key('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000002', 'lusha', 'chave-lusha', 'Conta Lusha', null)$$,
  'a chave de API do Lusha é guardada no Vault'
);
select is(
  (select kind || '|' || (secret::jsonb ->> 'api_key') from public.integration_access_for_use('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000002', 'lusha')),
  'api_key|chave-lusha',
  'o servidor lê a chave; ela não está em coluna alguma'
);
select throws_ok(
  $$select public.save_integration_api_key('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 'hubspot', 'pat-na-xxx', 'x', 'hub-999')$$,
  'P0001', 'integration portal mismatch',
  'a chave de um Private App de outro portal do HubSpot é recusada'
);

-- 48-50. Desconectar apaga só o PRÓPRIO Acesso (e o segredo dele).
set local role authenticated;
select set_config('request.jwt.claim.sub', '5a000000-0000-0000-0000-000000000002', true);
select is(
  public.disconnect_integration_access('fa000000-0000-0000-0000-000000000001', 'hubspot'),
  true,
  'o Bruno desconecta o próprio Acesso ao HubSpot'
);
select is(
  public.disconnect_integration_access('fa000000-0000-0000-0000-000000000001', 'hubspot'),
  false,
  'desconectar de novo não tem o que apagar'
);
reset role;
select ok(
  not exists (select 1 from vault.decrypted_secrets s where s.decrypted_secret like '%acc-1d%')
    and exists (select 1 from vault.decrypted_secrets s where s.decrypted_secret like '%acc-a%')
    and (select count(*) from private.integration_accesses
          where workspace_id = 'fa000000-0000-0000-0000-000000000001' and integration_id = 'hubspot') = 1,
  'o segredo do Bruno saiu do Vault e o Acesso da Ana continua'
);

-- 51-52. A Permissão do Agente (ADR-0002) que a função confere antes de chamar uma ferramenta.
reset role;
insert into guardado select 'scopus', id::text from private.agents
where workspace_id = 'fa000000-0000-0000-0000-000000000001' and specialty = 'scopus';
set local role service_role;
select is(
  public.integration_agent_permission('fa000000-0000-0000-0000-000000000001', (select v::uuid from guardado where k = 'scopus'), 'hubspot'),
  'propor',
  'o Agente padrão propõe no HubSpot, que escreve'
);
select is(
  public.integration_agent_permission('fa000000-0000-0000-0000-000000000001', (select v::uuid from guardado where k = 'scopus'), 'notion'),
  null,
  'sem linha, o Agente não usa a Integração'
);

-- 53-54. Clientes OAuth de registro dinâmico: o primeiro registro vale e o segredo vai ao Vault.
select is(
  (select client_id || '|' || client_secret from public.save_integration_oauth_client('notion', 'https://mcp.notion.com', 'https://x.test/cb', 'notion-cid-1', 'notion-secret-1')),
  'notion-cid-1|notion-secret-1',
  'o cliente registrado é guardado'
);
select is(
  (select client_id from public.save_integration_oauth_client('notion', 'https://mcp.notion.com', 'https://x.test/cb', 'notion-cid-2', null)),
  'notion-cid-1',
  'um segundo registro não troca o primeiro, para não deixar órfã uma autorização'
);

-- 55-60. Retirar a Integração: só Administrador do Workspace; apaga Acessos, tentativas e o portal; o trabalho comercial fica.
set local role authenticated;
select set_config('request.jwt.claim.sub', '5a000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.save_target_account('fa000000-0000-0000-0000-000000000001', 'Alfa', 'https://alfa.com.br')$$,
  'a Ana cadastra uma Conta-alvo'
);
select set_config('request.jwt.claim.sub', '5a000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.disable_workspace_integration('fa000000-0000-0000-0000-000000000001', 'hubspot')$$,
  '42501', 'only administrators can enable integrations',
  'um Membro não retira a Integração, nem por chamada direta'
);
select set_config('request.jwt.claim.sub', '5a000000-0000-0000-0000-000000000004', true);
select throws_ok(
  $$select public.disable_workspace_integration('fa000000-0000-0000-0000-000000000001', 'hubspot')$$,
  '42501', 'active workspace membership required',
  'o Administrador de outro Workspace não retira a Integração deste'
);
select set_config('request.jwt.claim.sub', '5a000000-0000-0000-0000-000000000001', true);
select is(
  public.disable_workspace_integration('fa000000-0000-0000-0000-000000000001', 'hubspot'),
  1,
  'o Administrador retira o HubSpot e 1 Acesso é desconectado'
);
reset role;
select ok(
  not exists (select 1 from private.integration_accesses where workspace_id = 'fa000000-0000-0000-0000-000000000001' and integration_id = 'hubspot')
    and not exists (select 1 from private.integration_connect_attempts where workspace_id = 'fa000000-0000-0000-0000-000000000001' and integration_id = 'hubspot')
    and not exists (select 1 from public.workspace_integrations where workspace_id = 'fa000000-0000-0000-0000-000000000001' and integration_id = 'hubspot')
    and not exists (select 1 from vault.decrypted_secrets s where s.decrypted_secret like '%acc-a%')
    and exists (select 1 from private.integration_accesses where workspace_id = 'fa000000-0000-0000-0000-000000000001' and integration_id = 'lusha'),
  'retirar apaga Acessos, segredos, tentativas e o portal do HubSpot, e não toca as outras Integrações'
);
select is(
  (select count(*)::integer from public.target_accounts where workspace_id = 'fa000000-0000-0000-0000-000000000001'),
  1,
  'retirar a Integração não apaga nenhuma Conta-alvo'
);

-- 61. Habilitar de novo aceita o primeiro Acesso de qualquer portal (é o caminho para trocar o portal).
set local role authenticated;
select set_config('request.jwt.claim.sub', '5a000000-0000-0000-0000-000000000001', true);
select public.enable_workspace_integration('fa000000-0000-0000-0000-000000000001', 'hubspot');
set local role service_role;
select lives_ok(
  $$select public.complete_integration_connect(
    (select state from public.start_integration_connect('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 'hubspot', 'https://mcp.hubspot.com', 'https://x.test/cb', 'https://mcp.hubspot.com/oauth/v3/token', 'cid-hubspot', null, null)),
    'acc-z', 'ref-z', 1800, 'ana@norte.test', 'hub-999', null)$$,
  'habilitado de novo, o primeiro Acesso fixa o portal novo'
);

-- 62. Apagar o Workspace leva os Acessos e os segredos dele.
reset role;
insert into public.workspace_integrations (workspace_id, integration_id, enabled_by)
values ('fa000000-0000-0000-0000-000000000002', 'lusha', '5a000000-0000-0000-0000-000000000004');
select public.save_integration_api_key('fa000000-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-000000000004', 'lusha', 'chave-sul', 'Sul', null);
delete from public.workspaces where id = 'fa000000-0000-0000-0000-000000000002';
select ok(
  not exists (select 1 from vault.decrypted_secrets s where s.decrypted_secret like '%chave-sul%'),
  'apagar o Workspace apaga o segredo do Acesso dele no Vault'
);

select * from finish();
rollback;

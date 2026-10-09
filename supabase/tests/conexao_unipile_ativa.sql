begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(51);

-- Conexão Unipile ativa por configuração e troca sem perder o histórico (canais-15, ADR-0024).

create function pg_temp.conta() returns private.sender_accounts language sql as $f$
  select * from private.sender_accounts where owner_user_id = '95000000-0000-0000-0000-000000000001' and channel = 'email';
$f$;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('95000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'titular@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('95000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'colega@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values ('96000000-0000-0000-0000-000000000001', 'empresa', 'Cliente');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('96000000-0000-0000-0000-000000000001', '95000000-0000-0000-0000-000000000001', 'member', true),
  ('96000000-0000-0000-0000-000000000001', '95000000-0000-0000-0000-000000000002', 'member', true);

create temporary table ids (chave text primary key, valor text);
grant all on ids to authenticated, service_role;

-- 1. A conexão "padrão" nasce ativa e sem nenhum segredo em texto.
select is((select count(*)::int from private.unipile_connections), 1, 'the migration creates one connection');
select is(
  (select name || ' ' || api_version || ' ' || base_url || ' ' || active from private.unipile_connections),
  'padrão v2 https://api.unipile.com true', 'the default connection is v2 at api.unipile.com and active');
select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'private' and table_name = 'unipile_connections'
      and column_name in ('api_key', 'webhook_secret', 'secret', 'token', 'password')),
  0, 'no column keeps the key or the webhook secret in text');
select is(
  (select api_key_secret_name is not null and webhook_secret_name is not null from private.unipile_connections where active),
  true, 'the connection names the Vault secrets of the key and of the webhook');
select throws_ok(
  $$insert into private.unipile_connections (name, base_url, api_version, api_key_secret_name, webhook_secret_name, active)
    values ('outra', 'https://api2.unipile.com:13211', 'v1', 'k', 'w', true)$$,
  '23505', null, 'the database allows at most one active connection');
select is((select count(*)::int from pg_indexes where schemaname = 'private' and tablename = 'unipile_connections'
  and indexdef ilike '%unique%' and indexdef ilike '%where%active%'), 1, 'the single active connection is a partial unique index');

-- 2. Uma Sequência com um Envio e uma resposta, pela Conta remetente do titular (conexão padrão).
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '95000000-0000-0000-0000-000000000001', true);
insert into ids select 'conta', id::text from public.save_target_account(
  '96000000-0000-0000-0000-000000000001', 'Empresa Alvo', 'https://empresa-alvo.test');
insert into ids select 'maria', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta'), 'Maria Souza', 'Diretora', 'maria@empresa-alvo.test');
insert into ids select 'sequencia', id::text from public.create_sequence(
  '96000000-0000-0000-0000-000000000001', (select valor from ids where chave = 'conta'),
  jsonb_build_object('steps', jsonb_build_array(
    jsonb_build_object('id', 'passo-1', 'canal', 'email', 'contatoId', (select valor from ids where chave = 'maria'),
      'delayDiasUteis', 0, 'titulo', 'Abertura', 'assunto', 'Oi', 'corpo', 'Olá, Maria.'))));
insert into ids select 'tentativa', attempt_id::text from public.create_sender_connection_attempt(
  '96000000-0000-0000-0000-000000000001', 'email', null);
reset role;
select is(public.complete_sender_connection_attempt(
  (select valor::uuid from ids where chave = 'tentativa'), 'unipile-a-1', 'GOOGLE', 'CREATION_SUCCESS'), 'completed',
  'the owner connects an account through the default connection');
select public.apply_unipile_sender_status('unipile-a-1', 'SYNC_SUCCESS');
select is((pg_temp.conta()).unipile_connection_id, (select id from private.unipile_connections where active),
  'a new sender account is bound to the active connection');
set local role authenticated;
insert into ids select 'envio', id::text from public.confirm_sequence_step(
  (select valor::uuid from ids where chave = 'sequencia'), 'passo-1');
reset role;
select outcome from public.release_sequence_step_send(
  (select valor::uuid from ids where chave = 'envio'), '95000000-0000-0000-0000-000000000001');
select public.record_sequence_step_send_result((select valor::uuid from ids where chave = 'envio'), 'sent', 'e-1', '<m1@x>', null);
update private.sequence_step_sends set provider_thread_id = 't-1' where id = (select valor::uuid from ids where chave = 'envio');
with i as (
  insert into public.account_interactions (workspace_id, target_account_id, contact_id, kind, occurred_at, source, recorded_by)
  values ('96000000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'conta'),
    (select valor::uuid from ids where chave = 'maria'), 'email-recebido', now(), 'sequencia', '95000000-0000-0000-0000-000000000001')
  returning id)
insert into ids select 'interacao', id::text from i;
insert into private.received_emails (interaction_id, workspace_id, owner_user_id, sequence_id, send_id, contact_id,
  sender_account_id, provider_email_id, provider_thread_id, from_email, subject, body, received_at)
values ((select valor::uuid from ids where chave = 'interacao'), '96000000-0000-0000-0000-000000000001',
  '95000000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'sequencia'),
  (select valor::uuid from ids where chave = 'envio'), (select valor::uuid from ids where chave = 'maria'),
  (pg_temp.conta()).id, 'email-resp-1', 't-1', 'maria@empresa-alvo.test', 'Re: Oi', 'Tenho interesse.', now());
insert into ids select 'linha', (pg_temp.conta()).id::text;
insert into ids select 'padrao', id::text from private.unipile_connections where active;

-- 3. A unicidade do id da Unipile é por conexão.
insert into private.unipile_connections (id, name, base_url, api_version, api_key_secret_name, webhook_secret_name)
values ('97000000-0000-0000-0000-000000000009', 'auxiliar', 'https://api9.unipile.com:1', 'v1', 'k9', 'w9');
select lives_ok(
  $$insert into private.sender_accounts (unipile_connection_id, workspace_id, owner_user_id, channel, unipile_account_id, provider, status)
    values ('97000000-0000-0000-0000-000000000009', '96000000-0000-0000-0000-000000000001',
      '95000000-0000-0000-0000-000000000002', 'email', 'unipile-a-1', 'GOOGLE', 'ready')$$,
  'the same Unipile id can appear in another connection');
select throws_ok(
  $$insert into private.sender_accounts (unipile_connection_id, workspace_id, owner_user_id, channel, unipile_account_id, provider, status)
    values ((select valor::uuid from ids where chave = 'padrao'), '96000000-0000-0000-0000-000000000001',
      '95000000-0000-0000-0000-000000000002', 'email', 'unipile-a-1', 'GOOGLE', 'ready')$$,
  '23505', null, 'but not twice in the same connection');
delete from private.sender_accounts where owner_user_id = '95000000-0000-0000-0000-000000000002';
delete from private.unipile_connections where id = '97000000-0000-0000-0000-000000000009';

-- 4. Cadastrar e ativar: só o Nan (SQL Editor) e o service_role.
set local role authenticated;
select throws_ok(
  $$select public.register_unipile_connection('nova', 'https://api4.unipile.com:14444', 'v1', 'unipile_nova_api_key', 'unipile_nova_webhook_secret')$$,
  '42501', null, 'signed-in users cannot register a connection');
select throws_ok($$select public.activate_unipile_connection(gen_random_uuid())$$,
  '42501', null, 'signed-in users cannot activate a connection');
reset role;
set local role anon;
select throws_ok(
  $$select public.register_unipile_connection('nova', 'https://api4.unipile.com:14444', 'v1', 'unipile_nova_api_key', 'unipile_nova_webhook_secret')$$,
  '42501', null, 'anonymous callers cannot register a connection');
reset role;
set local role service_role;
insert into ids select 'nova', public.register_unipile_connection(
  'nova', 'https://api4.unipile.com:14444/', 'v1', 'unipile_nova_api_key', 'unipile_nova_webhook_secret')::text;
reset role;
select is((select name || ' ' || api_version || ' ' || base_url || ' ' || active from private.unipile_connections
  where id = (select valor::uuid from ids where chave = 'nova')),
  'nova v1 https://api4.unipile.com:14444 false', 'a registered connection starts inactive, without the trailing slash');
select throws_ok(
  $$select public.register_unipile_connection('v3', 'https://x.test', 'v3', 'k', 'w')$$,
  '22023', null, 'the version must be v1 or v2');
select throws_ok(
  $$select public.register_unipile_connection('http', 'http://x.test', 'v2', 'k', 'w')$$,
  '22023', null, 'the address must be https');
select throws_ok(
  $$select public.register_unipile_connection('sem-segredo', 'https://x.test', 'v2', '', 'w')$$,
  '22023', null, 'the secret names are required');
select is((select count(*)::int from private.unipile_connections), 2, 'the refused registrations created nothing');
select is(
  (select public.register_unipile_connection('nova', 'https://api4.unipile.com:14444', 'v1', 'unipile_nova_api_key', 'unipile_nova_webhook_secret')::text),
  (select valor from ids where chave = 'nova'), 'registering the same name again updates the same connection');
select is((select count(*)::int from private.unipile_connections), 2, 'and does not duplicate it');

-- 5. Uma conexão cadastrada e ainda não ativa não muda nada.
select is((pg_temp.conta()).status, 'ready', 'registering does not touch the sender accounts');

insert into ids select 'historico',
  ((select count(*) from private.sender_accounts) + (select count(*) from private.sequence_step_sends)
  + (select count(*) from private.received_emails) + (select count(*) from public.account_interactions)
  + (select count(*) from public.sequences))::text;

-- 6. Ativar a nova: desativa a anterior, marca as Contas remetentes das outras conexões e não apaga nada.
set local role authenticated;
select throws_ok($$select public.activate_unipile_connection(gen_random_uuid())$$, '42501', null,
  'still forbidden to signed-in users');
reset role;
select throws_ok($$select public.activate_unipile_connection(gen_random_uuid())$$, 'P0002', null,
  'an unknown connection is refused');
set local role service_role;
select is(public.activate_unipile_connection((select valor::uuid from ids where chave = 'nova')), 1,
  'activating returns how many sender accounts were marked');
reset role;
select is((select array_agg(name order by name) from private.unipile_connections where active), array['nova'],
  'only the new connection is active');
select is((select active from private.unipile_connections where id = (select valor::uuid from ids where chave = 'padrao')), false,
  'the previous connection is deactivated');
select is((pg_temp.conta()).status || ' ' || (pg_temp.conta()).reconciliation_required, 'reconnect_required true',
  'the sender account of the previous connection must reconnect');
select is(
  (select count(*)::int from private.sender_accounts)
  + (select count(*)::int from private.sequence_step_sends)
  + (select count(*)::int from private.received_emails)
  + (select count(*)::int from public.account_interactions)
  + (select count(*)::int from public.sequences),
  (select valor::int from ids where chave = 'historico'),
  'nothing was deleted: sender account, send, reply, interaction and sequence are all still there');
set local role service_role;
select is(public.activate_unipile_connection((select valor::uuid from ids where chave = 'nova')), 0,
  'activating the already active connection changes nothing');
reset role;

-- 7. A reconciliação e o Executor ignoram o que é da conexão anterior.
select is((select count(*)::int from public.claim_sender_reconciliations(3)), 0, 'nothing waits for reconciliation yet');

-- 8. Reconectar depois da troca reaproveita a linha, com o id novo e a conexão ativa.
set local role authenticated;
select set_config('request.jwt.claim.sub', '95000000-0000-0000-0000-000000000001', true);
insert into ids select 'reconexao', attempt_id::text from public.create_sender_connection_attempt(
  '96000000-0000-0000-0000-000000000001', 'email', (select valor::uuid from ids where chave = 'linha'));
reset role;
select is(public.complete_sender_connection_attempt(
  (select valor::uuid from ids where chave = 'reconexao'), 'unipile-b-1', 'GOOGLE', 'RECONNECTED'), 'completed',
  'after the swap, the reconnection accepts the new id on the same row');
select is(
  (pg_temp.conta()).id::text || ' ' || (pg_temp.conta()).unipile_account_id || ' ' || (pg_temp.conta()).unipile_connection_id::text,
  (select valor from ids where chave = 'linha') || ' unipile-b-1 ' || (select valor from ids where chave = 'nova'),
  'the same row now holds the new id and the active connection');
select is((pg_temp.conta()).owner_user_id::text || ' ' || (pg_temp.conta()).channel || ' ' || (pg_temp.conta()).provider,
  '95000000-0000-0000-0000-000000000001 email GOOGLE', 'owner, channel and provider are kept');
select is((pg_temp.conta()).status || ' ' || (pg_temp.conta()).reconciliation_required, 'syncing true',
  'the reconnected account still requires reconciliation');
select is((select sender_account_id::text from private.sequence_step_sends where id = (select valor::uuid from ids where chave = 'envio')),
  (select valor from ids where chave = 'linha'), 'the send stays tied to the same sender account');
select is((select sender_account_id::text from private.received_emails where interaction_id = (select valor::uuid from ids where chave = 'interacao')),
  (select valor from ids where chave = 'linha'), 'the reply stays tied to the same sender account');
select is((select count(*)::int from public.account_interactions where id = (select valor::uuid from ids where chave = 'interacao')), 1,
  'the interaction is still there');

-- 9. A reconciliação só confere Envios que saíram pela conexão ativa.
select is((select count(*)::int from public.claim_sender_reconciliations(3)), 1, 'the reconnected account is reconciled');
select is((select count(*)::int from public.conversations_to_reconcile((pg_temp.conta()).id)), 0,
  'a send of the previous connection is not looked up in the new account');
select is((select count(*)::int from public.chats_to_reconcile((pg_temp.conta()).id)), 0,
  'and no chat of the previous connection either');
update private.sequence_step_sends set sent_at = now() + interval '1 minute'
where id = (select valor::uuid from ids where chave = 'envio');
select is((select count(*)::int from public.conversations_to_reconcile((pg_temp.conta()).id)), 1,
  'a send made after the swap is looked up');
update private.sender_accounts set unipile_connection_id = (select valor::uuid from ids where chave = 'padrao')
where id = (select valor::uuid from ids where chave = 'linha');
select is((select count(*)::int from public.conversations_to_reconcile((pg_temp.conta()).id)), 0,
  'a sender account that is not of the active connection is not reconciled');
update private.sender_accounts set reconciliation_claimed_until = null where id = (select valor::uuid from ids where chave = 'linha');
select is((select count(*)::int from public.claim_sender_reconciliations(3)), 0,
  'the Executor does not claim a sender account of a connection that is not active');
update private.sender_accounts set unipile_connection_id = (select valor::uuid from ids where chave = 'nova')
where id = (select valor::uuid from ids where chave = 'linha');

-- 10. O que continua recusado.
-- 10a. A linha já é da conexão ativa, com id diferente.
set local role authenticated;
insert into ids select 'mesma-conexao', attempt_id::text from public.create_sender_connection_attempt(
  '96000000-0000-0000-0000-000000000001', 'email', (select valor::uuid from ids where chave = 'linha'));
reset role;
select is(public.complete_sender_connection_attempt(
  (select valor::uuid from ids where chave = 'mesma-conexao'), 'unipile-outro', 'GOOGLE', 'RECONNECTED'), 'identity_mismatch',
  'a row already on the active connection does not accept a different id');
-- 10b. O mesmo id na conexão ativa continua reconectando.
set local role authenticated;
insert into ids select 'mesmo-id', attempt_id::text from public.create_sender_connection_attempt(
  '96000000-0000-0000-0000-000000000001', 'email', (select valor::uuid from ids where chave = 'linha'));
reset role;
select is(public.complete_sender_connection_attempt(
  (select valor::uuid from ids where chave = 'mesmo-id'), 'unipile-b-1', 'GOOGLE', 'RECONNECTED'), 'completed',
  'the same id on the active connection still reconnects');
-- 10c. Troca de conexão com outro provedor.
select public.activate_unipile_connection(id) from private.unipile_connections where name = 'padrão';
set local role authenticated;
insert into ids select 'outro-provedor', attempt_id::text from public.create_sender_connection_attempt(
  '96000000-0000-0000-0000-000000000001', 'email', (select valor::uuid from ids where chave = 'linha'));
reset role;
select is(public.complete_sender_connection_attempt(
  (select valor::uuid from ids where chave = 'outro-provedor'), 'unipile-c-1', 'OUTLOOK', 'RECONNECTED'), 'identity_mismatch',
  'a swap reconnection with another provider is refused');
select is((pg_temp.conta()).unipile_account_id, 'unipile-b-1', 'and the row keeps its id');
-- 10d. Troca de conexão por outro dono: a tentativa é de um colega, mas aponta a linha do titular.
insert into private.sender_connection_attempts (id, workspace_id, owner_user_id, channel, expected_provider, reconnect_sender_account_id)
values ('98000000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-000000000001',
  '95000000-0000-0000-0000-000000000002', 'email', 'EMAIL', (select valor::uuid from ids where chave = 'linha'));
select is(public.complete_sender_connection_attempt('98000000-0000-0000-0000-000000000001', 'unipile-d-1', 'GOOGLE', 'RECONNECTED'),
  'identity_mismatch', 'another owner cannot take over the row in a swap');
-- 10e. Uma tentativa que não é reconexão daquela linha cria uma Conta nova, sem tocar na antiga.
set local role authenticated;
insert into ids select 'nova-conta', attempt_id::text from public.create_sender_connection_attempt(
  '96000000-0000-0000-0000-000000000001', 'email', null);
reset role;
select is(public.complete_sender_connection_attempt(
  (select valor::uuid from ids where chave = 'nova-conta'), 'unipile-b-1', 'GOOGLE', 'CREATION_SUCCESS'), 'completed',
  'a fresh connection attempt may reuse an id that belongs to another connection');
select is((select count(*)::int from private.sender_accounts where unipile_account_id = 'unipile-b-1'), 2,
  'and it makes a new row instead of touching the old one');
-- 10f. O id novo já é de outra linha da conexão ativa.
set local role authenticated;
insert into ids select 'ja-ligado', attempt_id::text from public.create_sender_connection_attempt(
  '96000000-0000-0000-0000-000000000001', 'email', (select valor::uuid from ids where chave = 'linha'));
reset role;
select is(public.complete_sender_connection_attempt(
  (select valor::uuid from ids where chave = 'ja-ligado'), 'unipile-b-1', 'GOOGLE', 'RECONNECTED'), 'identity_already_linked',
  'a swap onto an id that is already linked on the active connection is refused');

select * from finish();
rollback;

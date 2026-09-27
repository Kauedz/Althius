begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(21);

create temporary table chamadas (url text, token text);
create or replace function private.post_to_sequence_runner(p_url text, p_token text) returns void
language sql security definer set search_path = '' as $f$
  insert into pg_temp.chamadas values (p_url, p_token);
$f$;

create function pg_temp.conta() returns private.sender_accounts language sql as $f$
  select * from private.sender_accounts where unipile_account_id = 'unipile-google-9';
$f$;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values ('90000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'titular@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values ('91000000-0000-0000-0000-000000000001', 'empresa', 'Cliente');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'member', true);

create temporary table ids (chave text primary key, valor text);
grant all on ids to authenticated, service_role;

-- Uma Sequência ativa com um passo que já saiu pela Conta remetente de E-mail do titular.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
insert into ids select 'conta', id::text from public.save_target_account(
  '91000000-0000-0000-0000-000000000001', 'Empresa Alvo', 'https://empresa-alvo.test');
insert into ids select 'maria', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta'), 'Maria Souza', 'Diretora', 'maria@empresa-alvo.test');
insert into ids select 'sequencia', id::text from public.create_sequence(
  '91000000-0000-0000-0000-000000000001', (select valor from ids where chave = 'conta'),
  jsonb_build_object('steps', jsonb_build_array(
    jsonb_build_object('id', 'passo-1', 'canal', 'email', 'contatoId', (select valor from ids where chave = 'maria'),
      'delayDiasUteis', 0, 'titulo', 'Abertura', 'assunto', 'Oi', 'corpo', 'Olá, Maria.'))));
insert into ids select 'tentativa', attempt_id::text from public.create_sender_connection_attempt(
  '91000000-0000-0000-0000-000000000001', 'email', null);
reset role;
select public.complete_sender_connection_attempt(
  (select valor::uuid from ids where chave = 'tentativa'), 'unipile-google-9', 'GOOGLE', 'CREATION_SUCCESS');
select public.apply_unipile_sender_status('unipile-google-9', 'SYNC_SUCCESS');
set local role authenticated;
insert into ids select 'envio', id::text from public.confirm_sequence_step(
  (select valor::uuid from ids where chave = 'sequencia'), 'passo-1');
reset role;
select outcome from public.release_sequence_step_send(
  (select valor::uuid from ids where chave = 'envio'), '90000000-0000-0000-0000-000000000001');
select public.record_sequence_step_send_result((select valor::uuid from ids where chave = 'envio'), 'sent', 'e-1', '<m1@x>', null);
update private.sequence_step_sends set provider_thread_id = 't-1' where id = (select valor::uuid from ids where chave = 'envio');
select private.configure_sequence_runner('https://abc.supabase.co');

select is((pg_temp.conta()).status || ' ' || (pg_temp.conta()).reconciliation_required, 'ready false',
  'a freshly connected account is ready and needs no reconciliation');
select is((select count(*)::int from public.claim_sender_reconciliations(3)), 0, 'a ready account is not reconciled');

-- 1. A conta cai: exige reconciliação, e ainda não está pronta para ela.
select public.apply_unipile_sender_status('unipile-google-9', 'CREDENTIALS');
select is((pg_temp.conta()).status || ' ' || (pg_temp.conta()).reconciliation_required || ' ' || ((pg_temp.conta()).reconciliation_ready_at is null),
  'reconnect_required true true', 'a dropped account requires reconciliation');
select is((select count(*)::int from public.claim_sender_reconciliations(3)), 0,
  'an account still down is not reconciled');
select is(private.kick_sequence_runner(), false, 'an account still down does not call the executor');

-- 2. A Unipile avisa que a conta voltou: ela fica esperando a reconciliação, sem liberar envios.
select public.apply_unipile_sender_status('unipile-google-9', 'OK');
select is((pg_temp.conta()).status || ' ' || ((pg_temp.conta()).reconciliation_ready_at is not null),
  'syncing true', 'the account back online waits for reconciliation, still not ready');
select is(private.kick_sequence_runner(), true, 'an account waiting for reconciliation calls the executor');

-- 3. O Executor reserva a conta e recebe as conversas das Sequências ativas que saíram por ela.
set local role authenticated;
select throws_ok($$select * from public.claim_sender_reconciliations(3)$$, '42501',
  'permission denied for function claim_sender_reconciliations', 'signed-in users cannot claim reconciliations');
select throws_ok($$select * from public.conversations_to_reconcile(gen_random_uuid())$$, '42501',
  'permission denied for function conversations_to_reconcile', 'signed-in users cannot list conversations to reconcile');
reset role;
create temporary table reserva as select * from public.claim_sender_reconciliations(3);
select is((select unipile_account_id || ' ' || owner_user_id from reserva),
  'unipile-google-9 90000000-0000-0000-0000-000000000001', 'the executor claims the account to reconcile');
select is((select count(*)::int from public.claim_sender_reconciliations(3)), 0, 'a claimed account is not claimed twice');
select is((select string_agg(send_id::text || ' ' || provider_thread_id, ',') from public.conversations_to_reconcile((pg_temp.conta()).id)),
  (select valor from ids where chave = 'envio') || ' t-1', 'the conversation of the last send of an active sequence is listed');
update public.sequences set status = 'pausada' where id = (select valor::uuid from ids where chave = 'sequencia');
select is((select count(*)::int from public.conversations_to_reconcile((pg_temp.conta()).id)), 0,
  'a paused sequence sends nothing, so its conversation is not listed');
update public.sequences set status = 'ativa' where id = (select valor::uuid from ids where chave = 'sequencia');

-- 4. Uma nova queda no meio da reconciliação pede outra rodada; conferido tudo, a conta volta a enviar.
select is(public.finish_sender_reconciliation((pg_temp.conta()).id, now() - interval '1 second'), false,
  'an account that came back after the claim is not released by that round');
select is(public.finish_sender_reconciliation((pg_temp.conta()).id, (select claimed_at from reserva)), true,
  'with every conversation checked, the reconciliation finishes');
select is((pg_temp.conta()).status || ' ' || (pg_temp.conta()).reconciliation_required || ' ' || ((pg_temp.conta()).reconciliation_ready_at is null),
  'ready false true', 'the reconciled account is ready again');
select is(private.kick_sequence_runner(), false, 'with nothing due and nothing to reconcile, the executor is not called');

-- 5. Reconectar pela autenticação hospedada também exige reconciliação, só depois da sincronização.
insert into ids select 'conta-remetente', (pg_temp.conta()).id::text;
set local role authenticated;
insert into ids select 'reconexao', attempt_id::text from public.create_sender_connection_attempt(
  '91000000-0000-0000-0000-000000000001', 'email', (select valor::uuid from ids where chave = 'conta-remetente'));
reset role;
select is(public.complete_sender_connection_attempt(
  (select valor::uuid from ids where chave = 'reconexao'), 'unipile-google-9', 'GOOGLE', 'RECONNECTED'), 'completed',
  'the owner reconnects the same identity');
select is((pg_temp.conta()).status || ' ' || (pg_temp.conta()).reconciliation_required || ' ' || ((pg_temp.conta()).reconciliation_ready_at is null),
  'syncing true true', 'a reconnected account requires reconciliation and waits for the sync');
select public.apply_unipile_sender_status('unipile-google-9', 'SYNC_SUCCESS');
select is((select count(*)::int from public.claim_sender_reconciliations(3)), 1,
  'once synced, the reconnected account is reconciled');
select is(public.finish_sender_reconciliation((pg_temp.conta()).id, now()), true, 'and released');

select * from finish();
rollback;

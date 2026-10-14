begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(42);

-- Recuperar conexões e interromper acesso revogado (canais-11).

create temporary table ids (chave text primary key, valor text);
grant all on ids to authenticated, service_role;

create function pg_temp.relogio(p_at timestamptz) returns void language plpgsql security definer as $f$
begin
  execute format(
    'create or replace function private.clock_now() returns timestamptz language sql stable set search_path = '''' '
    'as $c$ select %L::timestamptz $c$', p_at);
end
$f$;

create function pg_temp.envio(p_step text) returns private.sequence_step_sends language sql security definer as $f$
  select * from private.sequence_step_sends where step_id = p_step;
$f$;

create function pg_temp.conta() returns private.sender_accounts language sql security definer as $f$
  select * from private.sender_accounts where unipile_account_id = 'unipile-rec';
$f$;

create function pg_temp.sequencia() returns public.sequences language sql security definer as $f$
  select * from public.sequences where id = (select valor::uuid from ids where chave = 'seq');
$f$;

create function pg_temp.motivo() returns text language sql security definer as $f$
  select document ->> 'motivoPause' from private.sequence_documents where sequence_id = (select valor::uuid from ids where chave = 'seq');
$f$;

create function pg_temp.resposta(p_id text) returns jsonb language sql as $f$
  select jsonb_build_object('id', p_id, 'message_id', '<' || p_id || '@x>', 'thread_id', 't-1', 'subject', 'Re: Oi',
    'body', 'Podemos falar amanhã?', 'date', '2026-10-05T16:00:00Z',
    'from', jsonb_build_array(jsonb_build_object('email', 'maria@rec.test')),
    'to', jsonb_build_array(jsonb_build_object('email', 'titular@rec.test')));
$f$;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('b1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'titular@rec.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('b1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'colega@rec.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('b1000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'admin@rec.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('b1000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'fora@outra.test', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('b2000000-0000-0000-0000-000000000001', 'empresa', 'Reconexão'),
  ('b2000000-0000-0000-0000-000000000002', 'empresa', 'Outra');
insert into private.workspace_contracts (workspace_id, tier_id, starts_at) select w.id, 'escala', date_trunc('month', now()) from public.workspaces w where w.id in ('b2000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002') on conflict (workspace_id) do nothing; -- contrato de teste (automacao-e-contrato-inativo)

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'member', true),
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'member', true),
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 'admin', true),
  ('b2000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000004', 'admin', true);


create function pg_temp.i(p_chave text) returns uuid language sql as $f$
  select valor::uuid from ids where chave = p_chave;
$f$;

create function pg_temp.como(p_user text) returns void language sql as $f$
  select set_config('request.jwt.claim.role', 'authenticated', true), set_config('request.jwt.claim.sub', p_user, true);
$f$;

create function pg_temp.documento() returns jsonb language sql as $f$
  select jsonb_build_object('participantesIds', '[]'::jsonb, 'janelaPadrao', '{"de": "09:00", "ate": "18:00"}'::jsonb,
    'steps', jsonb_build_array(
      jsonb_build_object('id', 'r1', 'canal', 'email', 'contatoId', (select valor from ids where chave = 'maria'),
        'delayDiasUteis', 0, 'titulo', 'Abertura', 'assunto', 'Oi', 'corpo', 'Olá, Maria.'),
      jsonb_build_object('id', 'r2', 'canal', 'email', 'contatoId', (select valor from ids where chave = 'maria'),
        'delayDiasUteis', 1, 'titulo', 'Follow-up', 'assunto', 'Re: Oi', 'corpo', 'Alguma novidade?')));
$f$;

grant execute on function pg_temp.relogio(timestamptz), pg_temp.envio(text), pg_temp.conta(), pg_temp.sequencia(),
  pg_temp.motivo(), pg_temp.resposta(text), pg_temp.i(text), pg_temp.como(text), pg_temp.documento()
  to authenticated, service_role;

-- A titular, com a Conta remetente de E-mail pronta, ativa uma Sequência; o primeiro passo sai.
set local role authenticated;
select pg_temp.como('b1000000-0000-0000-0000-000000000001');
insert into ids select 'conta', id::text from public.save_target_account('b2000000-0000-0000-0000-000000000001', 'Empresa Rec', 'https://rec.test');
insert into ids select 'maria', id::text from public.create_contact(pg_temp.i('conta'), 'Maria Souza', 'Diretora', 'maria@rec.test');
insert into ids select 'seq', id::text from public.create_sequence('b2000000-0000-0000-0000-000000000001',
  (select valor from ids where chave = 'conta'), pg_temp.documento());
insert into ids select 'tentativa', attempt_id::text from public.create_sender_connection_attempt(
  'b2000000-0000-0000-0000-000000000001', 'email', null);
reset role;
select public.complete_sender_connection_attempt(pg_temp.i('tentativa'), 'unipile-rec', 'GOOGLE', 'CREATION_SUCCESS');
select public.apply_unipile_sender_status('unipile-rec', 'SYNC_SUCCESS');
select pg_temp.relogio('2026-10-05 10:00-03');
set local role authenticated;
select pg_temp.como('b1000000-0000-0000-0000-000000000001');
select is((select outcome from public.activate_sequence(pg_temp.i('seq'))), 'activated', 'the owner activates the sequence');
reset role;
set local role service_role;
select is((select count(*)::int from public.claim_due_step_sends(10)), 1, 'the first step is due');
select is((select outcome from public.release_due_step_send((pg_temp.envio('r1')).id)), 'released', 'and released');
select public.record_sequence_step_send_result((pg_temp.envio('r1')).id, 'sent', 'e-r1', '<r1-sent@x>', null);
reset role;
update private.sequence_step_sends set provider_thread_id = 't-1' where step_id = 'r1';
select is((pg_temp.envio('r2')).status, 'scheduled', 'the follow-up is scheduled for the next business day');

-- 1. A Unipile avisa que a conta caiu: a Sequência pausa com o motivo, e nada sai.
set local role service_role;
select is(public.apply_unipile_sender_status('unipile-rec', 'CREDENTIALS'), true, 'the sender account is marked as dropped');
select is(public.hold_sequences_of_lost_sender('unipile-rec'), 1, 'the active sequence that uses it is paused');
select is(public.hold_sequences_of_lost_sender('unipile-rec'), 0, 'a second notice pauses nothing more');
reset role;
select is((pg_temp.sequencia()).status || ' ' || ((pg_temp.sequencia()).public_summary ->> 'status'), 'pausada pausada',
  'the sequence and its shared projection say paused');
select is(pg_temp.motivo(), 'Conta remetente de E-mail desconectada. Reconecte a conta e retome a Sequência',
  'the owner reads the honest reason');
select is((pg_temp.envio('r1')).status || ' ' || (pg_temp.envio('r2')).status, 'sent scheduled',
  'the history is kept: what went out stays sent, what is pending stays pending');
set local role authenticated;
select pg_temp.como('b1000000-0000-0000-0000-000000000002');
select is((select string_agg(sequence_id::text || ' ' || channel, ',') from public.list_sequence_sender_holds('b2000000-0000-0000-0000-000000000001')),
  pg_temp.i('seq')::text || ' email', 'a colleague sees only that the sender account of the sequence dropped');
select pg_temp.como('b1000000-0000-0000-0000-000000000004');
select throws_ok($$select * from public.list_sequence_sender_holds('b2000000-0000-0000-0000-000000000001')$$,
  '42501', 'active membership required', 'another workspace sees nothing');
reset role;

-- 2. A Contato responde com a conta fora do ar: o webhook grava a resposta (pausa já estava) e a repetição não duplica.
select pg_temp.relogio('2026-10-06 10:00-03');
set local role service_role;
select is((select outcome from public.ingest_unipile_email_event('evt-r-1', 'email.new', 'unipile-rec', pg_temp.resposta('email-r-1'), '{}')),
  'reply', 'a reply received during the outage is recorded');
select is((select outcome from public.ingest_unipile_email_event('evt-r-1', 'email.new', 'unipile-rec', pg_temp.resposta('email-r-1'), '{}')),
  'duplicate_event', 'the same webhook delivered again is ignored');
select is((select outcome from public.ingest_unipile_email_event('thread-check:unipile-rec:email-r-1', 'email.new', 'unipile-rec',
    pg_temp.resposta('email-r-1'), '{}')),
  'duplicate_email', 'the same e-mail found again by the reconciliation replay is not processed twice');
reset role;
select is((select count(*)::int from private.received_emails where sequence_id = pg_temp.i('seq')), 1, 'one reply, one record');
select is((select count(*)::int from public.account_interactions where target_account_id = pg_temp.i('conta') and kind = 'email-recebido'), 1,
  'and one Interação, however many times the event arrives');
set local role service_role;
select is((select count(*)::int from public.claim_due_step_sends(10)), 0, 'the due follow-up is not claimed while paused');
select is((select outcome from public.release_due_step_send((pg_temp.envio('r2')).id)), 'sequence_not_active',
  'and a release attempt is refused');

-- 3. A pessoa reconecta: a conta volta, a reconciliação confere a conversa (o backlog), e mesmo assim nada sai sozinho.
select public.apply_unipile_sender_status('unipile-rec', 'OK');
create temporary table reserva as select * from public.claim_sender_reconciliations(3);
select is((select unipile_account_id from reserva), 'unipile-rec', 'the account back online is reconciled');
select is((select provider_thread_id from public.conversations_to_reconcile((pg_temp.conta()).id)), 't-1',
  'only the conversation of the sequence is checked, not the whole inbox');
select is(public.finish_sender_reconciliation((pg_temp.conta()).id, (select claimed_at from reserva)), true, 'and released');
reset role;
select is((pg_temp.conta()).status, 'ready', 'the sender account is ready again');
select is((pg_temp.sequencia()).status, 'pausada', 'but the sequence stays paused: reconnecting never resumes');
set local role service_role;
select is((select count(*)::int from public.claim_due_step_sends(10)), 0, 'so nothing is sent on its own');
reset role;

-- 4. A titular retoma: o motivo sai, e o passo pendente volta a ser programado a partir da retomada, sem rajada.
set local role authenticated;
select pg_temp.como('b1000000-0000-0000-0000-000000000001');
select lives_ok($$select public.update_owned_sequence(pg_temp.i('seq'), pg_temp.documento(), null, 'ativa')$$, 'the owner resumes');
select is((select count(*)::int from public.list_sequence_sender_holds('b2000000-0000-0000-0000-000000000001')), 0,
  'the hold is cleared on resume');
reset role;
select is((pg_temp.envio('r2')).status, 'scheduled', 'the pending step is scheduled again');

-- 5. Um passo vencido barrado pelo Executor: uma conta só sincronizando não pausa; uma que caiu de vez, pausa.
update private.sequence_step_sends set scheduled_for = '2026-10-06 09:00-03', claimed_until = null where step_id = 'r2';
update private.sender_accounts set status = 'syncing' where unipile_account_id = 'unipile-rec';
set local role service_role;
select is((select outcome from public.release_due_step_send((pg_temp.envio('r2')).id)), 'sender_not_ready', 'a syncing account blocks the send');
select is(public.hold_sequence_for_unready_send((pg_temp.envio('r2')).id), false, 'but a syncing account is transient: no pause');
reset role;
update private.sender_accounts set status = 'reconnect_required', reconciliation_required = true where unipile_account_id = 'unipile-rec';
set local role service_role;
select is(public.hold_sequence_for_unready_send((pg_temp.envio('r2')).id), true,
  'an account that dropped for good pauses the sequence even if the webhook was lost');
reset role;
select is((pg_temp.sequencia()).status || ' ' || (pg_temp.envio('r2')).last_error, 'pausada sender_not_ready',
  'paused, with the reason kept on the step');

-- 6. A titular sai do Workspace com um passo já reservado: a liberação barra, o motivo fica, ninguém herda nada.
update private.sender_accounts set status = 'ready', reconciliation_required = false where unipile_account_id = 'unipile-rec';
set local role authenticated;
select pg_temp.como('b1000000-0000-0000-0000-000000000001');
select lives_ok($$select public.update_owned_sequence(pg_temp.i('seq'), pg_temp.documento(), null, 'ativa')$$, 'the owner resumes again');
reset role;
update private.sequence_step_sends set scheduled_for = '2026-10-06 09:00-03', claimed_until = null where step_id = 'r2';
set local role service_role;
select is((select count(*)::int from public.claim_due_step_sends(10)), 1, 'the executor reserves the due step');
reset role;
set local role authenticated;
select pg_temp.como('b1000000-0000-0000-0000-000000000003');
select lives_ok($$select public.remove_participant('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001')$$,
  'the administrator removes the owner while the step is reserved');
reset role;
set local role service_role;
select is((select outcome from public.release_due_step_send((pg_temp.envio('r2')).id)), 'owner_not_responsible',
  'the reserved step is not released for someone without an active membership');
reset role;
select is((pg_temp.envio('r2')).status || ' ' || (pg_temp.envio('r2')).last_error, 'scheduled owner_not_responsible',
  'it ends in an auditable state, with the reason');
select is((select owner_user_id::text from public.sales_responsibilities where target_account_id = (select valor from ids where chave = 'conta')),
  'b1000000-0000-0000-0000-000000000001', 'the target account is not handed to anyone automatically');
set local role authenticated;
select pg_temp.como('b1000000-0000-0000-0000-000000000001');
select throws_ok($$select public.update_owned_sequence(pg_temp.i('seq'), pg_temp.documento(), null, 'pausada')$$,
  '42501', 'sequence not found or not owned by active user', 'the removed owner cannot change the sequence anymore');
select pg_temp.como('b1000000-0000-0000-0000-000000000003');
select throws_ok($$select * from public.get_owned_sequence(pg_temp.i('seq'))$$,
  '42501', 'sequence not found or not owned by active user', 'and the administrator does not take the document over');

-- 7. Quem não é o backend não pausa nada.
select throws_ok($$select public.hold_sequences_of_lost_sender('unipile-rec')$$, '42501',
  'permission denied for function hold_sequences_of_lost_sender', 'signed-in users cannot pause by sender');
select throws_ok($$select public.hold_sequence_for_unready_send(gen_random_uuid())$$, '42501',
  'permission denied for function hold_sequence_for_unready_send', 'nor through a send');

select * from finish();
rollback;

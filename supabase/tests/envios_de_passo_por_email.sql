begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(52);

-- Workspace da empresa com o Vendedor responsável (titular), uma colega Membro e um Administrador.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('50000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'titular@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('50000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'colega@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('50000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'admin@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('51000000-0000-0000-0000-000000000001', 'empresa', 'Cliente');

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('51000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'member', true),
  ('51000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 'member', true),
  ('51000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003', 'admin', true);

create temporary table ids (chave text primary key, valor text);
grant all on ids to authenticated, service_role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);

-- O titular cadastra a Conta-alvo, dois Contatos (um sem e-mail) e a Sequência com passos de E-mail.
insert into ids select 'conta', id::text from public.save_target_account(
  '51000000-0000-0000-0000-000000000001', 'Empresa Alvo', 'https://empresa-alvo.test');
insert into ids select 'maria', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta'), 'Maria Souza', 'Diretora', 'Maria@Empresa-Alvo.test');
insert into ids select 'joao', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta'), 'João Lima', 'Gerente');
insert into ids select 'sequencia', id::text from public.create_sequence(
  '51000000-0000-0000-0000-000000000001',
  (select valor from ids where chave = 'conta'),
  jsonb_build_object(
    'participantesIds', jsonb_build_array((select valor from ids where chave = 'maria')),
    'steps', jsonb_build_array(
      jsonb_build_object('id', 'passo-1', 'ordem', 1, 'canal', 'email', 'contatoId', (select valor from ids where chave = 'maria'),
        'delayDiasUteis', 0, 'titulo', 'Abertura', 'assunto', 'Apresentação da Althius', 'corpo', 'Olá, Maria.'),
      jsonb_build_object('id', 'passo-2', 'ordem', 2, 'canal', 'email', 'contatoId', (select valor from ids where chave = 'maria'),
        'delayDiasUteis', 2, 'titulo', 'Follow-up', 'assunto', 'Re: Apresentação da Althius', 'corpo', 'Seguindo o contato.'),
      jsonb_build_object('id', 'passo-3', 'ordem', 3, 'canal', 'whatsapp', 'contatoId', (select valor from ids where chave = 'maria'),
        'delayDiasUteis', 1, 'titulo', 'WhatsApp', 'corpo', 'Oi'),
      jsonb_build_object('id', 'passo-4', 'ordem', 4, 'canal', 'email', 'contatoId', (select valor from ids where chave = 'joao'),
        'delayDiasUteis', 1, 'titulo', 'Sem destino', 'assunto', 'Sem destino', 'corpo', 'Olá, João.'),
      jsonb_build_object('id', 'passo-1-bis', 'ordem', 5, 'canal', 'email', 'contatoId', (select valor from ids where chave = 'maria'),
        'delayDiasUteis', 3, 'titulo', 'Último', 'assunto', 'Fechamento com a {{conta.nome}}',
        'corpo', 'Oi {{contato.primeiro_nome}}, da {{conta.nome}} ({{contato.cargo}}). {{persona}}{{conta.sinal}}Até, {{remetente.nome}}')
    )),
  '{"totalSteps": 4}'::jsonb);

-- A Conta remetente de E-mail do titular fica pronta pelo mesmo caminho da conexão real.
insert into ids select 'tentativa', attempt_id::text from public.create_sender_connection_attempt(
  '51000000-0000-0000-0000-000000000001', 'email', null);
reset role;
set local role service_role;
select is(public.complete_sender_connection_attempt(
  (select valor::uuid from ids where chave = 'tentativa'), 'unipile-google-1', 'GOOGLE', 'CREATION_SUCCESS'
), 'completed', 'the owner email sender account is linked');
select is(public.apply_unipile_sender_status('unipile-google-1', 'SYNC_SUCCESS'), true,
  'the owner email sender account is ready');

-- 1. Confirmar fixa o Destino (ADR-0014).
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);
insert into ids select 'envio-1', id::text from public.confirm_sequence_step(
  (select valor::uuid from ids where chave = 'sequencia'), 'passo-1');
select is(
  (select status || ' ' || destination from public.list_sequence_step_sends((select valor::uuid from ids where chave = 'sequencia'))
    where step_id = 'passo-1'),
  'confirmed maria@empresa-alvo.test',
  'confirming an email step fixes the contact e-mail as the destination');
select is(
  (select contact_id from public.list_sequence_step_sends((select valor::uuid from ids where chave = 'sequencia')) where step_id = 'passo-1'),
  (select valor::uuid from ids where chave = 'maria'),
  'the confirmed send points to the canonical contact');
select throws_ok(
  $$select public.confirm_sequence_step((select valor::uuid from ids where chave = 'sequencia'), 'passo-3')$$,
  '0A000', 'only email steps can be confirmed for now',
  'a WhatsApp step cannot be confirmed by the email cycle');
select throws_ok(
  $$select public.confirm_sequence_step((select valor::uuid from ids where chave = 'sequencia'), 'passo-4')$$,
  '22023', 'contact has no email destination',
  'a step whose contact has no e-mail cannot be confirmed');
select throws_ok(
  $$select public.confirm_sequence_step((select valor::uuid from ids where chave = 'sequencia'), 'passo-99')$$,
  'P0002', 'step not found in the sequence document',
  'an unknown step id is rejected');
select throws_ok(
  $$select count(*) from private.sequence_step_sends$$,
  '42501', 'permission denied for schema private',
  'sends are not readable through direct client queries');

-- 2. Só o titular confirma e lê; a colega e o Administrador não.
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.confirm_sequence_step((select valor::uuid from ids where chave = 'sequencia'), 'passo-1')$$,
  '42501', 'sequence not found or not owned by active user',
  'another member cannot confirm a step of the owner sequence');
select throws_ok(
  $$select * from public.list_sequence_step_sends((select valor::uuid from ids where chave = 'sequencia'))$$,
  '42501', 'sequence not found or not owned by active user',
  'another member cannot list the owner sends');
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.confirm_sequence_step((select valor::uuid from ids where chave = 'sequencia'), 'passo-1')$$,
  '42501', 'sequence not found or not owned by active user',
  'the Workspace administrator cannot confirm a step of the owner sequence');
select throws_ok(
  $$select * from public.release_sequence_step_send((select valor::uuid from ids where chave = 'envio-1'), '50000000-0000-0000-0000-000000000001')$$,
  '42501', 'permission denied for function release_sequence_step_send',
  'signed-in users cannot release a send themselves');
select throws_ok(
  $$select public.record_sequence_step_send_result((select valor::uuid from ids where chave = 'envio-1'), 'sent', 'e1', '<m1@x>', null)$$,
  '42501', 'permission denied for function record_sequence_step_send_result',
  'signed-in users cannot record a provider result themselves');

-- 3. Liberar o envio: só para o titular, com tudo revalidado.
reset role;
set local role service_role;
select is(
  (select outcome from public.release_sequence_step_send((select valor::uuid from ids where chave = 'envio-1'), '50000000-0000-0000-0000-000000000002')),
  'owner_not_responsible',
  'the release for another user is blocked');
create temporary table liberado as
  select * from public.release_sequence_step_send((select valor::uuid from ids where chave = 'envio-1'), '50000000-0000-0000-0000-000000000001');
grant all on liberado to authenticated, service_role;
select is((select outcome from liberado), 'released', 'the owner send is released');
select is((select unipile_account_id from liberado), 'unipile-google-1', 'the release names the owner ready email sender account');
select is((select destination || ' | ' || contact_name from liberado), 'maria@empresa-alvo.test | Maria Souza',
  'the release carries the confirmed destination and the contact name');
select is((select subject || ' | ' || body from liberado), 'Apresentação da Althius | Olá, Maria.',
  'subject and body come from the private document at send time');
select is((select reply_to_message_id from liberado), null, 'a first step opens a new conversation');
select is((select tracking_header_name || ': ' || tracking_header_value from liberado),
  'X-Althius-Envio: ' || (select valor from ids where chave = 'envio-1'),
  'every send carries the Althius header with the send id');
select is(
  (select outcome from public.release_sequence_step_send((select valor::uuid from ids where chave = 'envio-1'), '50000000-0000-0000-0000-000000000001')),
  'in_flight', 'a send already in flight is not released twice');

-- 4. Registrar o resultado do provedor: aceitação não é entrega.
select is(public.record_sequence_step_send_result(
  (select valor::uuid from ids where chave = 'envio-1'), 'sent', 'email-abc', '<msg-1@mail.gmail.com>', null
), 'sent', 'the provider acceptance is recorded as sent');
select is(
  (select outcome from public.release_sequence_step_send((select valor::uuid from ids where chave = 'envio-1'), '50000000-0000-0000-0000-000000000001')),
  'already_sent', 'a sent step is never released again');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);
select is(
  (select status from public.list_sequence_step_sends((select valor::uuid from ids where chave = 'sequencia')) where step_id = 'passo-1'),
  'sent', 'the owner sees the step as sent');
select throws_ok(
  $$select public.confirm_sequence_step((select valor::uuid from ids where chave = 'sequencia'), 'passo-1')$$,
  '55000', 'step already sent or in flight',
  'a sent step cannot be confirmed again');
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000002', true);
select is(
  (select kind || ' ' || source || ' ' || (contact_id = (select valor::uuid from ids where chave = 'maria'))::text
    from public.account_interactions where target_account_id = (select valor::uuid from ids where chave = 'conta')),
  'email-enviado sequencia true',
  'other members see the sent e-mail only as an Interação, without content');

-- 5. Um passo "Re:" seguinte sai na mesma conversa.
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);
insert into ids select 'envio-2', id::text from public.confirm_sequence_step(
  (select valor::uuid from ids where chave = 'sequencia'), 'passo-2');
reset role;
set local role service_role;
select is(
  (select reply_to_message_id from public.release_sequence_step_send((select valor::uuid from ids where chave = 'envio-2'), '50000000-0000-0000-0000-000000000001')),
  '<msg-1@mail.gmail.com>',
  'a following "Re:" step replies to the message_id sent to the same contact');
select is(public.record_sequence_step_send_result(
  (select valor::uuid from ids where chave = 'envio-2'), 'failed', null, null, 'HTTP 500'
), 'failed', 'a provider error is recorded as failed, not as sent');
select is(
  (select outcome from public.release_sequence_step_send((select valor::uuid from ids where chave = 'envio-2'), '50000000-0000-0000-0000-000000000001')),
  'not_confirmed', 'a failed send waits for a new confirmation');

-- 6. Reconfirmar depois da falha; Destino alterado por Administrador espera reconfirmação (ADR-0014).
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);
select is(
  (select status from public.confirm_sequence_step((select valor::uuid from ids where chave = 'sequencia'), 'passo-2')),
  'confirmed', 'a failed step can be confirmed again');
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000003', true);
select lives_ok(
  $$select public.update_contact((select valor::uuid from ids where chave = 'maria'), p_email => 'maria.souza@empresa-alvo.test')$$,
  'the administrator changes the contact e-mail');
reset role;
set local role service_role;
select is(
  (select outcome from public.release_sequence_step_send((select valor::uuid from ids where chave = 'envio-2'), '50000000-0000-0000-0000-000000000001')),
  'destination_changed', 'a changed destination blocks the send');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);
select is(
  (select status || ' ' || destination from public.list_sequence_step_sends((select valor::uuid from ids where chave = 'sequencia')) where step_id = 'passo-2'),
  'awaiting_reconfirmation maria@empresa-alvo.test',
  'the step waits for the owner and keeps the old destination on record');
select is(
  (select status || ' ' || destination from public.confirm_sequence_step((select valor::uuid from ids where chave = 'sequencia'), 'passo-2')),
  'confirmed maria.souza@empresa-alvo.test',
  'reconfirming fixes the new destination');

-- 7. Sequência pausada e Conta remetente fora de ready bloqueiam o envio.
select lives_ok(
  $$select public.update_owned_sequence((select valor::uuid from ids where chave = 'sequencia'), null, null, 'pausada')$$,
  'the owner pauses the sequence');
reset role;
set local role service_role;
select is(
  (select outcome from public.release_sequence_step_send((select valor::uuid from ids where chave = 'envio-2'), '50000000-0000-0000-0000-000000000001')),
  'sequence_not_active', 'a paused sequence releases nothing');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.update_owned_sequence((select valor::uuid from ids where chave = 'sequencia'), null, null, 'ativa')$$,
  'the owner resumes the sequence');
reset role;
set local role service_role;
select is(public.apply_unipile_sender_status('unipile-google-1', 'CREDENTIALS'), true, 'the sender account needs reconnection');
select is(
  (select outcome from public.release_sequence_step_send((select valor::uuid from ids where chave = 'envio-2'), '50000000-0000-0000-0000-000000000001')),
  'sender_not_ready', 'a sender account out of ready blocks the send');
select is(public.apply_unipile_sender_status('unipile-google-1', 'SYNC_SUCCESS'), true, 'the sender account syncs again');
select is(
  (select outcome from public.release_sequence_step_send((select valor::uuid from ids where chave = 'envio-2'), '50000000-0000-0000-0000-000000000001')),
  'sender_not_ready', 'reconciliation_required still blocks the send after reconnection');

-- 8. Vínculo encerrado bloqueia; envio preso em sending envelhece para incerto; Participação encerrada bloqueia.
reset role;
update private.sender_accounts set status = 'ready', reconciliation_required = false where unipile_account_id = 'unipile-google-1';
set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.end_contact_link((select valor::uuid from ids where chave = 'maria'), (select valor::uuid from ids where chave = 'conta'))$$,
  'the owner ends the contact link with the target account');
reset role;
set local role service_role;
select is(
  (select outcome from public.release_sequence_step_send((select valor::uuid from ids where chave = 'envio-2'), '50000000-0000-0000-0000-000000000001')),
  'contact_unlinked', 'a contact who left the target account receives nothing');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.link_contact((select valor::uuid from ids where chave = 'maria'), (select valor::uuid from ids where chave = 'conta'))$$,
  'the owner links the contact again');
select is(
  (select status from public.confirm_sequence_step((select valor::uuid from ids where chave = 'sequencia'), 'passo-2')),
  'confirmed', 'the step is confirmed again once the contact is linked');
reset role;
set local role service_role;
select is(
  (select outcome from public.release_sequence_step_send((select valor::uuid from ids where chave = 'envio-2'), '50000000-0000-0000-0000-000000000001')),
  'released', 'the send is released to simulate a function that died after calling the provider');
reset role;
update private.sequence_step_sends set sending_at = now() - interval '11 minutes' where id = (select valor::uuid from ids where chave = 'envio-2');
set local role service_role;
select is(
  (select outcome from public.release_sequence_step_send((select valor::uuid from ids where chave = 'envio-2'), '50000000-0000-0000-0000-000000000001')),
  'reconcile_required', 'a send stuck in flight for too long becomes uncertain instead of blocking forever');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.confirm_sequence_step((select valor::uuid from ids where chave = 'sequencia'), 'passo-2')$$,
  '55000', 'step already sent or in flight',
  'an uncertain send is not confirmed again before reconciliation');

-- 9. Resultado incerto fica para reconciliar; Participação encerrada bloqueia.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);
insert into ids select 'envio-4', id::text from public.confirm_sequence_step(
  (select valor::uuid from ids where chave = 'sequencia'), 'passo-1-bis');
reset role;
set local role service_role;
select is(
  (select outcome || ' | ' || subject || ' | ' || body
    from public.release_sequence_step_send((select valor::uuid from ids where chave = 'envio-4'), '50000000-0000-0000-0000-000000000001')),
  'released | Fechamento com a Empresa Alvo | Oi Maria, da Empresa Alvo (Diretora). Até, titular@cliente.com.br',
  'the step variables are filled at send time; the ones without data leave nothing raw');
select is(public.record_sequence_step_send_result(
  (select valor::uuid from ids where chave = 'envio-4'), 'uncertain', null, null, 'timeout'
), 'uncertain', 'a timeout is recorded as uncertain');
select is(
  (select outcome from public.release_sequence_step_send((select valor::uuid from ids where chave = 'envio-4'), '50000000-0000-0000-0000-000000000001')),
  'reconcile_required', 'an uncertain send is reconciled before any resend');
reset role;
update public.workspace_memberships set active = false
  where workspace_id = '51000000-0000-0000-0000-000000000001' and user_id = '50000000-0000-0000-0000-000000000001';
set local role service_role;
select is(
  (select outcome from public.release_sequence_step_send((select valor::uuid from ids where chave = 'envio-1'), '50000000-0000-0000-0000-000000000001')),
  'owner_not_responsible', 'a removed participation blocks releases before anything else');
reset role;

select * from finish();
rollback;

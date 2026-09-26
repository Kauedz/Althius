begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(42);

-- Workspace da empresa com o Vendedor responsável (titular) e uma colega Membro.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('60000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'titular@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('60000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'colega@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('61000000-0000-0000-0000-000000000001', 'empresa', 'Cliente');

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'member', true),
  ('61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 'member', true);

create temporary table ids (chave text primary key, valor text);
grant all on ids to authenticated, service_role;

-- Um e-mail no formato do objeto Email da Unipile v2.
create function pg_temp.email(p_id text, p_thread text, p_from text, p_subject text, p_headers jsonb default '[]'::jsonb,
  p_attachments jsonb default '[]'::jsonb, p_message_id text default null)
returns jsonb language sql as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', p_id, 'message_id', p_message_id, 'thread_id', p_thread,
    'subject', p_subject, 'body', 'Corpo de ' || p_subject, 'snippet', left('Corpo de ' || p_subject, 20),
    'date', '2026-09-26T15:00:00Z',
    'from', jsonb_build_array(jsonb_build_object('email', p_from, 'display_name', split_part(p_from, '@', 1))),
    'to', jsonb_build_array(jsonb_build_object('email', 'althius.relacionamento@gmail.com')),
    'headers', p_headers, 'attachments', p_attachments))
$$;
grant execute on function pg_temp.email(text, text, text, text, jsonb, jsonb, text) to service_role, authenticated;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000001', true);

insert into ids select 'conta', id::text from public.save_target_account(
  '61000000-0000-0000-0000-000000000001', 'Empresa Alvo', 'https://empresa-alvo.test');
insert into ids select 'maria', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta'), 'Maria Souza', 'Diretora', 'maria@empresa-alvo.test');
insert into ids select 'sequencia', id::text from public.create_sequence(
  '61000000-0000-0000-0000-000000000001',
  (select valor from ids where chave = 'conta'),
  jsonb_build_object('participantesIds', jsonb_build_array((select valor from ids where chave = 'maria')),
    'steps', jsonb_build_array(
      jsonb_build_object('id', 'passo-1', 'ordem', 1, 'canal', 'email', 'contatoId', (select valor from ids where chave = 'maria'),
        'delayDiasUteis', 0, 'titulo', 'Abertura', 'assunto', 'Apresentação', 'corpo', 'Olá, Maria.'),
      jsonb_build_object('id', 'passo-2', 'ordem', 2, 'canal', 'email', 'contatoId', (select valor from ids where chave = 'maria'),
        'delayDiasUteis', 2, 'titulo', 'Follow-up', 'assunto', 'Re: Apresentação', 'corpo', 'Seguindo.'))),
  '{}'::jsonb);
insert into ids select 'tentativa', attempt_id::text from public.create_sender_connection_attempt(
  '61000000-0000-0000-0000-000000000001', 'email', null);
reset role;
set local role service_role;
select is(public.complete_sender_connection_attempt(
  (select valor::uuid from ids where chave = 'tentativa'), 'unipile-google-9', 'GOOGLE', 'CREATION_SUCCESS'
), 'completed', 'the owner email sender account is linked');
select is(public.apply_unipile_sender_status('unipile-google-9', 'SYNC_SUCCESS'), true, 'the owner email sender account is ready');

-- O passo 1 é confirmado, liberado e aceito pelo provedor.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000001', true);
insert into ids select 'envio-1', id::text from public.confirm_sequence_step((select valor::uuid from ids where chave = 'sequencia'), 'passo-1');
reset role;
set local role service_role;
select is((select outcome from public.release_sequence_step_send((select valor::uuid from ids where chave = 'envio-1'), '60000000-0000-0000-0000-000000000001')),
  'released', 'step 1 is released');
select is(public.record_sequence_step_send_result((select valor::uuid from ids where chave = 'envio-1'), 'sent', 'email-abc', '<msg-1@mail.gmail.com>', null),
  'sent', 'step 1 is accepted by the provider');

-- 1. Eco: o e-mail enviado aparece nos itens enviados. Confirma o envio, guarda a conversa e não pausa nada.
create temporary table eco as select * from public.ingest_unipile_email_event(
  'evt-1', 'email.new', 'unipile-google-9',
  pg_temp.email('email-abc', 'thread-1', 'althius.relacionamento@gmail.com', 'Apresentação', p_message_id => '<msg-1@mail.gmail.com>'),
  array['althius.relacionamento@gmail.com']);
grant all on eco to authenticated, service_role;
select is((select outcome from eco), 'echo', 'the sent e-mail arriving in the mailbox is an echo, not a reply');
select is((select send_id from eco), (select valor::uuid from ids where chave = 'envio-1'), 'the echo is tied to the send');
select is((select outcome from public.ingest_unipile_email_event('evt-1', 'email.new', 'unipile-google-9',
  pg_temp.email('email-abc', 'thread-1', 'althius.relacionamento@gmail.com', 'Apresentação'), '{}')),
  'duplicate_event', 'a redelivered event id is ignored');
select is((select outcome from public.ingest_unipile_email_event('evt-2', 'email.new', 'unipile-google-9',
  pg_temp.email('email-abc', 'thread-1', 'althius.relacionamento@gmail.com', 'Apresentação'), '{}')),
  'duplicate_email', 'the same e-mail moved to another folder is not processed twice');
select is((select outcome from public.ingest_unipile_email_event('evt-3', 'email.new', 'unipile-desconhecida',
  pg_temp.email('email-x', 'thread-x', 'alguem@x.test', 'Oi'), '{}')),
  'unknown_account', 'an event of an account this Workspace never connected is only recorded');
select is((select outcome from public.ingest_unipile_email_event('evt-4', 'email.new', 'unipile-google-9',
  pg_temp.email('email-own', 'thread-1', 'Althius.Relacionamento@gmail.com', 'Re: Apresentação'), array['althius.relacionamento@gmail.com'])),
  'echo', 'a message the owner wrote by hand in the conversation is not a reply');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000001', true);
select is((select status from public.sequences where id = (select valor::uuid from ids where chave = 'sequencia')),
  'ativa', 'echoes never pause the sequence');

-- 2. Resposta real na mesma conversa: Interação pública, conteúdo privado e Sequência pausada, numa transação.
reset role;
set local role service_role;
create temporary table resposta as select * from public.ingest_unipile_email_event(
  'evt-5', 'email.new', 'unipile-google-9',
  pg_temp.email('email-r1', 'thread-1', 'maria@empresa-alvo.test', 'Re: Apresentação',
    p_attachments => jsonb_build_array(jsonb_build_object('id', 'att-1', 'name', 'proposta.pdf', 'mime', 'application/pdf', 'size', 1234))),
  array['althius.relacionamento@gmail.com']);
grant all on resposta to authenticated, service_role;
select is((select outcome from resposta), 'reply', 'an e-mail from the contact in the conversation is a reply');
select is((select send_id from resposta), (select valor::uuid from ids where chave = 'envio-1'), 'the reply is tied to the step it answers');
select is((select jsonb_array_length(attachments) from resposta), 1, 'the attachments are handed back to be downloaded');
select is((select attachments -> 0 ->> 'status' from resposta), 'pending', 'attachments start pending until stored');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000002', true);
select is((select status from public.sequences where id = (select valor::uuid from ids where chave = 'sequencia')),
  'pausada', 'the reply pauses the whole sequence');
select is(
  (select kind || ' ' || source || ' ' || (contact_id = (select valor::uuid from ids where chave = 'maria'))::text
    from public.account_interactions where id = (select interaction_id from resposta)),
  'email-recebido sequencia true',
  'other members see the public Interação with the contact and no content');
select throws_ok(
  $$select * from public.get_received_email((select interaction_id from resposta))$$,
  '42501', 'only the owner can read the received e-mail',
  'another member cannot read subject, body or attachments');
select throws_ok(
  $$select count(*) from private.received_emails$$,
  '42501', 'permission denied for schema private',
  'received content is not readable through direct client queries');
select throws_ok(
  $$select * from public.ingest_unipile_email_event('evt-forjado', 'email.new', 'unipile-google-9', '{}'::jsonb, '{}')$$,
  '42501', 'permission denied for function ingest_unipile_email_event',
  'signed-in users cannot forge e-mail events');

select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000001', true);
select is(
  (select subject || ' | ' || body || ' | ' || from_email from public.get_received_email((select interaction_id from resposta))),
  'Re: Apresentação | Corpo de Re: Apresentação | maria@empresa-alvo.test',
  'the owner reads subject, body and sender of the received e-mail');
select is((select attachments -> 0 ->> 'name' from public.get_received_email((select interaction_id from resposta))),
  'proposta.pdf', 'the owner sees the attachment list');
select is((select motivoPause from (
    select (public_summary -> '_document' ->> 'motivoPause') as motivoPause
    from public.get_owned_sequence((select valor::uuid from ids where chave = 'sequencia'))) d),
  'Contato respondeu', 'the private document records why the sequence paused');

-- 3. Repetição e fora de ordem não duplicam nada.
reset role;
set local role service_role;
select is((select outcome from public.ingest_unipile_email_event('evt-6', 'email.new', 'unipile-google-9',
  pg_temp.email('email-r1', 'thread-1', 'maria@empresa-alvo.test', 'Re: Apresentação'), '{}')),
  'duplicate_email', 'the same reply delivered again is not processed twice');
select is((select count(*)::int from public.account_interactions
    where target_account_id = (select valor::uuid from ids where chave = 'conta') and kind = 'email-recebido'),
  1, 'a repeated reply creates no second Interação');

-- 4. Resposta ligada pelo In-Reply-To, mesmo em outra conversa do provedor; e-mail sem relação não vira nada.
select is((select outcome from public.ingest_unipile_email_event('evt-7', 'email.new', 'unipile-google-9',
  pg_temp.email('email-r2', 'thread-2', 'maria@empresa-alvo.test', 'Re: Apresentação',
    p_headers => jsonb_build_array(jsonb_build_object('name', 'In-Reply-To', 'value', '<msg-1@mail.gmail.com>'))), '{}')),
  'reply', 'a reply is also recognised by the In-Reply-To header');
select is((select outcome from public.ingest_unipile_email_event('evt-8', 'email.new', 'unipile-google-9',
  pg_temp.email('email-z', 'thread-z', 'desconhecido@outra.test', 'Newsletter'), '{}')),
  'unrelated', 'an unrelated e-mail is only recorded by its event id');
select is((select count(*)::int from public.account_interactions
    where target_account_id = (select valor::uuid from ids where chave = 'conta') and kind = 'email-recebido'),
  2, 'the unrelated e-mail creates no Interação');

-- 5. Anexo guardado e lido só pelo titular.
select is(public.record_received_email_attachment((select interaction_id from resposta), 'att-1',
  '61000000-0000-0000-0000-000000000001/anexos/att-1-proposta.pdf', 'stored'),
  true, 'the stored attachment is recorded');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000001', true);
select is((select attachments -> 0 ->> 'status' from public.get_received_email((select interaction_id from resposta))),
  'stored', 'the owner sees the attachment as stored');
select is(public.get_received_email_attachment_path((select interaction_id from resposta), 'att-1'),
  '61000000-0000-0000-0000-000000000001/anexos/att-1-proposta.pdf', 'the owner resolves the private storage path');
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.get_received_email_attachment_path((select interaction_id from resposta), 'att-1')$$,
  '42501', 'only the owner can read the received e-mail',
  'another member cannot resolve the attachment path');

-- 6. Bounce: o payload é o e-mail ORIGINAL enviado.
reset role;
set local role service_role;
select is((select outcome from public.ingest_unipile_email_event('evt-9', 'email.new.bounce', 'unipile-google-9',
  pg_temp.email('email-abc', 'thread-1', 'althius.relacionamento@gmail.com', 'Apresentação', p_message_id => '<msg-1@mail.gmail.com>'), '{}')),
  'bounce', 'a bounce is matched to the original send');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000001', true);
select is((select status from public.list_sequence_step_sends((select valor::uuid from ids where chave = 'sequencia')) where step_id = 'passo-1'),
  'bounced', 'the bounced send is marked as such');

-- 7. Antes de um passo "Re:", a Edge Function descobre a conversa a conferir na Unipile.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.update_owned_sequence((select valor::uuid from ids where chave = 'sequencia'), null, null, 'ativa')$$,
  'the owner resumes the sequence explicitly');
insert into ids select 'envio-2', id::text from public.confirm_sequence_step((select valor::uuid from ids where chave = 'sequencia'), 'passo-2');
reset role;
set local role service_role;
select is(
  (select unipile_account_id || ' ' || provider_thread_id from public.conversation_for_send(
    (select valor::uuid from ids where chave = 'envio-2'), '60000000-0000-0000-0000-000000000001')),
  'unipile-google-9 thread-1', 'a follow-up step names the sender account and the conversation of the previous send');
select is(
  (select count(*)::int from public.conversation_for_send(
    (select valor::uuid from ids where chave = 'envio-2'), '60000000-0000-0000-0000-000000000002')),
  0, 'another user gets no conversation to inspect');

-- 8. O eco com o cabeçalho da Althius reconcilia um envio incerto.
select is((select outcome from public.release_sequence_step_send((select valor::uuid from ids where chave = 'envio-2'), '60000000-0000-0000-0000-000000000001')),
  'released', 'step 2 is released');
select is(public.record_sequence_step_send_result((select valor::uuid from ids where chave = 'envio-2'), 'uncertain', null, null, 'timeout'),
  'uncertain', 'step 2 timed out');
select is((select outcome from public.ingest_unipile_email_event('evt-10', 'email.new', 'unipile-google-9',
  pg_temp.email('email-def', 'thread-1', 'althius.relacionamento@gmail.com', 'Re: Apresentação',
    p_headers => jsonb_build_array(jsonb_build_object('name', 'X-Althius-Envio', 'value', (select valor from ids where chave = 'envio-2'))),
    p_message_id => '<msg-2@mail.gmail.com>'), '{}')),
  'echo', 'the sent-items echo carrying the Althius header is recognised');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000001', true);
select is((select status from public.list_sequence_step_sends((select valor::uuid from ids where chave = 'sequencia')) where step_id = 'passo-2'),
  'sent', 'the echo proves the provider accepted the uncertain send');
select is((select count(*)::int from public.account_interactions
    where target_account_id = (select valor::uuid from ids where chave = 'conta') and kind = 'email-enviado'),
  2, 'the reconciled send also becomes an Interação');
reset role;

select * from finish();
rollback;

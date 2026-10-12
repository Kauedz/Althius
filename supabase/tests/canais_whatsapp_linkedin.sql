begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(182);

-- O relógio da agenda fica parado onde o teste quiser, só dentro desta transação.
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

-- Uma mensagem no formato do objeto Message da Unipile v2 (chat_id, sender_id, is_sender, texto e data).
create function pg_temp.msg(p_id text, p_chat text, p_sender text, p_is_sender boolean, p_text text,
  p_date text default null) returns jsonb language sql as $f$
  select jsonb_strip_nulls(jsonb_build_object('id', p_id, 'chat_id', p_chat, 'sender_id', p_sender,
    'is_sender', p_is_sender, 'text', p_text, 'date', p_date));
$f$;

-- Workspace da empresa: o Vendedor responsável (titular), uma colega Membro e um Administrador.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('c0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'titular@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('c0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'colega@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('c0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'admin@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('c1000000-0000-0000-0000-000000000001', 'empresa', 'Cliente');

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'member', true),
  ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'member', true),
  ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 'admin', true);

create temporary table ids (chave text primary key, valor text);
grant all on ids to authenticated, service_role;

create function pg_temp.passo(p_id text, p_canal text, p_contato text, p_delay int, p_corpo text,
  p_extra jsonb default '{}'::jsonb) returns jsonb language sql as $f$
  select jsonb_build_object('id', p_id, 'canal', p_canal, 'contatoId', (select valor from ids where chave = p_contato),
    'delayDiasUteis', p_delay, 'titulo', p_id, 'corpo', p_corpo)
    || case when p_canal = 'email' then jsonb_build_object('assunto', 'Assunto ' || p_id) else '{}'::jsonb end
    || p_extra;
$f$;

create function pg_temp.documento(variadic p_steps jsonb[]) returns jsonb language sql as $f$
  select jsonb_build_object('participantesIds', '[]'::jsonb, 'janelaPadrao', '{"de": "09:00", "ate": "18:00"}'::jsonb,
    'steps', to_jsonb(p_steps));
$f$;

grant execute on function pg_temp.relogio(timestamptz), pg_temp.envio(text), pg_temp.msg(text, text, text, boolean, text, text),
  pg_temp.passo(text, text, text, int, text, jsonb), pg_temp.documento(jsonb[]) to authenticated, service_role;

-- O titular cadastra as Contas-alvo, os Contatos e as Sequências.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000001', true);

insert into ids select 'conta-1', id::text from public.save_target_account('c1000000-0000-0000-0000-000000000001', 'Empresa Um', 'https://empresa-um.test');
insert into ids select 'conta-2', id::text from public.save_target_account('c1000000-0000-0000-0000-000000000001', 'Empresa Dois', 'https://empresa-dois.test');
insert into ids select 'conta-3', id::text from public.save_target_account('c1000000-0000-0000-0000-000000000001', 'Empresa Três', 'https://empresa-tres.test');
insert into ids select 'conta-4', id::text from public.save_target_account('c1000000-0000-0000-0000-000000000001', 'Empresa Quatro', 'https://empresa-quatro.test');
insert into ids select 'conta-5', id::text from public.save_target_account('c1000000-0000-0000-0000-000000000001', 'Empresa Cinco', 'https://empresa-cinco.test');

-- Maria (conta 1): e-mail, WhatsApp e LinkedIn.
insert into ids select 'maria', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta-1'), 'Maria Souza', 'Diretora', 'maria@empresa-um.test',
  '(11) 98888-7777', 'https://www.linkedin.com/in/maria-souza/');
-- Conta 2: Ana (telefone que não usa WhatsApp), Bia (LinkedIn que não é perfil), Cris (sem canais) e Davi (completo).
insert into ids select 'ana', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta-2'), 'Ana Reis', 'Sócia', 'ana@empresa-dois.test', '11 97777-6666');
select count(*) from public.set_contact_channels((select valor::uuid from ids where chave = 'ana'), null,
  '[{"value": "11 97777-6666", "kind": "celular", "whatsapp": false}]');
insert into ids select 'bia', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta-2'), 'Bia Rocha', 'Analista', 'bia@empresa-dois.test', null,
  'https://www.linkedin.com/company/empresa-dois');
insert into ids select 'cris', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta-2'), 'Cris Melo', 'Gerente', 'cris@empresa-dois.test');
insert into ids select 'davi', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta-2'), 'Davi Lima', 'Diretor', 'davi@empresa-dois.test',
  '11 98888-0001', 'https://www.linkedin.com/in/davi-lima');
select count(*) from public.set_contact_channels((select valor::uuid from ids where chave = 'davi'), null,
  '[{"value": "11 98888-0001"}, {"value": "11 98888-0002"}]');
-- Eva (conta 3): LinkedIn. Fábio (conta 4): WhatsApp. Gil (conta 5): e-mail e WhatsApp.
insert into ids select 'eva', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta-3'), 'Eva Prado', 'CEO', 'eva@empresa-tres.test', null,
  'https://www.linkedin.com/in/eva-prado');
insert into ids select 'fabio', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta-4'), 'Fábio Neri', 'CTO', 'fabio@empresa-quatro.test', '11 96666-5555');
insert into ids select 'gil', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta-5'), 'Gil Alves', 'COO', 'gil@empresa-cinco.test', '11 95555-4444');

insert into ids select 'seq-1', id::text from public.create_sequence('c1000000-0000-0000-0000-000000000001',
  (select valor from ids where chave = 'conta-1'),
  pg_temp.documento(
    pg_temp.passo('p1', 'whatsapp', 'maria', 0, 'Olá {{contato.primeiro_nome}}, tudo bem?'),
    pg_temp.passo('p2', 'whatsapp', 'maria', 1, 'Passando para saber se viu a mensagem.')));
insert into ids select 'seq-2', id::text from public.create_sequence('c1000000-0000-0000-0000-000000000001',
  (select valor from ids where chave = 'conta-2'),
  pg_temp.documento(pg_temp.passo('q0', 'whatsapp', 'cris', 0, 'Oi')));
insert into ids select 'seq-3', id::text from public.create_sequence('c1000000-0000-0000-0000-000000000001',
  (select valor from ids where chave = 'conta-3'),
  pg_temp.documento(
    pg_temp.passo('l1', 'linkedin', 'eva', 0, 'Oi Eva, vi seu trabalho. Vamos nos conectar?', '{"subtipoLinkedIn": "convite"}'),
    pg_temp.passo('l2', 'linkedin', 'eva', 1, 'Obrigado por aceitar, Eva.', '{"subtipoLinkedIn": "mensagem"}'),
    pg_temp.passo('l3', 'linkedin', 'eva', 1, 'Escrevo por InMail.', '{"subtipoLinkedIn": "inmail"}')));
insert into ids select 'seq-4', id::text from public.create_sequence('c1000000-0000-0000-0000-000000000001',
  (select valor from ids where chave = 'conta-4'),
  pg_temp.documento(
    pg_temp.passo('f1', 'whatsapp', 'fabio', 0, 'Oi,   Fábio.'),
    pg_temp.passo('f2', 'whatsapp', 'fabio', 1, 'Segue o acompanhamento.')));
insert into ids select 'seq-5', id::text from public.create_sequence('c1000000-0000-0000-0000-000000000001',
  (select valor from ids where chave = 'conta-5'),
  pg_temp.documento(
    pg_temp.passo('g1', 'email', 'gil', 0, 'Olá, Gil.'),
    pg_temp.passo('g2', 'whatsapp', 'gil', 0, 'Olá de novo, Gil.'),
    pg_temp.passo('g3', 'email', 'gil', 1, 'Fechando.')));

-- A Conta remetente de E-mail do titular fica pronta pelo mesmo caminho da conexão real.
insert into ids select 'tentativa-email', attempt_id::text from public.create_sender_connection_attempt(
  'c1000000-0000-0000-0000-000000000001', 'email', null);
reset role;
set local role service_role;
select is(public.complete_sender_connection_attempt(
  (select valor::uuid from ids where chave = 'tentativa-email'), 'unipile-google-t', 'GOOGLE', 'CREATION_SUCCESS'
), 'completed', 'the owner email sender account is linked');
select is(public.apply_unipile_sender_status('unipile-google-t', 'SYNC_SUCCESS'), true, 'the owner email sender account is ready');

-- 1. O interruptor nasce desligado, e a Sequência continua parando num passo de WhatsApp como antes.
reset role;
select is(private.chat_channel_enabled('whatsapp') or private.chat_channel_enabled('linkedin'), false,
  'WhatsApp and LinkedIn start switched off');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000001', true);
select is((select count(*)::int from public.list_enabled_chat_channels()), 0, 'the screen sees no chat channel enabled');
select pg_temp.relogio('2026-09-30 10:00-03');
select is((select outcome || ' ' || coalesce(step_id, 'nenhum') from public.activate_sequence((select valor::uuid from ids where chave = 'seq-5'))),
  'activated g1', 'with the channel off, the activation still schedules only the e-mail steps');
reset role;
select is((select count(*)::int from private.sequence_step_sends where sequence_id = (select valor::uuid from ids where chave = 'seq-5')),
  2, 'the WhatsApp step gets no Envio while the channel is off');
set local role service_role;
select is((select outcome from public.release_due_step_send((pg_temp.envio('g1')).id)), 'released', 'the e-mail step is released as always');
select is(public.record_sequence_step_send_result((pg_temp.envio('g1')).id, 'sent', 'e-g1', '<g1@x>', null), 'sent',
  'the e-mail step went out');
reset role;
select is((pg_temp.envio('g3')).status, 'waiting', 'the e-mail step after the WhatsApp step is held, as before');
select is((select count(*)::int from public.account_interactions where kind = 'email-enviado'), 1,
  'an e-mail still records the e-mail Interação');

-- Só quem administra o banco liga os canais.
set local role authenticated;
select throws_ok($$select private.set_chat_channel_enabled('whatsapp', true)$$, '42501', null,
  'signed-in users cannot switch the chat channels');
reset role;
select is(private.set_chat_channel_enabled('whatsapp', true), true, 'the database admin switches WhatsApp on');
select is(private.set_chat_channel_enabled('linkedin', true), true, 'the database admin switches LinkedIn on');
select throws_ok($$select private.set_chat_channel_enabled('sms', true)$$, '22023', 'unknown chat channel',
  'only WhatsApp and LinkedIn have a switch');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000001', true);
select is((select string_agg(c, ',' order by c) from public.list_enabled_chat_channels() c), 'linkedin,whatsapp',
  'the screen sees both channels enabled');

-- 2. Ativar: o que impede cada passo de conversa.
create function pg_temp.ativar(p_seq text) returns text language sql as $f$
  select outcome || ' ' || coalesce(step_id, 'nenhum') from public.activate_sequence((select valor::uuid from ids where chave = p_seq));
$f$;
grant execute on function pg_temp.ativar(text) to authenticated;
create function pg_temp.documento_de(p_seq text, variadic p_steps jsonb[]) returns void language sql as $f$
  select 1 from public.update_owned_sequence((select valor::uuid from ids where chave = p_seq), pg_temp.documento(variadic p_steps), null, null);
$f$;
grant execute on function pg_temp.documento_de(text, jsonb[]) to authenticated;

select pg_temp.documento_de('seq-2', pg_temp.passo('q1', 'whatsapp', 'cris', 0, 'Oi'));
select is(pg_temp.ativar('seq-2'), 'contact_without_phone q1', 'a WhatsApp step whose Contato has no phone blocks the activation');
select pg_temp.documento_de('seq-2', pg_temp.passo('q1', 'whatsapp', 'ana', 0, 'Oi'));
select is(pg_temp.ativar('seq-2'), 'phone_without_whatsapp q1', 'a phone that does not use WhatsApp blocks the activation');
select pg_temp.documento_de('seq-2', pg_temp.passo('q1', 'whatsapp', 'davi', 0, 'Oi', '{"destino": 3}'));
select is(pg_temp.ativar('seq-2'), 'phone_not_found q1', 'a phone position the Contato does not have blocks the activation');
select pg_temp.documento_de('seq-2', pg_temp.passo('q1', 'whatsapp', 'davi', 0, '   '));
select is(pg_temp.ativar('seq-2'), 'empty_content q1', 'a WhatsApp step without text blocks the activation');
select pg_temp.documento_de('seq-2', pg_temp.passo('q1', 'linkedin', 'cris', 0, 'Oi'));
select is(pg_temp.ativar('seq-2'), 'contact_without_linkedin q1', 'a LinkedIn step whose Contato has no profile blocks the activation');
select pg_temp.documento_de('seq-2', pg_temp.passo('q1', 'linkedin', 'bia', 0, 'Oi'));
select is(pg_temp.ativar('seq-2'), 'linkedin_profile_invalid q1', 'a LinkedIn address that is not a /in/ profile blocks the activation');
select pg_temp.documento_de('seq-2', pg_temp.passo('q1', 'linkedin', 'davi', 0, 'Oi', '{"subtipoLinkedIn": "curtir"}'));
select is(pg_temp.ativar('seq-2'), 'invalid_linkedin_subtype q1', 'an unknown LinkedIn subtype blocks the activation');
select pg_temp.documento_de('seq-2', pg_temp.passo('q1', 'linkedin', 'davi', 0, repeat('x', 301), '{"subtipoLinkedIn": "convite"}'));
select is(pg_temp.ativar('seq-2'), 'invite_note_too_long q1', 'an invitation note over the limit is never cut silently');
select pg_temp.documento_de('seq-2', pg_temp.passo('q1', 'linkedin', 'davi', 0, repeat('x', 300), '{"subtipoLinkedIn": "mensagem"}'));
select is(pg_temp.ativar('seq-2'), 'linkedin_sender_not_ready q1', 'a message has no note limit, but the LinkedIn sender account must be ready');
select pg_temp.documento_de('seq-2', pg_temp.passo('q1', 'whatsapp', 'davi', 0, 'Oi'));
select is(pg_temp.ativar('seq-2'), 'whatsapp_sender_not_ready q1', 'without a ready WhatsApp sender account nothing is authorized');
select is((select count(*)::int from public.get_sequence_authorization((select valor::uuid from ids where chave = 'seq-2'))), 0,
  'a blocked activation leaves no authorization behind');

-- As Contas remetentes de WhatsApp e LinkedIn do titular, pelo mesmo caminho da conexão real.
insert into ids select 'tentativa-wa', attempt_id::text from public.create_sender_connection_attempt(
  'c1000000-0000-0000-0000-000000000001', 'whatsapp', null);
insert into ids select 'tentativa-li', attempt_id::text from public.create_sender_connection_attempt(
  'c1000000-0000-0000-0000-000000000001', 'linkedin', null);
reset role;
set local role service_role;
select is(public.complete_sender_connection_attempt((select valor::uuid from ids where chave = 'tentativa-wa'),
  'unipile-wa-1', 'WHATSAPP', 'CREATION_SUCCESS'), 'completed', 'the WhatsApp sender account is linked');
select is(public.apply_unipile_sender_status('unipile-wa-1', 'SYNC_SUCCESS'), true, 'the WhatsApp sender account is ready');
select is(public.complete_sender_connection_attempt((select valor::uuid from ids where chave = 'tentativa-li'),
  'unipile-li-1', 'LINKEDIN', 'CREATION_SUCCESS'), 'completed', 'the LinkedIn sender account is linked');
select is(public.apply_unipile_sender_status('unipile-li-1', 'SYNC_SUCCESS'), true, 'the LinkedIn sender account is ready');

-- Ligado o canal e conectada a conta, ativar de novo inclui o passo de WhatsApp que antes era ignorado.
reset role;
insert into ids select 'sender-wa', id::text from private.sender_accounts where unipile_account_id = 'unipile-wa-1';
insert into ids select 'sender-email', id::text from private.sender_accounts where unipile_account_id = 'unipile-google-t';
select pg_temp.relogio('2026-09-30 10:05-03');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000001', true);
select is(pg_temp.ativar('seq-5'), 'activated g2', 'activating again takes the WhatsApp step into the new version');
reset role;
select is((pg_temp.envio('g2')).channel || ' ' || (pg_temp.envio('g2')).destination || ' ' || (pg_temp.envio('g2')).mode || ' ' || (pg_temp.envio('g2')).status,
  'whatsapp +5511955554444 auto scheduled', 'the WhatsApp Envio fixes the normalized phone as the Destino and sends by itself');
select is((pg_temp.envio('g1')).status || ' ' || (pg_temp.envio('g3')).status, 'sent waiting',
  'the step that already went out stays sent and the e-mail after the WhatsApp step waits its turn');

-- 3. O ciclo do WhatsApp: ativar, reservar, liberar, enviar, eco e resposta.
select pg_temp.relogio('2026-09-30 10:00-03');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000001', true);
select is(pg_temp.ativar('seq-1'), 'activated p1', 'the WhatsApp sequence is activated and the first step is scheduled');
reset role;
select is((pg_temp.envio('p1')).status || ' ' || (pg_temp.envio('p1')).destination || ' ' || (pg_temp.envio('p2')).status,
  'scheduled +5511988887777 waiting', 'the first step fixes the Contato phone and the next one waits');
set local role service_role;
select is((select count(*)::int from public.claim_due_step_sends(10)), 0, 'the e-mail executor never claims a WhatsApp step');
create temporary table reserva as select * from public.claim_due_chat_step_sends(10);
grant all on reserva to authenticated, service_role;
select is((select send_id from reserva), (pg_temp.envio('p1')).id, 'the chat executor reserves the due WhatsApp step');
select is((select count(*)::int from public.claim_due_chat_step_sends(10)), 0, 'a reserved step is not claimed twice');
create temporary table liberado as select * from public.release_due_chat_step_send((pg_temp.envio('p1')).id);
grant all on liberado to authenticated, service_role;
select is((select outcome || ' ' || channel || ' ' || unipile_account_id || ' ' || destination from liberado),
  'released whatsapp unipile-wa-1 +5511988887777', 'the step is released with the owner WhatsApp account and the fixed Destino');
select is((select body from liberado), 'Olá Maria, tudo bem?', 'the variables of the text are filled in');
select is((select provider_chat_id is null and not invite_sent from liberado), true, 'the first message of a Contato has no conversation yet');
select is((select outcome from public.release_due_chat_step_send((pg_temp.envio('p1')).id)), 'in_flight',
  'a step already being sent is not released twice');
select is(public.record_chat_step_send_result((pg_temp.envio('p1')).id, 'sent', 'chat-1', 'msg-1', null, null, null),
  'sent', 'the provider accepted the message');
reset role;
select is((pg_temp.envio('p1')).provider_chat_id || ' ' || (pg_temp.envio('p1')).provider_message_id, 'chat-1 msg-1',
  'the conversation and message ids are kept');
select is((select count(*)::int from public.account_interactions
  where kind = 'mensagem-enviada' and target_account_id = (select valor::uuid from ids where chave = 'conta-1')), 1,
  'a sent chat message records the sent-message Interação');
select is((pg_temp.envio('p2')).status || ' ' || ((pg_temp.envio('p2')).scheduled_for = '2026-10-01 10:00-03'), 'scheduled true',
  'the next step is scheduled one business day later');

-- Eco: a mensagem enviada volta como message.new com is_sender; não é resposta.
set local role service_role;
select is((select outcome from public.ingest_unipile_chat_event('evt-1', 'unipile-wa-1', 'message.new',
  pg_temp.msg('msg-1', 'chat-1', '5511900000000@s.whatsapp.net', true, 'Olá Maria, tudo bem?'))),
  'echo', 'the message sent through the API coming back is an echo');
select is((select send_id from public.ingest_unipile_chat_event('evt-1b', 'unipile-wa-1', 'message.new',
  pg_temp.msg('msg-1', 'chat-1', '5511900000000@s.whatsapp.net', true, 'Olá Maria, tudo bem?'))), null::uuid,
  'the same message under another event id is not processed twice');
select is((select outcome from public.ingest_unipile_chat_event('evt-1', 'unipile-wa-1', 'message.new',
  pg_temp.msg('msg-1', 'chat-1', '5511900000000@s.whatsapp.net', true, 'Olá Maria, tudo bem?'))),
  'duplicate_event', 'a redelivered event id is ignored');
select is((select outcome from public.ingest_unipile_chat_event('evt-2', 'unipile-wa-1', 'message.new',
  pg_temp.msg('msg-9', 'chat-1', '5511900000000@s.whatsapp.net', true, 'Escrevi aqui direto no celular.'))),
  'echo', 'what the owner wrote by hand in the app is an echo, not a reply');
select is((select outcome from public.ingest_unipile_chat_event('evt-3', 'unipile-desconhecida', 'message.new',
  pg_temp.msg('msg-x', 'chat-x', '551100@s.whatsapp.net', false, 'Oi'))),
  'unknown_account', 'an event of an account this Workspace never connected is only recorded');
select is((select outcome from public.ingest_unipile_chat_event('evt-4', 'unipile-wa-1', 'message.new',
  pg_temp.msg('msg-p', 'chat-pessoal', '5511911112222@s.whatsapp.net', false, 'Vamos almoçar?'))),
  'unrelated', 'a personal conversation with no tie to a Sequência is ignored');
select is((select outcome from public.ingest_unipile_chat_event('evt-5', 'unipile-wa-1', 'message.new',
  jsonb_build_object('id', 'msg-amb', 'chat_id', 'chat-1', 'text', 'sem remetente nem is_sender'))),
  'unrelated', 'a message that does not say who wrote it never pauses anything');
select is((select outcome from public.ingest_unipile_chat_event('evt-6', 'unipile-wa-1', 'chat.update',
  jsonb_build_object('id', 'chat-1'))), 'technical', 'a chat update is a technical event');
select is((select outcome from public.ingest_unipile_chat_event('evt-7', 'unipile-wa-1', 'message.new',
  pg_temp.msg('msg-old', 'chat-1', '5511988887777@s.whatsapp.net', false, 'Mensagem antiga da conversa', '2020-01-01T00:00:00Z'))),
  'before_send', 'a message written before the step went out is history, not a reply');
reset role;
select is((select own_provider_id from private.sender_accounts where unipile_account_id = 'unipile-wa-1'),
  '5511900000000@s.whatsapp.net', 'the identity of the owner is learned from the first message they sent');
select is((select count(*)::int from private.received_chat_messages), 0, 'nothing from those events was kept as received content');
select is((select count(*)::int from public.account_interactions where kind = 'mensagem-recebida'), 0,
  'no event so far became a shared Interação');
select is((select status from public.sequences where id = (select valor::uuid from ids where chave = 'seq-1')), 'ativa',
  'echoes, personal chats and technical events never pause the Sequência');

-- A conferência da conversa: o chat do Envio anterior ao Contato.
set local role service_role;
select is((select unipile_account_id || ' ' || provider_chat_id from public.chat_conversation_for_send(
  (pg_temp.envio('p2')).id, 'c0000000-0000-0000-0000-000000000001')), 'unipile-wa-1 chat-1',
  'before the next step the Executor learns which conversation to check');
select is((select count(*)::int from public.chat_conversation_for_send((pg_temp.envio('p1')).id, 'c0000000-0000-0000-0000-000000000001')),
  0, 'the first message of a Contato has no conversation to check');
select is((select count(*)::int from public.chats_to_reconcile(
  (select valor::uuid from ids where chave = 'sender-wa'), 25)), 1,
  'after an outage the WhatsApp account has one conversation to check');
select is((select count(*)::int from public.conversations_to_reconcile(
  (select valor::uuid from ids where chave = 'sender-wa'), 25)), 0,
  'the e-mail reconciliation never lists chat conversations');
select is((select count(*)::int from public.chats_to_reconcile(
  (select valor::uuid from ids where chave = 'sender-email'), 25)), 0,
  'an e-mail account has no chats to reconcile');

-- A resposta real do Contato: Interação pública, conteúdo privado e Sequência pausada, numa transação.
create temporary table resposta as select * from public.ingest_unipile_chat_event('evt-8', 'unipile-wa-1', 'message.new',
  pg_temp.msg('msg-r1', 'chat-1', '5511988887777@s.whatsapp.net', false, 'Oi! Pode ser, me manda mais detalhes.'));
grant all on resposta to authenticated, service_role;
select is((select outcome from resposta), 'reply', 'a message from the Contato in the conversation is a reply');
select is((select send_id from resposta), (pg_temp.envio('p1')).id, 'the reply is tied to the step it answers');
select is((select outcome from public.ingest_unipile_chat_event('evt-8b', 'unipile-wa-1', 'message.new',
  pg_temp.msg('msg-r1', 'chat-1', '5511988887777@s.whatsapp.net', false, 'Oi! Pode ser, me manda mais detalhes.'))),
  'duplicate_message', 'the same reply under another event id does not duplicate the Interação');
select is((select outcome from public.ingest_unipile_chat_event('evt-8', 'unipile-wa-1', 'message.new',
  pg_temp.msg('msg-r1', 'chat-1', '5511988887777@s.whatsapp.net', false, 'Oi! Pode ser, me manda mais detalhes.'))),
  'duplicate_event', 'a redelivered reply event is ignored');
reset role;
select is((select count(*)::int from public.account_interactions where kind = 'mensagem-recebida'), 1,
  'repeated deliveries leave a single reply Interação');
select is((select status from public.sequences where id = (select valor::uuid from ids where chave = 'seq-1')), 'pausada',
  'the reply pauses the whole Sequência');
select is((select status from public.sequences where id = (select valor::uuid from ids where chave = 'seq-5')), 'ativa',
  'another target account keeps running');
select is((select document ->> 'motivoPause' from private.sequence_documents where sequence_id = (select valor::uuid from ids where chave = 'seq-1')),
  'Contato respondeu', 'the pause says why');
select is((select outcome from private.send_outcomes where send_id = (pg_temp.envio('p1')).id), 'resposta',
  'the reply registers the Resultado do Envio, as the e-mail reply does');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000002', true);
select is(
  (select kind || ' ' || source || ' ' || (contact_id = (select valor::uuid from ids where chave = 'maria'))::text
    from public.account_interactions where id = (select interaction_id from resposta)),
  'mensagem-recebida sequencia true', 'other members see the public Interação with the Contato and no content');
select throws_ok($$select * from public.list_received_chat_messages((select valor::uuid from ids where chave = 'seq-1'))$$,
  '42501', 'sequence not found or not owned by active user', 'another member cannot read the reply');
select throws_ok($$select count(*) from private.received_chat_messages$$, '42501', 'permission denied for schema private',
  'received content is not readable through direct client queries');
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000003', true);
select throws_ok($$select * from public.list_received_chat_messages((select valor::uuid from ids where chave = 'seq-1'))$$,
  '42501', 'sequence not found or not owned by active user', 'an Administrator cannot read the owner reply either');
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000001', true);
select is((select channel || ' ' || body || ' ' || from_id from public.list_received_chat_messages((select valor::uuid from ids where chave = 'seq-1'))),
  'whatsapp Oi! Pode ser, me manda mais detalhes. 5511988887777@s.whatsapp.net', 'the owner reads the reply');

-- Depois da pausa persistida, nenhum passo novo recebe autorização de envio.
reset role;
select pg_temp.relogio('2026-10-01 11:00-03');
set local role service_role;
select is((select count(*)::int from public.claim_due_chat_step_sends(10)
  where send_id = (pg_temp.envio('p2')).id), 0, 'after the pause the Executor does not claim the next step');
select is((select outcome from public.release_due_chat_step_send((pg_temp.envio('p2')).id)), 'sequence_not_active',
  'and the release refuses it');
select is((select outcome from public.release_chat_step_send((pg_temp.envio('p2')).id, 'c0000000-0000-0000-0000-000000000001')),
  'sequence_not_active', 'the owner explicit release is refused too');

-- 4. Duas Contas remetentes de canais diferentes: a liberação confere o canal, e o E-mail não toca nos de conversa.
reset role;
select pg_temp.relogio('2026-09-30 10:00-03');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000001', true);
select pg_temp.documento_de('seq-2',
  pg_temp.passo('q1', 'email', 'davi', 0, 'Olá, Davi.'),
  pg_temp.passo('q2', 'whatsapp', 'davi', 1, 'Oi, Davi.', '{"destino": 2}'));
select is(pg_temp.ativar('seq-2'), 'activated q1', 'a Sequência with e-mail and WhatsApp is activated');
reset role;
set local role service_role;
select is((select string_agg(send_id::text, ',') from public.claim_due_step_sends(10)), (pg_temp.envio('q1')).id::text,
  'the e-mail executor claims the e-mail step');
select is((select count(*)::int from public.claim_due_chat_step_sends(10)), 0, 'and the chat executor claims nothing yet');
select is((select outcome from public.release_due_step_send((pg_temp.envio('q1')).id)), 'released', 'the e-mail step is released');
select is(public.record_sequence_step_send_result((pg_temp.envio('q1')).id, 'sent', 'e-q1', '<q1@x>', null), 'sent', 'the e-mail went out');
reset role;
select pg_temp.relogio('2026-10-01 10:00-03');
set local role service_role;
select is((select count(*)::int from public.claim_due_step_sends(10)), 0, 'the e-mail executor ignores the WhatsApp step');
select is((select outcome from public.release_due_step_send((pg_temp.envio('q2')).id)), 'wrong_channel',
  'the e-mail release refuses a WhatsApp Envio');
select is((select outcome from public.release_sequence_step_send((pg_temp.envio('q2')).id, 'c0000000-0000-0000-0000-000000000001')),
  'wrong_channel', 'the owner e-mail release refuses a WhatsApp Envio too');
select is((select outcome from public.release_due_chat_step_send((pg_temp.envio('q1')).id)), 'wrong_channel',
  'the chat release refuses an e-mail Envio');
select is((pg_temp.envio('q2')).status, 'scheduled', 'a refused release leaves the Envio untouched');
select is((select string_agg(send_id::text, ',') from public.claim_due_chat_step_sends(10)), (pg_temp.envio('q2')).id::text,
  'the chat executor claims the WhatsApp step');
select is((select destination from public.release_due_chat_step_send((pg_temp.envio('q2')).id)), '+5511988880002',
  'the step uses the second phone of the Contato, as chosen');

-- Fora de ordem: a resposta chega antes de o resultado do envio ser gravado.
select is((select outcome from public.ingest_unipile_chat_event('evt-oo', 'unipile-wa-1', 'message.new',
  pg_temp.msg('msg-oo', 'chat-2', '5511988880002@s.whatsapp.net', false, 'Sim, pode ligar.'))),
  'unrelated', 'a reply that arrives before the send result cannot be tied yet');
select is(public.record_chat_step_send_result((pg_temp.envio('q2')).id, 'sent', 'chat-2', 'msg-q2', null, null, null), 'sent',
  'the send result is recorded afterwards');
select is((select outcome from public.ingest_unipile_chat_event('evt-oo', 'unipile-wa-1', 'message.new',
  pg_temp.msg('msg-oo', 'chat-2', '5511988880002@s.whatsapp.net', false, 'Sim, pode ligar.'))),
  'reply', 'the same event is evaluated again and now it is the reply, tied by the conversation');
reset role;
select is((select status from public.sequences where id = (select valor::uuid from ids where chave = 'seq-2')), 'pausada',
  'the late reply still pauses the Sequência');
select is((select status from public.sequences where id = (select valor::uuid from ids where chave = 'seq-4')), 'ativa',
  'the reply of another Contato of the same WhatsApp account pauses only its own Conta-alvo');

-- 5. LinkedIn: convite com nota, aceite não é resposta, mensagem, impedimento, nova ativação e resposta.
select pg_temp.relogio('2026-09-30 10:00-03');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000001', true);
select is(pg_temp.ativar('seq-3'), 'activated l1', 'the LinkedIn sequence is activated');
reset role;
select is((pg_temp.envio('l1')).channel || ' ' || (pg_temp.envio('l1')).destination, 'linkedin https://www.linkedin.com/in/eva-prado',
  'the LinkedIn Envio fixes the profile of the Contato');
set local role service_role;
create temporary table convite as select * from public.claim_due_chat_step_sends(10);
create temporary table liberado_li as select * from public.release_due_chat_step_send((pg_temp.envio('l1')).id);
grant all on convite, liberado_li to authenticated, service_role;
select is((select outcome || ' ' || coalesce(linkedin_subtype, '-') || ' ' || invite_note_limit || ' ' || invite_sent from liberado_li),
  'released convite 300 false', 'the invitation is released with its subtype, the note limit and no earlier invitation');
-- O aceite (v1: new_relation com o provider_id do perfil) pode chegar antes de o resultado do convite estar gravado:
-- sem um convite enviado a esse perfil, fica só registrado, e o mesmo evento pode ser avaliado de novo depois.
select is((select outcome || ' ' || coalesce(send_id::text, '-') || ' ' || coalesce(interaction_id::text, '-')
  from public.ingest_unipile_chat_event('rel-a', 'unipile-li-1', 'new_relation',
    jsonb_build_object('provider_id', 'ACoAAEva', 'public_identifier', 'eva-prado'))), 'relation - -',
  'an acceptance that arrives before the invitation result is recorded, tied to nothing yet');
select is((select outcome from public.ingest_unipile_chat_event('rel-b', 'unipile-li-1', 'new_relation',
  jsonb_build_object('provider_id', 'ACoAAEva'))), 'relation', 'a second acceptance event for the same profile is recorded');
select is((select outcome from public.ingest_unipile_chat_event('rel-c', 'unipile-li-1', 'new_relation',
  jsonb_build_object('provider_id', 'ACoAAEva'))), 'relation', 'and a third one');
select is(public.record_chat_step_send_result((pg_temp.envio('l1')).id, 'sent', null, 'inv-1', 'ACoAAEva', 'convite', null), 'sent',
  'the invitation was accepted by the provider');
reset role;
select is((pg_temp.envio('l1')).linkedin_action || ' ' || (pg_temp.envio('l1')).provider_user_id, 'convite ACoAAEva',
  'what went out and who it went to are kept');
set local role service_role;
select is((select outcome from public.ingest_unipile_chat_event('evt-rel1', 'unipile-li-1', 'relation.new',
  jsonb_build_object('user_id', 'ACoAAEva'))), 'relation', 'an accepted invitation (new relation) is only recorded');
select is((select outcome from public.ingest_unipile_chat_event('evt-rel2', 'unipile-li-1', 'new_relation',
  jsonb_build_object('user_id', 'ACoAAEva'))), 'relation', 'the legacy event name is treated the same way');
select is((select outcome from public.ingest_unipile_chat_event('evt-note', 'unipile-li-1', 'message.new',
  pg_temp.msg('m-note', 'chat-li-1', 'ACoAAOwner', true, 'Oi Eva, vi seu trabalho. Vamos nos conectar?'))),
  'echo', 'the echo of the invitation note is not a reply');
reset role;
select is((select status from public.sequences where id = (select valor::uuid from ids where chave = 'seq-3')), 'ativa',
  'neither the acceptance nor the note echo pauses the Sequência');

-- O aceite do convite (v1 new_relation) é ligado ao Envio do convite: mesma Conta remetente, o provider_user_id do
-- Envio é o provider_id do evento, ação 'convite' e status 'sent'. Vira a Interação 'convite-aceito', sem pausar nada.
set local role service_role;
create temporary table aceite as select * from public.ingest_unipile_chat_event('rel-c', 'unipile-li-1', 'new_relation',
  jsonb_build_object('provider_id', 'ACoAAEva'));
grant all on aceite to authenticated, service_role;
select is((select outcome from aceite), 'relation', 'the acceptance event is evaluated again once the invitation was sent, still a relation');
select is((select send_id from aceite), (pg_temp.envio('l1')).id, 'and is now tied to the Envio of the invitation');
select isnt((select interaction_id from aceite), null, 'and it records an Interação');
select is((select outcome from public.ingest_unipile_chat_event('rel-c', 'unipile-li-1', 'new_relation',
  jsonb_build_object('provider_id', 'ACoAAEva'))), 'duplicate_event', 'a redelivered acceptance that is already tied is ignored');
select is((select outcome || ' ' || coalesce(send_id::text, '-') from public.ingest_unipile_chat_event('rel-d', 'unipile-li-1', 'new_relation',
  jsonb_build_object('provider_id', 'ACoAAOutro'))), 'relation -', 'an acceptance from a profile we did not invite is only recorded');
reset role;
select is((select kind || ' ' || source || ' ' || (contact_id = (select valor::uuid from ids where chave = 'eva'))::text
  from public.account_interactions where id = (select interaction_id from aceite)),
  'convite-aceito sequencia true', 'the Interação is convite-aceito, from the Sequência, tied to the invited Contato');
select is((select count(*)::int from public.account_interactions
  where kind = 'convite-aceito' and target_account_id = (select valor::uuid from ids where chave = 'conta-3')), 1,
  'one acceptance of the invitation is one Interação');
select is((select send_id from private.unipile_chat_events where event_id = 'rel-c'), (pg_temp.envio('l1')).id,
  'the event keeps the Envio it was tied to');
select is((select status from public.sequences where id = (select valor::uuid from ids where chave = 'seq-3')), 'ativa',
  'the accepted invitation does not pause the Sequência');
select is((pg_temp.envio('l2')).status, 'scheduled', 'and the next step stays scheduled');

-- A religação das relações que ficaram sem Envio (feita uma vez pela migration): os eventos antigos ganham o Envio, sem
-- duplicar a Interação, e uma segunda passada não encontra mais nada.
select is(private.relink_linkedin_relations(), 2, 'the backfill ties the two older acceptance events to the invitation');
select is((select count(*)::int from private.unipile_chat_events where event_id in ('rel-a', 'rel-b') and send_id = (pg_temp.envio('l1')).id), 2,
  'both events now point to the Envio');
select is((select count(*)::int from public.account_interactions
  where kind = 'convite-aceito' and target_account_id = (select valor::uuid from ids where chave = 'conta-3')), 1,
  'and the backfill does not repeat the Interação');
select is(private.relink_linkedin_relations(), 0, 'a second backfill finds nothing left');
select is((select outcome || ' ' || coalesce(send_id::text, '-') from public.ingest_unipile_chat_event('evt-rel1', 'unipile-li-1', 'relation.new',
  jsonb_build_object('user_id', 'ACoAAEva'))), 'relation -', 'the v2 event (no profile id the join can read) stays only recorded');
select pg_temp.relogio('2026-10-01 10:30-03');
set local role service_role;
create temporary table liberado_li2 as select * from public.claim_due_chat_step_sends(10);
select is((select send_id from liberado_li2), (pg_temp.envio('l2')).id, 'the message step is claimed the next business day');
create temporary table liberado_li3 as select * from public.release_due_chat_step_send((pg_temp.envio('l2')).id);
grant all on liberado_li2, liberado_li3 to authenticated, service_role;
select is((select linkedin_subtype || ' ' || invite_sent || ' ' || provider_user_id from liberado_li3), 'mensagem true ACoAAEva',
  'the release says an invitation already went out and who the profile is');
select is(public.record_chat_step_send_result((pg_temp.envio('l2')).id, 'blocked', null, null, 'ACoAAEva', null, 'linkedin_not_connected'),
  'failed', 'an impediment (not connected yet) stops the step with the reason');
reset role;
select is((pg_temp.envio('l2')).status || ' ' || (pg_temp.envio('l2')).last_error || ' ' || (pg_temp.envio('l2')).attempts,
  'failed linkedin_not_connected 1', 'the reason stays on the Envio and nothing is retried');
select pg_temp.relogio('2026-10-01 12:00-03');
set local role service_role;
select is((select count(*)::int from public.claim_due_chat_step_sends(10)), 0, 'a blocked step is never retried blindly');
reset role;
select is((pg_temp.envio('l3')).status, 'waiting', 'the steps after a blocked one wait');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000001', true);
select is(pg_temp.ativar('seq-3'), 'activated l2', 'activating again puts the blocked step back in the queue');
reset role;
select is((pg_temp.envio('l2')).status || ' ' || (pg_temp.envio('l2')).attempts || ' ' || coalesce((pg_temp.envio('l2')).last_error, '-'),
  'scheduled 0 -', 'the step is scheduled again, clean');
select is((pg_temp.envio('l1')).status, 'sent', 'the invitation that went out is not sent again');
select pg_temp.relogio('2026-10-02 12:30-03');
set local role service_role;
select is((select count(*)::int from public.claim_due_chat_step_sends(10)), 1, 'the step is claimed again');
select is((select outcome from public.release_due_chat_step_send((pg_temp.envio('l2')).id)), 'released', 'and released');
select is(public.record_chat_step_send_result((pg_temp.envio('l2')).id, 'failed', null, null, null, null, 'HTTP 503', 600), 'scheduled',
  'a provider failure before it went out is retried later');
reset role;
select is((pg_temp.envio('l2')).scheduled_for >= '2026-10-02 12:40-03', true, 'the retry respects the wait the provider asked for');
select pg_temp.relogio('2026-10-02 13:00-03');
set local role service_role;
select is((select count(*)::int from public.claim_due_chat_step_sends(10)), 1, 'the retry is claimed when it is due');
select is((select outcome from public.release_due_chat_step_send((pg_temp.envio('l2')).id)), 'released', 'and released again');
select is(public.record_chat_step_send_result((pg_temp.envio('l2')).id, 'sent', 'chat-li-1', 'm-li-1', 'ACoAAEva', 'mensagem', null),
  'sent', 'the message went out now that they are connected');
reset role;
select is((select count(*)::int from public.account_interactions
  where kind = 'mensagem-enviada' and target_account_id = (select valor::uuid from ids where chave = 'conta-3')), 2,
  'the invitation and the message are both sent-message Interações');
select is((pg_temp.envio('l3')).status, 'scheduled', 'the InMail step is scheduled after the message');
set local role service_role;
select is((select outcome from public.ingest_unipile_chat_event('evt-li-r1', 'unipile-li-1', 'message.new',
  pg_temp.msg('m-in-1', 'chat-novo', 'ACoAAEva', false, 'Aceitei! Podemos falar amanhã.'))),
  'reply', 'a message from the profile we messaged is a reply even in a conversation we did not open');
select is((select outcome from public.ingest_unipile_chat_event('evt-li-r2', 'unipile-li-1', 'message.new',
  pg_temp.msg('m-in-2', 'chat-li-1', 'ACoAAEva', false, 'Pode ser às 15h.'))),
  'reply', 'and so is another one in the conversation of the sent message');
reset role;
select is((select status from public.sequences where id = (select valor::uuid from ids where chave = 'seq-3')), 'pausada',
  'a LinkedIn reply pauses the Sequência');
select is((select count(*)::int from private.received_chat_messages where channel = 'linkedin'), 2,
  'both replies are kept privately and idempotently');

-- Mudar o subtipo de um passo pendente do LinkedIn é mudar o que sai: a autorização deixa de valer.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000001', true);
select pg_temp.documento_de('seq-3',
  pg_temp.passo('l1', 'linkedin', 'eva', 0, 'Oi Eva, vi seu trabalho. Vamos nos conectar?', '{"subtipoLinkedIn": "convite"}'),
  pg_temp.passo('l2', 'linkedin', 'eva', 1, 'Obrigado por aceitar, Eva.', '{"subtipoLinkedIn": "mensagem"}'),
  pg_temp.passo('l3', 'linkedin', 'eva', 1, 'Escrevo por InMail.', '{"subtipoLinkedIn": "convite"}'));
select is((select active::text || ' ' || revoked_reason from public.get_sequence_authorization((select valor::uuid from ids where chave = 'seq-3'))),
  'false edited', 'changing the subtype of a pending LinkedIn step revokes the authorization');
reset role;
select is((pg_temp.envio('l3')).status, 'cancelled', 'and the pending step does not go out');

-- 6. Envio incerto: o eco prova que saiu, inclusive o de uma tentativa que parecia falha.
select pg_temp.relogio('2026-09-30 10:00-03');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000001', true);
select is(pg_temp.ativar('seq-4'), 'activated f1', 'the WhatsApp sequence of the other Contato is activated');
reset role;
set local role service_role;
select is((select count(*)::int from public.claim_due_chat_step_sends(10)), 1, 'its step is claimed');
select is((select outcome from public.release_due_chat_step_send((pg_temp.envio('f1')).id)), 'released', 'and released');
select is(public.record_chat_step_send_result((pg_temp.envio('f1')).id, 'uncertain', null, null, null, null, 'timeout'), 'uncertain',
  'a timeout leaves the send uncertain');
select is((select outcome from public.release_due_chat_step_send((pg_temp.envio('f1')).id)), 'reconcile_required',
  'an uncertain send is never released again');
select is((select outcome from public.ingest_unipile_chat_event('evt-f1', 'unipile-wa-1', 'message.new',
  pg_temp.msg('m-f1', 'chat-f', '5511900000000@s.whatsapp.net', true, 'Oi, Fábio.'))),
  'echo', 'the echo (same text, different spacing) reconciles it');
reset role;
select is((pg_temp.envio('f1')).status || ' ' || (pg_temp.envio('f1')).provider_chat_id || ' ' || (pg_temp.envio('f1')).provider_message_id,
  'sent chat-f m-f1', 'the send is proved and keeps the conversation');
select pg_temp.relogio('2026-10-01 10:00-03');
set local role service_role;
select is((select count(*)::int from public.claim_due_chat_step_sends(10)), 1, 'the follow-up is claimed the next day');
select is((select outcome from public.release_due_chat_step_send((pg_temp.envio('f2')).id)), 'released', 'and released');
select is((select outcome from public.release_due_chat_step_send((pg_temp.envio('f2')).id)), 'in_flight',
  'a step in flight cannot be released again');
select is(public.record_chat_step_send_result((pg_temp.envio('f2')).id, 'failed', null, null, null, null, 'HTTP 502'), 'scheduled',
  'a gateway failure schedules a retry');
select is((select outcome from public.ingest_unipile_chat_event('evt-f2', 'unipile-wa-1', 'message.new',
  pg_temp.msg('m-f2', 'chat-f', '5511900000000@s.whatsapp.net', true, 'Segue o acompanhamento.'))),
  'echo', 'but the message did go out: the echo arrives');
reset role;
select is((pg_temp.envio('f2')).status, 'sent', 'the retry is cancelled by the proof that it went out');
set local role service_role;
select is((select count(*)::int from public.claim_due_chat_step_sends(10)), 0, 'so it is not sent a second time');

-- 6b. O Destino fixado (ADR-0014) e a Conta remetente pronta valem na hora de enviar, não só na ativação.
select pg_temp.relogio('2026-09-30 10:10-03');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000001', true);
select is((select (public.update_contact((select valor::uuid from ids where chave = 'gil'), null, null, null, '(11) 94444-3333')).phone),
  '+5511944443333', 'an edit of the Contato changes the phone after the step was confirmed');
reset role;
update private.sender_accounts set status = 'reconnect_required', reconciliation_required = true
where unipile_account_id = 'unipile-wa-1';
update private.sequence_step_sends set claimed_until = null where step_id = 'g2';
set local role service_role;
select is((select count(*)::int from public.claim_due_chat_step_sends(10) where send_id = (pg_temp.envio('g2')).id), 1,
  'the due WhatsApp step is claimed');
select is((select outcome from public.release_due_chat_step_send((pg_temp.envio('g2')).id)), 'sender_not_ready',
  'with the WhatsApp account waiting for reconnection nothing is sent');
reset role;
select is((pg_temp.envio('g2')).status || ' ' || (pg_temp.envio('g2')).last_error, 'scheduled sender_not_ready',
  'the step stays scheduled with the reason on it');
update private.sender_accounts set status = 'ready', reconciliation_required = false where unipile_account_id = 'unipile-wa-1';
update private.sequence_step_sends set claimed_until = null where step_id = 'g2';
set local role service_role;
select is((select outcome from public.release_due_chat_step_send((pg_temp.envio('g2')).id)), 'destination_changed',
  'a phone the Contato no longer has is sent neither to the old nor to the new number');
reset role;
select is((pg_temp.envio('g2')).status || ' ' || (pg_temp.envio('g2')).destination, 'awaiting_reconfirmation +5511955554444',
  'the step waits for the owner to confirm again');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000001', true);
select is(pg_temp.ativar('seq-5'), 'activated g2', 'activating again confirms the step');
reset role;
select is((pg_temp.envio('g2')).destination || ' ' || (pg_temp.envio('g2')).status, '+5511944443333 scheduled',
  'the new phone is now the fixed Destino');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000001', true);
select pg_temp.documento_de('seq-5',
  pg_temp.passo('g1', 'email', 'gil', 0, 'Olá, Gil.'),
  pg_temp.passo('g2', 'whatsapp', 'gil', 0, 'Olá de novo, Gil.', '{"destino": 2}'),
  pg_temp.passo('g3', 'email', 'gil', 1, 'Fechando.'));
select is((select active::text || ' ' || revoked_reason from public.get_sequence_authorization((select valor::uuid from ids where chave = 'seq-5'))),
  'false edited', 'choosing another phone for a pending WhatsApp step revokes the authorization');
select is(pg_temp.ativar('seq-5'), 'phone_not_found g2', 'and the new choice is validated before it is authorized');

-- 7. Quem não é o Executor não chama nada disso.
set local role authenticated;
select throws_ok($$select * from public.ingest_unipile_chat_event('evt-forjado', 'unipile-wa-1', 'message.new', '{}'::jsonb)$$,
  '42501', 'permission denied for function ingest_unipile_chat_event', 'signed-in users cannot forge chat events');
select throws_ok($$select * from public.claim_due_chat_step_sends(5)$$,
  '42501', 'permission denied for function claim_due_chat_step_sends', 'signed-in users cannot claim chat steps');
select throws_ok($$select * from public.release_due_chat_step_send(gen_random_uuid())$$,
  '42501', 'permission denied for function release_due_chat_step_send', 'signed-in users cannot release chat steps');
select throws_ok($$select public.record_chat_step_send_result(gen_random_uuid(), 'sent', null, null, null, null, null)$$,
  '42501', 'permission denied for function record_chat_step_send_result', 'signed-in users cannot record chat results');

-- 8. Apagar o Contato apaga o que ele escreveu e solta os ids do provedor (CRM-18).
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000003', true);
select lives_ok($$select public.erase_contact((select valor::uuid from ids where chave = 'maria'), 'Maria Souza')$$,
  'an Administrator erases the Contato');
reset role;
select is((select count(*)::int from private.received_chat_messages
  where sequence_id = (select valor::uuid from ids where chave = 'seq-1')), 0, 'the messages the Contato wrote are erased');
select is((select provider_chat_id is null and provider_user_id is null and anonymized_at is not null
  from private.sequence_step_sends where step_id = 'p1'), true, 'the Envio loses the conversation and is anonymized');
select is((select count(*)::int from private.unipile_chat_events where provider_chat_id = 'chat-1' or provider_message_id = 'msg-r1'), 0,
  'the chat events no longer carry the ids of that conversation');
select is((select count(*)::int from public.account_interactions
  where kind = 'mensagem-recebida' and target_account_id = (select valor::uuid from ids where chave = 'conta-1')), 1,
  'the shared Interação stays, without the Contato');

select * from finish();
rollback;

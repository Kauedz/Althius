begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(12);

-- Workspace da empresa com o Vendedor responsável (titular) e uma colega Membro.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('62000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'titular@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('62000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'colega@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('63000000-0000-0000-0000-000000000001', 'empresa', 'Cliente');

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('63000000-0000-0000-0000-000000000001', '62000000-0000-0000-0000-000000000001', 'member', true),
  ('63000000-0000-0000-0000-000000000001', '62000000-0000-0000-0000-000000000002', 'member', true);

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
select set_config('request.jwt.claim.sub', '62000000-0000-0000-0000-000000000001', true);

insert into ids select 'conta', id::text from public.save_target_account(
  '63000000-0000-0000-0000-000000000001', 'Empresa Alvo', 'https://empresa-alvo.test');
insert into ids select 'maria', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta'), 'Maria Souza', 'Diretora', 'maria@empresa-alvo.test');
insert into ids select 'sequencia', id::text from public.create_sequence(
  '63000000-0000-0000-0000-000000000001',
  (select valor from ids where chave = 'conta'),
  jsonb_build_object('participantesIds', jsonb_build_array((select valor from ids where chave = 'maria')),
    'steps', jsonb_build_array(
      jsonb_build_object('id', 'passo-1', 'ordem', 1, 'canal', 'email', 'contatoId', (select valor from ids where chave = 'maria'),
        'delayDiasUteis', 0, 'titulo', 'Abertura', 'assunto', 'Apresentação', 'corpo', 'Olá, Maria.'),
      jsonb_build_object('id', 'passo-2', 'ordem', 2, 'canal', 'email', 'contatoId', (select valor from ids where chave = 'maria'),
        'delayDiasUteis', 2, 'titulo', 'Follow-up', 'assunto', 'Re: Apresentação', 'corpo', 'Seguindo.'))),
  '{}'::jsonb);
insert into ids select 'tentativa', attempt_id::text from public.create_sender_connection_attempt(
  '63000000-0000-0000-0000-000000000001', 'email', null);
reset role;
set local role service_role;
select is(public.complete_sender_connection_attempt(
  (select valor::uuid from ids where chave = 'tentativa'), 'unipile-v1-9', 'GOOGLE', 'CREATION_SUCCESS'
), 'completed', 'the owner email sender account is linked');
select is(public.apply_unipile_sender_status('unipile-v1-9', 'SYNC_SUCCESS'), true, 'the owner email sender account is ready');

-- O passo 1 é confirmado, liberado e aceito pelo provedor.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '62000000-0000-0000-0000-000000000001', true);
insert into ids select 'envio-1', id::text from public.confirm_sequence_step((select valor::uuid from ids where chave = 'sequencia'), 'passo-1');
reset role;
set local role service_role;
select is((select outcome from public.release_sequence_step_send((select valor::uuid from ids where chave = 'envio-1'), '62000000-0000-0000-0000-000000000001')),
  'released', 'step 1 is released');

-- Na v1 o envio grava SÓ o id do e-mail na Unipile (tracking_id): sem message_id (Message-ID do cabeçalho) e sem conversa.
select is(public.record_sequence_step_send_result((select valor::uuid from ids where chave = 'envio-1'), 'sent', 'nSJU60KtTQaNv-k2we_GIw', null, null),
  'sent', 'the v1 send is accepted with only the e-mail id');
reset role;
select is((select coalesce(provider_message_id, '') || coalesce(provider_thread_id, '') from private.sequence_step_sends
  where id = (select valor::uuid from ids where chave = 'envio-1')), '', 'the v1 send has neither a message id nor a conversation');
set local role service_role;

-- Um e-mail no formato que o webhook v1 entrega já traduzido: o objeto Email canônico com in_reply_to {id, message_id}.
create function pg_temp.resposta_v1(p_id text, p_in_reply_to jsonb, p_subject text default 'Re: Apresentação') returns jsonb language sql as $f$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', p_id, 'subject', p_subject, 'body', 'Obrigada!', 'date', '2026-10-10T10:00:00Z',
    'from', jsonb_build_object('email', 'maria@empresa-alvo.test', 'display_name', 'Maria'),
    'in_reply_to', p_in_reply_to))
$f$;
grant execute on function pg_temp.resposta_v1(text, jsonb, text) to service_role;

-- A. Sem in_reply_to (e sem conversa nem Message-ID), a resposta não tem como ligar: continua sem relação.
select is((select outcome from public.ingest_unipile_email_event('evt-v1-1', 'email.new', 'unipile-v1-9',
  pg_temp.resposta_v1('lYwp-E_oXMKFkkhGid3iGQ', null), '{}')),
  'unrelated', 'a reply without in_reply_to, conversation or Message-ID is still unrelated');
-- B. in_reply_to de outro e-mail, de outro assunto: sem relação. (Com o mesmo remetente e o mesmo assunto, a correção de
-- fix-v1-email-whatsapp liga pelo passo 4b mesmo com in_reply_to.id desconhecido: ver resposta_de_email_v1_pelo_remetente.sql.)
select is((select outcome from public.ingest_unipile_email_event('evt-v1-2', 'email.new', 'unipile-v1-9',
  pg_temp.resposta_v1('reply-outro', jsonb_build_object('id', 'outro-email-id'), 'Re: Outro assunto'), '{}')),
  'unrelated', 'a reply to an e-mail the sequence did not send is unrelated');
-- C. in_reply_to malformado (texto em vez de objeto) não derruba nem liga.
select is((select outcome from public.ingest_unipile_email_event('evt-v1-3', 'email.new', 'unipile-v1-9',
  pg_temp.resposta_v1('reply-texto', to_jsonb('nSJU60KtTQaNv-k2we_GIw'::text)), '{}')),
  'unrelated', 'a malformed in_reply_to neither fails nor links');
-- D. in_reply_to.id é o id do e-mail que o envio gravou: é resposta.
create temporary table resposta as select * from public.ingest_unipile_email_event('evt-v1-4', 'email.new', 'unipile-v1-9',
  pg_temp.resposta_v1('lYwp-E_oXMKFkkhGid3iGQ-2', jsonb_build_object('id', 'nSJU60KtTQaNv-k2we_GIw')), '{}');
grant all on resposta to authenticated, service_role;
select is((select outcome from resposta), 'reply', 'a v1 reply is linked by in_reply_to.id against the send provider_email_id');
select is((select send_id from resposta), (select valor::uuid from ids where chave = 'envio-1'), 'and it is tied to the send that was replied to');
select is((select status from public.sequences where id = (select valor::uuid from ids where chave = 'sequencia')),
  'pausada', 'and the sequence pauses');
-- E. in_reply_to.message_id contra o provider_message_id do envio (quando o envio o tem).
reset role;
update private.sequence_step_sends set provider_message_id = '<v1-msg-1@mail.gmail.com>'
where id = (select valor::uuid from ids where chave = 'envio-1');
set local role service_role;
select is((select outcome from public.ingest_unipile_email_event('evt-v1-5', 'email.new', 'unipile-v1-9',
  pg_temp.resposta_v1('reply-por-message-id', jsonb_build_object('id', 'id-que-nao-existe', 'message_id', '<v1-msg-1@mail.gmail.com>')), '{}')),
  'reply', 'a reply is also linked by in_reply_to.message_id against the send provider_message_id');

select * from finish();
rollback;

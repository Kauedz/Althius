begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(13);

-- Workspace da empresa com o Vendedor responsável (titular) e uma colega Membro.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('64000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'titular@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('64000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'colega@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('65000000-0000-0000-0000-000000000001', 'empresa', 'Cliente');

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('65000000-0000-0000-0000-000000000001', '64000000-0000-0000-0000-000000000001', 'member', true),
  ('65000000-0000-0000-0000-000000000001', '64000000-0000-0000-0000-000000000002', 'member', true);

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
select set_config('request.jwt.claim.sub', '64000000-0000-0000-0000-000000000001', true);

insert into ids select 'conta', id::text from public.save_target_account(
  '65000000-0000-0000-0000-000000000001', 'Empresa Alvo', 'https://empresa-alvo.test');
insert into ids select 'maria', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta'), 'Maria Souza', 'Diretora', 'maria@empresa-alvo.test');
insert into ids select 'sequencia', id::text from public.create_sequence(
  '65000000-0000-0000-0000-000000000001',
  (select valor from ids where chave = 'conta'),
  jsonb_build_object('participantesIds', jsonb_build_array((select valor from ids where chave = 'maria')),
    'steps', jsonb_build_array(
      jsonb_build_object('id', 'passo-1', 'ordem', 1, 'canal', 'email', 'contatoId', (select valor from ids where chave = 'maria'),
        'delayDiasUteis', 0, 'titulo', 'Abertura', 'assunto', 'Apresentação', 'corpo', 'Olá, Maria.'),
      jsonb_build_object('id', 'passo-2', 'ordem', 2, 'canal', 'email', 'contatoId', (select valor from ids where chave = 'maria'),
        'delayDiasUteis', 2, 'titulo', 'Follow-up', 'assunto', 'Re: Apresentação', 'corpo', 'Seguindo.'))),
  '{}'::jsonb);
insert into ids select 'tentativa', attempt_id::text from public.create_sender_connection_attempt(
  '65000000-0000-0000-0000-000000000001', 'email', null);
reset role;
set local role service_role;
select is(public.complete_sender_connection_attempt(
  (select valor::uuid from ids where chave = 'tentativa'), 'unipile-v1-10', 'GOOGLE', 'CREATION_SUCCESS'
), 'completed', 'the owner email sender account is linked');
select is(public.apply_unipile_sender_status('unipile-v1-10', 'SYNC_SUCCESS'), true, 'the owner email sender account is ready');

-- O passo 1 é confirmado, liberado e aceito pelo provedor.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '64000000-0000-0000-0000-000000000001', true);
insert into ids select 'envio-1', id::text from public.confirm_sequence_step((select valor::uuid from ids where chave = 'sequencia'), 'passo-1');
reset role;
set local role service_role;
select is((select outcome from public.release_sequence_step_send((select valor::uuid from ids where chave = 'envio-1'), '64000000-0000-0000-0000-000000000001')),
  'released', 'step 1 is released');

-- Na v1 o envio grava SÓ o id do e-mail (tracking_id): sem message_id (Message-ID do cabeçalho), sem conversa.
select is(public.record_sequence_step_send_result((select valor::uuid from ids where chave = 'envio-1'), 'sent', 'd-xgsvRATSOxw2SkcnJR3A', null, null),
  'sent', 'the v1 send is accepted with only the tracking id');

-- A resposta REAL da v1 (10/10): in_reply_to.id é o id do e-mail enviado NA CAIXA (diferente do tracking_id) e in_reply_to.message_id
-- é o Message-ID do cabeçalho; o envio não tem nenhum dos dois, e o eco não chega. O que liga é o remetente (o Destino do envio),
-- o assunto e o fato de ser resposta a um e-mail.
reset role;
set local role service_role;
create function pg_temp.resposta_v1(p_id text, p_from text, p_subject text, p_in_reply_to jsonb, p_thread text default null)
returns jsonb language sql as $f$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', p_id, 'thread_id', p_thread, 'subject', p_subject, 'body', 'Obrigada!', 'date', '2026-10-10T10:00:00Z',
    'from', jsonb_build_object('email', p_from, 'display_name', 'Maria'),
    'in_reply_to', p_in_reply_to))
$f$;
grant execute on function pg_temp.resposta_v1(text, text, text, jsonb, text) to service_role;

-- A. Remetente que não é o Destino de nenhum envio: sem relação.
select is((select outcome from public.ingest_unipile_email_event('evt-a-1', 'email.new', 'unipile-v1-10',
  pg_temp.resposta_v1('r-outro-remetente', 'outra@empresa-alvo.test', 'Re: Apresentação',
    jsonb_build_object('id', 'hfqVeXPLUp-cEc9OtgjAlQ', 'message_id', '<CAAPQ0BpN2yc@mail.gmail.com>')), '{}')),
  'unrelated', 'a reply from someone the sequence did not e-mail is unrelated');
-- B. O Destino do envio, mas outro assunto: sem relação.
select is((select outcome from public.ingest_unipile_email_event('evt-a-2', 'email.new', 'unipile-v1-10',
  pg_temp.resposta_v1('r-outro-assunto', 'maria@empresa-alvo.test', 'Re: Outro assunto',
    jsonb_build_object('id', 'hfqVeXPLUp-cEc9OtgjAlQ', 'message_id', '<CAAPQ0BpN2yc@mail.gmail.com>')), '{}')),
  'unrelated', 'a reply with another subject is unrelated');
-- C. Sem in_reply_to (o formato da v2 hoje, sem conversa nem Message-ID): continua sem relação. A v2 não muda.
select is((select outcome from public.ingest_unipile_email_event('evt-a-3', 'email.new', 'unipile-v1-10',
  pg_temp.resposta_v1('r-sem-in-reply-to', 'maria@empresa-alvo.test', 'Re: Apresentação', null), '{}')),
  'unrelated', 'without in_reply_to nothing changes: still unrelated');
-- D. A resposta real: o Destino do envio, o mesmo assunto e in_reply_to.
create temporary table resposta as select * from public.ingest_unipile_email_event('evt-a-4', 'email.new', 'unipile-v1-10',
  pg_temp.resposta_v1('lYwp-E_oXMKFkkhGid3iGQ', 'Maria@Empresa-Alvo.test', 'Re: Apresentação',
    jsonb_build_object('id', 'hfqVeXPLUp-cEc9OtgjAlQ', 'message_id', '<CAAPQ0BpN2yc@mail.gmail.com>'), 'th-v1-1'), '{}');
grant all on resposta to authenticated, service_role;
select is((select outcome from resposta), 'reply', 'the v1 reply is linked by the sender address, the subject and in_reply_to');
select is((select send_id from resposta), (select valor::uuid from ids where chave = 'envio-1'), 'and it is tied to the send it answers');
select is((select status from public.sequences where id = (select valor::uuid from ids where chave = 'sequencia')),
  'pausada', 'and the sequence pauses');
-- E. O envio aprende a conversa e o Message-ID: o resto da conversa liga pelos caminhos de sempre.
reset role;
select is((select provider_message_id || ' ' || provider_thread_id from private.sequence_step_sends
  where id = (select valor::uuid from ids where chave = 'envio-1')), '<CAAPQ0BpN2yc@mail.gmail.com> th-v1-1',
  'the send learns the Message-ID and the conversation from the reply');
set local role service_role;
select is((select outcome from public.ingest_unipile_email_event('evt-a-5', 'email.new', 'unipile-v1-10',
  pg_temp.resposta_v1('r-segunda', 'maria@empresa-alvo.test', 'Re: Re: Apresentação',
    jsonb_build_object('id', 'outro-id', 'message_id', '<resposta-1@mail.gmail.com>'), 'th-v1-1'), '{}')),
  'reply', 'a later e-mail of the same conversation links by the conversation');
-- F. O que o titular escreve continua sendo eco, nunca resposta (a Conta remetente aprende o endereço no eco).
select is((select outcome from public.ingest_unipile_email_event('evt-a-6', 'email.new', 'unipile-v1-10',
  pg_temp.resposta_v1('r-titular', 'althius.relacionamento@gmail.com', 'Re: Apresentação',
    jsonb_build_object('id', 'x', 'message_id', '<y@z>')), array['althius.relacionamento@gmail.com'])),
  'echo', 'what the owner writes is still an echo');

select * from finish();
rollback;

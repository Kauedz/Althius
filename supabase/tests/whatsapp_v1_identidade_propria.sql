begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(20);

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
  ('d0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'titular@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('d0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'colega@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('d0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'admin@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('d1000000-0000-0000-0000-000000000001', 'empresa', 'Cliente');

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'member', true),
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'member', true),
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'admin', true);

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

-- O titular cadastra a Conta-alvo, o Contato e a Sequência de WhatsApp.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000001', true);
insert into ids select 'conta-1', id::text from public.save_target_account('d1000000-0000-0000-0000-000000000001', 'Empresa Um', 'https://empresa-um.test');
insert into ids select 'maria', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta-1'), 'Maria Souza', 'Diretora', 'maria@empresa-um.test', '(11) 98888-7777');
insert into ids select 'seq-1', id::text from public.create_sequence('d1000000-0000-0000-0000-000000000001',
  (select valor from ids where chave = 'conta-1'),
  pg_temp.documento(pg_temp.passo('p1', 'whatsapp', 'maria', 0, 'Olá {{contato.primeiro_nome}}, tudo bem?')));
insert into ids select 'tentativa-wa', attempt_id::text from public.create_sender_connection_attempt(
  'd1000000-0000-0000-0000-000000000001', 'whatsapp', null);
reset role;
set local role service_role;
select is(public.complete_sender_connection_attempt((select valor::uuid from ids where chave = 'tentativa-wa'),
  'unipile-wa-1', 'WHATSAPP', 'CREATION_SUCCESS'), 'completed', 'the WhatsApp sender account is linked');
select is(public.apply_unipile_sender_status('unipile-wa-1', 'SYNC_SUCCESS'), true, 'the WhatsApp sender account is ready');
reset role;
select is(private.set_chat_channel_enabled('whatsapp', true), true, 'the database admin switches WhatsApp on');
select pg_temp.relogio('2026-09-30 10:00-03');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000001', true);
create function pg_temp.ativar(p_seq text) returns text language sql as $f$
  select outcome || ' ' || coalesce(step_id, 'nenhum') from public.activate_sequence((select valor::uuid from ids where chave = p_seq));
$f$;
grant execute on function pg_temp.ativar(text) to authenticated;
select is(pg_temp.ativar('seq-1'), 'activated p1', 'the WhatsApp sequence is activated');
reset role;
set local role service_role;
create temporary table reserva as select * from public.claim_due_chat_step_sends(10);
grant all on reserva to authenticated, service_role;
create temporary table liberado as select * from public.release_due_chat_step_send((pg_temp.envio('p1')).id);
grant all on liberado to authenticated, service_role;
select is(public.record_chat_step_send_result((pg_temp.envio('p1')).id, 'sent', 'chat-1', 'msg-1', null, null, null), 'sent',
  'the provider accepted the message');
reset role;

-- A mensagem da v1 já traduzida: sem is_sender (o aviso da v1 do WhatsApp não diz de quem é), só o remetente.
create function pg_temp.mensagem_wa(p_id text, p_sender text) returns jsonb language sql as $f$
  select jsonb_build_object('id', p_id, 'chat_id', 'chat-1', 'sender_id', p_sender, 'text', 'Tenho interesse',
    'is_event', false, 'deleted', false, 'attachments', '[]'::jsonb)
$f$;
grant execute on function pg_temp.mensagem_wa(text, text) to service_role;
select is((select own_provider_id is null from private.sender_accounts where unipile_account_id = 'unipile-wa-1'), true,
  'the WhatsApp sender account does not know its own number yet');

-- A. O defeito: sem saber o número do titular, a resposta não se distingue de uma mensagem do titular e fica sem relação.
set local role service_role;
select is((select outcome from public.ingest_unipile_chat_event('wa-1', 'unipile-wa-1', 'message.new',
  pg_temp.mensagem_wa('m-1', '5511988887777@s.whatsapp.net'))), 'unrelated', 'without the own number the reply stays unrelated');

-- B. A conexão (ou a leitura da conta na Unipile) ensina o número do titular, no formato do remetente das mensagens.
select throws_ok($$select public.learn_sender_own_provider_id('unipile-wa-1', 'não é um número')$$, '22023', null,
  'an own id that is not a WhatsApp id is refused');
select is(public.learn_sender_own_provider_id('desconhecida', '5511900000000@s.whatsapp.net'), false, 'an unknown account learns nothing');
select is(public.learn_sender_own_provider_id('unipile-wa-1', '5511900000000@s.whatsapp.net'), true, 'the WhatsApp sender account learns its number');
select is(public.learn_sender_own_provider_id('unipile-wa-1', '5511900000000@s.whatsapp.net'), false, 'learning the same number again changes nothing');
select is(public.sender_own_provider_id('unipile-wa-1'), '5511900000000@s.whatsapp.net', 'the number can be read back');
select is(public.sender_own_provider_id('desconhecida'), null, 'an unknown account has none');

-- C. Agora a resposta do Contato liga ao envio e pausa a Sequência; a mensagem do próprio titular é eco.
select is((select outcome from public.ingest_unipile_chat_event('wa-2', 'unipile-wa-1', 'message.new',
  pg_temp.mensagem_wa('m-2', '5511900000000@s.whatsapp.net'))), 'echo', 'a message from the owner own number is an echo');
create temporary table resposta as select * from public.ingest_unipile_chat_event('wa-3', 'unipile-wa-1', 'message.new',
  pg_temp.mensagem_wa('m-3', '5511988887777@s.whatsapp.net'));
grant all on resposta to authenticated, service_role;
select is((select outcome from resposta), 'reply', 'the Contato reply is linked to the send once the own number is known');
select is((select send_id from resposta), (pg_temp.envio('p1')).id, 'and it is tied to the WhatsApp send');
reset role;
select is((select status from public.sequences where id = (select valor::uuid from ids where chave = 'seq-1')), 'pausada', 'and the sequence pauses');

-- D. Quem pode: só o service_role aprende e lê.
set local role authenticated;
select throws_ok($$select public.learn_sender_own_provider_id('unipile-wa-1', '5511900000001@s.whatsapp.net')$$, '42501', null,
  'signed-in users cannot set the own number');
select throws_ok($$select public.sender_own_provider_id('unipile-wa-1')$$, '42501', null, 'signed-in users cannot read it');
reset role;
-- E. Uma troca de número (o titular reconectou com outro chip) é aprendida de novo.
set local role service_role;
select is(public.learn_sender_own_provider_id('unipile-wa-1', '5511900000001@s.whatsapp.net'), true, 'a changed number is learned again');

select * from finish();
rollback;

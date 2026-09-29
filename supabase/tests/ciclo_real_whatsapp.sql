begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(178);

-- O relógio da agenda fica parado onde o teste quiser, só dentro desta transação.
create function pg_temp.relogio(p_at timestamptz) returns void language plpgsql as $f$
begin
  execute format(
    'create or replace function private.clock_now() returns timestamptz language sql stable set search_path = '''' '
    'as $c$ select %L::timestamptz $c$', p_at);
end
$f$;

-- O id do Envio de um passo e uma coluna dele, lidos como dono do banco para valer também sob service_role.
create function pg_temp.envio(p_step text) returns uuid language sql security definer as $f$
  select id from private.sequence_step_sends where step_id = p_step
$f$;
grant execute on function pg_temp.envio(text) to service_role, authenticated;

create function pg_temp.col(p_step text, p_col text) returns text language sql security definer as $f$
  select to_jsonb(e) ->> p_col from private.sequence_step_sends e where e.step_id = p_step
$f$;
grant execute on function pg_temp.col(text, text) to service_role, authenticated;

-- Passa um minuto para o espaçamento do WhatsApp: recua a hora do último envio e da última reserva.
create function pg_temp.passa_o_tempo() returns void language sql security definer as $f$
  update private.sequence_step_sends set
    sending_at = sending_at - interval '1 minute', claimed_at = claimed_at - interval '1 minute'
$f$;
grant execute on function pg_temp.passa_o_tempo() to service_role, authenticated;

-- Workspace Norte: Vera (Vendedora responsável), Caio (colega Membro, com a própria Conta de WhatsApp pronta) e Ana
-- (Administradora). Zeca é do Workspace Sul.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('c1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'vera@norte.com.br', '', now(), now(), now(), '{}', '{"full_name": "Vera Lima"}', false, false),
  ('c1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'caio@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('c1000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'ana@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('c1000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'zeca@sul.com.br', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('c2000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('c2000000-0000-0000-0000-000000000002', 'empresa', 'Sul');

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'member', true),
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', 'member', true),
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000003', 'admin', true),
  ('c2000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000004', 'admin', true);

create temporary table ids (chave text primary key, valor text);
grant all on ids to authenticated, service_role;

create function pg_temp.passo(p_id text, p_canal text, p_contato text, p_destino jsonb default null,
  p_corpo text default 'Olá, {{contato.primeiro_nome}}.', p_assunto text default null)
returns jsonb language sql as $f$
  select jsonb_strip_nulls(jsonb_build_object('id', p_id, 'canal', p_canal,
    'contatoId', (select valor from ids where chave = p_contato), 'delayDiasUteis', 0, 'titulo', p_id,
    'assunto', p_assunto, 'corpo', p_corpo, 'destino', p_destino));
$f$;

create function pg_temp.documento(variadic p_steps jsonb[]) returns jsonb language sql as $f$
  select jsonb_build_object('participantesIds', '[]'::jsonb, 'janelaPadrao', '{"de": "09:00", "ate": "18:00"}'::jsonb,
    'steps', to_jsonb(p_steps));
$f$;

-- Vera cadastra as Contas-alvo e os Contatos. Maria tem três telefones (o segundo é fixo e sem WhatsApp); João tem o
-- principal SEM a marca de WhatsApp; Ana Reis não tem telefone.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000001', true);
insert into ids select 'conta', id::text from public.save_target_account('c2000000-0000-0000-0000-000000000001', 'Empresa Alvo', 'https://empresa-alvo.test');
insert into ids select 'conta-2', id::text from public.save_target_account('c2000000-0000-0000-0000-000000000001', 'Segunda Empresa', 'https://segunda.test');
insert into ids select 'conta-3', id::text from public.save_target_account('c2000000-0000-0000-0000-000000000001', 'Terceira Empresa', 'https://terceira.test');
insert into ids select 'maria', id::text from public.create_contact((select valor::uuid from ids where chave = 'conta'), 'Maria Souza', 'Diretora', 'maria@empresa-alvo.test', '+5511987654321');
insert into ids select 'joao', id::text from public.create_contact((select valor::uuid from ids where chave = 'conta'), 'João Lima', 'Gerente', 'joao@empresa-alvo.test', '+5511900001111');
insert into ids select 'ana', id::text from public.create_contact((select valor::uuid from ids where chave = 'conta'), 'Ana Reis', 'Sócia', 'ana.reis@empresa-alvo.test');
insert into ids select 'lia', id::text from public.create_contact((select valor::uuid from ids where chave = 'conta'), 'Lia Prado', 'Analista', 'lia@empresa-alvo.test', '+5511900002222');
insert into ids select 'pedro', id::text from public.create_contact((select valor::uuid from ids where chave = 'conta-2'), 'Pedro Alves', 'Diretor', 'pedro@segunda.test', '+5511955550001');
insert into ids select 'rui', id::text from public.create_contact((select valor::uuid from ids where chave = 'conta-3'), 'Rui Costa', 'Sócio', 'rui@terceira.test', '+5511955550003');
select lives_ok($$select * from public.set_contact_channels((select valor::uuid from ids where chave = 'maria'), null,
  '[{"value": "+5511987654321"}, {"value": "+551133334444", "kind": "fixo", "whatsapp": false}, {"value": "+5511911112222"}]')$$,
  'Vera gives Maria three phones, the second without WhatsApp');
select lives_ok($$select * from public.set_contact_channels((select valor::uuid from ids where chave = 'joao'), null,
  '[{"value": "+5511900001111", "whatsapp": false}]')$$,
  'Vera turns the WhatsApp flag off on João''s principal phone');
select lives_ok($$select * from public.set_contact_channels((select valor::uuid from ids where chave = 'pedro'), null,
  '[{"value": "+5511955550001"}, {"value": "+5511955550002"}]')$$, 'Pedro has two WhatsApp phones');
select lives_ok($$select * from public.set_contact_channels((select valor::uuid from ids where chave = 'rui'), null,
  '[{"value": "+5511955550003"}, {"value": "+5511955550004"}]')$$, 'Rui has two WhatsApp phones');
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000004', true);
insert into ids select 'conta-sul', id::text from public.save_target_account('c2000000-0000-0000-0000-000000000002', 'Empresa Sul', 'https://sul.test');
reset role;

-- 1. A visão dos Contatos: `whatsapp` só mostra o telefone principal quando ele é marcado como WhatsApp.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000001', true);
select is((select whatsapp from public.target_contacts where id = (select valor::uuid from ids where chave = 'maria')),
  '+5511987654321', 'a principal phone flagged as WhatsApp shows as whatsapp');
select is((select whatsapp is null from public.target_contacts where id = (select valor::uuid from ids where chave = 'joao')),
  true, 'a principal phone without the WhatsApp flag no longer shows as whatsapp');
select is((select phone from public.target_contacts where id = (select valor::uuid from ids where chave = 'joao')),
  '+5511900001111', 'the phone itself is still listed');
select is((select whatsapp is null from public.target_contacts where id = (select valor::uuid from ids where chave = 'ana')),
  true, 'a Contato without a phone has no whatsapp');
select is((select array_agg(a.attname::text order by a.attnum) from pg_attribute a
    where a.attrelid = 'public.target_contacts'::regclass and a.attnum > 0 and not a.attisdropped),
  array['id', 'workspace_id', 'target_account_id', 'link_id', 'name', 'role', 'email', 'phone', 'whatsapp', 'linkedin',
    'linkedin_identity', 'is_real', 'started_at', 'last_interaction_at', 'created_at', 'updated_at'],
  'every column of the view is still there, in the same order');
select is((select c.reloptions from pg_class c where c.oid = 'public.target_contacts'::regclass),
  array['security_invoker=true'], 'the view still runs with the rights of who queries it');
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000004', true);
select is((select count(*)::int from public.target_contacts), 0, 'a participant of another Workspace sees none of these Contatos');
reset role;
set local role anon;
select throws_ok($$select * from public.target_contacts$$, '42501', 'permission denied for view target_contacts',
  'anon cannot read the view');
reset role;

-- 2. As Contas remetentes: Vera e Caio conectam o próprio WhatsApp; Vera também o E-mail.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000001', true);
insert into ids select 'tentativa-wa-vera', attempt_id::text from public.create_sender_connection_attempt('c2000000-0000-0000-0000-000000000001', 'whatsapp', null);
insert into ids select 'tentativa-em-vera', attempt_id::text from public.create_sender_connection_attempt('c2000000-0000-0000-0000-000000000001', 'email', null);
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000002', true);
insert into ids select 'tentativa-wa-caio', attempt_id::text from public.create_sender_connection_attempt('c2000000-0000-0000-0000-000000000001', 'whatsapp', null);
reset role;
set local role service_role;
select is(public.complete_sender_connection_attempt((select valor::uuid from ids where chave = 'tentativa-wa-vera'), 'wa-vera', 'WHATSAPP', 'CREATION_SUCCESS'),
  'completed', 'Vera links her WhatsApp account');
select is(public.apply_unipile_sender_status('wa-vera', 'SYNC_SUCCESS'), true, 'and it is ready after the initial sync');
select is(public.complete_sender_connection_attempt((select valor::uuid from ids where chave = 'tentativa-wa-caio'), 'wa-caio', 'WHATSAPP', 'CREATION_SUCCESS'),
  'completed', 'Caio links his own WhatsApp account');
select is(public.apply_unipile_sender_status('wa-caio', 'SYNC_SUCCESS'), true, 'and it is ready too');
select is(public.complete_sender_connection_attempt((select valor::uuid from ids where chave = 'tentativa-em-vera'), 'em-vera', 'GOOGLE', 'CREATION_SUCCESS'),
  'completed', 'Vera links her e-mail account');
select is(public.apply_unipile_sender_status('em-vera', 'SYNC_SUCCESS'), true, 'and it is ready');
reset role;

-- 3. A Sequência da Conta-alvo, ainda sem ativar (confirmação avulsa e envio pelo titular).
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000001', true);
insert into ids select 'sequencia', id::text from public.create_sequence(
  'c2000000-0000-0000-0000-000000000001', (select valor from ids where chave = 'conta'),
  pg_temp.documento(
    pg_temp.passo('w-1', 'whatsapp', 'maria'),
    pg_temp.passo('w-2', 'whatsapp', 'maria', '3'),
    pg_temp.passo('w-3', 'whatsapp', 'maria', '2'),
    pg_temp.passo('w-4', 'whatsapp', 'ana'),
    pg_temp.passo('w-5', 'whatsapp', 'joao'),
    pg_temp.passo('w-6', 'whatsapp', 'maria', '7'),
    pg_temp.passo('w-7', 'whatsapp', 'maria'),
    pg_temp.passo('w-8', 'whatsapp', 'rui'),
    pg_temp.passo('w-9', 'whatsapp', 'maria'),
    pg_temp.passo('w-10', 'whatsapp', 'maria', '3'),
    pg_temp.passo('w-11', 'whatsapp', 'maria'),
    pg_temp.passo('w-12', 'whatsapp', 'lia'),
    pg_temp.passo('w-13', 'whatsapp', 'maria'),
    pg_temp.passo('w-14', 'whatsapp', 'maria'),
    pg_temp.passo('w-15', 'whatsapp', 'maria'),
    pg_temp.passo('e-1', 'email', 'maria', null, 'Segue.', 'Re: Apresentação')));

select is((select status || ' ' || destination from public.confirm_whatsapp_step((select valor::uuid from ids where chave = 'sequencia'), 'w-1')),
  'confirmed +5511987654321', 'confirming a WhatsApp step fixes the principal phone (a step without `destino` means 1)');
select is((select destination from public.confirm_whatsapp_step((select valor::uuid from ids where chave = 'sequencia'), 'w-2')),
  '+5511911112222', 'a step with destino 3 fixes the third phone of the full list');
select throws_ok(
  $$select * from public.confirm_whatsapp_step((select valor::uuid from ids where chave = 'sequencia'), 'w-3')$$,
  '22023', 'contact phone at this position is not flagged as whatsapp', 'a phone without the WhatsApp flag is refused');
select throws_ok(
  $$select * from public.confirm_whatsapp_step((select valor::uuid from ids where chave = 'sequencia'), 'w-4')$$,
  '22023', 'contact has no phone destination', 'a Contato without a phone is refused');
select throws_ok(
  $$select * from public.confirm_whatsapp_step((select valor::uuid from ids where chave = 'sequencia'), 'w-5')$$,
  '22023', 'contact phone at this position is not flagged as whatsapp',
  'a principal phone without the WhatsApp flag fails closed');
select throws_ok(
  $$select * from public.confirm_whatsapp_step((select valor::uuid from ids where chave = 'sequencia'), 'w-6')$$,
  '22023', 'invalid destination position in the step', 'a position outside 1 to 3 is refused');
select throws_ok(
  $$select * from public.confirm_whatsapp_step((select valor::uuid from ids where chave = 'sequencia'), 'w-8')$$,
  '22023', 'contact has no active link with this target account', 'a Contato not linked to the target account is refused');
select throws_ok(
  $$select * from public.confirm_whatsapp_step((select valor::uuid from ids where chave = 'sequencia'), 'w-99')$$,
  'P0002', 'step not found in the sequence document', 'an unknown step is refused');
select throws_ok(
  $$select * from public.confirm_whatsapp_step((select valor::uuid from ids where chave = 'sequencia'), 'e-1')$$,
  '0A000', 'only whatsapp steps can be confirmed here', 'an e-mail step is not confirmed by the WhatsApp cycle');
select throws_ok(
  $$select * from public.confirm_sequence_step((select valor::uuid from ids where chave = 'sequencia'), 'w-1')$$,
  '0A000', 'only email steps can be confirmed for now', 'and a WhatsApp step is not confirmed by the e-mail cycle');
select is((select destination from public.confirm_sequence_step((select valor::uuid from ids where chave = 'sequencia'), 'e-1')),
  'maria@empresa-alvo.test', 'the e-mail confirmation still works');

-- Quem não é a titular não confirma: colega, Administradora e outro Workspace.
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select * from public.confirm_whatsapp_step((select valor::uuid from ids where chave = 'sequencia'), 'w-7')$$,
  '42501', 'sequence not found or not owned by active user', 'another participant cannot confirm a WhatsApp step');
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select * from public.confirm_whatsapp_step((select valor::uuid from ids where chave = 'sequencia'), 'w-7')$$,
  '42501', 'sequence not found or not owned by active user', 'nor the Administrator');
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000004', true);
select throws_ok(
  $$select * from public.confirm_whatsapp_step((select valor::uuid from ids where chave = 'sequencia'), 'w-7')$$,
  '42501', 'sequence not found or not owned by active user', 'nor a participant of another Workspace');
select throws_ok(
  $$select * from public.list_sequence_step_sends((select valor::uuid from ids where chave = 'sequencia'))$$,
  '42501', 'sequence not found or not owned by active user', 'nor can that participant list the sends');
reset role;
set local role anon;
select throws_ok(
  $$select * from public.confirm_whatsapp_step('00000000-0000-0000-0000-000000000000', 'w-1')$$,
  '42501', 'permission denied for function confirm_whatsapp_step', 'anon cannot confirm');
reset role;
select is(pg_temp.col('w-1', 'channel') || ' ' || pg_temp.col('w-1', 'mode'), 'whatsapp manual',
  'a stand-alone confirmation is a WhatsApp send that waits for the owner');

-- 4. A liberação: só a Conta de WhatsApp da titular, com o número fixado.
set local role service_role;
select is((select outcome || ' ' || destination || ' ' || unipile_account_id from public.release_whatsapp_step_send(
    pg_temp.envio('w-1'), 'c1000000-0000-0000-0000-000000000001')),
  'released +5511987654321 wa-vera', 'the release goes to the fixed number through the owner''s own WhatsApp account');
select is(pg_temp.col('w-1', 'status') || ' ' || pg_temp.col('w-1', 'attempts') || ' ' || coalesce(pg_temp.col('w-1', 'subject'), '-'),
  'sending 1 -', 'the send is in flight, with no subject on WhatsApp');
select is(pg_temp.col('w-1', 'body'), 'Olá, Maria.', 'the body has the step variables filled in');
select is((select outcome from public.release_whatsapp_step_send(pg_temp.envio('w-1'), 'c1000000-0000-0000-0000-000000000001')),
  'in_flight', 'a send already in flight is not released twice');
select is((select outcome from public.release_whatsapp_step_send(pg_temp.envio('w-2'), 'c1000000-0000-0000-0000-000000000002')),
  'owner_not_responsible', 'another participant cannot release the owner''s send, not even with his own ready account');
select is((select outcome from public.release_sequence_step_send(pg_temp.envio('w-2'), 'c1000000-0000-0000-0000-000000000001')),
  'wrong_channel', 'the e-mail release refuses a WhatsApp send');
select is((select outcome from public.release_whatsapp_step_send(pg_temp.envio('e-1'), 'c1000000-0000-0000-0000-000000000001')),
  'wrong_channel', 'and the WhatsApp release refuses an e-mail send');
select is(pg_temp.col('w-2', 'status') || ' ' || pg_temp.col('w-2', 'attempts'), 'confirmed 0',
  'a refused release leaves the send as it was');
select is(public.record_sequence_step_send_result(pg_temp.envio('w-1'), 'sent', null, null, null, null, 'chat-w1'),
  'sent', 'a 2xx without a message id is recorded as accepted');
select is(coalesce(pg_temp.col('w-1', 'provider_message_id'), '-') || ' ' || pg_temp.col('w-1', 'provider_chat_id'), '- chat-w1',
  'the message id stays empty and the chat id is kept');
select is((select count(*)::int from public.account_interactions
    where contact_id = (select valor::uuid from ids where chave = 'maria') and kind = 'mensagem-enviada' and source = 'sequencia'),
  1, 'an accepted WhatsApp send is the shared Interaction mensagem-enviada');
select is((select count(*)::int from public.account_interactions where kind = 'email-enviado'), 0,
  'and it is not recorded as an e-mail');

-- Antispam: logo depois de um envio, a mesma Conta não envia outro.
select is((select outcome from public.release_whatsapp_step_send(pg_temp.envio('w-2'), 'c1000000-0000-0000-0000-000000000001')),
  'sender_spacing', 'the same WhatsApp account does not send twice within the minimum spacing');
select is(pg_temp.col('w-2', 'status') || ' ' || pg_temp.col('w-2', 'attempts'), 'confirmed 0',
  'the step just waits: nothing changed');
select pg_temp.passa_o_tempo();
select is((select outcome || ' ' || coalesce(provider_chat_id, '-') from public.release_whatsapp_step_send(
    pg_temp.envio('w-2'), 'c1000000-0000-0000-0000-000000000001')),
  'released -', 'after the spacing the step is released; another number of the same Contato starts a new chat');
select is(public.record_sequence_step_send_result(pg_temp.envio('w-2'), 'sent', null, 'wamsg-2', null, null, 'chat-w2'),
  'sent', 'accepted, now with a message id');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000001', true);
select is((select destination from public.confirm_whatsapp_step((select valor::uuid from ids where chave = 'sequencia'), 'w-7')),
  '+5511987654321', 'a later step to the same number is confirmed');
reset role;
set local role service_role;
select pg_temp.passa_o_tempo();
select is((select outcome || ' ' || provider_chat_id from public.release_whatsapp_step_send(
    pg_temp.envio('w-7'), 'c1000000-0000-0000-0000-000000000001')),
  'released chat-w1', 'the same Contato, account and number reuse the chat the first send recorded');
select is(public.record_sequence_step_send_result(pg_temp.envio('w-7'), 'sent', null, null, null, null, null), 'sent',
  'sent inside the existing chat (no new chat id needed)');
reset role;

-- O "Re:" de um passo de E-mail nunca continua uma conversa de WhatsApp, mesmo com message_id gravado.
set local role service_role;
select is(public.record_sequence_step_send_result(pg_temp.envio('w-7'), 'sent', null, 'wamsg-7', null, null, null), 'sent',
  'a repeated result keeps the send as it is');
select is((select outcome || ' ' || coalesce(reply_to_message_id, '-') from public.release_sequence_step_send(
    pg_temp.envio('e-1'), 'c1000000-0000-0000-0000-000000000001')),
  'released -', 'an e-mail "Re:" step ignores the message ids of WhatsApp sends');
select is(public.record_sequence_step_send_result(pg_temp.envio('e-1'), 'sent', 'email-1', '<e1@x>', null), 'sent',
  'the e-mail send is accepted');
select is((select count(*)::int from public.account_interactions where kind = 'email-enviado'), 1,
  'and the e-mail keeps its own Interaction kind');
reset role;

-- 5. Os bloqueios da liberação: Conta, Contato, número e Sequência.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000001', true);
select lives_ok($$select * from public.confirm_whatsapp_step((select valor::uuid from ids where chave = 'sequencia'), 'w-9')$$,
  'w-9 is confirmed');
select lives_ok($$select * from public.confirm_whatsapp_step((select valor::uuid from ids where chave = 'sequencia'), 'w-10')$$,
  'w-10 is confirmed on the third phone');
select lives_ok($$select * from public.confirm_whatsapp_step((select valor::uuid from ids where chave = 'sequencia'), 'w-11')$$,
  'w-11 is confirmed on the principal phone');
select lives_ok($$select * from public.confirm_whatsapp_step((select valor::uuid from ids where chave = 'sequencia'), 'w-12')$$,
  'w-12 is confirmed for Lia');
reset role;

-- A Conta de WhatsApp da titular cai: a de Caio, pronta, nunca a substitui.
update private.sender_accounts set status = 'syncing', reconciliation_required = true where unipile_account_id = 'wa-vera';
set local role service_role;
select pg_temp.passa_o_tempo();
select is((select outcome from public.release_whatsapp_step_send(pg_temp.envio('w-9'), 'c1000000-0000-0000-0000-000000000001')),
  'sender_not_ready', 'without her own ready WhatsApp account nothing goes out, even with a colleague''s account ready');
reset role;
update private.sender_accounts set status = 'ready', reconciliation_required = false where unipile_account_id = 'wa-vera';

-- O número fixado deixou de ser telefone do Contato: espera a reconfirmação (ADR-0014).
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000003', true);
select lives_ok($$select * from public.set_contact_channels((select valor::uuid from ids where chave = 'maria'), null,
  '[{"value": "+5511987654321"}, {"value": "+551133334444", "kind": "fixo", "whatsapp": false}]')$$,
  'the Administrator removes the third phone of Maria');
reset role;
set local role service_role;
select is((select outcome from public.release_whatsapp_step_send(pg_temp.envio('w-10'), 'c1000000-0000-0000-0000-000000000001')),
  'destination_changed', 'a fixed number the Contato no longer has blocks the send');
select is(pg_temp.col('w-10', 'status') || ' ' || pg_temp.col('w-10', 'last_error') || ' ' || pg_temp.col('w-10', 'destination'),
  'awaiting_reconfirmation destination_changed +5511911112222', 'the step waits for the owner and keeps the old number on record');
reset role;

-- O principal perde a marca de WhatsApp: o passo fixado nele não sai (nem para outro número).
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000003', true);
select lives_ok($$select * from public.set_contact_channels((select valor::uuid from ids where chave = 'maria'), null,
  '[{"value": "+5511987654321", "whatsapp": false}, {"value": "+551133334444", "kind": "fixo", "whatsapp": false}]')$$,
  'the Administrator turns the WhatsApp flag off on Maria''s principal phone');
reset role;
set local role service_role;
select is((select outcome from public.release_whatsapp_step_send(pg_temp.envio('w-11'), 'c1000000-0000-0000-0000-000000000001')),
  'destination_no_whatsapp', 'a principal phone that lost its WhatsApp flag fails closed');
select is(pg_temp.col('w-11', 'status') || ' ' || pg_temp.col('w-11', 'last_error'),
  'awaiting_reconfirmation destination_no_whatsapp', 'and the step waits for the owner');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select * from public.confirm_whatsapp_step((select valor::uuid from ids where chave = 'sequencia'), 'w-11')$$,
  '22023', 'contact phone at this position is not flagged as whatsapp', 'reconfirming on the unflagged phone is refused');
reset role;

-- O Vínculo com a Conta-alvo terminou.
update public.contact_account_links set ended_at = now()
  where contact_id = (select valor::uuid from ids where chave = 'lia') and ended_at is null;
set local role service_role;
select is((select outcome from public.release_whatsapp_step_send(pg_temp.envio('w-12'), 'c1000000-0000-0000-0000-000000000001')),
  'contact_unlinked', 'a Contato that left the target account gets nothing');
select is(pg_temp.col('w-12', 'status'), 'awaiting_reconfirmation', 'and the step waits for the owner');
reset role;

-- A Sequência pausada não envia.
update public.sequences set status = 'pausada' where id = (select valor::uuid from ids where chave = 'sequencia');
set local role service_role;
select is((select outcome from public.release_whatsapp_step_send(pg_temp.envio('w-9'), 'c1000000-0000-0000-0000-000000000001')),
  'sequence_not_active', 'a paused Sequência sends nothing');
reset role;
update public.sequences set status = 'ativa' where id = (select valor::uuid from ids where chave = 'sequencia');

-- Ninguém sem Participação ativa envia.
update public.workspace_memberships set active = false
  where user_id = 'c1000000-0000-0000-0000-000000000001' and workspace_id = 'c2000000-0000-0000-0000-000000000001';
set local role service_role;
select is((select outcome from public.release_whatsapp_step_send(pg_temp.envio('w-9'), 'c1000000-0000-0000-0000-000000000001')),
  'owner_not_responsible', 'the owner without an active Participation cannot send');
reset role;
update public.workspace_memberships set active = true
  where user_id = 'c1000000-0000-0000-0000-000000000001' and workspace_id = 'c2000000-0000-0000-0000-000000000001';

-- 6. A conferência do número na Unipile (404) e o resultado incerto.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000001', true);
select lives_ok($$select * from public.set_contact_channels((select valor::uuid from ids where chave = 'maria'), null,
  '[{"value": "+5511987654321"}, {"value": "+551133334444", "kind": "fixo", "whatsapp": false}]')$$,
  'Vera restores the WhatsApp flag on the principal phone');
reset role;
set local role service_role;
select pg_temp.passa_o_tempo();
select is((select outcome from public.release_whatsapp_step_send(pg_temp.envio('w-9'), 'c1000000-0000-0000-0000-000000000001')),
  'released', 'w-9 goes to the check of the number');
select is(public.block_whatsapp_step_send(pg_temp.envio('w-9'), 'destination_no_whatsapp'), 'awaiting_reconfirmation',
  'the provider says the number has no WhatsApp: the step waits for the owner');
select is(pg_temp.col('w-9', 'status') || ' ' || pg_temp.col('w-9', 'last_error') || ' ' || pg_temp.col('w-9', 'attempts')
    || ' ' || coalesce(pg_temp.col('w-9', 'sending_at'), '-'),
  'awaiting_reconfirmation destination_no_whatsapp 0 -', 'it was not an attempt and it does not use the spacing');
select throws_ok($$select public.block_whatsapp_step_send(pg_temp.envio('w-9'), 'destination_no_whatsapp')$$,
  '55000', 'send is not a whatsapp send in flight', 'only a send in flight can be blocked');
select throws_ok($$select public.block_whatsapp_step_send(pg_temp.envio('w-9'), 'outro_motivo')$$,
  '22023', 'unknown block reason', 'the block reason is a closed list');
select throws_ok($$select * from public.release_whatsapp_step_send(pg_temp.envio('w-13'), 'c1000000-0000-0000-0000-000000000001')$$,
  'P0002', 'send not found', 'a step that was never confirmed has nothing to release');
reset role;

-- Incerto: nunca reenvia sozinho; o titular resolve.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000001', true);
select lives_ok($$select * from public.confirm_whatsapp_step((select valor::uuid from ids where chave = 'sequencia'), 'w-14')$$,
  'w-14 is confirmed');
reset role;
set local role service_role;
select is((select outcome from public.release_whatsapp_step_send(pg_temp.envio('w-14'), 'c1000000-0000-0000-0000-000000000001')),
  'released', 'w-14 is released');
select is(public.record_sequence_step_send_result(pg_temp.envio('w-14'), 'uncertain', null, null, 'timeout'), 'uncertain',
  'a timeout leaves the send uncertain');
select pg_temp.passa_o_tempo();
select is((select outcome from public.release_whatsapp_step_send(pg_temp.envio('w-14'), 'c1000000-0000-0000-0000-000000000001')),
  'reconcile_required', 'an uncertain send is never sent again by itself');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000001', true);
select is(public.resolve_uncertain_step((select valor::uuid from ids where chave = 'sequencia'), 'w-14', false), 'confirmed',
  'the owner says it did not go out: the WhatsApp step is confirmed again');
reset role;
set local role service_role;
select pg_temp.passa_o_tempo();
select is((select outcome from public.release_whatsapp_step_send(pg_temp.envio('w-14'), 'c1000000-0000-0000-0000-000000000001')),
  'released', 'and can be released again');
select is(public.record_sequence_step_send_result(pg_temp.envio('w-14'), 'uncertain', null, null, 'timeout'), 'uncertain',
  'uncertain again');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000001', true);
select is(public.resolve_uncertain_step((select valor::uuid from ids where chave = 'sequencia'), 'w-14', true), 'sent',
  'the owner says it went out: the send is sent');
reset role;
select is((select count(*)::int from public.account_interactions
    where contact_id = (select valor::uuid from ids where chave = 'maria') and kind = 'mensagem-enviada'), 4,
  'and it is the shared Interaction mensagem-enviada');

-- 7. Ativar e executar (Executor): a Sequência de Pedro e a de Rui, da mesma titular.
select pg_temp.relogio('2026-09-30 10:00-03');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000001', true);
insert into ids select 'sequencia-2', id::text from public.create_sequence(
  'c2000000-0000-0000-0000-000000000001', (select valor from ids where chave = 'conta-2'),
  pg_temp.documento(
    pg_temp.passo('wa-a', 'whatsapp', 'pedro'),
    pg_temp.passo('wa-b', 'whatsapp', 'pedro', null, 'Seguindo, {{contato.primeiro_nome}}.'),
    pg_temp.passo('li-c', 'linkedin', 'pedro'),
    pg_temp.passo('wa-d', 'whatsapp', 'pedro')));
insert into ids select 'sequencia-3', id::text from public.create_sequence(
  'c2000000-0000-0000-0000-000000000001', (select valor from ids where chave = 'conta-3'),
  pg_temp.documento(
    pg_temp.passo('rz-a', 'whatsapp', 'rui'),
    pg_temp.passo('rz-b', 'whatsapp', 'rui')));
reset role;

update private.sender_accounts set status = 'syncing', reconciliation_required = true where unipile_account_id = 'wa-vera';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000001', true);
select is((select outcome || ' ' || step_id from public.activate_sequence((select valor::uuid from ids where chave = 'sequencia-2'))),
  'whatsapp_sender_not_ready wa-a', 'activating needs the owner''s own ready WhatsApp account');
reset role;
update private.sender_accounts set status = 'ready', reconciliation_required = false where unipile_account_id = 'wa-vera';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000002', true);
select throws_ok($$select * from public.activate_sequence((select valor::uuid from ids where chave = 'sequencia-2'))$$,
  '42501', 'sequence not found or not owned by active user', 'a colleague with a ready WhatsApp account cannot activate it');
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000004', true);
select throws_ok($$select * from public.activate_sequence((select valor::uuid from ids where chave = 'sequencia-2'))$$,
  '42501', 'sequence not found or not owned by active user', 'nor a participant of another Workspace');
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000001', true);
select is((select outcome from public.activate_sequence((select valor::uuid from ids where chave = 'sequencia-2'))),
  'activated', 'with her account ready the owner activates the Sequência of WhatsApp steps');
select is((select outcome from public.activate_sequence((select valor::uuid from ids where chave = 'sequencia-3'))),
  'activated', 'and the other one');
reset role;
select is(pg_temp.col('wa-a', 'status') || ' ' || pg_temp.col('wa-a', 'mode') || ' ' || pg_temp.col('wa-a', 'channel') || ' '
    || pg_temp.col('wa-a', 'destination'),
  'scheduled auto whatsapp +5511955550001', 'activation fixes the number and schedules the first WhatsApp step');
select is(pg_temp.col('wa-b', 'status') || ' ' || pg_temp.col('wa-d', 'status'), 'waiting waiting',
  'the others wait their turn');
select is((select count(*)::int from private.sequence_step_sends where step_id = 'li-c'), 0, 'the LinkedIn step has no send yet');

-- O envio automático de WhatsApp nasce DESLIGADO: a parte 2 ainda não pausa a Sequência quando o Contato responde.
-- (O "Confirmar e enviar" manual da seção 4 já passou com ele desligado.)
select is((select whatsapp_auto_send from private.sequence_runner_settings), false,
  'automatic WhatsApp sending starts off');
select is(private.whatsapp_auto_send_enabled(), false, 'and the helper says so');
select is((select column_default from information_schema.columns where table_schema = 'private'
    and table_name = 'sequence_runner_settings' and column_name = 'whatsapp_auto_send'), 'false',
  'the column defaults to false, so a new row cannot start on');

create temporary table chamadas (url text, token text);
create or replace function private.post_to_sequence_runner(p_url text, p_token text) returns void
language sql security definer set search_path = '' as $f$
  insert into pg_temp.chamadas values (p_url, p_token);
$f$;
select private.configure_sequence_runner('https://abc.supabase.co');
select pg_temp.passa_o_tempo();
select is(private.kick_sequence_runner(), false,
  'with it off, due WhatsApp steps do not make the database call the Executor');
select is((select count(*)::int from chamadas), 0, 'and no call was made');
set local role service_role;
select is((select count(*)::int from public.claim_due_step_sends(10)), 0, 'the Executor reserves no WhatsApp step');
select is((select outcome from public.release_due_whatsapp_step_send(pg_temp.envio('wa-a'))), 'automatic_disabled',
  'even asked to release one, the due release refuses (defense in depth)');
reset role;
select is(pg_temp.col('wa-a', 'status') || ' ' || pg_temp.col('wa-a', 'attempts') || ' ' || coalesce(pg_temp.col('wa-a', 'claimed_until'), '-')
    || ' ' || coalesce(pg_temp.col('wa-a', 'sending_at'), '-'),
  'scheduled 0 - -', 'and the step is untouched: not reserved, not attempted, not sending');

update private.sequence_runner_settings set whatsapp_auto_send = true, updated_at = now();
select is(private.whatsapp_auto_send_enabled(), true, 'the owner of the database turns it on with one update');
select is(private.kick_sequence_runner(), true, 'now the same due steps make the database call the Executor');
select is((select count(*)::int from chamadas), 1, 'exactly one call was made');

-- O Executor reserva no máximo um passo por Conta remetente, e nenhum dentro do espaçamento.
select pg_temp.passa_o_tempo();
set local role service_role;
select is((select count(*)::int from public.claim_due_step_sends(10) where channel = 'whatsapp'), 1,
  'two due steps of the same WhatsApp account: only one is handed out');
select is((select count(*)::int from public.claim_due_step_sends(10)), 0,
  'the next round hands out nothing while the reservation is within the spacing');
select pg_temp.passa_o_tempo();
select is((select count(*)::int from public.claim_due_step_sends(10)), 1, 'after the spacing the other one is handed out');
reset role;
select is((select count(distinct step_id)::int from private.sequence_step_sends where claimed_at is not null and step_id in ('wa-a', 'rz-a')),
  2, 'and it is a different step');

-- wa-a sai. rz-a, da mesma Conta, espera: continua vencido.
set local role service_role;
select is((select outcome || ' ' || destination || ' ' || unipile_account_id from public.release_due_whatsapp_step_send(pg_temp.envio('wa-a'))),
  'released +5511955550001 wa-vera', 'the Executor releases the first step through the owner''s account');
select is(public.record_sequence_step_send_result(pg_temp.envio('wa-a'), 'sent', null, null, null, null, '5511955550001@s.whatsapp.net'),
  'sent', 'accepted');
select is((select outcome from public.release_due_whatsapp_step_send(pg_temp.envio('rz-a'))), 'sender_spacing',
  'the other step of the same account is held by the spacing at the release too');
select is(pg_temp.col('rz-a', 'status') || ' ' || pg_temp.col('rz-a', 'attempts') || ' ' || coalesce(pg_temp.col('rz-a', 'claimed_until'), '-'),
  'scheduled 0 -', 'and it stays due for the next round');
reset role;
select is(pg_temp.col('wa-b', 'status') || ' ' || pg_temp.col('wa-b', 'scheduled_for'), 'scheduled 2026-09-30T13:00:00+00:00',
  'the next WhatsApp step of the Sequência is scheduled after the sent one');
select is(pg_temp.col('li-c', 'status'), null, 'the Sequência stops at the LinkedIn step: it has no send');

set local role service_role;
select pg_temp.passa_o_tempo();
select is((select outcome || ' ' || destination from public.release_due_whatsapp_step_send(pg_temp.envio('rz-a'))),
  'released +5511955550003', 'after the spacing the other step is released');
select is(public.record_sequence_step_send_result(pg_temp.envio('rz-a'), 'sent', null, null, null, null, null), 'sent',
  'accepted, with no chat id in the answer');
select is((select count(*)::int from public.claim_due_step_sends(10)), 0,
  'a step of the same account is not handed out right after a send');
reset role;

-- Trocar o número de um passo pendente revoga a versão autorizada.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000001', true);
select lives_ok($$select public.update_owned_sequence((select valor::uuid from ids where chave = 'sequencia-3'),
  pg_temp.documento(pg_temp.passo('rz-a', 'whatsapp', 'rui'), pg_temp.passo('rz-b', 'whatsapp', 'rui', '2')), null, null)$$,
  'Vera changes the phone position of a pending step');
select is((select active::text || ' ' || revoked_reason from public.get_sequence_authorization((select valor::uuid from ids where chave = 'sequencia-3'))),
  'false edited', 'that is an edit: the authorized version is revoked');
reset role;
select is(pg_temp.col('rz-b', 'status'), 'cancelled', 'and the pending step is cancelled');

-- O passo seguinte da Sequência de Pedro: a conferência do número falha, tenta de novo depois, sai na janela.
set local role service_role;
select pg_temp.passa_o_tempo();
select is((select count(*)::int from public.claim_due_step_sends(10)), 1, 'the pending step is handed out after the spacing');
select is((select outcome || ' ' || provider_chat_id from public.release_due_whatsapp_step_send(pg_temp.envio('wa-b'))),
  'released 5511955550001@s.whatsapp.net', 'it reuses the chat of the first send to the same number');
select is(pg_temp.col('wa-b', 'body'), 'Seguindo, Pedro.', 'the text has the variables filled in');
select is(public.record_sequence_step_send_result(pg_temp.envio('wa-b'), 'failed', null, null, 'destination_check_failed', 90),
  'scheduled', 'a failed check of the number is retried later, never sent');
select is(pg_temp.col('wa-b', 'attempts') || ' ' || pg_temp.col('wa-b', 'last_error') || ' ' || pg_temp.col('wa-b', 'scheduled_for'),
  '1 destination_check_failed 2026-09-30T13:05:00+00:00', 'five minutes later, and the reason stays on record');
reset role;

select pg_temp.relogio('2026-09-30 07:00-03');
set local role service_role;
select is((select outcome from public.release_due_whatsapp_step_send(pg_temp.envio('wa-b'))), 'not_due',
  'before its time the step is not released');
reset role;
select pg_temp.relogio('2026-09-30 19:00-03');
set local role service_role;
select is((select outcome from public.release_due_whatsapp_step_send(pg_temp.envio('wa-b'))), 'outside_window',
  'outside the window it is not released');
reset role;
select is(pg_temp.col('wa-b', 'scheduled_for'), '2026-10-01T12:00:00+00:00', 'and it moves to the start of the next window');

select pg_temp.relogio('2026-10-01 09:30-03');
set local role service_role;
select pg_temp.passa_o_tempo();
select is((select count(*)::int from public.claim_due_step_sends(10)), 1, 'inside the window it is handed out again');
select is((select outcome from public.release_due_whatsapp_step_send(pg_temp.envio('wa-b'))), 'released', 'released');
select is(public.record_sequence_step_send_result(pg_temp.envio('wa-b'), 'sent', null, 'wamsg-b', null, null, null), 'sent',
  'accepted this time');
reset role;
select is(pg_temp.col('wa-d', 'status'), 'waiting', 'the Sequência stops at the LinkedIn step: the step after it keeps waiting');
select is(pg_temp.col('li-c', 'status'), null, 'and the LinkedIn step still has no send');
set local role service_role;
select pg_temp.passa_o_tempo();
select is((select count(*)::int from public.claim_due_step_sends(10)), 0, 'nothing else is due');
reset role;

-- Falha de WhatsApp: só o 429 e a conferência do número são reagendados; um 4xx (ou qualquer outro código) é definitivo.
update private.sequence_step_sends set status = 'sending', attempts = 1, sending_at = now(), claimed_until = null
  where step_id = 'wa-d';
set local role service_role;
select is(public.record_sequence_step_send_result(pg_temp.envio('wa-d'), 'failed', null, null, 'http_400', 300), 'failed',
  'a 4xx of WhatsApp is a definitive failure: the step is not rescheduled, whatever Retry-After came');
reset role;
select is(pg_temp.col('wa-d', 'status') || ' ' || pg_temp.col('wa-d', 'last_error'), 'failed http_400',
  'and the reason stays on record');
update private.sequence_step_sends set status = 'sending', attempts = 1, sending_at = now() where step_id = 'wa-d';
set local role service_role;
select is(public.record_sequence_step_send_result(pg_temp.envio('wa-d'), 'failed', null, null, 'invalid_destination'), 'failed',
  'a number outside the format is definitive too');
reset role;
update private.sequence_step_sends set status = 'sending', attempts = 1, sending_at = now() where step_id = 'wa-d';
set local role service_role;
select is(public.record_sequence_step_send_result(pg_temp.envio('wa-d'), 'failed', null, null, 'rate_limited', 1200), 'scheduled',
  'a 429 is rescheduled');
reset role;
select is((select scheduled_for >= private.clock_now() + interval '1200 seconds' from private.sequence_step_sends where step_id = 'wa-d'),
  true, 'no sooner than the Retry-After the provider asked');
update private.sequence_step_sends set status = 'sending', attempts = 1, sending_at = now() where step_id = 'wa-d';
set local role service_role;
select is(public.record_sequence_step_send_result(pg_temp.envio('wa-d'), 'failed', null, null, 'destination_check_failed'), 'scheduled',
  'and so is a failed check of the number');
reset role;

-- 8. Quem pode chamar o quê.
set local role anon;
select throws_ok($$select * from public.release_whatsapp_step_send('00000000-0000-0000-0000-000000000000', null)$$,
  '42501', 'permission denied for function release_whatsapp_step_send', 'anon cannot release');
select throws_ok($$select * from public.release_due_whatsapp_step_send('00000000-0000-0000-0000-000000000000')$$,
  '42501', 'permission denied for function release_due_whatsapp_step_send', 'nor the due release');
select throws_ok($$select public.block_whatsapp_step_send('00000000-0000-0000-0000-000000000000', 'destination_no_whatsapp')$$,
  '42501', 'permission denied for function block_whatsapp_step_send', 'nor block a send');
select throws_ok($$select public.step_send_channel('00000000-0000-0000-0000-000000000000', null)$$,
  '42501', 'permission denied for function step_send_channel', 'nor read the channel of a send');
select throws_ok($$select * from public.claim_due_step_sends(1)$$,
  '42501', 'permission denied for function claim_due_step_sends', 'nor claim due steps');
select throws_ok($$select public.capture_webhook_shape('message.new', '{}')$$,
  '42501', 'permission denied for function capture_webhook_shape', 'nor capture a webhook shape');
select throws_ok($$select private.whatsapp_auto_send_enabled()$$,
  '42501', 'permission denied for schema private', 'nor read the automatic sending switch');
select throws_ok($$update private.sequence_runner_settings set whatsapp_auto_send = true$$,
  '42501', 'permission denied for schema private', 'nor turn automatic WhatsApp sending on');
select throws_ok($$select public.record_sequence_step_send_result('00000000-0000-0000-0000-000000000000', 'sent', null, null, null)$$,
  '42501', 'permission denied for function record_sequence_step_send_result', 'nor record a result');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000001', true);
select throws_ok($$select * from public.release_whatsapp_step_send('00000000-0000-0000-0000-000000000000', 'c1000000-0000-0000-0000-000000000001')$$,
  '42501', 'permission denied for function release_whatsapp_step_send', 'the owner herself cannot call the release directly: it goes through the Edge Function');
select throws_ok($$select public.block_whatsapp_step_send('00000000-0000-0000-0000-000000000000', 'destination_no_whatsapp')$$,
  '42501', 'permission denied for function block_whatsapp_step_send', 'nor block');
select throws_ok($$select public.capture_webhook_shape('message.new', '{}')$$,
  '42501', 'permission denied for function capture_webhook_shape', 'nor capture shapes');
select throws_ok($$select * from private.sequence_step_sends$$, '42501', 'permission denied for schema private',
  'the sends are not readable through the API');
select throws_ok($$update private.sequence_runner_settings set whatsapp_auto_send = true$$,
  '42501', 'permission denied for schema private', 'a signed-in user cannot turn automatic WhatsApp sending on');
reset role;
set local role service_role;
select is((select public.step_send_channel(pg_temp.envio('wa-a'), 'c1000000-0000-0000-0000-000000000001')), 'whatsapp',
  'the channel of the owner''s send');
select is((select public.step_send_channel(pg_temp.envio('e-1'), 'c1000000-0000-0000-0000-000000000001')), 'email',
  'an e-mail send says email');
select is((select public.step_send_channel(pg_temp.envio('wa-a'), 'c1000000-0000-0000-0000-000000000002')) is null, true,
  'another participant gets no channel');
reset role;

-- 9. Privacidade: apagar o Contato apaga o número e a conversa dos envios dele.
select is((select count(*)::int from private.sequence_step_sends s
    where s.contact_id = (select valor::uuid from ids where chave = 'maria') and s.provider_chat_id is not null), 2,
  'before erasing, the sends of Maria hold the chat ids (they carry the phone number)');
select is(private.anonymize_sends('c2000000-0000-0000-0000-000000000001', '{}', (select valor::uuid from ids where chave = 'maria')) > 0, true,
  'the anonymization of the sends of Maria runs');
select is((select count(*)::int from private.sequence_step_sends s where s::text ilike '%5511987654321%' or s::text ilike '%chat-w%'), 0,
  'no send keeps her number or her chat ids');
update private.sequence_step_sends set provider_chat_id = 'chat-de-volta', destination = '+5511987654321' where step_id = 'w-1';
select is(coalesce(pg_temp.col('w-1', 'provider_chat_id'), '-') || ' ' || coalesce(pg_temp.col('w-1', 'destination'), '-'), '- -',
  'an anonymized send stays anonymized whatever is written to it afterwards');

-- 10. A captura de formatos de webhook.
select is((select c.relrowsecurity from pg_class c where c.oid = 'private.webhook_shape_captures'::regclass), true,
  'the capture table has row level security enabled');
set local role anon;
select throws_ok($$select * from private.webhook_shape_captures$$, '42501', 'permission denied for schema private',
  'anon cannot read the captured shapes');
reset role;
set local role authenticated;
select throws_ok($$select * from private.webhook_shape_captures$$, '42501', 'permission denied for schema private',
  'nor a signed-in user');
reset role;
set local role service_role;
select throws_ok($$select * from private.webhook_shape_captures$$, '42501', null,
  'nor the backend role: it writes only through the function');
select is(public.capture_webhook_shape('message.new', '{"type": "message.new", "payload": {"text": "<string:11>", "n": 1}}'), true,
  'a shape of a message event is stored');
select is(public.capture_webhook_shape('email.new', '{"type": "email.new"}'), false, 'only message events are captured');
select is(public.capture_webhook_shape('message.new; drop table x', '{}'), false, 'the event type is a closed format');
select is(public.capture_webhook_shape('message.new', '[1, 2]'), false, 'a shape is an object');
select is(public.capture_webhook_shape(null, '{}'), false, 'and has an event type');
select is((select count(*) filter (where ok)::int from (
    select public.capture_webhook_shape('message.update', jsonb_build_object('n', i)) as ok from generate_series(1, 25) i) t),
  20, 'at most 20 rows per event type');
select is(public.capture_webhook_shape('message.delivery', '{}'), true, 'another event type has its own room');
reset role;
select is((select count(*)::int || ' ' || max((shape ->> 'n')::int) from private.webhook_shape_captures where event_type = 'message.update'),
  '20 20', 'the oldest rows are the ones kept');

select * from finish();
rollback;

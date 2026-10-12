begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(15);

-- Convite do LinkedIn sem nota: a nota é opcional. Um passo de convite com o corpo vazio (ou só espaços) ativa e é
-- liberado com o corpo vazio; em qualquer outro passo e canal, o corpo vazio continua barrando a ativação.

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

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('c5000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'titular@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('c5100000-0000-0000-0000-000000000001', 'empresa', 'Cliente');

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('c5100000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000001', 'member', true);

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

grant execute on function pg_temp.relogio(timestamptz), pg_temp.envio(text), pg_temp.passo(text, text, text, int, text, jsonb),
  pg_temp.documento(jsonb[]) to authenticated, service_role;

-- O titular cadastra a Conta-alvo, a Eva (e-mail, telefone com WhatsApp e perfil do LinkedIn) e a Sequência.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'c5000000-0000-0000-0000-000000000001', true);

insert into ids select 'conta', id::text from public.save_target_account('c5100000-0000-0000-0000-000000000001', 'Empresa Três', 'https://empresa-tres.test');
insert into ids select 'eva', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta'), 'Eva Prado', 'CEO', 'eva@empresa-tres.test', '11 98888-0001',
  'https://www.linkedin.com/in/eva-prado');
insert into ids select 'seq', id::text from public.create_sequence('c5100000-0000-0000-0000-000000000001',
  (select valor from ids where chave = 'conta'),
  pg_temp.documento(pg_temp.passo('l1', 'linkedin', 'eva', 0, 'Oi', '{"subtipoLinkedIn": "convite"}')));

create function pg_temp.ativar(p_seq text) returns text language sql as $f$
  select outcome || ' ' || coalesce(step_id, 'nenhum') from public.activate_sequence((select valor::uuid from ids where chave = p_seq));
$f$;
create function pg_temp.documento_de(p_seq text, variadic p_steps jsonb[]) returns void language sql as $f$
  select 1 from public.update_owned_sequence((select valor::uuid from ids where chave = p_seq), pg_temp.documento(variadic p_steps), null, null);
$f$;
grant execute on function pg_temp.ativar(text), pg_temp.documento_de(text, jsonb[]) to authenticated;

-- A Conta remetente de LinkedIn do titular, pelo mesmo caminho da conexão real, e o canal ligado.
insert into ids select 'tentativa-li', attempt_id::text from public.create_sender_connection_attempt(
  'c5100000-0000-0000-0000-000000000001', 'linkedin', null);
reset role;
set local role service_role;
select is(public.complete_sender_connection_attempt((select valor::uuid from ids where chave = 'tentativa-li'),
  'unipile-li-5', 'LINKEDIN', 'CREATION_SUCCESS'), 'completed', 'the LinkedIn sender account is linked');
select is(public.apply_unipile_sender_status('unipile-li-5', 'SYNC_SUCCESS'), true, 'the LinkedIn sender account is ready');
reset role;
select is(private.set_chat_channel_enabled('linkedin', true), true, 'the database admin switches LinkedIn on');
select is(private.set_chat_channel_enabled('whatsapp', true), true, 'the database admin switches WhatsApp on');
select pg_temp.relogio('2026-10-12 10:00-03');

-- 1. Fora do convite, o corpo vazio continua barrando a ativação, como antes (antes de qualquer envio sair).
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c5000000-0000-0000-0000-000000000001', true);
select pg_temp.documento_de('seq', pg_temp.passo('l1', 'linkedin', 'eva', 0, '', '{"subtipoLinkedIn": "mensagem"}'));
select is(pg_temp.ativar('seq'), 'empty_content l1', 'a LinkedIn message with an empty body is still refused');
select pg_temp.documento_de('seq', pg_temp.passo('l1', 'linkedin', 'eva', 0, '   ', '{"subtipoLinkedIn": "mensagem"}'));
select is(pg_temp.ativar('seq'), 'empty_content l1', 'a LinkedIn message with only spaces is still refused');
select pg_temp.documento_de('seq', pg_temp.passo('l1', 'linkedin', 'eva', 0, '', '{"subtipoLinkedIn": "inmail"}'));
select is(pg_temp.ativar('seq'), 'empty_content l1', 'an InMail with an empty body is still refused');
select pg_temp.documento_de('seq', pg_temp.passo('l1', 'whatsapp', 'eva', 0, ''));
select is(pg_temp.ativar('seq'), 'empty_content l1', 'a WhatsApp step with an empty body is still refused');
select pg_temp.documento_de('seq', pg_temp.passo('l1', 'email', 'eva', 0, ''));
select is(pg_temp.ativar('seq'), 'empty_content l1', 'an e-mail step with an empty body is still refused');

-- 2. Convite sem nota ativa.
select pg_temp.documento_de('seq', pg_temp.passo('l1', 'linkedin', 'eva', 0, '', '{"subtipoLinkedIn": "convite"}'));
select is(pg_temp.ativar('seq'), 'activated l1', 'an invitation with an empty note activates');
select pg_temp.documento_de('seq', pg_temp.passo('l1', 'linkedin', 'eva', 0, '   ', '{"subtipoLinkedIn": "convite"}'));
select is(pg_temp.ativar('seq'), 'activated l1', 'an invitation whose note is only spaces activates too');
select pg_temp.documento_de('seq', pg_temp.passo('l1', 'linkedin', 'eva', 0, '', '{}'));
select is(pg_temp.ativar('seq'), 'activated l1', 'a LinkedIn step without a subtype is an invitation, so its empty note activates');

-- 3. O convite sem nota é liberado com o corpo vazio, ainda como convite de 300 caracteres e sem convite anterior.
reset role;
select is((pg_temp.envio('l1')).status, 'scheduled', 'the invitation without a note is scheduled');
set local role service_role;
create temporary table reserva as select * from public.claim_due_chat_step_sends(10);
create temporary table liberado as select * from public.release_due_chat_step_send((pg_temp.envio('l1')).id);
grant all on reserva, liberado to authenticated, service_role;
select is((select outcome || ' ' || coalesce(linkedin_subtype, '-') || ' ' || invite_note_limit || ' ' || invite_sent from liberado),
  'released convite 300 false', 'the invitation without a note is released as an invitation');
select is((select btrim(body) from liberado), '', 'the released invitation carries an empty body');

select * from finish();
rollback;

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(109);

-- O relógio da agenda fica parado onde o teste quiser, só dentro desta transação.
create function pg_temp.relogio(p_at timestamptz) returns void language plpgsql as $f$
begin
  execute format(
    'create or replace function private.clock_now() returns timestamptz language sql stable set search_path = '''' '
    'as $c$ select %L::timestamptz $c$', p_at);
end
$f$;

create function pg_temp.envio(p_step text) returns private.sequence_step_sends language sql as $f$
  select * from private.sequence_step_sends where step_id = p_step;
$f$;

-- Workspace com o Vendedor responsável (titular) e uma colega Membro.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('70000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'titular@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('70000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'colega@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('71000000-0000-0000-0000-000000000001', 'empresa', 'Cliente');
insert into private.workspace_contracts (workspace_id, tier_id, starts_at) select w.id, 'escala', date_trunc('month', now()) from public.workspaces w where w.id = '71000000-0000-0000-0000-000000000001' on conflict (workspace_id) do nothing; -- contrato de teste (automacao-e-contrato-inativo)

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'member', true),
  ('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', 'member', true);

create temporary table ids (chave text primary key, valor text);
grant all on ids to authenticated, service_role;

-- 1. O relógio: dias úteis de segunda a sexta, no horário de Brasília, dentro da janela.
select is(private.next_send_slot('2026-09-30 10:00-03', 0, '{"de": "09:00", "ate": "18:00"}'),
  '2026-09-30 10:00-03'::timestamptz, 'inside the window on a weekday, the slot is the moment itself');
select is(private.next_send_slot('2026-09-30 07:00-03', 0, '{"de": "09:00", "ate": "18:00"}'),
  '2026-09-30 09:00-03'::timestamptz, 'before the window, the slot is the start of the window');
select is(private.next_send_slot('2026-09-30 19:00-03', 0, '{"de": "09:00", "ate": "18:00"}'),
  '2026-10-01 09:00-03'::timestamptz, 'after the window, the slot is the start of the next business day');
select is(private.next_send_slot('2026-10-02 17:00-03', 1, '{"de": "09:00", "ate": "18:00"}'),
  '2026-10-05 17:00-03'::timestamptz, 'one business day after a Friday is Monday, at the same time');
select is(private.next_send_slot('2026-10-02 19:00-03', 0, '{"de": "09:00", "ate": "18:00"}'),
  '2026-10-05 09:00-03'::timestamptz, 'after the window on a Friday, the slot is Monday morning');
select is(private.next_send_slot('2026-10-03 11:00-03', 0, '{"de": "09:00", "ate": "18:00"}'),
  '2026-10-05 09:00-03'::timestamptz, 'a Saturday moves to Monday at the start of the window');
select is(private.next_send_slot('2026-10-01 10:00-03', 2, '{"de": "09:00", "ate": "18:00"}'),
  '2026-10-05 10:00-03'::timestamptz, 'two business days after a Thursday is Monday');
select is(private.next_send_slot('2026-09-30 13:00-03', 0, '{"de": "08:30", "ate": "12:00"}'),
  '2026-10-01 08:30-03'::timestamptz, 'the step window is respected');
select is(private.next_send_slot('2026-09-30 07:00-03', 0, '{"de": "x", "ate": "25:99"}'),
  '2026-09-30 09:00-03'::timestamptz, 'an invalid window falls back to 09:00-18:00');
select is(private.next_send_slot('2026-09-30 23:30+00', 0, '{"de": "09:00", "ate": "18:00"}'),
  '2026-10-01 09:00-03'::timestamptz, 'the day is counted in America/Sao_Paulo, not in UTC');

-- O titular cadastra duas Contas-alvo, os Contatos e as Sequências.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000001', true);

insert into ids select 'conta', id::text from public.save_target_account(
  '71000000-0000-0000-0000-000000000001', 'Empresa Alvo', 'https://empresa-alvo.test');
insert into ids select 'conta-2', id::text from public.save_target_account(
  '71000000-0000-0000-0000-000000000001', 'Outra Empresa', 'https://outra.test');
insert into ids select 'maria', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta'), 'Maria Souza', 'Diretora', 'maria@empresa-alvo.test');
insert into ids select 'joao', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta'), 'João Lima', 'Gerente', 'joao@empresa-alvo.test');
insert into ids select 'ana', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta-2'), 'Ana Reis', 'Sócia', 'ana@outra.test');
insert into ids select 'bia', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta-2'), 'Bia Rocha', 'Analista');

create function pg_temp.passo(p_id text, p_canal text, p_contato text, p_delay int, p_assunto text, p_corpo text,
  p_modo text default null) returns jsonb language sql as $f$
  select jsonb_strip_nulls(jsonb_build_object('id', p_id, 'canal', p_canal,
    'contatoId', (select valor from ids where chave = p_contato), 'delayDiasUteis', p_delay, 'titulo', p_id,
    'assunto', p_assunto, 'corpo', p_corpo, 'modoEmail', p_modo));
$f$;

create function pg_temp.documento(variadic p_steps jsonb[]) returns jsonb language sql as $f$
  select jsonb_build_object('participantesIds', '[]'::jsonb, 'janelaPadrao', '{"de": "09:00", "ate": "18:00"}'::jsonb,
    'steps', to_jsonb(p_steps));
$f$;

insert into ids select 'sequencia', id::text from public.create_sequence(
  '71000000-0000-0000-0000-000000000001', (select valor from ids where chave = 'conta'),
  pg_temp.documento(
    pg_temp.passo('passo-1', 'email', 'maria', 0, 'Apresentação', 'Olá, {{contato.primeiro_nome}}.'),
    pg_temp.passo('passo-2', 'email', 'maria', 2, 'Re: Apresentação', 'Seguindo.'),
    pg_temp.passo('passo-3', 'email', 'maria', 1, 'Proposta', 'Segue a proposta.', 'manual'),
    pg_temp.passo('passo-4', 'linkedin', 'maria', 1, null, 'Oi'),
    pg_temp.passo('passo-5', 'email', 'maria', 0, 'Depois do LinkedIn', 'Oi de novo.')));
insert into ids select 'sequencia-2', id::text from public.create_sequence(
  '71000000-0000-0000-0000-000000000001', (select valor from ids where chave = 'conta-2'),
  pg_temp.documento(pg_temp.passo('q-1', 'email', 'joao', 0, 'Oi', 'Olá.')));

-- A Conta remetente de E-mail do titular fica pronta pelo mesmo caminho da conexão real.
insert into ids select 'tentativa', attempt_id::text from public.create_sender_connection_attempt(
  '71000000-0000-0000-0000-000000000001', 'email', null);
reset role;
set local role service_role;
select is(public.complete_sender_connection_attempt(
  (select valor::uuid from ids where chave = 'tentativa'), 'unipile-google-7', 'GOOGLE', 'CREATION_SUCCESS'
), 'completed', 'the owner email sender account is linked');
select is(public.apply_unipile_sender_status('unipile-google-7', 'SYNC_SUCCESS'), true,
  'the owner email sender account is ready');

-- 2. Ativar: sem autorização, o status visual "Ativa" não faz nada sair.
reset role;
select pg_temp.relogio('2026-09-30 10:00-03');
select is((select count(*)::int from public.claim_due_step_sends(10)), 0,
  'a sequence shown as active but never activated has nothing to send');

set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select * from public.activate_sequence((select valor::uuid from ids where chave = 'sequencia'))$$,
  '42501', 'sequence not found or not owned by active user',
  'another member cannot activate the owner sequence');

select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000001', true);
select is((select outcome || ' ' || step_id from public.activate_sequence((select valor::uuid from ids where chave = 'sequencia-2'))),
  'contact_unlinked q-1', 'a step whose contact is not linked to the target account blocks the activation');
select public.update_owned_sequence((select valor::uuid from ids where chave = 'sequencia-2'),
  pg_temp.documento(pg_temp.passo('q-1', 'email', 'bia', 0, 'Oi', 'Olá.')), null, null);
select is((select outcome || ' ' || step_id from public.activate_sequence((select valor::uuid from ids where chave = 'sequencia-2'))),
  'contact_without_email q-1', 'a step whose contact has no e-mail blocks the activation');
select public.update_owned_sequence((select valor::uuid from ids where chave = 'sequencia-2'),
  pg_temp.documento(pg_temp.passo('q-1', 'email', 'ana', 0, 'Oi', '  ')), null, null);
select is((select outcome || ' ' || step_id from public.activate_sequence((select valor::uuid from ids where chave = 'sequencia-2'))),
  'empty_content q-1', 'a step without a body blocks the activation');

reset role;
update private.sender_accounts set status = 'syncing' where unipile_account_id = 'unipile-google-7';
set local role authenticated;
select is((select outcome from public.activate_sequence((select valor::uuid from ids where chave = 'sequencia'))),
  'sender_not_ready', 'the activation needs the owner email sender account ready');
reset role;
update private.sender_accounts set status = 'ready' where unipile_account_id = 'unipile-google-7';
set local role authenticated;

select is(
  (select outcome || ' ' || step_id || ' v' || version || ' ' || (scheduled_for = '2026-09-30 10:00-03')
    from public.activate_sequence((select valor::uuid from ids where chave = 'sequencia'))),
  'activated passo-1 v1 true', 'activating authorizes the document and schedules the first step now');
select is(
  (select string_agg(step_id || ':' || status || ':' || mode || ':' || destination, ' ' order by step_id)
    from public.list_sequence_step_sends((select valor::uuid from ids where chave = 'sequencia'))),
  'passo-1:scheduled:auto:maria@empresa-alvo.test passo-2:waiting:auto:maria@empresa-alvo.test '
    || 'passo-3:waiting:manual:maria@empresa-alvo.test passo-5:waiting:auto:maria@empresa-alvo.test',
  'every pending email step fixes its destination and waits its turn; only the first is scheduled');
select is(
  (select version || ' ' || active from public.get_sequence_authorization((select valor::uuid from ids where chave = 'sequencia'))),
  '1 true', 'the owner reads the authorized version');
select throws_ok(
  $$select * from public.claim_due_step_sends(10)$$,
  '42501', 'permission denied for function claim_due_step_sends',
  'signed-in users cannot claim steps for the executor');
select throws_ok(
  $$select * from public.release_due_step_send((select id from public.list_sequence_step_sends((select valor::uuid from ids where chave = 'sequencia')) where step_id = 'passo-1'))$$,
  '42501', 'permission denied for function release_due_step_send',
  'signed-in users cannot release a scheduled step themselves');
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select * from public.get_sequence_authorization((select valor::uuid from ids where chave = 'sequencia'))$$,
  '42501', 'sequence not found or not owned by active user',
  'another member cannot read the authorization');

-- 3. O executor, com o navegador fechado: reserva o passo vencido, libera, envia e o próximo é programado.
reset role;
select is((select string_agg(send_id::text, ',') from public.claim_due_step_sends(10)),
  (pg_temp.envio('passo-1')).id::text, 'the executor claims the due step');
select is((select count(*)::int from public.claim_due_step_sends(10)), 0,
  'a claimed step is not claimed twice');
select is(
  (select outcome || ' | ' || subject || ' | ' || body || ' | ' || unipile_account_id
    from public.release_due_step_send((pg_temp.envio('passo-1')).id)),
  'released | Apresentação | Olá, Maria. | unipile-google-7',
  'the due step is released with the authorized content, filled in');
select is((pg_temp.envio('passo-1')).subject || ' | ' || (pg_temp.envio('passo-1')).body, 'Apresentação | Olá, Maria.',
  'the content that went out is kept in the send');
select is((select outcome from public.release_due_step_send((pg_temp.envio('passo-1')).id)), 'in_flight',
  'a step in flight is not released twice');
select is(public.record_sequence_step_send_result((pg_temp.envio('passo-1')).id, 'sent', 'e-1', '<m1@x>', null),
  'sent', 'the provider accepted the first step');
select is((pg_temp.envio('passo-2')).status || ' ' || ((pg_temp.envio('passo-2')).scheduled_for = '2026-10-02 10:00-03'),
  'scheduled true', 'the next step is scheduled two business days after the previous send');
select is((select count(*)::int from public.account_interactions
    where target_account_id = (select valor::uuid from ids where chave = 'conta') and kind = 'email-enviado'),
  1, 'the send became an interaction of the target account');

-- 4. Uma pausa persistida bloqueia os envios seguintes; retomar programa um passo, sem rajada de atrasados.
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.update_owned_sequence((select valor::uuid from ids where chave = 'sequencia'), null, null, 'pausada')$$,
  'the owner pauses the sequence');
reset role;
select pg_temp.relogio('2026-10-02 11:00-03');
select is((select count(*)::int from public.claim_due_step_sends(10)), 0,
  'a paused sequence has nothing to send, even with the step past its time');
select is((select outcome from public.release_due_step_send((pg_temp.envio('passo-2')).id)), 'sequence_not_active',
  'a paused sequence is not released');
select pg_temp.relogio('2026-10-06 07:30-03');
set local role authenticated;
select lives_ok(
  $$select public.update_owned_sequence((select valor::uuid from ids where chave = 'sequencia'), null, null, 'ativa')$$,
  'the owner resumes the sequence');
reset role;
select is((pg_temp.envio('passo-2')).scheduled_for, '2026-10-06 09:00-03'::timestamptz,
  'the overdue step goes out at the next valid time after the resume');
select is((select count(*)::int from private.sequence_step_sends where status in ('scheduled', 'confirmed')), 1,
  'only one step is scheduled after the resume');

-- 5. Falhas: nova tentativa em 5 e em 30 minutos; na terceira, a Sequência para no passo e espera o titular.
select pg_temp.relogio('2026-10-06 09:00-03');
select is((select count(*)::int from public.claim_due_step_sends(10)), 1, 'the resumed step is due');
select is((select outcome || ' ' || reply_to_message_id from public.release_due_step_send((pg_temp.envio('passo-2')).id)),
  'released <m1@x>', 'a "Re:" step continues the conversation of the previous send');
select is(public.record_sequence_step_send_result((pg_temp.envio('passo-2')).id, 'failed', null, null, 'HTTP 503'),
  'scheduled', 'a failed automatic step is retried');
select is((pg_temp.envio('passo-2')).scheduled_for, '2026-10-06 09:05-03'::timestamptz,
  'the first retry is five minutes later');
select is((pg_temp.envio('passo-2')).attempts || ' ' || (pg_temp.envio('passo-2')).last_error, '1 HTTP 503',
  'the attempt and its reason are kept');
select pg_temp.relogio('2026-10-06 09:05-03');
select is((select count(*)::int from public.claim_due_step_sends(10)), 1, 'the retry is due');
select is((select outcome from public.release_due_step_send((pg_temp.envio('passo-2')).id)), 'released', 'the retry is released');
select is(public.record_sequence_step_send_result((pg_temp.envio('passo-2')).id, 'failed', null, null, 'HTTP 503'),
  'scheduled', 'the second failure is retried too');
select is((pg_temp.envio('passo-2')).scheduled_for, '2026-10-06 09:35-03'::timestamptz,
  'the second retry is thirty minutes later');
select pg_temp.relogio('2026-10-06 09:35-03');
select is((select count(*)::int from public.claim_due_step_sends(10)), 1, 'the last retry is due');
select is((select outcome from public.release_due_step_send((pg_temp.envio('passo-2')).id)), 'released', 'the last retry is released');
select is(public.record_sequence_step_send_result((pg_temp.envio('passo-2')).id, 'failed', null, null, 'HTTP 503'),
  'failed', 'the third failure stops the step');
select pg_temp.relogio('2026-10-06 12:00-03');
select is((select count(*)::int from public.claim_due_step_sends(10)), 0,
  'the sequence stays on the failed step; nothing after it is sent');
set local role authenticated;
select is(
  (select status || ' ' || (scheduled_for = '2026-10-06 12:00-03') from public.confirm_sequence_step((select valor::uuid from ids where chave = 'sequencia'), 'passo-2')),
  'scheduled true', 'the owner reconfirms the failed step and it is scheduled for now');
reset role;
select is((select count(*)::int from public.claim_due_step_sends(10)), 1, 'the reconfirmed step is due');
select is((select outcome from public.release_due_step_send((pg_temp.envio('passo-2')).id)), 'released', 'the reconfirmed step is released');
select is(public.record_sequence_step_send_result((pg_temp.envio('passo-2')).id, 'sent', 'e-2', '<m2@x>', null),
  'sent', 'the reconfirmed step went out');

-- 6. E-mail manual: programado, mas só sai pela ação explícita do titular.
select is((pg_temp.envio('passo-3')).status || ' ' || ((pg_temp.envio('passo-3')).scheduled_for = '2026-10-07 12:00-03'),
  'confirmed true', 'the manual step waits for the owner from its time on');
select pg_temp.relogio('2026-10-07 13:00-03');
select is((select count(*)::int from public.claim_due_step_sends(10)), 0, 'the executor never claims a manual step');
select is((select outcome from public.release_due_step_send((pg_temp.envio('passo-3')).id)), 'not_scheduled',
  'the executor cannot release a manual step');
select is(
  (select outcome from public.release_sequence_step_send((pg_temp.envio('passo-3')).id, '70000000-0000-0000-0000-000000000001')),
  'released', 'the owner sends the manual step explicitly');
select is(public.record_sequence_step_send_result((pg_temp.envio('passo-3')).id, 'sent', 'e-3', '<m3@x>', null),
  'sent', 'the manual step went out');
select is((pg_temp.envio('passo-5')).status, 'waiting',
  'a LinkedIn step, not yet sent by Althius, holds the steps after it');

-- 7. Editar um passo enviado não mexe na autorização; editar um pendente a revoga.
set local role authenticated;
select public.update_owned_sequence((select valor::uuid from ids where chave = 'sequencia'),
  pg_temp.documento(
    pg_temp.passo('passo-1', 'email', 'maria', 0, 'Apresentação', 'Texto novo de um passo já enviado.'),
    pg_temp.passo('passo-2', 'email', 'maria', 2, 'Re: Apresentação', 'Seguindo.'),
    pg_temp.passo('passo-3', 'email', 'maria', 1, 'Proposta', 'Segue a proposta.', 'manual'),
    pg_temp.passo('passo-4', 'linkedin', 'maria', 1, null, 'Oi'),
    pg_temp.passo('passo-5', 'email', 'maria', 0, 'Depois do LinkedIn', 'Oi de novo.')), null, null);
select is(
  (select version || ' ' || active from public.get_sequence_authorization((select valor::uuid from ids where chave = 'sequencia'))),
  '1 true', 'editing a step that already went out keeps the authorization');
select public.update_owned_sequence((select valor::uuid from ids where chave = 'sequencia'),
  pg_temp.documento(
    pg_temp.passo('passo-1', 'email', 'maria', 0, 'Apresentação', 'Texto novo de um passo já enviado.'),
    pg_temp.passo('passo-2', 'email', 'maria', 2, 'Re: Apresentação', 'Seguindo.'),
    pg_temp.passo('passo-3', 'email', 'maria', 1, 'Proposta', 'Segue a proposta.', 'manual'),
    pg_temp.passo('passo-4', 'linkedin', 'maria', 1, null, 'Oi'),
    pg_temp.passo('passo-5', 'email', 'maria', 0, 'Depois do LinkedIn', 'Outro texto.')), null, null);
select is(
  (select version || ' ' || active || ' ' || revoked_reason from public.get_sequence_authorization((select valor::uuid from ids where chave = 'sequencia'))),
  '1 false edited', 'editing a pending step revokes the authorization');
reset role;
select is((pg_temp.envio('passo-5')).status, 'cancelled', 'the pending steps of the revoked version do not go out');
select is((pg_temp.envio('passo-1')).body, 'Olá, Maria.', 'a sent step keeps what went out');
set local role authenticated;
select is(
  (select outcome || ' v' || version || ' ' || coalesce(step_id, 'nenhum')
    from public.activate_sequence((select valor::uuid from ids where chave = 'sequencia'))),
  'activated v2 nenhum', 'activating again authorizes the new version; the LinkedIn step still holds the rest');
reset role;
select is((pg_temp.envio('passo-5')).status || ' ' || (pg_temp.envio('passo-1')).status, 'waiting sent',
  'the pending step waits under the new version and the sent ones stay sent');

-- 8. Atrasado (executor fora do ar), o passo vai para o próximo horário válido em vez de sair fora da janela.
select pg_temp.relogio('2026-10-07 13:00-03');
set local role authenticated;
select public.update_owned_sequence((select valor::uuid from ids where chave = 'sequencia-2'),
  pg_temp.documento(pg_temp.passo('q-1', 'email', 'ana', 0, 'Oi', 'Olá, Ana.')), null, null);
select is((select outcome || ' ' || step_id from public.activate_sequence((select valor::uuid from ids where chave = 'sequencia-2'))),
  'activated q-1', 'the second sequence is activated');
reset role;
select pg_temp.relogio('2026-10-07 19:00-03');
select is((select count(*)::int from public.claim_due_step_sends(10)), 1, 'the late step is claimed');
select is((select outcome from public.release_due_step_send((pg_temp.envio('q-1')).id)), 'outside_window',
  'a late step is not sent outside the window');
select is((pg_temp.envio('q-1')).status || ' ' || ((pg_temp.envio('q-1')).scheduled_for = '2026-10-08 09:00-03'),
  'scheduled true', 'the late step moves to the next valid time');

-- 9. Uma Sequência de três passos para as correções da revisão: bloqueio gravado, eco durante a nova tentativa,
-- reconfirmar sem adiantar, passo em voo numa reativação, incerto resolvido pelo titular e bounce.
select pg_temp.relogio('2026-10-08 09:00-03');
set local role authenticated;
select public.update_owned_sequence((select valor::uuid from ids where chave = 'sequencia-2'),
  pg_temp.documento(
    pg_temp.passo('q-1', 'email', 'ana', 0, 'Oi', 'Olá, Ana.'),
    pg_temp.passo('q-2', 'email', 'ana', 1, 'Re: Oi', 'Tudo bem?'),
    pg_temp.passo('q-3', 'email', 'ana', 1, 'Última', 'Até mais.')), null, null);
select is((select outcome || ' ' || step_id || ' v' || version from public.activate_sequence((select valor::uuid from ids where chave = 'sequencia-2'))),
  'activated q-1 v2', 'adding steps revoked the first version; the new one starts again from the first pending step');

reset role;
update private.sender_accounts set status = 'syncing' where unipile_account_id = 'unipile-google-7';
select is((select count(*)::int from public.claim_due_step_sends(10)), 1, 'the first step is due');
select is((select outcome from public.release_due_step_send((pg_temp.envio('q-1')).id)), 'sender_not_ready',
  'without a ready sender account the step does not go out');
select is((pg_temp.envio('q-1')).status || ' ' || (pg_temp.envio('q-1')).last_error, 'scheduled sender_not_ready',
  'the block is kept on the step, which stays scheduled');
select is((select count(*)::int from public.claim_due_step_sends(10)), 0,
  'the executor waits before trying a blocked step again');
update private.sender_accounts set status = 'ready' where unipile_account_id = 'unipile-google-7';
update private.sequence_step_sends set claimed_until = null where step_id = 'q-1';

select is((select count(*)::int from public.claim_due_step_sends(10)), 1, 'the step is due again');
select is((select outcome from public.release_due_step_send((pg_temp.envio('q-1')).id)), 'released', 'the step is released');
select is(public.record_sequence_step_send_result((pg_temp.envio('q-1')).id, 'failed', null, null, 'HTTP 429', 3600),
  'scheduled', 'a rate-limited step is retried');
select is((pg_temp.envio('q-1')).scheduled_for, '2026-10-08 10:00-03'::timestamptz,
  'the retry waits the time the provider asked for');
select is(
  (select outcome from public.ingest_unipile_email_event('evt-q1', 'email.new', 'unipile-google-7',
    jsonb_build_object('id', 'e-q1', 'message_id', '<q1@x>', 'thread_id', 't-q1', 'subject', 'Oi',
      'from', jsonb_build_array(jsonb_build_object('email', 'titular@cliente.com.br')),
      'to', jsonb_build_array(jsonb_build_object('email', 'ana@outra.test')),
      'headers', jsonb_build_array(jsonb_build_object('name', 'X-Althius-Envio', 'value', (pg_temp.envio('q-1')).id::text))),
    '{}')),
  'echo', 'the echo of the failed attempt arrives');
select is((pg_temp.envio('q-1')).status || ' ' || (pg_temp.envio('q-2')).status, 'sent scheduled',
  'the echo proves the send: no duplicate retry, and the next step is scheduled');
select is((pg_temp.envio('q-2')).scheduled_for, '2026-10-09 09:00-03'::timestamptz,
  'the next step counts its business day from the proven send');

set local role authenticated;
select is(
  (select status || ' ' || (scheduled_for = '2026-10-09 09:00-03') from public.confirm_sequence_step((select valor::uuid from ids where chave = 'sequencia-2'), 'q-2')),
  'scheduled true', 'reconfirming a scheduled step keeps its time instead of bringing it forward');
reset role;
select is((select outcome from public.release_sequence_step_send((pg_temp.envio('q-2')).id, '70000000-0000-0000-0000-000000000001')),
  'not_due', 'the owner cannot send an authorized step before its time either');

-- Um passo em voo durante uma edição e reativação continua sendo o passo da vez.
select pg_temp.relogio('2026-10-09 09:00-03');
select is((select count(*)::int from public.claim_due_step_sends(10)), 1, 'the second step is due');
select is((select outcome from public.release_due_step_send((pg_temp.envio('q-2')).id)), 'released', 'the second step is in flight');
set local role authenticated;
select public.update_owned_sequence((select valor::uuid from ids where chave = 'sequencia-2'),
  pg_temp.documento(
    pg_temp.passo('q-1', 'email', 'ana', 0, 'Oi', 'Olá, Ana.'),
    pg_temp.passo('q-2', 'email', 'ana', 1, 'Re: Oi', 'Tudo bem?'),
    pg_temp.passo('q-3', 'email', 'ana', 1, 'Última', 'Até mais, Ana.')), null, null);
select is((select outcome || ' v' || version || ' ' || coalesce(step_id, 'nenhum') from public.activate_sequence((select valor::uuid from ids where chave = 'sequencia-2'))),
  'activated v3 nenhum', 'activating while a step is in flight schedules nothing new');
reset role;
select is(public.record_sequence_step_send_result((pg_temp.envio('q-2')).id, 'failed', null, null, 'HTTP 500'),
  'failed', 'the step of the previous version fails without a retry');
set local role authenticated;
select is(
  (select status from public.confirm_sequence_step((select valor::uuid from ids where chave = 'sequencia-2'), 'q-2')),
  'scheduled', 'reconfirming brings the step into the active version');
reset role;
select is((select count(*)::int from public.claim_due_step_sends(10)), 1, 'the reconfirmed step is due');
select is((select outcome from public.release_due_step_send((pg_temp.envio('q-2')).id)), 'released', 'the reconfirmed step is released');
select is(public.record_sequence_step_send_result((pg_temp.envio('q-2')).id, 'sent', 'e-q2', '<q2@x>', null),
  'sent', 'the reconfirmed step went out');
select is((pg_temp.envio('q-3')).status || ' ' || ((pg_temp.envio('q-3')).scheduled_for = '2026-10-12 09:00-03'),
  'scheduled true', 'the step after it is scheduled under the active version');

-- Incerto sem eco: o titular confere a caixa de saída e resolve.
select pg_temp.relogio('2026-10-12 09:00-03');
select is((select count(*)::int from public.claim_due_step_sends(10)), 1, 'the last step is due');
select is((select outcome from public.release_due_step_send((pg_temp.envio('q-3')).id)), 'released', 'the last step is released');
select is(public.record_sequence_step_send_result((pg_temp.envio('q-3')).id, 'uncertain', null, null, 'timeout'),
  'uncertain', 'the provider did not answer in time');
select is((select count(*)::int from public.claim_due_step_sends(10)), 0, 'an uncertain step is never retried by itself');
set local role authenticated;
select is(public.resolve_uncertain_step((select valor::uuid from ids where chave = 'sequencia-2'), 'q-3', false),
  'scheduled', 'the owner says it did not go out: the step is scheduled again');
reset role;
select is((select count(*)::int from public.claim_due_step_sends(10)), 1, 'the step is due again');
select is((select outcome from public.release_due_step_send((pg_temp.envio('q-3')).id)), 'released', 'the step is released again');
select is(public.record_sequence_step_send_result((pg_temp.envio('q-3')).id, 'uncertain', null, null, 'timeout'),
  'uncertain', 'the provider did not answer in time again');
set local role authenticated;
select is(public.resolve_uncertain_step((select valor::uuid from ids where chave = 'sequencia-2'), 'q-3', true),
  'sent', 'the owner found it in the outbox: the step is sent');
select throws_ok(
  $$select public.resolve_uncertain_step((select valor::uuid from ids where chave = 'sequencia-2'), 'q-3', true)$$,
  '55000', 'send is not uncertain', 'only an uncertain step can be resolved');

-- Bounce: ativar de novo não reenvia para o endereço que voltou.
reset role;
update private.sequence_step_sends set provider_email_id = 'e-q3' where step_id = 'q-3';
select is(
  (select outcome from public.ingest_unipile_email_event('evt-q3-bounce', 'email.new.bounce', 'unipile-google-7',
    jsonb_build_object('id', 'e-q3', 'subject', 'Última',
      'from', jsonb_build_array(jsonb_build_object('email', 'titular@cliente.com.br'))), '{}')),
  'bounce', 'the last step bounced');
set local role authenticated;
select public.update_owned_sequence((select valor::uuid from ids where chave = 'sequencia-2'),
  pg_temp.documento(
    pg_temp.passo('q-1', 'email', 'ana', 0, 'Oi', 'Olá, Ana.'),
    pg_temp.passo('q-2', 'email', 'ana', 1, 'Re: Oi', 'Tudo bem?'),
    pg_temp.passo('q-3', 'email', 'ana', 1, 'Última', 'Até mais, Ana.'),
    pg_temp.passo('q-4', 'email', 'ana', 1, 'Mais uma', 'Ainda por aqui.')), null, null);
reset role;
select is((pg_temp.envio('q-3')).status, 'bounced', 'revoking a version keeps the bounce as history');
set local role authenticated;
select is((select outcome || ' ' || step_id from public.activate_sequence((select valor::uuid from ids where chave = 'sequencia-2'))),
  'destination_bounced q-3', 'the activation does not send again to an address that bounced');
reset role;
update public.contacts set email = 'ana.reis@outra.test' where id = (select valor::uuid from ids where chave = 'ana');
set local role authenticated;
select is((select outcome || ' ' || step_id from public.activate_sequence((select valor::uuid from ids where chave = 'sequencia-2'))),
  'activated q-3', 'with the address fixed, the bounced step goes out again to the new address');
reset role;
select is((pg_temp.envio('q-3')).destination, 'ana.reis@outra.test', 'the new address is the fixed destination');

select * from finish();
rollback;

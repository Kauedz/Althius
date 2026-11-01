begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(27);

create function pg_temp.relogio(p_at timestamptz) returns void language plpgsql as $f$
begin
  execute format(
    'create or replace function private.clock_now() returns timestamptz language sql stable set search_path = '''' '
    'as $c$ select %L::timestamptz $c$', p_at);
end
$f$;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('e6000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'e6-titular@cliente.com.br', '', now(), now(), now(), '{}', '{"full_name":"Renan"}', false, false),
  ('e6000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'e6-outro@outro.com.br', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('e6100000-0000-0000-0000-000000000001', 'empresa', 'Cliente E6'),
  ('e6100000-0000-0000-0000-000000000002', 'empresa', 'Outro E6');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('e6100000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-000000000001', 'member', true),
  ('e6100000-0000-0000-0000-000000000002', 'e6000000-0000-0000-0000-000000000002', 'member', true);

create temporary table ids (chave text primary key, valor text);
grant all on ids to authenticated, service_role;

create function pg_temp.agenda() returns jsonb language sql as $f$
  select jsonb_build_object(
    'fuso', 'America/Sao_Paulo', 'diasUteis', jsonb_build_array(1, 2, 3, 4, 5),
    'janela', jsonb_build_object('de', '09:00', 'ate', '18:00'),
    'maximoDiario', 10, 'intervaloMinutos', 0);
$f$;

select pg_temp.relogio('2026-09-30 10:00-03');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'e6000000-0000-0000-0000-000000000001', true);

insert into ids select 'alfa', id::text from public.save_target_account(
  'e6100000-0000-0000-0000-000000000001', 'Empresa Alvo', 'https://alfa.e6.test');
insert into ids select 'beta', id::text from public.save_target_account(
  'e6100000-0000-0000-0000-000000000001', 'Outra Conta', 'https://beta.e6.test');
insert into ids select 'maria', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'alfa'), 'Maria Souza', 'Diretora', 'maria@alfa.e6.test');
insert into ids select 'joao', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'alfa'), 'João Lima', 'Gerente', 'joao@alfa.e6.test');
insert into ids select 'carla', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'beta'), 'Carla Nunes', 'Analista', 'carla@beta.e6.test');

insert into ids select 'seq', id::text from public.create_sequence(
  'e6100000-0000-0000-0000-000000000001',
  (select valor from ids where chave = 'alfa'),
  jsonb_build_object('steps', jsonb_build_array(
    jsonb_build_object('id', 'sinal', 'canal', 'email', 'contatoId', (select valor from ids where chave = 'maria'),
      'delayDiasUteis', 0, 'titulo', 'Sinal', 'assunto', 'Sinal', 'corpo', '{{sinal.frase}}', 'liberacao', 'ativacao'),
    jsonb_build_object('id', 'ok', 'canal', 'email', 'contatoId', (select valor from ids where chave = 'joao'),
      'delayDiasUteis', 0, 'titulo', 'Ok', 'assunto', 'Oi', 'corpo', 'Olá.', 'liberacao', 'ativacao'),
    jsonb_build_object('id', 'cheio', 'canal', 'email', 'contatoId', (select valor from ids where chave = 'maria'),
      'delayDiasUteis', 0, 'titulo', 'Cheio', 'assunto', 'Para {{empresa}}', 'corpo', 'Oi {{primeiro_nome}}', 'liberacao', 'ativacao'),
    jsonb_build_object('id', 'nome', 'canal', 'email', 'contatoId', (select valor from ids where chave = 'maria'),
      'delayDiasUteis', 0, 'titulo', 'Nome', 'assunto', 'Nome', 'corpo', 'Oi {{primeiro_nome}}', 'liberacao', 'ativacao'),
    jsonb_build_object('id', 'destino', 'canal', 'email', 'contatoId', (select valor from ids where chave = 'joao'),
      'delayDiasUteis', 0, 'titulo', 'Destino', 'assunto', 'Destino', 'corpo', 'Texto fixo.', 'liberacao', 'ativacao'),
    jsonb_build_object('id', 'envio', 'canal', 'email', 'contatoId', (select valor from ids where chave = 'maria'),
      'delayDiasUteis', 0, 'titulo', 'Envio', 'assunto', 'Envio', 'corpo', '{{referencia.envio}}',
      'liberacao', 'ativacao', 'referenciaContatoId', (select valor from ids where chave = 'joao')),
    jsonb_build_object('id', 'resposta', 'canal', 'email', 'contatoId', (select valor from ids where chave = 'maria'),
      'delayDiasUteis', 0, 'titulo', 'Resposta', 'assunto', 'Resposta', 'corpo', '{{referencia.resposta}}',
      'liberacao', 'ativacao', 'referenciaContatoId', (select valor from ids where chave = 'joao')),
    jsonb_build_object('id', 'indicacao', 'canal', 'email', 'contatoId', (select valor from ids where chave = 'maria'),
      'delayDiasUteis', 0, 'titulo', 'Indicacao', 'assunto', 'Indicacao', 'corpo', '{{referencia.indicacao}}',
      'liberacao', 'ativacao', 'referenciaContatoId', (select valor from ids where chave = 'joao')),
    jsonb_build_object('id', 'alheia', 'canal', 'email', 'contatoId', (select valor from ids where chave = 'maria'),
      'delayDiasUteis', 0, 'titulo', 'Alheia', 'assunto', 'Alheia', 'corpo', '{{referencia.envio}}',
      'liberacao', 'ativacao', 'referenciaContatoId', (select valor from ids where chave = 'carla'))
  )),
  '{"totalSteps": 9}'::jsonb);

select is(
  (select subject || ' | ' || body || ' | ' || missing::text from public.preview_sequence_step(
    (select valor::uuid from ids where chave = 'seq'), 'cheio')),
  'Para Empresa Alvo | Oi Maria | {}',
  'a prévia resolve Conta e Contato reais antes de autorizar');
select is(
  (select missing::text from public.preview_sequence_step(
    (select valor::uuid from ids where chave = 'seq'), 'sinal')),
  '{sinal.frase}',
  'Sinal ausente aparece na prévia e segura o passo');

insert into ids select 'tentativa', attempt_id::text from public.create_sender_connection_attempt(
  'e6100000-0000-0000-0000-000000000001', 'email', null);
reset role;
set local role service_role;
select public.complete_sender_connection_attempt(
  (select valor::uuid from ids where chave = 'tentativa'), 'unipile-e6', 'GOOGLE', 'CREATION_SUCCESS');
select public.apply_unipile_sender_status('unipile-e6', 'SYNC_SUCCESS');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e6000000-0000-0000-0000-000000000001', true);
select is(
  (select count(*)::int from public.activate_sequence(
    (select valor::uuid from ids where chave = 'seq'),
    array['sinal', 'ok', 'cheio', 'nome', 'destino', 'envio', 'resposta', 'indicacao', 'alheia'],
    pg_temp.agenda())),
  9, 'a ativação cobre o passo bloqueado e o independente');

reset role;
select is(
  (select subject || ' | ' || body from private.authorized_message_snapshots s
    join private.sequence_authorizations a on a.id = s.authorization_id
    where a.sequence_id = (select valor::uuid from ids where chave = 'seq') and a.revoked_at is null
      and s.step_id = 'cheio'),
  'Para Empresa Alvo | Oi Maria',
  'a autorização congela o texto resolvido');
update private.sequence_step_sends set scheduled_for = '2026-09-30 10:00-03', status = 'scheduled'
where sequence_id = (select valor::uuid from ids where chave = 'seq') and status in ('scheduled', 'waiting');

insert into private.signals (workspace_id, target_account_id, signal_type, event_key, phrase, fired_at, source, evidence)
values (
  'e6100000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'beta'),
  'vaga_linkedin', 'beta-1', 'Sinal de outra Conta', now(), 'LinkedIn', 'nao-entra');

select is(
  (select outcome from public.release_sequence_step_send(
    (select id from private.sequence_step_sends where sequence_id = (select valor::uuid from ids where chave = 'seq') and step_id = 'ok'),
    'e6000000-0000-0000-0000-000000000001')),
  'released', 'passo independente sai mesmo com outro passo sem Sinal');
select is(
  (select destination from private.sequence_step_sends
    where sequence_id = (select valor::uuid from ids where chave = 'seq') and step_id = 'ok'),
  'joao@alfa.e6.test', 'o Destino autorizado do passo independente permanece o confirmado');
select is(
  (select outcome from public.release_sequence_step_send(
    (select id from private.sequence_step_sends where sequence_id = (select valor::uuid from ids where chave = 'seq') and step_id = 'sinal'),
    'e6000000-0000-0000-0000-000000000001')),
  'missing_variable', 'Sinal de outra Conta não preenche a variável');
select is(
  (select status || ' ' || last_error from private.sequence_step_sends
    where sequence_id = (select valor::uuid from ids where chave = 'seq') and step_id = 'sinal'),
  'awaiting_reconfirmation missing_variable:sinal.frase', 'o passo local fica retido com o motivo');
select is(
  (select status from private.sequence_step_sends
    where sequence_id = (select valor::uuid from ids where chave = 'seq') and step_id = 'ok'),
  'sending', 'reter o passo sem evidência não cancela o independente');

insert into private.signals (workspace_id, target_account_id, signal_type, event_key, phrase, fired_at, source, evidence)
values (
  'e6100000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'alfa'),
  'vaga_linkedin', 'alfa-1', 'Abriu vaga de dados', now(), 'LinkedIn', 'linkedin.com/jobs/1');
update private.sequence_step_sends set status = 'scheduled', claimed_until = null
where sequence_id = (select valor::uuid from ids where chave = 'seq') and step_id = 'sinal';
select is(
  (select outcome from public.release_sequence_step_send(
    (select id from private.sequence_step_sends where sequence_id = (select valor::uuid from ids where chave = 'seq') and step_id = 'sinal'),
    'e6000000-0000-0000-0000-000000000001')),
  'message_changed', 'Sinal que aparece depois da autorização não altera a mensagem em silêncio');

select is(
  (select outcome || ' | ' || subject || ' | ' || body || ' | ' || destination
    from public.release_sequence_step_send(
      (select id from private.sequence_step_sends where sequence_id = (select valor::uuid from ids where chave = 'seq') and step_id = 'cheio'),
      'e6000000-0000-0000-0000-000000000001')),
  'released | Para Empresa Alvo | Oi Maria | maria@alfa.e6.test',
  'o envio usa o texto e o Destino autorizados');

update public.contacts set name = 'Ana Souza'
where id = (select valor::uuid from ids where chave = 'maria');
select is(
  (select outcome from public.release_sequence_step_send(
    (select id from private.sequence_step_sends where sequence_id = (select valor::uuid from ids where chave = 'seq') and step_id = 'nome'),
    'e6000000-0000-0000-0000-000000000001')),
  'message_changed', 'mudar o nome depois não envia a mensagem nova');
select is(
  (select subject is null and body is null from private.sequence_step_sends
    where sequence_id = (select valor::uuid from ids where chave = 'seq') and step_id = 'nome'),
  true, 'a mensagem não autorizada não fica gravada como enviada');

update public.contacts set email = 'joao-novo@alfa.e6.test'
where id = (select valor::uuid from ids where chave = 'joao');
select is(
  (select outcome from public.release_sequence_step_send(
    (select id from private.sequence_step_sends where sequence_id = (select valor::uuid from ids where chave = 'seq') and step_id = 'destino'),
    'e6000000-0000-0000-0000-000000000001')),
  'destination_changed', 'Destino autorizado continua validado na execução');
select is(
  (select destination from private.sequence_step_sends
    where sequence_id = (select valor::uuid from ids where chave = 'seq') and step_id = 'destino'),
  'joao@alfa.e6.test', 'o endereço fixado não é trocado pelo e-mail novo');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e6000000-0000-0000-0000-000000000001', true);
select is(
  (select body from public.preview_sequence_step((select valor::uuid from ids where chave = 'seq'), 'envio')),
  '{{referencia.envio}}', 'sem envio confirmado a prévia não inventa o nome');

reset role;
insert into private.sequence_step_sends (
  sequence_id, workspace_id, step_id, owner_user_id, contact_id, channel, destination, status)
values (
  (select valor::uuid from ids where chave = 'seq'), 'e6100000-0000-0000-0000-000000000001', 'prova-agendada',
  'e6000000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'joao'),
  'email', 'joao@alfa.e6.test', 'scheduled');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e6000000-0000-0000-0000-000000000001', true);
select is(
  (select missing::text from public.preview_sequence_step((select valor::uuid from ids where chave = 'seq'), 'envio')),
  '{referencia.envio}', 'tentativa agendada não vira envio');
select is(
  (select missing::text from public.preview_sequence_step((select valor::uuid from ids where chave = 'seq'), 'resposta')),
  '{referencia.resposta}', 'tentativa agendada não vira resposta');

reset role;
insert into private.sequence_step_sends (
  sequence_id, workspace_id, step_id, owner_user_id, contact_id, channel, destination, status)
values (
  (select valor::uuid from ids where chave = 'seq'), 'e6100000-0000-0000-0000-000000000001', 'prova-envio',
  'e6000000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'joao'),
  'email', 'joao@alfa.e6.test', 'sent');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e6000000-0000-0000-0000-000000000001', true);
select is(
  (select body || ' | ' || missing::text from public.preview_sequence_step(
    (select valor::uuid from ids where chave = 'seq'), 'envio')),
  'João Lima | {}', 'envio confirmado cita o outro Contato');
select is(
  (select missing::text from public.preview_sequence_step((select valor::uuid from ids where chave = 'seq'), 'resposta')),
  '{referencia.resposta}', 'envio confirmado não vira resposta');
select is(
  (select missing::text from public.preview_sequence_step((select valor::uuid from ids where chave = 'seq'), 'indicacao')),
  '{referencia.indicacao}', 'envio confirmado não vira indicação');
select is(
  (select missing::text from public.preview_sequence_step((select valor::uuid from ids where chave = 'seq'), 'alheia')),
  '{referencia.envio}', 'Contato de outra Conta não entra como referência');

select throws_ok(
  $$select public.record_contact_indication(
    (select valor::uuid from ids where chave = 'alfa'),
    (select valor::uuid from ids where chave = 'joao'),
    'João Lima')$$,
  '22023', 'o nome nao e indicacao comprovada',
  'o nome sozinho não é indicação');
select public.record_contact_indication(
  (select valor::uuid from ids where chave = 'alfa'),
  (select valor::uuid from ids where chave = 'joao'),
  'João pediu para falar com a Maria em 12/09.');
select is(
  (select body from public.preview_sequence_step((select valor::uuid from ids where chave = 'seq'), 'indicacao')),
  'João Lima', 'indicação comprovada cita o Contato');

reset role;
insert into public.account_interactions (workspace_id, target_account_id, kind, source, recorded_by, contact_id)
values (
  'e6100000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'alfa'),
  'email-recebido', 'manual', 'e6000000-0000-0000-0000-000000000001',
  (select valor::uuid from ids where chave = 'joao'));

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e6000000-0000-0000-0000-000000000001', true);
select is(
  (select body from public.preview_sequence_step((select valor::uuid from ids where chave = 'seq'), 'resposta')),
  'João Lima', 'resposta registrada é distinta do envio');

select set_config('request.jwt.claim.sub', 'e6000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select * from public.preview_sequence_step(
    (select valor::uuid from ids where chave = 'seq'), 'cheio')$$,
  '42501', 'sequence not found or not owned by active user',
  'outro Workspace não lê a prévia');
select throws_ok(
  $$select public.record_contact_indication(
    (select valor::uuid from ids where chave = 'alfa'),
    (select valor::uuid from ids where chave = 'joao'),
    'prova alheia que nao pode entrar')$$,
  '42501', 'account not found or not owned by active user',
  'outro Workspace não grava indicação nesta Conta');

select * from finish();
rollback;

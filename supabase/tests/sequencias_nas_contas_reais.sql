begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(80);

-- O relógio da agenda fica parado onde o teste quiser, só dentro desta transação.
create function pg_temp.relogio(p_at timestamptz) returns void language plpgsql as $f$
begin
  execute format(
    'create or replace function private.clock_now() returns timestamptz language sql stable set search_path = '''' '
    'as $c$ select %L::timestamptz $c$', p_at);
end
$f$;

create function pg_temp.envio(p_sequence uuid, p_step text) returns private.sequence_step_sends language sql as $f$
  select * from private.sequence_step_sends where sequence_id = p_sequence and step_id = p_step;
$f$;

-- Workspace Norte: Ana (Vendedora, sai da empresa), Bruno (Membro), Carla (Administradora) e Diego (Membro, assume a
-- Conta de Ana). Eva administra o Workspace Sul.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('90000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('90000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('90000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('90000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'diego@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('90000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'eva@sul.com.br', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('91000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('91000000-0000-0000-0000-000000000002', 'empresa', 'Sul');

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'member', true),
  ('91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000002', 'member', true),
  ('91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000003', 'admin', true),
  ('91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000004', 'member', true),
  ('91000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000005', 'admin', true);

create temporary table ids (chave text primary key, valor text);
grant all on ids to authenticated, service_role;

-- 1. A relação tipada: as duas tabelas ganham o uuid da Conta e a chave estrangeira, que ainda não foi validada
-- porque um banco antigo pode ter linhas sem Conta real.
select col_type_is('public', 'sequences', 'account_id', 'uuid', 'a sequence has its target account as a typed uuid');
select col_type_is('public', 'sales_responsibilities', 'account_id', 'uuid',
  'a responsibility has its target account as a typed uuid');
select is(
  (select string_agg(conname || ' ' || convalidated::text, ', ' order by conname) from pg_constraint
    where conname in ('sequences_target_account_fk', 'sales_responsibilities_target_account_fk')),
  'sales_responsibilities_target_account_fk false, sequences_target_account_fk false',
  'both foreign keys to target_accounts exist and stay not validated until the legacy rows are cleaned');

-- Ana cadastra a Conta-alvo (fica responsável) e o Contato; Eva cadastra uma Conta no Workspace Sul.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
insert into ids select 'conta', id::text from public.save_target_account(
  '91000000-0000-0000-0000-000000000001', 'Alfa', 'https://alfa.test');
insert into ids select 'maria', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta'), 'Maria Souza', 'Diretora', 'maria@alfa.test');
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000005', true);
insert into ids select 'conta-sul', id::text from public.save_target_account(
  '91000000-0000-0000-0000-000000000002', 'Sul S.A.', 'https://sul.test');

select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.create_sequence('91000000-0000-0000-0000-000000000001', 'teste-real-1', '{}'::jsonb, '{}'::jsonb)$$,
  'P0002', 'target account not found', 'a sequence needs a target account UUID, not a loose text');
select throws_ok(
  $$select public.create_sequence('91000000-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000009', '{}'::jsonb, '{}'::jsonb)$$,
  'P0002', 'target account not found', 'a UUID without a target account is refused');
select throws_ok(
  $$select public.create_sequence('91000000-0000-0000-0000-000000000001', (select valor from ids where chave = 'conta-sul'), '{}'::jsonb, '{}'::jsonb)$$,
  'P0002', 'target account not found', 'the target account of another Workspace is refused');
select throws_ok(
  $$select public.create_sequence('91000000-0000-0000-0000-000000000002', (select valor from ids where chave = 'conta-sul'), '{}'::jsonb, '{}'::jsonb)$$,
  '42501', 'active workspace membership required', 'a participant of another Workspace cannot create the sequence');

-- A Sequência de Ana: um passo de E-mail para a Maria.
insert into ids select 'sequencia-ana', id::text from public.create_sequence(
  '91000000-0000-0000-0000-000000000001', (select valor from ids where chave = 'conta'),
  jsonb_build_object('janelaPadrao', '{"de": "09:00", "ate": "18:00"}'::jsonb, 'steps', jsonb_build_array(
    jsonb_build_object('id', 'passo-1', 'canal', 'email', 'contatoId', (select valor from ids where chave = 'maria'),
      'delayDiasUteis', 0, 'titulo', 'Abertura', 'assunto', 'Oi', 'corpo', 'Olá, Maria.'))),
  '{"totalSteps": 1}'::jsonb);
select is((select account_id::text from public.sequences where id = (select valor::uuid from ids where chave = 'sequencia-ana')),
  (select valor from ids where chave = 'conta'), 'the sequence points to the real target account');
reset role;
update public.sequences set public_summary = '{"status": "encerrada"}'::jsonb
  where id = (select valor::uuid from ids where chave = 'sequencia-ana');
select is((select public_summary ->> 'status' from public.sequences where id = (select valor::uuid from ids where chave = 'sequencia-ana')),
  'ativa', 'o resumo público não afirma "encerrada" numa Sequência que não está encerrada');
update public.sequences set public_summary = '{"totalSteps": 1}'::jsonb
  where id = (select valor::uuid from ids where chave = 'sequencia-ana');
set local role authenticated;
select is((select account_id::text from public.sales_responsibilities
    where target_account_id = (select valor from ids where chave = 'conta')),
  (select valor from ids where chave = 'conta'), 'so does the responsibility');

-- 2. Um vendedor responsável exclusivo e no máximo uma Sequência em andamento por Conta (ADR-0009).
select throws_ok(
  $$select public.create_sequence('91000000-0000-0000-0000-000000000001', (select valor from ids where chave = 'conta'), '{}'::jsonb, '{}'::jsonb)$$,
  '23505', 'target account already has a sequence in progress', 'the owner cannot open a second sequence for the target account');
select public.update_owned_sequence((select valor::uuid from ids where chave = 'sequencia-ana'), null, null, 'pausada');
select throws_ok(
  $$select public.create_sequence('91000000-0000-0000-0000-000000000001', (select valor from ids where chave = 'conta'), '{}'::jsonb, '{}'::jsonb)$$,
  '23505', 'target account already has a sequence in progress', 'a paused sequence still holds the target account');
select public.update_owned_sequence((select valor::uuid from ids where chave = 'sequencia-ana'), null, null, 'ativa');

select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.create_sequence('91000000-0000-0000-0000-000000000001', (select valor from ids where chave = 'conta'), '{}'::jsonb, '{}'::jsonb)$$,
  '42501', 'target account already has another responsible seller', 'another member cannot open a sequence for the account');
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.create_sequence('91000000-0000-0000-0000-000000000001', (select valor from ids where chave = 'conta'), '{}'::jsonb, '{}'::jsonb)$$,
  '42501', 'target account already has another responsible seller', 'nor can the administrator');

-- O banco recusa a divergência mesmo por escrita direta: Workspace, Conta e responsável precisam concordar.
reset role;
select throws_ok(
  $$insert into public.sequences (workspace_id, target_account_id, owner_user_id)
    values ('91000000-0000-0000-0000-000000000001', (select valor from ids where chave = 'conta-sul'),
            '90000000-0000-0000-0000-000000000002')$$,
  '42501', 'the sequence owner must be the responsible seller of the target account',
  'a sequence cannot point to a target account of another Workspace');
select throws_ok(
  $$insert into public.sales_responsibilities (workspace_id, target_account_id, owner_user_id)
    values ('91000000-0000-0000-0000-000000000001', 'teste-real-2', '90000000-0000-0000-0000-000000000002')$$,
  '23503', null, 'a responsibility cannot be created for a loose text');
select throws_ok(
  $$insert into public.sales_responsibilities (workspace_id, target_account_id, owner_user_id)
    values ('91000000-0000-0000-0000-000000000001', (select valor from ids where chave = 'conta-sul'),
            '90000000-0000-0000-0000-000000000002')$$,
  '23503', null, 'a responsibility cannot point to a target account of another Workspace');
select throws_ok(
  $$insert into public.sequences (workspace_id, target_account_id, owner_user_id)
    values ('91000000-0000-0000-0000-000000000001', (select valor from ids where chave = 'conta'),
            '90000000-0000-0000-0000-000000000002')$$,
  '42501', 'the sequence owner must be the responsible seller of the target account',
  'a sequence cannot belong to someone other than the responsible seller');
select is((select count(*)::int from public.sequences where target_account_id = (select valor from ids where chave = 'conta')), 1,
  'the refused writes left a single sequence for the account');

-- 3. O documento privado e o destinatário são do titular; o Workspace vê a projeção segura (ADR-0008).
set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000002', true);
select is((select status || ' ' || (public_summary ? '_document')::text || ' ' || (public_summary ->> 'totalSteps')
    from public.sequences where id = (select valor::uuid from ids where chave = 'sequencia-ana')),
  'ativa false 1', 'another participant reads the status and counts, not the document');
select throws_ok(
  $$select * from public.get_owned_sequence((select valor::uuid from ids where chave = 'sequencia-ana'))$$,
  '42501', 'sequence not found or not owned by active user', 'another participant cannot open the owner document');
select throws_ok($$select count(*) from private.sequence_documents$$,
  '42501', 'permission denied for schema private', 'nor read the private documents directly');
select throws_ok($$select private.halt_sequence('00000000-0000-0000-0000-000000000000', 'account_deleted', null)$$,
  '42501', 'permission denied for schema private', 'signed-in users cannot call the archive and delete primitives');
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000005', true);
select is((select count(*)::int from public.sequences), 0, 'a participant of another Workspace sees no sequence');

-- 4. Ana ativa os envios com a Conta remetente dela.
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
insert into ids select 'tentativa-ana', attempt_id::text from public.create_sender_connection_attempt(
  '91000000-0000-0000-0000-000000000001', 'email', null);
reset role;
select public.complete_sender_connection_attempt(
  (select valor::uuid from ids where chave = 'tentativa-ana'), 'unipile-ana', 'GOOGLE', 'CREATION_SUCCESS');
select public.apply_unipile_sender_status('unipile-ana', 'SYNC_SUCCESS');
select pg_temp.relogio('2026-09-30 10:00-03');
set local role authenticated;
select is((select outcome from public.activate_sequence((select valor::uuid from ids where chave = 'sequencia-ana'))),
  'activated', 'the responsible seller activates the sequence with her own sender account');
reset role;
select is((pg_temp.envio((select valor::uuid from ids where chave = 'sequencia-ana'), 'passo-1')).status, 'scheduled',
  'the first step waits for its time');

-- 5. Ana sai da empresa: até a Transferência, o executor bloqueia o envio dela (owner_not_responsible).
set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000003', true);
select public.remove_participant('91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001');
reset role;
select is((select outcome from public.release_due_step_send(
    (pg_temp.envio((select valor::uuid from ids where chave = 'sequencia-ana'), 'passo-1')).id)),
  'owner_not_responsible', 'once the seller left, the executor blocks her send');
select is((select status from public.sequences where id = (select valor::uuid from ids where chave = 'sequencia-ana')), 'ativa',
  'her sequence stays as it was until the responsibility is transferred');

-- 6. A Transferência de responsabilidade encerra a Sequência do antigo responsável, no mesmo instante.
set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000003', true);
select lives_ok(
  $$select public.transfer_target_account_responsibility((select valor::uuid from ids where chave = 'conta'),
      '90000000-0000-0000-0000-000000000004', 'Ana saiu da empresa')$$,
  'the administrator transfers the target account to Diego');
select is((select status || ' ' || ended_reason || ' ' || (ended_at is not null)::text || ' ' || (public_summary ->> 'status')
    from public.sequences where id = (select valor::uuid from ids where chave = 'sequencia-ana')),
  'encerrada responsibility_transferred true encerrada', 'the previous owner sequence is ended and says so in the projection');
reset role;
select is((pg_temp.envio((select valor::uuid from ids where chave = 'sequencia-ana'), 'passo-1')).status, 'cancelled',
  'its pending step is cancelled');
select is((select revoked_reason from private.sequence_authorizations
    where sequence_id = (select valor::uuid from ids where chave = 'sequencia-ana')),
  'responsibility_transferred', 'its authorization is revoked');
select is((select count(*)::int from public.claim_due_step_sends(10)), 0, 'the executor has nothing to claim for it');
select is((select outcome from public.release_due_step_send(
    (pg_temp.envio((select valor::uuid from ids where chave = 'sequencia-ana'), 'passo-1')).id)),
  'owner_not_responsible', 'and no later release can send it');
select throws_ok(
  $$update public.sequences set status = 'ativa' where id = (select valor::uuid from ids where chave = 'sequencia-ana')$$,
  '55006', 'an ended sequence cannot be changed', 'an ended sequence is never reopened');
select is((select count(*)::int from private.sequence_documents
    where sequence_id = (select valor::uuid from ids where chave = 'sequencia-ana')), 1,
  'its private document is kept, for history');

-- 7. O novo responsável recomeça a Sequência da Conta, com o documento e as Contas remetentes dele.
set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000004', true);
select is((select status from public.sequences where id = (select valor::uuid from ids where chave = 'sequencia-ana')), 'encerrada',
  'the new owner sees the ended sequence in the shared projection');
select throws_ok(
  $$select * from public.get_owned_sequence((select valor::uuid from ids where chave = 'sequencia-ana'))$$,
  '42501', 'sequence not found or not owned by active user', 'but not the document, which stays with the previous owner');
select throws_ok(
  $$select public.update_owned_sequence((select valor::uuid from ids where chave = 'sequencia-ana'), '{}'::jsonb, null, 'ativa')$$,
  '42501', 'sequence not found or not owned by active user', 'and cannot take the ended sequence over');
insert into ids select 'sequencia-diego', id::text from public.create_sequence(
  '91000000-0000-0000-0000-000000000001', (select valor from ids where chave = 'conta'),
  jsonb_build_object('janelaPadrao', '{"de": "09:00", "ate": "18:00"}'::jsonb, 'steps', jsonb_build_array(
    jsonb_build_object('id', 'passo-1', 'canal', 'email', 'contatoId', (select valor from ids where chave = 'maria'),
      'delayDiasUteis', 0, 'titulo', 'Abertura', 'assunto', 'Oi de novo', 'corpo', 'Olá, Maria, aqui é o Diego.'),
    jsonb_build_object('id', 'passo-2', 'canal', 'email', 'contatoId', (select valor from ids where chave = 'maria'),
      'delayDiasUteis', 1, 'titulo', 'Follow-up', 'assunto', 'Re: Oi de novo', 'corpo', 'Alguma novidade?'))),
  '{"totalSteps": 2}'::jsonb);
select is((select count(*)::int || ' ' || count(*) filter (where status <> 'encerrada')::int
    from public.sequences where target_account_id = (select valor from ids where chave = 'conta')),
  '2 1', 'the account keeps the ended sequence as history and has one sequence in progress');
select is((select outcome from public.activate_sequence((select valor::uuid from ids where chave = 'sequencia-diego'))),
  'sender_not_ready', 'the sender account of the previous owner does not go with the account');

insert into ids select 'tentativa-diego', attempt_id::text from public.create_sender_connection_attempt(
  '91000000-0000-0000-0000-000000000001', 'email', null);
reset role;
select public.complete_sender_connection_attempt(
  (select valor::uuid from ids where chave = 'tentativa-diego'), 'unipile-diego', 'GOOGLE', 'CREATION_SUCCESS');
select public.apply_unipile_sender_status('unipile-diego', 'SYNC_SUCCESS');
set local role authenticated;
select is((select outcome from public.activate_sequence((select valor::uuid from ids where chave = 'sequencia-diego'))),
  'activated', 'with his own sender account, the new owner activates the sequence');
reset role;
select is((select string_agg(send_id::text, ',') from public.claim_due_step_sends(10)),
  (pg_temp.envio((select valor::uuid from ids where chave = 'sequencia-diego'), 'passo-1')).id::text,
  'the executor claims only the step of the new owner');
select is((select outcome || ' | ' || unipile_account_id || ' | ' || subject
    from public.release_due_step_send((pg_temp.envio((select valor::uuid from ids where chave = 'sequencia-diego'), 'passo-1')).id)),
  'released | unipile-diego | Oi de novo', 'it goes out through the sender account of Diego');

-- 8. Arquivar a Conta: pausa a Sequência, cancela o que não saiu e trava a retomada até restaurar.
select public.record_sequence_step_send_result(
  (pg_temp.envio((select valor::uuid from ids where chave = 'sequencia-diego'), 'passo-1')).id, 'sent', 'e-1', '<m1@x>', null);
select is((pg_temp.envio((select valor::uuid from ids where chave = 'sequencia-diego'), 'passo-2')).status, 'scheduled',
  'after the first send, the second step is scheduled');
select is(private.pause_sequences_of_archived_account(
    '91000000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'conta')), 1,
  'archiving the account pauses its sequence in progress');
select is((select status || ' ' || suspended_reason || ' ' || (public_summary ->> 'status')
    from public.sequences where id = (select valor::uuid from ids where chave = 'sequencia-diego')),
  'pausada account_archived pausada', 'the sequence is paused, with the account as the reason');
select is((pg_temp.envio((select valor::uuid from ids where chave = 'sequencia-diego'), 'passo-2')).status, 'cancelled',
  'the pending step is cancelled');
select is((pg_temp.envio((select valor::uuid from ids where chave = 'sequencia-diego'), 'passo-1')).status, 'sent',
  'the step that already went out stays as history');
select is((select revoked_reason from private.sequence_authorizations
    where sequence_id = (select valor::uuid from ids where chave = 'sequencia-diego')),
  'account_archived', 'the authorization is revoked');
select is((select count(*)::int from public.claim_due_step_sends(10)), 0, 'the executor claims nothing from an archived account');
select is((select outcome from public.release_due_step_send(
    (pg_temp.envio((select valor::uuid from ids where chave = 'sequencia-diego'), 'passo-2')).id)),
  'not_confirmed', 'a later release of the cancelled step is refused');
select is(private.pause_sequences_of_archived_account(
    '91000000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'conta')), 0,
  'archiving again changes nothing');

set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000004', true);
select throws_ok(
  $$select public.update_owned_sequence((select valor::uuid from ids where chave = 'sequencia-diego'), null, null, 'ativa')$$,
  '55006', 'the sequence is paused because its target account is archived', 'the owner cannot resume it while the account is archived');
select is((select outcome from public.activate_sequence((select valor::uuid from ids where chave = 'sequencia-diego'))),
  'sequence_not_active', 'nor authorize the sends again');
select lives_ok(
  $$select public.update_owned_sequence((select valor::uuid from ids where chave = 'sequencia-diego'),
      '{"steps": []}'::jsonb, null, null)$$,
  'the owner can still edit the document while the account is archived');
select throws_ok(
  $$select public.update_owned_sequence((select valor::uuid from ids where chave = 'sequencia-diego'), null, null, 'encerrada')$$,
  '42501', 'a sequence is ended only by the system', 'the owner cannot end a sequence through the API');
reset role;

-- Restaurar a Conta só destrava: retomar exige a confirmação explícita do responsável, e os envios, nova ativação.
select is(private.unblock_sequences_of_restored_account(
    '91000000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'conta')), 1,
  'restoring the account lifts the block');
select is((select status || ' ' || coalesce(suspended_reason, 'livre')
    from public.sequences where id = (select valor::uuid from ids where chave = 'sequencia-diego')),
  'pausada livre', 'but the sequence stays paused: nothing resumes on its own');
select is((select count(*)::int from public.claim_due_step_sends(10)), 0, 'and nothing is scheduled for the executor');
set local role authenticated;
select lives_ok(
  $$select public.update_owned_sequence((select valor::uuid from ids where chave = 'sequencia-diego'), null, null, 'ativa')$$,
  'the responsible seller resumes the sequence explicitly');
reset role;
select is((select count(*)::int from public.claim_due_step_sends(10)), 0,
  'resuming does not bring the cancelled steps back: the sends need a new activation');
set local role authenticated;
select public.update_owned_sequence((select valor::uuid from ids where chave = 'sequencia-diego'),
  jsonb_build_object('janelaPadrao', '{"de": "09:00", "ate": "18:00"}'::jsonb, 'steps', jsonb_build_array(
    jsonb_build_object('id', 'passo-1', 'canal', 'email', 'contatoId', (select valor from ids where chave = 'maria'),
      'delayDiasUteis', 0, 'titulo', 'Abertura', 'assunto', 'Oi de novo', 'corpo', 'Olá, Maria, aqui é o Diego.'),
    jsonb_build_object('id', 'passo-2', 'canal', 'email', 'contatoId', (select valor from ids where chave = 'maria'),
      'delayDiasUteis', 1, 'titulo', 'Follow-up', 'assunto', 'Re: Oi de novo', 'corpo', 'Alguma novidade?'),
    jsonb_build_object('id', 'passo-3', 'canal', 'email', 'contatoId', (select valor from ids where chave = 'maria'),
      'delayDiasUteis', 2, 'titulo', 'Encerramento', 'assunto', 'Última tentativa', 'corpo', 'Fico à disposição.'))),
  null, null);
select is((select outcome || ' v' || version from public.activate_sequence((select valor::uuid from ids where chave = 'sequencia-diego'))),
  'activated v2', 'a new activation authorizes the sends again');

-- 9. Apagar a Conta encerra a Sequência; o envio em voo terminou de sair, mas nada novo é programado.
reset role;
select pg_temp.relogio('2026-10-01 10:00-03');
select is((select string_agg(step_id, ',') from private.sequence_step_sends s
    join public.claim_due_step_sends(10) c on c.send_id = s.id),
  'passo-2', 'the executor claims the due step of the new authorization');
select is((select outcome from public.release_due_step_send((pg_temp.envio((select valor::uuid from ids where chave = 'sequencia-diego'), 'passo-2')).id)),
  'released', 'the step is in flight');
select is(private.end_sequences_of_deleted_account(
    '91000000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'conta')), 1,
  'deleting the account ends its sequence');
select is((select status || ' ' || ended_reason || ' ' || coalesce(suspended_reason, 'livre')
    from public.sequences where id = (select valor::uuid from ids where chave = 'sequencia-diego')),
  'encerrada account_deleted livre', 'the sequence is ended for good');
select is((pg_temp.envio((select valor::uuid from ids where chave = 'sequencia-diego'), 'passo-2')).status, 'sending',
  'the step already in flight is not cancelled');
select is((pg_temp.envio((select valor::uuid from ids where chave = 'sequencia-diego'), 'passo-3')).status, 'cancelled',
  'the pending step is cancelled');
select is(public.record_sequence_step_send_result(
  (pg_temp.envio((select valor::uuid from ids where chave = 'sequencia-diego'), 'passo-2')).id, 'sent', 'e-2', '<m2@x>', null),
  'sent', 'the provider result of the step in flight is still recorded');
select is((pg_temp.envio((select valor::uuid from ids where chave = 'sequencia-diego'), 'passo-3')).status, 'cancelled',
  'and no later step is scheduled after it');
select is((select count(*)::int from public.claim_due_step_sends(10)), 0, 'nothing is left for the executor');
select is((select outcome from public.release_due_step_send((pg_temp.envio((select valor::uuid from ids where chave = 'sequencia-diego'), 'passo-3')).id)),
  'not_confirmed', 'a later release is refused');
select is(private.end_sequences_of_deleted_account(
    '91000000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'conta')), 0,
  'ending again changes nothing');

-- 10. Um banco antigo pode ter linhas sem Conta real. A migration as deixa como estão; elas seguem lidas, mas não
-- se editam, e só a limpeza revisada por uma pessoa permite validar as chaves. Aqui se recria o estado antigo (as
-- chaves entram de novo pela mesma definição da migration) e se remove a linha órfã como a limpeza faria.
create temporary table definicoes on commit drop as
  select conname, conrelid::regclass::text as tabela, pg_get_constraintdef(oid) as definicao
  from pg_constraint where conname in ('sequences_target_account_fk', 'sales_responsibilities_target_account_fk');
alter table public.sequences drop constraint sequences_target_account_fk;
alter table public.sales_responsibilities drop constraint sales_responsibilities_target_account_fk;
insert into public.sales_responsibilities (workspace_id, target_account_id, owner_user_id)
values ('91000000-0000-0000-0000-000000000001', 'teste-real-antigo', '90000000-0000-0000-0000-000000000002');
insert into public.sequences (workspace_id, target_account_id, owner_user_id)
values ('91000000-0000-0000-0000-000000000001', 'teste-real-antigo', '90000000-0000-0000-0000-000000000002');
do $$
declare
  d record;
begin
  for d in select * from definicoes loop
    execute format('alter table %s add constraint %I %s', d.tabela, d.conname, d.definicao);
  end loop;
end
$$;

select is((select account_id::text from public.sequences where target_account_id = 'teste-real-antigo'), null,
  'a legacy row keeps its text and has no typed account');
select throws_ok(
  $$update public.sequences set status = 'pausada' where target_account_id = 'teste-real-antigo'$$,
  '23503', null, 'a legacy row is read-only until the cleanup');
select throws_ok(
  $$alter table public.sequences validate constraint sequences_target_account_fk$$,
  '23503', null, 'the key cannot be validated while a legacy row exists');

alter table public.sequences disable trigger sequences_no_delete;
alter table public.sales_responsibilities disable trigger sales_responsibilities_immutable;
delete from public.sequences where target_account_id = 'teste-real-antigo';
delete from public.sales_responsibilities where target_account_id = 'teste-real-antigo';
alter table public.sequences enable trigger sequences_no_delete;
alter table public.sales_responsibilities enable trigger sales_responsibilities_immutable;

select lives_ok($$alter table public.sales_responsibilities validate constraint sales_responsibilities_target_account_fk$$,
  'after the cleanup the responsibilities key validates');
select lives_ok($$alter table public.sequences validate constraint sequences_target_account_fk$$,
  'and so does the sequences key');
select is((select count(*)::int from pg_constraint
    where conname in ('sequences_target_account_fk', 'sales_responsibilities_target_account_fk') and convalidated), 2,
  'both keys are validated');

select * from finish();
rollback;

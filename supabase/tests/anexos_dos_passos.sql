begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(52);

-- Anexos persistentes e privados nos passos da Sequência (canais-10).

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

-- Workspace da empresa: a titular, um colega Membro e uma Administradora; e alguém de outro Workspace.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('a1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'titular@anexos.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('a1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'colega@anexos.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('a1000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'admin@anexos.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('a1000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'fora@outra.test', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('a2000000-0000-0000-0000-000000000001', 'empresa', 'Anexos'),
  ('a2000000-0000-0000-0000-000000000002', 'empresa', 'Outra');

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'member', true),
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'member', true),
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', 'admin', true),
  ('a2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000004', 'admin', true);

create temporary table ids (chave text primary key, valor text);
grant all on ids to authenticated, service_role;

create function pg_temp.i(p_chave text) returns uuid language sql as $f$
  select valor::uuid from ids where chave = p_chave;
$f$;

create function pg_temp.como(p_user text) returns void language sql as $f$
  select set_config('request.jwt.claim.role', 'authenticated', true), set_config('request.jwt.claim.sub', p_user, true);
$f$;

-- O documento: um E-mail com anexo (ou sem), um WhatsApp e um convite do LinkedIn.
create function pg_temp.documento(p_anexos_email jsonb default '[]'::jsonb, p_anexos_whats jsonb default '[]'::jsonb)
returns jsonb language sql as $f$
  select jsonb_build_object('participantesIds', '[]'::jsonb, 'janelaPadrao', '{"de": "09:00", "ate": "18:00"}'::jsonb,
    'steps', jsonb_build_array(
      jsonb_build_object('id', 'e1', 'canal', 'email', 'contatoId', (select valor from ids where chave = 'maria'),
        'delayDiasUteis', 0, 'titulo', 'Abertura', 'assunto', 'Oi', 'corpo', 'Olá, Maria.', 'anexos', p_anexos_email),
      jsonb_build_object('id', 'w1', 'canal', 'whatsapp', 'contatoId', (select valor from ids where chave = 'maria'),
        'delayDiasUteis', 1, 'titulo', 'Zap', 'corpo', 'Oi de novo.', 'anexos', p_anexos_whats),
      jsonb_build_object('id', 'l1', 'canal', 'linkedin', 'contatoId', (select valor from ids where chave = 'maria'),
        'delayDiasUteis', 1, 'titulo', 'Convite', 'corpo', 'Vamos nos conectar?', 'subtipoLinkedIn', 'convite')));
$f$;

grant execute on function pg_temp.relogio(timestamptz), pg_temp.envio(text), pg_temp.i(text), pg_temp.como(text),
  pg_temp.documento(jsonb, jsonb) to authenticated, service_role;

set local role authenticated;
select pg_temp.como('a1000000-0000-0000-0000-000000000001');
insert into ids select 'conta', id::text from public.save_target_account('a2000000-0000-0000-0000-000000000001', 'Empresa Anexo', 'https://anexo.test');
insert into ids select 'maria', id::text from public.create_contact(pg_temp.i('conta'), 'Maria Souza', 'Diretora', 'maria@anexo.test', '(11) 98888-7777');
insert into ids select 'seq', id::text from public.create_sequence('a2000000-0000-0000-0000-000000000001',
  (select valor from ids where chave = 'conta'), pg_temp.documento());
insert into ids select 'tentativa', attempt_id::text from public.create_sender_connection_attempt(
  'a2000000-0000-0000-0000-000000000001', 'email', null);
reset role;
set local role service_role;
select public.complete_sender_connection_attempt(pg_temp.i('tentativa'), 'unipile-anexos', 'GOOGLE', 'CREATION_SUCCESS');
select public.apply_unipile_sender_status('unipile-anexos', 'SYNC_SUCCESS');
reset role;

-- 1. O módulo nasce desligado: nada sobe e a tela não recebe limites.
set local role authenticated;
select pg_temp.como('a1000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.sequence_attachment_limits()), 0, 'switched off, no limits are offered');
select throws_ok($$select * from public.register_sequence_attachment(pg_temp.i('seq'), 'e1', 'print.png', 'image/png', 1000)$$,
  '0A000', 'sequence attachments are not enabled', 'switched off, nothing is uploaded');
reset role;
select is(private.set_sequence_attachments_enabled(true), true, 'the switch is turned on');
set local role authenticated;
select pg_temp.como('a1000000-0000-0000-0000-000000000001');
select is((select string_agg(channel || ':' || max_files, ',' order by channel) from public.sequence_attachment_limits()),
  'email:5,linkedin:1,whatsapp:1', 'switched on, the limits per channel are offered');

-- 2. A titular sobe um arquivo: ele fica ligado ao Workspace, a ela, à Sequência e ao passo, num caminho sem o nome.
insert into ids select 'anexo-1', attachment_id::text
  from public.register_sequence_attachment(pg_temp.i('seq'), 'e1', '../print da tela.png', 'image/png', 1000);
reset role;
select is((select workspace_id::text || ' ' || owner_user_id::text || ' ' || sequence_id::text || ' ' || step_id || ' ' || channel || ' ' || status
    from private.sequence_attachments where id = pg_temp.i('anexo-1')),
  'a2000000-0000-0000-0000-000000000001 a1000000-0000-0000-0000-000000000001 ' || pg_temp.i('seq')::text || ' e1 email pending',
  'the file belongs to the workspace, the owner, the sequence and the step');
select is((select storage_path from private.sequence_attachments where id = pg_temp.i('anexo-1')),
  'anexos/' || pg_temp.i('seq')::text || '/' || pg_temp.i('anexo-1')::text || '/arquivo',
  'the storage path never carries the original name');
select is((select file_name from private.sequence_attachments where id = pg_temp.i('anexo-1')), '.._print da tela.png',
  'the name keeps no path separator');

-- 3. Ninguém além da titular sobe, nem com o mesmo Workspace.
set local role authenticated;
select pg_temp.como('a1000000-0000-0000-0000-000000000002');
select throws_ok($$select * from public.register_sequence_attachment(pg_temp.i('seq'), 'e1', 'x.png', 'image/png', 10)$$,
  '42501', 'sequence not found or not owned by active user', 'a colleague cannot attach to the owner sequence');
select pg_temp.como('a1000000-0000-0000-0000-000000000003');
select throws_ok($$select * from public.register_sequence_attachment(pg_temp.i('seq'), 'e1', 'x.png', 'image/png', 10)$$,
  '42501', 'sequence not found or not owned by active user', 'neither can the administrator');
select pg_temp.como('a1000000-0000-0000-0000-000000000004');
select throws_ok($$select * from public.register_sequence_attachment(pg_temp.i('seq'), 'e1', 'x.png', 'image/png', 10)$$,
  '42501', 'sequence not found or not owned by active user', 'nor someone from another workspace');
reset role;
set local role anon;
select throws_ok($$select * from public.register_sequence_attachment(gen_random_uuid(), 'e1', 'x.png', 'image/png', 10)$$,
  '42501', 'permission denied for function register_sequence_attachment', 'anonymous callers cannot upload');
reset role;

-- 4. Formato, tamanho e quantidade valem pelo canal do passo.
set local role authenticated;
select pg_temp.como('a1000000-0000-0000-0000-000000000001');
select throws_ok($$select * from public.register_sequence_attachment(pg_temp.i('seq'), 'e1', 'a.pdf', 'application/pdf', 10)$$,
  '22023', 'attachment type not supported on this channel', 'a type outside the list is refused');
select throws_ok($$select * from public.register_sequence_attachment(pg_temp.i('seq'), 'e1', 'a.mp4', 'video/mp4', 10485761)$$,
  '22023', 'attachment too large for this channel', 'an e-mail attachment over 10 MB is refused');
select throws_ok($$select * from public.register_sequence_attachment(pg_temp.i('seq'), 'w1', 'a.gif', 'image/gif', 10)$$,
  '22023', 'attachment type not supported on this channel', 'WhatsApp takes no GIF');
select lives_ok($$select * from public.register_sequence_attachment(pg_temp.i('seq'), 'w1', 'v.mp4', 'video/mp4', 16777216)$$,
  'a 16 MB video fits a WhatsApp step');
select throws_ok($$select * from public.register_sequence_attachment(pg_temp.i('seq'), 'l1', 'a.png', 'image/png', 10)$$,
  '22023', 'attachments are not supported on a LinkedIn invitation', 'a LinkedIn invitation takes no attachment');
select throws_ok($$select * from public.register_sequence_attachment(pg_temp.i('seq'), 'zz', 'a.png', 'image/png', 10)$$,
  '22023', 'step not found', 'the step must exist in the saved document');
select throws_ok($$select * from public.register_sequence_attachment(pg_temp.i('seq'), 'e1', 'a.png', 'image/png', 0)$$,
  '22023', 'attachment too large for this channel', 'an empty file is refused');

-- 5. Só a titular abre, por um caminho que a Edge Function assina; antes de chegar ao bucket, nada abre.
select throws_ok($$select public.get_sequence_attachment_path(pg_temp.i('anexo-1'))$$,
  'P0002', 'attachment not stored', 'a file still uploading does not open');
select throws_ok($$select public.mark_sequence_attachment_stored(pg_temp.i('anexo-1'))$$,
  '42501', 'permission denied for function mark_sequence_attachment_stored', 'the browser cannot mark a file as stored');
reset role;
set local role service_role;
select is(public.mark_sequence_attachment_stored(pg_temp.i('anexo-1')), true, 'the Edge Function marks the file stored');
reset role;
set local role authenticated;
select pg_temp.como('a1000000-0000-0000-0000-000000000001');
select is(public.get_sequence_attachment_path(pg_temp.i('anexo-1')),
  'anexos/' || pg_temp.i('seq')::text || '/' || pg_temp.i('anexo-1')::text || '/arquivo', 'the owner gets the path to sign');
select pg_temp.como('a1000000-0000-0000-0000-000000000002');
select throws_ok($$select public.get_sequence_attachment_path(pg_temp.i('anexo-1'))$$,
  '42501', 'attachment not found or not owned by active user', 'a colleague never gets the path');
select pg_temp.como('a1000000-0000-0000-0000-000000000003');
select throws_ok($$select public.get_sequence_attachment_path(pg_temp.i('anexo-1'))$$,
  '42501', 'attachment not found or not owned by active user', 'neither does the administrator');
select pg_temp.como('a1000000-0000-0000-0000-000000000004');
select throws_ok($$select public.get_sequence_attachment_path(pg_temp.i('anexo-1'))$$,
  '42501', 'attachment not found or not owned by active user', 'nor another workspace');
select throws_ok($$select count(*) from private.sequence_attachments$$, '42501',
  'permission denied for schema private', 'the table itself is out of reach');
reset role;

-- 6. O anexo entra no documento e persiste: lido de novo (outra sessão), o passo ainda aponta para o arquivo.
set local role authenticated;
select pg_temp.como('a1000000-0000-0000-0000-000000000001');
select lives_ok($$select public.update_owned_sequence(pg_temp.i('seq'),
    pg_temp.documento(jsonb_build_array(jsonb_build_object('id', (select valor from ids where chave = 'anexo-1'), 'tipo', 'imagem', 'nome', 'print.png'))),
    null, null)$$, 'the owner saves the step with the attachment id');
select is((select public_summary #>> '{_document,steps,0,anexos,0,id}' from public.get_owned_sequence(pg_temp.i('seq'))),
  (select valor from ids where chave = 'anexo-1'), 'the saved document keeps the attachment between sessions');
-- O WhatsApp aceita um arquivo só: o do passo já salvo conta.
select lives_ok($$select public.update_owned_sequence(pg_temp.i('seq'),
    pg_temp.documento(
      jsonb_build_array(jsonb_build_object('id', (select valor from ids where chave = 'anexo-1'), 'tipo', 'imagem', 'nome', 'print.png')),
      '[{"id": "00000000-0000-0000-0000-0000000000aa", "tipo": "video", "nome": "v.mp4"}]'::jsonb),
    null, null)$$, 'the owner saves a WhatsApp step pointing to some file');
select throws_ok($$select * from public.register_sequence_attachment(pg_temp.i('seq'), 'w1', 'b.mp4', 'video/mp4', 10)$$,
  '22023', 'too many attachments on this step', 'a second file on a WhatsApp step is refused');

-- 7. A ativação confere cada anexo pelo canal do passo: um id que não é arquivo guardado desta Sequência barra.
select pg_temp.relogio('2026-10-05 10:00-03');
select lives_ok($$select public.update_owned_sequence(pg_temp.i('seq'),
    pg_temp.documento(jsonb_build_array(
      jsonb_build_object('id', (select valor from ids where chave = 'anexo-1'), 'tipo', 'imagem', 'nome', 'print.png'),
      jsonb_build_object('id', '00000000-0000-0000-0000-0000000000cc', 'tipo', 'imagem', 'nome', 'nunca.png'))),
    null, null)$$, 'the owner saves an e-mail step pointing to a file that was never stored');
select is((select outcome || ' ' || step_id from public.activate_sequence(pg_temp.i('seq'))), 'attachment_not_stored e1',
  'an attachment that was never stored blocks the activation of its step');
select lives_ok($$select public.update_owned_sequence(pg_temp.i('seq'),
    pg_temp.documento(jsonb_build_array(jsonb_build_object('id', (select valor from ids where chave = 'anexo-1'), 'tipo', 'imagem', 'nome', 'print.png'))),
    null, null)$$, 'the owner drops the bad attachment');
select is((select outcome || ' ' || step_id from public.activate_sequence(pg_temp.i('seq'))), 'activated e1',
  'with valid attachments the sequence is activated');

-- 8. Trocar o anexo de um passo pendente revoga a ativação, como trocar o texto.
reset role;
insert into private.sequence_attachments (id, workspace_id, sequence_id, owner_user_id, step_id, channel, file_name,
  mime_type, size_bytes, storage_path, status)
values ('00000000-0000-0000-0000-0000000000bb', 'a2000000-0000-0000-0000-000000000001', pg_temp.i('seq'),
  'a1000000-0000-0000-0000-000000000001', 'e1', 'email', 'outra.png', 'image/png', 500, 'anexos/x/bb/arquivo', 'stored');
set local role authenticated;
select pg_temp.como('a1000000-0000-0000-0000-000000000001');
select lives_ok($$select public.update_owned_sequence(pg_temp.i('seq'),
    pg_temp.documento('[{"id": "00000000-0000-0000-0000-0000000000bb", "tipo": "imagem", "nome": "outra.png"}]'::jsonb),
    null, null)$$, 'the owner swaps the attachment of the pending step');
select is((select active::text || ' ' || revoked_reason from public.get_sequence_authorization(pg_temp.i('seq'))), 'false edited',
  'swapping the file revokes the authorization');
select lives_ok($$select public.update_owned_sequence(pg_temp.i('seq'),
    pg_temp.documento(jsonb_build_array(jsonb_build_object('id', (select valor from ids where chave = 'anexo-1'), 'tipo', 'imagem', 'nome', 'print.png'))),
    null, null)$$, 'and puts the first one back');
select is((select outcome || ' ' || step_id from public.activate_sequence(pg_temp.i('seq'))), 'activated e1',
  'activating again authorizes the current file');
reset role;

-- 9. No envio, o Executor recebe os arquivos da versão autorizada, e só com o Envio em voo.
set local role service_role;
select is((select problem from public.step_send_attachments((pg_temp.envio('e1')).id)), 'send_not_in_flight',
  'before the release nothing is handed over');
select is((select count(*)::int from public.claim_due_step_sends(10)), 1, 'the e-mail step is due');
select is((select outcome from public.release_due_step_send((pg_temp.envio('e1')).id)), 'released', 'the step is released');
select is((select string_agg(coalesce(problem, 'ok') || ' ' || mime_type || ' ' || size_bytes || ' ' || file_name, ',')
    from public.step_send_attachments((pg_temp.envio('e1')).id)),
  'ok image/png 1000 .._print da tela.png', 'the executor gets the stored file of the authorized step');
reset role;
set local role authenticated;
select throws_ok($$select * from public.step_send_attachments(gen_random_uuid())$$, '42501',
  'permission denied for function step_send_attachments', 'the browser cannot ask for the files of a send');
reset role;

-- 10. Um arquivo que deixou de servir ao canal não sai e não conta como enviado; o Envio falha com o motivo, sem nova
-- tentativa, e o resto do Executor segue.
update private.sequence_attachments set mime_type = 'application/pdf' where id = pg_temp.i('anexo-1');
set local role service_role;
select is((select problem from public.step_send_attachments((pg_temp.envio('e1')).id)), 'attachment_type_not_supported',
  'a type the channel does not take is reported');
select is(public.fail_step_send_for_attachment((pg_temp.envio('e1')).id, 'attachment_type_not_supported'), 'failed',
  'the send fails with the reason');
reset role;
select is((pg_temp.envio('e1')).status || ' ' || (pg_temp.envio('e1')).last_error || ' ' || ((pg_temp.envio('e1')).sent_at is null),
  'failed attachment_type_not_supported true', 'it is not marked as sent');
set local role service_role;
select is((select count(*)::int from public.claim_due_step_sends(10)), 0, 'and it is not retried');
select throws_ok($$select public.fail_step_send_for_attachment((pg_temp.envio('e1')).id, 'attachment_type_not_supported')$$,
  '55000', 'send is not in flight', 'only a send in flight can fail this way');
select throws_ok($$select public.fail_step_send_for_attachment((pg_temp.envio('e1')).id, 'qualquer coisa')$$,
  '22023', 'unknown attachment problem', 'the reason is a known code, never free text');
reset role;

-- 11. Apagar o registro manda o arquivo para a fila do Storage; apagar a Conta (documento esvaziado) apaga os anexos.
delete from private.sequence_attachments where id = '00000000-0000-0000-0000-0000000000bb';
select is((select count(*)::int from private.storage_purge_queue
    where bucket = 'sequence-attachments' and prefix = 'anexos/' || pg_temp.i('seq')::text || '/00000000-0000-0000-0000-0000000000bb/'),
  2, 'a removed file is queued for deletion from storage, in two passes');
update private.sequence_documents set document = '{}'::jsonb where sequence_id = pg_temp.i('seq');
select is((select count(*)::int from private.sequence_attachments where sequence_id = pg_temp.i('seq')), 0,
  'erasing the document erases its attachments');
select is((select count(*)::int from private.storage_purge_queue where bucket = 'sequence-attachments'), 6,
  'and every one of them is queued for deletion');

select * from finish();
rollback;

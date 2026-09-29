begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(164);

-- Procura, em toda tabela de public e de private, uma linha que contenha algum dos trechos (sem diferenciar maiúsculas):
-- devolve as tabelas e as quantidades, ou '' quando nada vazou. Roda como dono do banco.
create function pg_temp.vazamentos(p_trechos text[]) returns text language plpgsql as $f$
declare
  v_tabela record;
  v_qtd bigint;
  v_achados text := '';
begin
  for v_tabela in
    select n.nspname, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r' and n.nspname in ('public', 'private') order by 1, 2
  loop
    execute format('select count(*) from %I.%I t where t::text ilike any (%L::text[])', v_tabela.nspname, v_tabela.relname, p_trechos)
      into v_qtd;
    if v_qtd > 0 then
      v_achados := v_achados || v_tabela.nspname || '.' || v_tabela.relname || ':' || v_qtd || ' ';
    end if;
  end loop;
  return btrim(v_achados);
end
$f$;

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

-- Workspace Norte: Ana (Membro, Vendedora responsável por Alfa e Beta), Bruno (Membro, responsável por Gama), Carla
-- (Administradora) e Diego (Membro sem Conta). Eva administra o Workspace Sul.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('b1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('b1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('b1000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('b1000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'diego@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('b1000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'eva@sul.com.br', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('b2000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('b2000000-0000-0000-0000-000000000002', 'empresa', 'Sul');

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'member', true),
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'member', true),
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 'admin', true),
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000004', 'member', true),
  ('b2000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000005', 'admin', true);

create temporary table ids (chave text primary key, valor text);
grant all on ids to authenticated, service_role;

-- 1. Cadastro. Ana: Alfa (Maria, João), Beta (Paula e o João, que atua nas duas). Bruno: Gama. Eva: Sul.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000001', true);
insert into ids select 'alfa', id::text from public.save_target_account(
  'b2000000-0000-0000-0000-000000000001', 'Alfa Distribuidora', 'https://alfa-distribuidora.test',
  '12.345.678/0001-90', 'https://www.linkedin.com/company/alfa-distribuidora', 'Atacado alfa');
insert into ids select 'beta', id::text from public.save_target_account(
  'b2000000-0000-0000-0000-000000000001', 'Beta Industrial', 'https://beta-industrial.test');
insert into ids select 'maria', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'alfa'), 'Maria Souza Peixoto', 'Diretora',
  'maria.peixoto@alfa-distribuidora.test', '+5511987654321', 'https://www.linkedin.com/in/maria-peixoto-alfa');
insert into ids select 'joao', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'alfa'), 'João Lima', 'Comprador', 'joao.lima@compartilhado.test');
select public.link_contact((select valor::uuid from ids where chave = 'joao'), (select valor::uuid from ids where chave = 'beta'));
insert into ids select 'paula', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'beta'), 'Paula Rezende Nogueira', 'Gerente',
  'paula.nogueira@beta-industrial.test', '+5511955550001', 'https://www.linkedin.com/in/paula-nogueira');
select public.register_account_interaction((select valor::uuid from ids where chave = 'alfa'), 'ligacao', null,
  (select valor::uuid from ids where chave = 'maria'));
select public.register_account_interaction((select valor::uuid from ids where chave = 'alfa'), 'reuniao', null,
  (select valor::uuid from ids where chave = 'joao'));
select public.register_account_interaction((select valor::uuid from ids where chave = 'beta'), 'ligacao', null,
  (select valor::uuid from ids where chave = 'paula'));

select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000002', true);
insert into ids select 'gama', id::text from public.save_target_account(
  'b2000000-0000-0000-0000-000000000001', 'Gama Logística', 'https://gama-logistica.test');
insert into ids select 'gil', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'gama'), 'Gil Torres', 'Analista', 'gil.torres@gama-logistica.test');
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000005', true);
insert into ids select 'sul', id::text from public.save_target_account(
  'b2000000-0000-0000-0000-000000000002', 'Sul S.A.', 'https://sul-sa.test');
insert into ids select 'sara', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'sul'), 'Sara Sul', 'CFO', 'sara@sul-sa.test');

-- As Sequências de Ana: uma na Alfa (Maria, João, Maria) e outra na Beta (Paula, João, Paula).
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000001', true);
insert into ids select 'seq-alfa', id::text from public.create_sequence(
  'b2000000-0000-0000-0000-000000000001', (select valor from ids where chave = 'alfa'),
  jsonb_build_object(
    'participantesIds', jsonb_build_array((select valor from ids where chave = 'maria'), (select valor from ids where chave = 'joao')),
    'steps', jsonb_build_array(
      jsonb_build_object('id', 'passo-1', 'ordem', 1, 'canal', 'email', 'contatoId', (select valor from ids where chave = 'maria'),
        'delayDiasUteis', 0, 'titulo', 'Abertura', 'assunto', 'Apresentação', 'corpo', 'Olá, Maria Souza.'),
      jsonb_build_object('id', 'passo-2', 'ordem', 2, 'canal', 'email', 'contatoId', (select valor from ids where chave = 'joao'),
        'delayDiasUteis', 1, 'titulo', 'Comprador', 'assunto', 'Cotação', 'corpo', 'Olá, João.'),
      jsonb_build_object('id', 'passo-3', 'ordem', 3, 'canal', 'email', 'contatoId', (select valor from ids where chave = 'maria'),
        'delayDiasUteis', 2, 'titulo', 'Follow-up', 'assunto', 'Re: Apresentação', 'corpo', 'Seguindo, Maria.'))),
  '{"totalSteps": 3, "totalParticipantes": 2}'::jsonb);
insert into ids select 'seq-beta', id::text from public.create_sequence(
  'b2000000-0000-0000-0000-000000000001', (select valor from ids where chave = 'beta'),
  jsonb_build_object(
    'participantesIds', jsonb_build_array((select valor from ids where chave = 'paula'), (select valor from ids where chave = 'joao')),
    'steps', jsonb_build_array(
      jsonb_build_object('id', 'passo-1', 'ordem', 1, 'canal', 'email', 'contatoId', (select valor from ids where chave = 'paula'),
        'delayDiasUteis', 0, 'titulo', 'Abertura', 'assunto', 'Visita', 'corpo', 'Olá, Paula Rezende.'),
      jsonb_build_object('id', 'passo-2', 'ordem', 2, 'canal', 'email', 'contatoId', (select valor from ids where chave = 'joao'),
        'delayDiasUteis', 1, 'titulo', 'Comprador', 'assunto', 'Cotação', 'corpo', 'Olá, João.'),
      jsonb_build_object('id', 'passo-3', 'ordem', 3, 'canal', 'email', 'contatoId', (select valor from ids where chave = 'paula'),
        'delayDiasUteis', 2, 'titulo', 'Follow-up', 'assunto', 'Re: Visita', 'corpo', 'Seguindo, Paula.'))),
  '{"totalSteps": 3, "totalParticipantes": 2}'::jsonb);
insert into ids select 'tentativa', attempt_id::text from public.create_sender_connection_attempt(
  'b2000000-0000-0000-0000-000000000001', 'email', null);
reset role;
set local role service_role;
select public.complete_sender_connection_attempt(
  (select valor::uuid from ids where chave = 'tentativa'), 'unipile-google-9', 'GOOGLE', 'CREATION_SUCCESS');
select public.apply_unipile_sender_status('unipile-google-9', 'SYNC_SUCCESS');
reset role;

-- 2. Arquivar a Conta-alvo: o Vendedor responsável ou um Administrador, e só no Workspace dela.
-- Ana ativa os envios da Alfa antes, para haver autorização e passos pendentes a pausar.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000001', true);
select is((select outcome from public.activate_sequence((select valor::uuid from ids where chave = 'seq-alfa'))),
  'activated', 'the responsible seller activates the Alfa sequence');
reset role;
select is((select count(*)::int from private.sequence_step_sends where sequence_id = (select valor::uuid from ids where chave = 'seq-alfa')
    and status in ('scheduled', 'waiting')), 3, 'the Alfa sequence has pending steps and an active authorization');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000004', true);
select throws_ok(
  $$select public.archive_target_account((select valor::uuid from ids where chave = 'alfa'))$$,
  '42501', 'only the responsible seller or an administrator can archive this target account',
  'a member who does not hold the target account cannot archive it');
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.archive_target_account((select valor::uuid from ids where chave = 'alfa'))$$,
  '42501', 'only the responsible seller or an administrator can archive this target account',
  'nor the seller of another target account');
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000005', true);
select throws_ok(
  $$select public.archive_target_account((select valor::uuid from ids where chave = 'alfa'))$$,
  'P0002', 'target account not found', 'a participant of another Workspace gets the answer of a target account that does not exist');
select throws_ok(
  $$select public.archive_target_account('dddddddd-0000-0000-0000-000000000009')$$,
  'P0002', 'target account not found', 'the same for a UUID that does not exist');

select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000001', true);
select is((public.archive_target_account((select valor::uuid from ids where chave = 'alfa')))::text,
  '{"result": "archived", "sequences_paused": 1}', 'the responsible seller archives the target account and the sequence is paused');
select is((select archived_by::text from public.target_accounts where id = (select valor::uuid from ids where chave = 'alfa')),
  'b1000000-0000-0000-0000-000000000001', 'the archive records who did it');
reset role;
select is((select status || ' ' || suspended_reason || ' ' || (public_summary ->> 'status') from public.sequences
    where id = (select valor::uuid from ids where chave = 'seq-alfa')),
  'pausada account_archived pausada', 'the Alfa sequence is paused by the account');
select is((select count(*)::int from private.sequence_authorizations
    where sequence_id = (select valor::uuid from ids where chave = 'seq-alfa') and revoked_at is null), 0,
  'the authorization was revoked');
select is((select string_agg(distinct status, ',') from private.sequence_step_sends
    where sequence_id = (select valor::uuid from ids where chave = 'seq-alfa')), 'cancelled', 'the pending steps were cancelled');
select is((select count(*)::int from private.data_lifecycle_events where action = 'archive' and subject_kind = 'account'
    and subject_id = (select valor::uuid from ids where chave = 'alfa')), 1, 'the archive is audited once');

-- Uma repetição, de quem for, não muda nada e não duplica a auditoria.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000003', true);
select is((public.archive_target_account((select valor::uuid from ids where chave = 'alfa')))::text,
  '{"result": "already_archived"}', 'archiving again is a no-op, also for the administrator');
select is((select archived_by::text from public.target_accounts where id = (select valor::uuid from ids where chave = 'alfa')),
  'b1000000-0000-0000-0000-000000000001', 'the repetition keeps the original author');
reset role;
select is((select count(*)::int from private.data_lifecycle_events where action = 'archive' and subject_kind = 'account'
    and subject_id = (select valor::uuid from ids where chave = 'alfa')), 1, 'and does not duplicate the audit');

-- Arquivada, a Conta sai da operação: nada de Interação manual, Contato, Vínculo nem Sequência nova; o titular não
-- retoma a Sequência.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000001', true);
select is((select archived_at is not null from public.target_accounts where id = (select valor::uuid from ids where chave = 'alfa')),
  true, 'the archived target account is still readable, so the archived list can show it');
select throws_ok(
  $$select public.register_account_interaction((select valor::uuid from ids where chave = 'alfa'), 'ligacao')$$,
  '55006', 'the target account is archived', 'no manual Interação on an archived target account');
select throws_ok(
  $$select public.create_contact((select valor::uuid from ids where chave = 'alfa'), 'Novo Contato')$$,
  '55006', 'the target account is archived', 'no new Contato in an archived target account');
select throws_ok(
  $$select public.link_contact((select valor::uuid from ids where chave = 'paula'), (select valor::uuid from ids where chave = 'alfa'))$$,
  '55006', 'the target account is archived', 'no new Vínculo with an archived target account');
select throws_ok(
  $$select public.update_owned_sequence((select valor::uuid from ids where chave = 'seq-alfa'), null, null, 'ativa')$$,
  '55006', 'the sequence is paused because its target account is archived', 'the owner cannot resume the sequence');
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000002', true);
select is((public.archive_target_account((select valor::uuid from ids where chave = 'gama')))::text,
  '{"result": "archived", "sequences_paused": 0}', 'archiving a target account without a sequence pauses nothing');
select throws_ok(
  $$select public.create_sequence('b2000000-0000-0000-0000-000000000001', (select valor from ids where chave = 'gama'), '{}'::jsonb, '{}'::jsonb)$$,
  '55006', 'the target account is archived', 'no new sequence for an archived target account');
select is((public.restore_target_account((select valor::uuid from ids where chave = 'gama')))::text,
  '{"result": "restored", "sequences_unblocked": 0}', 'the archived Gama comes back');

-- Restaurar: só quem pode arquivar; a Sequência só é destravada, nunca retomada.
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000004', true);
select throws_ok(
  $$select public.restore_target_account((select valor::uuid from ids where chave = 'alfa'))$$,
  '42501', 'only the responsible seller or an administrator can restore this target account',
  'a member who does not hold the target account cannot restore it');
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000001', true);
select is((public.restore_target_account((select valor::uuid from ids where chave = 'alfa')))::text,
  '{"result": "restored", "sequences_unblocked": 1}', 'the responsible seller restores the target account');
select is((select archived_at is null and archived_by is null from public.target_accounts where id = (select valor::uuid from ids where chave = 'alfa')),
  true, 'restored, it is out of the archive');
select is((select status || ' ' || coalesce(suspended_reason, 'livre') from public.sequences where id = (select valor::uuid from ids where chave = 'seq-alfa')),
  'pausada livre', 'restoring only unlocks the sequence: it stays paused until the owner resumes it');
reset role;
select is((select count(*)::int from private.sequence_authorizations
    where sequence_id = (select valor::uuid from ids where chave = 'seq-alfa') and revoked_at is null), 0,
  'and the sends stay off until a new activation');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000001', true);
select is((public.restore_target_account((select valor::uuid from ids where chave = 'alfa')))::text,
  '{"result": "not_archived"}', 'restoring twice is a no-op');
select lives_ok(
  $$select public.register_account_interaction((select valor::uuid from ids where chave = 'alfa'), 'ligacao')$$,
  'restored, the target account takes new Interações again');
select lives_ok(
  $$select public.update_owned_sequence((select valor::uuid from ids where chave = 'seq-alfa'), null, null, 'ativa')$$,
  'and the owner resumes the sequence by her own choice');
reset role;
select is((select count(*)::int from private.data_lifecycle_events where action in ('archive', 'restore') and subject_kind = 'account'), 4,
  'archive and restore were audited (Alfa twice, Gama twice), the no-ops were not');

-- 3. Arquivar o Contato: o Administrador, ou o Vendedor responsável por todas as Contas em que ele atua.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.archive_contact((select valor::uuid from ids where chave = 'joao'))$$,
  '42501', 'only the responsible seller or an administrator can archive this contact',
  'a seller who does not hold the target accounts of the contact cannot archive it');
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000005', true);
select throws_ok(
  $$select public.archive_contact((select valor::uuid from ids where chave = 'joao'))$$,
  'P0002', 'contact not found', 'a participant of another Workspace does not find the Contato');
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000001', true);
select is((public.archive_contact((select valor::uuid from ids where chave = 'joao')))::text,
  '{"result": "archived", "links_ended": 2}', 'the seller of both target accounts archives João');
select is((select count(*)::int from public.target_contacts where id = (select valor::uuid from ids where chave = 'joao')), 0,
  'the archived Contato is out of the default lists');
select is((select archived_at is not null from public.contacts where id = (select valor::uuid from ids where chave = 'joao')), true,
  'but the Contato row stays for the archived list');
select is((select count(*)::int from public.contact_account_links
    where contact_id = (select valor::uuid from ids where chave = 'joao') and ended_reason = 'contact_archived'), 2,
  'the links ended by the archive are marked, so the restore knows which ones to reopen');
select throws_ok(
  $$select public.link_contact((select valor::uuid from ids where chave = 'joao'), (select valor::uuid from ids where chave = 'beta'))$$,
  '55006', 'the contact is archived', 'an archived Contato takes no new Vínculo');
select is((public.archive_contact((select valor::uuid from ids where chave = 'joao')))::text,
  '{"result": "already_archived"}', 'archiving twice is a no-op');
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000004', true);
select throws_ok(
  $$select public.restore_contact((select valor::uuid from ids where chave = 'joao'))$$,
  '42501', 'only the responsible seller or an administrator can restore this contact',
  'a member who does not hold the target accounts cannot restore the Contato');
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000003', true);
select is((public.restore_contact((select valor::uuid from ids where chave = 'joao')))::text,
  '{"result": "restored", "links_reopened": 2}', 'the administrator restores João, with both links back');
select is((select count(*)::int from public.target_contacts where id = (select valor::uuid from ids where chave = 'joao')), 2,
  'João is in both target accounts again');
select is((select count(*)::int from public.contact_account_links
    where contact_id = (select valor::uuid from ids where chave = 'joao') and ended_reason is not null), 0,
  'the marker was used up: a later archive reopens only what it ends itself');
select is((select count(*)::int from public.contact_account_links where contact_id = (select valor::uuid from ids where chave = 'joao')), 4,
  'the history keeps the two ended links and the two new ones');
select is((public.restore_contact((select valor::uuid from ids where chave = 'joao')))::text,
  '{"result": "not_archived"}', 'restoring twice is a no-op');
reset role;


-- 4. Dados pessoais espalhados: Envios em todos os estados, resposta com anexo, cópia antiga do Contato e foto.
-- Alfa: passo 1 enviado (Maria), passo 2 em voo (João), passo 3 confirmado (Maria), depois a resposta da Maria.
-- Beta: passo 1 enviado (Paula), passo 2 confirmado (João), passo 3 confirmado (Paula), depois a resposta da Paula.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000001', true);
insert into ids select 'alfa-envio-1', id::text from public.confirm_sequence_step((select valor::uuid from ids where chave = 'seq-alfa'), 'passo-1');
insert into ids select 'alfa-envio-2', id::text from public.confirm_sequence_step((select valor::uuid from ids where chave = 'seq-alfa'), 'passo-2');
insert into ids select 'alfa-envio-3', id::text from public.confirm_sequence_step((select valor::uuid from ids where chave = 'seq-alfa'), 'passo-3');
insert into ids select 'beta-envio-1', id::text from public.confirm_sequence_step((select valor::uuid from ids where chave = 'seq-beta'), 'passo-1');
insert into ids select 'beta-envio-2', id::text from public.confirm_sequence_step((select valor::uuid from ids where chave = 'seq-beta'), 'passo-2');
insert into ids select 'beta-envio-3', id::text from public.confirm_sequence_step((select valor::uuid from ids where chave = 'seq-beta'), 'passo-3');
reset role;
set local role service_role;
select is((select outcome from public.release_sequence_step_send((select valor::uuid from ids where chave = 'alfa-envio-1'), 'b1000000-0000-0000-0000-000000000001')),
  'released', 'Alfa step 1 is released');
select is(public.record_sequence_step_send_result((select valor::uuid from ids where chave = 'alfa-envio-1'), 'sent', 'alfa-e1', '<msg-alfa-1@mail.test>', null),
  'sent', 'Alfa step 1 is accepted by the provider');
select is((select outcome from public.release_sequence_step_send((select valor::uuid from ids where chave = 'alfa-envio-2'), 'b1000000-0000-0000-0000-000000000001')),
  'released', 'Alfa step 2 is released and stays in flight');
select is((select outcome from public.release_sequence_step_send((select valor::uuid from ids where chave = 'beta-envio-1'), 'b1000000-0000-0000-0000-000000000001')),
  'released', 'Beta step 1 is released');
select is(public.record_sequence_step_send_result((select valor::uuid from ids where chave = 'beta-envio-1'), 'sent', 'beta-e1', '<msg-beta-1@mail.test>', null),
  'sent', 'Beta step 1 is accepted by the provider');
select is((select outcome from public.ingest_unipile_email_event('evt-a1', 'email.new', 'unipile-google-9',
  pg_temp.email('alfa-e1', 'thread-a1', 'althius.relacionamento@gmail.com', 'Apresentação', p_message_id => '<msg-alfa-1@mail.test>'),
  array['althius.relacionamento@gmail.com'])), 'echo', 'the Alfa echo stores the conversation');
select is((select outcome from public.ingest_unipile_email_event('evt-b1', 'email.new', 'unipile-google-9',
  pg_temp.email('beta-e1', 'thread-b1', 'althius.relacionamento@gmail.com', 'Visita', p_message_id => '<msg-beta-1@mail.test>'),
  array['althius.relacionamento@gmail.com'])), 'echo', 'the Beta echo stores the conversation');
create temporary table resposta_alfa as select * from public.ingest_unipile_email_event(
  'evt-a2', 'email.new', 'unipile-google-9',
  pg_temp.email('alfa-r1', 'thread-a1', 'maria.peixoto@alfa-distribuidora.test', 'Re: Apresentação',
    p_attachments => jsonb_build_array(jsonb_build_object('id', 'att-1', 'name', 'proposta-alfa.pdf', 'mime', 'application/pdf', 'size', 10))),
  array['althius.relacionamento@gmail.com']);
create temporary table resposta_beta as select * from public.ingest_unipile_email_event(
  'evt-b2', 'email.new', 'unipile-google-9',
  pg_temp.email('beta-r1', 'thread-b1', 'paula.nogueira@beta-industrial.test', 'Re: Visita',
    p_attachments => jsonb_build_array(jsonb_build_object('id', 'att-2', 'name', 'contrato-beta.pdf', 'mime', 'application/pdf', 'size', 10))),
  array['althius.relacionamento@gmail.com']);
select is((select outcome from resposta_alfa) || ' ' || (select outcome from resposta_beta), 'reply reply',
  'the contacts replied in both conversations');
select is(public.record_received_email_attachment((select interaction_id from resposta_alfa), 'att-1',
  'recebidos/' || (select interaction_id from resposta_alfa) || '/att-1/proposta-alfa.pdf', 'stored'), true,
  'the Alfa attachment is stored');
select is(public.record_received_email_attachment((select interaction_id from resposta_beta), 'att-2',
  'recebidos/' || (select interaction_id from resposta_beta) || '/att-2/contrato-beta.pdf', 'stored'), true,
  'the Beta attachment is stored');
reset role;

-- A cópia antiga dos Contatos (canais-02), a foto e as consultas de foto.
insert into private.target_contacts_canais02 (id, workspace_id, target_account_id, name, role, email, whatsapp, linkedin_identity)
values
  ('legado-maria', 'b2000000-0000-0000-0000-000000000001', (select valor from ids where chave = 'alfa'), 'Maria Souza Peixoto',
    'Diretora', 'maria.peixoto@alfa-distribuidora.test', '+5511987654321', null),
  ('legado-alfa-2', 'b2000000-0000-0000-0000-000000000001', (select valor from ids where chave = 'alfa'), 'Legado Alfa', null, null, null, null),
  ('legado-paula', 'b2000000-0000-0000-0000-000000000001', (select valor from ids where chave = 'beta'), 'Paula Nogueira', null,
    'paula.nogueira@beta-industrial.test', null, null);
insert into private.contact_photo_lookups (workspace_id, contact_id, outcome) values
  ('b2000000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'maria'), 'found'),
  ('b2000000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'paula'), 'found');
insert into public.contact_photos (contact_id, workspace_id, status, photo_url, linkedin_url, observed_at) values
  ((select valor::uuid from ids where chave = 'maria'), 'b2000000-0000-0000-0000-000000000001', 'found',
    'https://media.licdn.com/maria-foto.jpg', 'https://www.linkedin.com/in/maria-peixoto-alfa', now()),
  ((select valor::uuid from ids where chave = 'paula'), 'b2000000-0000-0000-0000-000000000001', 'found',
    'https://media.licdn.com/paula-foto.jpg', 'https://www.linkedin.com/in/paula-nogueira', now());

insert into ids select 'alfa-interacoes', string_agg(kind, ',' order by kind) from public.account_interactions
  where target_account_id = (select valor::uuid from ids where chave = 'alfa');
insert into ids select 'beta-interacoes', string_agg(kind, ',' order by kind) from public.account_interactions
  where target_account_id = (select valor::uuid from ids where chave = 'beta');

select isnt(pg_temp.vazamentos(array['%peixoto%', '%alfa%', '%distribuidora%', '%987654321%', '%12.345.678%', '%maria souza%', '%olá, maria%']),
  '', 'before the deletion the sweep finds the Alfa personal data, so the check below means something');
select isnt(pg_temp.vazamentos(array['%nogueira%', '%rezende%', '%955550001%', '%paula%']),
  '', 'and the Paula personal data');

-- 5. Apagar o Contato (Paula, só da Beta): só o Administrador, com o nome dela como confirmação.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.erase_contact((select valor::uuid from ids where chave = 'paula'), 'Paula Rezende Nogueira')$$,
  '42501', 'only administrators can permanently delete a contact', 'the responsible seller cannot permanently delete a Contato');
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.erase_contact((select valor::uuid from ids where chave = 'paula'), 'Paula Rezende Nogueira')$$,
  '42501', 'only administrators can permanently delete a contact', 'nor any other member');
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000005', true);
select throws_ok(
  $$select public.erase_contact((select valor::uuid from ids where chave = 'paula'), 'Paula Rezende Nogueira')$$,
  'P0002', 'contact not found', 'an administrator of another Workspace does not find the Contato');
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.erase_contact((select valor::uuid from ids where chave = 'paula'), 'Paula')$$,
  '22023', 'the confirmation does not match the contact name', 'the administrator must type the name of the Contato');
select throws_ok(
  $$select public.erase_contact((select valor::uuid from ids where chave = 'paula'), null)$$,
  '22023', 'the confirmation does not match the contact name', 'a missing confirmation is refused too');
select is((select count(*)::int from public.contacts where id = (select valor::uuid from ids where chave = 'paula')), 1,
  'a refused request deletes nothing');
insert into ids select 'res-paula', (public.erase_contact((select valor::uuid from ids where chave = 'paula'), '  paula REZENDE nogueira '))::text;
reset role;

select is((select valor::jsonb ->> 'result' from ids where chave = 'res-paula'), 'erased', 'the administrator permanently deletes the Contato');
select is((select (valor::jsonb ->> 'contacts_erased') || ',' || (valor::jsonb ->> 'links_removed') || ',' || (valor::jsonb ->> 'received_emails_erased')
    || ',' || (valor::jsonb ->> 'sends_anonymized') || ',' || (valor::jsonb ->> 'documents_cleaned') || ',' || (valor::jsonb ->> 'legacy_rows_erased')
    from ids where chave = 'res-paula'), '1,1,1,2,1,1', 'the result counts what was done');
select is((select count(*)::int from public.contacts where id = (select valor::uuid from ids where chave = 'paula')), 0, 'the Contato row is gone');
select is((select count(*)::int from public.contact_photos where contact_id = (select valor::uuid from ids where chave = 'paula'))
    + (select count(*)::int from private.contact_photo_lookups where contact_id = (select valor::uuid from ids where chave = 'paula'))
    + (select count(*)::int from public.contact_account_links where contact_id = (select valor::uuid from ids where chave = 'paula')),
  0, 'so are the photo, the photo lookups and the links');
select is((select count(*)::int from public.contacts where id = (select valor::uuid from ids where chave = 'joao')), 1,
  'the other Contato of the same account stays');
select is((select jsonb_array_length(document -> 'steps')::text || ' ' || (document -> 'participantesIds')::text
    from private.sequence_documents where sequence_id = (select valor::uuid from ids where chave = 'seq-beta')),
  '1 ["' || (select valor from ids where chave = 'joao') || '"]', 'her steps and her id left the sequence document');
select is((select (public_summary ->> 'totalSteps') || ',' || (public_summary ->> 'totalParticipantes') from public.sequences
    where id = (select valor::uuid from ids where chave = 'seq-beta')), '1,1', 'and the public counts follow');
select is((select status || ' ' || (contact_id is null)::text || ' ' || (destination is null)::text || ' ' || (provider_email_id is null)::text
    || ' ' || (provider_message_id is null)::text || ' ' || (provider_thread_id is null)::text || ' ' || (anonymized_at is not null)::text
    from private.sequence_step_sends where id = (select valor::uuid from ids where chave = 'beta-envio-1')),
  'sent true true true true true true', 'the sent step keeps its state and loses the person, the destination and the provider ids');
select is((select status || ' ' || (contact_id is null)::text || ' ' || (destination is null)::text
    from private.sequence_step_sends where id = (select valor::uuid from ids where chave = 'beta-envio-3')),
  'cancelled true true', 'the pending step of hers was cancelled and anonymized');
select is((select status || ' ' || contact_id::text || ' ' || destination from private.sequence_step_sends
    where id = (select valor::uuid from ids where chave = 'beta-envio-2')),
  'confirmed ' || (select valor from ids where chave = 'joao') || ' joao.lima@compartilhado.test',
  'the step of the other contact is untouched');
select is((select count(*)::int from private.received_emails where sequence_id = (select valor::uuid from ids where chave = 'seq-beta')), 0,
  'her reply, with subject, body and attachments, is gone');
select is((select count(*)::int from private.storage_purge_queue
    where bucket = 'email-attachments' and prefix = 'recebidos/' || (select interaction_id from resposta_beta) || '/'), 2,
  'her attachment folder is queued twice for deletion in the Storage (now, and later for a download still in flight)');
select is((select count(*)::int from private.unipile_email_events where provider_email_id like 'beta-%'
    or send_id = (select valor::uuid from ids where chave = 'beta-envio-1')), 0,
  'the provider e-mail ids left the Unipile events');
select is((select count(*)::int from private.target_contacts_canais02 where id = 'legado-paula'), 0, 'the old copy of the Contato is gone');
select is((select string_agg(kind, ',' order by kind) from public.account_interactions
    where target_account_id = (select valor::uuid from ids where chave = 'beta')), (select valor from ids where chave = 'beta-interacoes'),
  'the commercial events stay');
select is((select count(*)::int from public.account_interactions where contact_id = (select valor::uuid from ids where chave = 'paula')), 0,
  'without the Contato');
select is(pg_temp.vazamentos(array['%nogueira%', '%rezende%', '%955550001%', '%paula%']), '',
  'no table of the database keeps anything of the deleted Contato');
select is((select count(*)::int from private.data_lifecycle_events where action = 'erase' and subject_kind = 'contact'
    and subject_id = (select valor::uuid from ids where chave = 'paula') and actor_user_id = 'b1000000-0000-0000-0000-000000000003'), 1,
  'the audit says who deleted which Contato');
select is((select bool_and(jsonb_typeof(v.value) = 'number') from private.data_lifecycle_events e, jsonb_each(e.counts) v
    where e.action = 'erase' and e.subject_kind = 'contact'), true, 'and holds only numbers, never text');

-- Uma repetição não faz nada: nem apaga de novo, nem audita, nem enfileira.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000003', true);
select is((public.erase_contact((select valor::uuid from ids where chave = 'paula'), 'qualquer coisa'))::text, '{"result": "already_erased"}',
  'repeating the request answers "already erased" to the administrator');
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.erase_contact((select valor::uuid from ids where chave = 'paula'), 'Paula Rezende Nogueira')$$,
  'P0002', 'contact not found', 'a non-administrator learns nothing about a deleted Contato');
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000005', true);
select throws_ok(
  $$select public.erase_contact((select valor::uuid from ids where chave = 'paula'), 'Paula Rezende Nogueira')$$,
  'P0002', 'contact not found', 'nor does an administrator of another Workspace');
reset role;
select is((select count(*)::int from private.data_lifecycle_events where action = 'erase' and subject_kind = 'contact'), 1,
  'the repetitions did not add to the audit');
select is((select count(*)::int from private.storage_purge_queue where prefix = 'recebidos/' || (select interaction_id from resposta_beta) || '/'), 2,
  'nor to the Storage queue');

-- Um resultado atrasado não devolve o que foi apagado: a resposta que chega depois não acha o Envio, e uma escrita
-- direta no Envio desidentificado nada recoloca nele.
set local role service_role;
select is((select outcome from public.ingest_unipile_email_event('evt-b3', 'email.new', 'unipile-google-9',
  pg_temp.email('tardia-b', 'thread-b1', 'paula.nogueira@beta-industrial.test', 'Re: Visita'), array['althius.relacionamento@gmail.com'])),
  'unrelated', 'a late reply of the deleted Contato is not tied to any step');
reset role;
select is((select count(*)::int from private.received_emails where sequence_id = (select valor::uuid from ids where chave = 'seq-beta')), 0,
  'and stores nothing');
update private.sequence_step_sends set destination = 'paula.nogueira@beta-industrial.test', provider_thread_id = 'thread-b1',
  subject = 'Visita', body = 'Olá, Paula Rezende.', last_error = 'paula.nogueira', contact_id = (select valor::uuid from ids where chave = 'joao')
  where id = (select valor::uuid from ids where chave = 'beta-envio-1');
select is((select (contact_id is null and destination is null and provider_thread_id is null and subject is null and body is null
    and last_error is null)::text from private.sequence_step_sends where id = (select valor::uuid from ids where chave = 'beta-envio-1')),
  'true', 'an anonymized Envio refuses to take personal data back, whatever writes to it');
select is(pg_temp.vazamentos(array['%nogueira%', '%rezende%', '%955550001%', '%paula%']), '', 'still nothing anywhere');

-- 6. Apagar a Conta-alvo (Alfa): tudo o que era dela, e só os eventos comerciais desidentificados ficam.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.erase_target_account((select valor::uuid from ids where chave = 'alfa'), 'Alfa Distribuidora')$$,
  '42501', 'only administrators can permanently delete a target account', 'the responsible seller cannot permanently delete the target account');
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000004', true);
select throws_ok(
  $$select public.erase_target_account((select valor::uuid from ids where chave = 'alfa'), 'Alfa Distribuidora')$$,
  '42501', 'only administrators can permanently delete a target account', 'nor another member');
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000005', true);
select throws_ok(
  $$select public.erase_target_account((select valor::uuid from ids where chave = 'alfa'), 'Alfa Distribuidora')$$,
  'P0002', 'target account not found', 'an administrator of another Workspace does not find it');
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.erase_target_account((select valor::uuid from ids where chave = 'alfa'), 'Alfa')$$,
  '22023', 'the confirmation does not match the target account name', 'the administrator must type the name of the target account');
select is((select name from public.target_accounts where id = (select valor::uuid from ids where chave = 'alfa')), 'Alfa Distribuidora',
  'a refused request changes nothing');
insert into ids select 'res-alfa', (public.erase_target_account((select valor::uuid from ids where chave = 'alfa'), ' ALFA distribuidora '))::text;
reset role;

select is((select valor::jsonb ->> 'result' from ids where chave = 'res-alfa'), 'erased', 'the administrator permanently deletes the target account');
select is((select (valor::jsonb ->> 'sequences_ended') || ',' || (valor::jsonb ->> 'contacts_erased') || ',' || (valor::jsonb ->> 'contacts_kept')
    || ',' || (valor::jsonb ->> 'received_emails_erased') || ',' || (valor::jsonb ->> 'sends_anonymized') || ',' || (valor::jsonb ->> 'legacy_rows_erased')
    || ',' || (valor::jsonb ->> 'interactions_detached') from ids where chave = 'res-alfa'), '1,1,1,1,3,2,1',
  'the result counts what was done: the sequence ended, Maria deleted, João kept, one reply, three sends, two old rows');
select is((select name || ' ' || canonical_url || ' ' || domain || ' ' || coalesce(legal_identifier, '-') || ' ' || coalesce(linkedin_url, '-')
    || ' ' || coalesce(segment, '-') || ' ' || (deleted_at is not null)::text
    from public.target_accounts where id = (select valor::uuid from ids where chave = 'alfa')),
  'Conta apagada https://conta-apagada.invalid/' || (select valor from ids where chave = 'alfa') || ' conta-apagada.invalid - - - true',
  'the target account stays only as a marker with no company data');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000004', true);
select is((select count(*)::int from public.target_accounts where id = (select valor::uuid from ids where chave = 'alfa')), 0,
  'and no participant sees the marker');
select is((select count(*)::int from public.target_accounts), 2, 'the other target accounts of the Workspace are there (Beta and Gama)');
reset role;
select is((select count(*)::int from public.contacts where id = (select valor::uuid from ids where chave = 'maria')), 0,
  'the Contato that existed only in Alfa is gone');
select is((select count(*)::int from public.contacts where id = (select valor::uuid from ids where chave = 'joao')), 1,
  'the one who also works for Beta is kept');
select is((select count(*)::int from public.contact_account_links where target_account_id = (select valor::uuid from ids where chave = 'alfa')), 0,
  'with no link to the deleted target account');
select is((select count(*)::int from public.contact_account_links where contact_id = (select valor::uuid from ids where chave = 'joao')
    and target_account_id = (select valor::uuid from ids where chave = 'beta') and ended_at is null), 1, 'and his link to Beta intact');
select is((select string_agg(kind, ',' order by kind) from public.account_interactions
    where target_account_id = (select valor::uuid from ids where chave = 'alfa')), (select valor from ids where chave = 'alfa-interacoes'),
  'every commercial event of the target account stays');
select is((select count(*)::int from public.account_interactions
    where target_account_id = (select valor::uuid from ids where chave = 'alfa') and contact_id is not null), 0,
  'and none points to a person any more');
select is((select status || ' ' || ended_reason || ' ' || (public_summary ->> 'status') from public.sequences
    where id = (select valor::uuid from ids where chave = 'seq-alfa')), 'encerrada account_deleted encerrada',
  'the sequence is ended for good');
select is((select document::text from private.sequence_documents where sequence_id = (select valor::uuid from ids where chave = 'seq-alfa')), '{}',
  'its private document is empty');
select is((select count(*)::int from private.sequence_authorizations
    where sequence_id = (select valor::uuid from ids where chave = 'seq-alfa') and document <> '{}'::jsonb), 0,
  'so is the copy of the document kept in the authorizations');
select is((select string_agg(status, ',' order by step_id) from private.sequence_step_sends
    where sequence_id = (select valor::uuid from ids where chave = 'seq-alfa')), 'sent,sending,cancelled',
  'the sends keep their state, and the pending one was cancelled');
select is((select count(*)::int from private.sequence_step_sends where sequence_id = (select valor::uuid from ids where chave = 'seq-alfa')
    and (contact_id is not null or destination is not null or subject is not null or body is not null or provider_email_id is not null
      or provider_message_id is not null or provider_thread_id is not null or last_error is not null or anonymized_at is null)), 0,
  'and lose the person, destination, content and provider ids');
select is((select count(*)::int from private.received_emails where sequence_id = (select valor::uuid from ids where chave = 'seq-alfa')), 0,
  'the reply is gone');
select is((select count(*)::int from private.storage_purge_queue
    where bucket = 'email-attachments' and prefix = 'recebidos/' || (select interaction_id from resposta_alfa) || '/'), 2,
  'its attachment folder is queued for deletion in the Storage');
select is((select count(*)::int from private.unipile_email_events where provider_email_id like 'alfa-%' or send_id in (
    select id from private.sequence_step_sends where sequence_id = (select valor::uuid from ids where chave = 'seq-alfa'))), 0,
  'the provider e-mail ids left the Unipile events');
select is((select count(*)::int from private.target_contacts_canais02 where target_account_id = (select valor from ids where chave = 'alfa')
    or id = 'legado-maria'), 0, 'the old copies of the contacts are gone');
select is((select count(*)::int from public.contact_photos where contact_id = (select valor::uuid from ids where chave = 'maria'))
    + (select count(*)::int from private.contact_photo_lookups where contact_id = (select valor::uuid from ids where chave = 'maria')), 0,
  'and the photo');
select is((select count(*)::int from public.sales_responsibilities where target_account_id = (select valor from ids where chave = 'alfa')), 1,
  'the responsibility record stays: it holds only ids');
select is(pg_temp.vazamentos(array['%peixoto%', '%alfa%', '%distribuidora%', '%987654321%', '%12.345.678%', '%maria souza%', '%olá, maria%']), '',
  'no table of the database keeps anything of the deleted target account or of its Contato');
select is((select count(*)::int from private.data_lifecycle_events where action = 'erase' and subject_kind = 'account'
    and subject_id = (select valor::uuid from ids where chave = 'alfa') and actor_user_id = 'b1000000-0000-0000-0000-000000000003'), 1,
  'the audit says who deleted which target account');
select is((select bool_and(jsonb_typeof(v.value) = 'number') from private.data_lifecycle_events e, jsonb_each(e.counts) v), true,
  'the whole audit holds only numbers');

-- Repetir, e o que chega atrasado, não muda nada nem devolve dado pessoal.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000003', true);
select is((public.erase_target_account((select valor::uuid from ids where chave = 'alfa'), 'qualquer coisa'))::text, '{"result": "already_erased"}',
  'repeating the request answers "already erased"');
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.erase_target_account((select valor::uuid from ids where chave = 'alfa'), 'Alfa Distribuidora')$$,
  '42501', 'only administrators can permanently delete a target account', 'a repetition by a non-administrator is still refused');
select throws_ok(
  $$select public.register_account_interaction((select valor::uuid from ids where chave = 'alfa'), 'ligacao')$$,
  '55006', 'the target account was deleted', 'no Interação on a deleted target account');
select throws_ok(
  $$select public.link_contact((select valor::uuid from ids where chave = 'joao'), (select valor::uuid from ids where chave = 'alfa'))$$,
  '55006', 'the target account was deleted', 'no Vínculo with it');
select throws_ok(
  $$select public.create_sequence('b2000000-0000-0000-0000-000000000001', (select valor from ids where chave = 'alfa'), '{}'::jsonb, '{}'::jsonb)$$,
  '55006', 'the target account was deleted', 'no new sequence for it');
select throws_ok(
  $$select public.update_owned_sequence((select valor::uuid from ids where chave = 'seq-alfa'),
      jsonb_build_object('steps', jsonb_build_array(jsonb_build_object('id', 'novo', 'canal', 'email', 'corpo', 'Olá, Maria Souza.'))), null, null)$$,
  '55006', 'an ended sequence cannot be changed', 'the owner cannot write into the document of the ended sequence');
select throws_ok(
  $$select public.confirm_sequence_step((select valor::uuid from ids where chave = 'seq-alfa'), 'passo-3')$$,
  'P0002', 'step not found in the sequence document', 'nor confirm a step of it');
reset role;
select throws_ok(
  $$update public.target_accounts set name = 'Alfa Distribuidora' where id = (select valor::uuid from ids where chave = 'alfa')$$,
  '55006', 'a deleted target account cannot change', 'the marker refuses to take a name back');
select throws_ok(
  $$update public.target_accounts set domain = 'alfa-distribuidora.test', canonical_url = 'https://alfa-distribuidora.test'
    where id = (select valor::uuid from ids where chave = 'alfa')$$,
  '55006', 'a deleted target account cannot change', 'nor the company URL');

-- O envio que estava em voo termina depois do apagamento: o estado vale, os dados pessoais não voltam.
set local role service_role;
select is(public.record_sequence_step_send_result((select valor::uuid from ids where chave = 'alfa-envio-2'), 'sent', 'tardia-a', '<tardia-a@mail.test>', null),
  'sent', 'the send that was in flight finishes after the deletion');
select is((select outcome from public.ingest_unipile_email_event('evt-a3', 'email.new', 'unipile-google-9',
  pg_temp.email('tardia-r', 'thread-a1', 'maria.peixoto@alfa-distribuidora.test', 'Re: Apresentação'), array['althius.relacionamento@gmail.com'])),
  'unrelated', 'and a late reply is not tied to any step');
reset role;
select is((select status || ' ' || (contact_id is null)::text || ' ' || (destination is null)::text || ' ' || (provider_email_id is null)::text
    || ' ' || (provider_message_id is null)::text from private.sequence_step_sends where id = (select valor::uuid from ids where chave = 'alfa-envio-2')),
  'sent true true true true', 'the send says it went out, with no person, destination or provider id');
select is((select count(*)::int from private.received_emails where sequence_id = (select valor::uuid from ids where chave = 'seq-alfa')), 0,
  'no reply content came back');
select is(pg_temp.vazamentos(array['%peixoto%', '%alfa%', '%distribuidora%', '%987654321%', '%12.345.678%', '%maria souza%', '%olá, maria%']), '',
  'the sweep is still clean after the late results');
select is((select count(*)::int from private.data_lifecycle_events where action = 'erase' and subject_kind = 'account'), 1,
  'the repetitions did not add to the audit');

-- Um cadastro novo da mesma empresa é outra Conta, sem nada da apagada.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000001', true);
insert into ids select 'alfa-nova', id::text from public.save_target_account(
  'b2000000-0000-0000-0000-000000000001', 'Nova Empresa', 'https://alfa-distribuidora.test');
select isnt((select valor from ids where chave = 'alfa-nova'), (select valor from ids where chave = 'alfa'),
  'registering the same company again creates a new target account');
select is((select count(*)::int from public.contacts c join public.contact_account_links l on l.contact_id = c.id
    where l.target_account_id = (select valor::uuid from ids where chave = 'alfa-nova')), 0, 'with none of the old contacts');
reset role;

-- 7. Isolamento e permissões.
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private' and c.relname in ('data_lifecycle_events', 'storage_purge_queue', 'storage_purge_settings') and c.relrowsecurity), 3,
  'the new private tables have RLS enabled');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000003', true);
select throws_ok($$select count(*) from private.data_lifecycle_events$$, '42501', 'permission denied for schema private',
  'the audit is not readable through direct queries');
select is((select count(*)::int from public.list_data_lifecycle_events('b2000000-0000-0000-0000-000000000001')), 8,
  'the administrator reads the audit history of the Workspace (Alfa twice, Gama twice, Joao twice, Paula and Alfa deleted)');
select is((select action || ' ' || subject_kind from public.list_data_lifecycle_events('b2000000-0000-0000-0000-000000000001') limit 1),
  'erase account', 'newest first');
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000001', true);
select throws_ok($$select * from public.list_data_lifecycle_events('b2000000-0000-0000-0000-000000000001')$$, '42501',
  'only administrators can read the audit history', 'a member does not read the audit history');
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000005', true);
select throws_ok($$select * from public.list_data_lifecycle_events('b2000000-0000-0000-0000-000000000001')$$, '42501',
  'only administrators can read the audit history', 'nor the administrator of another Workspace');
select is((select count(*)::int from public.target_accounts) || ',' || (select count(*)::int from public.contacts), '1,1',
  'the other Workspace keeps its own data, untouched by the deletions');
select throws_ok($$select public.claim_storage_purge(5)$$, '42501', 'permission denied for function claim_storage_purge',
  'signed-in users cannot drain the Storage queue');
select throws_ok($$select public.storage_purge_token_matches('x')$$, '42501', 'permission denied for function storage_purge_token_matches',
  'nor probe the token');
reset role;
set local role anon;
select throws_ok($$select public.erase_target_account('dddddddd-0000-0000-0000-000000000009', 'x')$$, '42501',
  'permission denied for function erase_target_account', 'a visitor cannot delete anything');
select throws_ok($$select public.archive_contact('dddddddd-0000-0000-0000-000000000009')$$, '42501',
  'permission denied for function archive_contact', 'nor archive');
reset role;

-- 8. A fila do Storage: o banco só enfileira, a Edge Function storage-purge apaga e dá baixa.
create temporary table chamadas (url text, token text);
create or replace function private.post_to_storage_purge(p_url text, p_token text) returns void
language plpgsql security definer set search_path = '' as $f$
begin
  insert into pg_temp.chamadas values (p_url, p_token);
end
$f$;
select is(public.storage_purge_token_matches((select token from private.storage_purge_settings)), true, 'the database token is recognized');
select is(public.storage_purge_token_matches(repeat('0', 64)), false, 'another token is not');
select is(private.kick_storage_purge(), false, 'without the function address nothing is called');
select throws_ok($$select private.configure_storage_purge('http://abc.supabase.co')$$, '22023',
  'project url must look like https://<ref>.supabase.co', 'the address must be an https project URL');
select is(private.configure_storage_purge('https://abc.supabase.co/'), 'https://abc.supabase.co/functions/v1/storage-purge',
  'the address of the function is configured once');
select is(private.kick_storage_purge(), true, 'with folders due, the database calls the function');
select is((select url || ' ' || (token = (select token from private.storage_purge_settings)) from chamadas),
  'https://abc.supabase.co/functions/v1/storage-purge true', 'and the call carries the database token');
set local role service_role;
create temporary table reservadas as select * from public.claim_storage_purge(10);
select is((select count(*)::int from reservadas), 2, 'the Edge Function claims the due folders (the later passes wait)');
select is((select count(*)::int from public.claim_storage_purge(10)), 0, 'a folder already claimed is not handed out again');
select is(public.finish_storage_purge((select min(id) from reservadas)), true, 'the function marks a folder as deleted');
select is(public.finish_storage_purge((select min(id) from reservadas)), false, 'marking it again changes nothing');
select is(public.finish_storage_purge((select max(id) from reservadas), 'storage unavailable'), true, 'a failure is recorded and releases the folder');
reset role;
select is((select last_error || ' ' || attempts || ' ' || (claimed_until is null)::text || ' ' || (done_at is null)::text
    from private.storage_purge_queue where id = (select max(id) from reservadas)), 'storage unavailable 1 true true',
  'so that the next round tries again');
select is(private.kick_storage_purge(), true, 'and the database calls the function again while something is due');

select * from finish();
rollback;

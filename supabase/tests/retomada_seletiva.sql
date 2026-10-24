begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(15);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values ('64000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'titular-seletiva@cliente.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('64100000-0000-0000-0000-000000000001', 'empresa', 'Cliente Seletiva');
insert into private.workspace_contracts (workspace_id, tier_id, starts_at)
values ('64100000-0000-0000-0000-000000000001', 'escala', date_trunc('month', now()))
on conflict (workspace_id) do nothing;
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('64100000-0000-0000-0000-000000000001', '64000000-0000-0000-0000-000000000001', 'member', true);

create temporary table ids (chave text primary key, valor text);
grant all on ids to authenticated, service_role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '64000000-0000-0000-0000-000000000001', true);
insert into ids select 'conta', id::text from public.save_target_account(
  '64100000-0000-0000-0000-000000000001', 'Empresa Seletiva', 'https://seletiva.test');
insert into ids select 'maria', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta'), 'Maria Souza', 'Diretora', 'maria@seletiva.test');
insert into ids select 'joao', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta'), 'Joao Lima', 'Compras', 'joao@seletiva.test');
insert into ids select 'sequencia', id::text from public.create_sequence(
  '64100000-0000-0000-0000-000000000001', (select valor from ids where chave = 'conta'),
  jsonb_build_object('participantesIds', jsonb_build_array((select valor from ids where chave='maria'), (select valor from ids where chave='joao')),
    'steps', jsonb_build_array(
      jsonb_build_object('id','maria-1','ordem',1,'canal','email','contatoId',(select valor from ids where chave='maria'),'delayDiasUteis',0,'titulo','Olá','assunto','Oi','corpo','Olá'),
      jsonb_build_object('id','joao-1','ordem',2,'canal','email','contatoId',(select valor from ids where chave='joao'),'delayDiasUteis',0,'titulo','Olá','assunto','Oi','corpo','Olá',
        'liberacao','predecessor','predecessorId','maria-1'))), '{}'::jsonb);
insert into ids select 'envio-maria', id::text from public.confirm_sequence_step((select valor::uuid from ids where chave='sequencia'), 'maria-1');
insert into ids select 'envio-joao', id::text from public.confirm_sequence_step((select valor::uuid from ids where chave='sequencia'), 'joao-1');
insert into ids select 'tentativa', attempt_id::text from public.create_sender_connection_attempt(
  '64100000-0000-0000-0000-000000000001', 'email', null);
reset role;

set local role service_role;
select public.complete_sender_connection_attempt((select valor::uuid from ids where chave='tentativa'), 'unipile-seletiva', 'GOOGLE', 'CREATION_SUCCESS');
select public.apply_unipile_sender_status('unipile-seletiva', 'SYNC_SUCCESS');
reset role;
insert into ids select 'remetente', id::text from private.sender_accounts where unipile_account_id='unipile-seletiva';

insert into private.sequence_correlated_replies (
  sequence_id, workspace_id, source_kind, source_id, provider_event_id, contact_id, received_at
) values (
  (select valor::uuid from ids where chave='sequencia'), '64100000-0000-0000-0000-000000000001',
  'email', '64200000-0000-0000-0000-000000000001', 'evt-seletiva', (select valor::uuid from ids where chave='maria'), now()
);
insert into private.sequence_reply_holds (sequence_id, workspace_id, target_account_id, version, open, state, opened_at)
select s.id, s.workspace_id, s.target_account_id, 1, true, 'preventive', now()-interval '1 minute'
from public.sequences s where s.id = (select valor::uuid from ids where chave='sequencia');
insert into private.sequence_retention_decisions (sequence_id, workspace_id, actor_user_id, decision, reviewed_version, reviewed_reply_ids, outcome)
values ((select valor::uuid from ids where chave='sequencia'), '64100000-0000-0000-0000-000000000001',
  '64000000-0000-0000-0000-000000000001', 'pause', 1, array[(select id from private.sequence_correlated_replies where provider_event_id='evt-seletiva')], 'paused');
update public.sequences set status='pausada' where id=(select valor::uuid from ids where chave='sequencia');
insert into ids select 'resposta', id::text from private.sequence_correlated_replies where provider_event_id='evt-seletiva';
update private.sequence_step_sends set status='scheduled', scheduled_for=now()-interval '1 minute'
where id in ((select valor::uuid from ids where chave='envio-maria'), (select valor::uuid from ids where chave='envio-joao'));
select private.pending_reply_ids((select valor::uuid from ids where chave='sequencia'), (select opened_at from private.sequence_reply_holds where sequence_id=(select valor::uuid from ids where chave='sequencia')));
select (select valor from ids where chave='resposta');
insert into public.contact_suppressions (workspace_id, kind, value, reason, contact_id, created_by)
values ('64100000-0000-0000-0000-000000000001', 'email', 'maria@seletiva.test', 'manual', (select valor::uuid from ids where chave='maria'), '64000000-0000-0000-0000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub', '64000000-0000-0000-0000-000000000001', true);
select is(jsonb_array_length(public.list_sequence_reply_review((select valor::uuid from ids where chave='sequencia')) -> 'pending'),
  1, 'the current hold includes the reply under review');
select is((select outcome from public.decide_sequence_retention(
  (select valor::uuid from ids where chave='sequencia'), 'continue', 1,
  array[(select valor::uuid from ids where chave='resposta')],
  array[(select valor::uuid from ids where chave='maria')]
)), 'continued', 'the owner continues only the selected contact');
select is((select status from public.sequences where id=(select valor::uuid from ids where chave='sequencia')),
  'ativa', 'the account sequence resumes after the reviewed decision');
select is(jsonb_exists(public.list_sequence_reply_review((select valor::uuid from ids where chave='sequencia')) -> 'paused_contacts',
  (select valor from ids where chave='joao')), true, 'the unselected contact remains locally paused');
select is(jsonb_exists(public.list_sequence_reply_review((select valor::uuid from ids where chave='sequencia')) -> 'paused_contacts',
  (select valor from ids where chave='maria')), false, 'the selected contact is locally released');
reset role;
select is((select reason from private.sequence_contact_holds
  where sequence_id=(select valor::uuid from ids where chave='sequencia') and contact_id=(select valor::uuid from ids where chave='joao')),
  'not_selected_after_reply_review', 'the local pause has a reason distinct from the account hold');
select is((select document #>> '{steps,1,predecessorId}' from private.sequence_documents
  where sequence_id=(select valor::uuid from ids where chave='sequencia')), 'maria-1', 'selective resume does not rewrite an unsatisfied dependency');
select is((select selected_contact_ids from private.sequence_retention_decisions where decision='continue'),
  array[(select valor::uuid from ids where chave='maria')], 'the actor decision stores its selected contact');
select is((select outcome from private.release_step_send((select valor::uuid from ids where chave='envio-joao'),
  '64000000-0000-0000-0000-000000000001', true)), 'contact_paused', 'direct executor release cannot send for the unselected contact');
select is((select status from private.sequence_step_sends where id=(select valor::uuid from ids where chave='envio-joao')),
  'scheduled', 'a locally paused send stays pending for a later eligible slot');
select is(exists (select 1 from public.contact_suppressions where workspace_id='64100000-0000-0000-0000-000000000001' and value='maria@seletiva.test'),
  true, 'continuing a selected contact never removes its existing suppression');
select is((select outcome from private.release_step_send((select valor::uuid from ids where chave='envio-maria'),
  '64000000-0000-0000-0000-000000000001', true)), 'contact_suppressed', 'the selected contact remains blocked by the existing suppression guard');
reset role;
insert into public.account_interactions (id, workspace_id, target_account_id, contact_id, kind, source, recorded_by)
select '64300000-0000-0000-0000-000000000001', '64100000-0000-0000-0000-000000000001',
  (select valor::uuid from ids where chave='conta'), (select valor::uuid from ids where chave='joao'),
  'email-recebido', 'manual', '64000000-0000-0000-0000-000000000001';
insert into private.received_emails (
  interaction_id, workspace_id, owner_user_id, sequence_id, send_id, contact_id, sender_account_id,
  provider_email_id, from_email, from_name, subject, body, snippet, received_at
) values (
  '64300000-0000-0000-0000-000000000001', '64100000-0000-0000-0000-000000000001',
  '64000000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave='sequencia'),
  (select valor::uuid from ids where chave='envio-joao'), (select valor::uuid from ids where chave='joao'),
  (select valor::uuid from ids where chave='remetente'), 'reply-seletiva', 'joao@seletiva.test', 'Joao Lima',
  'Re: Oi', 'Prefiro que encerremos por aqui.', 'Prefiro que encerremos por aqui.', now()
);
set local role authenticated;
select is(public.confirm_sequence_no_contact((select valor::uuid from ids where chave='sequencia'),
  '64300000-0000-0000-0000-000000000001'), 'suppressed', 'the owner confirms non-contact using a received reply as evidence');
reset role;
select is((select count(*)::int from private.sequence_no_contact_evidence e
  join public.contact_suppressions s on s.id=e.contact_suppression_id
  where e.interaction_id='64300000-0000-0000-0000-000000000001' and e.actor_user_id='64000000-0000-0000-0000-000000000001'
    and s.value='joao@seletiva.test'), 1, 'the suppression retains its private evidence and actor');
select is(exists (select 1 from public.contact_suppressions
  where workspace_id='64100000-0000-0000-0000-000000000001' and value='joao@seletiva.test'),
  true, 'the confirmed reply blocks the recipient in the Workspace');
reset role;

select * from finish();
rollback;

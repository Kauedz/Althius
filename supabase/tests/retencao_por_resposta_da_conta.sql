begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(24);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('63000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'titular-retencao@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('63000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'colega-retencao@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('63100000-0000-0000-0000-000000000001', 'empresa', 'Cliente Retencao');

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('63100000-0000-0000-0000-000000000001', '63000000-0000-0000-0000-000000000001', 'member', true),
  ('63100000-0000-0000-0000-000000000001', '63000000-0000-0000-0000-000000000002', 'admin', true);

create temporary table ids (chave text primary key, valor text);
grant all on ids to authenticated, service_role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '63000000-0000-0000-0000-000000000001', true);

insert into ids select 'conta', id::text from public.save_target_account(
  '63100000-0000-0000-0000-000000000001', 'Empresa Alvo', 'https://empresa-alvo.test');
insert into ids select 'maria', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta'), 'Maria Souza', 'Diretora', 'maria@empresa-alvo.test');
insert into ids select 'joao', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta'), 'Joao Lima', 'Compras', 'joao@empresa-alvo.test');
insert into ids select 'sequencia', id::text from public.create_sequence(
  '63100000-0000-0000-0000-000000000001',
  (select valor from ids where chave = 'conta'),
  jsonb_build_object(
    'participantesIds', jsonb_build_array((select valor from ids where chave = 'maria'), (select valor from ids where chave = 'joao')),
    'steps', jsonb_build_array(
      jsonb_build_object('id', 'passo-1', 'ordem', 1, 'canal', 'email', 'contatoId', (select valor from ids where chave = 'maria'),
        'delayDiasUteis', 0, 'titulo', 'Abertura', 'assunto', 'Apresentação', 'corpo', 'Olá, Maria.'),
      jsonb_build_object('id', 'passo-2', 'ordem', 2, 'canal', 'email', 'contatoId', (select valor from ids where chave = 'joao'),
        'delayDiasUteis', 0, 'titulo', 'Outro caminho', 'assunto', 'Oi', 'corpo', 'Olá, João.'))),
  '{}'::jsonb);
insert into ids select 'tentativa', attempt_id::text from public.create_sender_connection_attempt(
  '63100000-0000-0000-0000-000000000001', 'email', null);
reset role;

set local role service_role;
select is(public.complete_sender_connection_attempt(
  (select valor::uuid from ids where chave = 'tentativa'), 'unipile-retencao-1', 'GOOGLE', 'CREATION_SUCCESS'
), 'completed', 'sender account linked');
insert into ids select 'remetente', id::text from private.sender_accounts where unipile_account_id = 'unipile-retencao-1';
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '63000000-0000-0000-0000-000000000001', true);
insert into ids select 'envio', id::text from public.confirm_sequence_step(
  (select valor::uuid from ids where chave = 'sequencia'), 'passo-1');
reset role;

create function pg_temp.receber(
  p_event text,
  p_contact uuid,
  p_subject text,
  p_body text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_interaction uuid;
begin
  insert into public.account_interactions (
    workspace_id, target_account_id, contact_id, kind, occurred_at, source, recorded_by
  ) values (
    '63100000-0000-0000-0000-000000000001',
    (select valor::uuid from ids where chave = 'conta'),
    p_contact, 'email-recebido', now(), 'sequencia', '63000000-0000-0000-0000-000000000001'
  ) returning id into v_interaction;

  insert into private.received_emails (
    interaction_id, workspace_id, owner_user_id, sequence_id, contact_id, sender_account_id,
    provider_email_id, from_email, from_name, subject, body, snippet, received_at
  ) values (
    v_interaction, '63100000-0000-0000-0000-000000000001', '63000000-0000-0000-0000-000000000001',
    (select valor::uuid from ids where chave = 'sequencia'), p_contact,
    (select valor::uuid from ids where chave = 'remetente'),
    p_event, 'maria@empresa-alvo.test', 'Maria Souza', p_subject, p_body, left(p_body, 40), now()
  );
  return v_interaction;
end;
$$;
grant execute on function pg_temp.receber(text, uuid, text, text) to service_role;

set local role service_role;
select pg_temp.receber('evt-maria', (select valor::uuid from ids where chave = 'maria'), 'Re: Apresentação', 'Podemos falar amanhã?');
select pg_temp.receber('evt-joao', (select valor::uuid from ids where chave = 'joao'), 'Re: Oi', 'Manda a proposta.');
insert into ids select 'resp-maria', id::text from private.sequence_correlated_replies where provider_event_id = 'evt-maria';
insert into ids select 'resp-joao', id::text from private.sequence_correlated_replies where provider_event_id = 'evt-joao';

select is(
  (select count(*)::int from private.sequence_correlated_replies
    where sequence_id = (select valor::uuid from ids where chave = 'sequencia')),
  2, 'two correlated replies are stored before any analysis');
select is(
  (select open::text || ':' || version::text || ':' || state from private.sequence_reply_holds
    where sequence_id = (select valor::uuid from ids where chave = 'sequencia')),
  'true:2:preventive', 'the account hold opens and versions each new reply');

-- Duplicata do mesmo evento não cria outra resposta nem muda a versão.
select pg_temp.receber('evt-maria', (select valor::uuid from ids where chave = 'maria'), 'Re: Apresentação', 'Podemos falar amanhã?');
select is(
  (select count(*)::int from private.sequence_correlated_replies
    where sequence_id = (select valor::uuid from ids where chave = 'sequencia')),
  2, 'a duplicate provider event does not create another reply');
select is(
  (select version from private.sequence_reply_holds
    where sequence_id = (select valor::uuid from ids where chave = 'sequencia')),
  2::bigint, 'a duplicate does not bump the retention version');

update private.sequence_step_sends set status = 'scheduled', scheduled_for = now() - interval '1 minute'
where id = (select valor::uuid from ids where chave = 'envio');
select is(
  (select outcome from public.release_due_step_send((select valor::uuid from ids where chave = 'envio'))),
  'account_retained', 'the executor revalidates the hold before releasing the send');
select is(
  (select status from private.sequence_step_sends where id = (select valor::uuid from ids where chave = 'envio')),
  'scheduled', 'a retained send is not marked sending');

update private.sequence_step_sends set status = 'sending', sending_at = now()
where id = (select valor::uuid from ids where chave = 'envio');
select is(
  (select outcome from public.release_due_step_send((select valor::uuid from ids where chave = 'envio'))),
  'in_flight', 'an in-transit send is not released again');
select is(
  (select count(*)::int from private.sequence_retention_audits
    where send_id = (select valor::uuid from ids where chave = 'envio') and kind = 'in_transit'),
  1, 'the in-transit send is audited');
select public.release_due_step_send((select valor::uuid from ids where chave = 'envio'));
select is(
  (select count(*)::int from private.sequence_retention_audits
    where send_id = (select valor::uuid from ids where chave = 'envio')),
  1, 'auditing the same in-transit send does not repeat');
select is(
  (select status from private.sequence_step_sends where id = (select valor::uuid from ids where chave = 'envio')),
  'sending', 'the in-transit send is not duplicated');
update private.sequence_step_sends set status = 'scheduled', sending_at = null
where id = (select valor::uuid from ids where chave = 'envio');
reset role;

-- Colega administrador não lê conteúdo e não decide.
set local role authenticated;
select set_config('request.jwt.claim.sub', '63000000-0000-0000-0000-000000000002', true);
select is(
  (select public.list_sequence_reply_review((select valor::uuid from ids where chave = 'sequencia')) ->> 'can_read_content'),
  'false', 'another participant cannot read reply content');
select is(
  (select ((public.list_sequence_reply_review((select valor::uuid from ids where chave = 'sequencia')) -> 'pending' -> 0) ? 'subject')),
  false, 'the shared review has no subject');
select throws_ok(
  $$select * from public.decide_sequence_retention(
    (select valor::uuid from ids where chave = 'sequencia'), 'continue', 2, '{}'::uuid[])$$,
  '42501',
  'sequence not found or not owned by active user',
  'another participant cannot decide');

-- Titular vê as duas pendentes. Versão velha não libera.
select set_config('request.jwt.claim.sub', '63000000-0000-0000-0000-000000000001', true);
select is(
  (select jsonb_array_length(public.list_sequence_reply_review(
    (select valor::uuid from ids where chave = 'sequencia')) -> 'pending')),
  2, 'the owner reviews both pending replies together');
select is(
  (select public.list_sequence_reply_review((select valor::uuid from ids where chave = 'sequencia'))
    -> 'pending' -> 0 ->> 'subject'),
  'Re: Apresentação', 'the owner reads the correlated content');

select is(
  (select outcome from public.decide_sequence_retention(
    (select valor::uuid from ids where chave = 'sequencia'),
    'continue',
    1,
    array[
      (select valor::uuid from ids where chave = 'resp-maria'),
      (select valor::uuid from ids where chave = 'resp-joao')
    ]
  )),
  'stale', 'an obsolete version does not release the account');
select is(
  (select public.list_sequence_reply_review((select valor::uuid from ids where chave = 'sequencia')) ->> 'open'),
  'true', 'the hold stays open after a stale decision');

reset role;
update public.sequences set status = 'pausada'
where id = (select valor::uuid from ids where chave = 'sequencia');
select throws_ok(
  $$update public.sequences set status = 'ativa'
    where id = (select valor::uuid from ids where chave = 'sequencia')$$,
  '55006',
  'account retained pending reply review',
  'setting the sequence active does not bypass an open hold');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '63000000-0000-0000-0000-000000000001', true);
select is(
  (select outcome from public.decide_sequence_retention(
    (select valor::uuid from ids where chave = 'sequencia'),
    'continue',
    2,
    array[
      (select valor::uuid from ids where chave = 'resp-maria'),
      (select valor::uuid from ids where chave = 'resp-joao')
    ]
  )),
  'continued', 'the owner releases the account only for the reviewed set');
select is(
  (select status from public.sequences where id = (select valor::uuid from ids where chave = 'sequencia')),
  'ativa', 'a current decision resumes the sequence');
select is(
  (select jsonb_array_length(public.list_sequence_reply_review(
    (select valor::uuid from ids where chave = 'sequencia')) -> 'decisions')),
  1, 'reopening the review shows the persisted decision');

-- Ausência de retenção aberta não libera sozinha; duplicata não reabre a já resolvida.
select is(
  (select outcome from public.decide_sequence_retention(
    (select valor::uuid from ids where chave = 'sequencia'), 'continue', 2, '{}'::uuid[])),
  'not_open', 'an automatic or repeated continue does not release a resolved hold');
reset role;
set local role service_role;
select pg_temp.receber('evt-maria', (select valor::uuid from ids where chave = 'maria'), 'Re: Apresentação', 'Podemos falar amanhã?');
select is(
  (select open from private.sequence_reply_holds
    where sequence_id = (select valor::uuid from ids where chave = 'sequencia')),
  false, 'a duplicate of a reviewed event does not reopen the hold');

select * from finish();
rollback;

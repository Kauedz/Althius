begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(42);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('50000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'titular@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('50000000-0000-0000-0000-000000000009', 'authenticated', 'authenticated', 'outro@outro.com.br', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('51000000-0000-0000-0000-000000000001', 'empresa', 'Cliente'),
  ('51000000-0000-0000-0000-000000000009', 'empresa', 'Outro');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('51000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'member', true),
  ('51000000-0000-0000-0000-000000000009', '50000000-0000-0000-0000-000000000009', 'member', true);

create temporary table ids (chave text primary key, valor text);
grant all on ids to authenticated, service_role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);

insert into ids select 'conta', id::text from public.save_target_account(
  '51000000-0000-0000-0000-000000000001', 'Empresa Alvo', 'https://empresa-alvo.test');
insert into ids select 'maria', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta'), 'Maria Souza', 'Diretora', 'maria@empresa-alvo.test');
insert into ids select 'pedro', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta'), 'Pedro', null, 'pedro@empresa-alvo.test');
insert into ids select 'joao', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta'), 'João Lima', 'Gerente', 'joao@empresa-alvo.test');
insert into ids select 'sequencia', id::text from public.create_sequence(
  '51000000-0000-0000-0000-000000000001',
  (select valor from ids where chave = 'conta'),
  jsonb_build_object(
    'participantesIds', jsonb_build_array((select valor from ids where chave = 'maria'), (select valor from ids where chave = 'pedro')),
    'steps', jsonb_build_array(
      jsonb_build_object('id', 'p1', 'ordem', 1, 'canal', 'email', 'contatoId', (select valor from ids where chave = 'maria'),
        'delayDiasUteis', 0, 'titulo', 'Abertura', 'assunto', '{{primeiro_nome}}, uma ideia para a {{empresa}}',
        'corpo', 'Oi {{nome}} ({{cargo}}), vi a {{ empresa }}.'),
      jsonb_build_object('id', 'p2', 'ordem', 2, 'canal', 'email', 'contatoId', (select valor from ids where chave = 'pedro'),
        'delayDiasUteis', 0, 'titulo', 'Sem cargo', 'assunto', 'Para {{primeiro_nome}}', 'corpo', 'Como {{cargo}} na {{empresa}}, {{persona}}'),
      jsonb_build_object('id', 'p3', 'ordem', 3, 'canal', 'email', 'contatoId', (select valor from ids where chave = 'maria'),
        'delayDiasUteis', 1, 'titulo', 'Follow-up', 'assunto', 'Re: ideia', 'corpo', 'Seguindo.')
    )),
  '{"totalSteps": 3}'::jsonb);

insert into ids select 'tentativa', attempt_id::text from public.create_sender_connection_attempt(
  '51000000-0000-0000-0000-000000000001', 'email', null);
reset role;
set local role service_role;
select public.complete_sender_connection_attempt(
  (select valor::uuid from ids where chave = 'tentativa'), 'unipile-google-1', 'GOOGLE', 'CREATION_SUCCESS');
select public.apply_unipile_sender_status('unipile-google-1', 'SYNC_SUCCESS');

-- 1. As variáveis saem preenchidas e o Envio liberado traz o token do descadastro.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);
insert into ids select 'envio-1', id::text from public.confirm_sequence_step((select valor::uuid from ids where chave = 'sequencia'), 'p1');
insert into ids select 'envio-2', id::text from public.confirm_sequence_step((select valor::uuid from ids where chave = 'sequencia'), 'p2');
reset role;
set local role service_role;
create temporary table liberado as
  select * from public.release_sequence_step_send((select valor::uuid from ids where chave = 'envio-1'), '50000000-0000-0000-0000-000000000001');
-- Daqui em diante o teste lê e grava em `private`, que só o dono do banco enxerga (o service_role não tem uso do schema).
reset role;
select is((select outcome || ' | ' || subject || ' | ' || body from liberado),
  'released | Maria, uma ideia para a Empresa Alvo | Oi Maria Souza (Diretora), vi a Empresa Alvo.',
  '{{primeiro_nome}}, {{nome}}, {{cargo}} e {{empresa}} saem preenchidos no assunto e no corpo');
select matches((select unsubscribe_token from liberado), '^[0-9a-f]{64}$', 'the released send carries a random unsubscribe token');
select ok((select unsubscribe_token from liberado) !~ (select valor from ids where chave = 'envio-1'), 'the token does not expose the send id');
select public.record_sequence_step_send_result((select valor::uuid from ids where chave = 'envio-1'), 'sent', 'email-1', '<m1@x>', null);

-- 2. Variável sem valor: o passo não sai e fica aguardando reconfirmação com o motivo.
select is(
  (select outcome from public.release_sequence_step_send((select valor::uuid from ids where chave = 'envio-2'), '50000000-0000-0000-0000-000000000001')),
  'missing_variable', 'a step with a variable without value is not released');
select is(
  (select status || ' ' || last_error from private.sequence_step_sends where id = (select valor::uuid from ids where chave = 'envio-2')),
  'awaiting_reconfirmation missing_variable:cargo,persona', 'the step waits with the missing variables as the visible reason');
select is(private.missing_step_variables('{{empresa}} {{sobrenome}} {{dominio}} {{remetente.nome}}',
  (select a from public.target_accounts a where a.id = (select valor::uuid from ids where chave = 'conta')),
  (select c from public.contacts c where c.id = (select valor::uuid from ids where chave = 'maria')),
  'Titular'), '{}'::text[], 'account and contact data cover the documented variables');
select is(private.missing_step_variables('{{desconhecida}}', null, null, null), array['desconhecida'],
  'an unknown variable counts as missing');
select is(private.missing_step_variables('{{conta.sinal}} para {{persona}} na {{empresa}}',
  (select a from public.target_accounts a where a.id = (select valor::uuid from ids where chave = 'conta')),
  (select c from public.contacts c where c.id = (select valor::uuid from ids where chave = 'maria')),
  'Titular'), array['conta.sinal', 'persona'],
  'Sinal and Persona are not send variables: the step is held, as the editor and the preview show');

-- 3. O link do descadastro registra a Supressão, pausa a Sequência e é idempotente.
select is(public.unsubscribe_by_token((select unsubscribe_token from liberado)), 'registered', 'the link registers the suppression');
select is(public.unsubscribe_by_token((select unsubscribe_token from liberado)), 'already_registered', 'clicking again is idempotent');
select is(public.unsubscribe_by_token(repeat('0', 64)), 'invalid', 'an unknown token reveals nothing');
select is((select count(*)::int from public.contact_suppressions
  where workspace_id = '51000000-0000-0000-0000-000000000001' and kind = 'email' and value = 'maria@empresa-alvo.test' and reason = 'link'),
  1, 'one suppression row per e-mail and Workspace');
select is((select status from public.sequences where id = (select valor::uuid from ids where chave = 'sequencia')),
  'pausada', 'the sequence is paused');
select is((select document ->> 'motivoPause' from private.sequence_documents where sequence_id = (select valor::uuid from ids where chave = 'sequencia')),
  'Descadastro', 'the pause reason is Descadastro');

-- 4. O Contato suprimido nunca recebe passo: o Envio é cancelado na liberação.
update public.sequences set status = 'ativa' where id = (select valor::uuid from ids where chave = 'sequencia');
insert into private.sequence_step_sends (sequence_id, workspace_id, step_id, owner_user_id, contact_id, channel, destination, status)
values ((select valor::uuid from ids where chave = 'sequencia'), '51000000-0000-0000-0000-000000000001', 'p3',
  '50000000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'maria'), 'email', 'maria@empresa-alvo.test', 'confirmed');
select is(
  (select outcome from public.release_sequence_step_send(
    (select id from private.sequence_step_sends where step_id = 'p3' and sequence_id = (select valor::uuid from ids where chave = 'sequencia')),
    '50000000-0000-0000-0000-000000000001')),
  'contact_suppressed', 'a suppressed contact never receives a step');
select is((select status || ' ' || last_error from private.sequence_step_sends where step_id = 'p3'
  and sequence_id = (select valor::uuid from ids where chave = 'sequencia')),
  'cancelled contact_suppressed', 'the blocked send is cancelled with the reason');
select ok(private.is_suppressed('51000000-0000-0000-0000-000000000001', 'MARIA@empresa-alvo.test'), 'suppression ignores case');
select ok(not private.is_suppressed('51000000-0000-0000-0000-000000000009', 'maria@empresa-alvo.test'), 'suppression is per Workspace');

-- 5. A resposta que pede para sair.
select ok(private.reply_asks_unsubscribe('SAIR'), 'SAIR in capitals');
select ok(private.reply_asks_unsubscribe('Por favor, me remova da lista.'), 'me remova');
select ok(private.reply_asks_unsubscribe('quero me descadastrar'), 'descadastrar');
select ok(private.reply_asks_unsubscribe(' remover '), 'a reply that is just remover');
select ok(private.reply_asks_unsubscribe('Me tire da lista, por favor.'), 'me tire da lista');
select ok(private.reply_asks_unsubscribe('Podem me remover dos e-mails?'), 'me remover dos e-mails');
select ok(private.reply_asks_unsubscribe('Remova meu e-mail da base.'), 'remova meu e-mail');
select ok(private.reply_asks_unsubscribe('Me remova.'), 'a reply that is just me remova');
select ok(not private.reply_asks_unsubscribe('Vou sair de férias, falamos na volta.'), 'sair inside a sentence does not count');
select ok(not private.reply_asks_unsubscribe('Me tire uma dúvida: o plano anual tem desconto?'), 'me tire uma dúvida does not count');
select ok(not private.reply_asks_unsubscribe('Pode me tirar uma dúvida sobre o envio da proposta?'), 'tirar uma dúvida sobre o envio does not count');
select ok(not private.reply_asks_unsubscribe('Tirei esse e-mail do spam, vamos conversar.'), 'tirei esse e-mail do spam does not count');
select ok(not private.reply_asks_unsubscribe(E'Tenho interesse!\n\nEm qui., 15 de out. de 2026, Titular escreveu:\n> Não quer mais receber estes e-mails? Descadastre-se: https://app.test'),
  'the quoted footer of the original e-mail does not count');

-- A resposta gravada pela ingestão registra a Supressão na hora, sem Proposta de resposta, e a pausa da ingestão
-- ("Contato respondeu", gravada depois) mantém o motivo "Descadastro".
update public.sequences set status = 'ativa' where id = (select valor::uuid from ids where chave = 'sequencia');
update private.sequence_documents set document = document - 'motivoPause'
where sequence_id = (select valor::uuid from ids where chave = 'sequencia');
with i as (
  insert into public.account_interactions (workspace_id, target_account_id, contact_id, kind, occurred_at, source, recorded_by)
  values ('51000000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'conta'),
    (select valor::uuid from ids where chave = 'pedro'), 'email-recebido', now(), 'sequencia', '50000000-0000-0000-0000-000000000001')
  returning id)
insert into ids select 'interacao', id::text from i;
insert into private.received_emails (interaction_id, workspace_id, owner_user_id, sequence_id, contact_id, sender_account_id,
  provider_email_id, from_email, body, received_at)
values ((select valor::uuid from ids where chave = 'interacao'), '51000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'sequencia'),
  (select valor::uuid from ids where chave = 'pedro'),
  (select id from private.sender_accounts where unipile_account_id = 'unipile-google-1'),
  'resp-1', 'Pedro@Empresa-Alvo.test', 'SAIR', now());
select is((select reason from public.contact_suppressions where value = 'pedro@empresa-alvo.test'), 'resposta',
  'a reply asking to leave registers the suppression');
update private.sequence_documents set document = document || '{"motivoPause": "Contato respondeu"}'::jsonb
where sequence_id = (select valor::uuid from ids where chave = 'sequencia');
select is((select document ->> 'motivoPause' from private.sequence_documents where sequence_id = (select valor::uuid from ids where chave = 'sequencia')),
  'Descadastro', 'the ingestion pause after the reply keeps Descadastro as the reason');
select is((select count(*)::int from private.reply_proposals where origin_interaction_id = (select valor::uuid from ids where chave = 'interacao')),
  0, 'a reply asking to leave does not get a reply proposal');

-- Uma resposta comum continua gerando a Proposta (controle) e não suprime ninguém.
with i as (
  insert into public.account_interactions (workspace_id, target_account_id, contact_id, kind, occurred_at, source, recorded_by)
  values ('51000000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'conta'),
    (select valor::uuid from ids where chave = 'joao'), 'email-recebido', now(), 'sequencia', '50000000-0000-0000-0000-000000000001')
  returning id)
insert into ids select 'interacao-joao', id::text from i;
insert into private.received_emails (interaction_id, workspace_id, owner_user_id, sequence_id, contact_id, sender_account_id,
  provider_email_id, from_email, subject, body, received_at)
values ((select valor::uuid from ids where chave = 'interacao-joao'), '51000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'sequencia'),
  (select valor::uuid from ids where chave = 'joao'),
  (select id from private.sender_accounts where unipile_account_id = 'unipile-google-1'),
  'resp-2', 'joao@empresa-alvo.test', 'Ideia', 'Me tire uma dúvida: vocês atendem varejo?', now());
select is((select count(*)::int from private.reply_proposals where origin_interaction_id = (select valor::uuid from ids where chave = 'interacao-joao')),
  1, 'an ordinary reply still gets a reply proposal');
-- Fora da transação da resposta de descadastro, a pausa "Contato respondeu" vale normalmente.
select set_config('althius.descadastro_pela_resposta', '', true);
update private.sequence_documents set document = document || '{"motivoPause": "Contato respondeu"}'::jsonb
where sequence_id = (select valor::uuid from ids where chave = 'sequencia');
select is((select document ->> 'motivoPause' from private.sequence_documents where sequence_id = (select valor::uuid from ids where chave = 'sequencia')),
  'Contato respondeu', 'only the reply that unsubscribed keeps the Descadastro reason');

-- A resposta aprovada não sai para o Contato que se descadastrou depois da Aprovação.
update private.reply_proposals set
  status = 'aprovada', body = 'Oi João, atendemos sim.', approved_revision = revision,
  approved_by = '50000000-0000-0000-0000-000000000001', approved_at = now(), approved_recipient = recipient,
  approved_channel = channel
where origin_interaction_id = (select valor::uuid from ids where chave = 'interacao-joao');
insert into ids select 'proposta-joao', id::text from private.reply_proposals
where origin_interaction_id = (select valor::uuid from ids where chave = 'interacao-joao');
select private.register_suppression('51000000-0000-0000-0000-000000000001', 'joao@empresa-alvo.test',
  (select valor::uuid from ids where chave = 'joao'), null, 'manual');
set local role service_role;
create temporary table resposta_suprimida as select * from public.release_approved_reply(
  (select valor::uuid from ids where chave = 'proposta-joao'), '50000000-0000-0000-0000-000000000001');
reset role;
select is((select outcome from resposta_suprimida), 'contact_suppressed', 'an approved reply is not released to a suppressed contact');
select is((select status from private.reply_proposals where origin_interaction_id = (select valor::uuid from ids where chave = 'interacao-joao')),
  'aprovada', 'the blocked reply is not marked as sending');
delete from public.contact_suppressions where value = 'joao@empresa-alvo.test';
set local role service_role;
create temporary table resposta_liberada as select * from public.release_approved_reply(
  (select valor::uuid from ids where chave = 'proposta-joao'), '50000000-0000-0000-0000-000000000001');
reset role;
select is((select outcome from resposta_liberada), 'released', 'without the suppression, the release works as before');

-- 6. Criação em lote: uma Sequência por Conta-alvo.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);
insert into ids select 'conta-2', id::text from public.save_target_account(
  '51000000-0000-0000-0000-000000000001', 'Segunda', 'https://segunda.test');
insert into ids select 'ana', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta-2'), 'Ana Lima', 'CEO', 'ana@segunda.test');
insert into ids select 'conta-3', id::text from public.save_target_account(
  '51000000-0000-0000-0000-000000000001', 'Terceira', 'https://terceira.test');
create temporary table lote as select * from public.create_sequences_in_batch(
  '51000000-0000-0000-0000-000000000001',
  array[(select valor::uuid from ids where chave = 'conta'), (select valor::uuid from ids where chave = 'conta-2'),
    (select valor::uuid from ids where chave = 'conta-3')],
  jsonb_build_object('steps', jsonb_build_array(
    jsonb_build_object('id', 'l1', 'ordem', 1, 'canal', 'email', 'delayDiasUteis', 0, 'titulo', 'Abertura',
      'assunto', 'Oi {{primeiro_nome}}', 'corpo', 'Sobre a {{empresa}}.'))));
select is((select outcome from lote where target_account_id = (select valor::uuid from ids where chave = 'conta')),
  'sequence_in_progress', 'an account with a sequence in progress is skipped (ADR-0009)');
select is((select outcome from lote where target_account_id = (select valor::uuid from ids where chave = 'conta-3')),
  'no_eligible_contact', 'an account without a contact with e-mail is skipped');
select is((select outcome from lote where target_account_id = (select valor::uuid from ids where chave = 'conta-2')),
  'created', 'one sequence per target account is created from the same cadence');

select * from finish();
rollback;

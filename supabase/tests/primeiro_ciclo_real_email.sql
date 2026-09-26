begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(60);

-- Workspace da empresa com Beto (Membro e Vendedor responsável), Ana (Administradora) e Eva (Membro).
-- Caio é Administrador de outro Workspace.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('70000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('70000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'beto@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('70000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'caio@outro.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('70000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'eva@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('71000000-0000-0000-0000-000000000001', 'empresa', 'Cliente'),
  ('71000000-0000-0000-0000-000000000002', 'empresa', 'Outro');

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'admin', true),
  ('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', 'member', true),
  ('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000005', 'member', true),
  ('71000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000003', 'admin', true);

-- Contas remetentes de E-mail já conectadas e prontas: a do Beto e a da Eva.
insert into private.sender_accounts (id, workspace_id, owner_user_id, channel, unipile_account_id, provider, status) values
  ('72000000-0000-0000-0000-000000000002', '71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', 'email', 'acc-beto-email', 'GOOGLE', 'ready'),
  ('72000000-0000-0000-0000-000000000005', '71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000005', 'email', 'acc-eva-email', 'GOOGLE', 'ready');

create temporary table ids (nome text primary key, id uuid) on commit drop;
create temporary table reservas (nome text primary key, reserva jsonb) on commit drop;
grant all on ids, reservas to authenticated, service_role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Beto responde pela Alfa e pela Beta. Maria e João são Contatos da Alfa; Pedro, da Beta.
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000002', true);
insert into ids select 'alfa', id from public.save_target_account('71000000-0000-0000-0000-000000000001', 'Alfa', 'alfa.com.br');
insert into ids select 'beta', id from public.save_target_account('71000000-0000-0000-0000-000000000001', 'Beta', 'beta.com.br');
insert into ids select 'maria', id from public.create_contact((select id from ids where nome = 'alfa'), 'Maria Souza', 'CFO', 'Maria@Alfa.com.br');
insert into ids select 'joao', id from public.create_contact((select id from ids where nome = 'alfa'), 'João Lima', 'CTO', 'joao@alfa.com.br');
insert into ids select 'pedro', id from public.create_contact((select id from ids where nome = 'beta'), 'Pedro Reis', 'CEO', 'pedro@beta.com.br');

insert into ids select 'seq-alfa', id from public.create_sequence(
  '71000000-0000-0000-0000-000000000001', (select id::text from ids where nome = 'alfa'),
  jsonb_build_object(
    'participantesIds', jsonb_build_array((select id from ids where nome = 'maria'), (select id from ids where nome = 'joao')),
    'steps', jsonb_build_array(
      jsonb_build_object('id', 'a1', 'ordem', 1, 'canal', 'email', 'contatoId', (select id from ids where nome = 'maria'),
        'delayDiasUteis', 0, 'titulo', 'Abertura', 'assunto', 'Proposta para a Alfa', 'corpo', 'Olá, Maria.'),
      jsonb_build_object('id', 'a2', 'ordem', 2, 'canal', 'email', 'contatoId', (select id from ids where nome = 'joao'),
        'delayDiasUteis', 2, 'titulo', 'Seguimento', 'assunto', 'Seguimento', 'corpo', 'Olá, João.'),
      jsonb_build_object('id', 'a3', 'ordem', 3, 'canal', 'linkedin', 'contatoId', (select id from ids where nome = 'maria'),
        'delayDiasUteis', 3, 'titulo', 'Convite', 'subtipoLinkedIn', 'convite', 'corpo', 'Vamos conversar?'),
      jsonb_build_object('id', 'a4', 'ordem', 4, 'canal', 'email', 'contatoId', (select id from ids where nome = 'maria'),
        'delayDiasUteis', 5, 'titulo', 'Último', 'assunto', 'Último contato', 'corpo', 'Maria, encerro por aqui?'))));

insert into ids select 'seq-beta', id from public.create_sequence(
  '71000000-0000-0000-0000-000000000001', (select id::text from ids where nome = 'beta'),
  jsonb_build_object(
    'participantesIds', jsonb_build_array((select id from ids where nome = 'pedro')),
    'steps', jsonb_build_array(
      jsonb_build_object('id', 'b1', 'ordem', 1, 'canal', 'email', 'contatoId', (select id from ids where nome = 'pedro'),
        'delayDiasUteis', 0, 'titulo', 'Abertura', 'assunto', 'Proposta para a Beta', 'corpo', 'Olá, Pedro.'),
      jsonb_build_object('id', 'b2', 'ordem', 2, 'canal', 'email', 'contatoId', (select id from ids where nome = 'pedro'),
        'delayDiasUteis', 2, 'titulo', 'Seguimento', 'assunto', 'Seguimento Beta', 'corpo', 'Pedro, conseguiu ver?'))));

-- Confirmar o passo fixa o Destino do Contato e a Conta remetente do responsável.
select public.confirm_email_step((select id from ids where nome = 'seq-alfa'), 'a1');
select results_eq(
  $$select step_id, status, destination from public.list_owned_step_sends((select id from ids where nome = 'seq-alfa'))$$,
  $$values ('a1', 'confirmed', 'maria@alfa.com.br')$$,
  'o responsável confirma o passo de E-mail e o Destino atual do Contato fica fixado');

insert into ids select 'envio-a1', id from public.list_owned_step_sends((select id from ids where nome = 'seq-alfa')) where step_id = 'a1';

select throws_ok(
  $$select public.confirm_email_step((select id from ids where nome = 'seq-alfa'), 'a3')$$,
  '22023', 'only email steps can be sent for now',
  'passo de LinkedIn ainda não tem envio real');
select throws_ok(
  $$select public.confirm_email_step((select id from ids where nome = 'seq-alfa'), 'a2', '72000000-0000-0000-0000-000000000005')$$,
  '42501', 'no ready email sender account owned by the responsible seller',
  'o responsável não usa a Conta remetente de outro participante');

select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000005', true);
select throws_ok(
  $$select public.confirm_email_step((select id from ids where nome = 'seq-alfa'), 'a2')$$,
  '42501', 'sequence not found or not owned by active user',
  'outro Membro não confirma passo da Sequência alheia');
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.confirm_email_step((select id from ids where nome = 'seq-alfa'), 'a2')$$,
  '42501', 'sequence not found or not owned by active user',
  'o Administrador também não confirma passo da Sequência alheia');

-- Quem executa o envio reserva o passo e recebe o que confirmou o responsável.
reset role;
set local role service_role;
insert into reservas select 'a1', public.claim_step_send(
  (select id from ids where nome = 'envio-a1'), '70000000-0000-0000-0000-000000000002');
select results_eq(
  $$select reserva ->> 'outcome', reserva ->> 'unipile_account_id', reserva ->> 'destination',
      reserva ->> 'display_name', reserva ->> 'subject', reserva ->> 'body'
    from reservas where nome = 'a1'$$,
  $$values ('claimed', 'acc-beto-email', 'maria@alfa.com.br', 'Maria Souza', 'Proposta para a Alfa', 'Olá, Maria.')$$,
  'a reserva entrega o Destino, o conteúdo e a Conta remetente confirmados');
select is(public.claim_step_send((select id from ids where nome = 'envio-a1'), '70000000-0000-0000-0000-000000000002') ->> 'outcome',
  'in_progress', 'um passo reservado não é reservado de novo enquanto o envio está em andamento');

-- O provedor aceitou: o resultado fica persistido como aceitação, e o envio vira uma Interação do Workspace.
select is(public.record_step_send_result((select id from ids where nome = 'envio-a1'), 'accepted', 'trk-a1', null) ->> 'status',
  'accepted', 'a aceitação do provedor fica registrada');
select is(public.claim_step_send((select id from ids where nome = 'envio-a1'), '70000000-0000-0000-0000-000000000002') ->> 'outcome',
  'already_accepted', 'um passo aceito pelo provedor não é enviado de novo');
select is(public.record_step_send_result((select id from ids where nome = 'envio-a1'), 'uncertain', null, 'timeout') ->> 'status',
  'accepted', 'um resultado tardio não desfaz a aceitação já registrada');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000005', true);
select results_eq(
  $$select kind, source, contact_id from public.account_interactions where target_account_id = (select id from ids where nome = 'alfa')$$,
  $$values ('email-enviado', 'sequencia', (select id from ids where nome = 'maria'))$$,
  'os participantes veem a Interação do envio, sem assunto nem corpo');
select throws_ok(
  $$select * from public.list_owned_step_sends((select id from ids where nome = 'seq-alfa'))$$,
  '42501', 'sequence not found or not owned by active user',
  'outro Membro não consulta os envios da Sequência alheia');

-- ADR-0014: um Administrador muda o e-mail do João depois da confirmação.
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000002', true);
select public.confirm_email_step((select id from ids where nome = 'seq-alfa'), 'a2');
insert into ids select 'envio-a2', id from public.list_owned_step_sends((select id from ids where nome = 'seq-alfa')) where step_id = 'a2';
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000001', true);
select public.update_contact((select id from ids where nome = 'joao'), p_email => 'joao.lima@alfa.com.br');
reset role;
set local role service_role;
select is(public.claim_step_send((select id from ids where nome = 'envio-a2'), '70000000-0000-0000-0000-000000000002'),
  '{"outcome": "awaiting_reconfirmation"}'::jsonb,
  'Destino mudado pelo Administrador: o passo não sai nem para o antigo nem para o novo');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000002', true);
select results_eq(
  $$select status, status_reason, destination from public.list_owned_step_sends((select id from ids where nome = 'seq-alfa')) where step_id = 'a2'$$,
  $$values ('awaiting_reconfirmation', 'destination_changed', 'joao@alfa.com.br')$$,
  'o passo aguarda a reconfirmação do responsável');
select is(public.confirm_email_step((select id from ids where nome = 'seq-alfa'), 'a2') ->> 'destination',
  'joao.lima@alfa.com.br', 'a reconfirmação fixa o Destino novo');
reset role;
set local role service_role;
select is(public.claim_step_send((select id from ids where nome = 'envio-a2'), '70000000-0000-0000-0000-000000000002') ->> 'destination',
  'joao.lima@alfa.com.br', 'depois da reconfirmação o passo sai para o Destino novo');

-- Importação ou enriquecimento mudam o e-mail do Pedro por fora das RPCs.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000002', true);
select public.confirm_email_step((select id from ids where nome = 'seq-beta'), 'b1');
insert into ids select 'envio-b1', id from public.list_owned_step_sends((select id from ids where nome = 'seq-beta')) where step_id = 'b1';
reset role;
update public.contacts set email = 'pedro@enriquecido.com.br' where id = (select id from ids where nome = 'pedro');
set local role service_role;
select is(public.claim_step_send((select id from ids where nome = 'envio-b1'), '70000000-0000-0000-0000-000000000002'),
  '{"outcome": "awaiting_reconfirmation"}'::jsonb,
  'Destino mudado por importação ou enriquecimento também exige reconfirmação');

-- Resultado incerto: nada é reenviado antes da reconciliação e da decisão do titular.
reset role;
update public.contacts set email = 'pedro@beta.com.br' where id = (select id from ids where nome = 'pedro');
set local role authenticated;
select public.confirm_email_step((select id from ids where nome = 'seq-beta'), 'b1');
reset role;
set local role service_role;
insert into reservas select 'b1', public.claim_step_send((select id from ids where nome = 'envio-b1'), '70000000-0000-0000-0000-000000000002');
select public.record_step_send_result((select id from ids where nome = 'envio-b1'), 'uncertain', null, 'timeout');
select is(public.claim_step_send((select id from ids where nome = 'envio-b1'), '70000000-0000-0000-0000-000000000002') ->> 'outcome',
  'needs_reconciliation', 'um envio incerto não é reservado de novo');
reset role;
set local role authenticated;
select throws_ok(
  $$select public.resolve_uncertain_step_send((select id from ids where nome = 'envio-b1'))$$,
  '22023', 'reconcile with the provider before deciding',
  'o titular só decide depois de a Althius reconciliar com o provedor');
reset role;
set local role service_role;
select is(public.reconcile_step_send((select id from ids where nome = 'envio-b1'), false, null, null, null) ->> 'status',
  'uncertain', 'sem prova no provedor, o envio continua incerto');
reset role;
set local role authenticated;
select public.resolve_uncertain_step_send((select id from ids where nome = 'envio-b1'));
reset role;
set local role service_role;
select is(public.claim_step_send((select id from ids where nome = 'envio-b1'), '70000000-0000-0000-0000-000000000002') ->> 'idempotency_key',
  (select reserva ->> 'idempotency_key' from reservas where nome = 'b1'),
  'o reenvio decidido pelo titular mantém a mesma chave de idempotência');
select is(public.record_step_send_result((select id from ids where nome = 'envio-b1'), 'uncertain', null, 'http_503') ->> 'status',
  'uncertain', 'um novo resultado incerto volta a travar o passo');
select is(public.reconcile_step_send((select id from ids where nome = 'envio-b1'), true, 'trk-b1', 'email-b1', '<b1@mail.beto>') ->> 'status',
  'accepted', 'a reconciliação que acha o e-mail no provedor registra a aceitação');

-- Webhook v1 de e-mail. Antes da resposta, o responsável confirma mais um passo em cada Conta-alvo.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000002', true);
select public.confirm_email_step((select id from ids where nome = 'seq-alfa'), 'a4');
select public.confirm_email_step((select id from ids where nome = 'seq-beta'), 'b2');
insert into ids select 'envio-a4', id from public.list_owned_step_sends((select id from ids where nome = 'seq-alfa')) where step_id = 'a4';
insert into ids select 'envio-b2', id from public.list_owned_step_sends((select id from ids where nome = 'seq-beta')) where step_id = 'b2';

reset role;
set local role service_role;
create temporary table eventos (nome text primary key, evento jsonb) on commit drop;

-- O eco do próprio envio (mail_sent) guarda a identidade da mensagem e não é resposta.
insert into eventos select 'eco-a1', public.record_unipile_mail_event(jsonb_build_object(
  'event', 'mail_sent', 'account_id', 'acc-beto-email', 'email_id', 'email-a1', 'message_id', '<a1@mail.beto>',
  'tracking_id', 'trk-a1', 'role', 'sent', 'origin', 'unipile', 'date', '2026-09-28T12:00:00.000Z',
  'from_attendee', jsonb_build_object('identifier', 'Beto@Cliente.com.br'),
  'to_attendees', jsonb_build_array(jsonb_build_object('identifier', 'maria@alfa.com.br')),
  'subject', 'Proposta para a Alfa', 'body', '<p>Olá, Maria.</p>'));
select is(public.process_unipile_mail_event((select (evento ->> 'event_id')::uuid from eventos where nome = 'eco-a1')) ->> 'result',
  'own_send_matched', 'mail_sent do próprio envio é reconhecido como eco, não como resposta');

-- A resposta real da Maria na mesma conversa.
insert into eventos select 'resposta-maria', public.record_unipile_mail_event(jsonb_build_object(
  'event', 'mail_received', 'account_id', 'acc-beto-email', 'email_id', 'email-r1', 'message_id', '<r1@alfa.com.br>',
  'role', 'inbox', 'origin', 'external', 'date', '2026-09-28T15:30:00.000Z',
  'in_reply_to', jsonb_build_object('message_id', '<a1@mail.beto>', 'id', 'email-a1'),
  'from_attendee', jsonb_build_object('identifier', 'maria@alfa.com.br', 'display_name', 'Maria Souza'),
  'to_attendees', jsonb_build_array(jsonb_build_object('identifier', 'beto@cliente.com.br')),
  'subject', 'Re: Proposta para a Alfa', 'body', '<p>Tenho interesse, vamos falar?</p>',
  'body_plain', 'Tenho interesse, vamos falar?', 'has_attachments', true,
  'attachments', jsonb_build_array(jsonb_build_object('id', 'att-1', 'name', 'requisitos.pdf', 'size', 1024,
    'extension', 'pdf', 'mime', 'application/pdf'))));
select is((select evento ->> 'is_new' from eventos where nome = 'resposta-maria'), 'true',
  'o webhook fica persistido antes do processamento');
select is(public.record_unipile_mail_event(jsonb_build_object(
    'event', 'mail_received', 'account_id', 'acc-beto-email', 'email_id', 'email-r1', 'message_id', '<r1@alfa.com.br>',
    'from_attendee', jsonb_build_object('identifier', 'maria@alfa.com.br'))),
  jsonb_build_object('event_id', (select evento -> 'event_id' from eventos where nome = 'resposta-maria'), 'is_new', false),
  'a entrega repetida do mesmo evento não cria outro registro');
select is((select status from public.sequences where id = (select id from ids where nome = 'seq-alfa')), 'ativa',
  'persistir o evento não pausa nada antes do processamento');
select is(public.process_unipile_mail_event((select (evento ->> 'event_id')::uuid from eventos where nome = 'resposta-maria')) ->> 'result',
  'reply_recorded', 'a resposta de um Contato da Conta-alvo é registrada');

select is((select status from public.sequences where id = (select id from ids where nome = 'seq-alfa')), 'pausada',
  'a resposta pausa a Sequência da Conta-alvo');
select is(public.claim_step_send((select id from ids where nome = 'envio-a4'), '70000000-0000-0000-0000-000000000002'),
  '{"outcome": "invalidated"}'::jsonb, 'os passos pendentes da Conta-alvo ficam invalidados');
select is(public.record_step_send_result((select id from ids where nome = 'envio-a2'), 'accepted', 'trk-a2', null) ->> 'status',
  'accepted', 'um envio que já estava no provedor é registrado, sem fingir cancelamento');
select is((select status from public.sequences where id = (select id from ids where nome = 'seq-beta')), 'ativa',
  'a Sequência de outra Conta-alvo continua ativa');
select is(public.claim_step_send((select id from ids where nome = 'envio-b2'), '70000000-0000-0000-0000-000000000002') ->> 'outcome',
  'claimed', 'e os passos dela continuam enviáveis');
select public.record_step_send_result((select id from ids where nome = 'envio-b2'), 'accepted', 'trk-b2', null);

-- Só o responsável lê o conteúdo; os demais veem o evento e o status.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000002', true);
select results_eq(
  $$select direction, subject, body_plain, attachments -> 0 ->> 'name', contact_id
    from public.list_owned_sequence_messages((select id from ids where nome = 'seq-alfa'))$$,
  $$values ('inbound', 'Re: Proposta para a Alfa', 'Tenho interesse, vamos falar?', 'requisitos.pdf', (select id from ids where nome = 'maria'))$$,
  'o responsável lê assunto, corpo e anexos da resposta');
select is((public.get_owned_sequence((select id from ids where nome = 'seq-alfa'))).public_summary -> '_document' ->> 'motivoPause',
  'Contato respondeu', 'o documento do responsável registra o motivo da pausa');

select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000005', true);
select throws_ok(
  $$select * from public.list_owned_sequence_messages((select id from ids where nome = 'seq-alfa'))$$,
  '42501', 'sequence not found or not owned by active user',
  'outro Membro não lê a resposta');
select results_eq(
  $$select kind, sequence_id from public.sequence_events where target_account_id = (select id::text from ids where nome = 'alfa')$$,
  $$values ('contato-respondeu', (select id from ids where nome = 'seq-alfa'))$$,
  'outro Membro vê o evento Contato respondeu; sequência pausada');
select is((select public_summary ->> 'status' from public.sequences where id = (select id from ids where nome = 'seq-alfa')),
  'pausada', 'e o status pausado no resumo público');
select results_eq(
  $$select kind, contact_id from public.account_interactions
    where target_account_id = (select id from ids where nome = 'alfa') and kind = 'email-recebido'$$,
  $$values ('email-recebido', (select id from ids where nome = 'maria'))$$,
  'a resposta vira uma Interação do Workspace, sem conteúdo');
select is((select count(*)::int from information_schema.columns
  where table_schema = 'public' and table_name = 'sequence_events'
    and column_name ~ 'subject|body|attachment|summary|content|message'), 0,
  'o evento compartilhado não tem colunas de conteúdo');

select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select * from public.list_owned_sequence_messages((select id from ids where nome = 'seq-alfa'))$$,
  '42501', 'sequence not found or not owned by active user',
  'o Administrador também não lê a resposta');
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000003', true);
select is((select count(*)::int from public.sequence_events), 0, 'outro Workspace não vê o evento');

-- Repetição e ordem trocada não duplicam Interação, evento nem contagem.
reset role;
set local role service_role;
select is(public.process_unipile_mail_event((select (evento ->> 'event_id')::uuid from eventos where nome = 'resposta-maria')) ->> 'result',
  'reply_recorded', 'processar de novo o mesmo evento devolve o mesmo resultado');
select is(public.process_unipile_mail_event((public.record_unipile_mail_event(jsonb_build_object(
    'event', 'mail_received', 'account_id', 'acc-beto-email', 'email_id', 'email-r1-resync', 'message_id', '<r1@alfa.com.br>',
    'role', 'inbox', 'date', '2026-09-28T15:30:00.000Z',
    'from_attendee', jsonb_build_object('identifier', 'maria@alfa.com.br'),
    'subject', 'Re: Proposta para a Alfa', 'body_plain', 'Tenho interesse, vamos falar?')) ->> 'event_id')::uuid) ->> 'result',
  'duplicate_message', 'a mesma mensagem reentregue com outro email_id é reconhecida como repetida');
select is(public.process_unipile_mail_event((public.record_unipile_mail_event(jsonb_build_object(
    'event', 'mail_moved', 'account_id', 'acc-beto-email', 'email_id', 'email-r1', 'message_id', '<r1@alfa.com.br>',
    'role', 'archive', 'from_attendee', jsonb_build_object('identifier', 'maria@alfa.com.br'))) ->> 'event_id')::uuid) ->> 'result',
  'ignored_moved', 'mail_moved não é resposta');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000005', true);
select is((select count(*)::int from public.sequence_events), 1, 'continua um único evento compartilhado');
select is((select count(*)::int from public.account_interactions where kind = 'email-recebido'), 1,
  'continua uma única Interação de resposta');

-- Mensagens do próprio titular não pausam a Sequência da Beta.
reset role;
set local role service_role;
select is(public.process_unipile_mail_event((public.record_unipile_mail_event(jsonb_build_object(
    'event', 'mail_sent', 'account_id', 'acc-beto-email', 'email_id', 'email-manual', 'message_id', '<manual@mail.beto>',
    'role', 'sent', 'origin', 'external', 'from_attendee', jsonb_build_object('identifier', 'beto@cliente.com.br'),
    'to_attendees', jsonb_build_array(jsonb_build_object('identifier', 'pedro@beta.com.br')),
    'subject', 'Uma ideia', 'body_plain', 'Pedro, escrevi pelo Gmail.')) ->> 'event_id')::uuid) ->> 'result',
  'own_message', 'e-mail que o titular mandou por fora da Althius não é resposta');
select is(public.process_unipile_mail_event((public.record_unipile_mail_event(jsonb_build_object(
    'event', 'mail_received', 'account_id', 'acc-beto-email', 'email_id', 'email-copia', 'message_id', '<copia@mail.beto>',
    'role', 'inbox', 'from_attendee', jsonb_build_object('identifier', 'beto@cliente.com.br'),
    'to_attendees', jsonb_build_array(jsonb_build_object('identifier', 'pedro@beta.com.br')),
    'subject', 'Uma ideia', 'body_plain', 'Cópia para mim.')) ->> 'event_id')::uuid) ->> 'result',
  'own_message', 'a cópia que chega à caixa do próprio titular também não é resposta');
select is((select status from public.sequences where id = (select id from ids where nome = 'seq-beta')), 'ativa',
  'a Sequência da Beta segue ativa depois das mensagens do titular');

-- Conversa pessoal não vira registro, e o conteúdo bruto do webhook não fica guardado.
select is(public.process_unipile_mail_event((public.record_unipile_mail_event(jsonb_build_object(
    'event', 'mail_received', 'account_id', 'acc-beto-email', 'email_id', 'email-amigo', 'message_id', '<churrasco@gmail.com>',
    'role', 'inbox', 'from_attendee', jsonb_build_object('identifier', 'amigo@gmail.com'),
    'subject', 'Churrasco', 'body_plain', 'Sábado lá em casa?')) ->> 'event_id')::uuid) ->> 'result',
  'ignored_unrelated', 'e-mail pessoal sem relação com a Sequência é ignorado');
reset role;
select is((select count(*)::int from private.unipile_mail_events where payload is not null), 0,
  'nenhum conteúdo bruto de webhook fica guardado depois do processamento');
set local role service_role;
select is(public.process_unipile_mail_event((public.record_unipile_mail_event(jsonb_build_object(
    'event', 'mail_received', 'account_id', 'acc-desconhecida', 'email_id', 'email-x',
    'from_attendee', jsonb_build_object('identifier', 'maria@alfa.com.br'))) ->> 'event_id')::uuid) ->> 'result',
  'unknown_account', 'evento de conta externa que não é Conta remetente é ignorado');

-- Um evento persistido e não processado é retomado depois, sem duplicar nada.
select public.record_unipile_mail_event(jsonb_build_object(
  'event', 'mail_received', 'account_id', 'acc-beto-email', 'email_id', 'email-r2', 'message_id', '<r2@beta.com.br>',
  'role', 'inbox', 'date', '2026-09-29T10:00:00.000Z',
  'in_reply_to', jsonb_build_object('message_id', '<b1@mail.beto>', 'id', 'email-b1'),
  'from_attendee', jsonb_build_object('identifier', 'pedro@beta.com.br'),
  'subject', 'Re: Proposta para a Beta', 'body_plain', 'Agora não, obrigado.'));
select is(public.process_pending_unipile_mail_events(10) ->> 'processed', '1',
  'o processamento posterior retoma os eventos pendentes');
select is((select status from public.sequences where id = (select id from ids where nome = 'seq-beta')), 'pausada',
  'uma resposta negativa também pausa a Sequência');
select is(public.process_pending_unipile_mail_events(10) ->> 'processed', '0',
  'nada é processado duas vezes');
select throws_ok(
  $$select public.record_unipile_mail_event('{"event": "message_received", "account_id": "a", "email_id": "b"}'::jsonb)$$,
  '22023', 'unsupported email webhook event',
  'somente eventos de e-mail v1 são aceitos por este webhook');

reset role;
set local role authenticated;
select throws_ok(
  $$select public.record_unipile_mail_event('{"event": "mail_received", "account_id": "acc-beto-email", "email_id": "forjado"}'::jsonb)$$,
  '42501', 'permission denied for function record_unipile_mail_event',
  'um usuário não forja eventos do webhook');

select throws_ok(
  $$select public.claim_step_send((select id from ids where nome = 'envio-b2'), '70000000-0000-0000-0000-000000000002')$$,
  '42501', 'permission denied for function claim_step_send',
  'um usuário não reserva envios pela API');
select throws_ok(
  $$select public.get_step_send_for_reconciliation((select id from ids where nome = 'envio-b2'), '70000000-0000-0000-0000-000000000002')$$,
  '42501', 'permission denied for function get_step_send_for_reconciliation',
  'nem lê a Conta remetente de um envio pela API');

select * from finish();
rollback;

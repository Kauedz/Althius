begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(131);

-- A chamada HTTP do Executor das propostas fica sob controle do teste, só dentro desta transação.
create temporary table chamadas (url text, token text);
create or replace function private.post_to_reply_proposal_runner(p_url text, p_token text) returns void
language sql security definer set search_path = '' as $f$
  insert into pg_temp.chamadas values (p_url, p_token);
$f$;

-- Ana é a titular (Vendedora responsável, Membro); Bruno é Administrador do mesmo Workspace; Carla é Membro; Dora é do Sul.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('68000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{"full_name": "Ana Vendas"}', false, false),
  ('68000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('68000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('68000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'dora@sul.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('69000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('69000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('69000000-0000-0000-0000-000000000001', '68000000-0000-0000-0000-000000000001', 'member', true),
  ('69000000-0000-0000-0000-000000000001', '68000000-0000-0000-0000-000000000002', 'admin', true),
  ('69000000-0000-0000-0000-000000000001', '68000000-0000-0000-0000-000000000003', 'member', true),
  ('69000000-0000-0000-0000-000000000002', '68000000-0000-0000-0000-000000000004', 'admin', true);

create temporary table ids (chave text primary key, valor text);
grant all on ids to authenticated, service_role;

create function pg_temp.sou(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true)
$$;
grant execute on function pg_temp.sou(uuid) to authenticated, service_role;

-- Um e-mail no formato do objeto Email da Unipile v2.
create function pg_temp.email(p_id text, p_thread text, p_from text, p_subject text, p_headers jsonb default '[]'::jsonb,
  p_message_id text default null, p_body text default null)
returns jsonb language sql as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', p_id, 'message_id', p_message_id, 'thread_id', p_thread,
    'subject', p_subject, 'body', coalesce(p_body, 'Corpo de ' || p_subject), 'snippet', left(coalesce(p_body, 'Corpo de ' || p_subject), 20),
    'date', (now() + interval '1 minute')::text,
    'from', jsonb_build_array(jsonb_build_object('email', p_from, 'display_name', split_part(p_from, '@', 1))),
    'to', jsonb_build_array(jsonb_build_object('email', 'ana@norte.test')),
    'headers', p_headers, 'attachments', '[]'::jsonb))
$$;
grant execute on function pg_temp.email(text, text, text, text, jsonb, text, text) to service_role, authenticated;

-- Um id guardado em ids.
create function pg_temp.i(p_chave text) returns uuid language sql as $$
  select valor::uuid from pg_temp.ids where chave = p_chave
$$;
grant execute on function pg_temp.i(text) to service_role, authenticated;

-- A proposta de uma mensagem de origem, por qualquer papel (lê o schema privado).
create function pg_temp.proposta(p_interacao uuid) returns uuid language sql security definer as $$
  select id from private.reply_proposals where origin_interaction_id = p_interacao
$$;
create function pg_temp.estado(p_proposta uuid) returns text language sql security definer as $$
  select status from private.reply_proposals where id = p_proposta
$$;
grant execute on function pg_temp.proposta(uuid), pg_temp.estado(uuid) to service_role, authenticated;

-- Uma proposta já aprovada (por dentro do banco), numa conversa nova, para as revalidações do envio.
create function pg_temp.aprovada(p_n integer) returns uuid language plpgsql as $$
declare
  v_interacao uuid := gen_random_uuid();
  v_id uuid;
begin
  insert into public.account_interactions (id, workspace_id, target_account_id, contact_id, kind, recorded_by)
  values (v_interacao, '69000000-0000-0000-0000-000000000001', (select valor::uuid from pg_temp.ids where chave = 'conta'),
    (select valor::uuid from pg_temp.ids where chave = 'maria'), 'email-recebido', '68000000-0000-0000-0000-000000000001');
  insert into private.received_emails (interaction_id, workspace_id, owner_user_id, sequence_id, contact_id, sender_account_id,
    provider_email_id, provider_message_id, provider_thread_id, from_email, subject, body, received_at)
  values (v_interacao, '69000000-0000-0000-0000-000000000001', '68000000-0000-0000-0000-000000000001',
    (select valor::uuid from pg_temp.ids where chave = 'sequencia'), (select valor::uuid from pg_temp.ids where chave = 'maria'),
    (select id from private.sender_accounts where unipile_account_id = 'unipile-google-9'),
    'email-x' || p_n, '<m-x' || p_n || '@empresa-alvo.test>', 'thread-x' || p_n, 'maria@empresa-alvo.test',
    'Dúvida ' || p_n, 'Pode me explicar o item ' || p_n || '?', now());
  select p.id into v_id from private.reply_proposals p where p.origin_interaction_id = v_interacao;
  update private.reply_proposals set
    status = 'aprovada', body = 'Resposta ' || p_n, revision = 1, approved_revision = 1,
    approved_by = '68000000-0000-0000-0000-000000000001', approved_at = now(),
    approved_recipient = recipient, approved_channel = channel
  where id = v_id;
  return v_id;
end
$$;
grant execute on function pg_temp.aprovada(integer) to service_role, authenticated;
grant all on pg_temp.chamadas to service_role, authenticated;

-- Ana prepara a Sequência real: Conta-alvo, dois Contatos, a Sequência, a Conta remetente de E-mail pronta e um passo enviado.
set local role authenticated;
select pg_temp.sou('68000000-0000-0000-0000-000000000001');
insert into ids select 'conta', id::text from public.save_target_account(
  '69000000-0000-0000-0000-000000000001', 'Empresa Alvo', 'https://empresa-alvo.test');
insert into ids select 'maria', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta'), 'Maria Souza', 'Diretora', 'maria@empresa-alvo.test');
insert into ids select 'pedro', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta'), 'Pedro Lima', 'Gerente', 'pedro@empresa-alvo.test');
insert into ids select 'sequencia', id::text from public.create_sequence(
  '69000000-0000-0000-0000-000000000001',
  (select valor from ids where chave = 'conta'),
  jsonb_build_object('participantesIds', jsonb_build_array((select valor from ids where chave = 'maria')),
    'steps', jsonb_build_array(
      jsonb_build_object('id', 'passo-1', 'ordem', 1, 'canal', 'email', 'contatoId', (select valor from ids where chave = 'maria'),
        'delayDiasUteis', 0, 'titulo', 'Abertura', 'assunto', 'Apresentação', 'corpo', 'Olá, Maria.'))),
  '{}'::jsonb);
insert into ids select 'tentativa', attempt_id::text from public.create_sender_connection_attempt(
  '69000000-0000-0000-0000-000000000001', 'email', null);
reset role;
set local role service_role;
select public.complete_sender_connection_attempt(
  (select valor::uuid from ids where chave = 'tentativa'), 'unipile-google-9', 'GOOGLE', 'CREATION_SUCCESS');
select public.apply_unipile_sender_status('unipile-google-9', 'SYNC_SUCCESS');
reset role;
set local role authenticated;
select pg_temp.sou('68000000-0000-0000-0000-000000000001');
insert into ids select 'envio-1', id::text from public.confirm_sequence_step((select valor::uuid from ids where chave = 'sequencia'), 'passo-1');
reset role;
set local role service_role;
select outcome from public.release_sequence_step_send((select valor::uuid from ids where chave = 'envio-1'), '68000000-0000-0000-0000-000000000001');
select public.record_sequence_step_send_result((select valor::uuid from ids where chave = 'envio-1'), 'sent', 'email-abc', '<msg-1@mail.gmail.com>', null);
select outcome from public.ingest_unipile_email_event(
  'evt-1', 'email.new', 'unipile-google-9',
  pg_temp.email('email-abc', 'thread-1', 'ana@norte.test', 'Apresentação', p_message_id => '<msg-1@mail.gmail.com>'),
  array['ana@norte.test']);
reset role;

-- O Playbook do Workspace: a Empresa e o ICP entram no contexto; o Mercado, não (não é seção do Rhetor).
insert into private.playbook_section_versions (workspace_id, section, version, content) values
  ('69000000-0000-0000-0000-000000000001', 'empresa', 1, '{"texto": "Vendemos software de planejamento."}'),
  ('69000000-0000-0000-0000-000000000001', 'icp', 1, '{"texto": "Construtoras de médio porte."}'),
  ('69000000-0000-0000-0000-000000000001', 'mercado', 1, '{"texto": "Mercado reservado ao Scopus."}');

-- 1. Ninguém lê as tabelas por fora; decidir é do app (titular), gerar e enviar são do servidor, nada para anon.
select ok(
  not has_table_privilege('authenticated', 'private.reply_proposals', 'select')
    and not has_table_privilege('service_role', 'private.reply_proposals', 'select')
    and not has_table_privilege('authenticated', 'private.reply_proposal_jobs', 'select')
    and not has_table_privilege('service_role', 'private.reply_proposal_jobs', 'select')
    and has_function_privilege('authenticated', 'public.approve_reply_proposal(uuid, integer)', 'execute')
    and has_function_privilege('authenticated', 'public.list_reply_proposals(uuid, uuid)', 'execute')
    and not has_function_privilege('anon', 'public.approve_reply_proposal(uuid, integer)', 'execute')
    and not has_function_privilege('anon', 'public.list_reply_proposals(uuid, uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.release_approved_reply(uuid, uuid, text[])', 'execute')
    and not has_function_privilege('authenticated', 'public.record_reply_send_result(uuid, text, text, text, text, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.claim_reply_proposal_jobs(integer)', 'execute')
    and not has_function_privilege('authenticated', 'public.save_generated_reply(uuid, uuid, text, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.reply_proposal_runner_token_matches(text)', 'execute')
    and has_function_privilege('service_role', 'public.release_approved_reply(uuid, uuid, text[])', 'execute')
    and has_function_privilege('service_role', 'public.claim_reply_proposal_jobs(integer)', 'execute'),
  'as permissões: tabelas fechadas, decisão pelo app, geração e envio só pelo servidor'
);

-- 2. Uma resposta comercial válida (a primeira do Contato na conversa do passo enviado) pausa a Sequência e cria UMA
-- proposta "gerando" e UM trabalho, sem enviar nada.
set local role service_role;
create temporary table r1 as select * from public.ingest_unipile_email_event(
  'evt-5', 'email.new', 'unipile-google-9',
  pg_temp.email('email-r1', 'thread-1', 'maria@empresa-alvo.test', 'Re: Apresentação',
    p_message_id => '<msg-r1@empresa-alvo.test>', p_body => 'Olá! Pode mandar o preço para 20 usuários?'),
  array['ana@norte.test']);
grant all on r1 to authenticated, service_role;
reset role;
select is((select outcome from r1), 'reply', 'a resposta do Contato é ingerida como resposta');
select is(
  (select status || '|' || channel || '|' || recipient || '|' || subject || '|' || reply_to_message_id || '|' || revision::text
   from private.reply_proposals where origin_interaction_id = (select interaction_id from r1)),
  'gerando|email|maria@empresa-alvo.test|Re: Apresentação|<msg-r1@empresa-alvo.test>|0',
  'a resposta cria uma proposta gerando, para o remetente, com assunto Re: e a mensagem de origem'
);
select is(
  (select count(*)::integer from private.reply_proposal_jobs j join private.reply_proposals p on p.id = j.proposal_id
   where p.origin_interaction_id = (select interaction_id from r1) and j.status = 'queued'),
  1, 'e um trabalho na fila');
select is((select status from public.sequences where id = (select valor::uuid from ids where chave = 'sequencia')), 'pausada',
  'a Sequência está pausada pela resposta');

-- 3. Idempotência: o mesmo evento, o mesmo e-mail em outra pasta e a criação repetida não duplicam proposta nem trabalho.
set local role service_role;
select outcome from public.ingest_unipile_email_event('evt-5', 'email.new', 'unipile-google-9',
  pg_temp.email('email-r1', 'thread-1', 'maria@empresa-alvo.test', 'Re: Apresentação'), '{}');
select outcome from public.ingest_unipile_email_event('evt-5b', 'email.new', 'unipile-google-9',
  pg_temp.email('email-r1', 'thread-1', 'maria@empresa-alvo.test', 'Re: Apresentação'), '{}');
reset role;
select is(
  (select count(*)::integer from private.reply_proposals) || '/' || (select count(*)::integer from private.reply_proposal_jobs),
  '1/1', 'reentregar o evento ou mover o e-mail não cria outra proposta nem outro trabalho');
select is(
  private.enqueue_reply_proposal('69000000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'sequencia'),
    (select valor::uuid from ids where chave = 'conta'), null, '68000000-0000-0000-0000-000000000001', null, 'email',
    (select interaction_id from r1), 'thread-1', 'maria@empresa-alvo.test', null, null, 'Re: x'),
  pg_temp.proposta((select interaction_id from r1)),
  'pedir de novo a proposta da mesma mensagem devolve a que já existe');
select is(
  (select count(*)::integer from private.reply_proposals) || '/' || (select count(*)::integer from private.reply_proposal_jobs),
  '1/1', 'e continua uma proposta e um trabalho');

-- 4. Sem remetente não há a quem responder: a resposta é gravada e a Sequência pausa, sem proposta e sem erro.
insert into public.account_interactions (id, workspace_id, target_account_id, kind, recorded_by) values
  ('a8100000-0000-0000-0000-000000000001', '69000000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'conta'),
   'email-recebido', '68000000-0000-0000-0000-000000000001');
select lives_ok(
  $$insert into private.received_emails (interaction_id, workspace_id, owner_user_id, sequence_id, sender_account_id, provider_email_id, received_at)
    values ('a8100000-0000-0000-0000-000000000001', '69000000-0000-0000-0000-000000000001', '68000000-0000-0000-0000-000000000001',
      (select valor::uuid from ids where chave = 'sequencia'), (select id from private.sender_accounts where unipile_account_id = 'unipile-google-9'),
      'email-sem-remetente', now())$$,
  'uma resposta sem remetente é gravada sem erro');
select is((select count(*)::integer from private.reply_proposals), 1, 'e não cria proposta');

-- 5. Privacidade: só a titular lê a proposta; Administrador, Membro e outro Workspace não leem nem decidem.
set local role authenticated;
select pg_temp.sou('68000000-0000-0000-0000-000000000001');
select is(
  (select count(*)::integer from public.list_reply_proposals('69000000-0000-0000-0000-000000000001')), 1,
  'a titular vê a proposta na lista do Workspace');
select is(
  (select status || '|' || coalesce(body, '-') || '|' || origin_excerpt from public.list_reply_proposals(
    '69000000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'sequencia'))),
  'gerando|-|Olá! Pode mandar o p', 'e na lista da Sequência, ainda sem texto, com o trecho da mensagem a que responde');
select pg_temp.sou('68000000-0000-0000-0000-000000000002');
select is((select count(*)::integer from public.list_reply_proposals('69000000-0000-0000-0000-000000000001')), 0,
  'o Administrador do Workspace não vê a proposta da titular');
select throws_ok(
  $$select * from public.list_reply_proposals('69000000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'sequencia'))$$,
  '42501', 'sequence not found or not owned by active user', 'nem pela Sequência dela');
select throws_ok(
  $$select * from public.get_reply_proposal(pg_temp.proposta((select interaction_id from r1)))$$,
  '42501', 'only the owner can read the reply proposal', 'o Administrador não lê a proposta');
select throws_ok(
  $$select public.edit_reply_proposal(pg_temp.proposta((select interaction_id from r1)), 0, 'Oi')$$,
  '42501', 'only the owner can decide the reply proposal', 'o Administrador não edita');
select throws_ok(
  $$select public.approve_reply_proposal(pg_temp.proposta((select interaction_id from r1)), 0)$$,
  '42501', 'only the owner can decide the reply proposal', 'nem aprova');
select throws_ok(
  $$select public.reject_reply_proposal(pg_temp.proposta((select interaction_id from r1)))$$,
  '42501', 'only the owner can decide the reply proposal', 'nem rejeita');
select throws_ok(
  $$select public.request_reply_proposal_again(pg_temp.proposta((select interaction_id from r1)))$$,
  '42501', 'only the owner can decide the reply proposal', 'nem gera de novo');
select pg_temp.sou('68000000-0000-0000-0000-000000000003');
select throws_ok(
  $$select * from public.get_reply_proposal(pg_temp.proposta((select interaction_id from r1)))$$,
  '42501', 'only the owner can read the reply proposal', 'um Membro também não lê');
select pg_temp.sou('68000000-0000-0000-0000-000000000004');
select throws_ok(
  $$select * from public.list_reply_proposals('69000000-0000-0000-0000-000000000001')$$,
  '42501', 'active workspace membership required', 'quem é de outro Workspace não lista');
select throws_ok(
  $$select public.approve_reply_proposal(pg_temp.proposta((select interaction_id from r1)), 0)$$,
  '42501', 'only the owner can decide the reply proposal', 'nem aprova');
select throws_ok($$select count(*) from private.reply_proposals$$, '42501', 'permission denied for schema private',
  'nenhum cliente lê a tabela por consulta direta');
reset role;

-- 6. A geração: o trabalho é reservado uma vez só, com um token; o contexto é mínimo.
set local role service_role;
create temporary table reserva as select * from public.claim_reply_proposal_jobs(5);
grant all on reserva to service_role;
select is((select count(*)::integer from reserva) || '/' || (select attempt from reserva), '1/1', 'o Executor reserva o trabalho (tentativa 1)');
select is((select count(*)::integer from public.claim_reply_proposal_jobs(5)), 0, 'e uma segunda reserva não o recebe de novo');
select throws_ok(
  $$select public.reply_proposal_context((select job_id from reserva), gen_random_uuid())$$,
  '55000', 'the reply proposal job is not running for this claim', 'sem o token da reserva não há contexto');
create temporary table contexto as select public.reply_proposal_context((select job_id from reserva), (select claim_token from reserva)) as c;
grant all on contexto to service_role;
select is(
  (select c #>> '{account,name}' || '|' || (c #>> '{contact,name}') || '|' || (c ->> 'seller') || '|' || (c ->> 'subject') from contexto),
  'Empresa Alvo|Maria Souza|Ana Vendas|Re: Apresentação', 'o contexto traz a Conta-alvo, o Contato, a vendedora e o assunto');
select is(
  (select c #>> '{messages,0,direction}' || '/' || (c #>> '{messages,1,direction}') || '/' || jsonb_array_length(c -> 'messages')
   from contexto),
  'enviada/recebida/2', 'e a conversa: o que a vendedora enviou e o que o Contato respondeu');
select ok(
  (select c #>> '{messages,1,text}' from contexto) like 'Olá! Pode mandar o preço%'
    and (select position('Olá, Maria.' in (c #>> '{messages,0,text}')) > 0 from contexto),
  'com o texto das duas mensagens');
select is(
  (select string_agg(x ->> 'section', ',' order by x ->> 'section') from contexto, jsonb_array_elements(c -> 'playbook') x),
  'empresa,icp', 'o Playbook traz a Empresa e o ICP, e não as seções de outras Especialidades');
select ok(
  (select position('pedro' in lower(c::text)) = 0 and position('@' in c::text) = 0 and position('Mercado' in c::text) = 0 from contexto),
  'e nada além do necessário: nem o outro Contato, nem e-mails, nem o Mercado');

-- 7. Créditos pelo mecanismo existente: livre enquanto o Workspace não assinou; depois reserva, debita ao concluir e não cobra duas vezes.
select is((select outcome from public.begin_reply_proposal_round((select job_id from reserva), (select claim_token from reserva))),
  'free', 'sem cobrança ligada a geração é livre');
select public.set_credits_enforced('69000000-0000-0000-0000-000000000001', true);
select is((select outcome from public.begin_reply_proposal_round((select job_id from reserva), (select claim_token from reserva))),
  'no_credits', 'com a cobrança ligada e sem saldo a geração não começa');
select public.grant_credits('69000000-0000-0000-0000-000000000001', 10, 'plano', 'teste');
create temporary table rodada as select * from public.begin_reply_proposal_round((select job_id from reserva), (select claim_token from reserva));
grant all on rodada to service_role;
select is((select outcome from rodada), 'go', 'com saldo a geração reserva o crédito');
select is((select reservation_id from public.begin_reply_proposal_round((select job_id from reserva), (select claim_token from reserva))),
  (select reservation_id from rodada), 'e pedir de novo na mesma tentativa devolve a mesma reserva');
select public.end_agent_round((select reservation_id from rodada), true);
reset role;
select is((select booked from private.credit_totals('69000000-0000-0000-0000-000000000001')), 9.00::numeric,
  'concluída, a geração debita 1 crédito');
set local role service_role;

-- 8. Salvar o texto: só com o token; a proposta fica pronta, na revisão 1, e o trabalho termina.
select throws_ok(
  $$select public.save_generated_reply((select job_id from reserva), gen_random_uuid(), 'Oi')$$,
  '55000', 'the reply proposal job is not running for this claim', 'um token que não é o da reserva não grava o texto');
select throws_ok(
  $$select public.save_generated_reply((select job_id from reserva), (select claim_token from reserva), '   ')$$,
  '22023', 'the generated reply must have between 1 and 20000 characters', 'um texto vazio não vale');
select is(public.save_generated_reply((select job_id from reserva), (select claim_token from reserva),
  'Olá, Maria! Para 20 usuários, o valor é R$ 10.000 por mês.', 'modelo-teste'), 'pronta', 'o texto gerado deixa a proposta pronta');
reset role;
select is(
  (select p.status || '|' || p.revision || '|' || p.model || '|' || j.status
   from private.reply_proposals p join private.reply_proposal_jobs j on j.proposal_id = p.id),
  'pronta|1|modelo-teste|done', 'na revisão 1, com o modelo, e o trabalho concluído');
select is((select status from public.sequences where id = (select valor::uuid from ids where chave = 'sequencia')), 'pausada',
  'gerar a proposta não retoma a Sequência');
select is((select count(*)::integer from private.sequence_step_sends where status in ('sending', 'sent')), 1,
  'e não cria nenhum envio: só o passo 1, de antes');

-- 9. Falha da IA: a resposta e a pausa ficam; um motivo passageiro tenta de novo mais tarde, até o limite; depois a proposta
-- fica "falhou" e a titular pode gerar de novo.
insert into ids select 'p1', pg_temp.aprovada(1)::text;
-- A proposta volta a ser "gerando" (o trabalho que o gatilho criou continua na fila).
update private.reply_proposals set status = 'gerando', body = null, revision = 0, approved_revision = null, approved_by = null,
  approved_at = null, approved_recipient = null, approved_channel = null
where id = pg_temp.i('p1');
set local role service_role;
create temporary table falha1 as select * from public.claim_reply_proposal_jobs(5);
grant all on falha1 to service_role;
select is((select count(*)::integer from falha1), 1, 'outra proposta tem o trabalho reservado');
select is(public.fail_reply_proposal_job((select job_id from falha1), (select claim_token from falha1), 'model_timeout', true),
  'retry', 'a IA demorou: o trabalho volta à fila para outra tentativa');
select is((select count(*)::integer from public.claim_reply_proposal_jobs(5)), 0, 'e só é devido mais tarde');
reset role;
select is(
  (select p.status || '|' || (j.run_after > now() + interval '1 minute')::text || '|' || j.last_error
   from private.reply_proposals p join private.reply_proposal_jobs j on j.proposal_id = p.id where p.id = pg_temp.i('p1')),
  'gerando|true|model_timeout', 'com a próxima tentativa e o motivo gravados');
update private.reply_proposal_jobs set run_after = now() - interval '1 second' where status = 'queued';
set local role service_role;
create temporary table falha2 as select * from public.claim_reply_proposal_jobs(5);
grant all on falha2 to service_role;
select is((select attempt from falha2), 2, 'na hora, a segunda tentativa');
select is(public.fail_reply_proposal_job((select job_id from falha2), (select claim_token from falha2), 'model_auth', false),
  'failed', 'uma recusa que não passa sozinha (credencial) falha de vez');
reset role;
select is(
  (select p.status || '|' || p.failure_code from private.reply_proposals p where p.id = pg_temp.i('p1')),
  'falhou|model_auth', 'a proposta fica "falhou", com o motivo');
select is((select status from public.sequences where id = (select valor::uuid from ids where chave = 'sequencia')), 'pausada',
  'a pausa continua');
select is((select count(*)::integer from private.received_emails where provider_thread_id = 'thread-x1'), 1,
  'e a resposta recebida continua guardada');
set local role authenticated;
select pg_temp.sou('68000000-0000-0000-0000-000000000001');
select is(public.request_reply_proposal_again(pg_temp.i('p1')),
  'gerando', 'a titular pede para gerar de novo');
reset role;
select is(
  (select p.status || '|' || p.generations || '|' || coalesce(p.failure_code, '-') || '|' || j.status || '|' || j.attempts
   from private.reply_proposals p join private.reply_proposal_jobs j on j.proposal_id = p.id where p.id = pg_temp.i('p1')),
  'gerando|2|-|queued|0', 'a proposta volta a gerando e o trabalho à fila, com as tentativas zeradas');
set local role authenticated;
select pg_temp.sou('68000000-0000-0000-0000-000000000001');
select is(public.request_reply_proposal_again(pg_temp.i('p1')),
  'gerando', 'pedir enquanto gera não faz nada de novo');
reset role;
select is((select generations from private.reply_proposals where id = pg_temp.i('p1')), 2,
  'e não conta outra geração');
update private.reply_proposals set generations = 10 where id = pg_temp.i('p1');
update private.reply_proposals set status = 'falhou' where id = pg_temp.i('p1');
set local role authenticated;
select pg_temp.sou('68000000-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.request_reply_proposal_again(pg_temp.i('p1'))$$,
  '54000', 'too many generations for this reply proposal', 'o número de gerações por proposta é limitado');
reset role;

-- 10. O titular edita (nova revisão, que desfaz a Aprovação) e aprova a revisão que viu, uma vez só.
set local role authenticated;
select pg_temp.sou('68000000-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.edit_reply_proposal(pg_temp.proposta((select interaction_id from r1)), 0, 'Oi')$$,
  '55000', 'the reply proposal changed since it was read', 'editar com uma revisão que já mudou não grava nada');
select throws_ok(
  $$select public.edit_reply_proposal(pg_temp.proposta((select interaction_id from r1)), 1, 'Oi', null, 'pedro@empresa-alvo.test')$$,
  '22023', 'the recipient must be one of the contact e-mails', 'o destinatário só troca por um e-mail do Contato');
select throws_ok(
  $$select public.edit_reply_proposal(pg_temp.proposta((select interaction_id from r1)), 1, 'Oi', null, null, 'whatsapp')$$,
  '0A000', 'this channel does not send replies yet', 'o canal só troca por um que já envia respostas');
select is(public.edit_reply_proposal(pg_temp.proposta((select interaction_id from r1)), 1,
  'Olá, Maria! Para 20 usuários, o valor é R$ 9.000 por mês, com contrato anual.'), 2, 'editar o texto cria a revisão 2');
select throws_ok(
  $$select public.approve_reply_proposal(pg_temp.proposta((select interaction_id from r1)), 1)$$,
  '55000', 'the reply proposal changed since it was read', 'aprovar a revisão antiga (a que o titular não viu mais) é recusado');
select is(public.approve_reply_proposal(pg_temp.proposta((select interaction_id from r1)), 2), 'aprovada', 'aprovar a revisão 2');
reset role;
select is(
  (select approved_revision || '|' || approved_by || '|' || approved_recipient || '|' || approved_channel || '|' || decided_by
   from private.reply_proposals where origin_interaction_id = (select interaction_id from r1)),
  '2|68000000-0000-0000-0000-000000000001|maria@empresa-alvo.test|email|68000000-0000-0000-0000-000000000001',
  'a Aprovação registra quem, a revisão, o destinatário e o canal');
create temporary table decisao as select decided_at from private.reply_proposals where origin_interaction_id = (select interaction_id from r1);
set local role authenticated;
select pg_temp.sou('68000000-0000-0000-0000-000000000001');
select is(public.approve_reply_proposal(pg_temp.proposta((select interaction_id from r1)), 2), 'aprovada',
  'aprovar de novo (clique duplo, nova chamada) devolve o mesmo estado');
reset role;
select is((select decided_at from private.reply_proposals where origin_interaction_id = (select interaction_id from r1)),
  (select decided_at from decisao), 'sem refazer a decisão');
select is((select status from public.sequences where id = (select valor::uuid from ids where chave = 'sequencia')), 'pausada',
  'aprovar NÃO retoma a Sequência');
select is((select count(*)::integer from public.account_interactions where kind = 'email-enviado'), 1,
  'e não envia nada: nenhuma Interação de envio além do passo 1');

-- 11. Editar uma proposta aprovada desfaz a Aprovação: a nova revisão precisa de nova Aprovação.
set local role authenticated;
select pg_temp.sou('68000000-0000-0000-0000-000000000001');
select is(public.edit_reply_proposal(pg_temp.proposta((select interaction_id from r1)), 2,
  'Olá, Maria! Para 20 usuários, o valor é R$ 9.000 por mês. Posso ligar amanhã?'), 3, 'editar a aprovada cria a revisão 3');
reset role;
select is(
  (select status || '|' || coalesce(approved_revision::text, '-') from private.reply_proposals where origin_interaction_id = (select interaction_id from r1)),
  'pronta|-', 'a proposta volta a pronta, sem Aprovação');
set local role service_role;
select is((select outcome from public.release_approved_reply(pg_temp.proposta((select interaction_id from r1)), '68000000-0000-0000-0000-000000000001')),
  'not_approved', 'sem Aprovação da revisão atual, o envio não é liberado');
reset role;

-- 12. O envio aprovado sai uma vez só: libera, marca "enviando", e só então grava o resultado.
set local role authenticated;
select pg_temp.sou('68000000-0000-0000-0000-000000000001');
select public.approve_reply_proposal(pg_temp.proposta((select interaction_id from r1)), 3);
reset role;
set local role service_role;
select is((select outcome from public.release_approved_reply(pg_temp.proposta((select interaction_id from r1)),
  '68000000-0000-0000-0000-000000000002')), 'owner_not_responsible', 'quem não é a titular não libera o envio');
create temporary table liberada as select * from public.release_approved_reply(
  pg_temp.proposta((select interaction_id from r1)), '68000000-0000-0000-0000-000000000001');
grant all on liberada to service_role;
select is(
  (select outcome || '|' || destination || '|' || subject || '|' || reply_to_message_id || '|' || tracking_header_name || '|' || revision
   from liberada),
  'released|maria@empresa-alvo.test|Re: Apresentação|<msg-r1@empresa-alvo.test>|X-Althius-Resposta|3',
  'a aprovada é liberada para o destinatário aprovado, na conversa da mensagem de origem');
select is((select unipile_account_id from liberada), 'unipile-google-9', 'pela mesma Conta remetente que recebeu');
select is((select body from liberada), 'Olá, Maria! Para 20 usuários, o valor é R$ 9.000 por mês. Posso ligar amanhã?',
  'com exatamente a revisão aprovada');
select is((select outcome from public.release_approved_reply(pg_temp.proposta((select interaction_id from r1)),
  '68000000-0000-0000-0000-000000000001')), 'in_flight', 'a segunda liberação (clique duplo) não duplica o envio');
select is(pg_temp.estado(pg_temp.proposta((select interaction_id from r1))), 'enviando', 'a proposta está enviando');
select is(public.record_reply_send_result(pg_temp.proposta((select interaction_id from r1)), 'sent', 'email-out-1', '<out-1@mail.gmail.com>', 'thread-1', null),
  'enviada', 'o resultado do provedor deixa a proposta enviada');
select is(public.record_reply_send_result(pg_temp.proposta((select interaction_id from r1)), 'sent', 'email-out-1', '<out-1@mail.gmail.com>', 'thread-1', null),
  'enviada', 'repetir o resultado não faz nada de novo');
select is((select outcome from public.release_approved_reply(pg_temp.proposta((select interaction_id from r1)),
  '68000000-0000-0000-0000-000000000001')), 'already_sent', 'uma enviada não é liberada outra vez');
reset role;
select is((select count(*)::integer from public.account_interactions where kind = 'email-enviado'), 2,
  'o envio registra uma Interação "e-mail enviado", sem conteúdo');
select is(
  (select provider_email_id || '|' || provider_message_id || '|' || send_attempts from private.reply_proposals
   where origin_interaction_id = (select interaction_id from r1)),
  'email-out-1|<out-1@mail.gmail.com>|1', 'e os ids do provedor e uma tentativa de envio');
select is((select status from public.sequences where id = (select valor::uuid from ids where chave = 'sequencia')), 'pausada',
  'enviar a resposta também não retoma a Sequência');

-- 13. Uma mensagem nova na mesma conversa deixa desatualizada a proposta anterior (a que ainda não saiu), pelo caminho
-- real da ingestão; a que já foi enviada, em outra conversa, não muda.
insert into ids select 'p2', pg_temp.aprovada(2)::text;
set local role service_role;
create temporary table r2 as select * from public.ingest_unipile_email_event(
  'evt-6', 'email.new', 'unipile-google-9',
  pg_temp.email('email-r2', 'thread-x2', 'maria@empresa-alvo.test', 'Re: Dúvida 2', p_message_id => '<msg-r2@empresa-alvo.test>',
    p_headers => '[{"name": "In-Reply-To", "value": "<msg-1@mail.gmail.com>"}]'::jsonb),
  array['ana@norte.test']);
grant all on r2 to authenticated, service_role;
reset role;
select is((select outcome from r2), 'reply', 'a mensagem nova do Contato, na mesma conversa, é uma resposta');
select is(pg_temp.estado(pg_temp.i('p2')), 'desatualizada', 'a proposta aprovada, ainda não enviada, fica desatualizada');
select is(pg_temp.estado(pg_temp.proposta((select interaction_id from r2))), 'gerando', 'e a mensagem nova ganha a própria proposta');
select is(pg_temp.estado(pg_temp.proposta((select interaction_id from r1))), 'enviada', 'a resposta já enviada, em outra conversa, não muda');
set local role authenticated;
select pg_temp.sou('68000000-0000-0000-0000-000000000001');
select throws_ok($$select public.approve_reply_proposal(pg_temp.i('p2'), 1)$$,
  '55000', 'the reply proposal is outdated', 'a desatualizada não pode ser aprovada');
reset role;
set local role service_role;
select is((select outcome from public.release_approved_reply(pg_temp.i('p2'), '68000000-0000-0000-0000-000000000001')),
  'outdated', 'nem enviada, mesmo tendo sido aprovada antes');
reset role;
-- A titular revê a desatualizada (nova revisão) e a aprova de novo: aí ela vale.
set local role authenticated;
select pg_temp.sou('68000000-0000-0000-0000-000000000001');
select is(public.edit_reply_proposal(pg_temp.i('p2'), 1, 'Maria, mando a nova proposta ainda hoje.'), 2,
  'a titular revê a desatualizada: revisão 2');
select is(public.approve_reply_proposal(pg_temp.i('p2'), 2), 'aprovada', 'e a aprova de novo');
reset role;

-- 14. Defesa em profundidade: uma mensagem que entrou depois da Aprovação sem passar pelo gatilho ainda barra o envio.
alter table private.received_emails disable trigger received_emails_reply_proposal;
insert into public.account_interactions (id, workspace_id, target_account_id, contact_id, kind, recorded_by) values
  ('a8100000-0000-0000-0000-000000000003', '69000000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'conta'),
   (select valor::uuid from ids where chave = 'maria'), 'email-recebido', '68000000-0000-0000-0000-000000000001');
insert into private.received_emails (interaction_id, workspace_id, owner_user_id, sequence_id, contact_id, sender_account_id,
  provider_email_id, provider_message_id, provider_thread_id, from_email, subject, body, received_at, created_at) values
  ('a8100000-0000-0000-0000-000000000003', '69000000-0000-0000-0000-000000000001', '68000000-0000-0000-0000-000000000001',
   (select valor::uuid from ids where chave = 'sequencia'), (select valor::uuid from ids where chave = 'maria'),
   (select id from private.sender_accounts where unipile_account_id = 'unipile-google-9'),
   'email-x2c', '<m-x2c@empresa-alvo.test>', 'thread-x2', 'maria@empresa-alvo.test', 'Re: Dúvida 2', 'Mais uma coisa.',
   now(), now() + interval '1 second');
alter table private.received_emails enable trigger received_emails_reply_proposal;
set local role service_role;
select is((select outcome from public.release_approved_reply(pg_temp.i('p2'), '68000000-0000-0000-0000-000000000001')),
  'outdated', 'a mensagem que chegou depois da Aprovação barra o envio');
reset role;
select is(pg_temp.estado(pg_temp.i('p2')), 'desatualizada', 'e deixa a proposta desatualizada');

-- 15. Revalidações no momento do envio, mesmo depois de uma Aprovação: cada uma bloqueia, e a proposta continua aprovada.
insert into ids select 'p3', pg_temp.aprovada(3)::text;
set local role service_role;
select is((select outcome from public.release_approved_reply(pg_temp.i('p3'), '68000000-0000-0000-0000-000000000001', array['whatsapp'])),
  'channel_not_supported', 'um canal que a função ainda não envia é recusado antes de qualquer envio');
reset role;
update private.sender_accounts set status = 'reconnect_required' where unipile_account_id = 'unipile-google-9';
set local role service_role;
select is((select outcome from public.release_approved_reply(pg_temp.i('p3'), '68000000-0000-0000-0000-000000000001')),
  'sender_not_ready', 'a Conta remetente desconectada bloqueia o envio');
reset role;
update private.sender_accounts set status = 'ready', reconciliation_required = true where unipile_account_id = 'unipile-google-9';
set local role service_role;
select is((select outcome from public.release_approved_reply(pg_temp.i('p3'), '68000000-0000-0000-0000-000000000001')),
  'sender_not_ready', 'e a Conta remetente em reconciliação também');
reset role;
update private.sender_accounts set reconciliation_required = false where unipile_account_id = 'unipile-google-9';
update public.contacts set email = 'maria.nova@empresa-alvo.test' where id = pg_temp.i('maria');
set local role service_role;
select is((select outcome from public.release_approved_reply(pg_temp.i('p3'), '68000000-0000-0000-0000-000000000001')),
  'destination_changed', 'o Contato que não tem mais o e-mail aprovado bloqueia (ADR-0014)');
reset role;
update public.contacts set email = 'maria@empresa-alvo.test' where id = pg_temp.i('maria');
update public.contact_account_links set ended_at = now() where contact_id = pg_temp.i('maria');
set local role service_role;
select is((select outcome from public.release_approved_reply(pg_temp.i('p3'), '68000000-0000-0000-0000-000000000001')),
  'contact_unlinked', 'o Contato desvinculado da Conta-alvo bloqueia');
reset role;
update public.contact_account_links set ended_at = null where contact_id = pg_temp.i('maria');
update public.target_accounts set archived_at = now() where id = pg_temp.i('conta');
set local role service_role;
select is((select outcome from public.release_approved_reply(pg_temp.i('p3'), '68000000-0000-0000-0000-000000000001')),
  'account_unavailable', 'a Conta-alvo arquivada bloqueia');
reset role;
update public.target_accounts set archived_at = null where id = pg_temp.i('conta');
update public.workspace_memberships set active = false
where workspace_id = '69000000-0000-0000-0000-000000000001' and user_id = '68000000-0000-0000-0000-000000000001';
set local role service_role;
select is((select outcome from public.release_approved_reply(pg_temp.i('p3'), '68000000-0000-0000-0000-000000000001')),
  'owner_not_responsible', 'a Participação removida do titular bloqueia');
reset role;
update public.workspace_memberships set active = true
where workspace_id = '69000000-0000-0000-0000-000000000001' and user_id = '68000000-0000-0000-0000-000000000001';
alter table public.sequences disable trigger sequences_guard_lifecycle;
update public.sequences set status = 'encerrada', ended_reason = 'account_deleted', ended_at = now() where id = pg_temp.i('sequencia');
set local role service_role;
select is((select outcome from public.release_approved_reply(pg_temp.i('p3'), '68000000-0000-0000-0000-000000000001')),
  'sequence_ended', 'a Sequência encerrada (responsabilidade transferida, Conta apagada) bloqueia');
reset role;
update public.sequences set status = 'pausada', ended_reason = null, ended_at = null where id = pg_temp.i('sequencia');
alter table public.sequences enable trigger sequences_guard_lifecycle;
alter table public.sales_responsibilities disable trigger sales_responsibilities_end_sequences;
select set_config('althius.troca_de_responsavel', private.responsibility_key('69000000-0000-0000-0000-000000000001', (select valor from ids where chave = 'conta')), true);
update public.sales_responsibilities set owner_user_id = '68000000-0000-0000-0000-000000000002'
where target_account_id = (select valor from ids where chave = 'conta');
set local role service_role;
select is((select outcome from public.release_approved_reply(pg_temp.i('p3'), '68000000-0000-0000-0000-000000000001')),
  'owner_not_responsible', 'a responsabilidade da Conta-alvo que mudou de dono bloqueia o envio');
reset role;
select set_config('althius.troca_de_responsavel', private.responsibility_key('69000000-0000-0000-0000-000000000001', (select valor from ids where chave = 'conta')), true);
update public.sales_responsibilities set owner_user_id = '68000000-0000-0000-0000-000000000001'
where target_account_id = (select valor from ids where chave = 'conta');
alter table public.sales_responsibilities enable trigger sales_responsibilities_end_sequences;
select is(pg_temp.estado(pg_temp.i('p3')), 'aprovada', 'nenhum bloqueio mudou a proposta: continua aprovada');
select is((select count(*)::integer from private.reply_proposals where send_attempts > 0), 1,
  'e nenhum envio foi tentado além do primeiro');

-- 16. Falha do provedor: volta a aprovada, para tentar de novo com a mesma revisão; a dúvida (incerta) exige conferir antes.
set local role service_role;
select is((select outcome from public.release_approved_reply(pg_temp.i('p3'), '68000000-0000-0000-0000-000000000001')), 'released',
  'sem os bloqueios, a proposta é liberada');
select is(public.record_reply_send_result(pg_temp.i('p3'), 'failed', null, null, null, 'HTTP 502'), 'aprovada',
  'o provedor recusou: a proposta volta a aprovada, com o erro');
select is((select outcome from public.release_approved_reply(pg_temp.i('p3'), '68000000-0000-0000-0000-000000000001')), 'released',
  'e pode ser enviada de novo, com a mesma revisão');
select is(public.record_reply_send_result(pg_temp.i('p3'), 'uncertain', null, null, null, 'timeout'), 'incerta',
  'sem resposta do provedor o envio fica incerto');
select is((select outcome from public.release_approved_reply(pg_temp.i('p3'), '68000000-0000-0000-0000-000000000001')), 'reconcile_required',
  'e um envio incerto não é refeito às cegas');
reset role;
set local role authenticated;
select pg_temp.sou('68000000-0000-0000-0000-000000000001');
select is(public.resolve_uncertain_reply_proposal(pg_temp.i('p3'), false), 'pronta',
  'a titular confere e diz que não saiu: volta a pronta, sem Aprovação');
reset role;
select is((select approved_revision from private.reply_proposals where id = pg_temp.i('p3')), null, 'a Aprovação foi desfeita');

-- 17. Rejeitar não envia; repetir não faz nada; a que já saiu não se rejeita.
insert into ids select 'p4', pg_temp.aprovada(4)::text;
set local role authenticated;
select pg_temp.sou('68000000-0000-0000-0000-000000000001');
select is(public.reject_reply_proposal(pg_temp.i('p4')), 'rejeitada', 'a titular rejeita a aprovada que ainda não saiu');
select is(public.reject_reply_proposal(pg_temp.i('p4')), 'rejeitada', 'rejeitar de novo não faz nada');
select throws_ok($$select public.reject_reply_proposal(pg_temp.proposta((select interaction_id from r1)))$$,
  '55000', 'the reply was already sent or is being sent', 'a que já foi enviada não se rejeita');
reset role;
set local role service_role;
select is((select outcome from public.release_approved_reply(pg_temp.i('p4'), '68000000-0000-0000-0000-000000000001')), 'not_approved',
  'a rejeitada nunca é liberada');
reset role;

-- 18. Um envio esquecido em voo vira incerto, e a titular pode dizer que saiu.
insert into ids select 'p5', pg_temp.aprovada(5)::text;
set local role service_role;
select outcome from public.release_approved_reply(pg_temp.i('p5'), '68000000-0000-0000-0000-000000000001');
reset role;
update private.reply_proposals set sending_at = now() - interval '11 minutes' where id = pg_temp.i('p5');
select private.expire_stale_reply_sends(null);
select is(pg_temp.estado(pg_temp.i('p5')), 'incerta', 'um envio em voo há mais de 10 minutos passa a incerto');
set local role authenticated;
select pg_temp.sou('68000000-0000-0000-0000-000000000001');
select is(public.resolve_uncertain_reply_proposal(pg_temp.i('p5'), true), 'enviada', 'a titular confere a caixa de saída e diz que saiu');
reset role;
select is((select count(*)::integer from public.account_interactions where kind = 'email-enviado'), 3,
  'que também registra a Interação "e-mail enviado"');

-- 19. Apagar os dados apaga a proposta: a resposta recebida, a Conta-alvo.
delete from private.received_emails where provider_email_id = 'email-x4';
select is((select count(*)::integer from private.reply_proposals where id = pg_temp.i('p4')), 0,
  'apagar a resposta recebida apaga a proposta que a cita');

-- 20. O Executor das propostas: token próprio; chama a função só com trabalho devido e endereço configurado.
select is(length((select token from private.reply_proposal_runner_settings)), 64, 'o banco cria o token do Executor das propostas');
select isnt((select token from private.reply_proposal_runner_settings), (select token from private.sequence_runner_settings),
  'e ele é diferente do token do Executor da Sequência');
select is(public.reply_proposal_runner_token_matches((select token from private.reply_proposal_runner_settings)), true, 'o token certo confere');
select is(public.reply_proposal_runner_token_matches((select token from private.sequence_runner_settings)), false, 'o token do outro Executor não');
select is(public.reply_proposal_runner_token_matches(''), false, 'nem um vazio');
insert into ids select 'p7', pg_temp.aprovada(7)::text;
delete from chamadas;
update private.sequence_runner_settings set function_url = null;
select is(private.kick_reply_proposal_runner(), false, 'sem endereço configurado nada é chamado');
select throws_ok($$select private.configure_reply_proposal_runner('http://abc.supabase.co')$$, '22023',
  'project url must look like https://<ref>.supabase.co', 'o endereço aceita só https');
select private.configure_sequence_runner('https://abc.supabase.co/');
update private.reply_proposal_jobs set status = 'done';
select is(private.kick_reply_proposal_runner(), false, 'com o endereço da Sequência mas sem trabalho devido, não chama');
update private.reply_proposal_jobs set status = 'queued', run_after = now() where proposal_id = pg_temp.i('p7');
select is(private.kick_reply_proposal_runner(), true, 'com trabalho devido, o banco chama a função');
select is((select url || '|' || (token = (select token from private.reply_proposal_runner_settings))::text from chamadas),
  'https://abc.supabase.co/functions/v1/reply-proposal-runner|true',
  'no endereço do Executor da Sequência com o nome trocado, levando o token das propostas');
select private.configure_reply_proposal_runner('https://outro.supabase.co');
delete from chamadas;
select private.kick_reply_proposal_runner();
select is((select url from chamadas), 'https://outro.supabase.co/functions/v1/reply-proposal-runner', 'um endereço próprio vale mais que o derivado');

-- 21. Uma falha ao criar a proposta nunca derruba a ingestão: a resposta e a pausa ficam (o gatilho só avisa no log).
create or replace function private.enqueue_reply_proposal(
  p_workspace_id uuid, p_sequence_id uuid, p_target_account_id uuid, p_contact_id uuid, p_owner_user_id uuid,
  p_sender_account_id uuid, p_channel text, p_origin_interaction_id uuid, p_conversation_ref text, p_recipient text,
  p_recipient_name text, p_reply_to_message_id text, p_subject text
) returns uuid language plpgsql as $f$ begin raise exception 'falha simulada'; end $f$;
insert into public.account_interactions (id, workspace_id, target_account_id, kind, recorded_by) values
  ('a8100000-0000-0000-0000-000000000009', '69000000-0000-0000-0000-000000000001', (select valor::uuid from ids where chave = 'conta'),
   'email-recebido', '68000000-0000-0000-0000-000000000001');
select lives_ok(
  $$insert into private.received_emails (interaction_id, workspace_id, owner_user_id, sequence_id, sender_account_id, provider_email_id,
      from_email, received_at)
    values ('a8100000-0000-0000-0000-000000000009', '69000000-0000-0000-0000-000000000001', '68000000-0000-0000-0000-000000000001',
      (select valor::uuid from ids where chave = 'sequencia'), (select id from private.sender_accounts where unipile_account_id = 'unipile-google-9'),
      'email-falha', 'maria@empresa-alvo.test', now())$$,
  'se criar a proposta falhar, a resposta é gravada do mesmo jeito');
select is((select count(*)::integer from private.received_emails where provider_email_id = 'email-falha'), 1, 'e fica guardada');

-- 22. Apagar a Conta-alvo apaga todas as propostas dela (vale para qualquer canal).
insert into ids select 'p6', pg_temp.aprovada(6)::text;
update public.target_accounts set deleted_at = now() where id = pg_temp.i('conta');
select is((select count(*)::integer from private.reply_proposals), 0, 'apagar a Conta-alvo apaga todas as propostas dela');


select * from finish();
rollback;

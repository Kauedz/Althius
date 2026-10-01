-- Propostas de resposta (canais-cadencia-backend, tickets 08 e 09; ADR-0008). Depois de uma resposta comercial válida, a
-- IA (o Rhetor) prepara um rascunho de resposta; o titular da Conta remetente revisa, edita, aprova ou rejeita, e só então
-- a resposta sai, uma vez, por uma Edge Function que o autoriza. O texto recebido e a proposta ficam no schema privado e
-- só o titular os lê; os demais participantes veem a Interação pública "e-mail recebido", que já existe.
--
-- Desenho canal-agnóstico: a proposta guarda o canal, a Conta remetente, o destinatário e a mensagem de origem (a Interação
-- pública dela), sem nada específico de e-mail. Hoje só o E-mail liga uma proposta (o gatilho em private.received_emails);
-- o WhatsApp e o LinkedIn entram quando o núcleo de chat existir, chamando private.enqueue_reply_proposal pelo gatilho
-- deles e passando o próprio canal em release_approved_reply (p_channels).
--
-- Estados: gerando → pronta → aprovada → enviando → enviada | incerta; falhou (a IA não respondeu), desatualizada (chegou
-- outra mensagem na conversa) e rejeitada. Aprovar NÃO retoma a Sequência: a pausa vem da resposta e só o responsável a
-- desfaz. Nada aqui chama a Unipile: quem envia é a Edge Function reply-proposal-send, depois de release_approved_reply.

create table private.reply_proposals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  sequence_id uuid not null references public.sequences(id),
  target_account_id uuid not null,
  contact_id uuid,
  -- O titular: o Vendedor responsável pela Sequência e dono da Conta remetente. Só ele lê e decide.
  owner_user_id uuid not null references auth.users(id),
  -- O Rhetor do Workspace, a quem a proposta é atribuída.
  author_agent_id uuid,
  sender_account_id uuid references private.sender_accounts(id),
  channel text not null check (channel in ('email', 'whatsapp', 'linkedin')),
  -- A Interação pública da mensagem recebida. Uma proposta por mensagem de origem.
  origin_interaction_id uuid not null unique references public.account_interactions(id) on delete cascade,
  -- A conversa da mensagem (e-mail: o thread_id, ou o remetente quando o provedor não dá um): uma mensagem nova nela
  -- deixa desatualizada a proposta anterior.
  conversation_ref text,
  recipient text not null check (btrim(recipient) <> ''),
  recipient_name text,
  -- A mensagem a que a resposta responde, na conversa do provedor (e-mail: o message_id).
  reply_to_message_id text,
  subject text,
  body text check (body is null or length(body) <= 20000),
  revision integer not null default 0 check (revision >= 0),
  status text not null default 'gerando' check (status in (
    'gerando', 'pronta', 'falhou', 'desatualizada', 'aprovada', 'enviando', 'enviada', 'incerta', 'rejeitada'
  )),
  generations integer not null default 0 check (generations >= 0),
  model text,
  failure_code text,
  -- A Aprovação: de que revisão, para quem e por qual canal. Editar a proposta a desfaz.
  approved_revision integer,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  approved_recipient text,
  approved_channel text,
  -- Quem aprovou ou rejeitou, e quando.
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  send_attempts integer not null default 0,
  sending_at timestamptz,
  sent_at timestamptz,
  send_error text,
  send_error_at timestamptz,
  provider_email_id text,
  provider_message_id text,
  provider_thread_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, target_account_id) references public.target_accounts(workspace_id, id) on delete cascade,
  foreign key (workspace_id, contact_id) references public.contacts(workspace_id, id) on delete cascade,
  foreign key (workspace_id, author_agent_id) references private.agents(workspace_id, id) on delete set null (author_agent_id),
  check (status not in ('aprovada', 'enviando', 'enviada', 'incerta')
    or (approved_revision is not null and approved_by is not null and approved_recipient is not null and approved_channel is not null))
);

create index reply_proposals_owner_idx on private.reply_proposals (workspace_id, owner_user_id, created_at desc);
create index reply_proposals_sequence_idx on private.reply_proposals (sequence_id, created_at desc);
create index reply_proposals_conversation_idx on private.reply_proposals (sequence_id, channel, conversation_ref);
create index reply_proposals_author_idx on private.reply_proposals (workspace_id, author_agent_id) where author_agent_id is not null;
create index reply_proposals_sender_idx on private.reply_proposals (sender_account_id) where sender_account_id is not null;
create index reply_proposals_sending_idx on private.reply_proposals (sending_at) where status = 'enviando';

-- O trabalho de gerar a proposta: um por mensagem de origem (a chave da idempotência). "Gerar de novo" reaproveita a mesma
-- linha. A reserva é exclusiva (claim_token), as tentativas são limitadas e o motivo e a próxima tentativa ficam gravados.
create table private.reply_proposal_jobs (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null unique references private.reply_proposals(id) on delete cascade,
  workspace_id uuid not null,
  origin_interaction_id uuid not null unique,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  run_after timestamptz not null default now(),
  claimed_until timestamptz,
  claim_token uuid,
  last_error text,
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

create index reply_proposal_jobs_due_idx on private.reply_proposal_jobs (run_after) where status in ('queued', 'running');

alter table private.reply_proposals enable row level security;
alter table private.reply_proposal_jobs enable row level security;
revoke all on private.reply_proposals from public, anon, authenticated, service_role;
revoke all on private.reply_proposal_jobs from public, anon, authenticated, service_role;

comment on table private.reply_proposals is
  'Private content of a reply the AI drafted for the seller. Only the owner reads and decides it, via RPC. Nothing here sends.';
comment on table private.reply_proposal_jobs is
  'The idempotent work of drafting a reply proposal: one per origin message, reserved by claim_reply_proposal_jobs.';

-- Quantas vezes o trabalho tenta antes de a proposta ficar "falhou", e quantas gerações uma proposta pode ter (cada uma gasta crédito).
create function private.reply_proposal_max_attempts()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 3;
$$;

create function private.reply_proposal_max_generations()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 10;
$$;

revoke all on function private.reply_proposal_max_attempts() from public, anon, authenticated, service_role;
revoke all on function private.reply_proposal_max_generations() from public, anon, authenticated, service_role;

-- O titular da proposta: Participação ativa no Workspace e ainda responsável pela Conta-alvo e pela Sequência.
create function private.reply_proposal_owner_is_responsible(p_proposal private.reply_proposals, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
    and p_user_id = p_proposal.owner_user_id
    and exists (
      select 1 from public.sequences s
      where s.id = p_proposal.sequence_id and s.owner_user_id = p_user_id)
    and exists (
      select 1 from public.workspace_memberships m
      where m.workspace_id = p_proposal.workspace_id and m.user_id = p_user_id and m.active)
    and exists (
      select 1 from public.sales_responsibilities r
      where r.workspace_id = p_proposal.workspace_id
        and r.target_account_id = p_proposal.target_account_id::text and r.owner_user_id = p_user_id);
$$;

revoke all on function private.reply_proposal_owner_is_responsible(private.reply_proposals, uuid)
  from public, anon, authenticated, service_role;

-- Uma mensagem nova na conversa deixa desatualizada a proposta que ainda não saiu (e cancela o trabalho que ainda não
-- começou). O que já está sendo enviado ou foi enviado não muda: a resposta saiu antes.
create function private.mark_reply_proposals_outdated(
  p_sequence_id uuid, p_channel text, p_conversation_ref text, p_except_origin uuid
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with desatualizadas as (
    update private.reply_proposals p set status = 'desatualizada', updated_at = now()
    where p.sequence_id = p_sequence_id and p.channel = p_channel
      and p.conversation_ref is not distinct from p_conversation_ref
      and p.origin_interaction_id is distinct from p_except_origin
      and p.status in ('gerando', 'pronta', 'falhou', 'aprovada')
    returning p.id
  ), cancelados as (
    update private.reply_proposal_jobs j set
      status = 'cancelled', claimed_until = null, claim_token = null, finished_at = now(), updated_at = now()
    where j.proposal_id in (select d.id from desatualizadas d) and j.status = 'queued'
    returning j.id
  )
  select count(*) into v_count from desatualizadas;
  return v_count;
end;
$$;

revoke all on function private.mark_reply_proposals_outdated(uuid, text, text, uuid)
  from public, anon, authenticated, service_role;

-- Cria a proposta de uma mensagem recebida e o trabalho de gerá-la, uma vez só por mensagem de origem. É o ponto de
-- entrada de qualquer canal: o gatilho do E-mail (abaixo) e, depois, o do WhatsApp e do LinkedIn. Devolve o id da
-- proposta (a que já existia, se a mensagem já tinha uma).
create function private.enqueue_reply_proposal(
  p_workspace_id uuid,
  p_sequence_id uuid,
  p_target_account_id uuid,
  p_contact_id uuid,
  p_owner_user_id uuid,
  p_sender_account_id uuid,
  p_channel text,
  p_origin_interaction_id uuid,
  p_conversation_ref text,
  p_recipient text,
  p_recipient_name text,
  p_reply_to_message_id text,
  p_subject text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_agent uuid;
  v_subject text;
begin
  select p.id into v_id from private.reply_proposals p where p.origin_interaction_id = p_origin_interaction_id;
  if v_id is not null then
    return v_id;
  end if;

  perform private.mark_reply_proposals_outdated(p_sequence_id, p_channel, p_conversation_ref, p_origin_interaction_id);

  select a.id into v_agent from private.agents a
  where a.workspace_id = p_workspace_id and a.specialty = 'rhetor' and a.kind = 'padrao';

  v_subject := case
    when p_channel <> 'email' then null
    when p_subject ~* '^\s*re\s*:' then btrim(p_subject)
    else 'Re: ' || coalesce(nullif(btrim(p_subject), ''), '(sem assunto)')
  end;

  insert into private.reply_proposals (
    workspace_id, sequence_id, target_account_id, contact_id, owner_user_id, author_agent_id, sender_account_id,
    channel, origin_interaction_id, conversation_ref, recipient, recipient_name, reply_to_message_id, subject, generations
  ) values (
    p_workspace_id, p_sequence_id, p_target_account_id, p_contact_id, p_owner_user_id, v_agent, p_sender_account_id,
    p_channel, p_origin_interaction_id, p_conversation_ref, btrim(p_recipient), nullif(btrim(p_recipient_name), ''),
    nullif(btrim(p_reply_to_message_id), ''), v_subject, 1
  )
  on conflict (origin_interaction_id) do nothing
  returning id into v_id;
  if v_id is null then
    select p.id into v_id from private.reply_proposals p where p.origin_interaction_id = p_origin_interaction_id;
    return v_id;
  end if;

  insert into private.reply_proposal_jobs (proposal_id, workspace_id, origin_interaction_id)
  values (v_id, p_workspace_id, p_origin_interaction_id)
  on conflict (origin_interaction_id) do nothing;
  return v_id;
end;
$$;

revoke all on function private.enqueue_reply_proposal(uuid, uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, text, text, text)
  from public, anon, authenticated, service_role;

-- O gatilho do E-mail: uma resposta comercial válida já persistida (o ingest_unipile_email_event só grava aqui o que é
-- resposta de um Contato) deixa desatualizada a proposta anterior da conversa e cria o trabalho de gerar a nova. Nunca
-- falha a ingestão: um erro aqui vira aviso no log, e a resposta e a pausa ficam como estão.
create function private.reply_proposal_on_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sequence public.sequences;
  v_ref text;
begin
  begin
    select s.* into v_sequence from public.sequences s where s.id = new.sequence_id;
    if not found then
      return null;
    end if;
    v_ref := coalesce(nullif(btrim(new.provider_thread_id), ''), 'de:' || lower(coalesce(new.from_email, '')));
    perform private.mark_reply_proposals_outdated(new.sequence_id, 'email', v_ref, new.interaction_id);

    -- Sem Vendedor responsável ativo, Sequência encerrada ou remetente desconhecido, não há a quem propor nem para quem.
    if v_sequence.status = 'encerrada'
      or nullif(btrim(new.from_email), '') is null
      or v_sequence.target_account_id !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
      or not exists (
        select 1 from public.sales_responsibilities r
        where r.workspace_id = new.workspace_id and r.target_account_id = v_sequence.target_account_id
          and r.owner_user_id = new.owner_user_id)
      or not exists (
        select 1 from public.workspace_memberships m
        where m.workspace_id = new.workspace_id and m.user_id = new.owner_user_id and m.active) then
      return null;
    end if;

    perform private.enqueue_reply_proposal(
      new.workspace_id, new.sequence_id, v_sequence.target_account_id::uuid, new.contact_id, new.owner_user_id,
      new.sender_account_id, 'email', new.interaction_id, v_ref, new.from_email, new.from_name,
      new.provider_message_id, new.subject);
  exception when others then
    raise warning 'reply proposal was not queued: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function private.reply_proposal_on_email() from public, anon, authenticated, service_role;

create trigger received_emails_reply_proposal
  after insert on private.received_emails
  for each row execute function private.reply_proposal_on_email();

-- Apagar os dados de uma Conta-alvo ou de um Contato (CRM-18) apaga as respostas recebidas, e com elas as propostas, que
-- citam o conteúdo delas. O Contato leva as dele pela chave estrangeira; a resposta recebida, por este gatilho; a Conta
-- apagada, pelo outro (vale para qualquer canal).
create function private.erase_reply_proposals_of_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.reply_proposals p where p.origin_interaction_id = old.interaction_id;
  return null;
end;
$$;

create function private.erase_reply_proposals_of_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from private.reply_proposals p where p.target_account_id = new.id;
  end if;
  return null;
end;
$$;

revoke all on function private.erase_reply_proposals_of_email() from public, anon, authenticated, service_role;
revoke all on function private.erase_reply_proposals_of_account() from public, anon, authenticated, service_role;

create trigger received_emails_erase_reply_proposals
  after delete on private.received_emails
  for each row execute function private.erase_reply_proposals_of_email();

create trigger target_accounts_erase_reply_proposals
  after update of deleted_at on public.target_accounts
  for each row execute function private.erase_reply_proposals_of_account();

-- Um envio em voo há mais de 10 minutos perdeu o resultado (a função caiu depois de chamar a Unipile): passa a incerto,
-- para o titular conferir antes de qualquer reenvio, em vez de ficar preso. Com p_proposal_id, só aquela proposta.
create function private.expire_stale_reply_sends(p_proposal_id uuid)
returns void
language sql
set search_path = ''
as $$
  update private.reply_proposals p set
    status = 'incerta', send_error = 'stale_sending', send_error_at = now(), updated_at = now()
  where p.id in (
    select x.id from private.reply_proposals x
    where x.status = 'enviando' and x.sending_at < now() - interval '10 minutes'
      and (p_proposal_id is null or x.id = p_proposal_id)
    for update skip locked);
$$;

revoke all on function private.expire_stale_reply_sends(uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- O titular: ler e decidir. Quem não é o titular (outro participante, Administrador, outro Workspace) é recusado.

-- As propostas do titular no Workspace (as mais novas primeiro), ou só as de uma Sequência dele. O texto recebido que
-- origina a proposta vem em trecho: o completo continua em list_received_emails.
create function public.list_reply_proposals(p_workspace_id uuid, p_sequence_id uuid default null)
returns table (
  id uuid, sequence_id uuid, target_account_id uuid, contact_id uuid, channel text, origin_interaction_id uuid,
  recipient text, recipient_name text, subject text, body text, revision integer, status text, failure_code text,
  approved_revision integer, decided_at timestamptz, sent_at timestamptz, send_error text, generations integer,
  origin_received_at timestamptz, origin_subject text, origin_excerpt text, created_at timestamptz, updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
begin
  perform private.require_active_membership(p_workspace_id);
  if p_sequence_id is not null and not exists (
    select 1 from public.sequences s
    where s.id = p_sequence_id and s.workspace_id = p_workspace_id and s.owner_user_id = v_user_id
  ) then
    raise exception 'sequence not found or not owned by active user' using errcode = '42501';
  end if;
  return query
    select p.id, p.sequence_id, p.target_account_id, p.contact_id, p.channel, p.origin_interaction_id,
      p.recipient, p.recipient_name, p.subject, p.body, p.revision, p.status, p.failure_code,
      p.approved_revision, p.decided_at, p.sent_at, p.send_error, p.generations,
      r.received_at, r.subject, left(coalesce(nullif(btrim(r.snippet), ''), r.body), 600), p.created_at, p.updated_at
    from private.reply_proposals p
    left join private.received_emails r on r.interaction_id = p.origin_interaction_id
    where p.workspace_id = p_workspace_id and p.owner_user_id = v_user_id
      and (p_sequence_id is null or p.sequence_id = p_sequence_id)
    order by p.created_at desc, p.id
    limit 200;
end;
$$;

create function public.get_reply_proposal(p_proposal_id uuid)
returns table (
  id uuid, sequence_id uuid, target_account_id uuid, contact_id uuid, channel text, origin_interaction_id uuid,
  recipient text, recipient_name text, subject text, body text, revision integer, status text, failure_code text,
  approved_revision integer, decided_at timestamptz, sent_at timestamptz, send_error text, generations integer,
  origin_received_at timestamptz, origin_subject text, origin_excerpt text, created_at timestamptz, updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from private.reply_proposals p
    join public.workspace_memberships m on m.workspace_id = p.workspace_id and m.user_id = v_user_id and m.active
    where p.id = p_proposal_id and p.owner_user_id = v_user_id
  ) then
    raise exception 'only the owner can read the reply proposal' using errcode = '42501';
  end if;
  return query
    select p.id, p.sequence_id, p.target_account_id, p.contact_id, p.channel, p.origin_interaction_id,
      p.recipient, p.recipient_name, p.subject, p.body, p.revision, p.status, p.failure_code,
      p.approved_revision, p.decided_at, p.sent_at, p.send_error, p.generations,
      r.received_at, r.subject, left(coalesce(nullif(btrim(r.snippet), ''), r.body), 600), p.created_at, p.updated_at
    from private.reply_proposals p
    left join private.received_emails r on r.interaction_id = p.origin_interaction_id
    where p.id = p_proposal_id;
end;
$$;

-- Trava a proposta do titular para uma decisão; recusa quem não é o titular ativo. A trava da Sequência não é tomada:
-- decidir não mexe nela.
create function private.lock_reply_proposal_of_owner(p_proposal_id uuid)
returns private.reply_proposals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_proposal private.reply_proposals;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select p.* into v_proposal from private.reply_proposals p
  where p.id = p_proposal_id and p.owner_user_id = v_user_id
    and exists (
      select 1 from public.workspace_memberships m
      where m.workspace_id = p.workspace_id and m.user_id = v_user_id and m.active)
  for update of p;
  if not found then
    raise exception 'only the owner can decide the reply proposal' using errcode = '42501';
  end if;
  return v_proposal;
end;
$$;

revoke all on function private.lock_reply_proposal_of_owner(uuid) from public, anon, authenticated, service_role;

-- Editar o texto (e o assunto, o destinatário ou o canal) cria uma nova revisão e desfaz a Aprovação: a nova revisão
-- precisa ser aprovada de novo. Quem edita informa a revisão que viu; se ela já mudou, nada é gravado. O destinatário
-- só troca por um e-mail do Contato; o canal só por um que já envia respostas.
create function public.edit_reply_proposal(
  p_proposal_id uuid,
  p_revision integer,
  p_body text,
  p_subject text default null,
  p_recipient text default null,
  p_channel text default null
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proposal private.reply_proposals;
  v_body text := btrim(coalesce(p_body, ''));
  v_recipient text;
  v_subject text;
begin
  v_proposal := private.lock_reply_proposal_of_owner(p_proposal_id);
  if v_proposal.status not in ('pronta', 'desatualizada', 'falhou', 'aprovada') then
    raise exception 'the reply proposal cannot be edited now' using errcode = '55000';
  end if;
  if p_revision is distinct from v_proposal.revision then
    raise exception 'the reply proposal changed since it was read' using errcode = '55000';
  end if;
  if v_body = '' or length(v_body) > 20000 then
    raise exception 'the reply text must have between 1 and 20000 characters' using errcode = '22023';
  end if;
  if p_channel is not null and p_channel is distinct from v_proposal.channel then
    -- Só o E-mail envia respostas por enquanto; trocar de canal vale quando o núcleo de chat existir.
    raise exception 'this channel does not send replies yet' using errcode = '0A000';
  end if;

  v_recipient := coalesce(nullif(btrim(p_recipient), ''), v_proposal.recipient);
  if v_recipient is distinct from v_proposal.recipient then
    if v_proposal.contact_id is null or not private.contact_has_email(v_proposal.contact_id, v_recipient) then
      raise exception 'the recipient must be one of the contact e-mails' using errcode = '22023';
    end if;
  end if;
  v_subject := coalesce(nullif(btrim(p_subject), ''), v_proposal.subject);
  if length(coalesce(v_subject, '')) > 500 then
    raise exception 'the subject is too long' using errcode = '22023';
  end if;

  update private.reply_proposals set
    body = v_body,
    subject = v_subject,
    recipient = v_recipient,
    revision = revision + 1,
    -- Um rascunho que a IA não conseguiu escrever, escrito à mão, vale como pronto; um desatualizado, revisto pelo
    -- titular, volta a ser pronto (a Aprovação ainda é um passo à parte).
    status = 'pronta',
    failure_code = null,
    approved_revision = null, approved_by = null, approved_at = null, approved_recipient = null, approved_channel = null,
    decided_by = null, decided_at = null,
    updated_at = now()
  where id = v_proposal.id
  returning revision into v_proposal.revision;
  return v_proposal.revision;
end;
$$;

-- Aprova a revisão que o titular viu: registra quem, quando, a revisão, o destinatário e o canal. Repetir a chamada
-- (clique duplo, nova tentativa) não faz nada de novo. Não envia e não retoma a Sequência.
create function public.approve_reply_proposal(p_proposal_id uuid, p_revision integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proposal private.reply_proposals;
begin
  v_proposal := private.lock_reply_proposal_of_owner(p_proposal_id);
  if p_revision is distinct from v_proposal.revision then
    raise exception 'the reply proposal changed since it was read' using errcode = '55000';
  end if;
  -- A mesma revisão já aprovada, ou já em andamento ou enviada: a chamada repetida devolve o estado, sem mudar nada.
  if v_proposal.status in ('aprovada', 'enviando', 'enviada', 'incerta') and v_proposal.approved_revision = p_revision then
    return v_proposal.status;
  end if;
  if v_proposal.status = 'desatualizada' then
    raise exception 'the reply proposal is outdated' using errcode = '55000';
  end if;
  if v_proposal.status <> 'pronta' or nullif(btrim(coalesce(v_proposal.body, '')), '') is null then
    raise exception 'the reply proposal is not ready to approve' using errcode = '55000';
  end if;

  update private.reply_proposals set
    status = 'aprovada',
    approved_revision = revision,
    approved_by = auth.uid(),
    approved_at = now(),
    approved_recipient = recipient,
    approved_channel = channel,
    decided_by = auth.uid(),
    decided_at = now(),
    send_error = null, send_error_at = null,
    updated_at = now()
  where id = v_proposal.id;
  return 'aprovada';
end;
$$;

-- Rejeita: nada é enviado e a Sequência continua como está. Só o que ainda não saiu pode ser rejeitado.
create function public.reject_reply_proposal(p_proposal_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proposal private.reply_proposals;
begin
  v_proposal := private.lock_reply_proposal_of_owner(p_proposal_id);
  if v_proposal.status = 'rejeitada' then
    return 'rejeitada';
  end if;
  if v_proposal.status in ('enviando', 'enviada', 'incerta') then
    raise exception 'the reply was already sent or is being sent' using errcode = '55000';
  end if;
  update private.reply_proposals set
    status = 'rejeitada', decided_by = auth.uid(), decided_at = now(), updated_at = now()
  where id = v_proposal.id;
  update private.reply_proposal_jobs set
    status = 'cancelled', claimed_until = null, claim_token = null, finished_at = now(), updated_at = now()
  where proposal_id = v_proposal.id and status = 'queued';
  return 'rejeitada';
end;
$$;

-- Gera de novo (a IA falhou, ou o titular quer outra versão, ou a conversa andou): volta a "gerando" com o contexto atual
-- e desfaz a Aprovação. Cada geração gasta crédito, então o número de gerações por proposta é limitado.
create function public.request_reply_proposal_again(p_proposal_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proposal private.reply_proposals;
begin
  v_proposal := private.lock_reply_proposal_of_owner(p_proposal_id);
  if v_proposal.status = 'gerando' then
    return 'gerando';
  end if;
  if v_proposal.status not in ('pronta', 'falhou', 'desatualizada', 'aprovada') then
    raise exception 'the reply proposal cannot be generated again now' using errcode = '55000';
  end if;
  if v_proposal.generations >= private.reply_proposal_max_generations() then
    raise exception 'too many generations for this reply proposal' using errcode = '54000';
  end if;

  update private.reply_proposals set
    status = 'gerando', generations = generations + 1, failure_code = null,
    approved_revision = null, approved_by = null, approved_at = null, approved_recipient = null, approved_channel = null,
    decided_by = null, decided_at = null, updated_at = now()
  where id = v_proposal.id;
  insert into private.reply_proposal_jobs (proposal_id, workspace_id, origin_interaction_id)
  values (v_proposal.id, v_proposal.workspace_id, v_proposal.origin_interaction_id)
  on conflict (origin_interaction_id) do update set
    status = 'queued', attempts = 0, run_after = now(), claimed_until = null, claim_token = null,
    last_error = null, last_error_at = null, finished_at = null, updated_at = now();
  return 'gerando';
end;
$$;

-- O titular conferiu a caixa de saída de um envio incerto e diz se a resposta saiu. Saiu: vira enviada. Não saiu: volta a
-- pronta, e a Aprovação é pedida de novo.
create function public.resolve_uncertain_reply_proposal(p_proposal_id uuid, p_went_out boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proposal private.reply_proposals;
begin
  v_proposal := private.lock_reply_proposal_of_owner(p_proposal_id);
  if v_proposal.status = 'enviada' and p_went_out then
    return 'enviada';
  end if;
  if v_proposal.status <> 'incerta' then
    raise exception 'the reply send is not uncertain' using errcode = '55000';
  end if;
  if p_went_out then
    perform private.mark_reply_sent(v_proposal.id, null, null, null);
    return 'enviada';
  end if;
  update private.reply_proposals set
    status = 'pronta', send_error = null, send_error_at = null,
    approved_revision = null, approved_by = null, approved_at = null, approved_recipient = null, approved_channel = null,
    decided_by = null, decided_at = null, updated_at = now()
  where id = v_proposal.id;
  return 'pronta';
end;
$$;

-- Marca a resposta como enviada e registra a Interação "enviado" da Conta-alvo, sem conteúdo (como o envio de um passo).
create function private.mark_reply_sent(
  p_proposal_id uuid, p_provider_email_id text, p_provider_message_id text, p_provider_thread_id text
) returns private.reply_proposals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proposal private.reply_proposals;
begin
  update private.reply_proposals set
    status = 'enviada',
    sent_at = coalesce(sent_at, now()),
    provider_email_id = coalesce(provider_email_id, nullif(btrim(p_provider_email_id), '')),
    provider_message_id = coalesce(provider_message_id, nullif(btrim(p_provider_message_id), '')),
    provider_thread_id = coalesce(provider_thread_id, nullif(btrim(p_provider_thread_id), '')),
    send_error = null, send_error_at = null,
    updated_at = now()
  where id = p_proposal_id
  returning * into v_proposal;

  insert into public.account_interactions (workspace_id, target_account_id, contact_id, kind, occurred_at, source, recorded_by)
  values (v_proposal.workspace_id, v_proposal.target_account_id, v_proposal.contact_id,
    case when v_proposal.channel = 'email' then 'email-enviado' else 'mensagem-enviada' end,
    v_proposal.sent_at, 'sequencia', v_proposal.owner_user_id);
  update public.target_accounts
  set last_interaction_at = greatest(last_interaction_at, v_proposal.sent_at)
  where id = v_proposal.target_account_id;
  -- Com a resposta enviada, outra proposta aberta da mesma conversa (de uma mensagem mais antiga) deixa de valer: o
  -- titular já respondeu.
  perform private.mark_reply_proposals_outdated(
    v_proposal.sequence_id, v_proposal.channel, v_proposal.conversation_ref, v_proposal.origin_interaction_id);
  return v_proposal;
end;
$$;

revoke all on function private.mark_reply_sent(uuid, text, text, text) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- A IA: o trabalho de gerar. Só o servidor (service_role), pela Edge Function reply-proposal-runner, que não recebe
-- ferramenta nem credencial de envio.

-- Reserva os trabalhos devidos (na fila, ou reservados por quem caiu), em ordem, para uma só função. O trabalho de uma
-- proposta que já não está "gerando" (rejeitada, desatualizada) é cancelado sem gastar IA, e o de um titular que saiu do
-- Workspace falha. Cada reserva traz um token: só quem a tem grava o resultado.
create function public.claim_reply_proposal_jobs(p_limit integer default 5)
returns table (job_id uuid, proposal_id uuid, claim_token uuid, attempt integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_row record;
  v_job private.reply_proposal_jobs;
  v_proposal private.reply_proposals;
  v_token uuid;
begin
  for v_row in
    select j.id as job_id, j.proposal_id
    from private.reply_proposal_jobs j
    join private.reply_proposals p on p.id = j.proposal_id
    where (j.status = 'queued' and j.run_after <= now())
       or (j.status = 'running' and j.claimed_until < now())
    order by j.run_after, j.id
    limit greatest(coalesce(p_limit, 5), 1)
    for update of p skip locked
  loop
    select p.* into v_proposal from private.reply_proposals p where p.id = v_row.proposal_id;
    select j.* into v_job from private.reply_proposal_jobs j where j.id = v_row.job_id for update;
    if not ((v_job.status = 'queued' and v_job.run_after <= now())
      or (v_job.status = 'running' and v_job.claimed_until < now())) then
      continue;
    end if;

    if v_proposal.status <> 'gerando' then
      update private.reply_proposal_jobs set
        status = 'cancelled', claimed_until = null, claim_token = null, finished_at = now(), updated_at = now()
      where id = v_job.id;
      continue;
    end if;
    if not exists (
      select 1 from public.workspace_memberships m
      where m.workspace_id = v_proposal.workspace_id and m.user_id = v_proposal.owner_user_id and m.active
    ) or not private.reply_proposal_owner_is_responsible(v_proposal, v_proposal.owner_user_id) then
      update private.reply_proposal_jobs set
        status = 'failed', last_error = 'owner_not_responsible', last_error_at = now(), claimed_until = null,
        claim_token = null, finished_at = now(), updated_at = now()
      where id = v_job.id;
      update private.reply_proposals set status = 'falhou', failure_code = 'owner_not_responsible', updated_at = now()
      where id = v_proposal.id;
      continue;
    end if;
    -- Uma reserva esquecida na última tentativa (a função caiu): acabou o limite, a proposta falha.
    if v_job.attempts >= private.reply_proposal_max_attempts() then
      update private.reply_proposal_jobs set
        status = 'failed', last_error = coalesce(last_error, 'attempts_exhausted'), last_error_at = now(),
        claimed_until = null, claim_token = null, finished_at = now(), updated_at = now()
      where id = v_job.id;
      update private.reply_proposals set status = 'falhou', failure_code = 'attempts_exhausted', updated_at = now()
      where id = v_proposal.id;
      continue;
    end if;

    v_token := gen_random_uuid();
    update private.reply_proposal_jobs set
      status = 'running', attempts = attempts + 1, claim_token = v_token,
      claimed_until = now() + interval '5 minutes', updated_at = now()
    where id = v_job.id;
    return query select v_job.id, v_proposal.id, v_token, v_job.attempts + 1;
  end loop;
end;
$$;

-- O trabalho em andamento, de quem tem o token; senão o resultado dele não vale.
create function private.running_reply_job(p_job_id uuid, p_claim_token uuid)
returns private.reply_proposal_jobs
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_job private.reply_proposal_jobs;
begin
  select j.* into v_job from private.reply_proposal_jobs j
  where j.id = p_job_id and j.status = 'running' and j.claim_token is not null and j.claim_token = p_claim_token;
  if not found then
    raise exception 'the reply proposal job is not running for this claim' using errcode = '55000';
  end if;
  return v_job;
end;
$$;

revoke all on function private.running_reply_job(uuid, uuid) from public, anon, authenticated, service_role;

-- O contexto MÍNIMO da geração: a Conta-alvo, o Contato, a conversa relevante (as mensagens trocadas naquela conversa,
-- não a caixa de entrada), o Playbook (Empresa, ICP, Cadência, Scripts, Templates, Frameworks e Objeções) e o tom do
-- Rhetor. Nada de outros Contatos, de outras Contas, de e-mails ou telefones.
create function public.reply_proposal_context(p_job_id uuid, p_claim_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_job private.reply_proposal_jobs;
  v_proposal private.reply_proposals;
  v_account public.target_accounts;
  v_contact public.contacts;
  v_workspace text;
  v_seller text;
  v_agent jsonb;
  v_messages jsonb;
  v_playbook jsonb;
begin
  v_job := private.running_reply_job(p_job_id, p_claim_token);
  select p.* into v_proposal from private.reply_proposals p where p.id = v_job.proposal_id;
  select a.* into v_account from public.target_accounts a
  where a.workspace_id = v_proposal.workspace_id and a.id = v_proposal.target_account_id;
  select c.* into v_contact from public.contacts c
  where c.workspace_id = v_proposal.workspace_id and c.id = v_proposal.contact_id;
  select w.name into v_workspace from public.workspaces w where w.id = v_proposal.workspace_id;
  select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(u.raw_user_meta_data ->> 'name'), ''))
    into v_seller from auth.users u where u.id = v_proposal.owner_user_id;

  select jsonb_build_object('name', a.name, 'instructions', coalesce(s.instructions, ''), 'voice_tone', coalesce(s.voice_tone, ''))
    into v_agent
  from private.agents a
  left join private.agent_settings s on s.agent_id = a.id
  where a.workspace_id = v_proposal.workspace_id and a.specialty = 'rhetor' and a.kind = 'padrao';

  -- A conversa: as respostas recebidas dela, o que o vendedor enviou ao Contato na Sequência e as respostas já enviadas.
  select coalesce(jsonb_agg(m.item order by m.at), '[]'::jsonb) into v_messages
  from (
    select x.at, x.item from (
      select r.received_at as at, jsonb_build_object(
        'direction', 'recebida', 'at', r.received_at, 'subject', r.subject, 'text', left(coalesce(r.body, r.snippet, ''), 6000)) as item
      from private.received_emails r
      where r.sequence_id = v_proposal.sequence_id
        and r.workspace_id = v_proposal.workspace_id
        and (case when v_proposal.channel = 'email' then
          coalesce(nullif(btrim(r.provider_thread_id), ''), 'de:' || lower(coalesce(r.from_email, ''))) = v_proposal.conversation_ref
          else false end)
      union all
      select e.sent_at, jsonb_build_object(
        'direction', 'enviada', 'at', e.sent_at, 'subject', e.subject, 'text', left(coalesce(e.body, ''), 6000))
      from private.sequence_step_sends e
      where e.sequence_id = v_proposal.sequence_id and e.status = 'sent' and e.sent_at is not null
        and e.contact_id is not distinct from v_proposal.contact_id and e.body is not null
      union all
      select o.sent_at, jsonb_build_object(
        'direction', 'enviada', 'at', o.sent_at, 'subject', o.subject, 'text', left(coalesce(o.body, ''), 6000))
      from private.reply_proposals o
      where o.sequence_id = v_proposal.sequence_id and o.channel = v_proposal.channel
        and o.conversation_ref is not distinct from v_proposal.conversation_ref
        and o.status = 'enviada' and o.id <> v_proposal.id and o.sent_at is not null
      order by 1 desc
      limit 8
    ) x
  ) m;

  select coalesce(jsonb_agg(s.item order by s.position), '[]'::jsonb) into v_playbook
  from (
    select c.position, jsonb_build_object('section', c.section, 'name', c.name, 'content', v.content) as item
    from private.playbook_section_catalog c
    cross join lateral (
      select x.content from private.playbook_section_versions x
      where x.workspace_id = v_proposal.workspace_id and x.section = c.section
      order by x.version desc limit 1
    ) v
    where c.section in ('empresa', 'icp', 'cadencia', 'scripts', 'templates', 'frameworks', 'objecoes')
  ) s;

  return jsonb_build_object(
    'workspace', v_workspace,
    'channel', v_proposal.channel,
    'subject', v_proposal.subject,
    'seller', v_seller,
    'account', jsonb_build_object('name', v_account.name, 'domain', v_account.domain, 'segment', v_account.segment),
    'contact', case when v_contact.id is null then null
      else jsonb_build_object('name', v_contact.name, 'role', v_contact.role) end,
    'recipient_name', v_proposal.recipient_name,
    'messages', v_messages,
    'playbook', v_playbook,
    'agent', coalesce(v_agent, '{}'::jsonb)
  );
end;
$$;

-- Abre a rodada de crédito da geração (1 crédito; 20% com a chave de IA do próprio cliente), como begin_agent_round: free
-- (cobrança desligada), go (reservou), paid (já paga) ou no_credits. A chave é o trabalho e a tentativa; fechar usa
-- end_agent_round, que só depende da reserva.
create function public.begin_reply_proposal_round(p_job_id uuid, p_claim_token uuid)
returns table (outcome text, reservation_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.reply_proposal_jobs;
  v_proposal private.reply_proposals;
  v_key text;
  v_existing private.credit_reservations%rowtype;
  v_user uuid;
  v_id uuid;
  v_own boolean;
begin
  v_job := private.running_reply_job(p_job_id, p_claim_token);
  select p.* into v_proposal from private.reply_proposals p where p.id = v_job.proposal_id;
  if not private.credits_enforced(v_proposal.workspace_id) then
    return query select 'free'::text, null::uuid;
    return;
  end if;

  v_key := 'reply-proposal:' || v_job.id::text || ':' || v_job.attempts::text || ':' || v_proposal.generations::text;
  perform pg_advisory_xact_lock(hashtext('agent-round:' || v_key));
  select * into v_existing from private.credit_reservations r
  where r.workspace_id = v_proposal.workspace_id and r.action_key = v_key;
  if found then
    if v_existing.status = 'reserved' then
      return query select 'go'::text, v_existing.id;
      return;
    elsif v_existing.status = 'settled' then
      return query select 'paid'::text, v_existing.id;
      return;
    end if;
    delete from private.credit_reservations where id = v_existing.id;
  end if;

  v_user := case when exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = v_proposal.workspace_id and m.user_id = v_proposal.owner_user_id and m.active
  ) then v_proposal.owner_user_id end;
  v_own := exists (select 1 from private.workspace_ai_keys k where k.workspace_id = v_proposal.workspace_id);
  begin
    v_id := public.reserve_credits(v_proposal.workspace_id, v_user, 'agent_round', v_key, 1, v_own);
  exception when others then
    if sqlerrm in ('insufficient credits', 'monthly credit limit reached') then
      return query select 'no_credits'::text, null::uuid;
      return;
    end if;
    raise;
  end;
  return query select 'go'::text, v_id;
end;
$$;

-- A chave de IA do cliente do Workspace da proposta, como agent_run_ai_key: nenhuma linha quando ele usa o modelo da
-- Althius; falha com motivo quando a chave está ligada mas sem valor no Vault. Só o servidor.
create function public.reply_proposal_ai_key(p_job_id uuid, p_claim_token uuid)
returns table (provider text, model text, api_key text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.reply_proposal_jobs;
  v_config private.workspace_ai_keys%rowtype;
  v_secret text;
begin
  v_job := private.running_reply_job(p_job_id, p_claim_token);
  select * into v_config from private.workspace_ai_keys k where k.workspace_id = v_job.workspace_id;
  if not found then
    return;
  end if;
  select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = v_config.secret_name;
  if v_secret is null or btrim(v_secret) = '' then
    raise exception 'workspace ai key unavailable' using errcode = '55000';
  end if;
  return query select v_config.provider, v_config.model, btrim(v_secret);
end;
$$;

-- Grava o texto gerado: uma nova revisão. A proposta "gerando" fica pronta; a que ficou desatualizada no meio do caminho
-- guarda o texto mas continua desatualizada (o titular decide); a rejeitada no meio do caminho não muda.
create function public.save_generated_reply(p_job_id uuid, p_claim_token uuid, p_body text, p_model text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.reply_proposal_jobs;
  v_proposal private.reply_proposals;
  v_proposal_id uuid;
  v_body text := btrim(coalesce(p_body, ''));
begin
  -- A proposta antes do trabalho, na mesma ordem do claim e das decisões do titular.
  select j.proposal_id into v_proposal_id from private.reply_proposal_jobs j where j.id = p_job_id;
  select p.* into v_proposal from private.reply_proposals p where p.id = v_proposal_id for update;
  v_job := private.running_reply_job(p_job_id, p_claim_token);
  if v_body = '' or length(v_body) > 20000 then
    raise exception 'the generated reply must have between 1 and 20000 characters' using errcode = '22023';
  end if;

  if v_proposal.status in ('gerando', 'desatualizada') then
    update private.reply_proposals set
      body = v_body, revision = revision + 1, model = nullif(btrim(p_model), ''), failure_code = null,
      status = case when status = 'gerando' then 'pronta' else status end,
      updated_at = now()
    where id = v_proposal.id
    returning status into v_proposal.status;
  end if;
  update private.reply_proposal_jobs set
    status = 'done', claimed_until = null, claim_token = null, last_error = null, finished_at = now(), updated_at = now()
  where id = v_job.id;
  return v_proposal.status;
end;
$$;

-- A IA não respondeu. Um motivo passageiro (p_retryable) devolve o trabalho à fila para outra tentativa, mais tarde, até
-- o limite; senão (ou esgotado o limite) a proposta fica "falhou", com o motivo, e o titular pode gerar de novo. A
-- resposta recebida e a pausa da Sequência não mudam.
create function public.fail_reply_proposal_job(
  p_job_id uuid, p_claim_token uuid, p_error_code text, p_retryable boolean default false
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.reply_proposal_jobs;
  v_proposal private.reply_proposals;
  v_proposal_id uuid;
  v_code text := left(coalesce(nullif(btrim(p_error_code), ''), 'unknown'), 100);
begin
  select j.proposal_id into v_proposal_id from private.reply_proposal_jobs j where j.id = p_job_id;
  select p.* into v_proposal from private.reply_proposals p where p.id = v_proposal_id for update;
  v_job := private.running_reply_job(p_job_id, p_claim_token);

  if p_retryable and v_job.attempts < private.reply_proposal_max_attempts() and v_proposal.status = 'gerando' then
    update private.reply_proposal_jobs set
      status = 'queued', claimed_until = null, claim_token = null, last_error = v_code, last_error_at = now(),
      run_after = now() + (v_job.attempts * interval '2 minutes'), updated_at = now()
    where id = v_job.id;
    return 'retry';
  end if;

  update private.reply_proposal_jobs set
    status = 'failed', claimed_until = null, claim_token = null, last_error = v_code, last_error_at = now(),
    finished_at = now(), updated_at = now()
  where id = v_job.id;
  if v_proposal.status = 'gerando' then
    update private.reply_proposals set status = 'falhou', failure_code = v_code, updated_at = now()
    where id = v_proposal.id;
  end if;
  return 'failed';
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- O envio da resposta aprovada: só o servidor, em nome do titular que a Edge Function autenticou.

-- A conversa da mensagem de origem, para a função conferir na Unipile, antes de enviar, se chegou outra mensagem que o
-- webhook perdeu (ele reentrega só duas vezes). Uma mensagem nova achada ali é gravada, deixa a proposta desatualizada e
-- o envio não sai.
create function public.conversation_for_reply(p_proposal_id uuid, p_user_id uuid)
returns table (unipile_account_id text, provider_thread_id text, provider_email_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.unipile_account_id, r.provider_thread_id, r.provider_email_id
  from private.reply_proposals p
  join private.received_emails r on r.interaction_id = p.origin_interaction_id
  join private.sender_accounts a on a.id = p.sender_account_id
  where p.id = p_proposal_id and p.owner_user_id = p_user_id and p.channel = 'email';
$$;

-- Libera o envio da resposta aprovada, como release_step_send: com a Sequência e a proposta travadas, revalida o titular
-- (Participação ativa e ainda responsável), a Aprovação da revisão atual (destinatário e canal iguais aos aprovados), que
-- a proposta não está desatualizada, a Conta-alvo, a Conta remetente (a mesma que recebeu, pronta e sem reconciliação) e
-- o Contato (vínculo ativo e o e-mail ainda dele). Liberada, vira "enviando", uma vez só: a segunda chamada recebe
-- in_flight ou already_sent. A Sequência pode estar pausada (é o esperado depois de uma resposta). O resultado do
-- bloqueio vem em `outcome`. p_channels são os canais que a função sabe enviar.
create function public.release_approved_reply(
  p_proposal_id uuid, p_user_id uuid, p_channels text[] default array['email']
) returns table (
  outcome text, proposal_id uuid, channel text, unipile_account_id text, destination text, contact_name text,
  subject text, body text, reply_to_message_id text, tracking_header_name text, tracking_header_value text,
  revision integer
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_proposal private.reply_proposals;
  v_sequence public.sequences;
  v_sender private.sender_accounts;
  v_contact public.contacts;
  v_account public.target_accounts;
  v_blocked text;
begin
  select p.* into v_proposal from private.reply_proposals p where p.id = p_proposal_id;
  if not found then
    raise exception 'reply proposal not found' using errcode = 'P0002';
  end if;
  -- A trava da Sequência vem antes da proposta, na mesma ordem da ingestão e do envio de passo.
  select s.* into v_sequence from public.sequences s where s.id = v_proposal.sequence_id for update;
  select p.* into v_proposal from private.reply_proposals p where p.id = p_proposal_id for update;

  if v_proposal.status = 'enviando' then
    perform private.expire_stale_reply_sends(v_proposal.id);
    select p.status into v_proposal.status from private.reply_proposals p where p.id = v_proposal.id;
  end if;

  if not private.reply_proposal_owner_is_responsible(v_proposal, p_user_id) then
    v_blocked := 'owner_not_responsible';
  end if;

  if v_blocked is null then
    v_blocked := case v_proposal.status
      when 'aprovada' then null
      when 'enviando' then 'in_flight'
      when 'enviada' then 'already_sent'
      when 'incerta' then 'reconcile_required'
      when 'desatualizada' then 'outdated'
      else 'not_approved'
    end;
  end if;

  -- A Aprovação vale para a revisão, o destinatário e o canal de agora.
  if v_blocked is null and (
    v_proposal.approved_revision is distinct from v_proposal.revision
    or v_proposal.approved_recipient is distinct from v_proposal.recipient
    or v_proposal.approved_channel is distinct from v_proposal.channel
    or nullif(btrim(coalesce(v_proposal.body, '')), '') is null) then
    v_blocked := 'not_approved';
  end if;

  if v_blocked is null and not (v_proposal.channel = any (coalesce(p_channels, '{}'))) then
    v_blocked := 'channel_not_supported';
  end if;

  -- Defesa em profundidade: uma mensagem que chegou na conversa depois da Aprovação, por qualquer caminho, deixa a
  -- proposta desatualizada. (As anteriores à Aprovação o titular já tinha à vista ao aprovar.)
  if v_blocked is null and v_proposal.channel = 'email' and exists (
    select 1 from private.received_emails r
    where r.sequence_id = v_proposal.sequence_id
      and coalesce(nullif(btrim(r.provider_thread_id), ''), 'de:' || lower(coalesce(r.from_email, ''))) = v_proposal.conversation_ref
      and r.interaction_id <> v_proposal.origin_interaction_id
      and r.created_at > v_proposal.approved_at) then
    update private.reply_proposals set status = 'desatualizada', updated_at = now() where id = v_proposal.id;
    v_blocked := 'outdated';
  end if;

  if v_blocked is null and v_sequence.status = 'encerrada' then
    v_blocked := 'sequence_ended';
  end if;

  if v_blocked is null then
    select a.* into v_account from public.target_accounts a
    where a.workspace_id = v_proposal.workspace_id and a.id = v_proposal.target_account_id;
    if not found or v_account.archived_at is not null or v_account.deleted_at is not null then
      v_blocked := 'account_unavailable';
    end if;
  end if;

  -- A mesma Conta remetente que recebeu a mensagem, ainda do titular, pronta e sem reconciliação pendente.
  if v_blocked is null then
    select a.* into v_sender from private.sender_accounts a
    where a.id = v_proposal.sender_account_id and a.owner_user_id = p_user_id
      and a.workspace_id = v_proposal.workspace_id and a.channel = v_proposal.channel
      and a.status = 'ready' and not a.reconciliation_required;
    if not found then
      v_blocked := 'sender_not_ready';
    end if;
  end if;

  if v_blocked is null and v_proposal.contact_id is not null then
    select c.* into v_contact from public.contacts c
    where c.id = v_proposal.contact_id and c.workspace_id = v_proposal.workspace_id;
    if not found or not exists (
      select 1 from public.contact_account_links l
      where l.contact_id = v_proposal.contact_id and l.target_account_id = v_proposal.target_account_id
        and l.ended_at is null) then
      v_blocked := 'contact_unlinked';
    -- ADR-0014: um Destino que o Contato não tem mais não recebe a resposta.
    elsif v_proposal.channel = 'email' and not private.contact_has_email(v_contact.id, v_proposal.recipient) then
      v_blocked := 'destination_changed';
    end if;
  end if;

  if v_blocked is not null then
    return query select v_blocked, v_proposal.id, v_proposal.channel, null::text, null::text, null::text,
      null::text, null::text, null::text, null::text, null::text, v_proposal.revision;
    return;
  end if;

  update private.reply_proposals set
    status = 'enviando', send_attempts = send_attempts + 1, sending_at = now(),
    send_error = null, send_error_at = null, updated_at = now()
  where id = v_proposal.id;

  return query select 'released', v_proposal.id, v_proposal.channel, v_sender.unipile_account_id, v_proposal.recipient,
    coalesce(v_contact.name, v_proposal.recipient_name), v_proposal.subject, v_proposal.body,
    v_proposal.reply_to_message_id, 'X-Althius-Resposta', v_proposal.id::text || ':' || v_proposal.revision::text,
    v_proposal.revision;
end;
$$;

-- O resultado do envio, como record_sequence_step_send_result: enviada (guarda os ids do provedor e registra a Interação
-- "enviado"), falha do provedor (volta a aprovada, para tentar de novo com a mesma revisão) ou incerta (exige conferir
-- antes de reenviar). Repetir o resultado de uma resposta já enviada não faz nada de novo.
create function public.record_reply_send_result(
  p_proposal_id uuid,
  p_outcome text,
  p_provider_email_id text,
  p_provider_message_id text,
  p_provider_thread_id text,
  p_error text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proposal private.reply_proposals;
begin
  if p_outcome not in ('sent', 'failed', 'uncertain') then
    raise exception 'unknown send outcome' using errcode = '22023';
  end if;
  perform 1 from public.sequences s
  where s.id = (select p.sequence_id from private.reply_proposals p where p.id = p_proposal_id)
  for update;
  select p.* into v_proposal from private.reply_proposals p where p.id = p_proposal_id for update;
  if not found then
    raise exception 'reply proposal not found' using errcode = 'P0002';
  end if;
  if v_proposal.status = 'enviada' then
    update private.reply_proposals set
      provider_email_id = coalesce(provider_email_id, nullif(btrim(p_provider_email_id), '')),
      provider_message_id = coalesce(provider_message_id, nullif(btrim(p_provider_message_id), '')),
      provider_thread_id = coalesce(provider_thread_id, nullif(btrim(p_provider_thread_id), '')),
      updated_at = now()
    where id = v_proposal.id;
    return 'enviada';
  end if;
  if v_proposal.status <> 'enviando' then
    raise exception 'reply is not in flight' using errcode = '55000';
  end if;

  if p_outcome = 'sent' then
    v_proposal := private.mark_reply_sent(v_proposal.id, p_provider_email_id, p_provider_message_id, p_provider_thread_id);
    return v_proposal.status;
  end if;

  update private.reply_proposals set
    status = case when p_outcome = 'failed' then 'aprovada' else 'incerta' end,
    send_error = left(coalesce(p_error, p_outcome), 500),
    send_error_at = now(),
    updated_at = now()
  where id = v_proposal.id
  returning status into v_proposal.status;
  return v_proposal.status;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- O Executor das propostas: a cada minuto o pg_cron olha se há trabalho devido e, só então, chama a Edge Function
-- reply-proposal-runner pelo pg_net, com um token próprio (guardado só no banco, conferido por
-- reply_proposal_runner_token_matches). O endereço da função é o do Executor da Sequência com o nome trocado, a menos que
-- private.configure_reply_proposal_runner diga outro. Sem endereço, nada é chamado.

create table private.reply_proposal_runner_settings (
  singleton boolean primary key default true check (singleton),
  function_url text,
  token text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  updated_at timestamptz not null default now()
);

insert into private.reply_proposal_runner_settings default values;

alter table private.reply_proposal_runner_settings enable row level security;
revoke all on private.reply_proposal_runner_settings from public, anon, authenticated, service_role;

comment on table private.reply_proposal_runner_settings is
  'Where the database calls the reply-proposal-runner Edge Function and the token that proves the call came from it.';

create function public.reply_proposal_runner_token_matches(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.reply_proposal_runner_settings s
    where length(coalesce(p_token, '')) >= 32 and s.token = p_token);
$$;

create function private.configure_reply_proposal_runner(p_project_url text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
begin
  if coalesce(p_project_url, '') !~ '^https://[A-Za-z0-9.-]+(:[0-9]{2,5})?/?$' then
    raise exception 'project url must look like https://<ref>.supabase.co' using errcode = '22023';
  end if;
  v_url := regexp_replace(p_project_url, '/$', '') || '/functions/v1/reply-proposal-runner';
  update private.reply_proposal_runner_settings set function_url = v_url, updated_at = now();
  return v_url;
end;
$$;

-- A chamada HTTP em si, separada para os testes a trocarem dentro da transação (o CI não fala com a função).
create function private.post_to_reply_proposal_runner(p_url text, p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform net.http_post(
    url := p_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-runner-token', p_token),
    timeout_milliseconds := 5000);
end;
$$;

-- O que o pg_cron roda a cada minuto. Passa os envios esquecidos em voo a incertos e chama a função só quando há trabalho
-- devido; devolve se chamou.
create function private.kick_reply_proposal_runner()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings private.reply_proposal_runner_settings;
  v_url text;
begin
  perform private.expire_stale_reply_sends(null);
  select s.* into v_settings from private.reply_proposal_runner_settings s;
  v_url := coalesce(v_settings.function_url, (
    select replace(q.function_url, '/functions/v1/sequence-runner', '/functions/v1/reply-proposal-runner')
    from private.sequence_runner_settings q
    where q.function_url like '%/functions/v1/sequence-runner'));
  if v_url is null then
    return false;
  end if;
  if not exists (
    select 1 from private.reply_proposal_jobs j
    where (j.status = 'queued' and j.run_after <= now())
       or (j.status = 'running' and j.claimed_until < now())) then
    return false;
  end if;
  perform private.post_to_reply_proposal_runner(v_url, v_settings.token);
  return true;
end;
$$;

revoke all on function private.configure_reply_proposal_runner(text) from public, anon, authenticated, service_role;
revoke all on function private.post_to_reply_proposal_runner(text, text) from public, anon, authenticated, service_role;
revoke all on function private.kick_reply_proposal_runner() from public, anon, authenticated, service_role;

do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
    and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('althius-reply-proposal-runner', '* * * * *', 'select private.kick_reply_proposal_runner()');
  end if;
end
$cron$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Permissões. O titular chama pelo app (authenticated); o servidor, pelas Edge Functions (service_role). Nada para anon.

revoke all on function public.list_reply_proposals(uuid, uuid) from public, anon;
revoke all on function public.get_reply_proposal(uuid) from public, anon;
revoke all on function public.edit_reply_proposal(uuid, integer, text, text, text, text) from public, anon;
revoke all on function public.approve_reply_proposal(uuid, integer) from public, anon;
revoke all on function public.reject_reply_proposal(uuid) from public, anon;
revoke all on function public.request_reply_proposal_again(uuid) from public, anon;
revoke all on function public.resolve_uncertain_reply_proposal(uuid, boolean) from public, anon;
grant execute on function public.list_reply_proposals(uuid, uuid) to authenticated;
grant execute on function public.get_reply_proposal(uuid) to authenticated;
grant execute on function public.edit_reply_proposal(uuid, integer, text, text, text, text) to authenticated;
grant execute on function public.approve_reply_proposal(uuid, integer) to authenticated;
grant execute on function public.reject_reply_proposal(uuid) to authenticated;
grant execute on function public.request_reply_proposal_again(uuid) to authenticated;
grant execute on function public.resolve_uncertain_reply_proposal(uuid, boolean) to authenticated;

revoke all on function public.claim_reply_proposal_jobs(integer) from public, anon, authenticated;
revoke all on function public.reply_proposal_context(uuid, uuid) from public, anon, authenticated;
revoke all on function public.begin_reply_proposal_round(uuid, uuid) from public, anon, authenticated;
revoke all on function public.reply_proposal_ai_key(uuid, uuid) from public, anon, authenticated;
revoke all on function public.save_generated_reply(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.fail_reply_proposal_job(uuid, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.conversation_for_reply(uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_approved_reply(uuid, uuid, text[]) from public, anon, authenticated;
revoke all on function public.record_reply_send_result(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.reply_proposal_runner_token_matches(text) from public, anon, authenticated;
grant execute on function public.claim_reply_proposal_jobs(integer) to service_role;
grant execute on function public.reply_proposal_context(uuid, uuid) to service_role;
grant execute on function public.begin_reply_proposal_round(uuid, uuid) to service_role;
grant execute on function public.reply_proposal_ai_key(uuid, uuid) to service_role;
grant execute on function public.save_generated_reply(uuid, uuid, text, text) to service_role;
grant execute on function public.fail_reply_proposal_job(uuid, uuid, text, boolean) to service_role;
grant execute on function public.conversation_for_reply(uuid, uuid) to service_role;
grant execute on function public.release_approved_reply(uuid, uuid, text[]) to service_role;
grant execute on function public.record_reply_send_result(uuid, text, text, text, text, text) to service_role;
grant execute on function public.reply_proposal_runner_token_matches(text) to service_role;

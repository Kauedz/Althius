-- Primeiro ciclo real por E-mail (canais-04).
-- O Vendedor responsável confirma um passo de E-mail: a confirmação fixa o Destino do Contato, o conteúdo e a Conta
-- remetente dele (ADR-0014). O envio pela Unipile v1 é reservado de forma exclusiva e o resultado do provedor fica
-- persistido: aceitação não é entrega nem leitura. Um resultado incerto nunca é reenviado sem reconciliação.
-- O webhook de e-mail v1 é persistido antes da confirmação ao provedor e processado depois, de forma idempotente:
-- uma resposta de um Contato registra a mensagem privada do titular, a Interação e o evento compartilhado
-- "Contato respondeu; sequência pausada" e pausa a Sequência da Conta-alvo, tudo numa transação.
-- As funções chamadas pelas Edge Functions devolvem jsonb e só o service_role as executa.

-- 1. Passo confirmado e seu envio: um registro por passo do documento.
create table private.sequence_step_sends (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.sequences(id),
  workspace_id uuid not null,
  target_account_id text not null,
  owner_user_id uuid not null references auth.users(id),
  step_id text not null,
  channel text not null check (channel in ('email', 'whatsapp', 'linkedin')),
  contact_id uuid not null,
  -- O Destino confirmado. O envio só sai se o Destino atual do Contato ainda for este.
  destination text not null,
  sender_account_id uuid not null references private.sender_accounts(id),
  subject text not null,
  body text not null,
  status text not null default 'confirmed' check (status in (
    'confirmed',                -- autorizado, aguardando o envio
    'sending',                  -- reservado; a chamada ao provedor está em andamento
    'accepted',                 -- o provedor aceitou; não comprova entrega nem leitura
    'failed',                   -- o provedor recusou; nada saiu
    'uncertain',                -- não se sabe se o provedor aceitou; reconciliar antes de reenviar
    'awaiting_reconfirmation',  -- o Destino ou o passo mudou depois da confirmação
    'invalidated'               -- a Sequência pausou antes do envio
  )),
  status_reason text,
  idempotency_key uuid not null default gen_random_uuid(),
  attempts integer not null default 0,
  provider_tracking_id text,
  provider_email_id text,
  provider_message_id text,
  confirmed_at timestamptz not null default now(),
  claimed_at timestamptz,
  accepted_at timestamptz,
  reconciled_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (sequence_id, step_id),
  foreign key (workspace_id, contact_id) references public.contacts(workspace_id, id),
  foreign key (workspace_id, owner_user_id) references public.workspace_memberships(workspace_id, user_id)
);

create index sequence_step_sends_owner_idx on private.sequence_step_sends (owner_user_id);
create index sequence_step_sends_contact_idx on private.sequence_step_sends (workspace_id, contact_id);
create index sequence_step_sends_sender_idx on private.sequence_step_sends (sender_account_id, destination);
create unique index sequence_step_sends_tracking_idx
  on private.sequence_step_sends (sender_account_id, provider_tracking_id) where provider_tracking_id is not null;

alter table private.sequence_step_sends enable row level security;
revoke all on private.sequence_step_sends from public, anon, authenticated;

comment on table private.sequence_step_sends is
  'Confirmed sequence steps and their provider sends. Holds the confirmed Destino, content and sender; owner RPCs only.';

-- 2. O responsável confirma um passo de E-mail do seu documento.
create function public.confirm_email_step(
  p_sequence_id uuid,
  p_step_id text,
  p_sender_account_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_sequence public.sequences;
  v_document jsonb;
  v_step jsonb;
  v_contact public.contacts;
  v_sender private.sender_accounts;
  v_send private.sequence_step_sends;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select s.* into v_sequence from public.sequences s
  where s.id = p_sequence_id and s.owner_user_id = v_user_id
    and exists (
      select 1 from public.workspace_memberships m
      where m.workspace_id = s.workspace_id and m.user_id = v_user_id and m.active
    )
  for update of s;
  if not found then
    raise exception 'sequence not found or not owned by active user' using errcode = '42501';
  end if;
  if v_sequence.status <> 'ativa' then
    raise exception 'only an active sequence can confirm steps' using errcode = '22023';
  end if;

  select d.document into v_document from private.sequence_documents d
  where d.sequence_id = v_sequence.id and d.owner_user_id = v_user_id;
  select step into v_step from jsonb_array_elements(coalesce(v_document -> 'steps', '[]'::jsonb)) step
  where step ->> 'id' = p_step_id;
  if v_step is null then
    raise exception 'step not found in the sequence document' using errcode = 'P0002';
  end if;
  if v_step ->> 'canal' is distinct from 'email' then
    raise exception 'only email steps can be sent for now' using errcode = '22023';
  end if;
  if nullif(btrim(v_step ->> 'corpo'), '') is null then
    raise exception 'email step needs a body' using errcode = '22023';
  end if;
  if not coalesce(v_document -> 'participantesIds', '[]'::jsonb) ? (v_step ->> 'contatoId') then
    raise exception 'step contact is not a confirmed participant' using errcode = '22023';
  end if;

  -- O Contato precisa ter Vínculo ativo com a Conta-alvo e um e-mail real.
  select c.* into v_contact from public.contacts c
  join public.contact_account_links l
    on l.contact_id = c.id and l.workspace_id = c.workspace_id and l.ended_at is null
  where c.workspace_id = v_sequence.workspace_id
    and c.id::text = v_step ->> 'contatoId'
    and l.target_account_id::text = v_sequence.target_account_id;
  if not found then
    raise exception 'step contact has no active link with this target account' using errcode = '22023';
  end if;
  if v_contact.email is null then
    raise exception 'contact has no email destination' using errcode = '22023';
  end if;

  -- Somente a Conta remetente de E-mail do próprio responsável, pronta para enviar.
  select a.* into v_sender from private.sender_accounts a
  where a.workspace_id = v_sequence.workspace_id and a.owner_user_id = v_user_id and a.channel = 'email'
    and (p_sender_account_id is null or a.id = p_sender_account_id)
    and a.status = 'ready' and not a.reconciliation_required
  order by a.created_at desc;
  if not found then
    raise exception 'no ready email sender account owned by the responsible seller' using errcode = '42501';
  end if;
  if p_sender_account_id is null and (
    select count(*) from private.sender_accounts a
    where a.workspace_id = v_sequence.workspace_id and a.owner_user_id = v_user_id and a.channel = 'email'
      and a.status = 'ready' and not a.reconciliation_required
  ) > 1 then
    raise exception 'choose which email sender account sends this step' using errcode = '22023';
  end if;

  select * into v_send from private.sequence_step_sends
  where sequence_id = v_sequence.id and step_id = p_step_id
  for update;
  if found and v_send.status in ('sending', 'accepted', 'uncertain') then
    raise exception 'step was already sent or its send is unresolved' using errcode = '22023';
  end if;

  -- Uma nova confirmação nunca reaproveita a chave de idempotência: nada saiu com a anterior.
  insert into private.sequence_step_sends (
    sequence_id, workspace_id, target_account_id, owner_user_id, step_id, channel,
    contact_id, destination, sender_account_id, subject, body
  ) values (
    v_sequence.id, v_sequence.workspace_id, v_sequence.target_account_id, v_user_id, p_step_id, 'email',
    v_contact.id, v_contact.email, v_sender.id,
    coalesce(v_step ->> 'assunto', ''), v_step ->> 'corpo'
  )
  on conflict (sequence_id, step_id) do update set
    contact_id = excluded.contact_id,
    destination = excluded.destination,
    sender_account_id = excluded.sender_account_id,
    subject = excluded.subject,
    body = excluded.body,
    status = 'confirmed',
    status_reason = null,
    idempotency_key = gen_random_uuid(),
    attempts = 0,
    confirmed_at = now(),
    claimed_at = null,
    reconciled_at = null,
    updated_at = now()
  returning * into v_send;

  return jsonb_build_object('send_id', v_send.id, 'status', v_send.status, 'destination', v_send.destination);
end;
$$;

revoke all on function public.confirm_email_step(uuid, text, uuid) from public, anon;
grant execute on function public.confirm_email_step(uuid, text, uuid) to authenticated;

-- 3. O responsável acompanha os envios da sua Sequência.
create function public.list_owned_step_sends(p_sequence_id uuid)
returns table (
  id uuid, step_id text, channel text, destination text, status text, status_reason text,
  attempts integer, confirmed_at timestamptz, accepted_at timestamptz, updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.sequences s
    join public.workspace_memberships m
      on m.workspace_id = s.workspace_id and m.user_id = v_user_id and m.active
    where s.id = p_sequence_id and s.owner_user_id = v_user_id
  ) then
    raise exception 'sequence not found or not owned by active user' using errcode = '42501';
  end if;
  return query
    select e.id, e.step_id, e.channel, e.destination, e.status, e.status_reason,
      e.attempts, e.confirmed_at, e.accepted_at, e.updated_at
    from private.sequence_step_sends e
    where e.sequence_id = p_sequence_id and e.owner_user_id = v_user_id
    order by e.confirmed_at, e.step_id;
end;
$$;

revoke all on function public.list_owned_step_sends(uuid) from public, anon;
grant execute on function public.list_owned_step_sends(uuid) to authenticated;

-- 4. Reserva exclusiva do envio. Antes de autorizar, confere de novo a Sequência ativa, a Participação e a
-- responsabilidade do titular, o Destino atual do Contato, o passo do documento e a Conta remetente pronta.
-- Trava a Sequência antes do envio, na mesma ordem da pausa por resposta.
create function public.claim_step_send(p_send_id uuid, p_requested_by uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sequence public.sequences;
  v_send private.sequence_step_sends;
  v_document jsonb;
  v_step jsonb;
  v_contact public.contacts;
  v_sender private.sender_accounts;
begin
  select s.* into v_sequence from public.sequences s
  where s.id = (select e.sequence_id from private.sequence_step_sends e where e.id = p_send_id)
  for share of s;
  select e.* into v_send from private.sequence_step_sends e where e.id = p_send_id for update;
  if not found or v_send.owner_user_id is distinct from p_requested_by then
    raise exception 'step send not found or not owned by requester' using errcode = '42501';
  end if;

  if v_send.status = 'accepted' then
    return jsonb_build_object('outcome', 'already_accepted');
  elsif v_send.status = 'sending' then
    -- Uma reserva abandonada pode ter chegado ao provedor: vira incerta, nunca volta a ser enviável.
    if v_send.claimed_at < now() - interval '2 minutes' then
      update private.sequence_step_sends
      set status = 'uncertain', status_reason = 'send_interrupted', updated_at = now()
      where id = v_send.id;
      return jsonb_build_object('outcome', 'needs_reconciliation');
    end if;
    return jsonb_build_object('outcome', 'in_progress');
  elsif v_send.status = 'uncertain' then
    return jsonb_build_object('outcome', 'needs_reconciliation');
  elsif v_send.status in ('awaiting_reconfirmation', 'invalidated') then
    return jsonb_build_object('outcome', v_send.status);
  end if;

  if v_sequence.status <> 'ativa' or v_sequence.owner_user_id <> v_send.owner_user_id then
    update private.sequence_step_sends
    set status = 'invalidated', status_reason = 'sequence_not_active', updated_at = now()
    where id = v_send.id;
    return jsonb_build_object('outcome', 'invalidated');
  end if;

  if not exists (
    select 1 from public.workspace_memberships m
    join public.sales_responsibilities r
      on r.workspace_id = m.workspace_id and r.owner_user_id = m.user_id
    where m.workspace_id = v_send.workspace_id and m.user_id = v_send.owner_user_id and m.active
      and r.target_account_id = v_send.target_account_id
  ) then
    return jsonb_build_object('outcome', 'owner_not_active');
  end if;

  -- ADR-0014: o passo só sai para o Destino confirmado, e só se ele ainda for o Destino atual do Contato.
  select c.* into v_contact from public.contacts c
  where c.workspace_id = v_send.workspace_id and c.id = v_send.contact_id
    and exists (
      select 1 from public.contact_account_links l
      where l.contact_id = c.id and l.ended_at is null and l.target_account_id::text = v_send.target_account_id
    );
  if not found or v_contact.email is distinct from v_send.destination then
    update private.sequence_step_sends
    set status = 'awaiting_reconfirmation',
        status_reason = case when found then 'destination_changed' else 'contact_link_ended' end,
        updated_at = now()
    where id = v_send.id;
    return jsonb_build_object('outcome', 'awaiting_reconfirmation');
  end if;

  select d.document into v_document from private.sequence_documents d where d.sequence_id = v_send.sequence_id;
  select step into v_step from jsonb_array_elements(coalesce(v_document -> 'steps', '[]'::jsonb)) step
  where step ->> 'id' = v_send.step_id;
  if v_step is null
    or v_step ->> 'canal' is distinct from v_send.channel
    or v_step ->> 'contatoId' is distinct from v_send.contact_id::text
    or coalesce(v_step ->> 'assunto', '') is distinct from v_send.subject
    or v_step ->> 'corpo' is distinct from v_send.body then
    update private.sequence_step_sends
    set status = 'awaiting_reconfirmation', status_reason = 'step_changed', updated_at = now()
    where id = v_send.id;
    return jsonb_build_object('outcome', 'awaiting_reconfirmation');
  end if;

  select a.* into v_sender from private.sender_accounts a
  where a.id = v_send.sender_account_id and a.owner_user_id = v_send.owner_user_id
    and a.workspace_id = v_send.workspace_id and a.channel = v_send.channel
    and a.status = 'ready' and not a.reconciliation_required;
  if not found then
    return jsonb_build_object('outcome', 'sender_not_ready');
  end if;

  if v_send.attempts >= 5 then
    return jsonb_build_object('outcome', 'attempts_exhausted');
  end if;

  update private.sequence_step_sends
  set status = 'sending', status_reason = null, attempts = attempts + 1, claimed_at = now(),
      reconciled_at = null, updated_at = now()
  where id = v_send.id;

  return jsonb_build_object(
    'outcome', 'claimed',
    'unipile_account_id', v_sender.unipile_account_id,
    'destination', v_send.destination,
    'display_name', v_contact.name,
    'subject', v_send.subject,
    'body', v_send.body,
    'idempotency_key', v_send.idempotency_key
  );
end;
$$;

revoke all on function public.claim_step_send(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_step_send(uuid, uuid) to service_role;

-- 5. Interações registradas pela Sequência: sem conteúdo, deduplicadas pela referência de origem.
alter table public.account_interactions drop constraint account_interactions_source_check;
alter table public.account_interactions
  add constraint account_interactions_source_check check (source in ('manual', 'sequencia'));
alter table public.account_interactions add column external_ref text;
create unique index account_interactions_external_ref_idx
  on public.account_interactions (workspace_id, external_ref) where external_ref is not null;

-- A Sequência grava o UUID da Conta-alvo como texto; sem Conta-alvo real não há Interação a registrar.
create function private.record_sequence_interaction(
  p_workspace_id uuid,
  p_target_account_id text,
  p_contact_id uuid,
  p_kind text,
  p_occurred_at timestamptz,
  p_recorded_by uuid,
  p_external_ref text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid;
begin
  if p_target_account_id !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' then
    return false;
  end if;
  select a.id into v_account_id from public.target_accounts a
  where a.id = p_target_account_id::uuid and a.workspace_id = p_workspace_id;
  if not found then
    return false;
  end if;

  insert into public.account_interactions (
    workspace_id, target_account_id, contact_id, kind, occurred_at, source, recorded_by, external_ref
  ) values (
    p_workspace_id, v_account_id, p_contact_id, p_kind, p_occurred_at, 'sequencia', p_recorded_by, p_external_ref
  ) on conflict (workspace_id, external_ref) where external_ref is not null do nothing;
  if not found then
    return false;
  end if;

  update public.target_accounts
  set last_interaction_at = greatest(last_interaction_at, p_occurred_at)
  where id = v_account_id;
  return true;
end;
$$;

revoke all on function private.record_sequence_interaction(uuid, text, uuid, text, timestamptz, uuid, text)
  from public, anon, authenticated;

create function private.accept_step_send(
  p_send_id uuid,
  p_tracking_id text,
  p_provider_email_id text,
  p_provider_message_id text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_send private.sequence_step_sends;
begin
  update private.sequence_step_sends
  set status = 'accepted', status_reason = null,
      provider_tracking_id = coalesce(p_tracking_id, provider_tracking_id),
      provider_email_id = coalesce(p_provider_email_id, provider_email_id),
      provider_message_id = coalesce(p_provider_message_id, provider_message_id),
      accepted_at = coalesce(accepted_at, now()), updated_at = now()
  where id = p_send_id
  returning * into v_send;

  perform private.record_sequence_interaction(
    v_send.workspace_id, v_send.target_account_id, v_send.contact_id, 'email-enviado',
    v_send.accepted_at, v_send.owner_user_id, 'envio:' || v_send.id::text);
end;
$$;

revoke all on function private.accept_step_send(uuid, text, text, text) from public, anon, authenticated;

-- 6. Resultado da chamada ao provedor. Só a reserva em andamento recebe resultado: um resultado repetido ou
-- tardio não desfaz o que já foi registrado.
create function public.record_step_send_result(
  p_send_id uuid,
  p_outcome text,
  p_tracking_id text,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_send private.sequence_step_sends;
begin
  if p_outcome not in ('accepted', 'failed', 'uncertain') then
    raise exception 'unknown send outcome' using errcode = '22023';
  end if;
  select * into v_send from private.sequence_step_sends where id = p_send_id for update;
  if not found then
    raise exception 'step send not found' using errcode = 'P0002';
  end if;
  if v_send.status <> 'sending' then
    return jsonb_build_object('status', v_send.status);
  end if;

  if p_outcome = 'accepted' then
    perform private.accept_step_send(v_send.id, p_tracking_id, null, null);
  else
    update private.sequence_step_sends
    set status = p_outcome, status_reason = left(p_reason, 200), updated_at = now()
    where id = v_send.id;
  end if;
  return jsonb_build_object('status', p_outcome);
end;
$$;

-- 7. Reconciliação de um envio incerto com o que o provedor mostra ter enviado.
create function public.reconcile_step_send(
  p_send_id uuid,
  p_found boolean,
  p_tracking_id text,
  p_provider_email_id text,
  p_provider_message_id text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_send private.sequence_step_sends;
begin
  select * into v_send from private.sequence_step_sends where id = p_send_id for update;
  if not found then
    raise exception 'step send not found' using errcode = 'P0002';
  end if;
  if v_send.status <> 'uncertain' then
    return jsonb_build_object('status', v_send.status);
  end if;

  if p_found then
    perform private.accept_step_send(v_send.id, p_tracking_id, p_provider_email_id, p_provider_message_id);
    return jsonb_build_object('status', 'accepted');
  end if;
  update private.sequence_step_sends
  set reconciled_at = now(), status_reason = 'not_found_on_provider', updated_at = now()
  where id = v_send.id;
  return jsonb_build_object('status', 'uncertain');
end;
$$;

revoke all on function public.record_step_send_result(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.reconcile_step_send(uuid, boolean, text, text, text) from public, anon, authenticated;
grant execute on function public.record_step_send_result(uuid, text, text, text) to service_role;
grant execute on function public.reconcile_step_send(uuid, boolean, text, text, text) to service_role;

-- O que quem executa precisa para procurar no provedor um envio incerto do titular.
create function public.get_step_send_for_reconciliation(p_send_id uuid, p_requested_by uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_send private.sequence_step_sends;
  v_unipile_account_id text;
begin
  select e.* into v_send from private.sequence_step_sends e where e.id = p_send_id;
  if not found or v_send.owner_user_id is distinct from p_requested_by then
    raise exception 'step send not found or not owned by requester' using errcode = '42501';
  end if;
  select a.unipile_account_id into v_unipile_account_id from private.sender_accounts a
  where a.id = v_send.sender_account_id and a.owner_user_id = v_send.owner_user_id;
  return jsonb_build_object(
    'status', v_send.status,
    'unipile_account_id', v_unipile_account_id,
    'destination', v_send.destination,
    'subject', v_send.subject,
    'claimed_at', v_send.claimed_at
  );
end;
$$;

revoke all on function public.get_step_send_for_reconciliation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_step_send_for_reconciliation(uuid, uuid) to service_role;

-- 8. Sem prova no provedor, só o titular decide reenviar. O reenvio mantém a chave de idempotência.
create function public.resolve_uncertain_step_send(p_send_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_send private.sequence_step_sends;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select e.* into v_send from private.sequence_step_sends e
  where e.id = p_send_id and e.owner_user_id = v_user_id
    and exists (
      select 1 from public.workspace_memberships m
      where m.workspace_id = e.workspace_id and m.user_id = v_user_id and m.active
    )
  for update of e;
  if not found then
    raise exception 'step send not found or not owned by active user' using errcode = '42501';
  end if;
  if v_send.status <> 'uncertain' then
    raise exception 'step send is not uncertain' using errcode = '22023';
  end if;
  if v_send.reconciled_at is null then
    raise exception 'reconcile with the provider before deciding' using errcode = '22023';
  end if;

  update private.sequence_step_sends
  set status = 'confirmed', status_reason = 'owner_decided_resend', updated_at = now()
  where id = v_send.id;
  return jsonb_build_object('send_id', v_send.id, 'status', 'confirmed');
end;
$$;

revoke all on function public.resolve_uncertain_step_send(uuid) from public, anon;
grant execute on function public.resolve_uncertain_step_send(uuid) to authenticated;

-- 9. Mensagens recebidas dos Contatos: conteúdo privado do titular da Conta remetente.
create table private.sequence_messages (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.sequences(id),
  workspace_id uuid not null,
  target_account_id text not null,
  owner_user_id uuid not null references auth.users(id),
  sender_account_id uuid not null references private.sender_accounts(id),
  contact_id uuid,
  direction text not null check (direction in ('inbound', 'outbound')),
  -- O Message-ID do e-mail, ou o email_id da Unipile quando ele falta: a identidade estável da mensagem.
  message_key text not null,
  provider_email_id text not null,
  in_reply_to text,
  from_identifier text not null,
  subject text,
  body text,
  body_plain text,
  attachments jsonb not null default '[]'::jsonb,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (sequence_id, message_key),
  foreign key (workspace_id, contact_id) references public.contacts(workspace_id, id) on delete set null (contact_id)
);

create index sequence_messages_owner_idx on private.sequence_messages (owner_user_id);
create index sequence_messages_sender_idx on private.sequence_messages (sender_account_id);
create index sequence_messages_contact_idx on private.sequence_messages (workspace_id, contact_id);

alter table private.sequence_messages enable row level security;
revoke all on private.sequence_messages from public, anon, authenticated;

comment on table private.sequence_messages is
  'Commercial messages received from Contacts. Subject, body and attachments are private to the sender account owner.';

-- 10. Evento compartilhado da Sequência: Conta-alvo, tipo e data, sem conteúdo da mensagem.
create table public.sequence_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  sequence_id uuid not null references public.sequences(id),
  target_account_id text not null,
  kind text not null check (kind in ('contato-respondeu')),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  -- Hash da identidade da mensagem de origem: deduplica sem expor o Message-ID.
  dedupe_key text not null,
  unique (sequence_id, kind, dedupe_key)
);

create index sequence_events_workspace_idx on public.sequence_events (workspace_id, occurred_at desc);

alter table public.sequence_events enable row level security;

create policy "active members read sequence events"
  on public.sequence_events for select to authenticated
  using (exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = sequence_events.workspace_id
      and m.user_id = (select auth.uid()) and m.active
  ));

revoke all on public.sequence_events from anon, authenticated;
grant select on public.sequence_events to authenticated;

comment on table public.sequence_events is
  'Shared sequence events such as "Contato respondeu; sequência pausada". Never holds subject, body, attachments or summaries.';

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sequence_events'
    ) then
    alter publication supabase_realtime add table public.sequence_events;
  end if;
end;
$$;

-- 11. Caixa de entrada do webhook de e-mail v1. O conteúdo bruto só existe até o processamento.
alter table private.sender_accounts add column external_identifier text;
comment on column private.sender_accounts.external_identifier is
  'Address of the sender account, learned from its own mail_sent events; identifies messages from the owner.';

create table private.unipile_mail_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  event text not null check (event in ('mail_received', 'mail_sent', 'mail_moved')),
  unipile_account_id text not null,
  email_id text not null,
  payload jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  result text,
  attempts integer not null default 0,
  last_error text
);

create index unipile_mail_events_pending_idx
  on private.unipile_mail_events (received_at) where processed_at is null;

alter table private.unipile_mail_events enable row level security;
revoke all on private.unipile_mail_events from public, anon, authenticated;

-- Persiste o evento autenticado pela Edge Function. Idempotente pela conta externa, evento e email_id.
create function public.record_unipile_mail_event(p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event text := p_event ->> 'event';
  v_account_id text := nullif(btrim(p_event ->> 'account_id'), '');
  v_email_id text := nullif(btrim(p_event ->> 'email_id'), '');
  v_id uuid;
  v_new boolean := true;
begin
  if v_event is null or v_event not in ('mail_received', 'mail_sent', 'mail_moved') then
    raise exception 'unsupported email webhook event' using errcode = '22023';
  end if;
  if v_account_id is null or v_email_id is null then
    raise exception 'email webhook event needs account_id and email_id' using errcode = '22023';
  end if;

  insert into private.unipile_mail_events (event_key, event, unipile_account_id, email_id, payload)
  values (v_event || ':' || v_account_id || ':' || v_email_id, v_event, v_account_id, v_email_id, p_event)
  on conflict (event_key) do nothing
  returning id into v_id;
  if v_id is null then
    v_new := false;
    select id into v_id from private.unipile_mail_events
    where event_key = v_event || ':' || v_account_id || ':' || v_email_id;
  end if;
  return jsonb_build_object('event_id', v_id, 'is_new', v_new);
end;
$$;

create function private.try_timestamptz(p_value text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  return p_value::timestamptz;
exception when others then
  return null;
end;
$$;

revoke all on function private.try_timestamptz(text) from public, anon, authenticated;

-- mail_sent: o próprio titular enviou, pela Althius ou por fora. Nunca é resposta. Quando é o eco de um passo,
-- guarda a identidade da mensagem para correlacionar respostas e comprova o envio que ainda estava incerto.
create function private.apply_own_sent_mail(
  p_sender private.sender_accounts,
  p_event private.unipile_mail_events,
  p_occurred_at timestamptz
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb := p_event.payload;
  v_tracking_id text := nullif(v_payload ->> 'tracking_id', '');
  v_from text := nullif(lower(btrim(v_payload #>> '{from_attendee,identifier}')), '');
  v_to text[];
  v_send private.sequence_step_sends;
begin
  if v_from is not null then
    update private.sender_accounts set external_identifier = v_from, updated_at = now()
    where id = p_sender.id and external_identifier is null;
  end if;

  select coalesce(array_agg(lower(btrim(a ->> 'identifier'))), '{}') into v_to
  from jsonb_array_elements(case when jsonb_typeof(v_payload -> 'to_attendees') = 'array'
    then v_payload -> 'to_attendees' else '[]'::jsonb end) a;

  select e.* into v_send from private.sequence_step_sends e
  where e.sender_account_id = p_sender.id
    and (
      (v_tracking_id is not null and e.provider_tracking_id = v_tracking_id)
      or (e.status in ('sending', 'uncertain') and e.destination = any (v_to)
        and e.subject = coalesce(v_payload ->> 'subject', '')
        and e.claimed_at <= p_occurred_at + interval '5 minutes')
    )
  order by (e.provider_tracking_id is not distinct from v_tracking_id) desc, e.claimed_at desc
  limit 1
  for update;
  if not found then
    return 'own_message';
  end if;

  if v_send.status in ('sending', 'uncertain') then
    perform private.accept_step_send(v_send.id, v_tracking_id, p_event.email_id, nullif(v_payload ->> 'message_id', ''));
  else
    update private.sequence_step_sends
    set provider_email_id = coalesce(provider_email_id, p_event.email_id),
        provider_message_id = coalesce(provider_message_id, nullif(v_payload ->> 'message_id', '')),
        updated_at = now()
    where id = v_send.id;
  end if;
  return 'own_send_matched';
end;
$$;

revoke all on function private.apply_own_sent_mail(private.sender_accounts, private.unipile_mail_events, timestamptz)
  from public, anon, authenticated;

-- mail_received de um Contato: registra a mensagem privada, pausa a Sequência, invalida os passos pendentes e
-- publica o evento compartilhado, tudo na transação do processamento. A mensagem só conta se a Sequência do titular
-- já falou com a Conta-alvo por esta Conta remetente: na mesma conversa ou vinda de um Contato da Conta-alvo.
create function private.apply_received_mail(
  p_sender private.sender_accounts,
  p_event private.unipile_mail_events,
  p_occurred_at timestamptz
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb := p_event.payload;
  v_from text := nullif(lower(btrim(v_payload #>> '{from_attendee,identifier}')), '');
  v_in_reply_to text := nullif(v_payload #>> '{in_reply_to,message_id}', '');
  v_message_key text := coalesce(nullif(btrim(v_payload ->> 'message_id'), ''), 'email:' || p_event.email_id);
  v_sequence public.sequences;
  v_contact_id uuid;
  v_message_id uuid;
  v_recorded integer := 0;
  v_repeated integer := 0;
begin
  if v_payload ->> 'role' = 'sent' or v_from = p_sender.external_identifier then
    return 'own_message';
  end if;
  if v_from is null then
    return 'ignored_unrelated';
  end if;

  for v_sequence in
    select s.* from public.sequences s
    where exists (
      select 1 from private.sequence_step_sends e
      where e.sequence_id = s.id and e.sender_account_id = p_sender.id
        and e.status in ('sending', 'accepted', 'uncertain')
        and (
          (v_in_reply_to is not null and e.provider_message_id = v_in_reply_to)
          or e.destination = v_from
          or exists (
            select 1 from public.contacts c
            join public.contact_account_links l on l.contact_id = c.id and l.ended_at is null
            where c.workspace_id = s.workspace_id and c.email = v_from
              and l.target_account_id::text = s.target_account_id
          )
        )
    )
    order by s.id
    for update of s
  loop
    select c.id into v_contact_id from public.contacts c
    where c.workspace_id = v_sequence.workspace_id and c.email = v_from;

    insert into private.sequence_messages (
      sequence_id, workspace_id, target_account_id, owner_user_id, sender_account_id, contact_id, direction,
      message_key, provider_email_id, in_reply_to, from_identifier, subject, body, body_plain, attachments, occurred_at
    ) values (
      v_sequence.id, v_sequence.workspace_id, v_sequence.target_account_id, v_sequence.owner_user_id, p_sender.id,
      v_contact_id, 'inbound', v_message_key, p_event.email_id, v_in_reply_to, v_from,
      v_payload ->> 'subject', v_payload ->> 'body', v_payload ->> 'body_plain',
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', a ->> 'id', 'name', a ->> 'name', 'size', a -> 'size', 'mime', a ->> 'mime'))
        from jsonb_array_elements(case when jsonb_typeof(v_payload -> 'attachments') = 'array'
          then v_payload -> 'attachments' else '[]'::jsonb end) a
      ), '[]'::jsonb),
      p_occurred_at
    )
    on conflict (sequence_id, message_key) do nothing
    returning id into v_message_id;

    if v_message_id is null then
      v_repeated := v_repeated + 1;
      continue;
    end if;
    v_message_id := null;
    v_recorded := v_recorded + 1;

    -- O resumo público acompanha o status; o trigger de higienização mantém só os campos seguros.
    update public.sequences
    set status = 'pausada', public_summary = public_summary || '{"status": "pausada"}'::jsonb, updated_at = now()
    where id = v_sequence.id and status = 'ativa';
    if found then
      update private.sequence_documents
      set document = document || jsonb_build_object('motivoPause', 'Contato respondeu'), updated_at = now()
      where sequence_id = v_sequence.id;
    end if;

    update private.sequence_step_sends
    set status = 'invalidated', status_reason = 'contact_replied', updated_at = now()
    where sequence_id = v_sequence.id and status in ('confirmed', 'failed', 'awaiting_reconfirmation');

    perform private.record_sequence_interaction(
      v_sequence.workspace_id, v_sequence.target_account_id, v_contact_id, 'email-recebido', p_occurred_at,
      v_sequence.owner_user_id, 'mensagem:' || v_sequence.id::text || ':' || md5(v_message_key));

    insert into public.sequence_events (workspace_id, sequence_id, target_account_id, kind, occurred_at, dedupe_key)
    values (v_sequence.workspace_id, v_sequence.id, v_sequence.target_account_id, 'contato-respondeu', p_occurred_at,
      md5(v_message_key))
    on conflict (sequence_id, kind, dedupe_key) do nothing;
  end loop;

  if v_recorded > 0 then
    return 'reply_recorded';
  elsif v_repeated > 0 then
    return 'duplicate_message';
  end if;
  return 'ignored_unrelated';
end;
$$;

revoke all on function private.apply_received_mail(private.sender_accounts, private.unipile_mail_events, timestamptz)
  from public, anon, authenticated;

-- Processa um evento persistido. Repetir devolve o resultado já registrado; uma falha mantém o evento para nova
-- tentativa. Depois do processamento o conteúdo bruto é apagado: o que interessa fica na mensagem privada.
create function public.process_unipile_mail_event(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event private.unipile_mail_events;
  v_sender private.sender_accounts;
  v_occurred_at timestamptz;
  v_result text;
begin
  select * into v_event from private.unipile_mail_events where id = p_event_id for update;
  if not found then
    raise exception 'email webhook event not found' using errcode = 'P0002';
  end if;
  if v_event.processed_at is not null then
    return jsonb_build_object('result', v_event.result);
  end if;

  begin
    select a.* into v_sender from private.sender_accounts a
    where a.unipile_account_id = v_event.unipile_account_id and a.channel = 'email';
    v_occurred_at := coalesce(private.try_timestamptz(v_event.payload ->> 'date'), v_event.received_at);
    if v_sender.id is null then
      v_result := 'unknown_account';
    elsif v_event.event = 'mail_moved' then
      v_result := 'ignored_moved';
    elsif v_event.event = 'mail_sent' then
      v_result := private.apply_own_sent_mail(v_sender, v_event, v_occurred_at);
    else
      v_result := private.apply_received_mail(v_sender, v_event, v_occurred_at);
    end if;
  exception when others then
    update private.unipile_mail_events
    set attempts = attempts + 1, last_error = sqlstate
    where id = v_event.id;
    return jsonb_build_object('result', 'error', 'sqlstate', sqlstate);
  end;

  update private.unipile_mail_events
  set processed_at = now(), result = v_result, attempts = attempts + 1, last_error = null, payload = null
  where id = v_event.id;
  return jsonb_build_object('result', v_result);
end;
$$;

-- Retoma eventos persistidos que ainda não foram processados, em ordem de chegada.
create function public.process_pending_unipile_mail_events(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_processed integer := 0;
  v_failed integer := 0;
begin
  for v_event_id in
    select id from private.unipile_mail_events
    where processed_at is null and attempts < 10
    order by received_at
    limit greatest(1, least(coalesce(p_limit, 50), 500))
  loop
    if public.process_unipile_mail_event(v_event_id) ->> 'result' = 'error' then
      v_failed := v_failed + 1;
    else
      v_processed := v_processed + 1;
    end if;
  end loop;
  return jsonb_build_object('processed', v_processed, 'failed', v_failed);
end;
$$;

revoke all on function public.record_unipile_mail_event(jsonb) from public, anon, authenticated;
revoke all on function public.process_unipile_mail_event(uuid) from public, anon, authenticated;
revoke all on function public.process_pending_unipile_mail_events(integer) from public, anon, authenticated;
grant execute on function public.record_unipile_mail_event(jsonb) to service_role;
grant execute on function public.process_unipile_mail_event(uuid) to service_role;
grant execute on function public.process_pending_unipile_mail_events(integer) to service_role;

-- 12. O responsável lê as mensagens recebidas na sua Sequência.
create function public.list_owned_sequence_messages(p_sequence_id uuid)
returns table (
  id uuid, direction text, contact_id uuid, from_identifier text, subject text, body text, body_plain text,
  attachments jsonb, occurred_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.sequences s
    join public.workspace_memberships m
      on m.workspace_id = s.workspace_id and m.user_id = v_user_id and m.active
    where s.id = p_sequence_id and s.owner_user_id = v_user_id
  ) then
    raise exception 'sequence not found or not owned by active user' using errcode = '42501';
  end if;
  return query
    select g.id, g.direction, g.contact_id, g.from_identifier, g.subject, g.body, g.body_plain,
      g.attachments, g.occurred_at
    from private.sequence_messages g
    where g.sequence_id = p_sequence_id and g.owner_user_id = v_user_id
    order by g.occurred_at;
end;
$$;

revoke all on function public.list_owned_sequence_messages(uuid) from public, anon;
grant execute on function public.list_owned_sequence_messages(uuid) to authenticated;

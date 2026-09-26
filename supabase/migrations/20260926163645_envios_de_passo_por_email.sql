-- Envios de passo por E-mail (canais-04, PR 1: confirmar o passo e enviar pela Unipile).
-- Confirmar um passo fixa o Destino usado no envio (ADR-0014). O envio em si é liberado só pelo backend
-- (service_role), depois de revalidar Sequência, titular, Conta remetente e Destino, e o resultado do
-- provedor fica gravado sem apresentar aceitação como entrega. Assunto e corpo saem do documento privado na
-- hora do envio; só o Destino fica fixo (versionar o conteúdo é o canais-05).

create table private.sequence_step_sends (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.sequences(id),
  workspace_id uuid not null,
  step_id text not null check (btrim(step_id) <> ''),
  owner_user_id uuid not null references auth.users(id),
  contact_id uuid not null,
  channel text not null check (channel in ('email')),
  destination text not null,
  sender_account_id uuid references private.sender_accounts(id),
  status text not null default 'confirmed' check (status in (
    'confirmed', 'awaiting_reconfirmation', 'sending', 'sent', 'uncertain', 'failed', 'bounced'
  )),
  attempts integer not null default 0,
  provider_email_id text,
  provider_message_id text,
  provider_thread_id text,
  confirmed_at timestamptz not null default now(),
  sending_at timestamptz,
  sent_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sequence_id, step_id),
  foreign key (workspace_id, contact_id) references public.contacts(workspace_id, id)
);

create index sequence_step_sends_reply_lookup_idx
  on private.sequence_step_sends (sequence_id, contact_id, sent_at desc)
  where status = 'sent';
create index sequence_step_sends_provider_message_idx
  on private.sequence_step_sends (provider_message_id) where provider_message_id is not null;
create index sequence_step_sends_provider_thread_idx
  on private.sequence_step_sends (provider_thread_id) where provider_thread_id is not null;
create index sequence_step_sends_provider_email_idx
  on private.sequence_step_sends (provider_email_id) where provider_email_id is not null;

alter table private.sequence_step_sends enable row level security;
revoke all on private.sequence_step_sends from public, anon, authenticated;
grant all on private.sequence_step_sends to service_role;

comment on table private.sequence_step_sends is
  'One row per confirmed step of a Sequência. Fixes the destination (ADR-0014), records the provider ids and the '
  'status of the send. The header X-Althius-Envio carries this id, so a provider result can be reconciled later.';

-- O e-mail enviado por uma Sequência é uma Interação do Workspace, sem conteúdo.
alter table public.account_interactions drop constraint account_interactions_source_check;
alter table public.account_interactions
  add constraint account_interactions_source_check check (source in ('manual', 'sequencia'));

-- A projeção que o titular lê: sem os ids do provedor nem a Conta remetente.
create function public.list_sequence_step_sends(p_sequence_id uuid)
returns table (
  id uuid, step_id text, contact_id uuid, destination text, status text,
  attempts integer, confirmed_at timestamptz, sent_at timestamptz,
  last_error text, last_error_at timestamptz, updated_at timestamptz
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
    select e.id, e.step_id, e.contact_id, e.destination, e.status,
      e.attempts, e.confirmed_at, e.sent_at, e.last_error, e.last_error_at, e.updated_at
    from private.sequence_step_sends e
    where e.sequence_id = p_sequence_id
    order by e.confirmed_at;
end;
$$;

revoke all on function public.list_sequence_step_sends(uuid) from public, anon;
grant execute on function public.list_sequence_step_sends(uuid) to authenticated;

-- O titular confirma um passo de E-mail: o e-mail atual do Contato vira o Destino fixo do envio.
-- Reconfirmar um passo que espera reconfirmação, falhou ou ainda não saiu fixa o Destino de novo.
create function public.confirm_sequence_step(p_sequence_id uuid, p_step_id text)
returns table (
  id uuid, step_id text, contact_id uuid, destination text, status text,
  attempts integer, confirmed_at timestamptz, sent_at timestamptz,
  last_error text, last_error_at timestamptz, updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
  v_sequence public.sequences;
  v_step jsonb;
  v_account_id uuid;
  v_contact public.contacts;
  v_send private.sequence_step_sends;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select s.* into v_sequence
  from public.sequences s
  join public.workspace_memberships m
    on m.workspace_id = s.workspace_id and m.user_id = v_user_id and m.active
  where s.id = p_sequence_id and s.owner_user_id = v_user_id
  for update of s;
  if not found then
    raise exception 'sequence not found or not owned by active user' using errcode = '42501';
  end if;

  select step into v_step
  from private.sequence_documents d,
    jsonb_array_elements(case when jsonb_typeof(d.document -> 'steps') = 'array'
      then d.document -> 'steps' else '[]'::jsonb end) as step
  where d.sequence_id = v_sequence.id and d.owner_user_id = v_user_id
    and step ->> 'id' = p_step_id;
  if v_step is null then
    raise exception 'step not found in the sequence document' using errcode = 'P0002';
  end if;
  if v_step ->> 'canal' <> 'email' then
    raise exception 'only email steps can be confirmed for now' using errcode = '0A000';
  end if;

  -- O destinatário é um Contato canônico com Vínculo ativo na Conta-alvo desta Sequência.
  if v_sequence.target_account_id !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' then
    raise exception 'target account not found' using errcode = 'P0002';
  end if;
  v_account_id := v_sequence.target_account_id::uuid;
  if coalesce(v_step ->> 'contatoId', '') !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' then
    raise exception 'contact has no active link with this target account' using errcode = '22023';
  end if;
  select c.* into v_contact
  from public.contacts c
  join public.contact_account_links l
    on l.workspace_id = c.workspace_id and l.contact_id = c.id
      and l.target_account_id = v_account_id and l.ended_at is null
  where c.id = (v_step ->> 'contatoId')::uuid and c.workspace_id = v_sequence.workspace_id;
  if not found then
    raise exception 'contact has no active link with this target account' using errcode = '22023';
  end if;
  if v_contact.email is null then
    raise exception 'contact has no email destination' using errcode = '22023';
  end if;

  select e.* into v_send from private.sequence_step_sends e
  where e.sequence_id = v_sequence.id and e.step_id = p_step_id
  for update;
  if found and v_send.status in ('sending', 'sent', 'uncertain') then
    raise exception 'step already sent or in flight' using errcode = '55000';
  end if;

  insert into private.sequence_step_sends (
    sequence_id, workspace_id, step_id, owner_user_id, contact_id, channel, destination
  ) values (
    v_sequence.id, v_sequence.workspace_id, p_step_id, v_user_id, v_contact.id, 'email', v_contact.email
  )
  on conflict (sequence_id, step_id) do update set
    contact_id = excluded.contact_id,
    destination = excluded.destination,
    status = 'confirmed',
    confirmed_at = now(),
    last_error = null,
    last_error_at = null,
    updated_at = now()
  returning * into v_send;

  return query select * from public.list_sequence_step_sends(v_sequence.id) r where r.id = v_send.id;
end;
$$;

revoke all on function public.confirm_sequence_step(uuid, text) from public, anon;
grant execute on function public.confirm_sequence_step(uuid, text) to authenticated;

-- O backend libera o envio depois de validar o JWT do titular (p_user_id). Com a Sequência travada, exige
-- Sequência ativa, titular com Participação ativa e ainda responsável, Conta remetente de E-mail em ready sem
-- reconciliação pendente, e o e-mail atual do Contato igual ao Destino confirmado. Devolve o que a Edge
-- Function precisa para chamar a Unipile, ou o motivo do bloqueio em outcome.
create function public.release_sequence_step_send(p_send_id uuid, p_user_id uuid)
returns table (
  outcome text, send_id uuid, unipile_account_id text, destination text, contact_name text,
  subject text, body text, reply_to_message_id text,
  tracking_header_name text, tracking_header_value text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_send private.sequence_step_sends;
  v_sequence public.sequences;
  v_sender private.sender_accounts;
  v_contact public.contacts;
  v_step jsonb;
  v_subject text;
  v_reply_to text;
begin
  select e.* into v_send from private.sequence_step_sends e where e.id = p_send_id;
  if not found then
    raise exception 'send not found' using errcode = 'P0002';
  end if;

  -- A trava da Sequência serializa os envios dela e espera uma pausa concorrente terminar.
  select s.* into v_sequence from public.sequences s where s.id = v_send.sequence_id for update;
  select e.* into v_send from private.sequence_step_sends e where e.id = p_send_id for update;

  if p_user_id is null or p_user_id <> v_send.owner_user_id or p_user_id <> v_sequence.owner_user_id
    or not exists (
      select 1 from public.workspace_memberships m
      where m.workspace_id = v_sequence.workspace_id and m.user_id = p_user_id and m.active)
    or not exists (
      select 1 from public.sales_responsibilities r
      where r.workspace_id = v_sequence.workspace_id
        and r.target_account_id = v_sequence.target_account_id and r.owner_user_id = p_user_id) then
    return query select 'owner_not_responsible', v_send.id, null::text, null::text, null::text,
      null::text, null::text, null::text, null::text, null::text;
    return;
  end if;

  if v_send.status = 'sending' then
    return query select 'in_flight', v_send.id, null::text, null::text, null::text, null::text, null::text, null::text, null::text, null::text;
    return;
  elsif v_send.status = 'sent' then
    return query select 'already_sent', v_send.id, null::text, null::text, null::text, null::text, null::text, null::text, null::text, null::text;
    return;
  elsif v_send.status = 'uncertain' then
    return query select 'reconcile_required', v_send.id, null::text, null::text, null::text, null::text, null::text, null::text, null::text, null::text;
    return;
  elsif v_send.status <> 'confirmed' then
    return query select 'not_confirmed', v_send.id, null::text, null::text, null::text, null::text, null::text, null::text, null::text, null::text;
    return;
  end if;

  if v_sequence.status <> 'ativa' then
    return query select 'sequence_not_active', v_send.id, null::text, null::text, null::text, null::text, null::text, null::text, null::text, null::text;
    return;
  end if;

  select a.* into v_sender from private.sender_accounts a
  where a.workspace_id = v_sequence.workspace_id and a.owner_user_id = p_user_id
    and a.channel = 'email' and a.status = 'ready' and not a.reconciliation_required
  order by a.last_status_at desc
  limit 1;
  if not found then
    return query select 'sender_not_ready', v_send.id, null::text, null::text, null::text, null::text, null::text, null::text, null::text, null::text;
    return;
  end if;

  -- ADR-0014: um Destino diferente do confirmado não sai nem para o antigo nem para o novo.
  select c.* into v_contact from public.contacts c
  where c.id = v_send.contact_id and c.workspace_id = v_sequence.workspace_id;
  if not found or v_contact.email is distinct from v_send.destination then
    update private.sequence_step_sends set
      status = 'awaiting_reconfirmation',
      last_error = 'destination_changed', last_error_at = now(), updated_at = now()
    where id = v_send.id;
    return query select 'destination_changed', v_send.id, null::text, null::text, null::text, null::text, null::text, null::text, null::text, null::text;
    return;
  end if;

  select step into v_step
  from private.sequence_documents d,
    jsonb_array_elements(case when jsonb_typeof(d.document -> 'steps') = 'array'
      then d.document -> 'steps' else '[]'::jsonb end) as step
  where d.sequence_id = v_sequence.id and step ->> 'id' = v_send.step_id;
  if v_step is null then
    return query select 'step_missing', v_send.id, null::text, null::text, null::text, null::text, null::text, null::text, null::text, null::text;
    return;
  end if;
  v_subject := coalesce(nullif(btrim(v_step ->> 'assunto'), ''), nullif(btrim(v_step ->> 'titulo'), ''), '(sem assunto)');

  -- Um passo "Re: …" continua a conversa do último e-mail enviado ao mesmo Contato nesta Sequência.
  if v_subject ~* '^\s*re\s*:' then
    select e.provider_message_id into v_reply_to from private.sequence_step_sends e
    where e.sequence_id = v_sequence.id and e.contact_id = v_send.contact_id
      and e.status = 'sent' and e.provider_message_id is not null and e.id <> v_send.id
    order by e.sent_at desc
    limit 1;
  end if;

  update private.sequence_step_sends set
    status = 'sending', sender_account_id = v_sender.id, attempts = attempts + 1,
    sending_at = now(), updated_at = now()
  where id = v_send.id;

  return query select 'released', v_send.id, v_sender.unipile_account_id, v_send.destination, v_contact.name,
    v_subject, coalesce(v_step ->> 'corpo', ''), v_reply_to,
    'X-Althius-Envio', v_send.id::text;
end;
$$;

revoke all on function public.release_sequence_step_send(uuid, uuid) from public, anon, authenticated;
grant execute on function public.release_sequence_step_send(uuid, uuid) to service_role;

-- O backend grava o que o provedor respondeu: aceitação (sent), erro (failed) ou dúvida (uncertain, ex.: timeout).
-- Um envio aceito vira uma Interação "email-enviado" da Conta-alvo, visível aos participantes sem conteúdo.
create function public.record_sequence_step_send_result(
  p_send_id uuid,
  p_outcome text,
  p_provider_email_id text,
  p_provider_message_id text,
  p_error text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_send private.sequence_step_sends;
  v_account_id uuid;
begin
  if p_outcome not in ('sent', 'failed', 'uncertain') then
    raise exception 'unknown send outcome' using errcode = '22023';
  end if;
  select e.* into v_send from private.sequence_step_sends e where e.id = p_send_id for update;
  if not found then
    raise exception 'send not found' using errcode = 'P0002';
  end if;
  if v_send.status <> 'sending' then
    raise exception 'send is not in flight' using errcode = '55000';
  end if;

  update private.sequence_step_sends set
    status = p_outcome,
    provider_email_id = case when p_outcome = 'sent' then p_provider_email_id else provider_email_id end,
    provider_message_id = case when p_outcome = 'sent' then p_provider_message_id else provider_message_id end,
    sent_at = case when p_outcome = 'sent' then now() else sent_at end,
    last_error = case when p_outcome = 'sent' then null else left(coalesce(p_error, p_outcome), 500) end,
    last_error_at = case when p_outcome = 'sent' then null else now() end,
    updated_at = now()
  where id = v_send.id
  returning * into v_send;

  if p_outcome = 'sent' then
    select s.target_account_id::uuid into v_account_id from public.sequences s where s.id = v_send.sequence_id;
    insert into public.account_interactions (workspace_id, target_account_id, contact_id, kind, occurred_at, source, recorded_by)
    values (v_send.workspace_id, v_account_id, v_send.contact_id, 'email-enviado', v_send.sent_at, 'sequencia', v_send.owner_user_id);
    update public.target_accounts
    set last_interaction_at = greatest(last_interaction_at, v_send.sent_at)
    where id = v_account_id;
  end if;

  return v_send.status;
end;
$$;

revoke all on function public.record_sequence_step_send_result(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_sequence_step_send_result(uuid, text, text, text, text)
  to service_role;

-- Ingestão dos eventos de e-mail da Unipile v2 (canais-04, PR 2: resposta).
-- O webhook grava o evento e responde 2xx; tudo o que decide fica aqui, numa transação: deduplicar pelo id do
-- evento e pelo par (Conta remetente, e-mail), distinguir eco (o próprio envio nos itens enviados, ou algo que
-- o titular escreveu) de resposta do Contato e de bounce, gravar a Interação pública sem conteúdo, guardar
-- assunto, corpo e anexos no schema privado (ADR-0015: a mensagem não fica como referência na Unipile) e
-- pausar a Sequência. Só o titular lê o conteúdo; os demais veem "Contato respondeu; sequência pausada".

-- O endereço do titular na Conta remetente, aprendido pelo from do eco do próprio envio nos itens enviados.
-- A Unipile não devolve o endereço no account.add, então ele é descoberto no primeiro envio real.
alter table private.sender_accounts add column email_address text;

create table private.unipile_email_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_type text not null check (event_type in ('email.new', 'email.new.bounce')),
  unipile_account_id text not null,
  sender_account_id uuid references private.sender_accounts(id),
  provider_email_id text,
  outcome text not null check (outcome in (
    'echo', 'reply', 'bounce', 'automatic', 'unrelated', 'unknown_account', 'duplicate_email'
  )),
  send_id uuid references private.sequence_step_sends(id),
  interaction_id uuid references public.account_interactions(id) on delete set null,
  received_at timestamptz not null default now()
);

create index unipile_email_events_email_idx
  on private.unipile_email_events (unipile_account_id, provider_email_id);

create table private.received_emails (
  id uuid primary key default gen_random_uuid(),
  interaction_id uuid not null unique references public.account_interactions(id) on delete cascade,
  workspace_id uuid not null,
  owner_user_id uuid not null references auth.users(id),
  sequence_id uuid not null references public.sequences(id),
  send_id uuid references private.sequence_step_sends(id),
  contact_id uuid,
  sender_account_id uuid not null references private.sender_accounts(id),
  provider_email_id text not null,
  provider_message_id text,
  provider_thread_id text,
  from_email text,
  from_name text,
  subject text,
  body text,
  snippet text,
  received_at timestamptz not null,
  -- [{id, name, mime, size, status: pending | stored | failed, storage_path}]
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index received_emails_sequence_idx on private.received_emails (sequence_id, received_at desc);

alter table private.unipile_email_events enable row level security;
alter table private.received_emails enable row level security;
revoke all on private.unipile_email_events from public, anon, authenticated;
revoke all on private.received_emails from public, anon, authenticated;
grant all on private.unipile_email_events to service_role;
grant all on private.received_emails to service_role;

comment on table private.unipile_email_events is
  'Every e-mail webhook delivery, by event id, with its outcome. Content is never stored here.';
comment on table private.received_emails is
  'Private content of a received reply (subject, body, attachments). Only the sequence owner reads it via RPC.';

-- Bucket privado dos anexos recebidos. Só existe onde o Storage existe (o CI roda o banco sem storage-api).
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public)
    values ('email-attachments', 'email-attachments', false)
    on conflict (id) do nothing;
  end if;
end
$$;

-- O valor de um cabeçalho do objeto Email ([{name, value}]), sem diferenciar maiúsculas.
create function private.email_header(p_email jsonb, p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select h ->> 'value'
  from jsonb_array_elements(case when jsonb_typeof(p_email -> 'headers') = 'array'
    then p_email -> 'headers' else '[]'::jsonb end) as h
  where lower(h ->> 'name') = lower(p_name)
  limit 1;
$$;

revoke all on function private.email_header(jsonb, text) from public, anon, authenticated;

-- Uma data do provedor, ou null quando não dá para ler: a ingestão nunca falha por causa dela.
create function private.safe_timestamptz(p_value text)
returns timestamptz
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_value::timestamptz;
exception when others then
  return null;
end;
$$;

revoke all on function private.safe_timestamptz(text) from public, anon, authenticated;

-- Marca um Envio como aceito pelo provedor e registra a Interação "email-enviado" da Conta-alvo (sem conteúdo).
-- Usada quando a Unipile responde 2xx e quando o eco nos itens enviados prova a aceitação de um envio incerto.
create function private.mark_step_send_sent(
  p_send_id uuid,
  p_provider_email_id text,
  p_provider_message_id text,
  p_provider_thread_id text
) returns private.sequence_step_sends
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_send private.sequence_step_sends;
  v_account_id uuid;
begin
  update private.sequence_step_sends set
    status = 'sent',
    provider_email_id = coalesce(provider_email_id, nullif(btrim(p_provider_email_id), '')),
    provider_message_id = coalesce(provider_message_id, nullif(btrim(p_provider_message_id), '')),
    provider_thread_id = coalesce(provider_thread_id, nullif(btrim(p_provider_thread_id), '')),
    sent_at = coalesce(sent_at, now()),
    last_error = null,
    last_error_at = null,
    updated_at = now()
  where id = p_send_id
  returning * into v_send;

  select s.target_account_id::uuid into v_account_id from public.sequences s where s.id = v_send.sequence_id;
  insert into public.account_interactions (workspace_id, target_account_id, contact_id, kind, occurred_at, source, recorded_by)
  values (v_send.workspace_id, v_account_id, v_send.contact_id, 'email-enviado', v_send.sent_at, 'sequencia', v_send.owner_user_id);
  update public.target_accounts
  set last_interaction_at = greatest(last_interaction_at, v_send.sent_at)
  where id = v_account_id;
  return v_send;
end;
$$;

revoke all on function private.mark_step_send_sent(uuid, text, text, text) from public, anon, authenticated;

create or replace function public.record_sequence_step_send_result(
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
begin
  if p_outcome not in ('sent', 'failed', 'uncertain') then
    raise exception 'unknown send outcome' using errcode = '22023';
  end if;
  select e.* into v_send from private.sequence_step_sends e where e.id = p_send_id for update;
  if not found then
    raise exception 'send not found' using errcode = 'P0002';
  end if;
  -- O eco nos itens enviados pode chegar antes do resultado da chamada: o envio já está provado.
  if v_send.status = 'sent' then
    update private.sequence_step_sends set
      provider_email_id = coalesce(provider_email_id, nullif(btrim(p_provider_email_id), '')),
      provider_message_id = coalesce(provider_message_id, nullif(btrim(p_provider_message_id), '')),
      updated_at = now()
    where id = v_send.id;
    return 'sent';
  end if;
  if v_send.status <> 'sending' then
    raise exception 'send is not in flight' using errcode = '55000';
  end if;

  if p_outcome = 'sent' then
    v_send := private.mark_step_send_sent(v_send.id, p_provider_email_id, p_provider_message_id, null);
    return v_send.status;
  end if;

  update private.sequence_step_sends set
    status = p_outcome,
    last_error = left(coalesce(p_error, p_outcome), 500),
    last_error_at = now(),
    updated_at = now()
  where id = v_send.id
  returning * into v_send;
  return v_send.status;
end;
$$;

-- A conversa já aberta com o Contato: a Conta remetente e o thread_id (ou, sem eco, o id) do último e-mail
-- enviado ao mesmo Contato nesta Sequência. A Edge Function confere essa conversa na Unipile antes de liberar o envio,
-- porque a Unipile reentrega o webhook só duas vezes e uma resposta perdida não pode deixar a Sequência seguir.
create function public.conversation_for_send(p_send_id uuid, p_user_id uuid)
returns table (unipile_account_id text, provider_thread_id text, provider_email_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.unipile_account_id, prev.provider_thread_id, prev.provider_email_id
  from private.sequence_step_sends e
  join public.sequences s on s.id = e.sequence_id and s.owner_user_id = p_user_id
  join private.sender_accounts a on a.id = coalesce(e.sender_account_id, (
    select a2.id from private.sender_accounts a2
    where a2.workspace_id = s.workspace_id and a2.owner_user_id = p_user_id and a2.channel = 'email'
      and a2.status = 'ready' and not a2.reconciliation_required
    order by a2.last_status_at desc limit 1))
  left join lateral (
    select p.provider_thread_id, p.provider_email_id from private.sequence_step_sends p
    where p.sequence_id = e.sequence_id and p.contact_id = e.contact_id and p.id <> e.id
      and p.status in ('sent', 'bounced')
      and (p.provider_thread_id is not null or p.provider_email_id is not null)
    order by p.sent_at desc limit 1
  ) prev on true
  where e.id = p_send_id and e.owner_user_id = p_user_id;
$$;

revoke all on function public.conversation_for_send(uuid, uuid) from public, anon, authenticated;
grant execute on function public.conversation_for_send(uuid, uuid) to service_role;

-- A ingestão de um evento de e-mail. Devolve o desfecho e, numa resposta, a Interação e os anexos a baixar.
-- p_owner_addresses: os endereços do titular na Conta remetente (email-senders da Unipile ou o nome da conta),
-- em qualquer caixa; um e-mail vindo deles é eco, nunca resposta.
create function public.ingest_unipile_email_event(
  p_event_id text,
  p_event_type text,
  p_unipile_account_id text,
  p_email jsonb,
  p_owner_addresses text[] default '{}'
) returns table (outcome text, interaction_id uuid, send_id uuid, attachments jsonb)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_event_row_id uuid;
  v_sender private.sender_accounts;
  v_send private.sequence_step_sends;
  v_sequence public.sequences;
  v_contact_id uuid;
  v_interaction public.account_interactions;
  v_email_id text := nullif(btrim(p_email ->> 'id'), '');
  v_message_id text := nullif(btrim(p_email ->> 'message_id'), '');
  v_thread_id text := nullif(btrim(p_email ->> 'thread_id'), '');
  v_from jsonb;
  v_from_email text;
  v_in_reply_to text := private.email_header(p_email, 'In-Reply-To');
  v_references text[] := array_remove(
    regexp_split_to_array(coalesce(private.email_header(p_email, 'References'), ''), '\s+'), '');
  v_header_send text := private.email_header(p_email, 'X-Althius-Envio');
  v_header_send_id uuid;
  v_attachments jsonb := '[]'::jsonb;
  v_received_at timestamptz;
  v_outcome text;
begin
  if p_event_type not in ('email.new', 'email.new.bounce') then
    raise exception 'unsupported email event type' using errcode = '22023';
  end if;

  -- 1. Dedupe pelo id do evento. A Unipile reentrega até duas vezes.
  insert into private.unipile_email_events (event_id, event_type, unipile_account_id, provider_email_id, outcome)
  values (p_event_id, p_event_type, p_unipile_account_id, v_email_id, 'unrelated')
  on conflict (event_id) do nothing
  returning id into v_event_row_id;
  if v_event_row_id is null then
    return query select 'duplicate_event', null::uuid, null::uuid, '[]'::jsonb;
    return;
  end if;

  select a.* into v_sender from private.sender_accounts a where a.unipile_account_id = p_unipile_account_id;
  if not found then
    update private.unipile_email_events set outcome = 'unknown_account' where id = v_event_row_id;
    return query select 'unknown_account', null::uuid, null::uuid, '[]'::jsonb;
    return;
  end if;
  update private.unipile_email_events set sender_account_id = v_sender.id where id = v_event_row_id;

  -- 2. Dedupe pelo e-mail: o email.new sai de novo quando o e-mail é movido ou vai para a lixeira.
  perform pg_advisory_xact_lock(hashtext(p_unipile_account_id || '|' || coalesce(v_email_id, p_event_id)));
  if v_email_id is not null and exists (
    select 1 from private.unipile_email_events e
    where e.unipile_account_id = p_unipile_account_id and e.provider_email_id = v_email_id
      and e.event_type = p_event_type and e.id <> v_event_row_id
      and e.outcome in ('echo', 'reply', 'bounce', 'unrelated')
  ) then
    update private.unipile_email_events set outcome = 'duplicate_email' where id = v_event_row_id;
    return query select 'duplicate_email', null::uuid, null::uuid, '[]'::jsonb;
    return;
  end if;

  v_from := case when jsonb_typeof(p_email -> 'from') = 'array' then p_email -> 'from' -> 0 else p_email -> 'from' end;
  v_from_email := lower(nullif(btrim(v_from ->> 'email'), ''));
  if v_header_send ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' then
    v_header_send_id := v_header_send::uuid;
  end if;

  -- 3. Bounce: o payload é o e-mail ORIGINAL enviado. Eco: o próprio envio nos itens enviados.
  select e.* into v_send from private.sequence_step_sends e
  where e.sender_account_id = v_sender.id
    and (e.id = v_header_send_id or e.provider_email_id = v_email_id or e.provider_message_id = v_message_id)
  limit 1;
  if p_event_type = 'email.new.bounce' then
    if found then
      update private.sequence_step_sends set
        status = 'bounced', last_error = 'bounced', last_error_at = now(), updated_at = now()
      where id = v_send.id;
      v_outcome := 'bounce';
    else
      v_outcome := 'unrelated';
    end if;
  elsif found then
    if v_from_email is not null and v_sender.email_address is distinct from v_from_email then
      update private.sender_accounts set email_address = v_from_email, updated_at = now() where id = v_sender.id;
    end if;
    if v_send.status in ('sending', 'uncertain') then
      v_send := private.mark_step_send_sent(v_send.id, v_email_id, v_message_id, v_thread_id);
    else
      update private.sequence_step_sends set
        provider_email_id = coalesce(provider_email_id, v_email_id),
        provider_message_id = coalesce(provider_message_id, v_message_id),
        provider_thread_id = coalesce(provider_thread_id, v_thread_id),
        updated_at = now()
      where id = v_send.id;
    end if;
    v_outcome := 'echo';
  -- O que o titular escreveu por conta própria também é eco, nunca resposta do Contato.
  elsif v_from_email is not null and (v_from_email = v_sender.email_address
    or v_from_email = any (select lower(a) from unnest(p_owner_addresses) a)) then
    v_send := null;
    v_outcome := 'echo';
  -- Resposta automática (mailer-daemon, fora do escritório, Auto-Submitted) não é resposta comercial.
  elsif v_from_email ~* '^(mailer-daemon|postmaster|no-?reply|do-?not-?reply)@'
    or lower(coalesce(private.email_header(p_email, 'Auto-Submitted'), 'no')) <> 'no'
    or private.email_header(p_email, 'X-Autoreply') is not null
    or private.email_header(p_email, 'X-Autorespond') is not null then
    v_send := null;
    v_outcome := 'automatic';
  end if;

  -- 4. Resposta: a conversa de um passo enviado, ou o In-Reply-To/References com um message_id enviado.
  if v_outcome is null then
    select e.* into v_send from private.sequence_step_sends e
    where e.sender_account_id = v_sender.id
      and e.status in ('sent', 'uncertain', 'bounced')
      and (
        (v_thread_id is not null and e.provider_thread_id = v_thread_id)
        or (e.provider_message_id is not null
          and (e.provider_message_id = v_in_reply_to or e.provider_message_id = any (v_references)))
      )
    order by e.sent_at desc nulls last
    limit 1;
    v_outcome := case when found then 'reply' else 'unrelated' end;
  end if;

  if v_outcome = 'reply' then
    -- A trava da Sequência serializa a pausa com uma liberação concorrente de envio.
    select s.* into v_sequence from public.sequences s where s.id = v_send.sequence_id for update;

    -- Quem respondeu: o Contato com esse e-mail e Vínculo ativo na Conta-alvo. Outra pessoa da Conta-alvo
    -- (um colega na mesma conversa) também pausa, mas a Interação pública não a atribui ao Contato errado.
    select c.id into v_contact_id from public.contacts c
    join public.contact_account_links l
      on l.workspace_id = c.workspace_id and l.contact_id = c.id
        and l.target_account_id = v_sequence.target_account_id::uuid and l.ended_at is null
    where c.workspace_id = v_sequence.workspace_id and c.email = v_from_email
    limit 1;

    v_received_at := coalesce(private.safe_timestamptz(p_email ->> 'date'), now());

    insert into public.account_interactions (workspace_id, target_account_id, contact_id, kind, occurred_at, source, recorded_by)
    values (v_sequence.workspace_id, v_sequence.target_account_id::uuid, v_contact_id, 'email-recebido',
      v_received_at, 'sequencia', v_sequence.owner_user_id)
    returning * into v_interaction;
    update public.target_accounts
    set last_interaction_at = greatest(last_interaction_at, v_received_at)
    where id = v_sequence.target_account_id::uuid;

    -- Os anexos chegam com id e/ou url; os dois ficam guardados para o download depois do 2xx.
    if jsonb_typeof(p_email -> 'attachments') = 'array' then
      select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', coalesce(nullif(btrim(a ->> 'id'), ''), 'anexo-' || n),
        'url', nullif(btrim(a ->> 'url'), ''),
        'name', coalesce(a ->> 'name', a ->> 'filename', 'anexo'),
        'mime', coalesce(a ->> 'mime', a ->> 'mime_type', a ->> 'content_type'),
        'size', case when (a ->> 'size') ~ '^\d+$' then (a ->> 'size')::bigint end,
        'status', 'pending')) order by n), '[]'::jsonb)
      into v_attachments
      from jsonb_array_elements(p_email -> 'attachments') with ordinality as t(a, n)
      where jsonb_typeof(a) = 'object';
    end if;

    insert into private.received_emails (
      interaction_id, workspace_id, owner_user_id, sequence_id, send_id, contact_id, sender_account_id,
      provider_email_id, provider_message_id, provider_thread_id, from_email, from_name,
      subject, body, snippet, received_at, attachments
    ) values (
      v_interaction.id, v_sequence.workspace_id, v_sequence.owner_user_id, v_sequence.id, v_send.id, v_contact_id, v_sender.id,
      coalesce(v_email_id, p_event_id), v_message_id, v_thread_id, v_from_email, nullif(btrim(v_from ->> 'display_name'), ''),
      p_email ->> 'subject', p_email ->> 'body', p_email ->> 'snippet', v_received_at, v_attachments
    );

    -- A pausa vale para a Sequência inteira da Conta-alvo; retomar é ação explícita do responsável.
    if v_sequence.status = 'ativa' then
      update public.sequences set
        status = 'pausada',
        public_summary = public_summary || jsonb_build_object('status', 'pausada'),
        updated_at = now()
      where id = v_sequence.id;
      update private.sequence_documents set
        document = document || jsonb_build_object('motivoPause', 'Contato respondeu'),
        updated_at = now()
      where sequence_id = v_sequence.id;
    end if;
  end if;

  update private.unipile_email_events
  set outcome = v_outcome, send_id = v_send.id, interaction_id = v_interaction.id
  where id = v_event_row_id;
  return query select v_outcome, v_interaction.id, v_send.id, v_attachments;
end;
$$;

revoke all on function public.ingest_unipile_email_event(text, text, text, jsonb, text[]) from public, anon, authenticated;
grant execute on function public.ingest_unipile_email_event(text, text, text, jsonb, text[]) to service_role;

-- O conteúdo recebido, só para o titular da Sequência.
create function public.get_received_email(p_interaction_id uuid)
returns table (
  interaction_id uuid, sequence_id uuid, contact_id uuid, from_email text, from_name text,
  subject text, body text, snippet text, received_at timestamptz, attachments jsonb
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
    select 1 from private.received_emails r
    join public.workspace_memberships m
      on m.workspace_id = r.workspace_id and m.user_id = v_user_id and m.active
    where r.interaction_id = p_interaction_id and r.owner_user_id = v_user_id
  ) then
    raise exception 'only the owner can read the received e-mail' using errcode = '42501';
  end if;
  return query
    select r.interaction_id, r.sequence_id, r.contact_id, r.from_email, r.from_name,
      r.subject, r.body, r.snippet, r.received_at, r.attachments
    from private.received_emails r
    where r.interaction_id = p_interaction_id;
end;
$$;

revoke all on function public.get_received_email(uuid) from public, anon;
grant execute on function public.get_received_email(uuid) to authenticated;

-- O caminho privado de um anexo guardado, para a Edge Function gerar a URL assinada só ao titular.
create function public.get_received_email_attachment_path(p_interaction_id uuid, p_attachment_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
begin
  select a ->> 'storage_path' into v_path
  from public.get_received_email(p_interaction_id) r, jsonb_array_elements(r.attachments) a
  where a ->> 'id' = p_attachment_id and a ->> 'status' = 'stored';
  if v_path is null then
    raise exception 'attachment not stored' using errcode = 'P0002';
  end if;
  return v_path;
end;
$$;

revoke all on function public.get_received_email_attachment_path(uuid, text) from public, anon;
grant execute on function public.get_received_email_attachment_path(uuid, text) to authenticated;

-- O backend registra onde o anexo ficou (stored) ou que o download falhou (failed).
create function public.record_received_email_attachment(
  p_interaction_id uuid,
  p_attachment_id text,
  p_storage_path text,
  p_status text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attachments jsonb;
begin
  if p_status not in ('stored', 'failed') then
    raise exception 'unknown attachment status' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(
    case when a ->> 'id' = p_attachment_id
      then jsonb_strip_nulls(a || jsonb_build_object('status', p_status, 'storage_path',
        case when p_status = 'stored' then p_storage_path end))
      else a end), '[]'::jsonb)
  into v_attachments
  from private.received_emails r, jsonb_array_elements(r.attachments) a
  where r.interaction_id = p_interaction_id;

  update private.received_emails set attachments = v_attachments where interaction_id = p_interaction_id;
  return found;
end;
$$;

revoke all on function public.record_received_email_attachment(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.record_received_email_attachment(uuid, text, text, text) to service_role;

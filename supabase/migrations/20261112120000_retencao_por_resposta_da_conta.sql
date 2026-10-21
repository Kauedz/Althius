-- Retenção preventiva da Conta ao receber resposta correlacionada (ticket 03).
-- Não altera o conector Unipile nem as funções de ingestão: o gatilho observa as linhas
-- que a ingestão já correlacionou (e-mail e chat). Resposta não correlacionada não entra
-- nessas tabelas e não abre retenção. A IA não participa deste registro nem da decisão.
-- A pausa já gravada pela ingestão continua; a retenção é a guarda versionada que o
-- Executor revalida antes de liberar o envio, e que uma confirmação obsoleta não abre.

create table private.sequence_correlated_replies (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.sequences(id) on delete cascade,
  workspace_id uuid not null,
  source_kind text not null check (source_kind in ('email', 'chat')),
  source_id uuid not null,
  provider_event_id text not null,
  contact_id uuid,
  received_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (source_kind, source_id),
  unique (sequence_id, provider_event_id)
);

create index sequence_correlated_replies_open_idx
  on private.sequence_correlated_replies (sequence_id, created_at);

create table private.sequence_reply_holds (
  sequence_id uuid primary key references public.sequences(id) on delete cascade,
  workspace_id uuid not null,
  target_account_id text not null,
  version bigint not null default 1 check (version > 0),
  open boolean not null default true,
  state text not null default 'preventive' check (state in ('preventive', 'decided_pause')),
  opened_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index sequence_reply_holds_account_idx
  on private.sequence_reply_holds (workspace_id, target_account_id)
  where open;

create table private.sequence_retention_decisions (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.sequences(id) on delete cascade,
  workspace_id uuid not null,
  actor_user_id uuid not null references auth.users(id),
  decision text not null check (decision in ('pause', 'continue')),
  reviewed_version bigint not null,
  reviewed_reply_ids uuid[] not null,
  outcome text not null,
  created_at timestamptz not null default now()
);

create index sequence_retention_decisions_sequence_idx
  on private.sequence_retention_decisions (sequence_id, created_at desc);

create table private.sequence_retention_audits (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null,
  send_id uuid not null,
  hold_version bigint not null,
  kind text not null check (kind in ('in_transit', 'already_out')),
  created_at timestamptz not null default now(),
  unique (send_id, hold_version, kind)
);

alter table private.sequence_correlated_replies enable row level security;
alter table private.sequence_reply_holds enable row level security;
alter table private.sequence_retention_decisions enable row level security;
alter table private.sequence_retention_audits enable row level security;

revoke all on private.sequence_correlated_replies from public, anon, authenticated;
revoke all on private.sequence_reply_holds from public, anon, authenticated;
revoke all on private.sequence_retention_decisions from public, anon, authenticated;
revoke all on private.sequence_retention_audits from public, anon, authenticated;
grant all on private.sequence_correlated_replies to service_role;
grant all on private.sequence_reply_holds to service_role;
grant all on private.sequence_retention_decisions to service_role;
grant all on private.sequence_retention_audits to service_role;

comment on table private.sequence_correlated_replies is
  'Resposta já correlacionada a uma Sequência. Duplicata do mesmo evento do provedor não cria outra linha.';
comment on table private.sequence_reply_holds is
  'Retenção preventiva dos próximos envios da Conta. Aberta não é decisão comercial; continuar exige a versão revista.';
comment on table private.sequence_retention_decisions is
  'Decisão do titular sobre o conjunto de respostas que ele viu. Não inclui classificação de IA.';
comment on table private.sequence_retention_audits is
  'Envio já em trânsito ou já aceito quando a retenção estava aberta. Não repete o envio.';

-- -------------------------------------------------------------------------------------------------------------
-- Registro. Idempotente pelo evento do provedor: duplicata não reabre retenção já resolvida.
-- -------------------------------------------------------------------------------------------------------------

create function private.retain_account_on_correlated_reply(
  p_source_kind text,
  p_source_id uuid,
  p_sequence_id uuid,
  p_workspace_id uuid,
  p_provider_event_id text,
  p_contact_id uuid,
  p_received_at timestamptz
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reply_id uuid;
  v_account text;
  v_event text := nullif(btrim(p_provider_event_id), '');
begin
  if p_sequence_id is null or p_workspace_id is null or p_source_id is null then
    return;
  end if;
  if v_event is null then
    v_event := p_source_id::text;
  end if;

  -- Mesma ordem da ingestão: a Sequência primeiro, para serializar com a liberação do envio.
  select s.target_account_id into v_account
  from public.sequences s
  where s.id = p_sequence_id
  for update;
  if not found then
    return;
  end if;

  insert into private.sequence_correlated_replies (
    sequence_id, workspace_id, source_kind, source_id, provider_event_id, contact_id, received_at
  ) values (
    p_sequence_id, p_workspace_id, p_source_kind, p_source_id, v_event, p_contact_id,
    coalesce(p_received_at, pg_catalog.now())
  )
  on conflict (sequence_id, provider_event_id) do nothing
  returning id into v_reply_id;

  -- O mesmo evento, reentregue, não cria resposta nem reabre retenção já resolvida.
  if v_reply_id is null then
    return;
  end if;

  insert into private.sequence_reply_holds (
    sequence_id, workspace_id, target_account_id, version, open, state, opened_at, resolved_at
  ) values (
    p_sequence_id, p_workspace_id, v_account, 1, true, 'preventive', pg_catalog.now(), null
  )
  on conflict (sequence_id) do update set
    version = private.sequence_reply_holds.version + 1,
    open = true,
    state = 'preventive',
    opened_at = case
      when private.sequence_reply_holds.open then private.sequence_reply_holds.opened_at
      else pg_catalog.now()
    end,
    resolved_at = null;
end;
$$;

revoke all on function private.retain_account_on_correlated_reply(text, uuid, uuid, uuid, text, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function private.retain_account_on_correlated_reply(text, uuid, uuid, uuid, text, uuid, timestamptz)
  to service_role;

create function private.retain_account_on_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.retain_account_on_correlated_reply(
    'email', new.interaction_id, new.sequence_id, new.workspace_id,
    new.provider_email_id, new.contact_id, new.received_at);
  return new;
end;
$$;

create function private.retain_account_on_chat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.retain_account_on_correlated_reply(
    'chat', new.interaction_id, new.sequence_id, new.workspace_id,
    coalesce(new.provider_message_id, new.interaction_id::text), new.contact_id, new.received_at);
  return new;
end;
$$;

revoke all on function private.retain_account_on_email() from public, anon, authenticated;
revoke all on function private.retain_account_on_chat() from public, anon, authenticated;
grant execute on function private.retain_account_on_email() to service_role;
grant execute on function private.retain_account_on_chat() to service_role;

create trigger received_emails_account_retention
  after insert on private.received_emails
  for each row execute function private.retain_account_on_email();

create trigger received_chat_messages_account_retention
  after insert on private.received_chat_messages
  for each row execute function private.retain_account_on_chat();

-- -------------------------------------------------------------------------------------------------------------
-- Leitura e decisão. Só o titular decide. Outro participante não lê o conteúdo.
-- -------------------------------------------------------------------------------------------------------------

create function private.reply_hold_owner(p_sequence_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.sequences s
    join public.workspace_memberships m
      on m.workspace_id = s.workspace_id and m.user_id = auth.uid() and m.active
    join public.sales_responsibilities r
      on r.workspace_id = s.workspace_id
     and r.target_account_id = s.target_account_id
     and r.owner_user_id = auth.uid()
    where s.id = p_sequence_id and s.owner_user_id = auth.uid()
  );
$$;

revoke all on function private.reply_hold_owner(uuid) from public, anon, authenticated;

create function private.pending_reply_ids(p_sequence_id uuid, p_opened_at timestamptz)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(r.id order by r.created_at, r.id), '{}'::uuid[])
  from private.sequence_correlated_replies r
  where r.sequence_id = p_sequence_id and r.created_at >= p_opened_at;
$$;

revoke all on function private.pending_reply_ids(uuid, timestamptz) from public, anon, authenticated;

create function private.same_uuid_set(p_left uuid[], p_right uuid[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (
    select coalesce(array_agg(distinct x order by x), '{}'::uuid[])
    from unnest(coalesce(p_left, '{}'::uuid[])) as x
  ) = (
    select coalesce(array_agg(distinct y order by y), '{}'::uuid[])
    from unnest(coalesce(p_right, '{}'::uuid[])) as y
  );
$$;

revoke all on function private.same_uuid_set(uuid[], uuid[]) from public, anon, authenticated;

create function public.list_sequence_reply_review(p_sequence_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_sequence public.sequences;
  v_hold private.sequence_reply_holds;
  v_owner boolean;
  v_hold_found boolean := false;
  v_pending jsonb := '[]'::jsonb;
  v_decisions jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select s.* into v_sequence from public.sequences s where s.id = p_sequence_id;
  if not found or not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = v_sequence.workspace_id and m.user_id = v_user_id and m.active
  ) then
    raise exception 'sequence not found or not owned by active user' using errcode = '42501';
  end if;

  v_owner := private.reply_hold_owner(p_sequence_id);
  select h.* into v_hold from private.sequence_reply_holds h where h.sequence_id = p_sequence_id;
  v_hold_found := found;

  if v_owner then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', d.id,
      'decision', d.decision,
      'version', d.reviewed_version,
      'reviewed_reply_ids', to_jsonb(d.reviewed_reply_ids),
      'outcome', d.outcome,
      'created_at', d.created_at
    ) order by d.created_at desc), '[]'::jsonb)
    into v_decisions
    from private.sequence_retention_decisions d
    where d.sequence_id = p_sequence_id;
  end if;

  if v_hold_found and v_owner and v_hold.open then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id,
      'source_kind', r.source_kind,
      'contact_id', r.contact_id,
      'received_at', r.received_at,
      'channel', case when r.source_kind = 'email' then 'email' else c.channel end,
      'subject', e.subject,
      'snippet', coalesce(e.snippet, left(c.body, 180)),
      'from_name', coalesce(e.from_name, c.from_name),
      'from_email', e.from_email
    ) order by r.created_at, r.id), '[]'::jsonb)
    into v_pending
    from private.sequence_correlated_replies r
    left join private.received_emails e
      on r.source_kind = 'email' and e.interaction_id = r.source_id
    left join private.received_chat_messages c
      on r.source_kind = 'chat' and c.interaction_id = r.source_id
    where r.sequence_id = p_sequence_id and r.created_at >= v_hold.opened_at;
  elsif v_hold_found and not v_owner and v_hold.open then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id,
      'received_at', r.received_at
    ) order by r.created_at, r.id), '[]'::jsonb)
    into v_pending
    from private.sequence_correlated_replies r
    where r.sequence_id = p_sequence_id and r.created_at >= v_hold.opened_at;
  end if;

  if not v_hold_found then
    return jsonb_build_object(
      'open', false,
      'state', 'none',
      'version', 0,
      'pending', '[]'::jsonb,
      'decisions', case when v_owner then v_decisions else '[]'::jsonb end,
      'can_read_content', v_owner,
      'can_decide', v_owner
    );
  end if;

  return jsonb_build_object(
    'open', v_hold.open,
    'state', case when v_hold.open then v_hold.state else 'none' end,
    'version', v_hold.version,
    'pending', v_pending,
    'decisions', case when v_owner then v_decisions else '[]'::jsonb end,
    'can_read_content', v_owner,
    'can_decide', v_owner
  );
end;
$$;

revoke all on function public.list_sequence_reply_review(uuid) from public, anon;
grant execute on function public.list_sequence_reply_review(uuid) to authenticated;

create function public.decide_sequence_retention(
  p_sequence_id uuid,
  p_decision text,
  p_reviewed_version bigint,
  p_reviewed_reply_ids uuid[]
) returns table (outcome text, version bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_sequence public.sequences;
  v_hold private.sequence_reply_holds;
  v_pending uuid[];
  v_summary jsonb;
  v_reason text;
  v_outcome text;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_decision not in ('pause', 'continue') then
    raise exception 'unknown retention decision' using errcode = '22023';
  end if;
  if not private.reply_hold_owner(p_sequence_id) then
    raise exception 'sequence not found or not owned by active user' using errcode = '42501';
  end if;

  select s.* into v_sequence from public.sequences s where s.id = p_sequence_id for update;
  select h.* into v_hold from private.sequence_reply_holds h where h.sequence_id = p_sequence_id for update;

  if not found then
    return query select 'not_open'::text, 0::bigint;
    return;
  end if;
  if not v_hold.open then
    return query select 'not_open'::text, v_hold.version;
    return;
  end if;

  v_pending := private.pending_reply_ids(p_sequence_id, v_hold.opened_at);
  if v_hold.version is distinct from p_reviewed_version
     or not private.same_uuid_set(v_pending, p_reviewed_reply_ids) then
    return query select 'stale'::text, v_hold.version;
    return;
  end if;

  if p_decision = 'pause' then
    update private.sequence_reply_holds set state = 'decided_pause' where sequence_id = p_sequence_id;
    update private.sequence_documents d
    set document = d.document || jsonb_build_object('motivoPause', 'Pausa decidida após resposta'),
        updated_at = pg_catalog.now()
    where d.sequence_id = p_sequence_id
      and coalesce(d.document ->> 'motivoPause', '') is distinct from 'Descadastro';
    insert into private.sequence_retention_decisions (
      sequence_id, workspace_id, actor_user_id, decision, reviewed_version, reviewed_reply_ids, outcome
    ) values (
      p_sequence_id, v_sequence.workspace_id, v_user_id, 'pause', v_hold.version, v_pending, 'paused'
    );
    return query select 'paused'::text, v_hold.version;
    return;
  end if;

  -- Continuar a Conta inteira. Não escolhe Contato (isso é o ticket 04) e não remove outra guarda.
  update private.sequence_reply_holds set
    open = false,
    resolved_at = pg_catalog.now()
  where sequence_id = p_sequence_id;

  if v_sequence.suspended_reason is not null
     or exists (select 1 from private.sequence_sender_holds h where h.sequence_id = p_sequence_id) then
    v_outcome := 'reviewed_other_hold';
  else
    select s.public_summary into v_summary from public.sequences s where s.id = p_sequence_id;
    perform set_config('althius.reply_retention_release', 'on', true);
    perform public.update_owned_sequence(
      p_sequence_id,
      null,
      coalesce(v_summary, '{}'::jsonb) || jsonb_build_object('status', 'ativa'),
      'ativa'
    );
    select d.document ->> 'motivoPause' into v_reason
    from private.sequence_documents d where d.sequence_id = p_sequence_id;
    if v_reason in ('Contato respondeu', 'Pausa decidida após resposta') then
      update private.sequence_documents d
      set document = d.document - 'motivoPause', updated_at = pg_catalog.now()
      where d.sequence_id = p_sequence_id;
    end if;
    v_outcome := 'continued';
  end if;

  insert into private.sequence_retention_decisions (
    sequence_id, workspace_id, actor_user_id, decision, reviewed_version, reviewed_reply_ids, outcome
  ) values (
    p_sequence_id, v_sequence.workspace_id, v_user_id, 'continue', v_hold.version, v_pending, v_outcome
  );
  return query select v_outcome, v_hold.version;
end;
$$;

revoke all on function public.decide_sequence_retention(uuid, text, bigint, uuid[]) from public, anon;
grant execute on function public.decide_sequence_retention(uuid, text, bigint, uuid[]) to authenticated;

-- Retomar pelo documento, com a retenção ainda aberta, não libera a Conta.
create function private.block_resume_while_reply_held()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'ativa' and old.status is distinct from 'ativa'
     and current_setting('althius.reply_retention_release', true) is distinct from 'on'
     and exists (
       select 1 from private.sequence_reply_holds h
       where h.sequence_id = new.id and h.open
     ) then
    raise exception 'account retained pending reply review' using errcode = '55006';
  end if;
  return new;
end;
$$;

revoke all on function private.block_resume_while_reply_held() from public, anon, authenticated;

create trigger sequences_block_resume_while_reply_held
  before update of status on public.sequences
  for each row execute function private.block_resume_while_reply_held();

-- -------------------------------------------------------------------------------------------------------------
-- O Executor revalida imediatamente antes de liberar o envio ao provedor.
-- Envio já em trânsito é auditado e não é repetido. Não promete cancelar o que o provedor já aceitou.
-- -------------------------------------------------------------------------------------------------------------

create function private.guard_reply_retention(p_send_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_send private.sequence_step_sends;
  v_sequence public.sequences;
  v_version bigint;
  v_open boolean := false;
begin
  select e.* into v_send from private.sequence_step_sends e where e.id = p_send_id;
  if not found then
    return null;
  end if;

  select s.* into v_sequence from public.sequences s where s.id = v_send.sequence_id for update;
  select e.* into v_send from private.sequence_step_sends e where e.id = p_send_id for update;

  select h.version, true into v_version, v_open
  from private.sequence_reply_holds h
  join public.sequences s on s.id = h.sequence_id
  where h.open
    and s.workspace_id = v_sequence.workspace_id
    and s.target_account_id = v_sequence.target_account_id
  order by h.version desc
  limit 1
  for update of h;

  if not coalesce(v_open, false) then
    return null;
  end if;

  if v_send.status = 'sending' then
    insert into private.sequence_retention_audits (sequence_id, send_id, hold_version, kind)
    values (v_send.sequence_id, v_send.id, v_version, 'in_transit')
    on conflict (send_id, hold_version, kind) do nothing;
    return 'in_flight';
  end if;

  if v_send.status in ('sent', 'uncertain') then
    insert into private.sequence_retention_audits (sequence_id, send_id, hold_version, kind)
    values (v_send.sequence_id, v_send.id, v_version, 'already_out')
    on conflict (send_id, hold_version, kind) do nothing;
    return null;
  end if;

  return 'account_retained';
end;
$$;

revoke all on function private.guard_reply_retention(uuid) from public, anon, authenticated;

alter function private.release_step_send(uuid, uuid, boolean) rename to release_step_send_before_retention;

create function private.release_step_send(p_send_id uuid, p_user_id uuid, p_due_only boolean)
returns table (
  outcome text, send_id uuid, unipile_account_id text, destination text, contact_name text,
  subject text, body text, reply_to_message_id text,
  tracking_header_name text, tracking_header_value text, unsubscribe_token text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guard text;
begin
  v_guard := private.guard_reply_retention(p_send_id);
  if v_guard = 'account_retained' then
    return query select 'account_retained', p_send_id, null::text, null::text, null::text,
      null::text, null::text, null::text, null::text, null::text, null::text;
    return;
  end if;
  if v_guard = 'in_flight' then
    return query select 'in_flight', p_send_id, null::text, null::text, null::text,
      null::text, null::text, null::text, null::text, null::text, null::text;
    return;
  end if;
  return query select * from private.release_step_send_before_retention(p_send_id, p_user_id, p_due_only);
end;
$$;

revoke all on function private.release_step_send(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function private.release_step_send_before_retention(uuid, uuid, boolean) from public, anon, authenticated;

alter function private.release_chat_step_send(uuid, uuid, boolean) rename to release_chat_step_send_before_retention;

create function private.release_chat_step_send(p_send_id uuid, p_user_id uuid, p_due_only boolean)
returns table (
  outcome text, send_id uuid, channel text, unipile_account_id text, destination text, contact_name text,
  body text, linkedin_subtype text, provider_chat_id text, provider_user_id text,
  invite_sent boolean, invite_note_limit integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guard text;
begin
  v_guard := private.guard_reply_retention(p_send_id);
  if v_guard = 'account_retained' then
    return query select 'account_retained', p_send_id, null::text, null::text, null::text, null::text,
      null::text, null::text, null::text, null::text, null::boolean, null::integer;
    return;
  end if;
  if v_guard = 'in_flight' then
    return query select 'in_flight', p_send_id, null::text, null::text, null::text, null::text,
      null::text, null::text, null::text, null::text, null::boolean, null::integer;
    return;
  end if;
  return query select * from private.release_chat_step_send_before_retention(p_send_id, p_user_id, p_due_only);
end;
$$;

revoke all on function private.release_chat_step_send(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function private.release_chat_step_send_before_retention(uuid, uuid, boolean) from public, anon, authenticated;

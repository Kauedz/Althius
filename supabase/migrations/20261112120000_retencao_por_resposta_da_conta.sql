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
  contact_id uuid references public.contacts(id) on delete set null,
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
  sequence_id uuid not null references public.sequences(id) on delete cascade,
  send_id uuid not null references private.sequence_step_sends(id) on delete cascade,
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

-- Serializa, por Conta, o registro de uma resposta e a liberação de um envio de qualquer Sequência dela.
-- O lock da linha da Sequência só cobre a própria Sequência; a retenção vale para a Conta inteira.
create function private.lock_account_retention(p_workspace_id uuid, p_target_account_id text)
returns void
language sql
set search_path = ''
as $$
  select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('reply_retention:' || p_workspace_id::text || ':' || coalesce(p_target_account_id, ''), 0));
$$;

revoke all on function private.lock_account_retention(uuid, text) from public, anon, authenticated;

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
  perform private.lock_account_retention(p_workspace_id, v_account);

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
    -- A retenção desta Sequência já está fechada acima: retomar aqui não registra outra decisão.
    select s.public_summary into v_summary from public.sequences s where s.id = p_sequence_id;
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

-- Mudar o status direto para ativa, com a retenção ainda aberta, não libera a Conta. A retomada explícita do Vendedor
-- responsável (update_owned_sequence) fecha a retenção antes, como decisão "continuar".
create function private.block_resume_while_reply_held()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'ativa' and old.status is distinct from 'ativa'
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
  -- Outra Sequência da mesma Conta pode estar registrando uma resposta agora: espera por ela e só então lê as retenções.
  perform private.lock_account_retention(v_sequence.workspace_id, v_sequence.target_account_id);

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

-- A liberação do E-mail. `private.release_step_send` (descadastro e variáveis, 20261103100000) continua a mesma e chama
-- esta função; aqui entra só a retenção, a partir da definição de 20261019120000.
create or replace function private.release_step_send_core(p_send_id uuid, p_user_id uuid, p_due_only boolean)
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
  v_auth private.sequence_authorizations;
  v_step jsonb;
  v_subject text;
  v_body text;
  v_reply_to text;
  v_blocked text;
  v_account public.target_accounts;
  v_owner_name text;
  v_window jsonb;
  v_slot timestamptz;
  v_pace boolean := private.send_rate_enabled();
  v_gate_reason text;
  v_gate_at timestamptz;
  v_retention text;
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
    v_blocked := 'owner_not_responsible';
  end if;

  if v_blocked is null and v_send.status = 'sending' then
    perform private.expire_stale_sends(v_send.id);
    select e.status into v_send.status from private.sequence_step_sends e where e.id = v_send.id;
  end if;

  if v_blocked is null then
    v_blocked := case v_send.status
      when 'sending' then 'in_flight'
      when 'sent' then 'already_sent'
      when 'uncertain' then 'reconcile_required'
      when 'scheduled' then null
      when 'confirmed' then case when p_due_only then 'not_scheduled' end
      else 'not_confirmed'
    end;
  end if;

  -- O passo de uma versão autorizada só sai na hora dele, pelo executor ou pela ação explícita do titular.
  if v_blocked is null and (p_due_only or v_send.authorization_id is not null)
    and (v_send.scheduled_for is null or v_send.scheduled_for > private.clock_now()) then
    v_blocked := 'not_due';
  end if;

  if v_blocked is null and v_sequence.status <> 'ativa' then
    v_blocked := 'sequence_not_active';
  end if;

  -- O conteúdo sai da versão autorizada; a confirmação avulsa (sem versão) usa o documento atual.
  if v_blocked is null and v_send.authorization_id is not null then
    select a.* into v_auth from private.sequence_authorizations a
    where a.id = v_send.authorization_id and a.revoked_at is null;
    if not found then
      v_blocked := 'authorization_revoked';
    end if;
  end if;

  if v_blocked is null then
    v_step := case when v_auth.id is not null
      then private.authorized_step(v_auth.id, v_send.step_id)
      else private.sequence_step(v_sequence.id, v_send.step_id) end;
    if v_step is null then
      v_blocked := 'step_missing';
    end if;
  end if;

  -- Só dentro da janela. Atrasado (ex.: executor fora do ar), o passo automático vai para o próximo horário válido.
  if v_blocked is null and v_auth.id is not null then
    v_window := private.step_window(v_auth.document, v_step);
    v_slot := private.next_send_slot(private.clock_now(), 0, v_window);
    if v_slot > private.clock_now() then
      if p_due_only then
        update private.sequence_step_sends set
          scheduled_for = case when v_pace then private.jittered_send_slot(v_slot, v_window, (
            select x.schedule_jitter_seconds from private.send_rate(v_sequence.workspace_id, 'email') x)) else v_slot end,
          claimed_until = null, updated_at = now()
        where id = v_send.id;
      end if;
      v_blocked := 'outside_window';
    end if;
  end if;

  if v_blocked is null then
    select a.* into v_sender from private.sender_accounts a
    where a.workspace_id = v_sequence.workspace_id and a.owner_user_id = p_user_id
      and a.channel = 'email' and a.status = 'ready' and not a.reconciliation_required
    order by a.last_status_at desc
    limit 1;
    if not found then
      v_blocked := 'sender_not_ready';
    elsif v_pace then
      -- A linha da Conta fica travada até o fim da transação: dois envios da mesma Conta não passam juntos pelo intervalo.
      select a.* into v_sender from private.sender_accounts a where a.id = v_sender.id for update;
    end if;
  end if;

  if v_blocked is null then
    -- O Contato precisa continuar vinculado à Conta-alvo: quem saiu da empresa não recebe o passo.
    select c.* into v_contact from public.contacts c
    where c.id = v_send.contact_id and c.workspace_id = v_sequence.workspace_id;
    if not found or not exists (
      select 1 from public.contact_account_links l
      where l.contact_id = v_send.contact_id and l.target_account_id = v_sequence.target_account_id::uuid
        and l.ended_at is null) then
      v_blocked := 'contact_unlinked';
    -- ADR-0014: um Destino que o Contato não tem mais (nem como principal, nem como adicional) não sai nem para o
    -- antigo nem para outro: o passo espera a reconfirmação.
    elsif not private.contact_has_email(v_contact.id, v_send.destination) then
      v_blocked := 'destination_changed';
    -- Um endereço que já voltou nesta Sequência não recebe o passo automático seguinte; o titular ainda pode
    -- reconfirmar e enviar por conta própria.
    elsif p_due_only and exists (
      select 1 from private.sequence_step_sends b
      where b.sequence_id = v_sequence.id and b.id <> v_send.id and b.status = 'bounced'
        and b.destination = v_send.destination) then
      v_blocked := 'destination_bounced';
    end if;
    if v_blocked is not null then
      update private.sequence_step_sends set
        status = 'awaiting_reconfirmation', claimed_until = null,
        last_error = v_blocked, last_error_at = now(), updated_at = now()
      where id = v_send.id;
    end if;
  end if;

  -- O ritmo da Conta remetente: o intervalo desde o último envio e os limites do dia e da semana. O passo automático
  -- vai para o próximo horário possível, com o motivo; o pedido à mão do titular só recebe a resposta.
  if v_blocked is null and v_pace then
    select g.reason, g.retry_at into v_gate_reason, v_gate_at
    from private.company_entry_gate(v_sender.id, v_sequence.workspace_id, 'email', v_sequence.target_account_id, v_window) g;
    if v_gate_reason is null then
      select g.reason, g.retry_at into v_gate_reason, v_gate_at
      from private.send_rate_gate(v_sender.id, v_sequence.workspace_id, 'email', 'email', v_window) g;
    end if;
    if v_gate_reason is not null then
      if p_due_only then
        update private.sequence_step_sends set
          scheduled_for = v_gate_at, claimed_until = null, deferred_reason = v_gate_reason, updated_at = now()
        where id = v_send.id;
      end if;
      v_blocked := v_gate_reason;
    end if;
  end if;

  -- Um bloqueio que deixa o passo programado (sem Conta remetente pronta, titular sem Participação) fica gravado
  -- com o motivo, e o executor só tenta de novo em 15 minutos.
  if v_blocked in ('sender_not_ready', 'owner_not_responsible', 'step_missing') and p_due_only then
    update private.sequence_step_sends set
      last_error = v_blocked, last_error_at = now(), claimed_until = now() + interval '15 minutes', updated_at = now()
    where id = v_send.id and status = 'scheduled';
  end if;

  -- ADR-0031: a retenção por resposta da Conta é a última recusa, depois de todas as outras e logo antes de marcar o
  -- envio como sending. Envio já em trânsito ou já aceito pelo provedor é só auditado, sem repetição.
  if v_blocked is null or v_blocked in ('in_flight', 'already_sent', 'reconcile_required') then
    v_retention := private.guard_reply_retention(v_send.id);
    if v_blocked is null then
      v_blocked := v_retention;
    end if;
  end if;

  if v_blocked is not null then
    return query select v_blocked, v_send.id, null::text, null::text, null::text,
      null::text, null::text, null::text, null::text, null::text;
    return;
  end if;

  v_subject := coalesce(nullif(btrim(v_step ->> 'assunto'), ''), nullif(btrim(v_step ->> 'titulo'), ''), '(sem assunto)');

  -- Um passo "Re: …" continua a conversa do último e-mail enviado ao mesmo Contato nesta Sequência.
  -- A Unipile pode não devolver message_id: então vale o enviado anterior que tem um (a conversa é a mesma).
  -- Sem nenhum anterior, o passo abre uma conversa nova.
  if v_subject ~* '^\s*re\s*:' then
    select e.provider_message_id into v_reply_to from private.sequence_step_sends e
    where e.sequence_id = v_sequence.id and e.contact_id = v_send.contact_id
      and e.status = 'sent' and e.provider_message_id is not null and e.id <> v_send.id
    order by e.sent_at desc
    limit 1;
  end if;

  -- As variáveis do passo ({{conta.nome}}, {{contato.primeiro_nome}}…) saem preenchidas, como na pré-visualização.
  select a.* into v_account from public.target_accounts a where a.id::text = v_sequence.target_account_id;
  select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(u.raw_user_meta_data ->> 'name'), ''), u.email)
    into v_owner_name from auth.users u where u.id = p_user_id;
  v_subject := private.render_step_template(v_subject, v_account, v_contact, v_owner_name);
  v_body := private.render_step_template(coalesce(v_step ->> 'corpo', ''), v_account, v_contact, v_owner_name);

  -- O que sai fica guardado no Envio: o histórico do passo não depende do documento editado depois.
  update private.sequence_step_sends set
    status = 'sending', sender_account_id = v_sender.id, attempts = attempts + 1,
    sending_at = now(), claimed_until = null, subject = v_subject, body = v_body,
    rate_kind = 'email', deferred_reason = null, updated_at = now()
  where id = v_send.id;
  if v_pace then
    perform private.start_sender_pause(v_sender.id, v_sequence.workspace_id, 'email');
  end if;

  return query select 'released', v_send.id, v_sender.unipile_account_id, v_send.destination, v_contact.name,
    v_subject, v_body, v_reply_to, 'X-Althius-Envio', v_send.id::text;
end;
$$;

revoke all on function private.release_step_send_core(uuid, uuid, boolean) from public, anon, authenticated;

-- A liberação de WhatsApp e LinkedIn, a partir da definição de 20261019120000, com a retenção no mesmo ponto.
create or replace function private.release_chat_step_send(p_send_id uuid, p_user_id uuid, p_due_only boolean)
returns table (
  outcome text, send_id uuid, channel text, unipile_account_id text, destination text, contact_name text,
  body text, linkedin_subtype text, provider_chat_id text, provider_user_id text,
  invite_sent boolean, invite_note_limit integer
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
  v_auth private.sequence_authorizations;
  v_step jsonb;
  v_body text;
  v_blocked text;
  v_account public.target_accounts;
  v_owner_name text;
  v_window jsonb;
  v_slot timestamptz;
  v_pace boolean := private.send_rate_enabled();
  v_kind text;
  v_gate_reason text;
  v_gate_at timestamptz;
  v_chat_id text;
  v_user_ref text;
  v_invite_sent boolean := false;
  v_retention text;
begin
  select e.* into v_send from private.sequence_step_sends e where e.id = p_send_id;
  if not found then
    raise exception 'send not found' using errcode = 'P0002';
  end if;

  -- A trava da Sequência serializa os envios dela e espera uma pausa concorrente terminar.
  select s.* into v_sequence from public.sequences s where s.id = v_send.sequence_id for update;
  select e.* into v_send from private.sequence_step_sends e where e.id = p_send_id for update;

  if v_send.channel not in ('whatsapp', 'linkedin') then
    return query select 'wrong_channel', v_send.id, null::text, null::text, null::text, null::text,
      null::text, null::text, null::text, null::text, null::boolean, null::integer;
    return;
  end if;

  if p_user_id is null or p_user_id <> v_send.owner_user_id or p_user_id <> v_sequence.owner_user_id
    or not exists (
      select 1 from public.workspace_memberships m
      where m.workspace_id = v_sequence.workspace_id and m.user_id = p_user_id and m.active)
    or not exists (
      select 1 from public.sales_responsibilities r
      where r.workspace_id = v_sequence.workspace_id
        and r.target_account_id = v_sequence.target_account_id and r.owner_user_id = p_user_id) then
    v_blocked := 'owner_not_responsible';
  end if;

  if v_blocked is null and v_send.status = 'sending' then
    perform private.expire_stale_sends(v_send.id);
    select e.status into v_send.status from private.sequence_step_sends e where e.id = v_send.id;
  end if;

  if v_blocked is null then
    v_blocked := case v_send.status
      when 'sending' then 'in_flight'
      when 'sent' then 'already_sent'
      when 'uncertain' then 'reconcile_required'
      when 'scheduled' then null
      when 'confirmed' then case when p_due_only then 'not_scheduled' end
      else 'not_confirmed'
    end;
  end if;

  if v_blocked is null and (p_due_only or v_send.authorization_id is not null)
    and (v_send.scheduled_for is null or v_send.scheduled_for > private.clock_now()) then
    v_blocked := 'not_due';
  end if;

  if v_blocked is null and v_sequence.status <> 'ativa' then
    v_blocked := 'sequence_not_active';
  end if;

  -- O interruptor também é um freio: desligado, nada de conversa sai.
  if v_blocked is null and not private.chat_channel_enabled(v_send.channel) then
    v_blocked := 'channel_not_enabled';
  end if;

  if v_blocked is null and v_send.authorization_id is not null then
    select a.* into v_auth from private.sequence_authorizations a
    where a.id = v_send.authorization_id and a.revoked_at is null;
    if not found then
      v_blocked := 'authorization_revoked';
    end if;
  end if;

  if v_blocked is null then
    v_step := case when v_auth.id is not null
      then private.authorized_step(v_auth.id, v_send.step_id)
      else private.sequence_step(v_sequence.id, v_send.step_id) end;
    if v_step is null then
      v_blocked := 'step_missing';
    end if;
  end if;

  if v_blocked is null and v_auth.id is not null then
    v_window := private.step_window(v_auth.document, v_step);
    v_slot := private.next_send_slot(private.clock_now(), 0, v_window);
    if v_slot > private.clock_now() then
      if p_due_only then
        update private.sequence_step_sends set
          scheduled_for = case when v_pace then private.jittered_send_slot(v_slot, v_window, (
            select x.schedule_jitter_seconds from private.send_rate(v_sequence.workspace_id, v_send.channel) x)) else v_slot end,
          claimed_until = null, updated_at = now()
        where id = v_send.id;
      end if;
      v_blocked := 'outside_window';
    end if;
  end if;

  if v_blocked is null then
    select a.* into v_sender from private.sender_accounts a
    where a.workspace_id = v_sequence.workspace_id and a.owner_user_id = p_user_id
      and a.channel = v_send.channel and a.status = 'ready' and not a.reconciliation_required
    order by a.last_status_at desc
    limit 1;
    if not found then
      v_blocked := 'sender_not_ready';
    elsif v_pace then
      -- A linha da Conta fica travada até o fim da transação: dois envios da mesma Conta não passam juntos pelo intervalo.
      select a.* into v_sender from private.sender_accounts a where a.id = v_sender.id for update;
    end if;
  end if;

  if v_blocked is null then
    -- O Contato precisa continuar vinculado à Conta-alvo: quem saiu da empresa não recebe o passo.
    select c.* into v_contact from public.contacts c
    where c.id = v_send.contact_id and c.workspace_id = v_sequence.workspace_id;
    if not found or not exists (
      select 1 from public.contact_account_links l
      where l.contact_id = v_send.contact_id and l.target_account_id = v_sequence.target_account_id::uuid
        and l.ended_at is null) then
      v_blocked := 'contact_unlinked';
    -- ADR-0014: um Destino que o Contato não tem mais (ou que deixou de usar WhatsApp, ou outro perfil) não sai nem
    -- para o antigo nem para outro: o passo espera a reconfirmação.
    elsif v_send.channel = 'whatsapp' and not private.contact_has_whatsapp_phone(v_contact.id, v_send.destination) then
      v_blocked := 'destination_changed';
    elsif v_send.channel = 'linkedin' and v_contact.linkedin is distinct from v_send.destination then
      v_blocked := 'destination_changed';
    end if;
    if v_blocked is not null then
      update private.sequence_step_sends set
        status = 'awaiting_reconfirmation', claimed_until = null,
        last_error = v_blocked, last_error_at = now(), updated_at = now()
      where id = v_send.id;
    end if;
  end if;

  -- O tipo do envio para os limites. No LinkedIn vale a intenção do passo (convite ou mensagem); a Unipile só decide
  -- na hora se a pessoa já é conexão. No WhatsApp, a primeira mensagem a um número por esta Conta é "contato novo".
  if v_blocked is null then
    v_kind := case v_send.channel
      when 'linkedin' then case when coalesce(v_step ->> 'subtipoLinkedIn', 'convite') = 'convite'
        then 'linkedin_invite' else 'linkedin_message' end
      else case when exists (
        select 1 from private.sequence_step_sends p
        where p.sender_account_id = v_sender.id and p.channel = 'whatsapp' and p.destination = v_send.destination
          and p.status in ('sent', 'uncertain') and p.id <> v_send.id) then 'whatsapp_message' else 'whatsapp_new_contact' end
    end;
  end if;

  -- O ritmo da Conta remetente: o intervalo desde o último envio e os limites do dia e da semana. O passo automático
  -- vai para o próximo horário possível, com o motivo; o pedido à mão do titular só recebe a resposta.
  if v_blocked is null and v_pace then
    select g.reason, g.retry_at into v_gate_reason, v_gate_at
    from private.company_entry_gate(v_sender.id, v_sequence.workspace_id, v_send.channel, v_sequence.target_account_id, v_window) g;
    if v_gate_reason is null then
      select g.reason, g.retry_at into v_gate_reason, v_gate_at
      from private.send_rate_gate(v_sender.id, v_sequence.workspace_id, v_send.channel, v_kind, v_window) g;
    end if;
    if v_gate_reason is not null then
      if p_due_only then
        update private.sequence_step_sends set
          scheduled_for = v_gate_at, claimed_until = null, deferred_reason = v_gate_reason, updated_at = now()
        where id = v_send.id;
      end if;
      v_blocked := v_gate_reason;
    end if;
  end if;

  -- Um bloqueio que deixa o passo programado fica gravado com o motivo, e o Executor só tenta de novo em 15 minutos.
  if v_blocked in ('sender_not_ready', 'owner_not_responsible', 'step_missing', 'channel_not_enabled') and p_due_only then
    update private.sequence_step_sends set
      last_error = v_blocked, last_error_at = now(), claimed_until = now() + interval '15 minutes', updated_at = now()
    where id = v_send.id and status = 'scheduled';
  end if;

  -- ADR-0031: a retenção por resposta da Conta é a última recusa, depois de todas as outras e logo antes de marcar o
  -- envio como sending. Envio já em trânsito ou já aceito pelo provedor é só auditado, sem repetição.
  if v_blocked is null or v_blocked in ('in_flight', 'already_sent', 'reconcile_required') then
    v_retention := private.guard_reply_retention(v_send.id);
    if v_blocked is null then
      v_blocked := v_retention;
    end if;
  end if;

  if v_blocked is not null then
    return query select v_blocked, v_send.id, null::text, null::text, null::text, null::text,
      null::text, null::text, null::text, null::text, null::boolean, null::integer;
    return;
  end if;

  -- A conversa já aberta com este Contato por esta Conta remetente, se houver, e o convite que já saiu.
  select p.provider_chat_id, p.provider_user_id into v_chat_id, v_user_ref
  from private.sequence_step_sends p
  where p.sequence_id = v_sequence.id and p.contact_id = v_send.contact_id and p.id <> v_send.id
    and p.sender_account_id = v_sender.id and p.channel = v_send.channel
    and p.status in ('sent', 'uncertain') and (p.provider_chat_id is not null or p.provider_user_id is not null)
  order by coalesce(p.sent_at, p.sending_at) desc
  limit 1;
  if v_send.channel = 'linkedin' then
    v_invite_sent := exists (
      select 1 from private.sequence_step_sends p
      where p.sequence_id = v_sequence.id and p.contact_id = v_send.contact_id and p.id <> v_send.id
        and p.channel = 'linkedin' and p.linkedin_action = 'convite' and p.status in ('sent', 'uncertain'));
  end if;

  -- As variáveis do passo saem preenchidas, como na pré-visualização.
  select a.* into v_account from public.target_accounts a where a.id::text = v_sequence.target_account_id;
  select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(u.raw_user_meta_data ->> 'name'), ''), u.email)
    into v_owner_name from auth.users u where u.id = p_user_id;
  v_body := private.render_step_template(coalesce(v_step ->> 'corpo', ''), v_account, v_contact, v_owner_name);

  -- O que sai fica guardado no Envio: o histórico do passo não depende do documento editado depois.
  update private.sequence_step_sends set
    status = 'sending', sender_account_id = v_sender.id, attempts = attempts + 1,
    sending_at = now(), claimed_until = null, body = v_body, rate_kind = v_kind, deferred_reason = null, updated_at = now()
  where id = v_send.id;
  if v_pace then
    perform private.start_sender_pause(v_sender.id, v_sequence.workspace_id, v_send.channel);
  end if;

  return query select 'released', v_send.id, v_send.channel, v_sender.unipile_account_id, v_send.destination,
    v_contact.name, v_body,
    case when v_send.channel = 'linkedin' then coalesce(v_step ->> 'subtipoLinkedIn', 'convite') end,
    v_chat_id, v_user_ref, v_invite_sent, private.linkedin_invite_note_limit();
end;
$$;

revoke all on function private.release_chat_step_send(uuid, uuid, boolean) from public, anon, authenticated, service_role;

-- -------------------------------------------------------------------------------------------------------------
-- Retomar. A partir da definição de 20260927013000; muda só a retenção aberta ao voltar para ativa.
-- -------------------------------------------------------------------------------------------------------------

create or replace function public.update_owned_sequence(
  p_sequence_id uuid,
  p_private_document jsonb,
  p_public_summary jsonb,
  p_status text
) returns public.sequences
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_sequence public.sequences;
  v_previous_status text;
  v_auth private.sequence_authorizations;
  v_hold private.sequence_reply_holds;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select s.* into v_sequence
  from public.sequences s
  where s.id = p_sequence_id
    and s.owner_user_id = v_user_id
    and exists (
      select 1 from public.workspace_memberships m
      where m.workspace_id = s.workspace_id and m.user_id = v_user_id and m.active
    )
  for update of s;

  if not found then
    raise exception 'sequence not found or not owned by active user' using errcode = '42501';
  end if;
  v_previous_status := v_sequence.status;

  if p_private_document is not null then
    perform private.validate_sequence_document(v_sequence.workspace_id, v_sequence.target_account_id, p_private_document);
  end if;

  -- ADR-0031: retomar explicitamente é a decisão "continuar" do Vendedor responsável sobre as respostas registradas até
  -- agora. Fica registrada e fecha a retenção desta Sequência; quem não é o responsável continua recusado. Retomar não
  -- envia nada: cada passo segue as regras de liberação de sempre.
  if p_status = 'ativa' and v_previous_status is distinct from 'ativa' then
    perform private.lock_account_retention(v_sequence.workspace_id, v_sequence.target_account_id);
    select h.* into v_hold from private.sequence_reply_holds h
    where h.sequence_id = p_sequence_id and h.open
    for update;
    if found then
      if not private.reply_hold_owner(p_sequence_id) then
        raise exception 'account retained pending reply review' using errcode = '55006';
      end if;
      update private.sequence_reply_holds set open = false, resolved_at = now()
      where sequence_id = p_sequence_id;
      insert into private.sequence_retention_decisions (
        sequence_id, workspace_id, actor_user_id, decision, reviewed_version, reviewed_reply_ids, outcome
      ) values (
        p_sequence_id, v_sequence.workspace_id, v_user_id, 'continue', v_hold.version,
        private.pending_reply_ids(p_sequence_id, v_hold.opened_at), 'resumed'
      );
    end if;
  end if;

  update public.sequences s
  set public_summary = coalesce(p_public_summary, s.public_summary),
      status = coalesce(p_status, s.status),
      updated_at = now()
  where s.id = p_sequence_id
  returning s.* into v_sequence;

  if p_private_document is not null then
    update private.sequence_documents d
    set document = p_private_document, updated_at = now()
    where d.sequence_id = v_sequence.id and d.owner_user_id = v_user_id;

    -- Os passos já enviados guardam o que saiu; mudar um pendente exige nova ativação.
    select a.* into v_auth from private.sequence_authorizations a
    where a.sequence_id = v_sequence.id and a.revoked_at is null
    for update;
    if found and private.pending_steps_signature(v_sequence.id, v_auth.document)
        is distinct from private.pending_steps_signature(v_sequence.id, p_private_document) then
      update private.sequence_authorizations set revoked_at = now(), revoked_reason = 'edited'
      where id = v_auth.id;
      update private.sequence_step_sends set
        status = 'cancelled', scheduled_for = null, claimed_until = null, updated_at = now()
      where authorization_id = v_auth.id and private.send_is_cancellable(status);
    end if;
  end if;

  if v_previous_status <> 'ativa' and v_sequence.status = 'ativa' then
    perform private.resume_schedule(v_sequence.id);
  end if;

  return v_sequence;
end;
$$;


-- -------------------------------------------------------------------------------------------------------------
-- Apagar. A resposta correlacionada sai junto com o e-mail ou a mensagem recebida (apagar a Conta-alvo, o Contato
-- ou o Workspace já apaga essas linhas). O Contato apagado deixa contact_id vazio. Retenções, decisões e
-- auditorias guardam só ids, como a responsabilidade comercial, e saem quando a Sequência ou o Envio sai.
-- -------------------------------------------------------------------------------------------------------------

create function private.forget_correlated_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.sequence_correlated_replies r
  where r.source_kind = tg_argv[0] and r.source_id = old.interaction_id;
  return old;
end;
$$;

revoke all on function private.forget_correlated_reply() from public, anon, authenticated;

create trigger received_emails_forget_correlated_reply
  after delete on private.received_emails
  for each row execute function private.forget_correlated_reply('email');

create trigger received_chat_messages_forget_correlated_reply
  after delete on private.received_chat_messages
  for each row execute function private.forget_correlated_reply('chat');

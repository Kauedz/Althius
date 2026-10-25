-- Retomada por Contato após revisão de respostas, com guarda local e evidência humana de não contato.

alter table private.sequence_retention_decisions
  add column selected_contact_ids uuid[] not null default '{}'::uuid[];

create table private.sequence_contact_holds (
  sequence_id uuid not null references public.sequences(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  paused boolean not null default true,
  reason text not null check (reason = 'not_selected_after_reply_review'),
  actor_user_id uuid not null references auth.users(id),
  reviewed_version bigint not null,
  updated_at timestamptz not null default now(),
  primary key (sequence_id, contact_id)
);
alter table private.sequence_contact_holds enable row level security;
revoke all on private.sequence_contact_holds from public, anon, authenticated;
grant all on private.sequence_contact_holds to service_role;

create table private.sequence_no_contact_evidence (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.sequences(id) on delete cascade,
  workspace_id uuid not null,
  contact_suppression_id uuid not null references public.contact_suppressions(id) on delete cascade,
  interaction_id uuid not null references public.account_interactions(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (sequence_id, interaction_id)
);
alter table private.sequence_no_contact_evidence enable row level security;
revoke all on private.sequence_no_contact_evidence from public, anon, authenticated;
grant all on private.sequence_no_contact_evidence to service_role;

create function private.sequence_contact_is_paused(p_sequence_id uuid, p_contact_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.sequence_contact_holds h
    where h.sequence_id = p_sequence_id and h.contact_id = p_contact_id and h.paused
  );
$$;
revoke all on function private.sequence_contact_is_paused(uuid, uuid) from public, anon, authenticated;

alter function public.list_sequence_reply_review(uuid) rename to list_sequence_reply_review_core;
revoke all on function public.list_sequence_reply_review_core(uuid) from public, anon, authenticated;
create function public.list_sequence_reply_review(p_sequence_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_review jsonb;
  v_paused jsonb := '[]'::jsonb;
begin
  v_review := public.list_sequence_reply_review_core(p_sequence_id);
  if coalesce((v_review ->> 'can_decide')::boolean, false) then
    select coalesce(jsonb_agg(h.contact_id order by h.contact_id), '[]'::jsonb)
      into v_paused
    from private.sequence_contact_holds h
    where h.sequence_id = p_sequence_id and h.paused;
  end if;
  return v_review || jsonb_build_object('paused_contacts', v_paused);
end;
$$;
revoke all on function public.list_sequence_reply_review(uuid) from public, anon;
grant execute on function public.list_sequence_reply_review(uuid) to authenticated;

-- A resposta pode voltar a reter a Conta inteira; só o titular fecha a revisão e fixa a seleção.
drop function public.decide_sequence_retention(uuid, text, bigint, uuid[]);
create function public.decide_sequence_retention(
  p_sequence_id uuid,
  p_decision text,
  p_reviewed_version bigint,
  p_reviewed_reply_ids uuid[],
  p_selected_contact_ids uuid[]
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
  v_selected uuid[] := coalesce(p_selected_contact_ids, '{}'::uuid[]);
  v_all_contacts uuid[];
  v_summary jsonb;
  v_reason text;
  v_outcome text;
  v_contact_id uuid;
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
  if not found or not v_hold.open then
    return query select 'not_open'::text, coalesce(v_hold.version, 0)::bigint;
    return;
  end if;

  v_pending := private.pending_reply_ids(p_sequence_id, v_hold.opened_at);
  if v_hold.version is distinct from p_reviewed_version
     or not private.same_uuid_set(v_pending, p_reviewed_reply_ids) then
    return query select 'stale'::text, v_hold.version;
    return;
  end if;

  select coalesce(array_agg(distinct participant.contact_id::uuid), '{}'::uuid[])
    into v_all_contacts
  from private.sequence_documents d
  cross join lateral jsonb_array_elements_text(coalesce(d.document -> 'participantesIds', '[]'::jsonb)) participant(contact_id)
  where d.sequence_id = p_sequence_id;
  if p_decision = 'continue' and cardinality(v_selected) = 0 then
    raise exception 'at least one contact must be selected to continue' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_selected) c where not (c = any(v_all_contacts))) then
    raise exception 'selected contact is not part of this sequence' using errcode = '22023';
  end if;
  if cardinality(v_selected) <> (select count(distinct c) from unnest(v_selected) c) then
    raise exception 'selected contacts must be unique' using errcode = '22023';
  end if;

  if p_decision = 'pause' then
    update private.sequence_reply_holds set state = 'decided_pause' where sequence_id = p_sequence_id;
    update private.sequence_documents d
    set document = d.document || jsonb_build_object('motivoPause', 'Pausa decidida após resposta'),
        updated_at = pg_catalog.now()
    where d.sequence_id = p_sequence_id
      and coalesce(d.document ->> 'motivoPause', '') is distinct from 'Descadastro';
    insert into private.sequence_retention_decisions (
      sequence_id, workspace_id, actor_user_id, decision, reviewed_version, reviewed_reply_ids,
      selected_contact_ids, outcome
    ) values (
      p_sequence_id, v_sequence.workspace_id, v_user_id, 'pause', v_hold.version, v_pending, v_selected, 'paused'
    );
    return query select 'paused'::text, v_hold.version;
    return;
  end if;

  -- A seleção vira retenção local por Contato. O Executor revalida essa guarda e a supressão em cada liberação.
  foreach v_contact_id in array v_all_contacts loop
    insert into private.sequence_contact_holds (
      sequence_id, contact_id, paused, reason, actor_user_id, reviewed_version, updated_at
    ) values (
      p_sequence_id, v_contact_id, not (v_contact_id = any(v_selected)),
      'not_selected_after_reply_review', v_user_id, v_hold.version, pg_catalog.now()
    ) on conflict (sequence_id, contact_id) do update set
      paused = excluded.paused, reason = excluded.reason, actor_user_id = excluded.actor_user_id,
      reviewed_version = excluded.reviewed_version, updated_at = excluded.updated_at;
  end loop;

  update private.sequence_reply_holds set open = false, resolved_at = pg_catalog.now()
  where sequence_id = p_sequence_id;

  if v_sequence.suspended_reason is not null
     or exists (select 1 from private.sequence_sender_holds h where h.sequence_id = p_sequence_id) then
    v_outcome := 'reviewed_other_hold';
  else
    select s.public_summary into v_summary from public.sequences s where s.id = p_sequence_id;
    perform public.update_owned_sequence(
      p_sequence_id, null, coalesce(v_summary, '{}'::jsonb) || jsonb_build_object('status', 'ativa'), 'ativa'
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
    sequence_id, workspace_id, actor_user_id, decision, reviewed_version, reviewed_reply_ids,
    selected_contact_ids, outcome
  ) values (
    p_sequence_id, v_sequence.workspace_id, v_user_id, 'continue', v_hold.version, v_pending, v_selected, v_outcome
  );
  return query select v_outcome, v_hold.version;
end;
$$;
revoke all on function public.decide_sequence_retention(uuid, text, bigint, uuid[], uuid[]) from public, anon;
grant execute on function public.decide_sequence_retention(uuid, text, bigint, uuid[], uuid[]) to authenticated;

-- RPC compatível com clientes anteriores: continuar sem seleção explícita equivale a escolher todos os Contatos.
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
  v_all_contacts uuid[];
begin
  select coalesce(array_agg(distinct participant.contact_id::uuid), '{}'::uuid[])
    into v_all_contacts
  from private.sequence_documents d
  cross join lateral jsonb_array_elements_text(coalesce(d.document -> 'participantesIds', '[]'::jsonb)) participant(contact_id)
  where d.sequence_id = p_sequence_id;
  return query select * from public.decide_sequence_retention(
    p_sequence_id, p_decision, p_reviewed_version, p_reviewed_reply_ids, v_all_contacts
  );
end;
$$;
revoke all on function public.decide_sequence_retention(uuid, text, bigint, uuid[]) from public, anon;
grant execute on function public.decide_sequence_retention(uuid, text, bigint, uuid[]) to authenticated;

-- Descadastro registrado continua sendo uma guarda absoluta. O humano pode confirmar um pedido textual ambíguo
-- citando a resposta privada que leu; a resposta e seu remetente são buscados no servidor, nunca aceitos do cliente.
create function public.confirm_sequence_no_contact(p_sequence_id uuid, p_interaction_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_sequence public.sequences;
  v_reply private.received_emails;
  v_suppression public.contact_suppressions;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not private.reply_hold_owner(p_sequence_id) then
    raise exception 'sequence not found or not owned by active user' using errcode = '42501';
  end if;
  select s.* into v_sequence from public.sequences s where s.id = p_sequence_id for update;
  select r.* into v_reply from private.received_emails r
  where r.interaction_id = p_interaction_id and r.sequence_id = p_sequence_id
    and r.workspace_id = v_sequence.workspace_id and r.contact_id is not null;
  if not found then
    raise exception 'reply evidence does not belong to this sequence' using errcode = '22023';
  end if;

  perform private.register_suppression(
    v_reply.workspace_id, v_reply.from_email, v_reply.contact_id, v_reply.send_id, 'manual', v_user_id
  );
  select s.* into v_suppression from public.contact_suppressions s
  where s.workspace_id = v_reply.workspace_id and s.kind = 'email' and s.value = lower(btrim(v_reply.from_email));
  insert into private.sequence_no_contact_evidence (
    sequence_id, workspace_id, contact_suppression_id, interaction_id, actor_user_id
  ) values (p_sequence_id, v_reply.workspace_id, v_suppression.id, p_interaction_id, v_user_id)
  on conflict (sequence_id, interaction_id) do nothing;
  return 'suppressed';
end;
$$;
revoke all on function public.confirm_sequence_no_contact(uuid, uuid) from public, anon;
grant execute on function public.confirm_sequence_no_contact(uuid, uuid) to authenticated;

-- Preserva as validações existentes de Destino, descadastro, variáveis e token de saída e acrescenta a pausa local.
alter function private.release_step_send(uuid, uuid, boolean) rename to release_step_send_with_guards;
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
#variable_conflict use_column
declare
  v_send private.sequence_step_sends;
  v_sequence_id uuid;
  v_released record;
begin
  select e.* into v_send from private.sequence_step_sends e where e.id = p_send_id;
  if found then
    v_sequence_id := v_send.sequence_id;
    -- Mesmo lock primeiro da decisão: a seleção e a liberação não passam uma pela outra.
    perform 1 from public.sequences s where s.id = v_sequence_id for update;
    select e.* into v_send from private.sequence_step_sends e where e.id = p_send_id for update;
    if private.sequence_contact_is_paused(v_send.sequence_id, v_send.contact_id) then
      return query select 'contact_paused', v_send.id, null::text, null::text, null::text,
        null::text, null::text, null::text, null::text, null::text, null::text;
      return;
    end if;
  end if;

  return query select * from private.release_step_send_with_guards(p_send_id, p_user_id, p_due_only);
end;
$$;
revoke all on function private.release_step_send(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function private.release_step_send_with_guards(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function private.release_step_send_core(uuid, uuid, boolean) from public, anon, authenticated;

create or replace function public.release_sequence_step_send(p_send_id uuid, p_user_id uuid)
returns table (
  outcome text, send_id uuid, unipile_account_id text, destination text, contact_name text,
  subject text, body text, reply_to_message_id text,
  tracking_header_name text, tracking_header_value text, unsubscribe_token text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from private.sequence_step_sends e where e.id = p_send_id and e.channel <> 'email') then
    return query select 'wrong_channel', p_send_id, null::text, null::text, null::text,
      null::text, null::text, null::text, null::text, null::text, null::text;
    return;
  end if;
  return query select * from private.release_step_send(p_send_id, p_user_id, false);
end;
$$;

create or replace function public.release_due_step_send(p_send_id uuid)
returns table (
  outcome text, send_id uuid, unipile_account_id text, destination text, contact_name text,
  subject text, body text, reply_to_message_id text,
  tracking_header_name text, tracking_header_value text, unsubscribe_token text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from private.sequence_step_sends e where e.id = p_send_id and e.channel <> 'email') then
    return query select 'wrong_channel', p_send_id, null::text, null::text, null::text,
      null::text, null::text, null::text, null::text, null::text, null::text;
    return;
  end if;
  return query select r.* from private.sequence_step_sends e,
    lateral private.release_step_send(e.id, e.owner_user_id, true) r
  where e.id = p_send_id;
end;
$$;
revoke all on function public.release_sequence_step_send(uuid, uuid) from public, anon, authenticated;
grant execute on function public.release_sequence_step_send(uuid, uuid) to service_role;
revoke all on function public.release_due_step_send(uuid) from public, anon, authenticated;
grant execute on function public.release_due_step_send(uuid) to service_role;

-- O Executor de chat usa a mesma guarda antes de chamar o núcleo de liberação do canal.
alter function private.release_chat_step_send(uuid, uuid, boolean) rename to release_chat_step_send_core;
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
  v_send private.sequence_step_sends;
  v_sequence_id uuid;
begin
  select e.* into v_send from private.sequence_step_sends e where e.id = p_send_id;
  if found then
    v_sequence_id := v_send.sequence_id;
    perform 1 from public.sequences s where s.id = v_sequence_id for update;
    select e.* into v_send from private.sequence_step_sends e where e.id = p_send_id for update;
    if private.sequence_contact_is_paused(v_send.sequence_id, v_send.contact_id) then
      return query select 'contact_paused', v_send.id, v_send.channel, null::text, null::text, null::text,
        null::text, null::text, null::text, null::text, null::boolean, null::integer;
      return;
    end if;
  end if;
  return query select * from private.release_chat_step_send_core(p_send_id, p_user_id, p_due_only);
end;
$$;
revoke all on function private.release_chat_step_send(uuid, uuid, boolean) from public, anon, authenticated, service_role;
revoke all on function private.release_chat_step_send_core(uuid, uuid, boolean) from public, anon, authenticated, service_role;

-- Recria wrappers SQL após a renomeação: referências já compiladas apontariam para o núcleo antigo.
create or replace function public.release_chat_step_send(p_send_id uuid, p_user_id uuid)
returns table (
  outcome text, send_id uuid, channel text, unipile_account_id text, destination text, contact_name text,
  body text, linkedin_subtype text, provider_chat_id text, provider_user_id text,
  invite_sent boolean, invite_note_limit integer
)
language sql
security definer
set search_path = ''
as $$
  select * from private.release_chat_step_send(p_send_id, p_user_id, false);
$$;

create or replace function public.release_due_chat_step_send(p_send_id uuid)
returns table (
  outcome text, send_id uuid, channel text, unipile_account_id text, destination text, contact_name text,
  body text, linkedin_subtype text, provider_chat_id text, provider_user_id text,
  invite_sent boolean, invite_note_limit integer
)
language sql
security definer
set search_path = ''
as $$
  select r.* from private.sequence_step_sends e,
    lateral private.release_chat_step_send(e.id, e.owner_user_id, true) r
  where e.id = p_send_id;
$$;
revoke all on function public.release_chat_step_send(uuid, uuid) from public, anon;
grant execute on function public.release_chat_step_send(uuid, uuid) to service_role;
revoke all on function public.release_due_chat_step_send(uuid) from public, anon;
grant execute on function public.release_due_chat_step_send(uuid) to service_role;

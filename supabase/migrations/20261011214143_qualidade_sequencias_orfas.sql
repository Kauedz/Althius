-- CRM-17 / Qualidade P2 D. Não reescreve legado, não apaga dados e não altera o executor.
create function private.diagnose_sequence_orphans()
returns table(sequence_id uuid, workspace_id uuid, reason text)
language sql stable security invoker set search_path = '' as $$
  select q.id, q.workspace_id, q.reason from (
    select s.id, s.workspace_id, case
      when s.account_id is null then 'invalid_account_id'
      when a.id is null then 'account_missing'
      when a.deleted_at is not null then 'account_deleted'
      when a.archived_at is not null and (s.status <> 'pausada' or s.suspended_reason is distinct from 'account_archived') then 'account_archived'
      when r.owner_user_id is distinct from s.owner_user_id then 'owner_not_responsible'
      when exists (
        select 1 from private.sequence_authorizations v where v.sequence_id=s.id and v.revoked_at is null
        and case when jsonb_typeof(v.document->'steps')='array' then jsonb_array_length(v.document->'steps')=0 else true end
      ) then 'authorization_without_steps'
    end as reason
    from public.sequences s
    left join public.target_accounts a on a.workspace_id=s.workspace_id and a.id=s.account_id
    left join public.sales_responsibilities r on r.workspace_id=s.workspace_id and r.target_account_id=s.target_account_id
    where s.status <> 'encerrada'
  ) q where q.reason is not null;
$$;
revoke all on function private.diagnose_sequence_orphans() from public, anon, authenticated;
grant execute on function private.diagnose_sequence_orphans() to service_role;

-- Fecha a escrita direta que não passava pela RPC de criação. FOR SHARE serializa com arquivar/apagar.
create function private.guard_sequence_account_availability()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_account public.target_accounts;
begin
  -- A limpeza precisa poder pausar uma linha legada inválida; encerramento também permanece disponível.
  if new.status in ('pausada','encerrada') then return new; end if;
  select a.* into v_account from public.target_accounts a
  where a.workspace_id=new.workspace_id and a.id=case
    when new.target_account_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then new.target_account_id::uuid end for share;
  if not found or v_account.deleted_at is not null or v_account.archived_at is not null then
    raise exception 'sequence target account is unavailable' using errcode='55006';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_sequence_account_availability() from public, anon, authenticated, service_role;
create trigger sequences_guard_account_availability
before insert or update of status, workspace_id, target_account_id on public.sequences
for each row execute function private.guard_sequence_account_availability();

create table private.sequence_orphan_cleanup_events (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.sequences(id),
  reason text not null,
  previous_status text not null,
  action text not null check(action='paused'),
  performed_at timestamptz not null default now(),
  performed_by text not null default session_user
);
alter table private.sequence_orphan_cleanup_events enable row level security;
revoke all on private.sequence_orphan_cleanup_events from public, anon, authenticated;
grant select on private.sequence_orphan_cleanup_events to service_role;

-- Operação administrativa explícita, atômica e auditada. Nunca é chamada pelo diagnóstico ou por migration.
create function private.pause_orphan_sequence(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_sequence public.sequences;
  v_reason text;
  v_rows integer;
  v_changed boolean := false;
  v_event uuid;
begin
  select s.* into v_sequence from public.sequences s where s.id=p_id for update;
  if not found then raise exception 'sequence not found' using errcode='P0002'; end if;
  select d.reason into v_reason from private.diagnose_sequence_orphans() d where d.sequence_id=p_id;
  if v_reason is null then return jsonb_build_object('sequence_id',p_id,'action','unchanged'); end if;
  update private.sequence_authorizations set revoked_at=now(), revoked_reason='edited'
  where sequence_id=p_id and revoked_at is null;
  get diagnostics v_rows = row_count;
  v_changed := v_rows > 0;
  update private.sequence_step_sends set status='cancelled', scheduled_for=null, claimed_until=null, updated_at=now()
  where sequence_id=p_id and private.send_is_cancellable(status);
  get diagnostics v_rows = row_count;
  v_changed := v_changed or v_rows > 0;
  if v_sequence.status <> 'pausada' or (v_reason='account_archived' and v_sequence.suspended_reason is distinct from 'account_archived') then
    update public.sequences set status='pausada',
      suspended_reason=case when v_reason='account_archived' then 'account_archived' else suspended_reason end,
      public_summary=public_summary || jsonb_build_object('status','pausada'), updated_at=now()
    where id=p_id;
    v_changed := true;
  end if;
  if not v_changed then return jsonb_build_object('sequence_id',p_id,'reason',v_reason,'action','unchanged'); end if;
  insert into private.sequence_orphan_cleanup_events(sequence_id,reason,previous_status,action)
  values(p_id,v_reason,v_sequence.status,'paused') returning id into v_event;
  return jsonb_build_object('sequence_id',p_id,'reason',v_reason,'action','paused','event_id',v_event);
end;
$$;
revoke all on function private.pause_orphan_sequence(uuid) from public, anon, authenticated;
grant execute on function private.pause_orphan_sequence(uuid) to service_role;

-- Contas remetentes pessoais conectadas pela Hosted Auth da Unipile v1.
-- As identidades externas e tentativas ficam em schema privado e nunca são
-- acessíveis diretamente pelo Data API.

create table private.sender_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_user_id uuid not null references auth.users(id),
  channel text not null check (channel in ('email', 'whatsapp', 'linkedin')),
  unipile_account_id text not null unique,
  provider text not null,
  status text not null check (status in (
    'connecting', 'syncing', 'ready', 'reconnect_required', 'disconnected'
  )),
  reconciliation_required boolean not null default false,
  last_status_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, owner_user_id)
    references public.workspace_memberships(workspace_id, user_id)
);

create table private.sender_connection_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_user_id uuid not null references auth.users(id),
  channel text not null check (channel in ('email', 'whatsapp', 'linkedin')),
  expected_provider text not null,
  reconnect_sender_account_id uuid references private.sender_accounts(id),
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'failed', 'expired')),
  expires_at timestamptz not null default now() + interval '30 minutes',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (workspace_id, owner_user_id)
    references public.workspace_memberships(workspace_id, user_id)
);

create index sender_accounts_owner_workspace_idx
  on private.sender_accounts (workspace_id, owner_user_id, channel);
create index sender_connection_attempts_expiry_idx
  on private.sender_connection_attempts (expires_at)
  where status = 'pending';

alter table private.sender_accounts enable row level security;
alter table private.sender_connection_attempts enable row level security;
revoke all on private.sender_accounts from public, anon, authenticated;
revoke all on private.sender_connection_attempts from public, anon, authenticated;
grant all on private.sender_accounts to service_role;
grant all on private.sender_connection_attempts to service_role;

create or replace function public.create_sender_connection_attempt(
  p_workspace_id uuid,
  p_channel text,
  p_reconnect_sender_account_id uuid default null
) returns table (attempt_id uuid, provider text, provider_account_id text)
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_provider text;
  v_account_id text;
  v_attempt_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_channel not in ('email', 'whatsapp', 'linkedin') then
    raise exception 'unsupported sender channel' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = p_workspace_id and m.user_id = v_user_id and m.active
  ) then
    raise exception 'active workspace membership required' using errcode = '42501';
  end if;

  update private.sender_connection_attempts
  set status = 'expired'
  where owner_user_id = v_user_id and status = 'pending' and expires_at <= now();

  v_provider := case p_channel
    when 'email' then 'EMAIL'
    when 'whatsapp' then 'WHATSAPP'
    when 'linkedin' then 'LINKEDIN'
  end;

  if p_reconnect_sender_account_id is not null then
    select a.unipile_account_id, a.provider into v_account_id, v_provider
    from private.sender_accounts a
    where a.id = p_reconnect_sender_account_id
      and a.workspace_id = p_workspace_id
      and a.owner_user_id = v_user_id
      and a.channel = p_channel;
    if v_account_id is null then
      raise exception 'sender account not found or not owned by active user'
        using errcode = '42501';
    end if;
  end if;

  insert into private.sender_connection_attempts (
    workspace_id, owner_user_id, channel, expected_provider,
    reconnect_sender_account_id
  ) values (
    p_workspace_id, v_user_id, p_channel, v_provider,
    p_reconnect_sender_account_id
  ) returning id into v_attempt_id;

  return query select v_attempt_id, v_provider, v_account_id;
end;
$$;

revoke all on function public.create_sender_connection_attempt(uuid, text, uuid)
  from public, anon;
grant execute on function public.create_sender_connection_attempt(uuid, text, uuid)
  to authenticated;

create or replace function public.list_owned_sender_accounts(p_workspace_id uuid)
returns table (
  id uuid, channel text, provider text, status text, reconciliation_required boolean,
  last_status_at timestamptz, created_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = p_workspace_id and m.user_id = v_user_id and m.active
  ) then
    raise exception 'active workspace membership required' using errcode = '42501';
  end if;
  return query
    select a.id, a.channel, a.provider, a.status, a.reconciliation_required,
      a.last_status_at, a.created_at
    from private.sender_accounts a
    where a.workspace_id = p_workspace_id and a.owner_user_id = v_user_id
    order by a.channel, a.created_at;
end;
$$;

revoke all on function public.list_owned_sender_accounts(uuid) from public, anon;
grant execute on function public.list_owned_sender_accounts(uuid) to authenticated;

create or replace function public.get_owned_sender_account_for_disconnect(
  p_sender_account_id uuid,
  p_workspace_id uuid
) returns table (unipile_account_id text)
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  return query
    select a.unipile_account_id
    from private.sender_accounts a
    join public.workspace_memberships m
      on m.workspace_id = a.workspace_id and m.user_id = v_user_id and m.active
    where a.id = p_sender_account_id and a.workspace_id = p_workspace_id
      and a.owner_user_id = v_user_id;
  if not found then
    raise exception 'sender account not found or not owned by active user'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function public.mark_owned_sender_account_disconnected(
  p_sender_account_id uuid,
  p_owner_user_id uuid,
  p_workspace_id uuid
) returns boolean
language sql security definer set search_path = '' as $$
  update private.sender_accounts a
  set status = 'disconnected', last_status_at = now(), updated_at = now()
  where a.id = p_sender_account_id
    and a.owner_user_id = p_owner_user_id
    and a.workspace_id = p_workspace_id
    and exists (
      select 1 from public.workspace_memberships m
      where m.workspace_id = a.workspace_id and m.user_id = a.owner_user_id and m.active
    )
  returning true;
$$;

revoke all on function public.get_owned_sender_account_for_disconnect(uuid, uuid)
  from public, anon;
grant execute on function public.get_owned_sender_account_for_disconnect(uuid, uuid)
  to authenticated;
revoke all on function public.mark_owned_sender_account_disconnected(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.mark_owned_sender_account_disconnected(uuid, uuid, uuid)
  to service_role;

-- Somente Edge Functions/service_role podem associar callback externo ou
-- atualizar estado de ciclo de vida. A API Unipile é consultada antes da RPC.
create or replace function public.complete_sender_connection_attempt(
  p_attempt_id uuid,
  p_unipile_account_id text,
  p_provider text,
  p_initial_status text
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_attempt private.sender_connection_attempts;
  v_status text;
begin
  select * into v_attempt from private.sender_connection_attempts
  where id = p_attempt_id for update;
  if not found or v_attempt.status <> 'pending' or v_attempt.expires_at <= now() then
    return 'ignored';
  end if;
  if (v_attempt.channel = 'email' and p_provider not in ('GOOGLE', 'MICROSOFT', 'IMAP'))
    or (v_attempt.channel <> 'email' and p_provider <> v_attempt.expected_provider) then
    update private.sender_connection_attempts set status = 'failed' where id = p_attempt_id;
    return 'provider_mismatch';
  end if;
  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = v_attempt.workspace_id
      and m.user_id = v_attempt.owner_user_id and m.active
  ) then
    update private.sender_connection_attempts set status = 'failed' where id = p_attempt_id;
    return 'membership_revoked';
  end if;

  v_status := case p_initial_status
    when 'CREATION_SUCCESS' then 'syncing'
    when 'RECONNECTED' then 'syncing'
    else 'connecting'
  end;

  if v_attempt.reconnect_sender_account_id is not null then
    update private.sender_accounts a
    set status = v_status, reconciliation_required = true,
        last_status_at = now(), updated_at = now()
    where a.id = v_attempt.reconnect_sender_account_id
      and a.owner_user_id = v_attempt.owner_user_id
      and a.unipile_account_id = p_unipile_account_id
      and a.provider = p_provider;
    if not found then
      update private.sender_connection_attempts set status = 'failed' where id = p_attempt_id;
      return 'identity_mismatch';
    end if;
  else
    insert into private.sender_accounts (
      workspace_id, owner_user_id, channel, unipile_account_id, provider, status
    ) values (
      v_attempt.workspace_id, v_attempt.owner_user_id, v_attempt.channel,
      p_unipile_account_id, p_provider, v_status
    ) on conflict (unipile_account_id) do nothing;
    if not found then
      update private.sender_connection_attempts set status = 'failed' where id = p_attempt_id;
      return 'identity_already_linked';
    end if;
  end if;

  update private.sender_connection_attempts
  set status = 'completed', completed_at = now()
  where id = p_attempt_id;
  return 'completed';
end;
$$;

create or replace function public.apply_unipile_sender_status(
  p_unipile_account_id text,
  p_status text
) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_status in ('CREDENTIALS', 'ERROR', 'STOPPED') then
    update private.sender_accounts
    set status = 'reconnect_required', reconciliation_required = true,
        last_status_at = now(), updated_at = now()
    where unipile_account_id = p_unipile_account_id and status <> 'disconnected';
  elsif p_status in ('SYNC_SUCCESS', 'OK') then
    update private.sender_accounts
    set status = case when reconciliation_required then 'syncing' else 'ready' end,
        last_status_at = now(), updated_at = now()
    where unipile_account_id = p_unipile_account_id and status <> 'disconnected';
  elsif p_status in ('CONNECTING', 'CREATION_SUCCESS', 'RECONNECTED') then
    update private.sender_accounts
    set status = case when p_status = 'CONNECTING' then 'connecting' else 'syncing' end,
        last_status_at = now(), updated_at = now()
    where unipile_account_id = p_unipile_account_id
      and status not in ('ready', 'disconnected');
  elsif p_status = 'DELETED' then
    update private.sender_accounts
    set status = 'disconnected', last_status_at = now(), updated_at = now()
    where unipile_account_id = p_unipile_account_id;
  else
    return false;
  end if;
  return found;
end;
$$;

revoke all on function public.complete_sender_connection_attempt(uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.apply_unipile_sender_status(text, text)
  from public, anon, authenticated;
grant execute on function public.complete_sender_connection_attempt(uuid, text, text, text)
  to service_role;
grant execute on function public.apply_unipile_sender_status(text, text)
  to service_role;

comment on table private.sender_accounts is
  'Private personal sender identities. Only the owner-facing RPC returns safe connection status.';
comment on table private.sender_connection_attempts is
  'Short-lived Hosted Auth attempts. The random attempt UUID is sent to Unipile as the callback correlation name.';

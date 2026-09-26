-- A Unipile migrou para a v2: o provedor de e-mail antes chamado MICROSOFT passou a se chamar OUTLOOK
-- (GOOGLE e IMAP continuam com o mesmo nome). Nenhuma Conta remetente real foi conectada ainda, então
-- este é um ajuste de vocabulário, não uma migração de dados.
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
  if (v_attempt.channel = 'email' and p_provider not in ('GOOGLE', 'OUTLOOK', 'IMAP'))
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

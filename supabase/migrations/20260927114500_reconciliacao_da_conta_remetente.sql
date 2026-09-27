-- Reconciliação da Conta remetente depois de uma reconexão (canais-03). Uma conta que caiu (credenciais, erro)
-- ou foi reconectada fica com reconciliation_required, e a liberação de envios a recusa. Até aqui nada limpava a
-- marca: a conta ficava em "syncing" e os envios, bloqueados para sempre. Agora, quando a Unipile avisa que a conta
-- voltou e sincronizou, ela fica pronta para reconciliar; o Executor confere na Unipile as conversas das Sequências
-- ativas que saíram por ela (uma resposta perdida no período é gravada e pausa a Sequência) e só então a libera.

alter table private.sender_accounts
  -- Quando a Unipile avisou que a conta voltou e sincronizou depois da queda; null enquanto ela está fora.
  add column reconciliation_ready_at timestamptz,
  -- Reserva do Executor sobre a conta, para duas rodadas não reconciliarem a mesma conta ao mesmo tempo.
  add column reconciliation_claimed_until timestamptz;

-- Reconectar pela autenticação hospedada: a conta volta a exigir reconciliação e ainda não está pronta para ela.
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
    set status = v_status, reconciliation_required = true, reconciliation_ready_at = null,
        reconciliation_claimed_until = null, last_status_at = now(), updated_at = now()
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

-- O estado vindo da Unipile. Queda: exige reconciliação e não está pronta para ela. Volta sincronizada (SYNC_SUCCESS,
-- OK) de uma conta que exige reconciliação: continua "syncing", agora pronta para o Executor reconciliar.
create or replace function public.apply_unipile_sender_status(
  p_unipile_account_id text,
  p_status text
) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_status in ('CREDENTIALS', 'ERROR', 'STOPPED') then
    update private.sender_accounts
    set status = 'reconnect_required', reconciliation_required = true, reconciliation_ready_at = null,
        reconciliation_claimed_until = null, last_status_at = now(), updated_at = now()
    where unipile_account_id = p_unipile_account_id and status <> 'disconnected';
  elsif p_status in ('SYNC_SUCCESS', 'OK') then
    update private.sender_accounts
    set status = case when reconciliation_required then 'syncing' else 'ready' end,
        reconciliation_ready_at = case when reconciliation_required
          then coalesce(reconciliation_ready_at, now()) end,
        last_status_at = now(), updated_at = now()
    where unipile_account_id = p_unipile_account_id and status <> 'disconnected';
  elsif p_status in ('CONNECTING', 'CREATION_SUCCESS', 'RECONNECTED') then
    update private.sender_accounts
    set status = case when p_status = 'CONNECTING' then 'connecting' else 'syncing' end,
        reconciliation_ready_at = null,
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

-- Uma conta pronta para reconciliar e ainda não liberada. É o que o Executor reserva, e o que faz o banco chamá-lo.
create function private.sender_awaits_reconciliation(p_account private.sender_accounts)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_account.status = 'syncing' and p_account.reconciliation_required
    and p_account.reconciliation_ready_at is not null
    and (p_account.reconciliation_claimed_until is null or p_account.reconciliation_claimed_until < now());
$$;

revoke all on function private.sender_awaits_reconciliation(private.sender_accounts) from public, anon, authenticated;

-- O Executor reserva as contas a reconciliar por 5 minutos. claimed_at volta no fechamento: se a conta caiu e voltou
-- de novo durante a reconciliação, ela não é liberada por esta rodada.
create function public.claim_sender_reconciliations(p_limit integer default 3)
returns table (sender_account_id uuid, unipile_account_id text, owner_user_id uuid, claimed_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  with due as (
    select a.id from private.sender_accounts a
    where private.sender_awaits_reconciliation(a)
    order by a.reconciliation_ready_at
    limit greatest(1, least(coalesce(p_limit, 3), 10))
    for update of a skip locked
  )
  update private.sender_accounts a set reconciliation_claimed_until = now() + interval '5 minutes'
  from due
  where a.id = due.id
  returning a.id, a.unipile_account_id, a.owner_user_id, now();
end;
$$;

revoke all on function public.claim_sender_reconciliations(integer) from public, anon, authenticated;
grant execute on function public.claim_sender_reconciliations(integer) to service_role;

-- As conversas a conferir: por Sequência ativa e Contato, a do último e-mail que saiu por esta conta. Pausadas não
-- enviam nada, e a conferência antes de cada envio cobre a retomada.
create function public.conversations_to_reconcile(p_sender_account_id uuid)
returns table (send_id uuid, unipile_account_id text, provider_thread_id text, provider_email_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.unipile_account_id, c.provider_thread_id, c.provider_email_id
  from (
    select distinct on (e.sequence_id, e.contact_id)
      e.id, a.unipile_account_id, e.provider_thread_id, e.provider_email_id, e.sent_at
    from private.sequence_step_sends e
    join private.sender_accounts a on a.id = e.sender_account_id
    join public.sequences s on s.id = e.sequence_id and s.status = 'ativa'
    where e.sender_account_id = p_sender_account_id
      and e.status in ('sent', 'bounced', 'uncertain')
      and (e.provider_thread_id is not null or e.provider_email_id is not null)
    order by e.sequence_id, e.contact_id, e.sent_at desc nulls last
  ) c
  order by c.sent_at desc nulls last
  limit 200;
$$;

revoke all on function public.conversations_to_reconcile(uuid) from public, anon, authenticated;
grant execute on function public.conversations_to_reconcile(uuid) to service_role;

-- Todas as conversas conferidas: a conta volta a enviar. Só se continua pronta para reconciliar desde antes da
-- reserva (uma nova queda no meio pede outra rodada).
create function public.finish_sender_reconciliation(p_sender_account_id uuid, p_claimed_at timestamptz)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.sender_accounts set
    status = 'ready', reconciliation_required = false, reconciliation_ready_at = null,
    reconciliation_claimed_until = null, last_status_at = now(), updated_at = now()
  where id = p_sender_account_id and status = 'syncing' and reconciliation_required
    and reconciliation_ready_at is not null and reconciliation_ready_at <= p_claimed_at;
  return found;
end;
$$;

revoke all on function public.finish_sender_reconciliation(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.finish_sender_reconciliation(uuid, timestamptz) to service_role;

-- O relógio também chama o Executor quando há conta esperando reconciliação.
create or replace function private.kick_sequence_runner()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings private.sequence_runner_settings;
begin
  perform private.expire_stale_sends(null);
  select s.* into v_settings from private.sequence_runner_settings s;
  if v_settings.function_url is null then
    return false;
  end if;
  if not exists (
    select 1 from private.sequence_step_sends e
    join public.sequences q on q.id = e.sequence_id and q.status = 'ativa'
    join private.sequence_authorizations a on a.id = e.authorization_id and a.revoked_at is null
    where e.status = 'scheduled' and e.scheduled_for <= private.clock_now()
      and (e.claimed_until is null or e.claimed_until < now()))
    and not exists (select 1 from private.sender_accounts a where private.sender_awaits_reconciliation(a)) then
    return false;
  end if;
  perform private.post_to_sequence_runner(v_settings.function_url, v_settings.token);
  return true;
end;
$$;

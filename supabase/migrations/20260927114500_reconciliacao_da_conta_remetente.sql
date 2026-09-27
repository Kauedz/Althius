-- Reconciliação da Conta remetente depois de uma queda ou reconexão (canais-03). Uma conta que caiu (credenciais,
-- erro) ou foi reconectada fica com reconciliation_required, e a liberação de envios a recusa. Até aqui nada limpava
-- a marca: a conta ficava em "syncing" e os envios, bloqueados para sempre. Agora, quando a Unipile avisa que a conta
-- voltou e sincronizou, ela fica pronta para reconciliar. O Executor confere na Unipile, em páginas e guardando até
-- onde foi, a última conversa de cada Contato das Sequências que saíram por ela (uma resposta perdida é gravada e
-- pausa a Sequência) e só então a libera.

alter table private.sender_accounts
  -- Quando a Unipile avisou que a conta voltou e sincronizou depois da queda; null enquanto ela está fora.
  add column reconciliation_ready_at timestamptz,
  -- Reserva do Executor sobre a conta, para duas rodadas não reconciliarem a mesma conta ao mesmo tempo.
  add column reconciliation_claimed_until timestamptz,
  -- Até onde a reconciliação já conferiu (o envio e a data dele), para retomar dali na rodada seguinte.
  add column reconciliation_checked_at timestamptz,
  add column reconciliation_checked_send uuid;

-- Uma queda recomeça a reconciliação do zero: a conta não está pronta, ninguém a reserva e nada foi conferido.
-- Fica num gatilho para valer em todo caminho que derruba a conta (estado da Unipile, reconexão).
create function private.reset_sender_reconciliation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'reconnect_required' then
    new.reconciliation_ready_at := null;
    new.reconciliation_claimed_until := null;
  end if;
  if new.status = 'reconnect_required' or (new.reconciliation_required and not old.reconciliation_required) then
    new.reconciliation_checked_at := null;
    new.reconciliation_checked_send := null;
  end if;
  return new;
end;
$$;

revoke all on function private.reset_sender_reconciliation() from public, anon, authenticated;

create trigger sender_accounts_reset_reconciliation
  before update on private.sender_accounts
  for each row execute function private.reset_sender_reconciliation();

-- Provedores que fazem sincronização inicial na v2 (docs/initial-sync): só ficam prontos com o aviso dela.
create function private.provider_has_initial_sync(p_provider text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select upper(coalesce(p_provider, '')) in ('WHATSAPP', 'IMAP');
$$;

revoke all on function private.provider_has_initial_sync(text) from public, anon, authenticated;

-- Reconectar pela autenticação hospedada exige reconciliação. Um provedor sem sincronização inicial já volta pronto
-- para ela, na mesma operação: não depende de um segundo aviso que pode se perder. A reconexão não apaga um aviso de
-- volta que tenha chegado antes dela (os webhooks podem chegar fora de ordem).
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
        reconciliation_ready_at = case when private.provider_has_initial_sync(p_provider)
          then a.reconciliation_ready_at else coalesce(a.reconciliation_ready_at, now()) end,
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

-- O estado vindo da Unipile. A volta sincronizada (SYNC_SUCCESS, OK) de uma conta que exige reconciliação a deixa
-- pronta para o Executor; o resto do comportamento não muda (a queda é tratada pelo gatilho).
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
        reconciliation_ready_at = case when reconciliation_required
          then coalesce(reconciliation_ready_at, now()) end,
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

-- Uma conta de volta que ainda não foi liberada.
create function private.sender_is_reconciling(p_account private.sender_accounts)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_account.status = 'syncing' and p_account.reconciliation_required
    and p_account.reconciliation_ready_at is not null;
$$;

revoke all on function private.sender_is_reconciling(private.sender_accounts) from public, anon, authenticated;

-- ...e que nenhuma rodada do Executor está reconciliando agora. É o que ele reserva, e o que faz o banco chamá-lo.
create function private.sender_awaits_reconciliation(p_account private.sender_accounts)
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.sender_is_reconciling(p_account)
    and (p_account.reconciliation_claimed_until is null or p_account.reconciliation_claimed_until < now());
$$;

revoke all on function private.sender_awaits_reconciliation(private.sender_accounts) from public, anon, authenticated;

-- As contas presas antes desta migration (voltaram, mas nada as liberava) entram na fila da reconciliação.
update private.sender_accounts
set reconciliation_ready_at = now()
where status = 'syncing' and reconciliation_required and reconciliation_ready_at is null
  and not private.provider_has_initial_sync(provider);

-- O Executor reserva as contas a reconciliar por 5 minutos. claimed_at volta no progresso e no fechamento: se a
-- conta caiu e voltou de novo durante a reconciliação, esta rodada não grava nada nela.
create function public.claim_sender_reconciliations(p_limit integer default 3)
returns table (sender_account_id uuid, unipile_account_id text, claimed_at timestamptz)
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
  returning a.id, a.unipile_account_id, now();
end;
$$;

revoke all on function public.claim_sender_reconciliations(integer) from public, anon, authenticated;
grant execute on function public.claim_sender_reconciliations(integer) to service_role;

-- A próxima página de conversas a conferir: por Sequência e Contato, a do último e-mail que saiu por esta conta,
-- da mais antiga para a mais nova, a partir de onde a reconciliação parou. Pausadas também entram: a resposta que
-- chegou com a conta fora do ar fica registrada.
create function public.conversations_to_reconcile(p_sender_account_id uuid, p_limit integer default 25)
returns table (send_id uuid, provider_thread_id text, provider_email_id text, sent_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.provider_thread_id, c.provider_email_id, c.sent_at
  from (
    select distinct on (e.sequence_id, e.contact_id)
      e.id, e.provider_thread_id, e.provider_email_id, e.sent_at
    from private.sequence_step_sends e
    where e.sender_account_id = p_sender_account_id
      and e.status in ('sent', 'bounced', 'uncertain')
      and e.sent_at is not null
      and (e.provider_thread_id is not null or e.provider_email_id is not null)
    order by e.sequence_id, e.contact_id, e.sent_at desc
  ) c
  join private.sender_accounts a on a.id = p_sender_account_id
  where a.reconciliation_checked_at is null
    or (c.sent_at, c.id) > (a.reconciliation_checked_at, a.reconciliation_checked_send)
  order by c.sent_at, c.id
  limit greatest(1, least(coalesce(p_limit, 25), 100));
$$;

revoke all on function public.conversations_to_reconcile(uuid, integer) from public, anon, authenticated;
grant execute on function public.conversations_to_reconcile(uuid, integer) to service_role;

-- Uma página conferida: guarda até onde foi e renova a reserva. Não grava nada se a conta caiu depois da reserva.
create function public.record_reconciliation_progress(
  p_sender_account_id uuid,
  p_claimed_at timestamptz,
  p_checked_at timestamptz,
  p_checked_send uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.sender_accounts a set
    reconciliation_checked_at = p_checked_at,
    reconciliation_checked_send = p_checked_send,
    reconciliation_claimed_until = now() + interval '5 minutes',
    updated_at = now()
  where a.id = p_sender_account_id and private.sender_is_reconciling(a)
    and a.reconciliation_ready_at <= p_claimed_at;
  return found;
end;
$$;

revoke all on function public.record_reconciliation_progress(uuid, timestamptz, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.record_reconciliation_progress(uuid, timestamptz, timestamptz, uuid) to service_role;

-- Todas as conversas conferidas: a conta volta a enviar, se não caiu de novo depois da reserva.
create function public.finish_sender_reconciliation(p_sender_account_id uuid, p_claimed_at timestamptz)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.sender_accounts a set
    status = 'ready', reconciliation_required = false, reconciliation_ready_at = null,
    reconciliation_claimed_until = null, reconciliation_checked_at = null, reconciliation_checked_send = null,
    last_status_at = now(), updated_at = now()
  where a.id = p_sender_account_id and private.sender_is_reconciling(a)
    and a.reconciliation_ready_at <= p_claimed_at;
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

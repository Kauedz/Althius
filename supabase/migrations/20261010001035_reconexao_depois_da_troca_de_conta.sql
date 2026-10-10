-- Reconectar uma Conta remetente cuja conexão Unipile já não é a ativa (ADR-0024, correção de produção).
--
-- Depois da troca de conta (por exemplo da v2 para a v1), a linha antiga guarda o id da conta na conexão ANTERIOR. A
-- função devolvia esse id em `provider_account_id`, e quem abre o link pedia uma reconexão dele na API NOVA, que
-- responde 404 (Account not found). Agora a tentativa só devolve o id quando a linha é da conexão ativa; sem id, quem
-- chama abre um link de conexão NOVA. A tentativa continua ligada à mesma linha (reconnect_sender_account_id), e
-- complete_sender_connection_attempt grava o id novo e a conexão ativa NELA, sem perder o histórico.
--
-- Definição de 20260925131500, com uma única mudança: o id sai nulo quando a linha não é da conexão ativa. Sem
-- conexão ativa (private.active_unipile_connection_id() nulo) nada muda. A assinatura é a mesma: as permissões ficam.
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
  v_account_connection uuid;
  v_active uuid := private.active_unipile_connection_id();
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
    select a.unipile_account_id, a.provider, a.unipile_connection_id
    into v_account_id, v_provider, v_account_connection
    from private.sender_accounts a
    where a.id = p_reconnect_sender_account_id
      and a.workspace_id = p_workspace_id
      and a.owner_user_id = v_user_id
      and a.channel = p_channel;
    if v_account_id is null then
      raise exception 'sender account not found or not owned by active user'
        using errcode = '42501';
    end if;
    -- O id é de outra conexão: não serve à API ativa, então não sai daqui.
    if v_active is not null and v_account_connection <> v_active then
      v_account_id := null;
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

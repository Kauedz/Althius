-- Guarda de contrato (acesso-e-planos). Toda ação paga exige contrato ativo ou unlimited_credits, e a rodada de Agente
-- passa a sempre reservar créditos, sem depender de credits_enforced.
--
-- A recusa por falta de contrato tem a mesma mensagem e o mesmo SQLSTATE da falta de saldo ('insufficient credits',
-- P0001), com hint 'contract' e detail 'active contract required'. Assim todo begin_* que já traduz a falta de saldo em
-- no_credits, e a Edge Function que a traduz para a tela, continuam funcionando sem redefinir dez funções.
--
-- Redefinidas a partir da definição mais recente na main (20261015170000): reserve_credits, request_account_rescan e
-- quote_reveal_contact.

-- O Workspace pode gastar: contrato ativo, ou créditos ilimitados (a Equipe).
create or replace function private.paid_access_allowed(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.credits_unlimited(p_workspace_id) or private.contract_active(p_workspace_id);
$$;

create or replace function private.require_paid_access(p_workspace_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.paid_access_allowed(p_workspace_id) then
    raise exception 'insufficient credits' using errcode = 'P0001', hint = 'contract', detail = 'active contract required';
  end if;
end;
$$;

revoke all on function private.paid_access_allowed(uuid) from public, anon, authenticated, service_role;
revoke all on function private.require_paid_access(uuid) from public, anon, authenticated, service_role;

-- A cobrança vale sempre: a rodada de Agente (claim_agent_run, begin_agent_round e a proposta de resposta) reserva
-- créditos em todo Workspace. A coluna workspace_billing.credits_enforced e set_credits_enforced ficam dormentes.
create or replace function private.credits_enforced(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select true;
$$;

create or replace function public.reserve_credits(
  p_workspace_id uuid,
  p_user_id uuid,
  p_action text,
  p_action_key text,
  p_quantity integer default 1,
  p_own_ai_key boolean default false
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing private.credit_reservations%rowtype;
  v_unit numeric;
  v_amount numeric;
  v_available numeric;
  v_limit numeric;
  v_id uuid;
begin
  if p_quantity is null or p_quantity < 1 then
    raise exception 'invalid quantity' using errcode = '22023';
  end if;
  if p_action_key is null or btrim(p_action_key) = '' then
    raise exception 'action key is required' using errcode = '22023';
  end if;
  select c.credits into v_unit from private.credit_action_prices c where c.action = p_action;
  if v_unit is null then
    raise exception 'unknown credit action' using errcode = '22023';
  end if;
  if p_own_ai_key then
    if p_action <> 'agent_round' then
      raise exception 'own AI key applies only to agent rounds' using errcode = '22023';
    end if;
    v_unit := round(v_unit * private.own_ai_key_factor(), 2);
  end if;

  perform pg_advisory_xact_lock(hashtext('credits:' || p_workspace_id::text));
  select * into v_existing from private.credit_reservations r
  where r.workspace_id = p_workspace_id and r.action_key = p_action_key;
  if found then
    return v_existing.id;
  end if;

  if p_user_id is not null and not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = p_workspace_id and m.user_id = p_user_id and m.active
  ) then
    raise exception 'active workspace membership required' using errcode = '42501';
  end if;

  -- Sem contrato ativo (e sem ser ilimitado), nenhuma ação paga reserva.
  perform private.require_paid_access(p_workspace_id);

  v_amount := v_unit * p_quantity;
  if not private.credits_unlimited(p_workspace_id) then
    select t.booked - t.reserved into v_available from private.credit_totals(p_workspace_id) t;
    if v_available < v_amount then
      raise exception 'insufficient credits' using errcode = 'P0001', hint = 'credits';
    end if;
    if p_user_id is not null then
      select l.monthly_limit into v_limit from private.credit_member_limits l
      where l.workspace_id = p_workspace_id and l.user_id = p_user_id;
      if v_limit is not null and private.credit_member_month_usage(p_workspace_id, p_user_id) + v_amount > v_limit then
        raise exception 'monthly credit limit reached' using errcode = 'P0001', hint = 'credits';
      end if;
    end if;
  end if;

  insert into private.credit_reservations (workspace_id, user_id, action, action_key, quantity, unit_credits, amount)
  values (p_workspace_id, p_user_id, p_action, p_action_key, p_quantity, v_unit, v_amount)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.request_account_rescan(p_workspace_id uuid, p_target_account_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_cost record;
  v_available numeric;
  v_limit numeric;
  v_id uuid;
  v_pending private.signal_rescans%rowtype;
begin
  perform private.require_active_membership(p_workspace_id);
  perform private.assert_rescannable(p_workspace_id, p_target_account_id);
  perform private.require_paid_access(p_workspace_id);
  select * into v_pending from private.signal_rescans r
  where r.workspace_id = p_workspace_id and r.target_account_id = p_target_account_id and r.state = 'pending';
  if found and (v_pending.origin = 'manual' or exists (
    select 1 from private.credit_reservations c
    where c.workspace_id = p_workspace_id and c.action_key like 'rescan-auto:' || v_pending.id::text || ':%')) then
    return v_pending.id;
  end if;

  select * into v_cost from private.rescan_cost(p_workspace_id);
  if v_cost.monitors = 0 then
    raise exception 'no active monitor to search with' using errcode = '22023';
  end if;
  if not private.credits_unlimited(p_workspace_id) then
    select t.booked - t.reserved into v_available from private.credit_totals(p_workspace_id) t;
    if v_available < v_cost.credits then
      raise exception 'insufficient credits' using errcode = 'P0001', hint = 'credits';
    end if;
    select l.monthly_limit into v_limit from private.credit_member_limits l
    where l.workspace_id = p_workspace_id and l.user_id = v_user;
    if v_limit is not null and private.credit_member_month_usage(p_workspace_id, v_user) + v_cost.credits > v_limit then
      raise exception 'monthly credit limit reached' using errcode = 'P0001', hint = 'credits';
    end if;
  end if;

  if v_pending.id is not null then
    update private.signal_rescans set origin = 'manual', requested_by = v_user, claimed_until = null where id = v_pending.id;
    perform private.kick_rescan_runner();
    return v_pending.id;
  end if;
  insert into private.signal_rescans (workspace_id, target_account_id, origin, requested_by)
  values (p_workspace_id, p_target_account_id, 'manual', v_user)
  on conflict (workspace_id, target_account_id) where state = 'pending' do nothing
  returning id into v_id;
  if v_id is null then
    select r.id into v_id from private.signal_rescans r
    where r.workspace_id = p_workspace_id and r.target_account_id = p_target_account_id and r.state = 'pending';
  end if;
  perform private.kick_rescan_runner();
  return v_id;
end;
$$;

create or replace function public.quote_reveal_contact(
  p_contact_id uuid,
  p_channel text
) returns table (credits integer, current_balance numeric, can_reveal boolean, already_known boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_contact public.contacts%rowtype;
  v_user uuid := auth.uid();
  v_cost integer;
  v_balance numeric;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_contact from public.contacts c where c.id = p_contact_id and c.archived_at is null;
  if not found then
    raise exception 'contact not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = v_contact.workspace_id and m.user_id = v_user and m.active
  ) then
    raise exception 'active workspace membership required' using errcode = '42501';
  end if;

  if p_channel = 'email' then
    v_cost := 2;
  elsif p_channel = 'telefone' then
    v_cost := 5;
  else
    raise exception 'invalid channel for reveal' using errcode = '22023';
  end if;

  select t.booked - t.reserved into v_balance from private.credit_totals(v_contact.workspace_id) t;
  v_balance := coalesce(v_balance, 0);

  if exists (select 1 from private.existing_contact_value(v_contact.id, p_channel)) then
    return query select 0, v_balance, true, true;
    return;
  end if;

  return query select v_cost, v_balance,
    (private.paid_access_allowed(v_contact.workspace_id)
      and (private.credits_unlimited(v_contact.workspace_id) or v_balance >= v_cost)), false;
end;
$$;

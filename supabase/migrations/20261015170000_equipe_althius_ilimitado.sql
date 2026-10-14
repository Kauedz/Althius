-- Workspace Equipe Althius (equipe-althius-ilimitado): créditos ilimitados e sem Teto de Sinais, só por código.
-- Não há tela de super admin. A coluna nasce falsa; só esta migração liga a da Equipe. O uso continua no extrato.
-- Nulo em workspace_signal_budget.monthly_cap_usd é sem teto. Sem linha, o Workspace segue com US$ 20.

alter table private.workspace_billing
  add column unlimited_credits boolean not null default false;

comment on column private.workspace_billing.unlimited_credits is
  'Créditos ilimitados: a reserva não confere saldo nem limite por participante, e o Teto de Sinais não bloqueia. O uso continua no extrato.';

alter table private.workspace_signal_budget
  alter column monthly_cap_usd drop not null;

comment on column private.workspace_signal_budget.monthly_cap_usd is
  'Teto mensal de Sinais em dólar. Nulo é sem teto. Sem linha, o Workspace usa 20.';

-- O Workspace gasta sem olhar saldo nem limite. Sem linha, não.
create function private.credits_unlimited(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select b.unlimited_credits from private.workspace_billing b where b.workspace_id = p_workspace_id),
    false
  );
$$;

revoke all on function private.credits_unlimited(uuid) from public, anon, authenticated, service_role;

-- O que os actors de Sinais gastaram neste mês, em dólar. A cascata grava o mesmo custo aqui; somar os dois contaria duas vezes.
create function private.signal_month_spend_usd(p_workspace_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(c.cost_usd), 0)
  from private.action_costs c
  where c.workspace_id = p_workspace_id
    and c.action_type = 'apify_actor'
    and c.occurred_at >= date_trunc('month', now());
$$;

revoke all on function private.signal_month_spend_usd(uuid) from public, anon, authenticated, service_role;

-- Por que o gasto do mês em dólar impede a próxima busca (nulo quando não impede).
-- Ilimitado, ou teto gravado nulo, não impede. Sem linha, o teto é US$ 20.
create function private.signal_budget_block(p_workspace_id uuid, p_extra_usd numeric)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cap numeric;
begin
  if private.credits_unlimited(p_workspace_id) then
    return null;
  end if;
  select b.monthly_cap_usd into v_cap
  from private.workspace_signal_budget b
  where b.workspace_id = p_workspace_id;
  if not found then
    v_cap := 20;
  end if;
  if v_cap is null then
    return null;
  end if;
  if private.signal_month_spend_usd(p_workspace_id) + coalesce(p_extra_usd, 0) >= v_cap then
    return 'teto_atingido';
  end if;
  return null;
end;
$$;

revoke all on function private.signal_budget_block(uuid, numeric) from public, anon, authenticated, service_role;

-- Para o servidor (signal-runner e signal-cascade), sem sessão de usuário.
create function public.workspace_credits_unlimited(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.credits_unlimited(p_workspace_id);
$$;

revoke all on function public.workspace_credits_unlimited(uuid) from public, anon, authenticated;
grant execute on function public.workspace_credits_unlimited(uuid) to service_role;

-- A cobrança de um Workspace ilimitado fica ligada: a rodada passa pela reserva e o uso aparece no extrato.
create or replace function public.set_credits_enforced(p_workspace_id uuid, p_enforced boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.workspace_billing (workspace_id, credits_enforced)
  values (p_workspace_id, coalesce(p_enforced, false))
  on conflict (workspace_id) do update set
    credits_enforced = excluded.credits_enforced or private.workspace_billing.unlimited_credits,
    updated_at = now();
end;
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

-- A coluna unlimited entra no fim: quem lê balance, reserved, available, my_month_usage e my_monthly_limit não muda.
drop function public.get_credit_balance(uuid);

create function public.get_credit_balance(p_workspace_id uuid)
returns table (
  balance numeric,
  reserved numeric,
  available numeric,
  my_month_usage numeric,
  my_monthly_limit numeric,
  unlimited boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);
  return query
  select t.booked, t.reserved, t.booked - t.reserved,
    private.credit_member_month_usage(p_workspace_id, auth.uid()),
    (select l.monthly_limit from private.credit_member_limits l
     where l.workspace_id = p_workspace_id and l.user_id = auth.uid()),
    private.credits_unlimited(p_workspace_id)
  from private.credit_totals(p_workspace_id) t;
end;
$$;

revoke all on function public.get_credit_balance(uuid) from public, anon;
grant execute on function public.get_credit_balance(uuid) to authenticated;

-- Nulo gravado volta nulo (sem teto). Sem linha, US$ 20. O coalesce antigo transformava o nulo em 20.
create or replace function public.workspace_signal_monthly_cap(p_workspace_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cap numeric;
begin
  perform private.require_user();
  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = p_workspace_id and m.user_id = (select auth.uid()) and m.active
  ) then
    raise exception 'not a member of this workspace' using errcode = '42501';
  end if;
  select b.monthly_cap_usd into v_cap
  from private.workspace_signal_budget b
  where b.workspace_id = p_workspace_id;
  if not found then
    return 20;
  end if;
  return v_cap;
end;
$$;

-- Varredura automática de um Workspace ilimitado segue sem teto aprovado e sem pausar em confirmar:
-- não existe tela para configurar essa exceção. Os outros escopos continuam como estavam.
create or replace function public.consume_automation_cap(p_workspace_id uuid, p_scope text, p_amount numeric)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v private.automation_settings%rowtype;
  v_month date := date_trunc('month', now())::date;
  v_spent numeric;
  v_reason text;
  v_name text;
begin
  if p_amount is null or p_amount < 0 then
    raise exception 'invalid amount' using errcode = '22023';
  end if;
  if p_scope = 'acao:varredura' and private.credits_unlimited(p_workspace_id) then
    return 'ok';
  end if;
  perform pg_advisory_xact_lock(hashtext('automation:' || p_workspace_id::text || ':' || p_scope));
  select * into v from private.automation_settings c where c.workspace_id = p_workspace_id and c.scope = p_scope;
  select g.spent into v_spent from private.automation_spend g
  where g.workspace_id = p_workspace_id and g.scope = p_scope and g.month = v_month;
  v_spent := coalesce(v_spent, 0);
  v_reason := private.automation_block_reason(v.mode, v.monthly_cap, v_spent, v.paused_at);
  if v_reason is not null then
    return v_reason;
  end if;

  if v_spent + p_amount > v.monthly_cap then
    v_reason := 'teto_atingido';
  else
    insert into private.automation_spend (workspace_id, scope, month, spent)
    values (p_workspace_id, p_scope, v_month, p_amount)
    on conflict (workspace_id, scope, month) do update set spent = private.automation_spend.spent + excluded.spent;
    v_spent := v_spent + p_amount;
  end if;

  if v_spent >= v.monthly_cap or v_reason is not null then
    update private.automation_settings set paused_at = now()
    where workspace_id = p_workspace_id and scope = p_scope;
    select s.name into v_name from private.automation_scopes(p_workspace_id) s where s.scope = p_scope;
    insert into private.workspace_notices (workspace_id, kind, title, body, link)
    values (p_workspace_id, 'teto_atingido', 'Teto mensal atingido: ' || v_name,
      'O automático de ' || v_name || ' chegou ao teto de ' || v.monthly_cap::text
        || ' créditos do mês e está pausado. Suba o teto ou espere o próximo mês.',
      '/configuracoes/automacao');
  end if;
  return coalesce(v_reason, 'ok');
end;
$$;

create or replace function public.begin_account_scan(
  p_workspace_id uuid, p_user_id uuid, p_monitor_id uuid, p_account_id uuid, p_slot timestamptz
) returns table (outcome text, reservation_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := 'scan:' || p_monitor_id::text || ':' || p_account_id::text || ':' || extract(epoch from p_slot)::bigint::text;
  v_existing private.credit_reservations%rowtype;
  v_user uuid;
  v_id uuid;
  v_cap text;
  v_block text;
begin
  perform pg_advisory_xact_lock(hashtext('scan:' || v_key));
  select * into v_existing from private.credit_reservations r where r.workspace_id = p_workspace_id and r.action_key = v_key;
  if found then
    return query select
      case v_existing.status when 'reserved' then 'resume' when 'settled' then 'done' else 'skip' end,
      v_existing.id;
    return;
  end if;
  if not exists (
    select 1 from private.signal_monitors m where m.workspace_id = p_workspace_id and m.id = p_monitor_id
  ) or not exists (
    select 1 from public.target_accounts a where a.workspace_id = p_workspace_id and a.id = p_account_id
  ) then
    raise exception 'monitor or target account not found' using errcode = 'P0002';
  end if;

  v_block := private.signal_budget_block(p_workspace_id, 0);
  if v_block is not null then
    return query select v_block, null::uuid;
    return;
  end if;

  v_user := case when p_user_id is not null and exists (
    select 1 from public.workspace_memberships m where m.workspace_id = p_workspace_id and m.user_id = p_user_id and m.active
  ) then p_user_id end;
  begin
    v_id := public.reserve_credits(p_workspace_id, v_user, 'account_scan', v_key, 1, false);
  exception when others then
    if sqlerrm in ('insufficient credits', 'monthly credit limit reached') then
      return query select 'no_credits'::text, null::uuid;
      return;
    end if;
    raise;
  end;
  v_cap := public.consume_automation_cap(
    p_workspace_id, 'acao:varredura', (select r.amount from private.credit_reservations r where r.id = v_id));
  if v_cap <> 'ok' then
    delete from private.credit_reservations where id = v_id;
    return query select v_cap, null::uuid;
    return;
  end if;
  return query select 'go'::text, v_id;
end;
$$;

create or replace function public.begin_cascade_run(
  p_workspace_id uuid,
  p_user_id uuid,
  p_signal_type text,
  p_origin text,
  p_monitor_id uuid,
  p_key text,
  p_est_usd numeric,
  p_cap_credits integer default null,
  p_allow_testing boolean default false
) returns table (outcome text, run_id uuid, reservation_id uuid, est_credits integer, cap_usd numeric)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_c private.signal_cascades%rowtype;
  v_set private.signal_cascade_settings%rowtype;
  v_existing private.signal_cascade_runs%rowtype;
  v_cap numeric;
  v_est numeric;
  v_credits integer;
  v_user uuid;
  v_res uuid;
  v_cap_state text;
  v_today numeric;
  v_run uuid;
  v_block text;
begin
  if p_origin not in ('conversa', 'monitor', 'rotina') or p_key is null or btrim(p_key) = ''
    or p_est_usd is null or p_est_usd < 0 or (p_cap_credits is not null and p_cap_credits < 1) then
    raise exception 'invalid cascade request' using errcode = '22023';
  end if;
  if not exists (select 1 from public.workspaces w where w.id = p_workspace_id) then
    raise exception 'workspace not found' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtext('cascade:' || p_workspace_id::text || ':' || p_key));

  select * into v_c from private.signal_cascades c where c.signal_type = p_signal_type;
  if not found then
    return query select 'sem_cascata'::text, null::uuid, null::uuid, 0, 0::numeric;
    return;
  end if;
  if v_c.state = 'sem_fonte' then
    return query select 'sem_fonte'::text, null::uuid, null::uuid, 0, 0::numeric;
    return;
  end if;
  if v_c.state = 'disabled' then
    return query select 'indisponivel'::text, null::uuid, null::uuid, 0, 0::numeric;
    return;
  end if;
  if v_c.state = 'testing' and not coalesce(p_allow_testing, false) then
    return query select 'em_teste'::text, null::uuid, null::uuid, 0, 0::numeric;
    return;
  end if;

  select * into v_existing from private.signal_cascade_runs r where r.workspace_id = p_workspace_id and r.idempotency_key = p_key;
  if found then
    if v_existing.state = 'running' and v_existing.started_at < now() - interval '20 minutes' then
      perform public.finish_cascade_run(v_existing.id, 'failed', null, 0, 0, 0, 'A busca anterior não terminou; tente de novo.');
      select * into v_existing from private.signal_cascade_runs r where r.id = v_existing.id;
    end if;
    return query select case v_existing.state when 'running' then 'em_andamento' else 'done' end, v_existing.id,
      v_existing.reservation_id, v_existing.est_credits, v_existing.cap_usd;
    return;
  end if;

  select * into v_set from private.signal_cascade_settings;
  v_cap := v_c.cap_usd;
  if v_c.cap_credits is not null then
    v_cap := least(v_cap, v_c.cap_credits * v_set.usd_per_credit / v_c.price_multiplier);
  end if;
  if p_cap_credits is not null then
    v_cap := least(v_cap, p_cap_credits * v_set.usd_per_credit / v_c.price_multiplier);
  end if;
  v_est := least(p_est_usd, v_cap);
  v_credits := greatest(1, ceil(v_est * v_c.price_multiplier / v_set.usd_per_credit)::integer);

  if p_origin = 'monitor' and exists (
    select 1 from private.signal_cascade_runs r
    where r.workspace_id = p_workspace_id and r.cascade_id = v_c.id and r.origin = 'monitor'
      and r.monitor_id is not distinct from p_monitor_id and r.state not in ('failed', 'adiado')
      and r.started_at >= date_trunc('day', now())) then
    return query select 'ja_rodou_hoje'::text, null::uuid, null::uuid, 0, 0::numeric;
    return;
  end if;

  v_block := private.signal_budget_block(p_workspace_id, v_est);
  if v_block is not null then
    return query select v_block, null::uuid, null::uuid, 0, 0::numeric;
    return;
  end if;

  select coalesce(sum(case when r.status = 'settled' then r.unit_credits * r.settled_quantity else r.amount end), 0)
  into v_today
  from private.credit_reservations r
  where r.workspace_id = p_workspace_id and r.action = 'cascata_de_sinais' and r.status in ('reserved', 'settled')
    and r.created_at >= date_trunc('day', now());
  if not private.credits_unlimited(p_workspace_id) and v_today + v_credits > v_set.daily_credit_cap then
    return query select 'limite_diario'::text, null::uuid, null::uuid, 0, 0::numeric;
    return;
  end if;

  v_user := case when p_user_id is not null and exists (
    select 1 from public.workspace_memberships m where m.workspace_id = p_workspace_id and m.user_id = p_user_id and m.active
  ) then p_user_id end;
  begin
    v_res := public.reserve_credits(p_workspace_id, v_user, 'cascata_de_sinais', 'cascade:' || p_key, v_credits, false);
  exception when others then
    if sqlerrm in ('insufficient credits', 'monthly credit limit reached') then
      return query select 'no_credits'::text, null::uuid, null::uuid, 0, 0::numeric;
      return;
    end if;
    raise;
  end;

  if p_origin = 'monitor' then
    v_cap_state := public.consume_automation_cap(p_workspace_id, 'acao:varredura', v_credits);
    if v_cap_state <> 'ok' then
      delete from private.credit_reservations where id = v_res;
      return query select v_cap_state, null::uuid, null::uuid, 0, 0::numeric;
      return;
    end if;
  end if;

  insert into private.signal_cascade_runs
    (workspace_id, cascade_id, origin, monitor_id, requested_by, idempotency_key, reservation_id, est_cost_usd, est_credits, cap_usd)
  values (p_workspace_id, v_c.id, p_origin, p_monitor_id, v_user, p_key, v_res, v_est, v_credits, v_cap)
  returning id into v_run;
  return query select 'go'::text, v_run, v_res, v_credits, v_cap;
end;
$$;

-- A busca mensal de um Workspace ilimitado entra na fila mesmo sem teto aprovado e mesmo em confirmar.
create or replace function private.enqueue_monthly_rescans()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created integer;
begin
  with ligados as (
    select c.workspace_id
    from private.automation_settings c
    left join private.automation_spend g
      on g.workspace_id = c.workspace_id and g.scope = c.scope and g.month = date_trunc('month', now())::date
    where c.scope = 'acao:varredura'
      and (
        private.automation_block_reason(c.mode, c.monthly_cap, g.spent, c.paused_at) is null
        or private.credits_unlimited(c.workspace_id)
      )
      and exists (select 1 from private.rescan_monitors(c.workspace_id))
    union
    select w.id
    from public.workspaces w
    where private.credits_unlimited(w.id)
      and exists (select 1 from private.rescan_monitors(w.id))
  ), esfriadas as (
    select s.workspace_id, s.target_account_id
    from ligados l
    join private.prospecting_stages s on s.workspace_id = l.workspace_id and s.stage = 'fit'
    join public.target_accounts a
      on a.workspace_id = s.workspace_id and a.id = s.target_account_id and a.archived_at is null and a.deleted_at is null
    where not exists (
      select 1 from private.signals g
      where g.workspace_id = s.workspace_id and g.target_account_id = s.target_account_id and private.signal_is_valid(g.fired_at))
      and not exists (
        select 1 from private.signal_rescans r
        where r.workspace_id = s.workspace_id and r.target_account_id = s.target_account_id
          and (r.state = 'pending' or (r.state = 'done' and r.finished_at > now() - interval '30 days')))
  ), novas as (
    insert into private.signal_rescans (workspace_id, target_account_id, origin)
    select e.workspace_id, e.target_account_id, 'mensal' from esfriadas e
    on conflict (workspace_id, target_account_id) where state = 'pending' do nothing
    returning 1
  )
  select count(*)::integer into v_created from novas;
  return v_created;
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
    (private.credits_unlimited(v_contact.workspace_id) or v_balance >= v_cost), false;
end;
$$;

-- Cria a Equipe Althius uma vez. Quem ainda não tem Conta no Auth não é inventado; chamar de novo vincula quem passou a existir.
create function private.ensure_equipe_althius_workspace()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ws uuid := 'e0a17e00-0000-4000-8000-000000000001';
  v_request uuid := 'e0a17e00-0000-4000-8000-000000000002';
  v_founder uuid;
  v_email text;
  v_founders uuid[] := array[
    'de76a0e7-0434-4833-9698-a005ec187025'::uuid,
    'bbbb0aff-ca2a-43d9-a38a-f97a3f15fe91'::uuid,
    'f64677ac-df08-4a8a-9c02-7bedd7dfabe4'::uuid,
    'f1df4ddc-16ff-446c-9197-47fb7ce546bc'::uuid
  ];
begin
  if not exists (select 1 from public.workspaces w where w.id = v_ws) then
    if exists (select 1 from public.workspaces w where w.kind = 'empresa' and w.name = 'Equipe Althius') then
      select w.id into v_ws
      from public.workspaces w
      where w.kind = 'empresa' and w.name = 'Equipe Althius'
      order by w.created_at, w.id
      limit 1;
    else
      insert into public.workspaces (id, kind, name) values (v_ws, 'empresa', 'Equipe Althius');
    end if;
  end if;

  foreach v_founder in array v_founders loop
    select u.email into v_email from auth.users u where u.id = v_founder;
    if not found then
      continue;
    end if;
    insert into public.workspace_memberships (workspace_id, user_id, role, active)
    values (v_ws, v_founder, 'admin', true)
    on conflict (workspace_id, user_id) do update set role = 'admin', active = true;
    if not exists (
      select 1 from private.workspace_participation_events e
      where e.workspace_id = v_ws and e.subject_user_id = v_founder and e.event = 'workspace_criado'
    ) then
      insert into private.workspace_participation_events
        (workspace_id, event, subject_user_id, subject_email, actor_user_id, new_role)
      values (v_ws, 'workspace_criado', v_founder, v_email, v_founder, 'admin');
    end if;
  end loop;

  if exists (select 1 from auth.users u where u.id = 'de76a0e7-0434-4833-9698-a005ec187025') then
    insert into private.company_workspace_requests (user_id, request_id, workspace_id)
    values ('de76a0e7-0434-4833-9698-a005ec187025', v_request, v_ws)
    on conflict (user_id, request_id) do nothing;
  end if;

  insert into private.workspace_billing (workspace_id, credits_enforced, unlimited_credits)
  values (v_ws, true, true)
  on conflict (workspace_id) do update
    set unlimited_credits = true, credits_enforced = true, updated_at = now();

  insert into private.workspace_signal_budget (workspace_id, monthly_cap_usd)
  values (v_ws, null)
  on conflict (workspace_id) do update set monthly_cap_usd = null;

  perform public.set_manual_release(v_ws, true, 'Equipe Althius: créditos ilimitados, sem teto de Sinais');
  return v_ws;
end;
$$;

revoke all on function private.ensure_equipe_althius_workspace() from public, anon, authenticated, service_role;

select private.ensure_equipe_althius_workspace();

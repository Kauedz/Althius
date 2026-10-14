-- Renovação mensal do contrato (creditos-moeda-unica). No aniversário do contrato, todo mês: o restante dos créditos do plano
-- é zerado (lançamento `ajuste` negativo, só do que veio do plano) e os `monthly_credits` da faixa entram como `plano`. Os
-- créditos de `pacote` ficam: valem 12 meses e são gastos depois dos do plano (lotes, 20261017110000).
--
-- O "mês" do cliente é o período do contrato, do aniversário ao seguinte. `credit_period_start` devolve o início do período
-- (sem contrato, o dia 1 do mês do calendário, como sempre foi). O limite mensal e a guarda interna usam o mesmo início.

create or replace function private.credit_period_start(p_workspace_id uuid)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_starts timestamptz;
  v_day integer;
  v_month timestamptz := date_trunc('month', now());
  v_anchor timestamptz;
begin
  select c.starts_at into v_starts from private.workspace_contracts c where c.workspace_id = p_workspace_id;
  if not found or v_starts > now() then
    return v_month;
  end if;
  v_day := extract(day from v_starts)::integer;
  -- O aniversário deste mês; em mês mais curto, o último dia.
  v_anchor := v_month + (least(v_day, extract(day from (v_month + interval '1 month' - interval '1 day'))::integer) - 1) * interval '1 day';
  if v_anchor <= now() then
    return v_anchor;
  end if;
  v_month := v_month - interval '1 month';
  return v_month + (least(v_day, extract(day from (v_month + interval '1 month' - interval '1 day'))::integer) - 1) * interval '1 day';
end;
$$;

revoke all on function private.credit_period_start(uuid) from public, anon, authenticated, service_role;

-- O limite mensal de gasto do Workspace em créditos: o do contrato, ou os créditos da faixa. Nulo sem contrato e no
-- Workspace ilimitado (que não tem limite).
create or replace function private.workspace_monthly_limit(p_workspace_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case when private.credits_unlimited(p_workspace_id) then null
    else coalesce(c.monthly_credit_limit, t.monthly_credits::numeric) end
  from private.workspace_contracts c
  join private.contract_tiers t on t.id = c.tier_id
  where c.workspace_id = p_workspace_id;
$$;

revoke all on function private.workspace_monthly_limit(uuid) from public, anon, authenticated, service_role;

-- O que o Workspace gastou neste período, liquidado mais reservado.
create or replace function private.workspace_period_usage(p_workspace_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(case when r.status = 'settled' then r.unit_credits * r.settled_quantity else r.amount end), 0)
  from private.credit_reservations r
  where r.workspace_id = p_workspace_id and r.status in ('reserved', 'settled')
    and r.created_at >= private.credit_period_start(p_workspace_id);
$$;

revoke all on function private.workspace_period_usage(uuid) from public, anon, authenticated, service_role;

-- O que cada renovação fez, uma por período: repetir o job não renova duas vezes.
create table if not exists private.contract_renewals (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  period_start timestamptz not null,
  plan_zeroed numeric(12, 2) not null default 0 check (plan_zeroed >= 0),
  pacote_expired numeric(12, 2) not null default 0 check (pacote_expired >= 0),
  granted numeric(12, 2) not null check (granted >= 0),
  created_at timestamptz not null default now(),
  primary key (workspace_id, period_start)
);

alter table private.contract_renewals enable row level security;
revoke all on private.contract_renewals from public, anon, authenticated, service_role;

-- Renova um contrato, se o período dele ainda não foi renovado. O primeiro período é o do provisionamento (os créditos
-- iniciais já entraram), então a primeira renovação é a do primeiro aniversário. Devolve se renovou.
create or replace function private.renew_contract_credits(p_workspace_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  c private.workspace_contracts%rowtype;
  v_tier private.contract_tiers%rowtype;
  v_period timestamptz;
  v_zeroed numeric;
  v_booked numeric;
  v_expired numeric;
begin
  select * into c from private.workspace_contracts k where k.workspace_id = p_workspace_id;
  if not found or c.status <> 'ativo' or c.billing_mode <> 'contrato' or c.starts_at > now()
     or private.credits_unlimited(p_workspace_id) then
    return false;
  end if;
  v_period := private.credit_period_start(p_workspace_id);
  if v_period::date <= c.starts_at::date then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtext('credits:' || p_workspace_id::text));
  if exists (select 1 from private.contract_renewals r where r.workspace_id = p_workspace_id and r.period_start = v_period) then
    return false;
  end if;
  select * into v_tier from private.contract_tiers t where t.id = c.tier_id;

  -- 1. O que sobrou do plano sai do saldo.
  select coalesce(sum(l.remaining), 0) into v_zeroed
  from private.credit_lots l where l.workspace_id = p_workspace_id and l.kind = 'plano' and l.remaining > 0;
  select coalesce(sum(e.amount), 0) into v_booked from private.credit_entries e where e.workspace_id = p_workspace_id;
  v_zeroed := least(v_zeroed, greatest(v_booked, 0));
  update private.credit_lots set remaining = 0 where workspace_id = p_workspace_id and kind = 'plano' and remaining > 0;
  if v_zeroed > 0 then
    insert into private.credit_entries (workspace_id, amount, kind, note)
    values (p_workspace_id, -v_zeroed, 'ajuste', 'Renovação: o restante do plano do período anterior foi zerado');
  end if;

  -- 2. O pacote vencido sai; o que ainda vale fica.
  v_expired := private.expire_credit_lots(p_workspace_id);

  -- 3. Os créditos do novo período.
  perform public.grant_credits(p_workspace_id, v_tier.monthly_credits, 'plano', 'Renovação mensal: faixa ' || v_tier.name);

  -- 4. O automático começa o período do zero (a Automação conta pelo mês do calendário; o limite do contrato é do período).
  update private.automation_spend s set spent = 0
  where s.workspace_id = p_workspace_id and s.month = date_trunc('month', now())::date
    and s.scope in ('acao:varredura', 'acao:enriquecimento', 'acao:agentes');
  update private.automation_settings set paused_at = null
  where workspace_id = p_workspace_id and scope in ('acao:varredura', 'acao:enriquecimento', 'acao:agentes') and paused_at is not null;

  insert into private.contract_renewals (workspace_id, period_start, plan_zeroed, pacote_expired, granted)
  values (p_workspace_id, v_period, v_zeroed, v_expired, v_tier.monthly_credits);
  return true;
end;
$$;

revoke all on function private.renew_contract_credits(uuid) from public, anon, authenticated, service_role;

-- O job: renova todo contrato cujo período novo começou e ainda não foi renovado. Também deixa o pacote vencido de quem não
-- tem contrato fora do saldo. Devolve quantos renovou.
create or replace function private.renew_all_contracts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ws uuid;
  v_done integer := 0;
begin
  for v_ws in
    select c.workspace_id from private.workspace_contracts c
    where c.status = 'ativo' and c.billing_mode = 'contrato' and c.starts_at <= now()
    order by c.workspace_id
  loop
    if private.renew_contract_credits(v_ws) then
      v_done := v_done + 1;
    end if;
  end loop;
  perform private.expire_credit_lots(l.workspace_id)
  from (select distinct workspace_id from private.credit_lots
        where remaining > 0 and expires_at is not null and expires_at <= now()) l;
  return v_done;
end;
$$;

revoke all on function private.renew_all_contracts() from public, anon, authenticated, service_role;

-- O relógio, como nos outros jobs: onde não há pg_cron, a renovação só não roda sozinha (private.renew_all_contracts() pode
-- ser chamada à mão). Todo dia, de madrugada: o job confere o aniversário de cada contrato.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('althius-contract-renewal', '11 3 * * *', 'select private.renew_all_contracts()');
  end if;
exception when others then
  raise notice 'renovação mensal sem agendador: %', sqlerrm;
end
$$;

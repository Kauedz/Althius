-- O Monitoramento cobra por Conta varrida (creditos-moeda-unica). `credits_per_account` (preço fixo do Sinal) × Contas varridas,
-- no signal-runner (begin_account_scan), na busca de uma Conta (begin_rescan_scan e rescan_cost) e na cascata
-- (begin_cascade_run, finish_cascade_run). A cascata deixa de calcular o crédito pelo custo da fonte: `usd_per_credit` e o
-- multiplicador viram só a guarda interna. O limite do contrato aparece como o desfecho `teto_atingido`, que o motor já trata.
--
-- Redefinidas a partir da definição mais recente na main: begin_account_scan e begin_cascade_run (20261015170000),
-- begin_rescan_scan (20260930200000), finish_cascade_run (20261015120000). begin_cascade_run ganha `p_accounts`; a versão
-- antiga, de 9 parâmetros, sai para a chamada posicional continuar sem ambiguidade.

-- O preço de uma varredura de Conta: o do Sinal, e nunca menos de 1 (o runner só reserva o que é varredura de verdade).
create or replace function private.scan_credits(p_signal_type text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(private.credits_per_account(p_signal_type), 1);
$$;

revoke all on function private.scan_credits(text) from public, anon, authenticated, service_role;

create or replace function private.rescan_cost(p_workspace_id uuid)
returns table (monitors integer, credits numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer, coalesce(sum(private.scan_credits(m.signal_type)), 0)::numeric(12, 2)
  from private.rescan_monitors(p_workspace_id) m;
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
  v_type text;
  v_qty integer;
  v_hint text;
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
  -- O preço fixo do Sinal: créditos por Conta varrida (creditos-moeda-unica).
  select m.signal_type into v_type from private.signal_monitors m where m.workspace_id = p_workspace_id and m.id = p_monitor_id;
  v_qty := private.scan_credits(v_type);

  v_block := private.signal_budget_block(p_workspace_id, 0);
  if v_block is not null then
    return query select v_block, null::uuid;
    return;
  end if;

  v_user := case when p_user_id is not null and exists (
    select 1 from public.workspace_memberships m where m.workspace_id = p_workspace_id and m.user_id = p_user_id and m.active
  ) then p_user_id end;
  begin
    v_id := public.reserve_credits(p_workspace_id, v_user, 'account_scan', v_key, v_qty, false);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    -- O limite do contrato (e não o do participante) é o "Limite do mês atingido" que o cliente vê.
    if sqlerrm = 'monthly credit limit reached' and v_hint = 'workspace_limit' then
      return query select 'teto_atingido'::text, null::uuid;
      return;
    end if;
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

create or replace function public.begin_rescan_scan(p_rescan_id uuid, p_monitor_id uuid)
returns table (outcome text, reservation_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rescan private.signal_rescans%rowtype;
  v_key text;
  v_existing private.credit_reservations%rowtype;
  v_user uuid;
  v_id uuid;
  v_cap text;
  v_type text;
  v_qty integer;
  v_hint text;
begin
  select * into v_rescan from private.signal_rescans r where r.id = p_rescan_id;
  if not found then
    raise exception 'rescan not found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from private.signal_monitors m where m.workspace_id = v_rescan.workspace_id and m.id = p_monitor_id
  ) then
    raise exception 'monitor not found' using errcode = 'P0002';
  end if;
  select m.signal_type into v_type from private.signal_monitors m where m.workspace_id = v_rescan.workspace_id and m.id = p_monitor_id;
  v_qty := private.scan_credits(v_type);

  v_key := case v_rescan.origin when 'manual' then 'rescan-manual:' else 'rescan-auto:' end
    || p_rescan_id::text || ':' || p_monitor_id::text;
  perform pg_advisory_xact_lock(hashtext('scan:' || v_key));
  select * into v_existing from private.credit_reservations r
  where r.workspace_id = v_rescan.workspace_id and r.action_key = v_key;
  if found then
    return query select
      case v_existing.status when 'reserved' then 'resume' when 'settled' then 'done' else 'skip' end,
      v_existing.id;
    return;
  end if;
  if v_rescan.state <> 'pending' then
    raise exception 'the rescan is not pending' using errcode = '55006';
  end if;

  v_user := case when v_rescan.requested_by is not null and exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = v_rescan.workspace_id and m.user_id = v_rescan.requested_by and m.active
  ) then v_rescan.requested_by end;
  begin
    v_id := public.reserve_credits(v_rescan.workspace_id, v_user, 'account_scan', v_key, v_qty, false);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    if sqlerrm = 'monthly credit limit reached' and v_hint = 'workspace_limit' then
      return query select 'teto_atingido'::text, null::uuid;
      return;
    end if;
    if sqlerrm in ('insufficient credits', 'monthly credit limit reached') then
      return query select 'no_credits'::text, null::uuid;
      return;
    end if;
    raise;
  end;
  if v_rescan.origin = 'mensal' then
    v_cap := public.consume_automation_cap(
      v_rescan.workspace_id, 'acao:varredura', (select r.amount from private.credit_reservations r where r.id = v_id));
    if v_cap <> 'ok' then
      delete from private.credit_reservations where id = v_id;
      return query select v_cap, null::uuid;
      return;
    end if;
  end if;
  return query select 'go'::text, v_id;
end;
$$;

drop function if exists public.begin_cascade_run(uuid, uuid, text, text, uuid, text, numeric, integer, boolean);

create or replace function public.begin_cascade_run(
  p_workspace_id uuid,
  p_user_id uuid,
  p_signal_type text,
  p_origin text,
  p_monitor_id uuid,
  p_key text,
  p_est_usd numeric,
  p_cap_credits integer default null,
  p_allow_testing boolean default false,
  p_accounts integer default null
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
  v_run uuid;
  v_block text;
  v_hint text;
  v_today numeric;
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
  -- O preço é fixo (creditos-moeda-unica): Sinal de Mercado, sem Conta, custa `credits_per_run` por execução; Sinal de Conta
  -- custa `credits_per_account` por Conta da execução. O custo da fonte e o multiplicador só alimentam a guarda em dólar.
  v_credits := case
    when v_c.scope = 'mercado' then v_set.credits_per_run
    else greatest(private.credits_per_account(p_signal_type), 1) * greatest(coalesce(p_accounts, 1), 1)
  end;

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
    get stacked diagnostics v_hint = pg_exception_hint;
    if sqlerrm = 'monthly credit limit reached' and v_hint = 'workspace_limit' then
      return query select 'teto_atingido'::text, null::uuid, null::uuid, 0, 0::numeric;
      return;
    end if;
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

create or replace function public.finish_cascade_run(
  p_run_id uuid,
  p_state text,
  p_real_cost_usd numeric,
  p_matched integer,
  p_signals_new integer,
  p_signals_repeated integer,
  p_friendly_error text
) returns table (credits_charged integer, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_run private.signal_cascade_runs%rowtype;
  v_c private.signal_cascades%rowtype;
  v_set private.signal_cascade_settings%rowtype;
  v_res private.credit_reservations%rowtype;
  v_credits integer;
begin
  if p_state not in ('succeeded', 'partial', 'aborted', 'failed', 'adiado') then
    raise exception 'invalid state' using errcode = '22023';
  end if;
  if p_real_cost_usd is not null and (p_real_cost_usd < 0 or p_real_cost_usd > 100000) then
    raise exception 'invalid cost' using errcode = '22023';
  end if;
  select * into v_run from private.signal_cascade_runs r where r.id = p_run_id for update;
  if not found then
    raise exception 'cascade run not found' using errcode = 'P0002';
  end if;
  if v_run.state <> 'running' then
    return query select coalesce(v_run.credits_charged, 0), v_run.state;
    return;
  end if;
  select * into v_c from private.signal_cascades c where c.id = v_run.cascade_id;
  select * into v_set from private.signal_cascade_settings;
  select * into v_res from private.credit_reservations r where r.id = v_run.reservation_id;

  -- O preço é fixo: uma execução concluída cobra o que reservou; uma parcial, só se achou algo; falha, aborto e adiada não
  -- cobram. O custo real da fonte não define mais o crédito: fica no rastro, para a guarda em dólar.
  v_credits := case
    when p_state = 'succeeded' then v_run.est_credits
    when p_state = 'partial' and (coalesce(p_matched, 0) > 0 or coalesce(p_signals_new, 0) > 0) then v_run.est_credits
    else 0
  end;
  v_credits := least(v_credits, v_run.est_credits);
  if v_res.id is not null then
    v_credits := least(v_credits, v_res.quantity);
  end if;

  if v_res.id is not null and v_res.status = 'reserved' then
    perform public.settle_credits(v_res.id, v_credits);
    if v_run.origin = 'monitor' and v_res.amount - v_credits * v_res.unit_credits > 0 then
      perform private.refund_automation_cap(v_run.workspace_id, 'acao:varredura', v_res.amount - v_credits * v_res.unit_credits);
    end if;
  elsif v_res.id is not null and v_res.status = 'released' then
    v_credits := 0;
  end if;

  update private.signal_cascade_runs set
    state = p_state, real_cost_usd = p_real_cost_usd, credits_charged = v_credits,
    matched_items = greatest(coalesce(p_matched, 0), 0), signals_new = greatest(coalesce(p_signals_new, 0), 0),
    signals_repeated = greatest(coalesce(p_signals_repeated, 0), 0),
    friendly_error = left(nullif(p_friendly_error, ''), 500), finished_at = now()
  where id = p_run_id;
  return query select v_credits, p_state;
end;
$$;

revoke all on function public.begin_cascade_run(uuid, uuid, text, text, uuid, text, numeric, integer, boolean, integer) from public, anon, authenticated;
grant execute on function public.begin_cascade_run(uuid, uuid, text, text, uuid, text, numeric, integer, boolean, integer) to service_role;

-- O teto diário de créditos da cascata é guarda interna e era calibrado pelo custo da fonte (50 por dia). Com o preço fixo por
-- Conta, uma rodada de 200 Contas custa de 200 a 400 créditos: o teto sobe para o tamanho da maior faixa por mês.
alter table private.signal_cascade_settings alter column daily_credit_cap set default 6000;
update private.signal_cascade_settings set daily_credit_cap = 6000 where daily_credit_cap = 50;

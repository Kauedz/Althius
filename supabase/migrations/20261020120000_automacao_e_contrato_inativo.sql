-- Automação com limite único e pausa por contrato inativo (automacao-e-contrato-inativo).
--
-- 1. Workspace sem contrato ativo (status diferente de 'ativo', ou sem linha) e sem créditos ilimitados não roda
--    Monitoramento, cascata, Rotina nem Sequência. O motivo é contrato_inativo. Nada é apagado.
-- 2. A Equipe Althius, ilimitada, ganha as três linhas de ação em automático, sem teto.
-- 3. A renovação que já zerava paused_at passa a avisar os Administradores quando havia pausa por teto.
-- 4. O Administrador ajusta um limite mensal só, o do contrato, até os créditos da faixa.
--
-- Redefinidas a partir da definição mais recente na main: begin_account_scan, begin_rescan_scan e begin_cascade_run
-- (20261017130000), claim_due_signal_monitors (20261013130000), claim_signal_rescans (20260930221000),
-- claim_due_step_sends e claim_due_chat_step_sends (20261010120000), enqueue_due_agent_routines (20261012120532),
-- claim_agent_run (20261012143547), enqueue_monthly_rescans (20261015170000), renew_contract_credits (20261017120000),
-- list_automation_settings (20260930170000), save_automation_setting (20261009010000), seed_contract_automation
-- (20261017150000).

-- Por que o automático deste Workspace não roda: contrato que não está ativo, ou ausência de contrato. Nulo quando roda
-- (contrato ativo, ou créditos ilimitados).
create or replace function private.automation_contract_block(p_workspace_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.credits_unlimited(p_workspace_id) then null
    when exists (
      select 1 from private.workspace_contracts c
      where c.workspace_id = p_workspace_id and c.status = 'ativo'
    ) then null
    else 'contrato_inativo'
  end;
$$;

revoke all on function private.automation_contract_block(uuid) from public, anon, authenticated, service_role;

-- Automático sem teto só vale no Workspace ilimitado. Nos outros, o teto continua obrigatório.
do $drop$
declare
  v_name text;
begin
  select con.conname into v_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'private'
    and rel.relname = 'automation_settings'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%monthly_cap is not null%';
  if v_name is not null then
    execute format('alter table private.automation_settings drop constraint %I', v_name);
  end if;
end
$drop$;

create or replace function private.automation_settings_cap_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.mode = 'automatico' and new.monthly_cap is null and not private.credits_unlimited(new.workspace_id) then
    raise exception 'automatic mode requires an approved monthly cap' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function private.automation_settings_cap_guard() from public, anon, authenticated, service_role;

drop trigger if exists automation_settings_cap_guard on private.automation_settings;
create trigger automation_settings_cap_guard
  before insert or update on private.automation_settings
  for each row execute function private.automation_settings_cap_guard();

-- O automático em automático. Com limite, o teto é o do contrato. Ilimitado, sem teto. Não sobrescreve escolha já gravada.
create or replace function private.seed_contract_automation(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit numeric := private.workspace_monthly_limit(p_workspace_id);
begin
  if private.credits_unlimited(p_workspace_id) then
    insert into private.automation_settings (workspace_id, scope, mode, monthly_cap)
    select p_workspace_id, s.scope, 'automatico', null
    from (values ('acao:varredura'), ('acao:enriquecimento'), ('acao:agentes')) as s (scope)
    on conflict (workspace_id, scope) do nothing;
    return;
  end if;
  if v_limit is null or v_limit <= 0 then
    return;
  end if;
  insert into private.automation_settings (workspace_id, scope, mode, monthly_cap)
  select p_workspace_id, s.scope, 'automatico', v_limit
  from (values ('acao:varredura'), ('acao:enriquecimento'), ('acao:agentes')) as s (scope)
  on conflict (workspace_id, scope) do nothing;
end;
$$;

revoke all on function private.seed_contract_automation(uuid) from public, anon, authenticated, service_role;

-- Contratos que já existem e a Equipe, que a versão anterior pulava.
select private.seed_contract_automation(c.workspace_id) from private.workspace_contracts c;
select private.seed_contract_automation(b.workspace_id)
from private.workspace_billing b
where b.unlimited_credits
  and not exists (
    select 1 from private.workspace_contracts c where c.workspace_id = b.workspace_id
  );

-- O limite que a tela mostra: um só, o do contrato, e quanto do mês já foi usado.
create or replace function public.automation_limit_summary(p_workspace_id uuid)
returns table (
  unlimited boolean,
  monthly_limit numeric,
  tier_credits numeric,
  month_usage numeric,
  contract_status text,
  inactive boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);
  return query
  select
    private.credits_unlimited(p_workspace_id),
    private.workspace_monthly_limit(p_workspace_id),
    (select t.monthly_credits::numeric
     from private.workspace_contracts c
     join private.contract_tiers t on t.id = c.tier_id
     where c.workspace_id = p_workspace_id),
    private.workspace_period_usage(p_workspace_id),
    (select c.status from private.workspace_contracts c where c.workspace_id = p_workspace_id),
    private.automation_contract_block(p_workspace_id) is not null;
end;
$$;

revoke all on function public.automation_limit_summary(uuid) from public, anon;
grant execute on function public.automation_limit_summary(uuid) to authenticated;

-- O Administrador grava o limite mensal do Workspace, até os créditos da faixa, e os três tipos de ação passam a usar esse teto.
create or replace function public.set_workspace_monthly_limit(p_workspace_id uuid, p_limit numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tier_credits numeric;
begin
  if private.require_active_membership(p_workspace_id) <> 'admin' then
    raise exception 'only administrators can change automation' using errcode = '42501';
  end if;
  if private.credits_unlimited(p_workspace_id) then
    raise exception 'unlimited workspace has no monthly limit' using errcode = '22023';
  end if;
  select t.monthly_credits::numeric into v_tier_credits
  from private.workspace_contracts c
  join private.contract_tiers t on t.id = c.tier_id
  where c.workspace_id = p_workspace_id;
  if not found then
    raise exception 'active contract required' using errcode = 'P0001';
  end if;
  if p_limit is null or p_limit <= 0 then
    raise exception 'invalid monthly cap' using errcode = '22023';
  end if;
  if p_limit > v_tier_credits then
    raise exception 'monthly limit above tier' using errcode = '22023';
  end if;
  update private.workspace_contracts
  set monthly_credit_limit = p_limit, updated_at = now()
  where workspace_id = p_workspace_id;
  update private.automation_settings s
  set monthly_cap = p_limit,
      paused_at = case
        when p_limit > coalesce((
          select g.spent from private.automation_spend g
          where g.workspace_id = s.workspace_id and g.scope = s.scope
            and g.month = date_trunc('month', now())::date
        ), 0) then null
        else s.paused_at
      end,
      updated_at = now()
  where s.workspace_id = p_workspace_id
    and s.scope in ('acao:varredura', 'acao:enriquecimento', 'acao:agentes');
end;
$$;

revoke all on function public.set_workspace_monthly_limit(uuid, numeric) from public, anon;
grant execute on function public.set_workspace_monthly_limit(uuid, numeric) to authenticated;

-- O Aviso de retomada entra ao lado do teto atingido.
do $kind$
declare
  v_name text;
begin
  select con.conname into v_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'private'
    and rel.relname = 'workspace_notices'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) like '%teto_atingido%';
  if v_name is not null then
    execute format('alter table private.workspace_notices drop constraint %I', v_name);
  end if;
end
$kind$;

alter table private.workspace_notices
  add constraint workspace_notices_kind_check
  check (kind in ('teto_atingido', 'automacao_retomada'));
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
  if private.automation_contract_block(p_workspace_id) is not null then
    return query select 'contrato_inativo'::text, null::uuid;
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
  if private.automation_contract_block(v_rescan.workspace_id) is not null then
    return query select 'contrato_inativo'::text, null::uuid;
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

  if private.automation_contract_block(p_workspace_id) is not null then
    return query select 'contrato_inativo'::text, null::uuid, null::uuid, 0, 0::numeric;
    return;
  end if;

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

create or replace function public.claim_due_signal_monitors(p_limit integer default 5)
returns table (
  monitor_id uuid, workspace_id uuid, signal_type text, criteria jsonb, created_by uuid, slot timestamptz, accounts jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select m.id from private.signal_monitors m
    where private.signal_type_is_runnable(m.signal_type)
      and m.state = 'ativo' and m.next_run_at <= now() and (m.claimed_until is null or m.claimed_until < now())
      and private.automation_contract_block(m.workspace_id) is null
    order by m.next_run_at, m.id
    limit least(greatest(coalesce(p_limit, 5), 1), 20)
    for update of m skip locked
  ), claimed as (
    update private.signal_monitors m set claimed_until = now() + interval '15 minutes'
    from due where m.id = due.id
    returning m.*
  )
  select c.id, c.workspace_id, c.signal_type, c.criteria,
    (select p.user_id from public.workspace_memberships p
     where p.workspace_id = c.workspace_id and p.user_id = c.created_by and p.active),
    c.next_run_at,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'domain', x.domain, 'linkedinUrl', x.linkedin_url,
          'cnpj', x.legal_identifier, 'contatos', private.signal_scan_contacts(c.workspace_id, x.id))
        order by (((x.pos - 1 - c.scan_offset) % x.total) + x.total) % x.total)
      from (
        select t.id, t.name, t.domain, t.linkedin_url, t.legal_identifier,
          row_number() over (order by t.name, t.id) as pos, count(*) over () as total
        from public.target_accounts t
        where t.workspace_id = c.workspace_id and t.archived_at is null and t.deleted_at is null
          and t.id::text in (select jsonb_array_elements_text(c.audience -> 'accountIds'))
      ) x
    ), '[]'::jsonb)
  from claimed c;
end;
$$;

create or replace function public.claim_signal_rescans(p_limit integer default 5)
returns table (
  rescan_id uuid, workspace_id uuid, origin text, requested_by uuid, requested_at timestamptz, account jsonb, monitors jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.signal_rescans r set state = 'stopped', finished_at = now(), claimed_until = null,
    last_error = 'A Conta foi arquivada ou apagada.'
  where r.state = 'pending' and exists (
    select 1 from public.target_accounts a
    where a.workspace_id = r.workspace_id and a.id = r.target_account_id
      and (a.archived_at is not null or a.deleted_at is not null));
  update private.signal_rescans r set state = 'stopped', finished_at = now(), claimed_until = null,
    last_error = 'Nenhum Monitoramento ativo para buscar.'
  where r.state = 'pending' and not exists (select 1 from private.rescan_monitors(r.workspace_id));

  return query
  with due as (
    select r.id from private.signal_rescans r
    where r.state = 'pending' and (r.claimed_until is null or r.claimed_until < now())
      and private.automation_contract_block(r.workspace_id) is null
    order by (r.origin = 'manual') desc, r.requested_at, r.id
    limit least(greatest(coalesce(p_limit, 5), 1), 20)
    for update of r skip locked
  ), claimed as (
    update private.signal_rescans r set claimed_until = now() + interval '15 minutes'
    from due where r.id = due.id
    returning r.*
  )
  select c.id, c.workspace_id, c.origin,
    (select p.user_id from public.workspace_memberships p
     where p.workspace_id = c.workspace_id and p.user_id = c.requested_by and p.active),
    c.requested_at,
    (select jsonb_build_object('id', a.id, 'name', a.name, 'domain', a.domain, 'linkedinUrl', a.linkedin_url,
        'contatos', private.signal_scan_contacts(c.workspace_id, a.id))
     from public.target_accounts a where a.workspace_id = c.workspace_id and a.id = c.target_account_id),
    coalesce((
      select jsonb_agg(jsonb_build_object('monitorId', m.monitor_id, 'signalType', m.signal_type, 'criteria', m.criteria))
      from private.rescan_monitors(c.workspace_id) m
    ), '[]'::jsonb)
  from claimed c
  order by (c.origin = 'manual') desc, c.requested_at, c.id;
end;
$$;

create or replace function public.claim_due_step_sends(p_limit integer default 10)
returns table (send_id uuid, owner_user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_pace boolean := private.send_rate_enabled();
begin
  perform private.expire_stale_sends(null);

  return query
  with eligible as (
    select e.id,
      case when v_pace then row_number() over (partition by e.workspace_id, e.owner_user_id order by e.scheduled_for, e.id) else 1 end as rn
    from private.sequence_step_sends e
    join public.sequences s on s.id = e.sequence_id and s.status = 'ativa'
    join private.sequence_authorizations a on a.id = e.authorization_id and a.revoked_at is null
    where e.channel = 'email'
      and e.status = 'scheduled' and e.scheduled_for <= private.clock_now()
      and (e.claimed_until is null or e.claimed_until < now())
      and private.automation_contract_block(e.workspace_id) is null
  ), due as (
    select e.id from private.sequence_step_sends e
    join eligible g on g.id = e.id and g.rn = 1
    order by e.scheduled_for
    limit greatest(1, least(coalesce(p_limit, 10), 50))
    for update of e skip locked
  )
  update private.sequence_step_sends e set claimed_until = now() + interval '2 minutes'
  from due
  where e.id = due.id
  returning e.id, e.owner_user_id;
end;
$$;

create or replace function public.claim_due_chat_step_sends(p_limit integer default 10)
returns table (send_id uuid, owner_user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_pace boolean := private.send_rate_enabled();
begin
  perform private.expire_stale_sends(null);

  return query
  with eligible as (
    select e.id,
      case when v_pace then row_number() over (partition by e.workspace_id, e.owner_user_id, e.channel order by e.scheduled_for, e.id) else 1 end as rn
    from private.sequence_step_sends e
    join public.sequences s on s.id = e.sequence_id and s.status = 'ativa'
    join private.sequence_authorizations a on a.id = e.authorization_id and a.revoked_at is null
    where e.channel in ('whatsapp', 'linkedin') and private.chat_channel_enabled(e.channel)
      and e.status = 'scheduled' and e.scheduled_for <= private.clock_now()
      and (e.claimed_until is null or e.claimed_until < now())
      and private.automation_contract_block(e.workspace_id) is null
  ), due as (
    select e.id from private.sequence_step_sends e
    join eligible g on g.id = e.id and g.rn = 1
    order by e.scheduled_for
    limit greatest(1, least(coalesce(p_limit, 10), 50))
    for update of e skip locked
  )
  update private.sequence_step_sends e set claimed_until = now() + interval '2 minutes'
  from due
  where e.id = due.id
  returning e.id, e.owner_user_id;
end;
$$;

create or replace function private.enqueue_due_agent_routines(p_now timestamptz default now())
returns table (routine_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  r private.agent_routines%rowtype;
  v_estimate numeric := private.routine_run_estimate();
  v_scope text;
  v_reason text;
  v_conversation uuid;
  v_next timestamptz;
  v_run uuid;
begin
  for r in
    select x.* from private.agent_routines x
    where not x.paused and x.next_run_at <= p_now
    order by x.next_run_at, x.id
    for update skip locked
  loop
    routine_id := r.id;
    v_scope := 'rotina:' || r.id::text;
    v_next := private.next_routine_run(r.frequency, r.weekday, r.run_time, r.day_of_month, p_now);

    if r.owner_id is null or not exists (
      select 1 from public.workspace_memberships m
      where m.workspace_id = r.workspace_id and m.user_id = r.owner_id and m.active
    ) then
      update private.agent_routines set paused = true, next_run_at = v_next, updated_at = now() where id = r.id;
      outcome := 'sem_dono';
      return next;
      continue;
    end if;

    -- Uma Execução parada além do prazo deixa de contar como aberta (o worker não está no ar).
    perform private.expire_run_if_stale(a.id)
    from private.agent_runs a where a.routine_id = r.id and a.status in ('queued', 'running');
    if exists (select 1 from private.agent_runs a where a.routine_id = r.id and a.status in ('queued', 'running')) then
      update private.agent_routines set next_run_at = v_next where id = r.id;
      outcome := 'execucao_aberta';
      return next;
      continue;
    end if;

    if private.automation_contract_block(r.workspace_id) is not null then
      update private.agent_routines set next_run_at = v_next where id = r.id;
      outcome := 'contrato_inativo';
      return next;
      continue;
    end if;

    v_reason := public.consume_automation_cap(r.workspace_id, v_scope, v_estimate);
    if v_reason <> 'ok' then
      update private.agent_routines set next_run_at = v_next where id = r.id;
      outcome := v_reason;
      return next;
      continue;
    end if;

    select c.id into v_conversation
    from private.agent_conversations c where c.id = r.conversation_id and c.owner_id = r.owner_id;
    if v_conversation is null then
      insert into private.agent_conversations (workspace_id, owner_id, kind, agent_id)
      values (r.workspace_id, r.owner_id, 'agente', r.agent_id)
      returning id into v_conversation;
    end if;

    begin
      insert into private.agent_runs (
        workspace_id, conversation_id, requested_by, client_request_id, request_text, trigger_kind, routine_id
      )
      values (
        r.workspace_id, v_conversation, r.owner_id,
        md5(r.id::text || ':' || extract(epoch from r.next_run_at)::text)::uuid, r.task, 'rotina', r.id
      )
      returning id into v_run;
    exception when unique_violation then
      perform private.refund_automation_cap(r.workspace_id, v_scope, v_estimate);
      update private.agent_routines set next_run_at = v_next where id = r.id;
      outcome := 'execucao_aberta';
      return next;
      continue;
    end;
    update private.agent_conversations set updated_at = clock_timestamp() where id = v_conversation;
    update private.agent_routines
    set conversation_id = v_conversation, last_fired_at = p_now, next_run_at = v_next
    where id = r.id;
    outcome := 'criada';
    return next;
  end loop;
end;
$$;

create or replace function public.claim_agent_run(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run private.agent_runs%rowtype;
  v_conversation private.agent_conversations%rowtype;
  v_estimate integer;
begin
  select * into v_run from private.agent_runs r where r.id = p_run_id for update;
  if not found or v_run.status <> 'queued' then
    return null;
  end if;
  select * into v_conversation from private.agent_conversations c where c.id = v_run.conversation_id;
  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = v_run.workspace_id and m.user_id = v_run.requested_by and m.active
  ) then
    perform private.append_run_event(p_run_id, 'falha', null, null, jsonb_build_object('motivo', 'membership_inactive'));
    update private.agent_runs
    set status = 'failed', error_code = 'membership_inactive', finished_at = clock_timestamp()
    where id = p_run_id;
    perform private.close_run_credits(p_run_id);
    return null;
  end if;
  -- Execução de Rotina cuja Rotina foi pausada ou apagada depois de entrar na fila (a corrida entre o relógio e o clique
  -- em "pausar"): fecha sem chamar o modelo. Apagada, o `routine_id` ficou nulo.
  if v_run.trigger_kind = 'rotina' and not exists (
    select 1 from private.agent_routines r where r.id = v_run.routine_id and not r.paused
  ) then
    perform private.append_run_event(p_run_id, 'falha', null, null, jsonb_build_object('motivo', 'routine_paused'));
    update private.agent_runs
    set status = 'failed', error_code = 'routine_paused', finished_at = clock_timestamp()
    where id = p_run_id;
    perform private.close_run_credits(p_run_id);
    return null;
  end if;

  if v_run.trigger_kind = 'rotina' and private.automation_contract_block(v_run.workspace_id) is not null then
    perform private.append_run_event(p_run_id, 'falha', null, null, jsonb_build_object('motivo', 'contrato_inativo'));
    update private.agent_runs
    set status = 'failed', error_code = 'contrato_inativo', finished_at = clock_timestamp()
    where id = p_run_id;
    perform private.close_run_credits(p_run_id);
    return null;
  end if;

  if private.credits_enforced(v_run.workspace_id) then
    v_estimate := case
      when v_conversation.kind = 'coordenada' then 3
      else 1 + (
        select count(distinct a.id)::integer from private.agents a
        where a.workspace_id = v_run.workspace_id and a.id = any (v_run.mentions) and a.id is distinct from v_conversation.agent_id
      )
    end;
    begin
      perform public.reserve_credits(
        v_run.workspace_id, v_run.requested_by, 'agent_round', 'run:' || p_run_id::text, v_estimate,
        exists (select 1 from private.workspace_ai_keys k where k.workspace_id = v_run.workspace_id)
      );
    exception when others then
      if sqlerrm not in ('insufficient credits', 'monthly credit limit reached') then
        raise;
      end if;
      perform private.append_run_event(p_run_id, 'falha', null, null, jsonb_build_object('motivo', 'insufficient_credits'));
      update private.agent_runs
      set status = 'failed', error_code = 'insufficient_credits', finished_at = clock_timestamp()
      where id = p_run_id;
      perform private.close_run_credits(p_run_id);
      return null;
    end;
  end if;

  update private.agent_runs set status = 'running', started_at = clock_timestamp() where id = p_run_id;

  return jsonb_build_object(
    'run_id', v_run.id,
    'kind', v_conversation.kind,
    'workspace_name', (select w.name from public.workspaces w where w.id = v_run.workspace_id),
    'request_text', v_run.request_text,
    'agent_id', v_conversation.agent_id,
    'mentions', to_jsonb(v_run.mentions),
    'agents', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', a.id, 'name', a.name, 'specialty', a.specialty, 'kind', a.kind,
          'instructions', coalesce(s.instructions, ''), 'voice_tone', coalesce(s.voice_tone, '')
        ) order by (a.kind = 'criado'), c.position, a.created_at, a.id)
      from private.agents a
      join private.specialty_catalog c on c.specialty = a.specialty
      left join private.agent_settings s on s.agent_id = a.id
      where a.workspace_id = v_run.workspace_id
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('request', h.request_text, 'answer', h.answer) order by h.created_at)
      from (
        select r.request_text, r.created_at,
          (select string_agg(coalesce(e.agent_name || ': ', '') || (e.payload ->> 'texto'), E'\n\n' order by e.seq)
           from private.agent_run_events e
           where e.run_id = r.id and e.kind in ('texto', 'resposta')) as answer
        from private.agent_runs r
        where r.conversation_id = v_run.conversation_id and r.status = 'succeeded' and r.id <> v_run.id
        order by r.created_at desc
        limit 10
      ) h
    ), '[]'::jsonb)
  );
end;
$$;

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
      and private.automation_contract_block(c.workspace_id) is null
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
  with retomados as (
    update private.automation_settings s set paused_at = null
    where s.workspace_id = p_workspace_id
      and s.scope in ('acao:varredura', 'acao:enriquecimento', 'acao:agentes')
      and s.paused_at is not null
    returning s.scope
  )
  insert into private.workspace_notices (workspace_id, kind, title, body, link)
  select p_workspace_id, 'automacao_retomada', 'Automação retomada',
    'Automação retomada com os créditos do novo mês', '/configuracoes/automacao'
  where exists (select 1 from retomados);

  insert into private.contract_renewals (workspace_id, period_start, plan_zeroed, pacote_expired, granted)
  values (p_workspace_id, v_period, v_zeroed, v_expired, v_tier.monthly_credits);
  return true;
end;
$$;

create or replace function public.list_automation_settings(p_workspace_id uuid)
returns table (
  scope text,
  kind text,
  name text,
  mode text,
  monthly_cap numeric,
  month_spent numeric,
  blocked_reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);
  return query
  select s.scope, s.kind, s.name, coalesce(c.mode, 'confirmar'), c.monthly_cap, coalesce(g.spent, 0),
    case
      when private.credits_unlimited(p_workspace_id) and s.kind = 'acao' and coalesce(c.mode, 'confirmar') = 'automatico' then null
      else private.automation_block_reason(c.mode, c.monthly_cap, g.spent, c.paused_at)
    end
  from private.automation_scopes(p_workspace_id) s
  left join private.automation_settings c on c.workspace_id = p_workspace_id and c.scope = s.scope
  left join private.automation_spend g
    on g.workspace_id = p_workspace_id and g.scope = s.scope and g.month = date_trunc('month', now())::date
  order by s.ordem;
end;
$$;

create or replace function public.save_automation_setting(p_workspace_id uuid, p_scope text, p_mode text, p_monthly_cap numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_spent numeric;
begin
  if private.require_active_membership(p_workspace_id) <> 'admin' then
    raise exception 'only administrators can change automation' using errcode = '42501';
  end if;
  if not exists (select 1 from private.automation_scopes(p_workspace_id) s where s.scope = p_scope) then
    raise exception 'unknown automation scope' using errcode = '22023';
  end if;
  if p_mode not in ('confirmar', 'automatico') then
    raise exception 'invalid automation mode' using errcode = '22023';
  end if;
  if p_mode = 'automatico' and not private.automation_scope_runs(p_workspace_id, p_scope) then
    raise exception 'automatic mode is not available for this scope yet' using errcode = '22023';
  end if;
  if p_monthly_cap is not null and p_monthly_cap <= 0 then
    raise exception 'invalid monthly cap' using errcode = '22023';
  end if;
  if p_mode = 'automatico' and p_monthly_cap is null and not private.credits_unlimited(p_workspace_id) then
    raise exception 'automatic mode requires an approved monthly cap' using errcode = '22023';
  end if;
  select g.spent into v_spent from private.automation_spend g
  where g.workspace_id = p_workspace_id and g.scope = p_scope and g.month = date_trunc('month', now())::date;
  insert into private.automation_settings (workspace_id, scope, mode, monthly_cap, updated_by)
  values (p_workspace_id, p_scope, p_mode, p_monthly_cap, auth.uid())
  on conflict (workspace_id, scope) do update set
    mode = excluded.mode,
    monthly_cap = excluded.monthly_cap,
    paused_at = case
      when private.credits_unlimited(p_workspace_id) and excluded.monthly_cap is null then null
      when excluded.monthly_cap > coalesce(v_spent, 0) then null
      else private.automation_settings.paused_at
    end,
    updated_by = excluded.updated_by,
    updated_at = now();
end;
$$;

-- Cópia mensal das fontes públicas e execução adiada (sinais em cascata, ticket 16).
-- A estatística de comércio exterior e a lista de consumidores livres mudam uma vez por mês. A função lê a cópia
-- antes da rede. Se a estatística continuar limitando as consultas, a execução fecha como 'adiado': tenta de novo
-- depois, sem cobrar crédito, e o Monitoramento do mesmo dia pode tentar outra vez. O relógio diário, onde o
-- agendador existe, pede ao signal-runner que encha a cópia (`{"action":"aquecer"}`), com o token que ele já confere.

-- 1. A cópia. Só o servidor, pelas funções abaixo. A chave de serviço não lê a tabela direto.
create table private.public_source_cache (
  source text not null check (source in ('comexstat', 'consumidores_livres')),
  query_key text not null check (length(query_key) between 1 and 500),
  reference_month text not null check (reference_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (source, query_key, reference_month)
);

alter table private.public_source_cache enable row level security;
revoke all on table private.public_source_cache from public, anon, authenticated, service_role;

-- Sem mês, a cópia mais nova dos últimos 40 dias (a lista de consumidores). Com mês, aquela linha, mesmo antiga
-- (a estatística de um mês já publicado).
create function public.read_public_source_cache(p_source text, p_query_key text, p_reference_month text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  if p_reference_month is null or btrim(p_reference_month) = '' then
    select c.payload into v
    from private.public_source_cache c
    where c.source = p_source and c.query_key = p_query_key
      and c.fetched_at >= now() - interval '40 days'
    order by c.fetched_at desc
    limit 1;
    return v;
  end if;
  select c.payload into v
  from private.public_source_cache c
  where c.source = p_source and c.query_key = p_query_key and c.reference_month = p_reference_month;
  return v;
end;
$$;

create function public.write_public_source_cache(
  p_source text, p_query_key text, p_reference_month text, p_payload jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_source not in ('comexstat', 'consumidores_livres')
    or p_query_key is null or length(p_query_key) < 1 or length(p_query_key) > 500
    or p_reference_month is null or p_reference_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'invalid cache key' using errcode = '22023';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) not in ('object', 'array') then
    raise exception 'invalid payload' using errcode = '22023';
  end if;
  if octet_length(p_payload::text) > 2000000 then
    raise exception 'payload too large' using errcode = '22023';
  end if;
  insert into private.public_source_cache (source, query_key, reference_month, payload, fetched_at)
  values (p_source, p_query_key, p_reference_month, p_payload, now())
  on conflict (source, query_key, reference_month) do update
    set payload = excluded.payload, fetched_at = now();
end;
$$;

revoke all on function public.read_public_source_cache(text, text, text) from public, anon, authenticated;
revoke all on function public.write_public_source_cache(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.read_public_source_cache(text, text, text) to service_role;
grant execute on function public.write_public_source_cache(text, text, text, jsonb) to service_role;

-- 2. 'adiado' entra nos estados da execução. CREATE OR REPLACE das duas funções mantém as concessões já feitas.
alter table private.signal_cascade_runs drop constraint signal_cascade_runs_state_check;
alter table private.signal_cascade_runs add constraint signal_cascade_runs_state_check
  check (state in ('running', 'succeeded', 'partial', 'aborted', 'failed', 'adiado'));

create function public.begin_cascade_run(
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

  select coalesce(sum(case when r.status = 'settled' then r.unit_credits * r.settled_quantity else r.amount end), 0)
  into v_today
  from private.credit_reservations r
  where r.workspace_id = p_workspace_id and r.action = 'cascata_de_sinais' and r.status in ('reserved', 'settled')
    and r.created_at >= date_trunc('day', now());
  if v_today + v_credits > v_set.daily_credit_cap then
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

-- Adiado cobra zero mesmo que a execução tenha visto Sinal: a fonte pediu para tentar de novo e nada se confirma.
create function public.finish_cascade_run(
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

  if p_state = 'adiado' then
    v_credits := 0;
  elsif coalesce(p_real_cost_usd, 0) = 0 and (p_state = 'failed' or p_real_cost_usd is not null) then
    v_credits := 0;
  elsif p_real_cost_usd is null then
    v_credits := case when coalesce(p_signals_new, 0) > 0 then v_run.est_credits else 0 end;
  else
    v_credits := floor(p_real_cost_usd * v_c.price_multiplier / v_set.usd_per_credit)::integer;
  end if;
  if p_state <> 'adiado' and coalesce(p_signals_new, 0) > 0 then
    v_credits := greatest(v_credits, 1);
  end if;
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

-- 3. A nota do Grupo A: a cópia do mês entra antes de marcar que a exclusão não foi feita.
update private.signal_cascades set
  notes = 'Inferência, não confirmação: atividade e porte da Receita, fora da lista de consumidores livres e especiais da CCEE (pela raiz do CNPJ). A lista é aberta e a URL fica no modelo do passo 2. Se a lista pública não responde, a execução usa a cópia já guardada do mês. Sem cópia recente, o Sinal sai marcado de que a exclusão não foi feita, sem afirmar que a empresa está fora do mercado livre. Se a lista não cabe no limite de leitura, nada é afirmado.',
  updated_at = now()
where signal_type = 'grupo_a_cativo';

-- 4. O relógio diário chama o signal-runner com a ação de aquecer. Sem a URL configurada, ou sem o pg_net, não dispara.
create function private.kick_comexstat_cache()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings private.signal_runner_settings;
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'net' and p.proname = 'http_post'
  ) then
    return false;
  end if;
  select s.* into v_settings from private.signal_runner_settings s;
  if v_settings.function_url is null then
    return false;
  end if;
  perform net.http_post(
    url := v_settings.function_url,
    body := '{"action":"aquecer"}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-runner-token', v_settings.token),
    timeout_milliseconds := 5000);
  return true;
end;
$$;

revoke all on function private.kick_comexstat_cache() from public, anon, authenticated, service_role;

do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
    and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('althius-comexstat-cache', '0 6 * * *', 'select private.kick_comexstat_cache()');
  end if;
end
$cron$;

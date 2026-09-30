-- A reativação de Sinais (sinais-reais, ticket 08): revisitar as Contas-alvo com Fit que esfriaram (sem Sinal válido).
-- Duas portas, uma fila só: a busca sob pedido, pelo botão "Buscar Sinais de novo" na Conta, que mostra o custo antes
-- e vale um clique do participante; e a mensal automática, que só enfileira dentro do teto aprovado da varredura
-- (creditos-e-planos 03). Cada busca varre a Conta com todos os Monitoramentos ativos do Workspace, mesmo que a Conta
-- não esteja no público deles, e cada varredura reserva e debita 1 crédito, como a varredura do Monitoramento (ticket 02).
-- Só acontecimento novo reaquece: o mesmo acontecimento continua sendo reencontro, não renova o prazo (ADR-0007).

-- 1. A fila de buscas. Uma busca pendente por Conta; a que terminou fica de histórico.
create table private.signal_rescans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  target_account_id uuid not null,
  origin text not null check (origin in ('manual', 'mensal')),
  requested_by uuid references auth.users(id) on delete set null,
  state text not null default 'pending' check (state in ('pending', 'done', 'stopped')),
  -- A hora do pedido também identifica a cobrança da busca.
  requested_at timestamptz not null default now(),
  claimed_until timestamptz,
  finished_at timestamptz,
  scanned integer not null default 0 check (scanned >= 0),
  -- O motivo de a busca não ter varrido tudo, em palavras do produto.
  last_error text check (last_error is null or length(last_error) <= 500),
  foreign key (workspace_id, target_account_id) references public.target_accounts(workspace_id, id) on delete cascade
);

create unique index signal_rescans_one_pending_idx on private.signal_rescans (workspace_id, target_account_id)
  where state = 'pending';
create index signal_rescans_pending_idx on private.signal_rescans (requested_at) where state = 'pending';
create index signal_rescans_account_idx on private.signal_rescans (workspace_id, target_account_id, requested_at desc);
create index signal_rescans_requested_by_idx on private.signal_rescans (requested_by);

alter table private.signal_rescans enable row level security;
revoke all on private.signal_rescans from public, anon, authenticated, service_role;

-- Os Monitoramentos que uma busca usa: os ativos do Workspace, de um Sinal cujo actor está disponível.
create function private.rescan_monitors(p_workspace_id uuid)
returns table (monitor_id uuid, signal_type text, criteria jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.signal_type, m.criteria
  from private.signal_monitors m
  join private.signal_actors a on a.signal_type = m.signal_type and a.state = 'available'
  where m.workspace_id = p_workspace_id and m.state = 'ativo'
  order by m.created_at, m.id;
$$;

-- O custo de uma busca: quantos Monitoramentos rodam e quantos créditos custam (1 por Monitoramento). Uma conta só, para
-- o que o botão mostra e o que o pedido confere nunca divergirem.
create function private.rescan_cost(p_workspace_id uuid)
returns table (monitors integer, credits numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select m.n, m.n * (select c.credits from private.credit_action_prices c where c.action = 'account_scan')
  from (select count(*)::integer as n from private.rescan_monitors(p_workspace_id)) m;
$$;

revoke all on function private.rescan_cost(uuid) from public, anon, authenticated, service_role;

-- A Conta existe neste Workspace e aceita varredura nova (não está arquivada nem apagada).
create function private.assert_rescannable(p_workspace_id uuid, p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.target_accounts a where a.workspace_id = p_workspace_id and a.id = p_account_id) then
    raise exception 'target account not found' using errcode = 'P0002';
  end if;
  perform private.assert_account_operable(p_workspace_id, p_account_id);
end;
$$;

revoke all on function private.rescan_monitors(uuid) from public, anon, authenticated, service_role;
revoke all on function private.assert_rescannable(uuid, uuid) from public, anon, authenticated, service_role;

-- 2. O botão da Conta. O custo antes: quantos Monitoramentos rodariam, quantos créditos custam, o saldo disponível, se
-- já há uma busca em andamento e como terminou a última.
create function public.quote_account_rescan(p_workspace_id uuid, p_target_account_id uuid)
returns table (
  monitors integer,
  credits numeric,
  available numeric,
  in_progress boolean,
  last_finished_at timestamptz,
  last_error text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cost record;
  v_available numeric;
  v_last record;
begin
  perform private.require_active_membership(p_workspace_id);
  perform private.assert_rescannable(p_workspace_id, p_target_account_id);
  select * into v_cost from private.rescan_cost(p_workspace_id);
  select t.booked - t.reserved into v_available from private.credit_totals(p_workspace_id) t;
  select r.finished_at, r.last_error into v_last from private.signal_rescans r
  where r.workspace_id = p_workspace_id and r.target_account_id = p_target_account_id and r.state <> 'pending'
  order by r.finished_at desc nulls last, r.requested_at desc limit 1;
  return query select
    v_cost.monitors,
    v_cost.credits,
    v_available,
    exists (
      select 1 from private.signal_rescans r
      where r.workspace_id = p_workspace_id and r.target_account_id = p_target_account_id and r.state = 'pending'),
    v_last.finished_at,
    v_last.last_error;
end;
$$;

-- Pede a busca. Qualquer participante ativo pede (o clique é a confirmação, então o interruptor do automático não
-- entra); sem Monitoramento ativo, sem saldo ou acima do limite mensal de quem pede, recusa já, com o motivo. Pedir de
-- novo enquanto a busca não terminou devolve a mesma. O relógio é chamado na hora, para a busca não esperar a próxima
-- volta.
create function public.request_account_rescan(p_workspace_id uuid, p_target_account_id uuid)
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
begin
  perform private.require_active_membership(p_workspace_id);
  perform private.assert_rescannable(p_workspace_id, p_target_account_id);
  select r.id into v_id from private.signal_rescans r
  where r.workspace_id = p_workspace_id and r.target_account_id = p_target_account_id and r.state = 'pending';
  if found then
    return v_id;
  end if;

  select * into v_cost from private.rescan_cost(p_workspace_id);
  if v_cost.monitors = 0 then
    raise exception 'no active monitor to search with' using errcode = '22023';
  end if;
  select t.booked - t.reserved into v_available from private.credit_totals(p_workspace_id) t;
  if v_available < v_cost.credits then
    raise exception 'insufficient credits' using errcode = 'P0001', hint = 'credits';
  end if;
  select l.monthly_limit into v_limit from private.credit_member_limits l
  where l.workspace_id = p_workspace_id and l.user_id = v_user;
  if v_limit is not null and private.credit_member_month_usage(p_workspace_id, v_user) + v_cost.credits > v_limit then
    raise exception 'monthly credit limit reached' using errcode = 'P0001', hint = 'credits';
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

revoke all on function public.quote_account_rescan(uuid, uuid) from public, anon;
revoke all on function public.request_account_rescan(uuid, uuid) from public, anon;
grant execute on function public.quote_account_rescan(uuid, uuid) to authenticated;
grant execute on function public.request_account_rescan(uuid, uuid) to authenticated;

-- 3. A varredura automática (signal-runner) cuida da fila. Reivindica as buscas pendentes, com uma reserva de 15
-- minutos, e devolve a Conta e os Monitoramentos que rodam, primeiro as do clique. A busca de uma Conta que foi
-- arquivada ou apagada, ou de um Workspace sem Monitoramento ativo, para aqui mesmo, com o motivo. Quem pediu só vem se
-- ainda participa do Workspace. Só o servidor.
create function public.claim_signal_rescans(p_limit integer default 5)
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
    (select jsonb_build_object('id', a.id, 'name', a.name, 'domain', a.domain, 'linkedinUrl', a.linkedin_url)
     from public.target_accounts a where a.workspace_id = c.workspace_id and a.id = c.target_account_id),
    coalesce((
      select jsonb_agg(jsonb_build_object('monitorId', m.monitor_id, 'signalType', m.signal_type, 'criteria', m.criteria))
      from private.rescan_monitors(c.workspace_id) m
    ), '[]'::jsonb)
  from claimed c
  order by (c.origin = 'manual') desc, c.requested_at, c.id;
end;
$$;

-- Fecha uma volta da busca: "pending" solta a reserva e a deixa na fila para continuar (o tempo da função acabou no
-- meio); "done" e "stopped" a encerram. O que já terminou não muda mais. Só o servidor.
create function public.finish_signal_rescan(p_rescan_id uuid, p_state text, p_scanned integer, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_state not in ('pending', 'done', 'stopped') then
    raise exception 'invalid rescan state' using errcode = '22023';
  end if;
  update private.signal_rescans set
    state = p_state,
    claimed_until = null,
    finished_at = case when p_state = 'pending' then null else now() end,
    scanned = scanned + greatest(coalesce(p_scanned, 0), 0),
    last_error = nullif(left(coalesce(p_error, ''), 500), '')
  where id = p_rescan_id and state = 'pending';
  if not found and not exists (select 1 from private.signal_rescans r where r.id = p_rescan_id) then
    raise exception 'rescan not found' using errcode = 'P0002';
  end if;
end;
$$;

-- O teto da varredura ou o saldo acabou: as buscas mensais pendentes do Workspace param de uma vez, em vez de cada uma
-- tentar e parar. A busca do clique fica, porque quem pediu vê o próprio motivo. Devolve quantas parou. Só o servidor.
create function public.stop_workspace_rescans(p_workspace_id uuid, p_error text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stopped integer;
begin
  update private.signal_rescans set state = 'stopped', claimed_until = null, finished_at = now(),
    last_error = nullif(left(coalesce(p_error, ''), 500), '')
  where workspace_id = p_workspace_id and origin = 'mensal' and state = 'pending';
  get diagnostics v_stopped = row_count;
  return v_stopped;
end;
$$;

revoke all on function public.claim_signal_rescans(integer) from public, anon, authenticated;
revoke all on function public.finish_signal_rescan(uuid, text, integer, text) from public, anon, authenticated;
revoke all on function public.stop_workspace_rescans(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_signal_rescans(integer) to service_role;
grant execute on function public.finish_signal_rescan(uuid, text, integer, text) to service_role;
grant execute on function public.stop_workspace_rescans(uuid, text) to service_role;

-- 4. Crédito e teto de cada varredura da busca, de forma atômica, no desenho de `begin_account_scan` (ticket 02). A
-- chave da reserva é a busca e o Monitoramento, então repetir a volta (a função caiu no meio) nunca cobra duas vezes:
--   go / resume  varre (resume: a reserva já existia); done: já concluída; skip: já falhou nesta busca;
--   no_credits   sem saldo ou no limite mensal de quem pediu; confirmar, sem_teto, teto_atingido: o automático não roda.
-- A busca do clique (manual) só gasta crédito: o clique é a confirmação, então o interruptor e o teto do automático não
-- entram. A busca mensal gasta do teto como qualquer varredura automática. Uma recusa não deixa nada para trás. Quem
-- pediu e saiu do Workspace não trava a busca: o crédito é do Workspace.
create function public.begin_rescan_scan(p_rescan_id uuid, p_monitor_id uuid)
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
    v_id := public.reserve_credits(v_rescan.workspace_id, v_user, 'account_scan', v_key, 1, false);
  exception when others then
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

revoke all on function public.begin_rescan_scan(uuid, uuid) from public, anon, authenticated;
grant execute on function public.begin_rescan_scan(uuid, uuid) to service_role;

-- Fecha a varredura de uma busca: concluída, debita o crédito; falha, solta a reserva e, na busca mensal (a única que
-- gastou do teto), devolve o teto. Repetir não faz nada. É irmã de `end_account_scan` (ticket 02), que não muda: a origem
-- vem da busca, sem depender do texto da chave da reserva.
create function public.end_rescan_scan(p_rescan_id uuid, p_reservation_id uuid, p_success boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rescan private.signal_rescans%rowtype;
  v private.credit_reservations%rowtype;
begin
  select * into v_rescan from private.signal_rescans r where r.id = p_rescan_id;
  if not found then
    raise exception 'rescan not found' using errcode = 'P0002';
  end if;
  select * into v from private.credit_reservations r
  where r.id = p_reservation_id and r.workspace_id = v_rescan.workspace_id for update;
  if not found then
    raise exception 'credit reservation not found' using errcode = 'P0002';
  end if;
  if v.status <> 'reserved' then
    return;
  end if;
  if p_success then
    perform public.settle_credits(v.id, null);
  else
    perform public.release_credits(v.id);
    if v_rescan.origin = 'mensal' then
      perform private.refund_automation_cap(v.workspace_id, 'acao:varredura', v.amount);
    end if;
  end if;
end;
$$;

revoke all on function public.end_rescan_scan(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.end_rescan_scan(uuid, uuid, boolean) to service_role;

-- 5. A busca mensal. Todo dia o relógio enfileira as Contas com Fit que esfriaram (no kanban, no estágio Fit e sem
-- nenhum Sinal válido) e ainda não foram revisitadas nos últimos 30 dias, por busca do clique ou mensal: cada Conta é
-- revisitada uma vez por mês. Só enfileira num Workspace com o automático da varredura ligado, com teto aprovado e sem
-- pausa, e com Monitoramento ativo para buscar; sem isso a reativação automática não roda (ADR-0019). A busca que parou
-- por falta de teto ou de saldo não conta como feita, então a Conta volta à fila quando o motivo passar. Devolve
-- quantas buscas criou.
create function private.enqueue_monthly_rescans()
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
      and private.automation_block_reason(c.mode, c.monthly_cap, g.spent, c.paused_at) is null
      and exists (select 1 from private.rescan_monitors(c.workspace_id))
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

-- A busca que ninguém pegou em 2 dias (a função não está no ar, por exemplo) é encerrada com o motivo, para a Conta
-- poder pedir outra. Devolve quantas encerrou.
create function private.expire_stale_rescans()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired integer;
begin
  update private.signal_rescans set state = 'stopped', claimed_until = null, finished_at = now(),
    last_error = 'A busca não foi feita a tempo.'
  where state = 'pending' and requested_at < now() - interval '2 days';
  get diagnostics v_expired = row_count;
  return v_expired;
end;
$$;

-- O relógio diário da reativação: encerra o que ficou velho, enfileira o mês e chama a função.
create function private.run_signal_reactivation()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.expire_stale_rescans();
  perform private.enqueue_monthly_rescans();
  perform private.kick_rescan_runner();
end;
$$;

revoke all on function private.enqueue_monthly_rescans() from public, anon, authenticated, service_role;
revoke all on function private.expire_stale_rescans() from public, anon, authenticated, service_role;
revoke all on function private.run_signal_reactivation() from public, anon, authenticated, service_role;

-- O relógio das buscas: chama a função quando há busca pendente, sem mexer no relógio dos Monitoramentos (ticket 02).
-- Sem endereço configurado, nada é chamado. Devolve se chamou.
create function private.kick_rescan_runner()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings private.signal_runner_settings;
begin
  select s.* into v_settings from private.signal_runner_settings s;
  if v_settings.function_url is null or not exists (
    select 1 from private.signal_rescans r
    where r.state = 'pending' and (r.claimed_until is null or r.claimed_until < now())
  ) then
    return false;
  end if;
  perform private.post_to_signal_runner(v_settings.function_url, v_settings.token);
  return true;
end;
$$;

revoke all on function private.kick_rescan_runner() from public, anon, authenticated, service_role;

-- A função da varredura chama o relógio de novo quando uma busca voltou à fila (o tempo dela acabou no meio), em vez de
-- esperar a próxima volta de 10 minutos. Devolve se chamou. Só o servidor.
create function public.kick_rescan_runner()
returns boolean
language sql
security definer
set search_path = ''
as $$
  select private.kick_rescan_runner();
$$;

revoke all on function public.kick_rescan_runner() from public, anon, authenticated;
grant execute on function public.kick_rescan_runner() to service_role;

-- 6. Os relógios, onde o pg_cron e o pg_net existem (no Supabase e no CI, que roda a imagem dele). Onde não
-- existem, nada é ligado.
do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
    and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('althius-signal-reactivation', '17 5 * * *', 'select private.run_signal_reactivation()');
    perform cron.schedule('althius-signal-rescans', '*/10 * * * *', 'select private.kick_rescan_runner()');
  end if;
end
$cron$;

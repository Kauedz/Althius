-- O saldo e o extrato de créditos do Workspace (creditos-e-planos, ticket 02, ADR-0019). O saldo é único por Workspace;
-- entra por plano, pacote ou ajuste e sai por ação. Toda ação paga reserva antes e liquida depois, pela chave dela
-- (idempotente): a reserva que não se confirma volta ao saldo, e o enriquecimento só debita o que achou. O
-- Administrador pode limitar o gasto mensal de cada participante. O saldo nunca fica negativo.
--
-- Os preços em créditos são os provisórios da sabatina, até medir o custo real de um cliente por um mês (ticket 01).

create table private.credit_action_prices (
  action text primary key,
  credits numeric(12, 2) not null check (credits >= 0),
  description text not null
);

insert into private.credit_action_prices (action, credits, description) values
  ('agent_round', 1, 'Um Agente, uma rodada de uma Execução'),
  ('account_scan', 1, 'Uma Conta varrida por um Monitoramento de Sinais'),
  ('person_collected', 1, 'Uma pessoa coletada no enriquecimento'),
  ('email_revealed', 2, 'Um e-mail revelado no enriquecimento'),
  ('phone_revealed', 5, 'Um telefone revelado no enriquecimento');

-- A Execução com a chave de IA do próprio cliente paga a orquestração: 20% do normal.
create function private.own_ai_key_factor()
returns numeric
language sql
immutable
set search_path = ''
as $$
  select 0.2::numeric;
$$;

-- Cada ação paga: reservada, depois liquidada (com o que de fato se usou) ou liberada.
create table private.credit_reservations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null references private.credit_action_prices(action),
  -- A chave da ação (ex.: "agent_run:<id>:rodada:2"): repetir a reserva com a mesma chave devolve a mesma reserva.
  action_key text not null check (length(action_key) between 1 and 300),
  quantity integer not null check (quantity > 0),
  unit_credits numeric(12, 2) not null check (unit_credits >= 0),
  amount numeric(12, 2) not null check (amount >= 0),
  status text not null default 'reserved' check (status in ('reserved', 'settled', 'released')),
  settled_quantity integer check (settled_quantity >= 0),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (workspace_id, action_key)
);

create index credit_reservations_user_idx on private.credit_reservations (workspace_id, user_id, created_at);

-- O extrato: entrada (positiva) por plano, pacote ou ajuste; saída (negativa) por ação liquidada.
create table private.credit_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  amount numeric(12, 2) not null check (amount <> 0),
  kind text not null check (kind in ('plano', 'pacote', 'ajuste', 'acao')),
  reservation_id uuid unique references private.credit_reservations(id),
  user_id uuid references auth.users(id) on delete set null,
  note text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now(),
  check ((kind = 'acao') = (reservation_id is not null)),
  check (kind <> 'acao' or amount < 0)
);

create index credit_entries_workspace_idx on private.credit_entries (workspace_id, created_at desc);

-- O limite mensal de gasto de um participante, definido pelo Administrador. Sem linha, sem limite próprio.
create table private.credit_member_limits (
  workspace_id uuid not null,
  user_id uuid not null,
  monthly_limit numeric(12, 2) not null check (monthly_limit >= 0),
  set_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id),
  foreign key (workspace_id, user_id) references public.workspace_memberships(workspace_id, user_id) on delete cascade
);

alter table private.credit_action_prices enable row level security;
alter table private.credit_reservations enable row level security;
alter table private.credit_entries enable row level security;
alter table private.credit_member_limits enable row level security;
revoke all on private.credit_action_prices from public, anon, authenticated, service_role;
revoke all on private.credit_reservations from public, anon, authenticated, service_role;
revoke all on private.credit_entries from public, anon, authenticated, service_role;
revoke all on private.credit_member_limits from public, anon, authenticated, service_role;

-- O saldo lançado (entradas menos saídas) e o que está reservado agora.
create function private.credit_totals(p_workspace_id uuid, out booked numeric, out reserved numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((select sum(e.amount) from private.credit_entries e where e.workspace_id = p_workspace_id), 0),
    coalesce((select sum(r.amount) from private.credit_reservations r
              where r.workspace_id = p_workspace_id and r.status = 'reserved'), 0);
$$;

-- O que o participante gastou no mês corrente (liquidado) mais o que tem reservado.
create function private.credit_member_month_usage(p_workspace_id uuid, p_user_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(case when r.status = 'settled' then r.unit_credits * r.settled_quantity else r.amount end), 0)
  from private.credit_reservations r
  where r.workspace_id = p_workspace_id and r.user_id = p_user_id and r.status in ('reserved', 'settled')
    and r.created_at >= date_trunc('month', now());
$$;

revoke all on function private.own_ai_key_factor() from public, anon, authenticated, service_role;
revoke all on function private.credit_totals(uuid) from public, anon, authenticated, service_role;
revoke all on function private.credit_member_month_usage(uuid, uuid) from public, anon, authenticated, service_role;

-- Entrada de créditos (plano, pacote ou ajuste). Só o servidor (a cobrança, ticket 05, ou um ajuste deliberado).
create function public.grant_credits(p_workspace_id uuid, p_amount numeric, p_kind text, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_kind not in ('plano', 'pacote', 'ajuste') then
    raise exception 'invalid credit entry kind' using errcode = '22023';
  end if;
  if p_amount is null or p_amount = 0 or (p_kind <> 'ajuste' and p_amount < 0) then
    raise exception 'invalid credit amount' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('credits:' || p_workspace_id::text));
  if p_amount < 0 and (select t.booked - t.reserved from private.credit_totals(p_workspace_id) t) + p_amount < 0 then
    raise exception 'insufficient credits' using errcode = 'P0001', hint = 'credits';
  end if;
  insert into private.credit_entries (workspace_id, amount, kind, note)
  values (p_workspace_id, p_amount, p_kind, p_note)
  returning id into v_id;
  return v_id;
end;
$$;

-- Reserva os créditos de uma ação antes de ela rodar. Idempotente pela chave: a mesma chave devolve a mesma reserva.
-- Recusa (sem reservar nada) quando o saldo disponível ou o limite mensal do participante não cobrem.
create function public.reserve_credits(
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

  insert into private.credit_reservations (workspace_id, user_id, action, action_key, quantity, unit_credits, amount)
  values (p_workspace_id, p_user_id, p_action, p_action_key, p_quantity, v_unit, v_amount)
  returning id into v_id;
  return v_id;
end;
$$;

-- Liquida a reserva com o que de fato se usou (até a quantidade reservada; nulo = tudo). Zero usado libera a reserva:
-- o enriquecimento que não achou não debita. Repetir não debita de novo.
create function public.settle_credits(p_reservation_id uuid, p_used_quantity integer default null)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v private.credit_reservations%rowtype;
  v_used integer;
begin
  select * into v from private.credit_reservations r where r.id = p_reservation_id;
  if not found then
    raise exception 'credit reservation not found' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtext('credits:' || v.workspace_id::text));
  select * into v from private.credit_reservations r where r.id = p_reservation_id for update;
  if v.status = 'settled' then
    return v.unit_credits * v.settled_quantity;
  end if;
  if v.status = 'released' then
    raise exception 'credit reservation was released' using errcode = '55000';
  end if;
  v_used := coalesce(p_used_quantity, v.quantity);
  if v_used < 0 or v_used > v.quantity then
    raise exception 'used quantity out of range' using errcode = '22023';
  end if;
  if v_used = 0 or v.unit_credits = 0 then
    update private.credit_reservations set status = 'released', settled_quantity = 0, closed_at = now()
    where id = v.id;
    return 0;
  end if;
  update private.credit_reservations set status = 'settled', settled_quantity = v_used, closed_at = now()
  where id = v.id;
  insert into private.credit_entries (workspace_id, amount, kind, reservation_id, user_id)
  values (v.workspace_id, -(v.unit_credits * v_used), 'acao', v.id, v.user_id);
  return v.unit_credits * v_used;
end;
$$;

-- Libera a reserva de uma ação que não aconteceu: o valor volta ao disponível. Repetir não faz nada.
create function public.release_credits(p_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v private.credit_reservations%rowtype;
begin
  select * into v from private.credit_reservations r where r.id = p_reservation_id for update;
  if not found then
    raise exception 'credit reservation not found' using errcode = 'P0002';
  end if;
  if v.status = 'settled' then
    raise exception 'credit reservation was settled' using errcode = '55000';
  end if;
  update private.credit_reservations set status = 'released', closed_at = coalesce(closed_at, now())
  where id = v.id and status = 'reserved';
end;
$$;

revoke all on function public.grant_credits(uuid, numeric, text, text) from public, anon, authenticated;
revoke all on function public.reserve_credits(uuid, uuid, text, text, integer, boolean) from public, anon, authenticated;
revoke all on function public.settle_credits(uuid, integer) from public, anon, authenticated;
revoke all on function public.release_credits(uuid) from public, anon, authenticated;
grant execute on function public.grant_credits(uuid, numeric, text, text) to service_role;
grant execute on function public.reserve_credits(uuid, uuid, text, text, integer, boolean) to service_role;
grant execute on function public.settle_credits(uuid, integer) to service_role;
grant execute on function public.release_credits(uuid) to service_role;

-- O saldo do Workspace para quem participa: o lançado, o reservado, o disponível, e o gasto e o limite de quem pergunta.
create function public.get_credit_balance(p_workspace_id uuid)
returns table (
  balance numeric,
  reserved numeric,
  available numeric,
  my_month_usage numeric,
  my_monthly_limit numeric
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
     where l.workspace_id = p_workspace_id and l.user_id = auth.uid())
  from private.credit_totals(p_workspace_id) t;
end;
$$;

-- O extrato: o Administrador vê o do Workspace inteiro; o Membro, as entradas e as próprias ações.
create function public.list_credit_entries(p_workspace_id uuid, p_limit integer default 100)
returns table (id uuid, amount numeric, kind text, action text, user_id uuid, note text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin boolean;
begin
  v_admin := private.require_active_membership(p_workspace_id) = 'admin';
  return query
  select e.id, e.amount, e.kind, r.action, e.user_id, e.note, e.created_at
  from private.credit_entries e
  left join private.credit_reservations r on r.id = e.reservation_id
  where e.workspace_id = p_workspace_id
    and (v_admin or e.kind <> 'acao' or e.user_id = auth.uid())
  order by e.created_at desc, e.id desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

-- O Administrador define (ou remove, com nulo) o limite mensal de um participante ativo.
create function public.set_member_credit_limit(p_workspace_id uuid, p_user_id uuid, p_monthly_limit numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.require_active_membership(p_workspace_id) <> 'admin' then
    raise exception 'only administrators can set credit limits' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = p_workspace_id and m.user_id = p_user_id and m.active
  ) then
    raise exception 'the participant must be active' using errcode = '22023';
  end if;
  if p_monthly_limit is null then
    delete from private.credit_member_limits l where l.workspace_id = p_workspace_id and l.user_id = p_user_id;
    return;
  end if;
  if p_monthly_limit < 0 then
    raise exception 'invalid credit limit' using errcode = '22023';
  end if;
  insert into private.credit_member_limits (workspace_id, user_id, monthly_limit, set_by)
  values (p_workspace_id, p_user_id, p_monthly_limit, auth.uid())
  on conflict (workspace_id, user_id)
  do update set monthly_limit = excluded.monthly_limit, set_by = excluded.set_by, updated_at = now();
end;
$$;

-- Os preços em créditos por ação, para a tela mostrar o custo antes.
create function public.list_credit_action_prices()
returns table (action text, credits numeric, description text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.action, c.credits, c.description from private.credit_action_prices c order by c.action;
$$;

revoke all on function public.get_credit_balance(uuid) from public, anon;
revoke all on function public.list_credit_entries(uuid, integer) from public, anon;
revoke all on function public.set_member_credit_limit(uuid, uuid, numeric) from public, anon;
revoke all on function public.list_credit_action_prices() from public, anon;
grant execute on function public.get_credit_balance(uuid) to authenticated;
grant execute on function public.list_credit_entries(uuid, integer) to authenticated;
grant execute on function public.set_member_credit_limit(uuid, uuid, numeric) to authenticated;
grant execute on function public.list_credit_action_prices() to authenticated;

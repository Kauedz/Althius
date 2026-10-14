-- Lotes de crédito (creditos-moeda-unica). O saldo do Workspace continua sendo o extrato (private.credit_entries); o lote só
-- registra, por entrada, quanto dela ainda não foi gasto, para a renovação mensal zerar só o que veio do plano e deixar o
-- pacote. Cada gasto liquidado consome os lotes nesta ordem: plano, ajuste e, por último, pacote (o que vence antes
-- primeiro). O pacote vale 12 meses: a entrada guarda a validade.
--
-- Redefinidas a partir da definição mais recente na main (20260930160000): grant_credits e settle_credits. O extrato, os
-- limites e o comportamento que o cliente vê não mudam.

alter table private.credit_entries add column if not exists expires_at timestamptz;

comment on column private.credit_entries.expires_at is
  'Validade da entrada. Só o pacote vence (12 meses depois de entrar); plano e ajuste não têm validade própria.';

create table if not exists private.credit_lots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('plano', 'ajuste', 'pacote')),
  entry_id uuid references private.credit_entries(id) on delete set null,
  granted numeric(12, 2) not null check (granted > 0),
  remaining numeric(12, 2) not null check (remaining >= 0 and remaining <= granted),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists credit_lots_open_idx on private.credit_lots (workspace_id, kind, created_at) where remaining > 0;
create index if not exists credit_lots_entry_idx on private.credit_lots (entry_id);

alter table private.credit_lots enable row level security;
revoke all on private.credit_lots from public, anon, authenticated, service_role;

-- Os lotes que o saldo atual ainda guarda dos Workspaces que já tinham extrato: tudo conta como plano, que é a origem dos
-- créditos de hoje (nenhum pacote foi vendido). Repetir não duplica.
insert into private.credit_lots (workspace_id, kind, granted, remaining)
select b.workspace_id, 'plano', b.saldo, b.saldo
from (select e.workspace_id, sum(e.amount) as saldo from private.credit_entries e group by e.workspace_id) b
where b.saldo > 0
  and not exists (select 1 from private.credit_lots l where l.workspace_id = b.workspace_id);

-- Gasta `p_amount` dos lotes abertos e devolve o que não coube (o Workspace ilimitado gasta sem saldo). Plano primeiro,
-- depois ajuste, depois pacote, o que vence antes na frente. Lote vencido não conta.
create or replace function private.consume_credit_lots(p_workspace_id uuid, p_amount numeric)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_left numeric := coalesce(p_amount, 0);
  v_lot record;
  v_take numeric;
begin
  for v_lot in
    select l.id, l.remaining
    from private.credit_lots l
    where l.workspace_id = p_workspace_id and l.remaining > 0 and (l.expires_at is null or l.expires_at > now())
    order by case l.kind when 'plano' then 1 when 'ajuste' then 2 else 3 end,
      coalesce(l.expires_at, 'infinity'::timestamptz), l.created_at, l.id
    for update
  loop
    exit when v_left <= 0;
    v_take := least(v_lot.remaining, v_left);
    update private.credit_lots set remaining = remaining - v_take where id = v_lot.id;
    v_left := v_left - v_take;
  end loop;
  return v_left;
end;
$$;

revoke all on function private.consume_credit_lots(uuid, numeric) from public, anon, authenticated, service_role;

-- Entrada de créditos (plano, pacote ou ajuste). Só o servidor. O pacote vence em 12 meses; cada entrada positiva abre um lote.
create or replace function public.grant_credits(p_workspace_id uuid, p_amount numeric, p_kind text, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_expires timestamptz := case when p_kind = 'pacote' then now() + interval '12 months' end;
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
  insert into private.credit_entries (workspace_id, amount, kind, note, expires_at)
  values (p_workspace_id, p_amount, p_kind, p_note, v_expires)
  returning id into v_id;
  if p_amount > 0 then
    insert into private.credit_lots (workspace_id, kind, entry_id, granted, remaining, expires_at)
    values (p_workspace_id, p_kind, v_id, p_amount, p_amount, v_expires);
  else
    perform private.consume_credit_lots(p_workspace_id, -p_amount);
  end if;
  return v_id;
end;
$$;

-- Liquida a reserva com o que de fato se usou (até a quantidade reservada; nulo = tudo). Zero usado libera a reserva:
-- o enriquecimento que não achou não debita. Repetir não debita de novo. O gasto sai dos lotes.
create or replace function public.settle_credits(p_reservation_id uuid, p_used_quantity integer default null)
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
  perform private.consume_credit_lots(v.workspace_id, v.unit_credits * v_used);
  return v.unit_credits * v_used;
end;
$$;

-- Os lotes de pacote que venceram: o que sobrou deles sai do saldo, num lançamento de ajuste. Roda na renovação diária.
create or replace function private.expire_credit_lots(p_workspace_id uuid)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired numeric;
begin
  perform pg_advisory_xact_lock(hashtext('credits:' || p_workspace_id::text));
  select coalesce(sum(l.remaining), 0) into v_expired
  from private.credit_lots l
  where l.workspace_id = p_workspace_id and l.remaining > 0 and l.expires_at is not null and l.expires_at <= now();
  if v_expired > 0 then
    update private.credit_lots set remaining = 0
    where workspace_id = p_workspace_id and remaining > 0 and expires_at is not null and expires_at <= now();
    insert into private.credit_entries (workspace_id, amount, kind, note)
    values (p_workspace_id, -v_expired, 'ajuste', 'Validade do pacote de créditos');
  end if;
  return v_expired;
end;
$$;

revoke all on function private.expire_credit_lots(uuid) from public, anon, authenticated, service_role;

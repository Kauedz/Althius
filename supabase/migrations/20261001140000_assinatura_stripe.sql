-- A assinatura do Workspace pelo Stripe (creditos-e-planos, tickets 05 e 06; decisão do Nan, 2026-10-01: o meio de
-- pagamento é o Stripe). O plano é por assento: cada Participante ativo é um assento pago (R$ 500 por mês, preço que
-- fica no Stripe), e cada fatura paga traz ao saldo comum do Workspace a cota de créditos de cada assento. Sem
-- assinatura ativa, o Workspace operacional fica bloqueado e a pessoa só usa a Demonstração; os Workspaces de hoje
-- (pré-produção) ficam liberados por uma marca manual. Com a fatura atrasada, o Workspace segue aberto por uma
-- carência; cancelada, fecha. O Stripe fala com a Althius pelas Edge Functions stripe-billing e stripe-webhook; as
-- chaves ficam só nos segredos do Supabase.
--
-- O papel Observador (ticket 05) não entra aqui: ele exige rever cada função que hoje aceita qualquer Participação
-- ativa, inclusive as da frente de Conexões, e fica para depois de combinar com ela.

create table private.workspace_subscriptions (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  status text not null default 'sem_assinatura' check (status in ('sem_assinatura', 'ativa', 'atrasada', 'cancelada')),
  -- Liberação manual da Althius (pré-produção, cortesia): abre o Workspace sem assinatura.
  manual_release boolean not null default false,
  manual_note text,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  seats integer check (seats is null or seats >= 0),
  current_period_end timestamptz,
  -- Quando o Stripe criou o último evento aplicado: um evento mais velho, que chega atrasado, não desfaz um mais novo.
  stripe_event_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table private.workspace_subscriptions enable row level security;
revoke all on private.workspace_subscriptions from public, anon, authenticated, service_role;

-- Os números da cobrança, uma linha só. A cobrança começa desligada: até o Stripe estar configurado, todo Workspace
-- abre (a pré-produção segue testando contas novas); o Nan liga quando for ao ar. A cota de créditos por assento começa
-- em zero até o Nan fechar o valor depois de medir o custo real (ticket 01); a carência de uma fatura atrasada, em dias.
create table private.billing_settings (
  id boolean primary key default true check (id),
  enforced boolean not null default false,
  credits_per_seat numeric not null default 0 check (credits_per_seat >= 0),
  grace_days integer not null default 7 check (grace_days between 0 and 60),
  updated_at timestamptz not null default now()
);
insert into private.billing_settings (id) values (true);
alter table private.billing_settings enable row level security;
revoke all on private.billing_settings from public, anon, authenticated, service_role;

-- Os eventos do Stripe já tratados, para auditoria (o Stripe reenvia; tratar de novo não muda nada).
create table private.stripe_events (
  event_id text primary key,
  event_type text not null,
  received_at timestamptz not null default now()
);
alter table private.stripe_events enable row level security;
revoke all on private.stripe_events from public, anon, authenticated, service_role;

-- A cota de créditos de cada fatura paga entra uma vez só.
create table private.seat_credit_grants (
  invoice_id text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  seats integer not null,
  credits numeric not null,
  credit_entry_id uuid,
  created_at timestamptz not null default now()
);
create index seat_credit_grants_workspace_idx on private.seat_credit_grants (workspace_id);
alter table private.seat_credit_grants enable row level security;
revoke all on private.seat_credit_grants from public, anon, authenticated, service_role;

-- Os Workspaces de hoje (pré-produção) continuam liberados por uma marca manual (critério do ticket 06).
insert into private.workspace_subscriptions (workspace_id, manual_release, manual_note)
select w.id, true, 'pré-produção: liberado antes da cobrança'
from public.workspaces w
on conflict (workspace_id) do nothing;

create function private.active_seats(p_workspace_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.workspace_memberships m where m.workspace_id = p_workspace_id and m.active
$$;
revoke all on function private.active_seats(uuid) from public, anon, authenticated, service_role;

-- O acesso ao Workspace para quem participa: se está liberado, por quê, os assentos pagos e os em uso.
create function public.workspace_access(p_workspace_id uuid)
returns table (released boolean, reason text, paid_seats integer, used_seats integer, period_end timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v private.workspace_subscriptions%rowtype;
  v_grace integer;
  v_enforced boolean;
begin
  perform private.require_active_membership(p_workspace_id);
  select * into v from private.workspace_subscriptions s where s.workspace_id = p_workspace_id;
  select b.grace_days, b.enforced into v_grace, v_enforced from private.billing_settings b;
  return query select
    case
      when not v_enforced then true
      when v.manual_release then true
      when v.status = 'ativa' then true
      when v.status = 'atrasada' then coalesce(v.current_period_end, now()) + make_interval(days => v_grace) > now()
      else false
    end,
    case
      when v.status in ('ativa', 'atrasada', 'cancelada') then v.status
      when not v_enforced then 'cobranca_desligada'
      when v.manual_release then 'liberado_manual'
      when v.status is null then 'sem_assinatura'
      else v.status
    end,
    v.seats,
    private.active_seats(p_workspace_id),
    v.current_period_end;
end;
$$;

-- O que a Edge Function stripe-billing precisa para abrir o checkout ou o portal: só um Administrador ativo pede.
create function public.billing_context(p_workspace_id uuid)
returns table (workspace_name text, stripe_customer_id text, stripe_subscription_id text, used_seats integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if private.require_active_membership(p_workspace_id) <> 'admin' then
    raise exception 'only administrators can manage the subscription' using errcode = '42501';
  end if;
  return query
    select w.name, s.stripe_customer_id, s.stripe_subscription_id, private.active_seats(p_workspace_id)
    from public.workspaces w
    left join private.workspace_subscriptions s on s.workspace_id = w.id
    where w.id = p_workspace_id;
end;
$$;

-- O servidor guarda o cliente do Stripe criado para o Workspace.
create function public.record_stripe_customer(p_workspace_id uuid, p_customer_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.workspace_subscriptions (workspace_id, stripe_customer_id)
  values (p_workspace_id, p_customer_id)
  on conflict (workspace_id) do update set stripe_customer_id = excluded.stripe_customer_id, updated_at = now();
$$;

-- O Workspace de um cliente do Stripe, para o webhook.
create function public.workspace_by_stripe_customer(p_customer_id text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.workspace_id from private.workspace_subscriptions s where s.stripe_customer_id = p_customer_id
$$;

-- O webhook registra a assinatura com o estado do Stripe traduzido. Um evento mais velho que o último aplicado não muda
-- nada (o Stripe não garante a ordem); devolve o estado que ficou valendo.
create function public.apply_stripe_subscription(
  p_workspace_id uuid, p_customer_id text, p_subscription_id text, p_stripe_status text, p_seats integer,
  p_period_end timestamptz, p_event_at timestamptz default null
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text := case
    when p_stripe_status in ('active', 'trialing') then 'ativa'
    when p_stripe_status in ('past_due', 'unpaid') then 'atrasada'
    when p_stripe_status in ('canceled', 'incomplete_expired') then 'cancelada'
    else 'sem_assinatura'
  end;
begin
  if not exists (select 1 from public.workspaces w where w.id = p_workspace_id) then
    raise exception 'workspace not found' using errcode = 'P0002';
  end if;
  insert into private.workspace_subscriptions (
    workspace_id, status, stripe_customer_id, stripe_subscription_id, seats, current_period_end, stripe_event_at,
    updated_at
  ) values (p_workspace_id, v_status, p_customer_id, p_subscription_id, p_seats, p_period_end, p_event_at, now())
  on conflict (workspace_id) do update set
    status = excluded.status,
    stripe_customer_id = coalesce(excluded.stripe_customer_id, private.workspace_subscriptions.stripe_customer_id),
    stripe_subscription_id = excluded.stripe_subscription_id,
    seats = excluded.seats,
    current_period_end = excluded.current_period_end,
    stripe_event_at = coalesce(excluded.stripe_event_at, private.workspace_subscriptions.stripe_event_at),
    updated_at = now()
  where p_event_at is null
    or private.workspace_subscriptions.stripe_event_at is null
    or private.workspace_subscriptions.stripe_event_at <= p_event_at;
  return (select s.status from private.workspace_subscriptions s where s.workspace_id = p_workspace_id);
end;
$$;

-- Uma fatura paga traz a cota de créditos de cada assento ao saldo comum, uma vez por fatura. Sem os assentos, vale o
-- que a assinatura guardou. Com a cota em zero (ainda não fechada pelo Nan), registra a fatura e não lança nada.
create function public.grant_seat_credits(p_invoice_id text, p_workspace_id uuid, p_seats integer)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_per_seat numeric;
  v_credits numeric;
  v_entry uuid;
begin
  if p_invoice_id is null or btrim(p_invoice_id) = '' or p_seats < 0 then
    raise exception 'invalid invoice' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('seat-credits:' || p_invoice_id));
  if exists (select 1 from private.seat_credit_grants g where g.invoice_id = p_invoice_id) then
    return 0;
  end if;
  select b.credits_per_seat into v_per_seat from private.billing_settings b;
  if p_seats is null then
    select coalesce(s.seats, 0) into p_seats from private.workspace_subscriptions s where s.workspace_id = p_workspace_id;
    p_seats := coalesce(p_seats, 0);
  end if;
  v_credits := v_per_seat * p_seats;
  if v_credits > 0 then
    v_entry := public.grant_credits(p_workspace_id, v_credits, 'plano', 'assinatura: ' || p_seats || ' assento(s)');
  end if;
  insert into private.seat_credit_grants (invoice_id, workspace_id, seats, credits, credit_entry_id)
  values (p_invoice_id, p_workspace_id, p_seats, v_credits, v_entry);
  return v_credits;
end;
$$;

-- Um evento do Stripe é tratado uma vez só: true na primeira vez, false nos reenvios.
create function public.claim_stripe_event(p_event_id text, p_event_type text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.stripe_events (event_id, event_type) values (p_event_id, p_event_type);
  return true;
exception when unique_violation then
  return false;
end;
$$;

-- Ajustes da Althius, pelo servidor: a cota por assento, a carência, ligar a cobrança e a liberação manual.
create function public.set_billing_settings(
  p_credits_per_seat numeric default null, p_grace_days integer default null, p_enforced boolean default null
) returns void
language sql
security definer
set search_path = ''
as $$
  update private.billing_settings set
    credits_per_seat = coalesce(p_credits_per_seat, credits_per_seat),
    grace_days = coalesce(p_grace_days, grace_days),
    enforced = coalesce(p_enforced, enforced),
    updated_at = now();
$$;

create function public.set_manual_release(p_workspace_id uuid, p_released boolean, p_note text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.workspace_subscriptions (workspace_id, manual_release, manual_note)
  values (p_workspace_id, p_released, p_note)
  on conflict (workspace_id) do update set manual_release = excluded.manual_release, manual_note = excluded.manual_note,
    updated_at = now();
$$;

revoke all on function public.workspace_access(uuid) from public, anon;
revoke all on function public.billing_context(uuid) from public, anon;
revoke all on function public.record_stripe_customer(uuid, text) from public, anon, authenticated;
revoke all on function public.workspace_by_stripe_customer(text) from public, anon, authenticated;
revoke all on function public.apply_stripe_subscription(uuid, text, text, text, integer, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.grant_seat_credits(text, uuid, integer) from public, anon, authenticated;
revoke all on function public.claim_stripe_event(text, text) from public, anon, authenticated;
revoke all on function public.set_billing_settings(numeric, integer, boolean) from public, anon, authenticated;
revoke all on function public.set_manual_release(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.workspace_access(uuid) to authenticated;
grant execute on function public.billing_context(uuid) to authenticated;
grant execute on function public.record_stripe_customer(uuid, text) to service_role;
grant execute on function public.workspace_by_stripe_customer(text) to service_role;
grant execute on function public.apply_stripe_subscription(uuid, text, text, text, integer, timestamptz, timestamptz) to service_role;
grant execute on function public.grant_seat_credits(text, uuid, integer) to service_role;
grant execute on function public.claim_stripe_event(text, text) to service_role;
grant execute on function public.set_billing_settings(numeric, integer, boolean) to service_role;
grant execute on function public.set_manual_release(uuid, boolean, text) to service_role;

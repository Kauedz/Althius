-- Faixas e contratos (acesso-e-planos). O modelo é serviço mais SaaS por contrato externo, em plano único por faixa,
-- cobrado fora da plataforma. Um Workspace operacional só existe depois do contrato, e só a Althius o cria.
-- Esta migração só cria as tabelas, as três faixas, o contrato da Equipe Althius e a leitura do acesso pelo contrato.
-- Nada do Stripe é apagado: com billing_mode = 'saas' o caminho antigo de workspace_access continua valendo.

-- As faixas. Editáveis só por migração ou código (sem política nem permissão para o cliente).
create table if not exists private.contract_tiers (
  id text primary key check (id ~ '^[a-z][a-z0-9-]*$'),
  name text not null check (btrim(name) <> ''),
  max_users integer not null check (max_users > 0),
  monthly_credits integer not null check (monthly_credits > 0),
  -- A guarda interna em dólar da faixa: vira o Teto de Sinais do Workspace e nunca aparece para o cliente.
  internal_usd_guard numeric(12, 2) not null check (internal_usd_guard > 0)
);

alter table private.contract_tiers enable row level security;
revoke all on private.contract_tiers from public, anon, authenticated, service_role;

insert into private.contract_tiers (id, name, max_users, monthly_credits, internal_usd_guard) values
  ('essencial', 'Essencial', 2, 3000, 140),
  ('profissional', 'Profissional', 3, 4500, 195),
  ('escala', 'Escala', 5, 6000, 280)
on conflict (id) do nothing;

-- O contrato de cada Workspace operacional: uma linha por Workspace.
create table if not exists private.workspace_contracts (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  tier_id text not null references private.contract_tiers(id),
  status text not null default 'ativo' check (status in ('ativo', 'suspenso', 'encerrado')),
  starts_at timestamptz not null default now(),
  -- 'contrato' é cobrado fora da plataforma. 'saas' mantém o Stripe (stripe-billing, stripe-webhook): nenhum Workspace usa.
  billing_mode text not null default 'contrato' check (billing_mode in ('contrato', 'saas')),
  -- O limite mensal de gasto em créditos do Workspace. Nulo vale os créditos mensais da faixa.
  monthly_credit_limit numeric(12, 2) check (monthly_credit_limit is null or monthly_credit_limit > 0),
  notes text check (notes is null or length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workspace_contracts_tier_idx on private.workspace_contracts (tier_id);

alter table private.workspace_contracts enable row level security;
revoke all on private.workspace_contracts from public, anon, authenticated, service_role;

-- O contrato vale: ativo e já começou.
create or replace function private.contract_active(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.workspace_contracts c
    where c.workspace_id = p_workspace_id and c.status = 'ativo' and c.starts_at <= now()
  );
$$;

revoke all on function private.contract_active(uuid) from public, anon, authenticated, service_role;

-- O acesso ao Workspace. Com contrato em modo 'contrato', quem libera é o contrato. Sem contrato, ou com 'saas', vale o
-- caminho do Stripe de antes, sem mudança.
create or replace function public.workspace_access(p_workspace_id uuid)
returns table (released boolean, reason text, paid_seats integer, used_seats integer, period_end timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v private.workspace_subscriptions%rowtype;
  c private.workspace_contracts%rowtype;
  v_grace integer;
  v_enforced boolean;
begin
  perform private.require_active_membership(p_workspace_id);
  select * into c from private.workspace_contracts k where k.workspace_id = p_workspace_id;
  if found and c.billing_mode = 'contrato' then
    return query select
      private.contract_active(p_workspace_id),
      case
        when c.status = 'suspenso' then 'contrato_suspenso'
        when c.status = 'encerrado' then 'contrato_encerrado'
        when c.starts_at > now() then 'contrato_a_iniciar'
        else 'contrato'
      end,
      null::integer,
      private.active_seats(p_workspace_id),
      null::timestamptz;
    return;
  end if;
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

-- Os Workspaces contratados de quem está logado, para a entrada decidir entre o Workspace operacional e o visitante.
create or replace function public.list_my_contracted_workspaces()
returns table (workspace_id uuid, tier_name text, billing_mode text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_user();
  return query
  select c.workspace_id, t.name, c.billing_mode
  from private.workspace_contracts c
  join private.contract_tiers t on t.id = c.tier_id
  join public.workspace_memberships m
    on m.workspace_id = c.workspace_id and m.user_id = (select auth.uid()) and m.active
  where private.contract_active(c.workspace_id);
end;
$$;

revoke all on function public.list_my_contracted_workspaces() from public, anon;
grant execute on function public.list_my_contracted_workspaces() to authenticated;

-- A Equipe Althius ganha um contrato ativo (faixa Escala) e continua ilimitada e sem Teto. Os Workspaces de teste não
-- ganham contrato; quem decide isso é o Kauê, depois.
insert into private.workspace_contracts (workspace_id, tier_id, status, billing_mode, notes)
select w.id, 'escala', 'ativo', 'contrato', 'Equipe Althius: ilimitada e sem Teto'
from public.workspaces w
where w.id = coalesce(
  (select e.id from public.workspaces e where e.id = 'e0a17e00-0000-4000-8000-000000000001'),
  (select e.id from public.workspaces e where e.kind = 'empresa' and e.name = 'Equipe Althius' order by e.created_at, e.id limit 1)
)
on conflict (workspace_id) do nothing;

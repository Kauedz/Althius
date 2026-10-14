-- O preço da rodada de Agente e a tabela de preços (creditos-moeda-unica).
--
-- Rodada de Agente: 1 crédito no modelo padrão da plataforma, 3 se o modelo da plataforma for o da Anthropic, 0,2 com a chave
-- de IA do cliente. O modelo vem de um ajuste do banco, mudado junto com o segredo AGENT_PROVIDER por `set_platform_model`
-- (só service_role). reserve_credits também confere o limite mensal único do contrato (período do contrato, não o mês do
-- calendário). Redefinida a partir da definição mais recente na main (20261016110000).

create table if not exists private.platform_model_setting (
  singleton boolean primary key default true check (singleton),
  provider text not null default 'padrao' check (provider in ('padrao', 'anthropic')),
  -- O preço da rodada quando o modelo da plataforma é o da Anthropic. No modelo padrão vale o preço de tabela (1).
  anthropic_round_credits numeric(12, 2) not null default 3 check (anthropic_round_credits >= 0),
  updated_at timestamptz not null default now()
);

insert into private.platform_model_setting (singleton) values (true) on conflict (singleton) do nothing;
alter table private.platform_model_setting enable row level security;
revoke all on private.platform_model_setting from public, anon, authenticated, service_role;

create or replace function private.agent_round_platform_credits()
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case when s.provider = 'anthropic' then s.anthropic_round_credits else p.credits end
  from private.credit_action_prices p, private.platform_model_setting s
  where p.action = 'agent_round';
$$;

revoke all on function private.agent_round_platform_credits() from public, anon, authenticated, service_role;

create or replace function public.set_platform_model(p_provider text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_provider is null or p_provider not in ('padrao', 'anthropic') then
    raise exception 'invalid platform model' using errcode = '22023';
  end if;
  update private.platform_model_setting set provider = p_provider, updated_at = now();
end;
$$;

revoke all on function public.set_platform_model(text) from public, anon, authenticated;
grant execute on function public.set_platform_model(text) to service_role;

-- O preço de uma rodada neste Workspace, como reserve_credits o cobra.
create or replace function private.agent_round_unit(p_workspace_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from private.workspace_ai_keys k where k.workspace_id = p_workspace_id)
      then round(c.credits * private.own_ai_key_factor(), 2)
    else private.agent_round_platform_credits()
  end
  from private.credit_action_prices c where c.action = 'agent_round';
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
  v_ws_limit numeric;
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
    -- Com a chave de IA do cliente, a rodada custa 0,2 (20% do preço de tabela), qualquer que seja o modelo da plataforma.
    v_unit := round(v_unit * private.own_ai_key_factor(), 2);
  elsif p_action = 'agent_round' then
    -- No modelo da plataforma: 1 crédito no modelo padrão, 3 se o modelo da plataforma for o da Anthropic.
    v_unit := private.agent_round_platform_credits();
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

  -- Sem contrato ativo (e sem ser ilimitado), nenhuma ação paga reserva.
  perform private.require_paid_access(p_workspace_id);

  v_amount := v_unit * p_quantity;
  if not private.credits_unlimited(p_workspace_id) then
    select t.booked - t.reserved into v_available from private.credit_totals(p_workspace_id) t;
    if v_available < v_amount then
      raise exception 'insufficient credits' using errcode = 'P0001', hint = 'credits';
    end if;
    -- O limite mensal do contrato, um só para o cliente: o gasto do período mais esta ação não passa dele. O desfecho é o
    -- "Limite do mês atingido" que a tela mostra (hint 'workspace_limit', para distinguir do limite do participante).
    v_ws_limit := private.workspace_monthly_limit(p_workspace_id);
    if v_ws_limit is not null and private.workspace_period_usage(p_workspace_id) + v_amount > v_ws_limit then
      raise exception 'monthly credit limit reached' using errcode = 'P0001', hint = 'workspace_limit';
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

-- A tabela de preços da tela: a Descoberta e a consulta de CNPJ aparecem; a cascata deixa de ser uma ação à parte (o
-- Monitoramento cobra o preço fixo do Sinal). A rodada de Agente mostra o preço do modelo da plataforma.
update private.credit_action_prices set description = 'Uma busca de Contas candidatas pelo ICP: 5 créditos a cada 50 empresas'
where action = 'account_discovery';
update private.credit_action_prices set description = 'Uma Conta varrida por um Monitoramento: 1 ou 2 créditos, conforme o Sinal'
where action = 'account_scan';

create or replace function public.list_credit_action_prices()
returns table (action text, credits numeric, description text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.action,
    case when c.action = 'agent_round' then private.agent_round_platform_credits() else c.credits end,
    c.description
  from private.credit_action_prices c
  where c.action <> 'cascata_de_sinais'
  order by c.action;
$$;

revoke all on function public.list_credit_action_prices() from public, anon;
grant execute on function public.list_credit_action_prices() to authenticated;

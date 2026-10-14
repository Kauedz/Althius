-- Limite mensal único, Automação em automático e guarda interna em dólar (creditos-moeda-unica).
--
-- 1. O limite do cliente é um só: `workspace_contracts.monthly_credit_limit` (padrão, os créditos da faixa), conferido em
--    reserve_credits (20261017140000) e igual ao teto da Automação. Nos Workspaces contratados a Automação (varredura,
--    enriquecimento e Agentes) vem em automático, dentro desse limite; a migração faz o mesmo nos contratos que já existem,
--    sem tocar no que um Administrador já escolheu.
-- 2. A guarda interna em dólar vem de `contract_tiers.internal_usd_guard` (nunca aparece na UI) e conta pelo período do
--    contrato. `workspace_signal_monthly_cap`, que devolvia dólar, sai de `authenticated`.
-- 3. Atingido o limite ou a guarda, o Aviso do Workspace diz só: "Limite do mês atingido. A Automação volta na renovação ou
--    fale com a equipe Althius."
--
-- Redefinidas a partir da definição mais recente na main: consume_automation_cap, signal_month_spend_usd e
-- signal_budget_block (20261015170000), staff_provision_workspace (20261016120000), get_contract_summary (20261016160000).

-- O automático em automático, dentro do limite: um interruptor por tipo de ação. Não sobrescreve escolha de Administrador.
create or replace function private.seed_contract_automation(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit numeric := private.workspace_monthly_limit(p_workspace_id);
begin
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

-- Os contratos que já existem (a Equipe é ilimitada e não tem limite: pula).
select private.seed_contract_automation(c.workspace_id) from private.workspace_contracts c;

create or replace function public.staff_provision_workspace(
  p_name text,
  p_admin_email text,
  p_tier_id text,
  p_initial_credits numeric default null
) returns table (workspace_id uuid, invitation_id uuid, invitation_token text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_staff uuid := auth.uid();
  v_name text := regexp_replace(coalesce(p_name, ''), '^\s+|\s+$', '', 'g');
  v_email text := lower(btrim(coalesce(p_admin_email, '')));
  v_tier private.contract_tiers%rowtype;
  v_credits numeric;
  v_workspace uuid;
  v_invitation private.workspace_invitations;
begin
  if v_staff is null or not private.is_althius_staff(v_staff) then
    raise exception 'only the Althius team provisions workspaces' using errcode = '42501';
  end if;
  if v_name = '' or length(v_name) > 100 then
    raise exception 'invalid workspace name' using errcode = '22023';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid email' using errcode = '22023';
  end if;
  select * into v_tier from private.contract_tiers t where t.id = p_tier_id;
  if not found then
    raise exception 'unknown contract tier' using errcode = '22023';
  end if;
  v_credits := coalesce(p_initial_credits, v_tier.monthly_credits);
  if v_credits < 0 then
    raise exception 'invalid initial credits' using errcode = '22023';
  end if;

  insert into public.workspaces (kind, name) values ('empresa', v_name) returning id into v_workspace;

  insert into private.workspace_contracts (workspace_id, tier_id, status, billing_mode, monthly_credit_limit, notes)
  values (v_workspace, v_tier.id, 'ativo', 'contrato', v_tier.monthly_credits, 'Provisionado pelo staff da Althius');

  if v_credits > 0 then
    perform public.grant_credits(v_workspace, v_credits, 'plano', 'contrato ' || v_tier.name);
  end if;

  -- O Teto interno em dólar da faixa. O gatilho de criação do Workspace já gravou a linha padrão.
  insert into private.workspace_signal_budget (workspace_id, monthly_cap_usd)
  values (v_workspace, v_tier.internal_usd_guard)
  on conflict (workspace_id) do update set monthly_cap_usd = excluded.monthly_cap_usd;

  -- A Automação vem em automático dentro do limite do contrato, nos Workspaces contratados.
  perform private.seed_contract_automation(v_workspace);

  insert into private.workspace_invitations (workspace_id, email, role, token, invited_by)
  values (v_workspace, v_email, 'admin', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), v_staff)
  returning * into v_invitation;

  insert into private.workspace_participation_events
    (workspace_id, event, subject_email, actor_user_id, new_role)
  values (v_workspace, 'workspace_criado', v_email, v_staff, 'admin');
  insert into private.workspace_participation_events
    (workspace_id, event, subject_email, actor_user_id, invitation_id, new_role)
  values (v_workspace, 'convite_criado', v_email, v_staff, v_invitation.id, 'admin');

  return query select v_workspace, v_invitation.id, v_invitation.token;
end;
$$;


revoke all on function public.staff_provision_workspace(text, text, text, numeric) from public, anon;
grant execute on function public.staff_provision_workspace(text, text, text, numeric) to authenticated;

create or replace function public.consume_automation_cap(p_workspace_id uuid, p_scope text, p_amount numeric)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v private.automation_settings%rowtype;
  v_month date := date_trunc('month', now())::date;
  v_spent numeric;
  v_reason text;
  v_name text;
begin
  if p_amount is null or p_amount < 0 then
    raise exception 'invalid amount' using errcode = '22023';
  end if;
  if p_scope = 'acao:varredura' and private.credits_unlimited(p_workspace_id) then
    return 'ok';
  end if;
  perform pg_advisory_xact_lock(hashtext('automation:' || p_workspace_id::text || ':' || p_scope));
  select * into v from private.automation_settings c where c.workspace_id = p_workspace_id and c.scope = p_scope;
  select g.spent into v_spent from private.automation_spend g
  where g.workspace_id = p_workspace_id and g.scope = p_scope and g.month = v_month;
  v_spent := coalesce(v_spent, 0);
  v_reason := private.automation_block_reason(v.mode, v.monthly_cap, v_spent, v.paused_at);
  if v_reason is not null then
    return v_reason;
  end if;

  if v_spent + p_amount > v.monthly_cap then
    v_reason := 'teto_atingido';
  else
    insert into private.automation_spend (workspace_id, scope, month, spent)
    values (p_workspace_id, p_scope, v_month, p_amount)
    on conflict (workspace_id, scope, month) do update set spent = private.automation_spend.spent + excluded.spent;
    v_spent := v_spent + p_amount;
  end if;

  if v_spent >= v.monthly_cap or v_reason is not null then
    update private.automation_settings set paused_at = now()
    where workspace_id = p_workspace_id and scope = p_scope;
    select s.name into v_name from private.automation_scopes(p_workspace_id) s where s.scope = p_scope;
    insert into private.workspace_notices (workspace_id, kind, title, body, link)
    values (p_workspace_id, 'teto_atingido', 'Limite do mês atingido: ' || v_name,
      'Limite do mês atingido. A Automação volta na renovação ou fale com a equipe Althius.',
      '/configuracoes/automacao');
  end if;
  return coalesce(v_reason, 'ok');
end;
$$;

-- O gasto do período em dólar (a guarda interna). Conta desde o início do período do contrato, como o limite em créditos.
create or replace function private.signal_month_spend_usd(p_workspace_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(c.cost_usd), 0)
  from private.action_costs c
  where c.workspace_id = p_workspace_id
    and c.action_type = 'apify_actor'
    and c.occurred_at >= private.credit_period_start(p_workspace_id);
$$;

-- Por que o gasto em dólar do período impede a próxima busca (nulo quando não impede). Ilimitado não é impedido. Com contrato,
-- a guarda é a da faixa; sem contrato, o teto de sempre do Workspace (US$ 20 se não houver linha).
create or replace function private.signal_budget_block(p_workspace_id uuid, p_extra_usd numeric)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cap numeric;
begin
  if private.credits_unlimited(p_workspace_id) then
    return null;
  end if;
  select t.internal_usd_guard into v_cap
  from private.workspace_contracts c
  join private.contract_tiers t on t.id = c.tier_id
  where c.workspace_id = p_workspace_id;
  if not found then
    select b.monthly_cap_usd into v_cap from private.workspace_signal_budget b where b.workspace_id = p_workspace_id;
    if not found then
      v_cap := 20;
    end if;
  end if;
  if v_cap is null then
    return null;
  end if;
  if private.signal_month_spend_usd(p_workspace_id) + coalesce(p_extra_usd, 0) >= v_cap then
    return 'teto_atingido';
  end if;
  return null;
end;
$$;

-- A linha do teto de Sinais dos Workspaces contratados passa a ser a guarda da faixa (a Equipe, ilimitada, segue sem teto).
update private.workspace_signal_budget b set monthly_cap_usd = t.internal_usd_guard
from private.workspace_contracts c
join private.contract_tiers t on t.id = c.tier_id
where b.workspace_id = c.workspace_id and not private.credits_unlimited(c.workspace_id)
  and b.monthly_cap_usd is distinct from t.internal_usd_guard;

-- O cliente nunca lê o dólar: a função que o devolvia sai de `authenticated`.
revoke execute on function public.workspace_signal_monthly_cap(uuid) from authenticated;

-- O resumo do contrato conta o uso pelo período do contrato, como o limite.
create or replace function public.get_contract_summary(p_workspace_id uuid)
returns table (
  status text,
  billing_mode text,
  tier_id text,
  tier_name text,
  max_users integer,
  active_users integer,
  monthly_credits integer,
  monthly_credit_limit numeric,
  month_usage numeric,
  starts_at timestamptz,
  unlimited boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);
  return query
  select c.status, c.billing_mode, t.id, t.name, t.max_users, private.active_seats(p_workspace_id), t.monthly_credits,
    coalesce(c.monthly_credit_limit, t.monthly_credits::numeric),
    private.workspace_period_usage(p_workspace_id), c.starts_at, private.credits_unlimited(p_workspace_id)
  from private.workspace_contracts c
  join private.contract_tiers t on t.id = c.tier_id
  where c.workspace_id = p_workspace_id;
end;
$$;

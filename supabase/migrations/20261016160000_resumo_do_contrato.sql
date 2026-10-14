-- Resumo do contrato para a tela Plano (acesso-e-planos): faixa, estado, saldo de créditos, limite mensal e uso do mês.
-- Todo participante ativo lê. Workspace sem contrato devolve zero linhas. Nada daqui mostra dólar.

-- O que o Workspace gastou neste mês, liquidado mais reservado.
create or replace function private.credit_workspace_month_usage(p_workspace_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(case when r.status = 'settled' then r.unit_credits * r.settled_quantity else r.amount end), 0)
  from private.credit_reservations r
  where r.workspace_id = p_workspace_id and r.status in ('reserved', 'settled')
    and r.created_at >= date_trunc('month', now());
$$;

revoke all on function private.credit_workspace_month_usage(uuid) from public, anon, authenticated, service_role;

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
    private.credit_workspace_month_usage(p_workspace_id), c.starts_at, private.credits_unlimited(p_workspace_id)
  from private.workspace_contracts c
  join private.contract_tiers t on t.id = c.tier_id
  where c.workspace_id = p_workspace_id;
end;
$$;

revoke all on function public.get_contract_summary(uuid) from public, anon;
grant execute on function public.get_contract_summary(uuid) to authenticated;

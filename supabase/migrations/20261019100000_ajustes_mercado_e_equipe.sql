-- Ajustes de Mercado e Equipe (PR-4).
-- 1. Os 3 cards de Mercado cobram por execução (`signal_cascade_settings.credits_per_run`, 3 créditos), e o rótulo já diz
--    "3 créditos por execução"; o `credits_per_account` deles passa de 1 para 3, coerente com o rótulo.
-- 2. O Workspace ilimitado (a Equipe Althius) não tem limite de usuários: `invite_to_workspace` já não bloqueia, e o resumo
--    do contrato deixa de devolver o máximo da faixa.

update public.signal_catalog set credits_per_account = 3
where workspace_id is null
  and id in ('nova-mercadoria-importada', 'mudanca-regulatoria-e-licenca', 'calendario-e-plano-safra')
  and credits_per_account is distinct from 3;

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
  select c.status, c.billing_mode, t.id, t.name,
    case when private.credits_unlimited(p_workspace_id) then null::integer else t.max_users end,
    private.active_seats(p_workspace_id), t.monthly_credits,
    coalesce(c.monthly_credit_limit, t.monthly_credits::numeric),
    private.workspace_period_usage(p_workspace_id), c.starts_at, private.credits_unlimited(p_workspace_id)
  from private.workspace_contracts c
  join private.contract_tiers t on t.id = c.tier_id
  where c.workspace_id = p_workspace_id;
end;
$$;

revoke all on function public.get_contract_summary(uuid) from public, anon;
grant execute on function public.get_contract_summary(uuid) to authenticated;

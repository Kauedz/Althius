-- Provisionamento só pelo staff (acesso-e-planos). Não há tela de super admin: a Althius chama esta função por SQL, a
-- pedido do Kauê, com as claims de um usuário de private.althius_staff. Na mesma transação ela cria o Workspace da
-- empresa e o contrato, lança os créditos do mês, define o limite mensal em créditos e o Teto interno da faixa, e
-- convida o administrador.
--
-- O convite é gravado pelo banco, porque o staff não é Administrador do Workspace novo e a Edge Function de e-mail do
-- convite exige Administrador: o link (token) volta no retorno para o Kauê enviar. Nada escreve em auth.users.

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

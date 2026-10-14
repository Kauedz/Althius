-- Limite de usuários nos convites (acesso-e-planos). invite_to_workspace passa a recusar quando os participantes ativos
-- mais os convites pendentes chegam ao máximo de usuários da faixa do contrato. A mensagem já vai em português, para a
-- tela mostrá-la como está. Redefinida a partir da definição mais recente na main (20260927115135).

create or replace function public.invite_to_workspace(p_workspace_id uuid, p_email text, p_role text)
returns table (id uuid, email text, role text, status text, created_at timestamptz, expires_at timestamptz, token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_invitation private.workspace_invitations;
  v_max integer;
begin
  perform private.require_active_admin(p_workspace_id);
  if p_role is null or p_role not in ('member', 'admin') then
    raise exception 'invalid role' using errcode = '22023';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid email' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.workspace_memberships m
    join auth.users u on u.id = m.user_id
    where m.workspace_id = p_workspace_id and m.active and lower(u.email) = v_email
  ) then
    raise exception 'this email already participates in the workspace' using errcode = '23505';
  end if;

  -- O plano limita os usuários: participantes ativos mais convites pendentes não passam do máximo da faixa. Workspace sem
  -- contrato, ou ilimitado (a Equipe), não tem limite.
  select t.max_users into v_max
  from private.workspace_contracts c
  join private.contract_tiers t on t.id = c.tier_id
  where c.workspace_id = p_workspace_id;
  if v_max is not null and not private.credits_unlimited(p_workspace_id) and (
    (select count(*) from public.workspace_memberships m where m.workspace_id = p_workspace_id and m.active)
    + (select count(*) from private.workspace_invitations i
       where i.workspace_id = p_workspace_id and i.status = 'pendente' and i.expires_at > now())
  ) >= v_max then
    raise exception 'Seu plano permite até % usuários. Fale com a equipe Althius para ampliar.', v_max
      using errcode = 'P0001', hint = 'plan_users';
  end if;

  -- Um convite vencido fica registrado como expirado e dá lugar ao novo.
  update private.workspace_invitations i set status = 'expirado'
  where i.workspace_id = p_workspace_id and i.email = v_email and i.status = 'pendente' and i.expires_at <= now();

  begin
    insert into private.workspace_invitations (workspace_id, email, role, token, invited_by)
    values (p_workspace_id, v_email, p_role,
            replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), auth.uid())
    returning * into v_invitation;
  exception when unique_violation then
    raise exception 'a pending invitation already exists for this email' using errcode = '23505';
  end;

  insert into private.workspace_participation_events (workspace_id, event, subject_email, actor_user_id, invitation_id, new_role)
  values (p_workspace_id, 'convite_criado', v_email, auth.uid(), v_invitation.id, p_role);

  return query select v_invitation.id, v_invitation.email, v_invitation.role, v_invitation.status,
    v_invitation.created_at, v_invitation.expires_at, v_invitation.token;
end;
$$;

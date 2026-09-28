-- O e-mail do Convite (CRM-03). A Edge Function workspace-invitation-email reserva cada envio aqui, com a sessão do
-- Administrador que pede, antes de mandar pelo provedor: a função confere o papel e o Convite pendente e limita os
-- envios, para o remetente da Althius não virar canal de spam. Cada reserva conta, saia ou não o e-mail. Limites: um
-- envio por minuto e três por dia para o mesmo Convite, e cinquenta por dia para o Workspace.

create table private.workspace_invitation_emails (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references private.workspace_invitations(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now()
);

create index workspace_invitation_emails_invitation_idx
  on private.workspace_invitation_emails (invitation_id, requested_at);
create index workspace_invitation_emails_workspace_idx
  on private.workspace_invitation_emails (workspace_id, requested_at);
create index workspace_invitation_emails_requested_by_idx
  on private.workspace_invitation_emails (requested_by);

alter table private.workspace_invitation_emails enable row level security;
revoke all on private.workspace_invitation_emails from public, anon, authenticated;

-- Reserva o envio do e-mail de um Convite pendente e devolve o que o e-mail mostra. Só Administrador ativo do
-- Workspace; um Convite de outro Workspace, aceito, expirado ou revogado não é encontrado (P0002); acima do limite, a
-- reserva é recusada (54000) e nada é gravado.
create function public.claim_invitation_email(p_workspace_id uuid, p_invitation_id uuid)
returns table (email text, role text, token text, expires_at timestamptz, workspace_name text, inviter_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_invitation private.workspace_invitations%rowtype;
begin
  perform private.require_active_admin(p_workspace_id);

  select * into v_invitation
  from private.workspace_invitations i
  where i.id = p_invitation_id and i.workspace_id = p_workspace_id
  for update;
  if not found or private.invitation_status(v_invitation.status, v_invitation.expires_at) <> 'pendente' then
    raise exception 'pending invitation not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from private.workspace_invitation_emails e
    where e.invitation_id = p_invitation_id and e.requested_at > now() - interval '1 minute'
  ) or (
    select count(*) from private.workspace_invitation_emails e
    where e.invitation_id = p_invitation_id and e.requested_at > now() - interval '1 day'
  ) >= 3 or (
    select count(*) from private.workspace_invitation_emails e
    where e.workspace_id = p_workspace_id and e.requested_at > now() - interval '1 day'
  ) >= 50 then
    raise exception 'invitation email limit reached' using errcode = '54000';
  end if;

  insert into private.workspace_invitation_emails (invitation_id, workspace_id, requested_by)
  values (p_invitation_id, p_workspace_id, v_user_id);

  return query
    select v_invitation.email, v_invitation.role, v_invitation.token, v_invitation.expires_at, w.name,
      coalesce(p.display_name, private.registered_name(u.raw_user_meta_data), u.email::text)
    from public.workspaces w
    cross join auth.users u
    left join private.user_profiles p on p.user_id = u.id
    where w.id = p_workspace_id and u.id = v_user_id;
end;
$$;

revoke all on function public.claim_invitation_email(uuid, uuid) from public, anon;
grant execute on function public.claim_invitation_email(uuid, uuid) to authenticated;

-- Convites e gestão de participantes (CRM-03).
-- Administradores convidam pessoas ao Workspace, pessoal ou da empresa, alteram papéis e removem Participações. O
-- convidado entra só depois de aceitar, autenticado com o e-mail convidado e verificado: o domínio não basta. Os
-- convites persistem com os estados pendente, aceito, expirado e revogado; o link do convite é o token, que só
-- Administradores obtêm. Nenhum e-mail é enviado por aqui: o envio depende do SMTP de produção no Supabase Auth.
-- Remover encerra só a Participação (active = false): a Conta de usuário, o Workspace pessoal dela e os registros
-- comerciais do Workspace continuam. A identidade vem sempre de auth.uid().

create table private.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  role text not null check (role in ('member', 'admin')),
  -- O segredo do link. Sozinho não concede nada: o aceite exige a sessão do e-mail convidado.
  token text not null unique check (length(token) >= 64),
  -- "expirado" é gravado quando um convite vencido dá lugar a outro; antes disso, a leitura o calcula pelo prazo.
  status text not null default 'pendente' check (status in ('pendente', 'aceito', 'expirado', 'revogado')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  check ((status = 'aceito') = (accepted_at is not null)),
  check ((status = 'revogado') = (revoked_at is not null))
);

-- Um único convite pendente por e-mail em cada Workspace.
create unique index workspace_invitations_one_pending
  on private.workspace_invitations (workspace_id, email) where status = 'pendente';
create index workspace_invitations_workspace_idx on private.workspace_invitations (workspace_id, created_at);
create index workspace_invitations_invited_by_idx on private.workspace_invitations (invited_by);
create index workspace_invitations_accepted_by_idx on private.workspace_invitations (accepted_by);
create index workspace_invitations_revoked_by_idx on private.workspace_invitations (revoked_by);

-- O histórico de convites, aceites, mudanças de papel e remoções, para auditoria.
create table private.workspace_participation_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event text not null check (event in (
    'convite_criado', 'convite_revogado', 'convite_aceito', 'papel_alterado', 'participacao_removida'
  )),
  subject_user_id uuid references auth.users(id) on delete set null,
  subject_email text,
  actor_user_id uuid references auth.users(id) on delete set null,
  invitation_id uuid references private.workspace_invitations(id) on delete set null,
  old_role text,
  new_role text,
  created_at timestamptz not null default now()
);

create index workspace_participation_events_workspace_idx on private.workspace_participation_events (workspace_id, created_at);
create index workspace_participation_events_subject_idx on private.workspace_participation_events (subject_user_id);
create index workspace_participation_events_actor_idx on private.workspace_participation_events (actor_user_id);
create index workspace_participation_events_invitation_idx on private.workspace_participation_events (invitation_id);

alter table private.workspace_invitations enable row level security;
alter table private.workspace_participation_events enable row level security;
revoke all on private.workspace_invitations from public, anon, authenticated;
revoke all on private.workspace_participation_events from public, anon, authenticated;

-- O último Administrador ativo não é removido nem rebaixado, por RPC ou por qualquer outra escrita. O bloqueio do
-- Workspace serializa rebaixamentos concorrentes. Excluir o Workspace inteiro ou a Conta de usuário não esbarra aqui.
create function private.protect_last_workspace_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'admin' and old.active
     and (tg_op = 'DELETE' or new.workspace_id <> old.workspace_id or new.user_id <> old.user_id
          or new.role <> 'admin' or not new.active)
     and exists (select 1 from auth.users u where u.id = old.user_id) then
    perform 1 from public.workspaces w where w.id = old.workspace_id for update;
    if found and not exists (
      select 1 from public.workspace_memberships m
      where m.workspace_id = old.workspace_id and m.active and m.role = 'admin' and m.user_id <> old.user_id
    ) then
      raise exception 'the last administrator cannot be removed or demoted' using errcode = '42501';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.protect_last_workspace_admin() from public, anon, authenticated;

create trigger protect_last_workspace_admin
  before update or delete on public.workspace_memberships
  for each row execute function private.protect_last_workspace_admin();

-- Quem chama precisa de Participação ativa no Workspace; devolve o papel dela.
create function private.require_active_membership(p_workspace_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select m.role into v_role
  from public.workspace_memberships m
  where m.workspace_id = p_workspace_id and m.user_id = v_user_id and m.active;
  if v_role is null then
    raise exception 'active workspace membership required' using errcode = '42501';
  end if;
  return v_role;
end;
$$;

-- Toda operação sobre participantes e convites começa aqui: só Administrador ativo.
create function private.require_active_admin(p_workspace_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if private.require_active_membership(p_workspace_id) <> 'admin' then
    raise exception 'only administrators can manage participants' using errcode = '42501';
  end if;
end;
$$;

-- O estado que o convite apresenta: um pendente vencido já é expirado.
create function private.invitation_status(p_status text, p_expires_at timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select case when p_status = 'pendente' and p_expires_at <= now() then 'expirado' else p_status end;
$$;

revoke all on function private.require_active_membership(uuid) from public, anon, authenticated;
revoke all on function private.require_active_admin(uuid) from public, anon, authenticated;
revoke all on function private.invitation_status(text, timestamptz) from public, anon, authenticated;

-- Os participantes ativos do Workspace, que todo participante ativo consulta. `is_owner` marca o Titular do
-- Workspace pessoal. O nome vem do cadastro e pode faltar; nunca é deduzido do e-mail.
create function public.list_workspace_participants(p_workspace_id uuid)
returns table (user_id uuid, email text, name text, role text, is_owner boolean, joined_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);
  return query
    select m.user_id, u.email::text,
      coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(u.raw_user_meta_data ->> 'name'), '')),
      m.role, coalesce(w.kind = 'pessoal' and w.owner_user_id = m.user_id, false), m.created_at
    from public.workspace_memberships m
    join auth.users u on u.id = m.user_id
    join public.workspaces w on w.id = m.workspace_id
    where m.workspace_id = p_workspace_id and m.active
    order by m.created_at, u.email;
end;
$$;

-- Todos os convites do Workspace, com o estado de cada um. Só Administradores recebem o token do link, e só enquanto
-- o convite está pendente.
create function public.list_workspace_invitations(p_workspace_id uuid)
returns table (id uuid, email text, role text, status text, created_at timestamptz, expires_at timestamptz, token text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin boolean := private.require_active_membership(p_workspace_id) = 'admin';
begin
  return query
    select i.id, i.email, i.role, private.invitation_status(i.status, i.expires_at), i.created_at, i.expires_at,
      case when v_admin and private.invitation_status(i.status, i.expires_at) = 'pendente' then i.token end
    from private.workspace_invitations i
    where i.workspace_id = p_workspace_id
    order by i.created_at desc, i.email;
end;
$$;

-- Registra um convite pendente e devolve o token do link. Não envia e-mail.
create function public.invite_to_workspace(p_workspace_id uuid, p_email text, p_role text)
returns table (id uuid, email text, role text, status text, created_at timestamptz, expires_at timestamptz, token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_invitation private.workspace_invitations;
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

create function public.revoke_workspace_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation private.workspace_invitations;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  -- Quem não é Administrador ativo do Workspace do convite recebe a mesma recusa, exista o convite ou não.
  select * into v_invitation from private.workspace_invitations i where i.id = p_invitation_id for update;
  if not found or not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = v_invitation.workspace_id and m.user_id = auth.uid() and m.active and m.role = 'admin'
  ) then
    raise exception 'only administrators can manage participants' using errcode = '42501';
  end if;
  if private.invitation_status(v_invitation.status, v_invitation.expires_at) <> 'pendente' then
    raise exception 'only pending invitations can be revoked' using errcode = '22023';
  end if;
  update private.workspace_invitations i
  set status = 'revogado', revoked_by = auth.uid(), revoked_at = now()
  where i.id = p_invitation_id;
  insert into private.workspace_participation_events (workspace_id, event, subject_email, actor_user_id, invitation_id)
  values (v_invitation.workspace_id, 'convite_revogado', v_invitation.email, auth.uid(), v_invitation.id);
end;
$$;

-- O que o link do convite mostra antes do login: para qual e-mail ele é, de qual Workspace e com qual papel, só
-- enquanto está pendente; um convite aceito, expirado ou revogado mostra só o estado. Um token desconhecido não
-- devolve nada. Serve à tela de cadastro e entrada por convite (Auth-09).
create function public.workspace_invitation_preview(p_token text)
returns table (email text, workspace_name text, role text, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select case when s.status = 'pendente' then i.email end,
    case when s.status = 'pendente' then w.name end,
    case when s.status = 'pendente' then i.role end,
    s.status
  from private.workspace_invitations i
  join public.workspaces w on w.id = i.workspace_id
  cross join lateral (select private.invitation_status(i.status, i.expires_at) as status) s
  where i.token = p_token;
$$;

-- Aceita o convite com a Conta de usuário da sessão, que precisa ter exatamente o e-mail convidado, verificado.
-- Devolve o Workspace do convite. Reabrir o link de um convite já aceito pela mesma pessoa, ainda participante, só
-- devolve o Workspace; depois de removida, o link antigo não devolve a Participação.
create function public.accept_workspace_invitation(p_token text)
returns public.workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_user auth.users%rowtype;
  v_invitation private.workspace_invitations;
  v_workspace public.workspaces;
  v_old_role text;
  v_role text;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into v_user from auth.users u where u.id = v_user_id;
  if not found or v_user.email_confirmed_at is null then
    raise exception 'email not verified' using errcode = '42501';
  end if;

  select * into v_invitation from private.workspace_invitations i where i.token = p_token for update;
  if not found then
    raise exception 'invitation not found' using errcode = 'P0002';
  end if;
  -- Só o e-mail convidado, exatamente: outra Conta de usuário do mesmo domínio não aceita.
  if lower(v_user.email) is distinct from v_invitation.email then
    raise exception 'invitation is for another email' using errcode = '42501';
  end if;

  select * into v_workspace from public.workspaces w where w.id = v_invitation.workspace_id;

  case private.invitation_status(v_invitation.status, v_invitation.expires_at)
    when 'revogado' then
      raise exception 'invitation revoked' using errcode = '22023';
    when 'expirado' then
      raise exception 'invitation expired' using errcode = '22023';
    when 'aceito' then
      if v_invitation.accepted_by = v_user_id and exists (
        select 1 from public.workspace_memberships m
        where m.workspace_id = v_invitation.workspace_id and m.user_id = v_user_id and m.active
      ) then
        return v_workspace;
      end if;
      raise exception 'invitation already used' using errcode = '22023';
    else
      null;
  end case;

  -- Quem já participou e foi removido volta com o papel do convite; quem já participa continua como está, e o
  -- histórico registra o papel que a pessoa tem de fato.
  select m.role into v_old_role
  from public.workspace_memberships m
  where m.workspace_id = v_invitation.workspace_id and m.user_id = v_user_id and m.active
  for update;
  insert into public.workspace_memberships (workspace_id, user_id, role, active)
  values (v_invitation.workspace_id, v_user_id, v_invitation.role, true)
  on conflict (workspace_id, user_id) do update
    set role = excluded.role, active = true
    where not public.workspace_memberships.active;
  v_role := coalesce(v_old_role, v_invitation.role);

  update private.workspace_invitations i
  set status = 'aceito', accepted_by = v_user_id, accepted_at = now()
  where i.id = v_invitation.id;

  insert into private.workspace_participation_events
    (workspace_id, event, subject_user_id, subject_email, actor_user_id, invitation_id, old_role, new_role)
  values (v_invitation.workspace_id, 'convite_aceito', v_user_id, v_invitation.email, v_user_id, v_invitation.id,
          v_old_role, v_role);

  return v_workspace;
end;
$$;

create function public.change_participant_role(p_workspace_id uuid, p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_role text;
begin
  perform private.require_active_admin(p_workspace_id);
  if p_role is null or p_role not in ('member', 'admin') then
    raise exception 'invalid role' using errcode = '22023';
  end if;
  select m.role into v_old_role
  from public.workspace_memberships m
  where m.workspace_id = p_workspace_id and m.user_id = p_user_id and m.active
  for update;
  if not found then
    raise exception 'participant not found' using errcode = 'P0002';
  end if;
  if v_old_role = p_role then
    return;
  end if;
  -- Os gatilhos recusam rebaixar o último Administrador e o Titular do Workspace pessoal.
  update public.workspace_memberships m set role = p_role
  where m.workspace_id = p_workspace_id and m.user_id = p_user_id;
  insert into private.workspace_participation_events
    (workspace_id, event, subject_user_id, subject_email, actor_user_id, old_role, new_role)
  values (p_workspace_id, 'papel_alterado', p_user_id, (select u.email from auth.users u where u.id = p_user_id),
          auth.uid(), v_old_role, p_role);
end;
$$;

create function public.remove_participant(p_workspace_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_role text;
begin
  perform private.require_active_admin(p_workspace_id);
  if p_user_id = auth.uid() then
    raise exception 'you cannot remove yourself' using errcode = '42501';
  end if;
  select m.role into v_old_role
  from public.workspace_memberships m
  where m.workspace_id = p_workspace_id and m.user_id = p_user_id and m.active
  for update;
  if not found then
    raise exception 'participant not found' using errcode = 'P0002';
  end if;
  -- Só encerra a Participação; os gatilhos recusam o último Administrador e o Titular do Workspace pessoal.
  update public.workspace_memberships m set active = false
  where m.workspace_id = p_workspace_id and m.user_id = p_user_id;
  insert into private.workspace_participation_events
    (workspace_id, event, subject_user_id, subject_email, actor_user_id, old_role)
  values (p_workspace_id, 'participacao_removida', p_user_id, (select u.email from auth.users u where u.id = p_user_id),
          auth.uid(), v_old_role);
end;
$$;

revoke all on function public.list_workspace_participants(uuid) from public, anon;
revoke all on function public.list_workspace_invitations(uuid) from public, anon;
revoke all on function public.invite_to_workspace(uuid, text, text) from public, anon;
revoke all on function public.revoke_workspace_invitation(uuid) from public, anon;
revoke all on function public.workspace_invitation_preview(text) from public;
revoke all on function public.accept_workspace_invitation(text) from public, anon;
revoke all on function public.change_participant_role(uuid, uuid, text) from public, anon;
revoke all on function public.remove_participant(uuid, uuid) from public, anon;

grant execute on function public.list_workspace_participants(uuid) to authenticated;
grant execute on function public.list_workspace_invitations(uuid) to authenticated;
grant execute on function public.invite_to_workspace(uuid, text, text) to authenticated;
grant execute on function public.revoke_workspace_invitation(uuid) to authenticated;
grant execute on function public.workspace_invitation_preview(text) to anon, authenticated;
grant execute on function public.accept_workspace_invitation(text) to authenticated;
grant execute on function public.change_participant_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_participant(uuid, uuid) to authenticated;

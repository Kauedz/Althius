-- Perfil e preferências da Conta de usuário (CRM-08).
-- Meu perfil (nome e foto) e Preferências (tema e notificações do navegador) são da Conta de usuário, e não do
-- Workspace: valem em qualquer Workspace, sobrevivem a sessão e dispositivo e continuam depois de a pessoa perder uma
-- Participação. Cada função age só sobre a Conta de usuário da sessão (auth.uid()); nenhuma recebe o id de outra, então
-- uma pessoa nunca lê nem sobrescreve o perfil ou as preferências de outro participante. O e-mail continua sendo o do
-- Supabase Auth, e a senha é trocada pelo Supabase Auth; nada aqui escreve em auth.users.

create table private.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- O nome como a pessoa quer aparecer; sem perfil salvo, vale o nome do cadastro ou do Google.
  display_name text not null check (display_name = btrim(display_name) and length(display_name) between 1 and 120),
  -- A foto enviada pela pessoa, como data URL de imagem e com tamanho limitado; sem foto, a tela mostra as iniciais.
  avatar_data_url text check (
    avatar_data_url ~ '^data:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$'
    and length(avatar_data_url) <= 400000
  ),
  updated_at timestamptz not null default now()
);

create table private.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- Sem tema escolhido, vale o do navegador.
  theme text check (theme in ('escuro', 'claro')),
  -- A vontade de receber notificações do navegador; mostrá-las ainda depende da permissão do navegador.
  browser_notifications boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table private.user_profiles enable row level security;
alter table private.user_preferences enable row level security;
revoke all on private.user_profiles from public, anon, authenticated;
revoke all on private.user_preferences from public, anon, authenticated;

-- A Conta de usuário da sessão; sem ela, nada.
create function private.require_user()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  return v_user_id;
end;
$$;

-- O nome do cadastro (e-mail e senha) ou do Google; pode faltar e nunca é deduzido do e-mail.
create function private.registered_name(p_meta jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(nullif(btrim(p_meta ->> 'full_name'), ''), nullif(btrim(p_meta ->> 'name'), ''));
$$;

revoke all on function private.require_user() from public, anon, authenticated;
revoke all on function private.registered_name(jsonb) from public, anon, authenticated;

-- O perfil da Conta de usuário da sessão: o nome salvo em Meu perfil ou, sem ele, o do cadastro; a foto; o e-mail.
create function public.get_my_profile()
returns table (name text, avatar_data_url text, email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user();
begin
  return query
    select coalesce(p.display_name, private.registered_name(u.raw_user_meta_data)), p.avatar_data_url, u.email::text
    from auth.users u
    left join private.user_profiles p on p.user_id = u.id
    where u.id = v_user_id;
end;
$$;

-- Grava nome e foto da Conta de usuário da sessão. `p_avatar_data_url` nulo remove a foto.
create function public.save_my_profile(p_display_name text, p_avatar_data_url text)
returns table (name text, avatar_data_url text, email text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user();
  v_name text := btrim(coalesce(p_display_name, ''));
begin
  if length(v_name) not between 1 and 120 then
    raise exception 'invalid name' using errcode = '22023';
  end if;
  if p_avatar_data_url is not null and (
    p_avatar_data_url !~ '^data:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$'
    or length(p_avatar_data_url) > 400000
  ) then
    raise exception 'invalid avatar' using errcode = '22023';
  end if;

  insert into private.user_profiles as p (user_id, display_name, avatar_data_url)
  values (v_user_id, v_name, p_avatar_data_url)
  on conflict (user_id) do update
    set display_name = excluded.display_name, avatar_data_url = excluded.avatar_data_url, updated_at = now();

  return query select * from public.get_my_profile();
end;
$$;

-- As preferências da Conta de usuário da sessão; sem nada salvo, sem tema e com as notificações desligadas.
create function public.get_my_preferences()
returns table (theme text, browser_notifications boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user();
begin
  return query
    select p.theme, coalesce(p.browser_notifications, false)
    from (select v_user_id as user_id) s
    left join private.user_preferences p on p.user_id = s.user_id;
end;
$$;

-- Grava só o que veio: um parâmetro nulo mantém o valor salvo, para salvar o tema não desfazer as notificações que
-- outra aba ou outro dispositivo acabou de salvar, nem o contrário.
create function public.save_my_preferences(p_theme text default null, p_browser_notifications boolean default null)
returns table (theme text, browser_notifications boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user();
begin
  if p_theme is not null and p_theme not in ('escuro', 'claro') then
    raise exception 'invalid theme' using errcode = '22023';
  end if;

  insert into private.user_preferences as p (user_id, theme, browser_notifications)
  values (v_user_id, p_theme, coalesce(p_browser_notifications, false))
  on conflict (user_id) do update
    set theme = coalesce(p_theme, p.theme),
        browser_notifications = coalesce(p_browser_notifications, p.browser_notifications),
        updated_at = now();

  return query select * from public.get_my_preferences();
end;
$$;

-- Os participantes ativos do Workspace passam a aparecer com o nome salvo em Meu perfil; sem ele, o do cadastro.
-- Mesma assinatura e mesmas regras de acesso da versão de convites_e_participantes.
create or replace function public.list_workspace_participants(p_workspace_id uuid)
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
      coalesce(p.display_name, private.registered_name(u.raw_user_meta_data)),
      m.role, coalesce(w.kind = 'pessoal' and w.owner_user_id = m.user_id, false), m.created_at
    from public.workspace_memberships m
    join auth.users u on u.id = m.user_id
    join public.workspaces w on w.id = m.workspace_id
    left join private.user_profiles p on p.user_id = m.user_id
    where m.workspace_id = p_workspace_id and m.active
    order by m.created_at, u.email;
end;
$$;

revoke all on function public.get_my_profile() from public, anon;
revoke all on function public.save_my_profile(text, text) from public, anon;
revoke all on function public.get_my_preferences() from public, anon;
revoke all on function public.save_my_preferences(text, boolean) from public, anon;
revoke all on function public.list_workspace_participants(uuid) from public, anon;

grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.save_my_profile(text, text) to authenticated;
grant execute on function public.get_my_preferences() to authenticated;
grant execute on function public.save_my_preferences(text, boolean) to authenticated;
grant execute on function public.list_workspace_participants(uuid) to authenticated;

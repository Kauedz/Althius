-- Revisão do Auth-02: o bootstrap do Workspace pessoal não sobrescreve o aceite dos Termos que já existe.
-- A 20260925140000_workspace_pessoal.sql já estava aplicada; a correção entra como migration nova.

create or replace function public.bootstrap_personal_workspace(p_terms_version text)
returns public.workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_user auth.users%rowtype;
  v_name text;
  v_workspace public.workspaces%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_user from auth.users where id = v_user_id;
  if not found or v_user.email_confirmed_at is null then
    raise exception 'email not verified' using errcode = '42501';
  end if;

  if p_terms_version is null or btrim(p_terms_version) = '' then
    raise exception 'terms version is required' using errcode = '22023';
  end if;

  v_name := coalesce(
    nullif(btrim(v_user.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(v_user.raw_user_meta_data ->> 'name'), ''),
    'Workspace pessoal'
  );

  insert into public.workspaces (kind, name, owner_user_id)
  values ('pessoal', v_name, v_user_id)
  on conflict (owner_user_id) where kind = 'pessoal' do nothing;

  select * into v_workspace
  from public.workspaces
  where owner_user_id = v_user_id and kind = 'pessoal';

  insert into public.workspace_memberships (workspace_id, user_id, role, active)
  values (v_workspace.id, v_user_id, 'admin', true)
  on conflict (workspace_id, user_id) do nothing;

  -- Só o primeiro acesso registra o aceite; um aceite existente nunca é sobrescrito por uma versão nova.
  insert into public.terms_acceptances (user_id, terms_version)
  values (v_user_id, p_terms_version)
  on conflict (user_id) do nothing;

  return v_workspace;
end;
$$;

revoke all on function public.bootstrap_personal_workspace(text) from public, anon;
grant execute on function public.bootstrap_personal_workspace(text) to authenticated;

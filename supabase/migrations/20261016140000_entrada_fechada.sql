-- Entrada fechada (acesso-e-planos). O login com Google continua aberto, mas ninguém cria Workspace por conta própria:
-- o Workspace operacional só nasce do contrato e só a Althius o cria (staff_provision_workspace).
--
-- 1. bootstrap_personal_workspace deixa de criar Workspace pessoal novo e só grava o aceite dos Termos. Os Workspaces
--    pessoais que já existem continuam, com a Participação do Titular garantida, e nada é apagado. A assinatura e o tipo
--    do retorno ficam: devolve o Workspace pessoal que já existe, ou uma linha vazia.
-- 2. create_company_workspace deixa de ser chamável por authenticated. A função continua no banco, para o service_role.

create or replace function public.bootstrap_personal_workspace(p_terms_version text)
returns public.workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_user auth.users%rowtype;
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

  -- Só o primeiro acesso registra o aceite; um aceite existente nunca é sobrescrito por uma versão nova.
  insert into public.terms_acceptances (user_id, terms_version)
  values (v_user_id, p_terms_version)
  on conflict (user_id) do nothing;

  select * into v_workspace
  from public.workspaces
  where owner_user_id = v_user_id and kind = 'pessoal';
  if found then
    insert into public.workspace_memberships (workspace_id, user_id, role, active)
    values (v_workspace.id, v_user_id, 'admin', true)
    on conflict (workspace_id, user_id) do nothing;
  end if;

  return v_workspace;
end;
$$;

revoke execute on function public.create_company_workspace(text, uuid) from authenticated;

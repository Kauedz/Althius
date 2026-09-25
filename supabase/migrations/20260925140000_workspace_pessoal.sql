-- Workspace pessoal criado no primeiro acesso (Auth-02, ADR-0011).
-- Nasce a tabela de Workspaces, integrada às Participações existentes; toda Conta de usuário com
-- e-mail verificado ganha, por um bootstrap idempotente, seu Workspace pessoal e a Participação de
-- Administrador. A identidade vem sempre de auth.uid().

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('pessoal', 'empresa')),
  name text not null check (btrim(name) <> ''),
  -- Titular do Workspace pessoal; um Workspace da empresa não tem Titular.
  owner_user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((kind = 'pessoal') = (owner_user_id is not null))
);

-- Um único Workspace pessoal por Conta de usuário: é o que torna o bootstrap idempotente.
create unique index workspaces_one_personal_per_owner
  on public.workspaces (owner_user_id) where kind = 'pessoal';

-- As Participações já existentes apontam para Workspaces sem linha: eles são Workspaces da empresa.
insert into public.workspaces (id, kind, name)
select distinct m.workspace_id, 'empresa', 'Workspace da empresa'
from public.workspace_memberships m
on conflict (id) do nothing;

alter table public.workspace_memberships
  add constraint workspace_memberships_workspace_id_fkey
  foreign key (workspace_id) references public.workspaces(id) on delete cascade;

alter table public.workspaces enable row level security;

create policy "active members read their workspaces"
  on public.workspaces for select to authenticated
  using (exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = workspaces.id
      and m.user_id = (select auth.uid()) and m.active
  ));

revoke all on public.workspaces from anon, authenticated;
grant select on public.workspaces to authenticated;

-- Aceite dos Termos de Uso e da Política de Privacidade, publicados juntos numa mesma versão.
create table public.terms_acceptances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  terms_version text not null check (btrim(terms_version) <> ''),
  accepted_at timestamptz not null default now()
);

alter table public.terms_acceptances enable row level security;

create policy "users read own terms acceptance"
  on public.terms_acceptances for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.terms_acceptances from anon, authenticated;
grant select on public.terms_acceptances to authenticated;

-- O Titular não pode ser removido nem rebaixado no próprio Workspace pessoal, nem por outro
-- Administrador. Só sai junto com o Workspace ou com a própria Conta de usuário.
create function private.protect_personal_workspace_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.workspaces w
    where w.id = old.workspace_id and w.kind = 'pessoal' and w.owner_user_id = old.user_id
  ) and exists (select 1 from auth.users u where u.id = old.user_id) then
    if tg_op = 'DELETE'
       or new.workspace_id <> old.workspace_id or new.user_id <> old.user_id
       or new.role <> 'admin' or not new.active then
      raise exception 'the owner of a personal workspace cannot be removed or demoted'
        using errcode = '42501';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.protect_personal_workspace_owner() from public, anon, authenticated;

create trigger protect_personal_workspace_owner
  before update or delete on public.workspace_memberships
  for each row execute function private.protect_personal_workspace_owner();

-- Bootstrap chamado pelo app após a sessão verificada. Na mesma transação garante o Workspace
-- pessoal (nome inicial da pessoa, nunca deduzido do e-mail), a Participação de Administrador e o
-- aceite dos Termos. Chamá-lo de novo não cria nada.
create function public.bootstrap_personal_workspace(p_terms_version text)
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

  insert into public.terms_acceptances (user_id, terms_version)
  values (v_user_id, p_terms_version)
  on conflict (user_id) do update
    set terms_version = excluded.terms_version, accepted_at = now()
    where public.terms_acceptances.terms_version is distinct from excluded.terms_version;

  return v_workspace;
end;
$$;

revoke all on function public.bootstrap_personal_workspace(text) from public, anon;
grant execute on function public.bootstrap_personal_workspace(text) to authenticated;

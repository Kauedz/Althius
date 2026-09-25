-- Contas-alvo reais (CRM-04).
-- A Conta-alvo tem UUID próprio e pertence a um Workspace. A URL canônica da empresa é a chave de correspondência
-- para atualização; domínio e identificador legal são dados da Conta e nunca mesclam registros sozinhos.
-- A responsabilidade inicial do cadastro manual é de quem criou e fica em public.sales_responsibilities, com o UUID
-- da Conta gravado como texto (a migração dessa coluna para FK UUID é o CRM-17).
-- Toda Participação ativa consulta as Contas e as Interações do Workspace; escrita só pelas RPCs abaixo.

create table public.target_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  canonical_url text not null check (canonical_url like 'https://%'),
  domain text not null,
  legal_identifier text,
  linkedin_url text,
  segment text,
  created_by uuid not null references auth.users(id),
  last_interaction_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, canonical_url),
  unique (workspace_id, id)
);

create table public.account_interactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  target_account_id uuid not null,
  kind text not null
    check (kind in ('email-enviado', 'email-recebido', 'mensagem-enviada', 'ligacao', 'reuniao')),
  occurred_at timestamptz not null default now(),
  source text not null default 'manual' check (source in ('manual')),
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (workspace_id, target_account_id)
    references public.target_accounts(workspace_id, id) on delete cascade
);

create index account_interactions_account_idx
  on public.account_interactions (target_account_id, occurred_at desc);

alter table public.target_accounts enable row level security;
alter table public.account_interactions enable row level security;

create policy "active members read target accounts"
  on public.target_accounts for select to authenticated
  using (exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = target_accounts.workspace_id
      and m.user_id = (select auth.uid()) and m.active
  ));

create policy "active members read account interactions"
  on public.account_interactions for select to authenticated
  using (exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = account_interactions.workspace_id
      and m.user_id = (select auth.uid()) and m.active
  ));

revoke all on public.target_accounts from anon, authenticated;
revoke all on public.account_interactions from anon, authenticated;
grant select on public.target_accounts to authenticated;
grant select on public.account_interactions to authenticated;

-- A forma canônica da URL da empresa: sem esquema, "www.", consulta, fragmento nem barra final, em minúsculas.
create function private.canonical_company_url(p_url text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := lower(btrim(coalesce(p_url, '')));
begin
  v := regexp_replace(v, '^[a-z][a-z0-9+.-]*://', '');
  v := regexp_replace(v, '[?#].*$', '');
  v := regexp_replace(v, '^www\.', '');
  v := regexp_replace(v, '/+$', '');
  if v !~ '^[a-z0-9-]+(\.[a-z0-9-]+)+(:[0-9]+)?(/[^[:space:]]*)?$' then
    raise exception 'invalid company url' using errcode = '22023';
  end if;
  return 'https://' || v;
end;
$$;

revoke all on function private.canonical_company_url(text) from public, anon, authenticated;

-- Cria a Conta-alvo, atribuída a quem criou, ou atualiza a que tem a mesma URL canônica, se for de quem chama.
create function public.save_target_account(
  p_workspace_id uuid,
  p_name text,
  p_url text,
  p_legal_identifier text default null,
  p_linkedin_url text default null,
  p_segment text default null
) returns public.target_accounts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_url text;
  v_account public.target_accounts;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = p_workspace_id and m.user_id = v_user_id and m.active
  ) then
    raise exception 'active workspace membership required' using errcode = '42501';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'account name is required' using errcode = '22023';
  end if;

  v_url := private.canonical_company_url(p_url);

  select * into v_account from public.target_accounts
  where workspace_id = p_workspace_id and canonical_url = v_url
  for update;

  if found then
    if not exists (
      select 1 from public.sales_responsibilities r
      where r.workspace_id = p_workspace_id
        and r.target_account_id = v_account.id::text
        and r.owner_user_id = v_user_id
    ) then
      raise exception 'only the responsible seller can edit this target account' using errcode = '42501';
    end if;

    update public.target_accounts set
      name = btrim(p_name),
      legal_identifier = coalesce(nullif(btrim(p_legal_identifier), ''), legal_identifier),
      linkedin_url = coalesce(nullif(btrim(p_linkedin_url), ''), linkedin_url),
      segment = coalesce(nullif(btrim(p_segment), ''), segment),
      updated_at = now()
    where id = v_account.id
    returning * into v_account;
    return v_account;
  end if;

  insert into public.target_accounts (
    workspace_id, name, canonical_url, domain, legal_identifier, linkedin_url, segment, created_by
  ) values (
    p_workspace_id, btrim(p_name), v_url,
    regexp_replace(substr(v_url, 9), '[:/].*$', ''),
    nullif(btrim(p_legal_identifier), ''), nullif(btrim(p_linkedin_url), ''), nullif(btrim(p_segment), ''),
    v_user_id
  ) returning * into v_account;

  insert into public.sales_responsibilities (workspace_id, target_account_id, owner_user_id)
  values (p_workspace_id, v_account.id::text, v_user_id);

  return v_account;
end;
$$;

revoke all on function public.save_target_account(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.save_target_account(uuid, text, text, text, text, text) to authenticated;

-- O Vendedor responsável registra uma Interação comercial manual na Conta.
create function public.register_account_interaction(
  p_target_account_id uuid,
  p_kind text,
  p_occurred_at timestamptz default null
) returns public.account_interactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_account public.target_accounts;
  v_interaction public.account_interactions;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select a.* into v_account from public.target_accounts a
  join public.workspace_memberships m
    on m.workspace_id = a.workspace_id and m.user_id = v_user_id and m.active
  where a.id = p_target_account_id
  for update of a;
  if not found then
    raise exception 'target account not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.sales_responsibilities r
    where r.workspace_id = v_account.workspace_id
      and r.target_account_id = v_account.id::text
      and r.owner_user_id = v_user_id
  ) then
    raise exception 'only the responsible seller can register interactions on this target account'
      using errcode = '42501';
  end if;

  insert into public.account_interactions (workspace_id, target_account_id, kind, occurred_at, recorded_by)
  values (v_account.workspace_id, v_account.id, p_kind, coalesce(p_occurred_at, now()), v_user_id)
  returning * into v_interaction;

  update public.target_accounts
  set last_interaction_at = greatest(last_interaction_at, v_interaction.occurred_at)
  where id = v_account.id;

  return v_interaction;
end;
$$;

revoke all on function public.register_account_interaction(uuid, text, timestamptz) from public, anon;
grant execute on function public.register_account_interaction(uuid, text, timestamptz) to authenticated;

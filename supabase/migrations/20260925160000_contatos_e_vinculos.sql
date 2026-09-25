-- Contatos e Vínculos do Contato reais (CRM-05).
-- O Contato tem UUID próprio e uma identidade única por Workspace: e-mail, telefone e LinkedIn são opcionais e, quando
-- informados, não se repetem entre Contatos do mesmo Workspace; o nome sozinho nunca mescla Contatos.
-- O Vínculo do Contato liga o Contato a uma Conta-alvo do mesmo Workspace. Pode haver Vínculos ativos com várias
-- Contas; encerrar um Vínculo e abrir outro preserva as Interações na Conta onde aconteceram.
-- Membro cria/edita Contatos das Contas sob sua responsabilidade; Administrador, de qualquer Conta do Workspace.
-- Toda Participação ativa consulta Contatos e Vínculos; escrita só pelas RPCs abaixo.
--
-- A tabela antiga public.target_contacts (canais-02: id em texto por Conta, FK para a responsabilidade) sai da API:
-- vai para private.target_contacts_canais02, preservando o que houver, e public.target_contacts passa a ser a
-- visão dos Contatos com Vínculo ativo, com as colunas de destino que o documento da Sequência já usava.
-- public.upsert_target_contact continua com a mesma assinatura, agora gravando no Contato canônico.

drop function public.upsert_target_contact(uuid, text, text, text, text, text, text, text);
alter table public.target_contacts set schema private;
alter table private.target_contacts rename to target_contacts_canais02;
revoke all on private.target_contacts_canais02 from anon, authenticated;

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  role text,
  email text,
  phone text,
  linkedin text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);

create unique index contacts_email_per_workspace on public.contacts (workspace_id, email) where email is not null;
create unique index contacts_phone_per_workspace on public.contacts (workspace_id, phone) where phone is not null;
create unique index contacts_linkedin_per_workspace on public.contacts (workspace_id, linkedin) where linkedin is not null;

create table public.contact_account_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  contact_id uuid not null,
  target_account_id uuid not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_by uuid references auth.users(id),
  check (ended_at is null or ended_at >= started_at),
  foreign key (workspace_id, contact_id) references public.contacts(workspace_id, id) on delete cascade,
  foreign key (workspace_id, target_account_id) references public.target_accounts(workspace_id, id) on delete cascade
);

create unique index contact_account_links_one_active
  on public.contact_account_links (contact_id, target_account_id) where ended_at is null;
create index contact_account_links_account_idx on public.contact_account_links (target_account_id) where ended_at is null;

-- A Interação pode envolver um Contato; ela continua na Conta onde aconteceu mesmo depois do Vínculo encerrado.
alter table public.account_interactions add column contact_id uuid;
alter table public.account_interactions
  add foreign key (workspace_id, contact_id) references public.contacts(workspace_id, id) on delete set null (contact_id);
create index account_interactions_contact_idx on public.account_interactions (contact_id) where contact_id is not null;

alter table public.contacts enable row level security;
alter table public.contact_account_links enable row level security;

create policy "active members read contacts"
  on public.contacts for select to authenticated
  using (exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = contacts.workspace_id
      and m.user_id = (select auth.uid()) and m.active
  ));

create policy "active members read contact links"
  on public.contact_account_links for select to authenticated
  using (exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = contact_account_links.workspace_id
      and m.user_id = (select auth.uid()) and m.active
  ));

revoke all on public.contacts from anon, authenticated;
revoke all on public.contact_account_links from anon, authenticated;
grant select on public.contacts to authenticated;
grant select on public.contact_account_links to authenticated;

-- Os Contatos com Vínculo ativo, uma linha por Conta. Lida com o RLS de quem consulta.
create view public.target_contacts with (security_invoker = true) as
select
  c.id,
  l.workspace_id,
  l.target_account_id,
  l.id as link_id,
  c.name,
  c.role,
  c.email,
  c.phone,
  c.phone as whatsapp,
  c.linkedin,
  c.linkedin as linkedin_identity,
  true as is_real,
  l.started_at,
  (select max(i.occurred_at) from public.account_interactions i
    where i.contact_id = c.id and i.target_account_id = l.target_account_id) as last_interaction_at,
  c.created_at,
  c.updated_at
from public.contact_account_links l
join public.contacts c on c.workspace_id = l.workspace_id and c.id = l.contact_id
where l.ended_at is null;

revoke all on public.target_contacts from anon, authenticated;
grant select on public.target_contacts to authenticated;

-- LinkedIn na forma de comparação: perfil /in/ vira https://www.linkedin.com/in/<perfil>; outro valor, aparado.
create function private.normalize_linkedin(p_value text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := btrim(coalesce(p_value, ''));
  v_url text;
begin
  if v = '' then
    return null;
  end if;
  v_url := lower(v);
  v_url := regexp_replace(v_url, '^[a-z][a-z0-9+.-]*://', '');
  v_url := regexp_replace(v_url, '[?#].*$', '');
  v_url := regexp_replace(v_url, '^([a-z]{2,3}\.)?(www\.)?', '');
  v_url := regexp_replace(v_url, '/+$', '');
  if v_url ~ '^linkedin\.com/in/[^/]+$' then
    return 'https://www.linkedin.com/in/' || substr(v_url, length('linkedin.com/in/') + 1);
  end if;
  return v;
end;
$$;

revoke all on function private.normalize_linkedin(text) from public, anon, authenticated;

-- Quem chama pode gerenciar Contatos desta Conta: Administrador ativo do Workspace ou o Vendedor responsável ativo.
create function private.can_manage_account_contacts(p_workspace_id uuid, p_target_account_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = p_workspace_id and m.user_id = p_user_id and m.active
      and (
        m.role = 'admin'
        or exists (
          select 1 from public.sales_responsibilities r
          where r.workspace_id = p_workspace_id
            and r.target_account_id = p_target_account_id::text
            and r.owner_user_id = p_user_id
        )
      )
  );
$$;

revoke all on function private.can_manage_account_contacts(uuid, uuid, uuid) from public, anon, authenticated;

-- A Conta-alvo visível a quem chama (Participação ativa), travada para a operação.
create function private.account_for_caller(p_target_account_id uuid, p_user_id uuid)
returns public.target_accounts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.target_accounts;
begin
  if p_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select a.* into v_account from public.target_accounts a
  join public.workspace_memberships m
    on m.workspace_id = a.workspace_id and m.user_id = p_user_id and m.active
  where a.id = p_target_account_id
  for share of a;
  if not found then
    raise exception 'target account not found' using errcode = 'P0002';
  end if;
  return v_account;
end;
$$;

revoke all on function private.account_for_caller(uuid, uuid) from public, anon, authenticated;

-- Abre o Vínculo ativo do Contato com a Conta, ou devolve o que já existe.
create function private.open_contact_link(p_workspace_id uuid, p_contact_id uuid, p_target_account_id uuid, p_user_id uuid)
returns public.contact_account_links
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.contact_account_links;
begin
  insert into public.contact_account_links (workspace_id, contact_id, target_account_id, created_by)
  values (p_workspace_id, p_contact_id, p_target_account_id, p_user_id)
  on conflict (contact_id, target_account_id) where ended_at is null do nothing
  returning * into v_link;
  if v_link.id is null then
    select * into v_link from public.contact_account_links
    where contact_id = p_contact_id and target_account_id = p_target_account_id and ended_at is null;
  end if;
  return v_link;
end;
$$;

revoke all on function private.open_contact_link(uuid, uuid, uuid, uuid) from public, anon, authenticated;

-- Cadastra o Contato numa Conta-alvo, abrindo o Vínculo com ela.
create function public.create_contact(
  p_target_account_id uuid,
  p_name text,
  p_role text default null,
  p_email text default null,
  p_phone text default null,
  p_linkedin text default null
) returns public.contacts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_account public.target_accounts := private.account_for_caller(p_target_account_id, auth.uid());
  v_contact public.contacts;
begin
  if not private.can_manage_account_contacts(v_account.workspace_id, v_account.id, v_user_id) then
    raise exception 'only the responsible seller or an admin can manage contacts of this target account'
      using errcode = '42501';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'contact name is required' using errcode = '22023';
  end if;

  insert into public.contacts (workspace_id, name, role, email, phone, linkedin, created_by)
  values (
    v_account.workspace_id, btrim(p_name), nullif(btrim(p_role), ''),
    private.validate_email(p_email), private.normalize_whatsapp(p_phone), private.normalize_linkedin(p_linkedin),
    v_user_id
  ) returning * into v_contact;

  perform private.open_contact_link(v_account.workspace_id, v_contact.id, v_account.id, v_user_id);
  return v_contact;
end;
$$;

revoke all on function public.create_contact(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.create_contact(uuid, text, text, text, text, text) to authenticated;

-- Edita o Contato. Campo nulo mantém o valor; texto vazio apaga o canal (o nome nunca fica vazio).
create function public.update_contact(
  p_contact_id uuid,
  p_name text default null,
  p_role text default null,
  p_email text default null,
  p_phone text default null,
  p_linkedin text default null
) returns public.contacts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_contact public.contacts;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select c.* into v_contact from public.contacts c
  join public.workspace_memberships m
    on m.workspace_id = c.workspace_id and m.user_id = v_user_id and m.active
  where c.id = p_contact_id
  for update of c;
  if not found then
    raise exception 'contact not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = v_contact.workspace_id and m.user_id = v_user_id and m.active and m.role = 'admin'
  ) and (
    -- Membro: todos os Vínculos ativos do Contato em Contas sob sua responsabilidade. Vincular não concede edição.
    not exists (
      select 1 from public.contact_account_links l
      where l.contact_id = v_contact.id and l.ended_at is null
    ) or exists (
      select 1 from public.contact_account_links l
      where l.contact_id = v_contact.id and l.ended_at is null
        and not private.can_manage_account_contacts(l.workspace_id, l.target_account_id, v_user_id)
    )
  ) then
    raise exception 'only the responsible seller or an admin can edit this contact' using errcode = '42501';
  end if;

  if p_name is not null and btrim(p_name) = '' then
    raise exception 'contact name is required' using errcode = '22023';
  end if;

  update public.contacts set
    name = coalesce(btrim(p_name), name),
    role = case when p_role is null then role else nullif(btrim(p_role), '') end,
    email = case when p_email is null then email else private.validate_email(p_email) end,
    phone = case when p_phone is null then phone else private.normalize_whatsapp(p_phone) end,
    linkedin = case when p_linkedin is null then linkedin else private.normalize_linkedin(p_linkedin) end,
    updated_at = now()
  where id = v_contact.id
  returning * into v_contact;
  return v_contact;
end;
$$;

revoke all on function public.update_contact(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.update_contact(uuid, text, text, text, text, text) to authenticated;

-- Vincula um Contato existente a outra Conta-alvo do mesmo Workspace.
create function public.link_contact(p_contact_id uuid, p_target_account_id uuid)
returns public.contact_account_links
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_account public.target_accounts := private.account_for_caller(p_target_account_id, auth.uid());
begin
  if not exists (
    select 1 from public.contacts c where c.id = p_contact_id and c.workspace_id = v_account.workspace_id
  ) then
    raise exception 'contact not found' using errcode = 'P0002';
  end if;
  if not private.can_manage_account_contacts(v_account.workspace_id, v_account.id, v_user_id) then
    raise exception 'only the responsible seller or an admin can manage contacts of this target account'
      using errcode = '42501';
  end if;
  return private.open_contact_link(v_account.workspace_id, p_contact_id, v_account.id, v_user_id);
end;
$$;

revoke all on function public.link_contact(uuid, uuid) from public, anon;
grant execute on function public.link_contact(uuid, uuid) to authenticated;

-- Encerra o Vínculo ativo do Contato com a Conta. As Interações ficam na Conta.
create function public.end_contact_link(p_contact_id uuid, p_target_account_id uuid)
returns public.contact_account_links
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_account public.target_accounts := private.account_for_caller(p_target_account_id, auth.uid());
  v_link public.contact_account_links;
begin
  if not private.can_manage_account_contacts(v_account.workspace_id, v_account.id, v_user_id) then
    raise exception 'only the responsible seller or an admin can manage contacts of this target account'
      using errcode = '42501';
  end if;
  update public.contact_account_links set ended_at = greatest(now(), started_at)
  where contact_id = p_contact_id and target_account_id = v_account.id and ended_at is null
  returning * into v_link;
  if v_link.id is null then
    raise exception 'active contact link not found' using errcode = 'P0002';
  end if;
  return v_link;
end;
$$;

revoke all on function public.end_contact_link(uuid, uuid) from public, anon;
grant execute on function public.end_contact_link(uuid, uuid) to authenticated;

-- A Interação manual pode envolver um Contato com Vínculo ativo na Conta.
drop function public.register_account_interaction(uuid, text, timestamptz);

create function public.register_account_interaction(
  p_target_account_id uuid,
  p_kind text,
  p_occurred_at timestamptz default null,
  p_contact_id uuid default null
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

  -- Trava o Vínculo: um encerramento concorrente espera esta Interação ou a recusa.
  if p_contact_id is not null then
    perform 1 from public.contact_account_links l
    where l.contact_id = p_contact_id and l.target_account_id = v_account.id and l.ended_at is null
    for share;
    if not found then
      raise exception 'contact has no active link with this target account' using errcode = '22023';
    end if;
  end if;

  insert into public.account_interactions (workspace_id, target_account_id, contact_id, kind, occurred_at, recorded_by)
  values (v_account.workspace_id, v_account.id, p_contact_id, p_kind, coalesce(p_occurred_at, now()), v_user_id)
  returning * into v_interaction;

  update public.target_accounts
  set last_interaction_at = greatest(last_interaction_at, v_interaction.occurred_at)
  where id = v_account.id;

  return v_interaction;
end;
$$;

revoke all on function public.register_account_interaction(uuid, text, timestamptz, uuid) from public, anon;
grant execute on function public.register_account_interaction(uuid, text, timestamptz, uuid) to authenticated;

-- Compatibilidade com o documento da Sequência (canais-02): mesma assinatura, gravando no Contato canônico.
-- p_target_account_id é o UUID da Conta-alvo; p_contact_id vazio cria o Contato, um UUID existente o atualiza
-- (destinos substituídos, como antes) e garante o Vínculo ativo com a Conta.
create function public.upsert_target_contact(
  p_workspace_id uuid,
  p_target_account_id text,
  p_contact_id text,
  p_name text,
  p_role text default null,
  p_email text default null,
  p_whatsapp text default null,
  p_linkedin_identity text default null
) returns public.target_contacts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_account_id uuid;
  v_contact_id uuid;
  v_row public.target_contacts;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_target_account_id !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
     or not exists (
       select 1 from public.target_accounts a
       where a.id = p_target_account_id::uuid and a.workspace_id = p_workspace_id
     ) then
    raise exception 'target account not found' using errcode = 'P0002';
  end if;
  v_account_id := p_target_account_id::uuid;

  if not private.can_manage_account_contacts(p_workspace_id, v_account_id, v_user_id) then
    raise exception 'only the responsible seller can register or update target contacts' using errcode = '42501';
  end if;

  if nullif(btrim(p_contact_id), '') is null then
    v_contact_id := (public.create_contact(v_account_id, p_name, p_role, p_email, p_whatsapp, p_linkedin_identity)).id;
  else
    if p_contact_id !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
       or not exists (select 1 from public.contacts c where c.id = p_contact_id::uuid and c.workspace_id = p_workspace_id) then
      raise exception 'contact not found' using errcode = 'P0002';
    end if;
    v_contact_id := p_contact_id::uuid;
    perform private.open_contact_link(p_workspace_id, v_contact_id, v_account_id, v_user_id);
    perform public.update_contact(v_contact_id, p_name, p_role,
      coalesce(p_email, ''), coalesce(p_whatsapp, ''), coalesce(p_linkedin_identity, ''));
  end if;

  select * into v_row from public.target_contacts t
  where t.id = v_contact_id and t.target_account_id = v_account_id;
  return v_row;
end;
$$;

revoke all on function public.upsert_target_contact(uuid, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.upsert_target_contact(uuid, text, text, text, text, text, text, text) to authenticated;

-- Atribuicao comercial imutavel e Sequencia exclusiva por Workspace/Conta-alvo.
-- A identidade sempre vem de auth.uid(); nenhum identificador enviado pelo cliente
-- e aceito como prova de identidade.

create schema if not exists private;

create table public.workspace_memberships (
  workspace_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('member', 'admin')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.sales_responsibilities (
  workspace_id uuid not null,
  target_account_id text not null,
  owner_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (workspace_id, target_account_id),
  foreign key (workspace_id, owner_user_id)
    references public.workspace_memberships(workspace_id, user_id)
);

create table public.sequences (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  target_account_id text not null,
  owner_user_id uuid not null references auth.users(id),
  status text not null default 'ativa'
    check (status in ('ativa', 'pausada', 'reuniao', 'esgotada')),
  public_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, target_account_id),
  foreign key (workspace_id, target_account_id)
    references public.sales_responsibilities(workspace_id, target_account_id),
  foreign key (workspace_id, owner_user_id)
    references public.workspace_memberships(workspace_id, user_id)
);

create table private.sequence_documents (
  sequence_id uuid primary key references public.sequences(id),
  owner_user_id uuid not null references auth.users(id),
  document jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table private.sequence_documents enable row level security;

-- Tombstone permanente: cliente nao pode remover nem reassociar a propriedade.
alter table public.sales_responsibilities enable row level security;
alter table public.sequences enable row level security;
alter table public.workspace_memberships enable row level security;

create policy "active users read own workspace membership"
  on public.workspace_memberships for select to authenticated
  using (user_id = (select auth.uid()) and active);

create policy "active members read responsibility owner"
  on public.sales_responsibilities for select to authenticated
  using (exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = sales_responsibilities.workspace_id
      and m.user_id = (select auth.uid()) and m.active
  ));

create policy "active members read public sequence summary"
  on public.sequences for select to authenticated
  using (exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = sequences.workspace_id
      and m.user_id = (select auth.uid()) and m.active
  ));

-- Revoga acesso direto ao documento privado; apenas a RPC do titular o retorna.
revoke all on public.sequences from anon, authenticated;
grant select (id, workspace_id, target_account_id, owner_user_id, status,
              public_summary, created_at, updated_at) on public.sequences to authenticated;
revoke insert, update, delete on public.sequences from anon, authenticated;
revoke all on private.sequence_documents from public, anon, authenticated;
revoke insert, update, delete on public.sales_responsibilities from anon, authenticated;
revoke all on public.workspace_memberships from anon, authenticated;
grant select on public.workspace_memberships to authenticated;

create or replace function public.create_sequence(
  p_workspace_id uuid,
  p_target_account_id text,
  p_private_document jsonb,
  p_public_summary jsonb default '{}'::jsonb
) returns public.sequences
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_sequence public.sequences;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = p_workspace_id
      and m.user_id = v_user_id and m.active
  ) then
    raise exception 'active workspace membership required' using errcode = '42501';
  end if;

  -- A unicidade faz a disputa concorrente escolher um unico vencedor.
  insert into public.sales_responsibilities(workspace_id, target_account_id, owner_user_id)
  values (p_workspace_id, p_target_account_id, v_user_id)
  on conflict (workspace_id, target_account_id) do nothing;

  if not exists (
    select 1 from public.sales_responsibilities r
    where r.workspace_id = p_workspace_id
      and r.target_account_id = p_target_account_id
      and r.owner_user_id = v_user_id
  ) then
    raise exception 'target account already has another responsible seller'
      using errcode = '42501';
  end if;

  insert into public.sequences(
    workspace_id, target_account_id, owner_user_id, public_summary
  ) values (
    p_workspace_id, p_target_account_id, v_user_id,
    coalesce(p_public_summary, '{}'::jsonb)
  ) returning * into v_sequence;

  insert into private.sequence_documents(sequence_id, owner_user_id, document)
  values (v_sequence.id, v_user_id, coalesce(p_private_document, '{}'::jsonb));

  return v_sequence;
end;
$$;

create or replace function public.update_owned_sequence(
  p_sequence_id uuid,
  p_private_document jsonb,
  p_public_summary jsonb,
  p_status text
) returns public.sequences
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_sequence public.sequences;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  update public.sequences s
  set public_summary = coalesce(p_public_summary, s.public_summary),
      status = coalesce(p_status, s.status),
      updated_at = now()
  where s.id = p_sequence_id
    and s.owner_user_id = v_user_id
    and exists (
      select 1 from public.workspace_memberships m
      where m.workspace_id = s.workspace_id and m.user_id = v_user_id and m.active
    )
  returning s.* into v_sequence;
  if not found then
    raise exception 'sequence not found or not owned by active user' using errcode = '42501';
  end if;
  if p_private_document is not null then
    update private.sequence_documents d
    set document = p_private_document, updated_at = now()
    where d.sequence_id = v_sequence.id and d.owner_user_id = v_user_id;
  end if;
  return v_sequence;
end;
$$;

create or replace function public.get_owned_sequence(p_sequence_id uuid)
returns public.sequences
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sequence public.sequences;
  v_user_id uuid := auth.uid();
  v_document jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select s.* into v_sequence
  from public.sequences s
  join public.workspace_memberships m
    on m.workspace_id = s.workspace_id and m.user_id = v_user_id and m.active
  where s.id = p_sequence_id and s.owner_user_id = v_user_id;
  if not found then
    raise exception 'sequence not found or not owned by active user' using errcode = '42501';
  end if;
  select d.document into v_document
  from private.sequence_documents d
  where d.sequence_id = v_sequence.id and d.owner_user_id = v_user_id;
  v_sequence.public_summary := v_sequence.public_summary || jsonb_build_object('_document', coalesce(v_document, '{}'::jsonb));
  return v_sequence;
end;
$$;

revoke all on function public.create_sequence(uuid, text, jsonb, jsonb) from public, anon;
revoke all on function public.update_owned_sequence(uuid, jsonb, jsonb, text) from public, anon;
revoke all on function public.get_owned_sequence(uuid) from public, anon;
grant execute on function public.create_sequence(uuid, text, jsonb, jsonb) to authenticated;
grant execute on function public.update_owned_sequence(uuid, jsonb, jsonb, text) to authenticated;
grant execute on function public.get_owned_sequence(uuid) to authenticated;

-- Propriedade e Sequencia sao append-only do ponto de vista do cliente.
create or replace function private.prevent_responsibility_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'sales responsibility is permanent';
end;
$$;
create trigger sales_responsibilities_immutable
  before update or delete on public.sales_responsibilities
  for each row execute function private.prevent_responsibility_mutation();

create or replace function private.prevent_sequence_deletion()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'sequence records cannot be deleted';
end;
$$;
create trigger sequences_no_delete
  before delete on public.sequences
  for each row execute function private.prevent_sequence_deletion();

comment on table public.workspace_memberships is
  'Memberships are provisioned only by trusted backend/admin operations; clients cannot self-assign a workspace.';
comment on column public.sequences.public_summary is
  'Safe shared status projection; must not contain message body, subject, attachment, or free-text message summary.';
comment on table private.sequence_documents is
  'Private sequence document, including participants and message content; only owner RPCs may access it.';

-- RPCs are an untrusted input boundary: never let a member publish arbitrary
-- JSON in the shared projection, even when they bypass the frontend.
create or replace function private.sanitize_sequence_public_summary()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_summary jsonb := case when jsonb_typeof(new.public_summary) = 'object'
    then new.public_summary else '{}'::jsonb end;
begin
  new.public_summary := jsonb_strip_nulls(jsonb_build_object(
    'status', case when v_summary ->> 'status' in ('ativa', 'pausada', 'reuniao', 'esgotada')
      then v_summary ->> 'status' else new.status end,
    'totalParticipantes', case when v_summary ->> 'totalParticipantes' ~ '^[0-9]{1,7}$'
      then least((v_summary ->> 'totalParticipantes')::integer, 1000000) end,
    'totalSteps', case when v_summary ->> 'totalSteps' ~ '^[0-9]{1,7}$'
      then least((v_summary ->> 'totalSteps')::integer, 1000000) end,
    'passoAtual', case when v_summary ->> 'passoAtual' ~ '^[0-9]{1,7}$'
      then least((v_summary ->> 'passoAtual')::integer, 1000000) end
  ));
  return new;
end;
$$;
revoke all on function private.sanitize_sequence_public_summary() from public, anon, authenticated;
create trigger sequences_sanitize_public_summary
  before insert or update of public_summary on public.sequences
  for each row execute function private.sanitize_sequence_public_summary();

-- Enable workspace-scoped live status updates for the existing UI source.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sequences'
    ) then
    alter publication supabase_realtime add table public.sequences;
  end if;
end;
$$;

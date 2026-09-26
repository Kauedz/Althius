-- Migracao: Documento da Sequencia com destinatarios reais e canais suportados
-- Escopo restrito a: email, linkedin, whatsapp. Rejeita sms, ligacao, tarefa.

-- 1. Contatos das Contas-alvo com destinos reais
create table if not exists public.target_contacts (
  id text not null,
  workspace_id uuid not null,
  target_account_id text not null,
  name text not null,
  role text,
  email text,
  whatsapp text,
  linkedin_identity text,
  is_real boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, target_account_id, id),
  foreign key (workspace_id, target_account_id)
    references public.sales_responsibilities(workspace_id, target_account_id)
);

alter table public.target_contacts enable row level security;

create policy "active members read target contacts"
  on public.target_contacts for select to authenticated
  using (exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = target_contacts.workspace_id
      and m.user_id = (select auth.uid()) and m.active
  ));

revoke insert, update, delete on public.target_contacts from anon, authenticated;
grant select on public.target_contacts to authenticated;

-- 2. Funcoes utilitarias de normalizacao e validacao
create or replace function private.normalize_whatsapp(p_phone text)
returns text language plpgsql immutable as $$
declare
  v_cleaned text;
  v_digits text;
begin
  if p_phone is null or trim(p_phone) = '' then
    return null;
  end if;
  v_cleaned := trim(p_phone);
  if left(v_cleaned, 1) = '+' then
    v_digits := regexp_replace(substr(v_cleaned, 2), '[^0-9]', '', 'g');
    if length(v_digits) < 8 or length(v_digits) > 15 then
      raise exception 'invalid whatsapp number: must have 8 to 15 digits' using errcode = '22023';
    end if;
    return '+' || v_digits;
  else
    v_digits := regexp_replace(v_cleaned, '[^0-9]', '', 'g');
    if length(v_digits) in (10, 11) then
      return '+55' || v_digits;
    elsif length(v_digits) >= 8 and length(v_digits) <= 15 then
      return '+' || v_digits;
    else
      raise exception 'invalid whatsapp number: must have 8 to 15 digits' using errcode = '22023';
    end if;
  end if;
end;
$$;

create or replace function private.validate_email(p_email text)
returns text language plpgsql immutable as $$
declare
  v_trimmed text;
begin
  if p_email is null or trim(p_email) = '' then
    return null;
  end if;
  v_trimmed := lower(trim(p_email));
  if not v_trimmed ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
    raise exception 'invalid email address format' using errcode = '22023';
  end if;
  return v_trimmed;
end;
$$;

-- 3. RPC para o vendedor responsavel cadastrar/atualizar destinos reais do contato
create or replace function public.upsert_target_contact(
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
  v_normalized_whatsapp text;
  v_validated_email text;
  v_trimmed_linkedin text;
  v_contact public.target_contacts;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.sales_responsibilities r
    join public.workspace_memberships m
      on m.workspace_id = r.workspace_id and m.user_id = v_user_id and m.active
    where r.workspace_id = p_workspace_id
      and r.target_account_id = p_target_account_id
      and r.owner_user_id = v_user_id
  ) then
    raise exception 'only the responsible seller can register or update target contacts'
      using errcode = '42501';
  end if;

  v_validated_email := private.validate_email(p_email);
  v_normalized_whatsapp := private.normalize_whatsapp(p_whatsapp);
  v_trimmed_linkedin := nullif(trim(p_linkedin_identity), '');

  insert into public.target_contacts (
    id, workspace_id, target_account_id, name, role, email, whatsapp, linkedin_identity, is_real, updated_at
  ) values (
    p_contact_id, p_workspace_id, p_target_account_id, p_name, p_role,
    v_validated_email, v_normalized_whatsapp, v_trimmed_linkedin, true, now()
  )
  on conflict (workspace_id, target_account_id, id) do update set
    name = excluded.name,
    role = coalesce(excluded.role, public.target_contacts.role),
    email = excluded.email,
    whatsapp = excluded.whatsapp,
    linkedin_identity = excluded.linkedin_identity,
    is_real = true,
    updated_at = now()
  returning * into v_contact;

  return v_contact;
end;
$$;

revoke all on function public.upsert_target_contact(uuid, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.upsert_target_contact(uuid, text, text, text, text, text, text, text) to authenticated;

-- 4. Validacao do documento da Sequencia e canais suportados
create or replace function private.validate_sequence_document(
  p_workspace_id uuid,
  p_target_account_id text,
  p_document jsonb
) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_step jsonb;
  v_canal text;
  v_steps jsonb;
  v_delay int;
  v_is_demo boolean;
begin
  if p_document is null then
    return;
  end if;

  v_steps := p_document -> 'steps';
  if v_steps is not null and jsonb_typeof(v_steps) = 'array' then
    for v_step in select * from jsonb_array_elements(v_steps) loop
      v_canal := v_step ->> 'canal';
      if v_canal is null or v_canal not in ('email', 'linkedin', 'whatsapp') then
        raise exception 'canal fora do escopo: apenas email, linkedin e whatsapp sao permitidos'
          using errcode = '22023';
      end if;

      if v_step ? 'delayDiasUteis' then
        v_delay := (v_step ->> 'delayDiasUteis')::int;
        if v_delay < 0 then
          raise exception 'delay em dias uteis deve ser maior ou igual a zero' using errcode = '22023';
        end if;
      end if;
    end loop;
  end if;

  -- Bloqueia dados de demonstracao autorizando execucao real
  v_is_demo := coalesce((p_document ->> 'is_demo')::boolean, false);
  if v_is_demo and (p_document ? 'autorizar_execucao_real' and (p_document ->> 'autorizar_execucao_real')::boolean) then
    raise exception 'dados ficticios e metricas de demonstracao nao podem autorizar execucao real'
      using errcode = '22023';
  end if;
end;
$$;

-- 5. Atualiza create_sequence e update_owned_sequence com validacao estrita
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

  -- Valida canais e integridade do documento privado
  perform private.validate_sequence_document(p_workspace_id, p_target_account_id, p_private_document);

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

  select s.* into v_sequence
  from public.sequences s
  where s.id = p_sequence_id
    and s.owner_user_id = v_user_id
    and exists (
      select 1 from public.workspace_memberships m
      where m.workspace_id = s.workspace_id and m.user_id = v_user_id and m.active
    );

  if not found then
    raise exception 'sequence not found or not owned by active user' using errcode = '42501';
  end if;

  if p_private_document is not null then
    perform private.validate_sequence_document(v_sequence.workspace_id, v_sequence.target_account_id, p_private_document);
  end if;

  update public.sequences s
  set public_summary = coalesce(p_public_summary, s.public_summary),
      status = coalesce(p_status, s.status),
      updated_at = now()
  where s.id = p_sequence_id
  returning s.* into v_sequence;

  if p_private_document is not null then
    update private.sequence_documents d
    set document = p_private_document, updated_at = now()
    where d.sequence_id = v_sequence.id and d.owner_user_id = v_user_id;
  end if;

  return v_sequence;
end;
$$;

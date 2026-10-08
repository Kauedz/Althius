-- B2: o Contato aceito guarda o nome da Persona da proposta. A definição continua na Memória do Workspace.
-- Outro não grava. Um Contato tem no máximo uma. O corpo de accept_proposed_contact é o de
-- 20261001190000, com a cópia a mais. Nenhuma branch ralph/frente-* redefiniu essa função depois disso.

alter table public.contacts
  add column persona text
  constraint contacts_persona_check
  check (persona is null or persona in ('Decisor', 'Influenciador', 'Campeao'));

comment on column public.contacts.persona is
  'Nome da Persona (Decisor, Influenciador ou Campeao). A definição fica na Memória do Workspace. Outro fica vazio.';

-- A leitura da Conta é a visão. A coluna nova entra no fim, para não deslocar as que já existem.
create or replace view public.target_contacts with (security_invoker = true) as
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
  c.updated_at,
  c.persona
from public.contact_account_links l
join public.contacts c on c.workspace_id = l.workspace_id and c.id = l.contact_id
where l.ended_at is null;

revoke all on public.target_contacts from anon, authenticated;
grant select on public.target_contacts to authenticated;

create or replace function public.accept_proposed_contact(
  p_id uuid,
  p_email text default null,
  p_phone text default null
) returns public.contacts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_p private.proposed_contacts%rowtype;
  v_contact public.contacts;
  v_existing_id uuid;
  v_persona text;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_p from private.proposed_contacts p where p.id = p_id for update;
  if not found then
    raise exception 'proposed contact not found' using errcode = 'P0002';
  end if;

  if v_p.state = 'aceita' and v_p.contact_id is not null then
    select * into v_contact from public.contacts c where c.id = v_p.contact_id;
    return v_contact;
  end if;

  if not private.can_manage_account_contacts(v_p.workspace_id, v_p.target_account_id, v_user) then
    raise exception 'only the responsible seller or an admin can manage contacts of this target account'
      using errcode = '42501';
  end if;

  -- Verifica se já existe um contato no Workspace com este LinkedIn ou e-mail
  if v_p.linkedin_url is not null then
    select c.id into v_existing_id from public.contacts c
    where c.workspace_id = v_p.workspace_id and c.linkedin = private.normalize_linkedin(v_p.linkedin_url)
      and c.archived_at is null;
  end if;

  if v_existing_id is not null then
    -- Vincula à conta sem duplicar o contato
    perform public.link_contact(v_existing_id, v_p.target_account_id);
    select * into v_contact from public.contacts where id = v_existing_id;
  else
    -- Cria o Contato na Conta-alvo através da função existente
    v_contact := public.create_contact(
      v_p.target_account_id,
      v_p.name,
      v_p.role,
      p_email,
      p_phone,
      v_p.linkedin_url
    );
  end if;

  v_persona := case
    when v_p.persona in ('Decisor', 'Influenciador', 'Campeao') then v_p.persona
    else null
  end;
  if v_persona is not null and v_contact.persona is null then
    update public.contacts
      set persona = v_persona,
          updated_at = now()
      where id = v_contact.id
        and persona is null;
    select * into v_contact from public.contacts c where c.id = v_contact.id;
  end if;

  update private.proposed_contacts set
    state = 'aceita',
    contact_id = v_contact.id,
    decided_by = v_user,
    decided_at = now(),
    updated_at = now()
  where id = v_p.id;

  return v_contact;
end;
$$;

revoke all on function public.accept_proposed_contact(uuid, text, text) from public, anon;
grant execute on function public.accept_proposed_contact(uuid, text, text) to authenticated;

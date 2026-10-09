-- S1 (auditoria de arquitetura): o aceite repetido devolvia o Contato antes de checar quem chama. A função é
-- security definer e liberada para authenticated, então um usuário de outro Workspace, ou um participante com a
-- Participação desativada, lia o Contato de uma proposta já aceita pelo id dela. A checagem de quem pode gerir os
-- Contatos da Conta-alvo vem agora antes de qualquer retorno. O corpo é o de 20261009040000 (enriquecimento 01),
-- com a checagem movida; nada mais muda.

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

  if not private.can_manage_account_contacts(v_p.workspace_id, v_p.target_account_id, v_user) then
    raise exception 'only the responsible seller or an admin can manage contacts of this target account'
      using errcode = '42501';
  end if;

  if v_p.state = 'aceita' and v_p.contact_id is not null then
    select * into v_contact from public.contacts c where c.id = v_p.contact_id;
    return v_contact;
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
    -- O que veio do actor é automático; o e-mail e o telefone digitados no aceite seguem manual.
    update private.contact_field_sources set origin = 'automatico', observed_at = now()
    where contact_id = v_contact.id and field in ('name', 'role', 'linkedin');
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

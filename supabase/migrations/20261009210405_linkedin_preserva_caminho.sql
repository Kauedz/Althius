-- S1/B3: conservar a caixa do perfil e comparar identidades sem caixa.
create or replace function private.normalize_linkedin(p_value text)
returns text language plpgsql immutable set search_path = '' as $$
declare
  v text := btrim(coalesce(p_value, ''));
  v_url text;
begin
  if v = '' then return null; end if;
  v_url := regexp_replace(v, '^[a-z][a-z0-9+.-]*://', '', 'i');
  v_url := regexp_replace(v_url, '[?#].*$', '');
  v_url := regexp_replace(v_url, '^([a-z]{2,3}\.)?(www\.)?linkedin\.com/', 'www.linkedin.com/', 'i');
  v_url := regexp_replace(v_url, '/+$', '');
  if v_url ~ '^www\.linkedin\.com/in/[^/]+$' then return 'https://' || v_url; end if;
  return v;
end;
$$;
revoke all on function private.normalize_linkedin(text) from public, anon, authenticated;

-- A chave usada ao apagar Sinais continua sem caixa.
create or replace function private.linkedin_person_key(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select (regexp_match(
    lower(private.normalize_linkedin(p_value)),
    '^https://www\.linkedin\.com/in/([^/]+)$'
  ))[1];
$$;

revoke all on function private.linkedin_person_key(text) from public, anon, authenticated, service_role;


drop index public.contacts_linkedin_per_workspace;
create unique index contacts_linkedin_per_workspace on public.contacts (workspace_id, lower(linkedin)) where linkedin is not null;
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
    where c.workspace_id = v_p.workspace_id and lower(c.linkedin) = lower(private.normalize_linkedin(v_p.linkedin_url))
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

create or replace function private.validate_import_rows(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b private.import_batches;
  r record;
  v_errors text[];
  v_name text;
  v_url_raw text;
  v_url text;
  v_legal text;
  v_company_linkedin text;
  v_segment text;
  v_cname text;
  v_role text;
  v_email_raw text;
  v_email text;
  v_phone_raw text;
  v_phone text;
  v_linkedin_raw text;
  v_linkedin text;
  v_has_contact boolean;
  v_account public.target_accounts;
  v_owner uuid;
  v_plan jsonb;
  v_account_action text;
  v_account_changes text[];
  v_account_conflicts jsonb;
  v_account_id uuid;
  v_permitted boolean;
  v_matches uuid[];
  v_contact public.contacts;
  v_match text;
  v_linked boolean;
  v_dup_url text;
  v_dup_line integer;
  v_contact_plan jsonb;
  v_can_update boolean;
  v_can_transfer boolean;
  v_other_links jsonb;
  v_needs boolean;
  v_preview jsonb;
begin
  select * into b from private.import_batches where id = p_batch_id;

  update private.import_rows
  set status = case when b.has_header and line_number = b.header_line then 'header' else 'pending' end,
      parsed = '{}'::jsonb, preview = '{}'::jsonb, error_codes = '{}', error_detail = null
  where batch_id = p_batch_id;

  -- 1. Cada registro: valores normalizados e erros de formato.
  for r in
    select line_number, cells from private.import_rows
    where batch_id = p_batch_id and status = 'pending' order by line_number
  loop
    v_errors := '{}';
    v_name := private.import_cell(r.cells, b.mapping, 'company_name');
    v_url_raw := private.import_cell(r.cells, b.mapping, 'company_url');
    v_legal := private.import_cell(r.cells, b.mapping, 'company_legal_identifier');
    v_company_linkedin := private.import_cell(r.cells, b.mapping, 'company_linkedin');
    v_segment := private.import_cell(r.cells, b.mapping, 'company_segment');
    v_cname := private.import_cell(r.cells, b.mapping, 'contact_name');
    v_role := private.import_cell(r.cells, b.mapping, 'contact_role');
    v_email_raw := private.import_cell(r.cells, b.mapping, 'contact_email');
    v_phone_raw := private.import_cell(r.cells, b.mapping, 'contact_phone');
    v_linkedin_raw := private.import_cell(r.cells, b.mapping, 'contact_linkedin');
    v_url := private.try_canonical_company_url(v_url_raw);
    v_email := private.try_validate_email(v_email_raw);
    v_phone := private.try_normalize_whatsapp(v_phone_raw);
    v_linkedin := private.normalize_linkedin(v_linkedin_raw);
    v_has_contact := coalesce(v_cname, v_role, v_email_raw, v_phone_raw, v_linkedin_raw) is not null;

    if v_name is null then v_errors := v_errors || 'company_name_required'::text; end if;
    if v_url_raw is null then
      v_errors := v_errors || 'company_url_required'::text;
    elsif v_url is null then
      v_errors := v_errors || 'company_url_invalid'::text;
    end if;
    if v_has_contact then
      if v_cname is null then v_errors := v_errors || 'contact_name_required'::text; end if;
      if v_email_raw is not null and v_email is null then v_errors := v_errors || 'contact_email_invalid'::text; end if;
      if v_phone_raw is not null and v_phone is null then v_errors := v_errors || 'contact_phone_invalid'::text; end if;
    end if;
    if greatest(length(v_name), length(v_url_raw), length(v_legal), length(v_company_linkedin), length(v_segment),
                length(v_cname), length(v_role), length(v_email_raw), length(v_phone_raw), length(v_linkedin_raw)) > 500 then
      v_errors := v_errors || 'value_too_long'::text;
    end if;

    update private.import_rows set
      parsed = jsonb_strip_nulls(jsonb_build_object(
        'company_name', v_name, 'company_url', v_url, 'company_legal_identifier', v_legal,
        'company_linkedin', v_company_linkedin, 'company_segment', v_segment,
        'contact_name', v_cname, 'contact_role', v_role, 'contact_email', v_email,
        'contact_phone', v_phone, 'contact_linkedin', v_linkedin)),
      error_codes = v_errors,
      status = case when cardinality(v_errors) > 0 then 'invalid' else 'pending' end
    where batch_id = p_batch_id and line_number = r.line_number;
  end loop;

  -- 2. Repetições dentro do próprio arquivo: a mesma URL, ou o mesmo e-mail, telefone ou LinkedIn, numa linha anterior
  -- válida. A anterior é quem cria; esta atualiza (Conta) ou reencontra o Contato (que pode pedir decisão).
  with p as (
    select line_number,
      parsed ->> 'company_url' as u, parsed ->> 'contact_email' as e,
      parsed ->> 'contact_phone' as t, lower(parsed ->> 'contact_linkedin') as l
    from private.import_rows where batch_id = p_batch_id and status = 'pending'
  ), w as (
    select line_number, u,
      case when u is not null then min(line_number) over (partition by u) end as first_u,
      case when e is not null then min(line_number) over (partition by e) end as fe,
      case when e is not null then first_value(u) over (partition by e order by line_number) end as ue,
      case when t is not null then min(line_number) over (partition by t) end as ft,
      case when t is not null then first_value(u) over (partition by t order by line_number) end as ut,
      case when l is not null then min(line_number) over (partition by l) end as fl,
      case when l is not null then first_value(u) over (partition by l order by line_number) end as ul
    from p
  )
  update private.import_rows ir set preview = jsonb_strip_nulls(jsonb_build_object(
    'dup_url_line', case when w.first_u < w.line_number then w.first_u end,
    'dup_contact_line', d.line, 'dup_contact_url', d.url))
  from w
  left join lateral (
    select v.line, v.url from (values (w.fe, w.ue), (w.ft, w.ut), (w.fl, w.ul)) v(line, url)
    where v.line < w.line_number order by v.line limit 1
  ) d on true
  where ir.batch_id = p_batch_id and ir.line_number = w.line_number;

  -- 3. A prévia de cada linha válida contra o banco.
  for r in
    select line_number, parsed, preview, decision from private.import_rows
    where batch_id = p_batch_id and status = 'pending' order by line_number
  loop
    v_preview := r.preview;
    v_account_id := null;
    v_account_changes := '{}';
    v_account_conflicts := '[]'::jsonb;
    v_permitted := true;
    v_errors := '{}';
    v_has_contact := r.parsed ? 'contact_name';

    select * into v_account from public.target_accounts a
    where a.workspace_id = b.workspace_id and a.canonical_url = r.parsed ->> 'company_url';
    if found then
      v_account_id := v_account.id;
      select s.owner_user_id into v_owner from public.sales_responsibilities s
      where s.workspace_id = b.workspace_id and s.target_account_id = v_account.id::text;
      if v_owner is not distinct from b.created_by then
        v_account_action := 'update';
        v_plan := private.plan_field_updates('account', v_account.id, to_jsonb(v_account), r.parsed, b.replace_manual);
        v_account_changes := array(select jsonb_object_keys(v_plan -> 'apply'));
        v_account_conflicts := v_plan -> 'conflicts';
      else
        v_account_action := 'skip';
      end if;
      v_permitted := private.can_manage_account_contacts(b.workspace_id, v_account.id, b.created_by);
    else
      -- Nova, ou criada por uma linha anterior do arquivo.
      v_account_action := case when v_preview ? 'dup_url_line' then 'update' else 'create' end;
    end if;

    v_match := 'none';
    v_linked := false;
    v_can_update := true;
    v_can_transfer := v_permitted;
    v_other_links := '[]'::jsonb;
    v_contact_plan := jsonb_build_object('apply', '{}'::jsonb, 'conflicts', '[]'::jsonb);
    v_contact := null;

    if v_has_contact then
      select array_agg(distinct c.id) into v_matches from public.contacts c
      where c.workspace_id = b.workspace_id
        and (c.email = r.parsed ->> 'contact_email' or c.phone = r.parsed ->> 'contact_phone'
             or lower(c.linkedin) = lower(r.parsed ->> 'contact_linkedin'));
      if cardinality(v_matches) > 1 then
        v_errors := v_errors || 'contact_identity_conflict'::text;
      elsif cardinality(v_matches) = 1 then
        select * into v_contact from public.contacts c where c.id = v_matches[1];
        v_match := 'existing';
        v_linked := v_account_id is not null and exists (
          select 1 from public.contact_account_links l
          where l.contact_id = v_contact.id and l.target_account_id = v_account_id and l.ended_at is null);
        v_can_update := private.can_update_contact(b.workspace_id, v_contact.id, b.created_by);
        v_contact_plan := private.plan_field_updates(
          'contact', v_contact.id, to_jsonb(v_contact), r.parsed, b.replace_manual);
        select coalesce(jsonb_agg(jsonb_build_object('account_id', l.target_account_id, 'name', a.name)), '[]'::jsonb),
               coalesce(bool_and(private.can_manage_account_contacts(l.workspace_id, l.target_account_id, b.created_by)), true)
        into v_other_links, v_can_transfer
        from public.contact_account_links l
        join public.target_accounts a on a.workspace_id = l.workspace_id and a.id = l.target_account_id
        where l.contact_id = v_contact.id and l.ended_at is null
          and l.target_account_id is distinct from v_account_id;
        v_can_transfer := v_can_transfer and v_permitted;
      elsif v_preview ? 'dup_contact_line' then
        v_match := 'in_file';
        v_linked := (v_preview ->> 'dup_contact_url') = (r.parsed ->> 'company_url');
      end if;
    end if;

    v_needs := v_match <> 'none' and not v_linked and v_permitted;

    v_preview := v_preview || jsonb_strip_nulls(jsonb_build_object(
      'account_action', v_account_action,
      'account_id', v_account_id,
      'account_name', case when v_account_id is not null then v_account.name end,
      'account_changes', to_jsonb(v_account_changes),
      'account_conflicts', v_account_conflicts,
      'has_contact', v_has_contact,
      'contact_match', case when v_has_contact then v_match end,
      'contact_id', v_contact.id,
      'contact_name', v_contact.name,
      'contact_linked', case when v_has_contact then v_linked end,
      'contact_links', v_other_links,
      'contact_changes', array(select jsonb_object_keys(v_contact_plan -> 'apply')),
      'contact_conflicts', v_contact_plan -> 'conflicts',
      'contact_permitted', case when v_has_contact then v_permitted end,
      'contact_can_update', case when v_has_contact then v_can_update end,
      'can_transfer', case when v_has_contact then v_can_transfer end,
      'needs_decision', v_needs));

    update private.import_rows set
      preview = v_preview,
      error_codes = v_errors,
      status = case when cardinality(v_errors) > 0 then 'invalid' else 'pending' end,
      -- Uma decisão só vale enquanto a linha ainda precisa dela.
      decision = case when v_needs then decision end
    where batch_id = p_batch_id and line_number = r.line_number;
  end loop;

  update private.import_batches set
    row_count = (select count(*) from private.import_rows x where x.batch_id = p_batch_id and x.status <> 'header'),
    updated_at = now()
  where id = p_batch_id;
end;
$$;

create or replace function private.process_import_row(p_batch_id uuid, p_line_number integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b private.import_batches;
  r private.import_rows;
  v_actor uuid;
  v_account public.target_accounts;
  v_contact public.contacts;
  v_created boolean;
  v_owner uuid;
  v_plan jsonb;
  v_apply jsonb;
  v_account_result text := 'none';
  v_contact_result text := 'none';
  v_changed text[] := '{}';
  v_preserved text[] := '{}';
  v_reasons text[] := '{}';
  v_matches uuid[];
  v_linked boolean;
  v_effective text;
  v_status text;
  v_field text;
  v_code text;
begin
  select * into b from private.import_batches where id = p_batch_id;
  select * into r from private.import_rows
  where batch_id = p_batch_id and line_number = p_line_number and status = 'pending'
  for update;
  if not found then
    return;
  end if;
  v_actor := b.created_by;

  begin
    perform set_config('althius.importacao_lote', b.id::text, true);

    -- A Conta: nova, nascida com quem importa como responsável, ou a da mesma URL canônica.
    select * into v_account from public.target_accounts a
    where a.workspace_id = b.workspace_id and a.canonical_url = r.parsed ->> 'company_url'
    for update;
    if not found then
      select c.created into v_created
      from private.create_imported_target_account(
        b.workspace_id, v_actor, b.id, r.parsed ->> 'company_name', r.parsed ->> 'company_url',
        r.parsed ->> 'company_legal_identifier', r.parsed ->> 'company_linkedin', r.parsed ->> 'company_segment') c;
      select * into v_account from public.target_accounts a
      where a.workspace_id = b.workspace_id and a.canonical_url = r.parsed ->> 'company_url'
      for update;
      if v_created then
        insert into private.account_field_sources (workspace_id, target_account_id, field, origin, source_id)
        select v_account.workspace_id, v_account.id, f, 'importacao', b.id
        from unnest(array['name', 'legal_identifier', 'linkedin_url', 'segment']) f
        where nullif(btrim(to_jsonb(v_account) ->> f), '') is not null;
        v_account_result := 'created';
      end if;
    end if;

    if v_account_result <> 'created' then
      select s.owner_user_id into v_owner from public.sales_responsibilities s
      where s.workspace_id = b.workspace_id and s.target_account_id = v_account.id::text;
      if v_owner is distinct from v_actor then
        v_account_result := 'skipped';
        v_reasons := v_reasons || 'account_not_responsible'::text;
      else
        v_plan := private.plan_field_updates('account', v_account.id, to_jsonb(v_account), r.parsed, b.replace_manual);
        v_apply := v_plan -> 'apply';
        if v_apply = '{}'::jsonb then
          v_account_result := 'unchanged';
        else
          update public.target_accounts set
            name = coalesce(v_apply ->> 'name', name),
            legal_identifier = coalesce(v_apply ->> 'legal_identifier', legal_identifier),
            linkedin_url = coalesce(v_apply ->> 'linkedin_url', linkedin_url),
            segment = coalesce(v_apply ->> 'segment', segment),
            updated_at = now()
          where id = v_account.id;
          insert into private.account_field_sources (workspace_id, target_account_id, field, origin, source_id)
          select v_account.workspace_id, v_account.id, k, 'importacao', b.id from jsonb_object_keys(v_apply) k
          on conflict (target_account_id, field)
          do update set origin = 'importacao', source_id = excluded.source_id, observed_at = now();
          v_account_result := 'updated';
          v_changed := v_changed || array(select 'account.' || k from jsonb_object_keys(v_apply) k);
        end if;
        v_preserved := v_preserved || array(select 'account.' || jsonb_array_elements_text(v_plan -> 'conflicts'));
      end if;
    end if;

    -- O Contato, quando a linha traz dado de Contato. A identidade é e-mail, telefone ou LinkedIn; nunca o nome.
    if r.parsed ? 'contact_name' then
      select array_agg(distinct c.id) into v_matches from public.contacts c
      where c.workspace_id = b.workspace_id
        and (c.email = r.parsed ->> 'contact_email' or c.phone = r.parsed ->> 'contact_phone'
             or lower(c.linkedin) = lower(r.parsed ->> 'contact_linkedin'));
      if cardinality(v_matches) > 1 then
        raise exception 'contact identity matches more than one contact' using errcode = '22023';
      end if;

      if cardinality(v_matches) is null then
        if not private.can_manage_account_contacts(b.workspace_id, v_account.id, v_actor) then
          v_contact_result := 'skipped';
          v_reasons := v_reasons || 'contact_not_permitted'::text;
        else
          insert into public.contacts (workspace_id, name, role, email, phone, linkedin, created_by)
          values (b.workspace_id, r.parsed ->> 'contact_name', r.parsed ->> 'contact_role',
                  r.parsed ->> 'contact_email', r.parsed ->> 'contact_phone', r.parsed ->> 'contact_linkedin', v_actor)
          returning * into v_contact;
          insert into private.contact_field_sources (workspace_id, contact_id, field, origin, source_id)
          select v_contact.workspace_id, v_contact.id, f, 'importacao', b.id
          from unnest(array['name', 'role', 'email', 'phone', 'linkedin']) f
          where nullif(btrim(to_jsonb(v_contact) ->> f), '') is not null;
          perform private.open_contact_link(b.workspace_id, v_contact.id, v_account.id, v_actor);
          v_contact_result := 'created';
        end if;
      else
        select * into v_contact from public.contacts c where c.id = v_matches[1] for update;
        v_linked := exists (
          select 1 from public.contact_account_links l
          where l.contact_id = v_contact.id and l.target_account_id = v_account.id and l.ended_at is null);
        v_effective := case when v_linked then 'update' else r.decision end;

        if v_effective is null then
          v_contact_result := 'skipped';
          v_reasons := v_reasons || 'decision_required'::text;
        elsif v_effective = 'skip' then
          v_contact_result := 'skipped';
          v_reasons := v_reasons || 'contact_skipped_by_user'::text;
        elsif v_effective = 'update' then
          if not private.can_update_contact(b.workspace_id, v_contact.id, v_actor) then
            v_contact_result := 'skipped';
            v_reasons := v_reasons || 'contact_not_permitted'::text;
          else
            v_plan := private.plan_field_updates('contact', v_contact.id, to_jsonb(v_contact), r.parsed, b.replace_manual);
            v_apply := v_plan -> 'apply';
            if v_apply = '{}'::jsonb then
              v_contact_result := 'unchanged';
            else
              update public.contacts set
                name = coalesce(v_apply ->> 'name', name),
                role = coalesce(v_apply ->> 'role', role),
                email = coalesce(v_apply ->> 'email', email),
                phone = coalesce(v_apply ->> 'phone', phone),
                linkedin = coalesce(v_apply ->> 'linkedin', linkedin),
                updated_at = now()
              where id = v_contact.id;
              insert into private.contact_field_sources (workspace_id, contact_id, field, origin, source_id)
              select v_contact.workspace_id, v_contact.id, k, 'importacao', b.id from jsonb_object_keys(v_apply) k
              on conflict (contact_id, field)
              do update set origin = 'importacao', source_id = excluded.source_id, observed_at = now();
              v_contact_result := 'updated';
              v_changed := v_changed || array(select 'contact.' || k from jsonb_object_keys(v_apply) k);
            end if;
            v_preserved := v_preserved || array(select 'contact.' || jsonb_array_elements_text(v_plan -> 'conflicts'));
          end if;
        elsif v_effective = 'link' then
          if not private.can_manage_account_contacts(b.workspace_id, v_account.id, v_actor) then
            v_contact_result := 'skipped';
            v_reasons := v_reasons || 'contact_not_permitted'::text;
          else
            perform private.open_contact_link(b.workspace_id, v_contact.id, v_account.id, v_actor);
            v_contact_result := 'linked';
          end if;
        else
          -- transfer: os Vínculos ativos com outras Contas terminam, e o Vínculo com esta Conta abre.
          if not private.can_manage_account_contacts(b.workspace_id, v_account.id, v_actor)
             or exists (
               select 1 from public.contact_account_links l
               where l.contact_id = v_contact.id and l.ended_at is null and l.target_account_id <> v_account.id
                 and not private.can_manage_account_contacts(l.workspace_id, l.target_account_id, v_actor)) then
            v_contact_result := 'skipped';
            v_reasons := v_reasons || 'contact_not_permitted'::text;
          else
            update public.contact_account_links set ended_at = greatest(now(), started_at)
            where contact_id = v_contact.id and ended_at is null and target_account_id <> v_account.id;
            perform private.open_contact_link(b.workspace_id, v_contact.id, v_account.id, v_actor);
            v_contact_result := 'transferred';
          end if;
        end if;
      end if;
    end if;

    perform set_config('althius.importacao_lote', '', true);

    v_status := case
      when 'created' in (v_account_result, v_contact_result) then 'created'
      when v_contact_result in ('linked', 'transferred') then 'linked'
      when 'updated' in (v_account_result, v_contact_result) then 'updated'
      else 'skipped' end;
    if v_status = 'skipped' and cardinality(v_reasons) = 0 then
      v_reasons := array['no_changes'];
    end if;

    update private.import_rows set
      status = v_status, error_codes = v_reasons, processed_at = now(),
      outcome = jsonb_build_object(
        'account', v_account_result, 'contact', v_contact_result,
        'changed', to_jsonb(v_changed), 'preserved', to_jsonb(v_preserved)),
      target_account_id = v_account.id, contact_id = v_contact.id
    where batch_id = p_batch_id and line_number = p_line_number;
  exception when others then
    -- A subtransação desfez o que a linha tinha escrito; a configuração volta com ela, mas não custa garantir.
    perform set_config('althius.importacao_lote', '', true);
    -- Deadlock e falha de serialização passam: a linha segue pendente e o lote pode ser retomado, em vez de a linha
    -- virar uma falha definitiva por um erro que some na segunda tentativa.
    if sqlstate in ('40P01', '40001') then
      raise;
    end if;
    v_code := case
      when sqlerrm like '%more than one contact%' then 'contact_identity_conflict'
      when sqlstate = '23505' then 'duplicate_identity'
      when sqlstate = '42501' then 'not_permitted'
      else 'unexpected_error' end;
    update private.import_rows set
      status = 'failed', error_codes = array[v_code], error_detail = left(sqlerrm, 300), processed_at = now(),
      outcome = '{}'::jsonb
    where batch_id = p_batch_id and line_number = p_line_number;
  end;
end;
$$;


-- Apenas propostas aceitas com identidade equivalente podem recuperar o caminho original.
create or replace function private.restore_accepted_contact_linkedin()
returns void language sql set search_path = '' as $$
with recuperaveis as (
  select distinct on (c.id) c.id,
    private.normalize_linkedin(coalesce(nullif(p.linkedin_url, ''), p.source_data->>'linkedinUrl')) as linkedin
  from public.contacts c join private.proposed_contacts p on p.contact_id = c.id and p.workspace_id = c.workspace_id
  where p.state = 'aceita' and c.linkedin = lower(c.linkedin)
    and lower(c.linkedin) = lower(private.normalize_linkedin(coalesce(nullif(p.linkedin_url, ''), p.source_data->>'linkedinUrl')))
  order by c.id, (private.normalize_linkedin(coalesce(nullif(p.linkedin_url, ''), p.source_data->>'linkedinUrl')) <> lower(c.linkedin)) desc, p.decided_at desc nulls last, p.id
)
update public.contacts c set linkedin = r.linkedin from recuperaveis r where c.id = r.id and c.linkedin is distinct from r.linkedin;
$$;
revoke all on function private.restore_accepted_contact_linkedin() from public, anon, authenticated, service_role;
select private.restore_accepted_contact_linkedin();

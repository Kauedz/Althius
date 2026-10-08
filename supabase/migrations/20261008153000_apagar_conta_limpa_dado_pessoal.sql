-- B4: apagar a Conta ou o Contato leva o dado pessoal que sobrava.
-- Receita no marcador, propostas (nome, foto, LinkedIn, source_data) e Sinais que carregam o LinkedIn
-- de uma pessoa. Parte das definições mais recentes, sem editar migration já aplicada:
--   public.erase_contact e public.erase_target_account em 20260929160000
--   private.erase_contact_extensions em 20260929170000
--   private.erase_account_extensions em 20260930180000

-- O perfil /in/<id> na mesma forma em que o Contato grava o LinkedIn. URL de empresa e texto solto não casam.
create function private.linkedin_person_key(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select (regexp_match(
    private.normalize_linkedin(p_value),
    '^https://www\.linkedin\.com/in/([^/]+)$'
  ))[1];
$$;

revoke all on function private.linkedin_person_key(text) from public, anon, authenticated, service_role;

-- A evidência casa a URL inteira do perfil. Na chave, o perfil só vale no lugar em que o adaptador
-- o grava: mov|<perfil>|..., lideranca|<empresa>|<perfil>|... e entrada|<empresa>|<perfil>|...
-- Cargo, empresa ou id de anúncio com o mesmo texto não são a pessoa. "lia-nunes" não casa
-- "lia-nunes-extra", e o nome sozinho não casa.
create function private.signal_carries_person(p_event_key text, p_evidence text, p_perfil text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_evidence_lower text := lower(coalesce(p_evidence, ''));
  v_url_needle text;
  v_scan_from integer := 1;
  v_hit_at integer;
  v_char_after text;
  v_parts text[];
begin
  if p_perfil is null or p_perfil = '' then
    return false;
  end if;
  v_parts := string_to_array(lower(coalesce(p_event_key, '')), '|');
  if coalesce(v_parts[1], '') = 'mov' and coalesce(v_parts[2], '') = p_perfil then
    return true;
  end if;
  if coalesce(v_parts[1], '') in ('lideranca', 'entrada')
     and coalesce(v_parts[3], '') = p_perfil then
    return true;
  end if;
  v_url_needle := 'linkedin.com/in/' || p_perfil;
  loop
    v_hit_at := position(v_url_needle in substr(v_evidence_lower, v_scan_from));
    exit when v_hit_at = 0;
    v_scan_from := v_scan_from + v_hit_at - 1;
    v_char_after := substr(v_evidence_lower, v_scan_from + length(v_url_needle), 1);
    if v_char_after !~ '^[a-z0-9_-]$' then
      return true;
    end if;
    v_scan_from := v_scan_from + length(v_url_needle);
  end loop;
  return false;
end;
$$;

revoke all on function private.signal_carries_person(text, text, text) from public, anon, authenticated, service_role;

-- Apagar o Contato leva as propostas ligadas a ele e os Sinais com o LinkedIn dele. O resto do corpo é o de
-- 20260929170000: adicionais, importação, respostas, cópia antiga e Memória dos Agentes.
create or replace function private.erase_contact_extensions(p_workspace_id uuid, p_contact_id uuid, p_contact public.contacts)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_emails text[];
  v_phones text[];
  v_value text;
  v_result jsonb;
  v_extra jsonb;
  v_rows integer;
  v_files integer;
  v_received integer := 0;
  v_legacy integer;
  v_perfil text;
  v_proposed integer := 0;
  v_signals integer := 0;
begin
  select coalesce(array_agg(e.email order by e.ordinal), '{}') into v_emails
  from private.contact_emails e where e.contact_id = p_contact_id;
  select coalesce(array_agg(p.phone order by p.ordinal), '{}') into v_phones
  from private.contact_phones p where p.contact_id = p_contact_id;

  v_result := private.erase_import_data(
    p_workspace_id, null, null, p_contact_id, p_contact.email, p_contact.phone, p_contact.linkedin);
  v_rows := (v_result ->> 'import_rows_erased')::integer;
  v_files := (v_result ->> 'import_files_queued')::integer;

  foreach v_value in array v_emails loop
    v_extra := private.erase_import_data(p_workspace_id, null, null, p_contact_id, v_value, null, null);
    v_rows := v_rows + (v_extra ->> 'import_rows_erased')::integer;
    v_files := v_files + (v_extra ->> 'import_files_queued')::integer;
    v_received := v_received + private.erase_received_emails(p_workspace_id, '{}', null, v_value);
  end loop;
  foreach v_value in array v_phones loop
    v_extra := private.erase_import_data(p_workspace_id, null, null, p_contact_id, null, v_value, null);
    v_rows := v_rows + (v_extra ->> 'import_rows_erased')::integer;
    v_files := v_files + (v_extra ->> 'import_files_queued')::integer;
  end loop;

  delete from private.target_contacts_canais02 t
  where t.workspace_id = p_workspace_id
    and (lower(t.email) = any (v_emails) or t.whatsapp = any (v_phones));
  get diagnostics v_legacy = row_count;

  -- A Conta não some, então a proposta não cai por cascata. O contact_id também só seria anulado.
  v_perfil := private.linkedin_person_key(p_contact.linkedin);
  delete from private.proposed_contacts p
  where p.workspace_id = p_workspace_id
    and (
      p.contact_id = p_contact_id
      or (
        v_perfil is not null
        and exists (
          select 1 from public.contact_account_links l
          where l.contact_id = p_contact_id and l.target_account_id = p.target_account_id)
        and private.linkedin_person_key(p.linkedin_url) = v_perfil
      )
    );
  get diagnostics v_proposed = row_count;

  if v_perfil is not null then
    delete from private.signals g
    where g.workspace_id = p_workspace_id
      and private.signal_carries_person(g.event_key, g.evidence, v_perfil);
    get diagnostics v_signals = row_count;
  end if;

  return v_result
    || jsonb_build_object('import_rows_erased', v_rows, 'import_files_queued', v_files,
      'extra_received_emails_erased', v_received, 'extra_legacy_rows_erased', v_legacy,
      'agent_facts_erased', private.erase_agent_memory(
        p_workspace_id, array[p_contact.name, p_contact.email, p_contact.phone, p_contact.linkedin] || v_emails || v_phones))
    || jsonb_build_object('proposed_contacts_erased', v_proposed, 'personal_signals_erased', v_signals);
end;
$$;

revoke all on function private.erase_contact_extensions(uuid, uuid, public.contacts)
  from public, anon, authenticated, service_role;

-- Apagar a Conta leva os Sinais dela, as propostas dela e a tira do público dos Monitoramentos.
-- A proposta não cai sozinha: a linha da Conta vira marcador e a chave estrangeira não dispara.
create or replace function private.erase_account_extensions(p_workspace_id uuid, p_account_id uuid, p_account public.target_accounts)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_signals integer;
  v_proposed integer;
begin
  delete from private.signals g where g.workspace_id = p_workspace_id and g.target_account_id = p_account_id;
  get diagnostics v_signals = row_count;
  delete from private.proposed_contacts p
  where p.workspace_id = p_workspace_id and p.target_account_id = p_account_id;
  get diagnostics v_proposed = row_count;
  update private.signal_monitors m set audience = jsonb_set(
    m.audience, '{accountIds}',
    coalesce((select jsonb_agg(e) from jsonb_array_elements(m.audience -> 'accountIds') e where e #>> '{}' <> p_account_id::text), '[]'::jsonb))
  where m.workspace_id = p_workspace_id and m.audience -> 'accountIds' @> to_jsonb(p_account_id::text);
  return private.erase_import_data(p_workspace_id, p_account_id, p_account.canonical_url, null, null, null, null)
    || jsonb_build_object('agent_facts_erased', private.erase_agent_memory(
      p_workspace_id, array[p_account.name, p_account.canonical_url, p_account.domain, p_account.linkedin_url]))
    || jsonb_build_object('signals_erased', v_signals, 'proposed_contacts_erased', v_proposed);
end;
$$;

revoke all on function private.erase_account_extensions(uuid, uuid, public.target_accounts)
  from public, anon, authenticated, service_role;

-- O corpo é o de 20260929160000. A limpeza nova entra por erase_contact_extensions, chamada antes de a linha sair.
create or replace function public.erase_contact(p_contact_id uuid, p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_workspace_id uuid;
  v_role text;
  v_contact public.contacts;
  v_counts jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select c.workspace_id into v_workspace_id from public.contacts c
  join public.workspace_memberships m on m.workspace_id = c.workspace_id and m.user_id = v_user_id and m.active
  where c.id = p_contact_id;
  if not found then
    select e.workspace_id into v_workspace_id from private.data_lifecycle_events e
    join public.workspace_memberships m
      on m.workspace_id = e.workspace_id and m.user_id = v_user_id and m.active and m.role = 'admin'
    where e.subject_kind = 'contact' and e.subject_id = p_contact_id and e.action = 'erase'
    limit 1;
    if found then
      return jsonb_build_object('result', 'already_erased');
    end if;
    raise exception 'contact not found' using errcode = 'P0002';
  end if;

  perform private.take_subject_lock('contact', p_contact_id, 'exclusive');
  v_role := private.lock_caller_membership(v_workspace_id);
  if v_role <> 'admin' then
    raise exception 'only administrators can permanently delete a contact' using errcode = '42501';
  end if;
  select c.* into v_contact from public.contacts c where c.id = p_contact_id;
  if not found then
    return jsonb_build_object('result', 'already_erased');
  end if;
  if lower(btrim(coalesce(p_confirmation, ''))) <> lower(btrim(v_contact.name)) then
    raise exception 'the confirmation does not match the contact name' using errcode = '22023';
  end if;

  v_counts := private.erase_contact_data(v_workspace_id, p_contact_id);
  insert into private.data_lifecycle_events (workspace_id, actor_user_id, action, subject_kind, subject_id, result, counts)
  values (v_workspace_id, v_user_id, 'erase', 'contact', p_contact_id, 'done', v_counts);
  return jsonb_build_object('result', 'erased') || v_counts;
end;
$$;

revoke all on function public.erase_contact(uuid, text) from public, anon;
grant execute on function public.erase_contact(uuid, text) to authenticated;

-- O corpo é o de 20260929160000, com receita_data nulo no mesmo update que grava o marcador.
-- Um update depois esbarra na trava que impede mudar a Conta já apagada.
create or replace function public.erase_target_account(p_target_account_id uuid, p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_workspace_id uuid;
  v_role text;
  v_account public.target_accounts;
  v_contact_ids uuid[];
  v_kept integer;
  v_contact_id uuid;
  v_sequence_ids uuid[];
  v_ended integer;
  v_emails integer;
  v_sends integer;
  v_legacy integer;
  v_interactions integer;
  v_erased jsonb;
  v_contacts_erased integer := 0;
  v_counts jsonb;
  v_ext jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select a.workspace_id into v_workspace_id from public.target_accounts a
  join public.workspace_memberships m on m.workspace_id = a.workspace_id and m.user_id = v_user_id and m.active
  where a.id = p_target_account_id;
  if not found then
    raise exception 'target account not found' using errcode = 'P0002';
  end if;

  perform private.take_subject_lock('account', p_target_account_id, 'exclusive');
  v_role := private.lock_caller_membership(v_workspace_id);
  if v_role <> 'admin' then
    raise exception 'only administrators can permanently delete a target account' using errcode = '42501';
  end if;
  select a.* into v_account from public.target_accounts a where a.id = p_target_account_id;
  if v_account.deleted_at is not null then
    return jsonb_build_object('result', 'already_erased');
  end if;
  if lower(btrim(coalesce(p_confirmation, ''))) <> lower(btrim(v_account.name)) then
    raise exception 'the confirmation does not match the target account name' using errcode = '22023';
  end if;

  select coalesce(array_agg(x.contact_id order by x.contact_id), '{}') into v_contact_ids
  from (select distinct l.contact_id from public.contact_account_links l where l.target_account_id = p_target_account_id) x
  where not exists (
    select 1 from public.contact_account_links o
    where o.contact_id = x.contact_id and o.target_account_id <> p_target_account_id);
  foreach v_contact_id in array v_contact_ids loop
    perform private.take_subject_lock('contact', v_contact_id, 'exclusive');
  end loop;
  select coalesce(array_agg(c order by c), '{}') into v_contact_ids
  from unnest(v_contact_ids) c
  where not exists (
    select 1 from public.contact_account_links o
    where o.contact_id = c and o.target_account_id <> p_target_account_id);
  select count(distinct l.contact_id) into v_kept from public.contact_account_links l
  where l.target_account_id = p_target_account_id and l.contact_id <> all (v_contact_ids);

  select coalesce(array_agg(q.id order by q.id), '{}') into v_sequence_ids
  from public.sequences q
  where q.workspace_id = v_workspace_id and q.target_account_id = p_target_account_id::text;
  perform 1 from public.sequences q where q.id = any (v_sequence_ids) order by q.id for update;

  v_ended := private.end_sequences_of_deleted_account(v_workspace_id, p_target_account_id);
  v_emails := private.erase_received_emails(v_workspace_id, v_sequence_ids, null, null);
  v_sends := private.anonymize_sends(v_workspace_id, v_sequence_ids, null);
  update private.sequence_documents set document = '{}'::jsonb, updated_at = now()
  where sequence_id = any (v_sequence_ids) and document <> '{}'::jsonb;
  update private.sequence_authorizations set document = '{}'::jsonb
  where sequence_id = any (v_sequence_ids) and document <> '{}'::jsonb;

  delete from private.target_contacts_canais02 t
  where t.workspace_id = v_workspace_id and t.target_account_id = p_target_account_id::text;
  get diagnostics v_legacy = row_count;

  foreach v_contact_id in array v_contact_ids loop
    v_erased := private.erase_contact_data(v_workspace_id, v_contact_id);
    v_contacts_erased := v_contacts_erased + coalesce((v_erased ->> 'contacts_erased')::integer, 0);
  end loop;
  delete from public.contact_account_links l where l.target_account_id = p_target_account_id;
  update public.account_interactions i set contact_id = null
  where i.target_account_id = p_target_account_id and i.contact_id is not null;
  get diagnostics v_interactions = row_count;

  update public.target_accounts set
    name = 'Conta apagada', canonical_url = 'https://conta-apagada.invalid/' || id::text, domain = 'conta-apagada.invalid',
    legal_identifier = null, linkedin_url = null, segment = null, receita_data = null, deleted_at = now(), updated_at = now()
  where id = p_target_account_id;

  v_ext := private.erase_account_extensions(v_workspace_id, p_target_account_id, v_account);

  v_counts := jsonb_build_object(
    'sequences_ended', v_ended, 'received_emails_erased', v_emails, 'sends_anonymized', v_sends,
    'legacy_rows_erased', v_legacy, 'contacts_erased', v_contacts_erased, 'contacts_kept', v_kept,
    'interactions_detached', v_interactions) || v_ext;
  insert into private.data_lifecycle_events (workspace_id, actor_user_id, action, subject_kind, subject_id, result, counts)
  values (v_workspace_id, v_user_id, 'erase', 'account', p_target_account_id, 'done', v_counts);
  return jsonb_build_object('result', 'erased') || v_counts;
end;
$$;

revoke all on function public.erase_target_account(uuid, text) from public, anon;
grant execute on function public.erase_target_account(uuid, text) to authenticated;

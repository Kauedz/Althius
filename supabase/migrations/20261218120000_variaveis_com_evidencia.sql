-- Ticket 06: variáveis com evidência real da Conta, do Contato e do Sinal, e referência
-- comprovada a outro Contato. Envio, resposta e indicação não se emprestam. Dado ausente
-- segura o passo. A mensagem autorizada fica congelada: mudança posterior não sai em silêncio.
-- Não altera o agendador do ticket 02 nem release_step_send_core.

create table private.contact_indications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  target_account_id uuid not null,
  contact_id uuid not null,
  evidence text not null check (length(btrim(evidence)) between 1 and 2000),
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (workspace_id, target_account_id) references public.target_accounts(workspace_id, id) on delete cascade,
  foreign key (workspace_id, contact_id) references public.contacts(workspace_id, id) on delete cascade
);

create index contact_indications_account_idx
  on private.contact_indications (workspace_id, target_account_id, contact_id, created_at desc);

alter table private.contact_indications enable row level security;
revoke all on private.contact_indications from public, anon, authenticated, service_role;

comment on table private.contact_indications is
  'Prova de indicação de um Contato nesta Conta. O nome sozinho não entra; o texto da evidência fica privado.';

create table private.authorized_message_snapshots (
  authorization_id uuid not null references private.sequence_authorizations(id) on delete cascade,
  step_id text not null,
  subject text not null,
  body text not null,
  primary key (authorization_id, step_id)
);

alter table private.authorized_message_snapshots enable row level security;
revoke all on private.authorized_message_snapshots from public, anon, authenticated, service_role;

comment on table private.authorized_message_snapshots is
  'Texto resolvido no momento da autorização. O envio usa esta cópia; dado posterior que a mude exige reconfirmação.';

create function private.bind_step_json(p_step jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('althius.step_json', coalesce(p_step::text, ''), true);
end;
$$;

revoke all on function private.bind_step_json(jsonb) from public, anon, authenticated, service_role;

create function private.step_render_context()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v text;
begin
  v := pg_catalog.current_setting('althius.step_json', true);
  if v is null or btrim(v) = '' then
    return null;
  end if;
  begin
    return v::jsonb;
  exception when others then
    return null;
  end;
end;
$$;

revoke all on function private.step_render_context() from public, anon, authenticated, service_role;

-- Valor de Sinal ou de referência cruzada, ou null. Só lê a Conta da linha recebida.
-- Tentativa que não está sent não é envio. Envio não é resposta. Nome não é indicação.
create function private.evidence_variable_value(
  p_name text,
  p_account public.target_accounts,
  p_contact public.contacts,
  p_owner_name text
) returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_name text := lower(btrim(coalesce(p_name, '')));
  v_step jsonb := private.step_render_context();
  v_ref uuid;
  v_ref_text text;
  v_other public.contacts;
  v_phrase text;
  v_source text;
  v_evidence text;
  v_other_name text;
begin
  if p_account.id is null or p_account.workspace_id is null then
    return null;
  end if;

  if v_name = 'sinal.frase' or v_name = 'sinal.fonte' or v_name = 'sinal.evidencia' then
    select s.phrase, s.source, s.evidence into v_phrase, v_source, v_evidence
    from private.signals s
    where s.workspace_id = p_account.workspace_id
      and s.target_account_id = p_account.id
      and private.signal_is_valid(s.fired_at)
    order by s.fired_at desc, s.id desc
    limit 1;
    return nullif(btrim(case v_name
      when 'sinal.frase' then v_phrase
      when 'sinal.fonte' then v_source
      else v_evidence
    end), '');
  end if;

  if v_name not in ('referencia.envio', 'referencia.resposta', 'referencia.indicacao') then
    return null;
  end if;

  v_ref_text := nullif(btrim(coalesce(v_step ->> 'referenciaContatoId', '')), '');
  if v_ref_text is null or v_ref_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  v_ref := v_ref_text::uuid;
  if p_contact.id is not null and v_ref = p_contact.id then
    return null;
  end if;

  select c.* into v_other
  from public.contacts c
  join public.contact_account_links l
    on l.workspace_id = c.workspace_id and l.contact_id = c.id
   and l.target_account_id = p_account.id and l.ended_at is null
  where c.id = v_ref and c.workspace_id = p_account.workspace_id;
  if not found then
    return null;
  end if;
  v_other_name := nullif(btrim(v_other.name), '');
  if v_other_name is null then
    return null;
  end if;

  if v_name = 'referencia.envio' then
    if exists (
      select 1
      from private.sequence_step_sends e
      join public.sequences s on s.id = e.sequence_id
      where e.contact_id = v_ref and e.status = 'sent'
        and s.workspace_id = p_account.workspace_id
        and s.target_account_id = p_account.id::text
    ) then
      return v_other_name;
    end if;
    return null;
  end if;

  if v_name = 'referencia.resposta' then
    if exists (
      select 1 from public.account_interactions i
      where i.workspace_id = p_account.workspace_id and i.target_account_id = p_account.id
        and i.contact_id = v_ref and i.kind in ('email-recebido', 'mensagem-recebida')
    ) or exists (
      select 1
      from private.received_emails r
      join public.sequences s on s.id = r.sequence_id
      where r.contact_id = v_ref and r.workspace_id = p_account.workspace_id
        and s.workspace_id = p_account.workspace_id
        and s.target_account_id = p_account.id::text
    ) then
      return v_other_name;
    end if;
    return null;
  end if;

  select i.evidence into v_evidence
  from private.contact_indications i
  where i.workspace_id = p_account.workspace_id and i.target_account_id = p_account.id
    and i.contact_id = v_ref
  order by i.created_at desc, i.id desc
  limit 1;
  if v_evidence is null then
    return null;
  end if;
  if lower(btrim(v_evidence)) in (lower(v_other_name), lower(split_part(v_other_name, ' ', 1))) then
    return null;
  end if;
  return v_other_name;
end;
$$;

revoke all on function private.evidence_variable_value(text, public.target_accounts, public.contacts, text)
  from public, anon, authenticated, service_role;

create or replace function private.missing_step_variables(
  p_text text,
  p_account public.target_accounts,
  p_contact public.contacts,
  p_owner_name text
) returns text[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(nome order by primeira), '{}')
  from (
    select lower(m[1]) as nome, min(n) as primeira
    from regexp_matches(coalesce(p_text, ''), '\{\{\s*([A-Za-z_.]+)\s*\}\}', 'g') with ordinality as t(m, n)
    group by lower(m[1])
  ) v
  where private.step_variable_value(nome, p_account, p_contact, p_owner_name) is null
    and private.evidence_variable_value(nome, p_account, p_contact, p_owner_name) is null;
$$;

revoke all on function private.missing_step_variables(text, public.target_accounts, public.contacts, text)
  from public, anon, authenticated;

create or replace function private.render_step_template(
  p_text text,
  p_account public.target_accounts,
  p_contact public.contacts,
  p_owner_name text
) returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v text := coalesce(p_text, '');
  v_name text;
  v_value text;
  v_key text;
begin
  for v_name in select distinct m[1] from regexp_matches(v, '\{\{\s*([A-Za-z_.]+)\s*\}\}', 'g') as t(m) loop
    v_key := lower(btrim(v_name));
    v_value := private.step_variable_value(v_name, p_account, p_contact, p_owner_name);
    if v_value is null then
      v_value := private.evidence_variable_value(v_name, p_account, p_contact, p_owner_name);
    end if;
    -- Sinal e referência sem prova ficam no texto. O envio segura o passo; vazio não substitui.
    if v_value is null and v_key in (
      'sinal.frase', 'sinal.fonte', 'sinal.evidencia',
      'referencia.envio', 'referencia.resposta', 'referencia.indicacao'
    ) then
      continue;
    end if;
    v_value := coalesce(v_value, '');
    v := regexp_replace(v, '\{\{\s*' || replace(v_name, '.', '\.') || '\s*\}\}', replace(v_value, '\', '\\'), 'g');
  end loop;
  return v;
end;
$$;

create function private.rendered_step_parts(
  p_step jsonb,
  p_account public.target_accounts,
  p_contact public.contacts,
  p_owner_name text
) returns table (subject text, body text)
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_subject text;
begin
  perform private.bind_step_json(p_step);
  v_subject := coalesce(nullif(btrim(p_step ->> 'assunto'), ''), nullif(btrim(p_step ->> 'titulo'), ''), '(sem assunto)');
  subject := private.render_step_template(v_subject, p_account, p_contact, p_owner_name);
  body := private.render_step_template(coalesce(p_step ->> 'corpo', ''), p_account, p_contact, p_owner_name);
  return next;
end;
$$;

revoke all on function private.rendered_step_parts(jsonb, public.target_accounts, public.contacts, text)
  from public, anon, authenticated, service_role;

create function private.freeze_authorized_messages()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sequence public.sequences;
  v_account public.target_accounts;
  v_owner_name text;
  v_step jsonb;
  v_contact public.contacts;
  v_parts record;
begin
  select s.* into v_sequence from public.sequences s where s.id = new.sequence_id;
  if not found then
    return new;
  end if;
  select a.* into v_account from public.target_accounts a
  where a.workspace_id = v_sequence.workspace_id and a.id::text = v_sequence.target_account_id;
  select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'name'), ''), u.email)
    into v_owner_name from auth.users u where u.id = new.authorized_by;

  for v_step in
    select value from jsonb_array_elements(case when jsonb_typeof(new.document -> 'steps') = 'array'
      then new.document -> 'steps' else '[]'::jsonb end)
  loop
    if nullif(btrim(coalesce(v_step ->> 'id', '')), '') is null then
      continue;
    end if;
    v_contact := null;
    if coalesce(v_step ->> 'contatoId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select c.* into v_contact from public.contacts c
      where c.id = (v_step ->> 'contatoId')::uuid and c.workspace_id = v_sequence.workspace_id;
    end if;
    select p.subject, p.body into v_parts
    from private.rendered_step_parts(v_step, v_account, v_contact, v_owner_name) p;
    insert into private.authorized_message_snapshots (authorization_id, step_id, subject, body)
    values (new.id, v_step ->> 'id', coalesce(v_parts.subject, ''), coalesce(v_parts.body, ''))
    on conflict (authorization_id, step_id) do nothing;
  end loop;
  perform set_config('althius.step_json', '', true);
  return new;
end;
$$;

revoke all on function private.freeze_authorized_messages() from public, anon, authenticated, service_role;

create trigger sequence_authorizations_freeze_messages
  after insert on private.sequence_authorizations
  for each row execute function private.freeze_authorized_messages();

-- null quando o passo pode seguir. Caso contrário, o motivo gravado em last_error.
create function private.step_evidence_hold_reason(p_send_id uuid)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_send private.sequence_step_sends;
  v_sequence public.sequences;
  v_step jsonb;
  v_account public.target_accounts;
  v_contact public.contacts;
  v_owner_name text;
  v_missing text[];
  v_parts record;
  v_snap_subject text;
  v_snap_body text;
begin
  select e.* into v_send from private.sequence_step_sends e where e.id = p_send_id;
  if not found or v_send.status not in ('scheduled', 'confirmed') then
    return null;
  end if;
  select s.* into v_sequence from public.sequences s where s.id = v_send.sequence_id;
  if not found or v_sequence.status <> 'ativa' then
    return null;
  end if;
  v_step := case when v_send.authorization_id is not null
    then private.authorized_step(v_send.authorization_id, v_send.step_id)
    else private.sequence_step(v_sequence.id, v_send.step_id) end;
  if v_step is null then
    return null;
  end if;
  select a.* into v_account from public.target_accounts a
  where a.workspace_id = v_sequence.workspace_id and a.id::text = v_sequence.target_account_id;
  select c.* into v_contact from public.contacts c
  where c.id = v_send.contact_id and c.workspace_id = v_sequence.workspace_id;
  select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'name'), ''), u.email)
    into v_owner_name from auth.users u where u.id = v_send.owner_user_id;
  perform private.bind_step_json(v_step);
  v_missing := private.missing_step_variables(
    coalesce(v_step ->> 'assunto', v_step ->> 'titulo', '') || E'\n' || coalesce(v_step ->> 'corpo', ''),
    v_account, v_contact, v_owner_name);
  if cardinality(v_missing) > 0 then
    return 'missing_variable:' || array_to_string(v_missing, ',');
  end if;
  if v_send.authorization_id is null then
    return null;
  end if;
  select s.subject, s.body into v_snap_subject, v_snap_body
  from private.authorized_message_snapshots s
  where s.authorization_id = v_send.authorization_id and s.step_id = v_send.step_id;
  if not found then
    return null;
  end if;
  select p.subject, p.body into v_parts
  from private.rendered_step_parts(v_step, v_account, v_contact, v_owner_name) p;
  if v_parts.subject is distinct from v_snap_subject or v_parts.body is distinct from v_snap_body then
    return 'message_changed';
  end if;
  return null;
end;
$$;

revoke all on function private.step_evidence_hold_reason(uuid) from public, anon, authenticated, service_role;

create or replace function private.release_step_send(p_send_id uuid, p_user_id uuid, p_due_only boolean)
returns table (
  outcome text, send_id uuid, unipile_account_id text, destination text, contact_name text,
  subject text, body text, reply_to_message_id text,
  tracking_header_name text, tracking_header_value text, unsubscribe_token text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_send private.sequence_step_sends;
  v_sequence public.sequences;
  v_step jsonb;
  v_reason text;
  v_released record;
  v_token text;
  v_snap_subject text;
  v_snap_body text;
begin
  select e.* into v_send from private.sequence_step_sends e where e.id = p_send_id;

  if found and v_send.status in ('waiting', 'scheduled', 'confirmed', 'awaiting_reconfirmation') then
    select s.* into v_sequence from public.sequences s where s.id = v_send.sequence_id for update;
    select e.* into v_send from private.sequence_step_sends e where e.id = p_send_id for update;

    if private.is_suppressed(v_send.workspace_id, v_send.destination) then
      update private.sequence_step_sends set
        status = 'cancelled', scheduled_for = null, claimed_until = null,
        last_error = 'contact_suppressed', last_error_at = now(), updated_at = now()
      where id = v_send.id;
      return query select 'contact_suppressed', v_send.id, null::text, null::text, null::text,
        null::text, null::text, null::text, null::text, null::text, null::text;
      return;
    end if;

    if v_send.status in ('scheduled', 'confirmed') and v_sequence.status = 'ativa' then
      v_step := case when v_send.authorization_id is not null
        then private.authorized_step(v_send.authorization_id, v_send.step_id)
        else private.sequence_step(v_sequence.id, v_send.step_id) end;
      if v_step is not null then
        perform private.bind_step_json(v_step);
        v_reason := private.step_evidence_hold_reason(v_send.id);
        if v_reason is not null then
          update private.sequence_step_sends set
            status = 'awaiting_reconfirmation', claimed_until = null,
            last_error = v_reason, last_error_at = now(), updated_at = now()
          where id = v_send.id;
          return query select split_part(v_reason, ':', 1), v_send.id, null::text, null::text, null::text,
            null::text, null::text, null::text, null::text, null::text, null::text;
          return;
        end if;
      end if;
    end if;
  end if;

  for v_released in select * from private.release_step_send_with_guards(p_send_id, p_user_id, p_due_only) loop
    v_token := null;
    if v_released.outcome = 'released' then
      insert into private.unsubscribe_tokens (token, send_id)
      values (private.new_unsubscribe_token(), v_released.send_id)
      on conflict (send_id) do update set token = private.unsubscribe_tokens.token
      returning token into v_token;
      if v_send.authorization_id is not null then
        select s.subject, s.body into v_snap_subject, v_snap_body
        from private.authorized_message_snapshots s
        where s.authorization_id = v_send.authorization_id and s.step_id = v_send.step_id;
        if found then
          update private.sequence_step_sends set subject = v_snap_subject, body = v_snap_body, updated_at = now()
          where id = v_send.id;
          v_released.subject := v_snap_subject;
          v_released.body := v_snap_body;
        end if;
      end if;
    end if;
    return query select v_released.outcome, v_released.send_id, v_released.unipile_account_id,
      v_released.destination, v_released.contact_name, v_released.subject, v_released.body,
      v_released.reply_to_message_id, v_released.tracking_header_name, v_released.tracking_header_value, v_token;
  end loop;
  perform set_config('althius.step_json', '', true);
end;
$$;

revoke all on function private.release_step_send(uuid, uuid, boolean) from public, anon, authenticated;

create function private.release_chat_step_send_guarded(p_send_id uuid, p_user_id uuid, p_due_only boolean)
returns table (
  outcome text, send_id uuid, channel text, unipile_account_id text, destination text, contact_name text,
  body text, linkedin_subtype text, provider_chat_id text, provider_user_id text,
  invite_sent boolean, invite_note_limit integer
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_send private.sequence_step_sends;
  v_sequence public.sequences;
  v_reason text;
  v_released record;
  v_snap_body text;
begin
  select e.* into v_send from private.sequence_step_sends e where e.id = p_send_id;
  if not found then
    raise exception 'send not found' using errcode = 'P0002';
  end if;
  if v_send.channel in ('whatsapp', 'linkedin') then
    select s.* into v_sequence from public.sequences s where s.id = v_send.sequence_id for update;
    select e.* into v_send from private.sequence_step_sends e where e.id = p_send_id for update;
    if v_send.status in ('scheduled', 'confirmed') and v_sequence.status = 'ativa' then
      v_reason := private.step_evidence_hold_reason(v_send.id);
      if v_reason is not null then
        update private.sequence_step_sends set
          status = 'awaiting_reconfirmation', claimed_until = null,
          last_error = v_reason, last_error_at = now(), updated_at = now()
        where id = v_send.id;
        return query select split_part(v_reason, ':', 1), v_send.id, null::text, null::text, null::text, null::text,
          null::text, null::text, null::text, null::text, null::boolean, null::integer;
        return;
      end if;
    end if;
  end if;

  for v_released in select * from private.release_chat_step_send(p_send_id, p_user_id, p_due_only) loop
    if v_released.outcome = 'released' and v_send.authorization_id is not null then
      select s.body into v_snap_body from private.authorized_message_snapshots s
      where s.authorization_id = v_send.authorization_id and s.step_id = v_send.step_id;
      if found then
        update private.sequence_step_sends set body = v_snap_body, updated_at = now() where id = v_send.id;
        v_released.body := v_snap_body;
      end if;
    end if;
    return query select v_released.outcome, v_released.send_id, v_released.channel, v_released.unipile_account_id,
      v_released.destination, v_released.contact_name, v_released.body, v_released.linkedin_subtype,
      v_released.provider_chat_id, v_released.provider_user_id, v_released.invite_sent, v_released.invite_note_limit;
  end loop;
end;
$$;

revoke all on function private.release_chat_step_send_guarded(uuid, uuid, boolean)
  from public, anon, authenticated, service_role;

create or replace function public.release_chat_step_send(p_send_id uuid, p_user_id uuid)
returns table (
  outcome text, send_id uuid, channel text, unipile_account_id text, destination text, contact_name text,
  body text, linkedin_subtype text, provider_chat_id text, provider_user_id text,
  invite_sent boolean, invite_note_limit integer
)
language sql
security definer
set search_path = ''
as $$
  select * from private.release_chat_step_send_guarded(p_send_id, p_user_id, false);
$$;

create or replace function public.release_due_chat_step_send(p_send_id uuid)
returns table (
  outcome text, send_id uuid, channel text, unipile_account_id text, destination text, contact_name text,
  body text, linkedin_subtype text, provider_chat_id text, provider_user_id text,
  invite_sent boolean, invite_note_limit integer
)
language sql
security definer
set search_path = ''
as $$
  select * from private.release_chat_step_send_guarded(
    p_send_id,
    (select e.owner_user_id from private.sequence_step_sends e where e.id = p_send_id),
    true);
$$;

revoke all on function public.release_chat_step_send(uuid, uuid) from public, anon, authenticated;
grant execute on function public.release_chat_step_send(uuid, uuid) to service_role;
revoke all on function public.release_due_chat_step_send(uuid) from public, anon, authenticated;
grant execute on function public.release_due_chat_step_send(uuid) to service_role;

create function public.record_contact_indication(
  p_account_id uuid,
  p_contact_id uuid,
  p_evidence text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_account public.target_accounts;
  v_contact public.contacts;
  v_evidence text := btrim(coalesce(p_evidence, ''));
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select a.* into v_account
  from public.target_accounts a
  join public.workspace_memberships m
    on m.workspace_id = a.workspace_id and m.user_id = v_user_id and m.active
  join public.sales_responsibilities r
    on r.workspace_id = a.workspace_id and r.target_account_id = a.id::text and r.owner_user_id = v_user_id
  where a.id = p_account_id;
  if not found then
    raise exception 'account not found or not owned by active user' using errcode = '42501';
  end if;
  select c.* into v_contact
  from public.contacts c
  join public.contact_account_links l
    on l.workspace_id = c.workspace_id and l.contact_id = c.id
   and l.target_account_id = v_account.id and l.ended_at is null
  where c.id = p_contact_id and c.workspace_id = v_account.workspace_id;
  if not found then
    raise exception 'contact not linked to this account' using errcode = '42501';
  end if;
  if v_evidence = '' or length(v_evidence) > 2000
    or lower(v_evidence) in (lower(btrim(v_contact.name)), lower(split_part(btrim(v_contact.name), ' ', 1))) then
    raise exception 'o nome nao e indicacao comprovada' using errcode = '22023';
  end if;
  insert into private.contact_indications (workspace_id, target_account_id, contact_id, evidence, recorded_by)
  values (v_account.workspace_id, v_account.id, v_contact.id, v_evidence, v_user_id)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.record_contact_indication(uuid, uuid, text) from public, anon;
grant execute on function public.record_contact_indication(uuid, uuid, text) to authenticated;

create function public.preview_sequence_step(p_sequence_id uuid, p_step_id text)
returns table (subject text, body text, missing text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_sequence public.sequences;
  v_step jsonb;
  v_account public.target_accounts;
  v_contact public.contacts;
  v_owner_name text;
  v_parts record;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select s.* into v_sequence
  from public.sequences s
  join public.workspace_memberships m
    on m.workspace_id = s.workspace_id and m.user_id = v_user_id and m.active
  join public.sales_responsibilities r
    on r.workspace_id = s.workspace_id and r.target_account_id = s.target_account_id and r.owner_user_id = v_user_id
  where s.id = p_sequence_id and s.owner_user_id = v_user_id;
  if not found then
    raise exception 'sequence not found or not owned by active user' using errcode = '42501';
  end if;
  v_step := private.sequence_step(v_sequence.id, p_step_id);
  if v_step is null then
    raise exception 'step not found' using errcode = 'P0002';
  end if;
  select a.* into v_account from public.target_accounts a
  where a.workspace_id = v_sequence.workspace_id and a.id::text = v_sequence.target_account_id;
  if coalesce(v_step ->> 'contatoId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select c.* into v_contact from public.contacts c
    where c.id = (v_step ->> 'contatoId')::uuid and c.workspace_id = v_sequence.workspace_id;
  end if;
  select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'name'), ''), u.email)
    into v_owner_name from auth.users u where u.id = v_user_id;
  perform private.bind_step_json(v_step);
  select p.subject, p.body into v_parts
  from private.rendered_step_parts(v_step, v_account, v_contact, v_owner_name) p;
  return query select v_parts.subject, v_parts.body, private.missing_step_variables(
    coalesce(v_step ->> 'assunto', v_step ->> 'titulo', '') || E'\n' || coalesce(v_step ->> 'corpo', ''),
    v_account, v_contact, v_owner_name);
end;
$$;

revoke all on function public.preview_sequence_step(uuid, text) from public, anon;
grant execute on function public.preview_sequence_step(uuid, text) to authenticated;

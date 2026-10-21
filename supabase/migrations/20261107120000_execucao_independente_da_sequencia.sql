-- Ticket 02: caminhos explícitos avançam em paralelo; documento sem liberacao continua serial.
-- Não altera Unipile, conectores nem recebimento. Falha e incerteza não liberam dependente nem repetem envio.
-- A agenda confirmada (fuso, dias, janela, máximo diário, intervalo) fica no snapshot da autorização.

create function private.agenda_timezone(p_document jsonb)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when exists (select 1 from pg_catalog.pg_timezone_names n where n.name = p_document ->> 'fuso')
      then p_document ->> 'fuso'
    else 'America/Sao_Paulo'
  end;
$$;

revoke all on function private.agenda_timezone(jsonb) from public, anon, authenticated;

create function private.agenda_weekdays(p_document jsonb)
returns integer[]
language sql
stable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_document -> 'diasUteis') = 'array' then (
      select array_agg(d order by d)
      from (
        select distinct (jsonb_array_elements_text(p_document -> 'diasUteis'))::integer as d
      ) dias
      where d between 1 and 5
    )
    else null
  end;
$$;

revoke all on function private.agenda_weekdays(jsonb) from public, anon, authenticated;

create function private.document_has_explicit_release(p_document jsonb)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from jsonb_array_elements(case when jsonb_typeof(p_document -> 'steps') = 'array'
      then p_document -> 'steps' else '[]'::jsonb end) as t(step)
    where nullif(btrim(coalesce(step ->> 'liberacao', '')), '') in ('ativacao', 'predecessor', 'manual')
  );
$$;

revoke all on function private.document_has_explicit_release(jsonb) from public, anon, authenticated;

-- Relógio com fuso e dias confirmados. A função de 3 argumentos (Brasília, seg–sex) não muda.
create function private.next_send_slot(
  p_base timestamptz,
  p_business_days integer,
  p_window jsonb,
  p_timezone text,
  p_weekdays integer[]
) returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tz text := case
    when exists (select 1 from pg_catalog.pg_timezone_names n where n.name = p_timezone) then p_timezone
    else 'America/Sao_Paulo'
  end;
  v_days integer[] := (
    select coalesce(array_agg(d order by d), array[1, 2, 3, 4, 5])
    from unnest(coalesce(p_weekdays, array[1, 2, 3, 4, 5])) as u(d)
    where d between 1 and 5
  );
  v_local timestamp := p_base at time zone v_tz;
  v_day date := v_local::date;
  v_time time := v_local::time;
  v_from time := private.window_time(p_window ->> 'de', '09:00');
  v_to time := private.window_time(p_window ->> 'ate', '18:00');
  v_left integer := greatest(coalesce(p_business_days, 0), 0);
  v_guard integer := 0;
begin
  if v_to <= v_from then
    v_from := '09:00';
    v_to := '18:00';
  end if;
  if cardinality(v_days) = 0 then
    v_days := array[1, 2, 3, 4, 5];
  end if;
  while v_left > 0 and v_guard < 370 loop
    v_day := v_day + 1;
    v_guard := v_guard + 1;
    if extract(isodow from v_day)::integer = any (v_days) then
      v_left := v_left - 1;
    end if;
  end loop;
  v_guard := 0;
  if extract(isodow from v_day)::integer <> all (v_days) or v_time >= v_to then
    v_day := v_day + 1;
    while extract(isodow from v_day)::integer <> all (v_days) and v_guard < 14 loop
      v_day := v_day + 1;
      v_guard := v_guard + 1;
    end loop;
    v_time := v_from;
  elsif v_time < v_from then
    v_time := v_from;
  end if;
  return (v_day + v_time) at time zone v_tz;
end;
$$;

revoke all on function private.next_send_slot(timestamptz, integer, jsonb, text, integer[]) from public, anon, authenticated;

create function private.confirmed_agenda_problem(p_agenda jsonb)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_fuso text := nullif(btrim(coalesce(p_agenda ->> 'fuso', '')), '');
  v_de text := p_agenda -> 'janela' ->> 'de';
  v_ate text := p_agenda -> 'janela' ->> 'ate';
  v_max integer;
  v_gap integer;
  v_days integer;
begin
  if p_agenda is null or jsonb_typeof(p_agenda) <> 'object' then
    return 'agenda_invalida';
  end if;
  if v_fuso is null or not exists (select 1 from pg_catalog.pg_timezone_names n where n.name = v_fuso) then
    return 'agenda_invalida';
  end if;
  if jsonb_typeof(p_agenda -> 'diasUteis') <> 'array' or jsonb_array_length(p_agenda -> 'diasUteis') = 0 then
    return 'agenda_invalida';
  end if;
  select count(*) into v_days
  from (
    select distinct (jsonb_array_elements_text(p_agenda -> 'diasUteis'))::integer as d
  ) dias
  where d between 1 and 5;
  if v_days <> jsonb_array_length(p_agenda -> 'diasUteis') or v_days = 0 then
    return 'agenda_invalida';
  end if;
  if v_de is null or v_ate is null or v_de !~ '^\d{1,2}:\d{2}$' or v_ate !~ '^\d{1,2}:\d{2}$' then
    return 'agenda_invalida';
  end if;
  if private.window_time(v_de, '00:00') >= private.window_time(v_ate, '00:00') then
    return 'agenda_invalida';
  end if;
  if (p_agenda ->> 'maximoDiario') !~ '^\d{1,2}$' or (p_agenda ->> 'intervaloMinutos') !~ '^\d{1,4}$' then
    return 'agenda_invalida';
  end if;
  v_max := (p_agenda ->> 'maximoDiario')::integer;
  v_gap := (p_agenda ->> 'intervaloMinutos')::integer;
  if v_max < 1 or v_max > 50 or v_gap < 0 or v_gap > 1440 then
    return 'agenda_invalida';
  end if;
  return null;
end;
$$;

revoke all on function private.confirmed_agenda_problem(jsonb) from public, anon, authenticated;

-- Empurra o horário para caber no máximo diário e no intervalo da Conta. Excesso espera; não cancela.
create function private.account_send_slot(
  p_sequence_id uuid,
  p_channel text,
  p_desired timestamptz,
  p_window jsonb,
  p_document jsonb,
  p_extra timestamptz[]
) returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_workspace uuid;
  v_account text;
  v_tz text;
  v_days integer[];
  v_max integer;
  v_gap interval := interval '0';
  v_channel_gap interval;
  v_slot timestamptz := p_desired;
  v_occupied timestamptz[] := coalesce(p_extra, array[]::timestamptz[]);
  v_day date;
  v_count integer;
  v_guard integer := 0;
  v_hit timestamptz;
begin
  if p_document is null or (p_document ->> 'maximoDiario') is null then
    return p_desired;
  end if;
  select s.workspace_id, s.target_account_id into v_workspace, v_account
  from public.sequences s where s.id = p_sequence_id;
  if v_account is null then
    return p_desired;
  end if;
  v_tz := private.agenda_timezone(p_document);
  v_days := private.agenda_weekdays(p_document);
  v_max := (p_document ->> 'maximoDiario')::integer;
  if (p_document ->> 'intervaloMinutos') ~ '^\d+$' then
    v_gap := make_interval(mins => (p_document ->> 'intervaloMinutos')::integer);
  end if;
  if private.send_rate_enabled() then
    select make_interval(secs => r.min_gap_seconds) into v_channel_gap
    from private.send_rate(v_workspace, p_channel) r;
    if v_channel_gap is not null and v_channel_gap > v_gap then
      v_gap := v_channel_gap;
    end if;
  end if;

  while v_guard < 40 loop
    v_guard := v_guard + 1;
    v_slot := private.next_send_slot(v_slot, 0, p_window, v_tz, v_days);
    select min(t) into v_hit
    from unnest(v_occupied) as u(t)
    where v_gap > interval '0' and t > v_slot - v_gap and t <= v_slot;
    if v_hit is not null then
      v_slot := v_hit + v_gap;
      continue;
    end if;
    v_day := (v_slot at time zone v_tz)::date;
    select count(*) into v_count
    from unnest(v_occupied) as u(t)
    where (t at time zone v_tz)::date = v_day;
    if v_count >= v_max then
      v_slot := private.next_send_slot((v_day + 1) + time '00:00', 0, p_window, v_tz, v_days);
      continue;
    end if;
    return v_slot;
  end loop;
  return v_slot;
end;
$$;

revoke all on function private.account_send_slot(uuid, text, timestamptz, jsonb, jsonb, timestamptz[]) from public, anon, authenticated;

-- Antes da reserva: se dois caminhos da mesma Conta venceram juntos, só o que esperou mais fica elegível.
create function private.apply_account_send_limits()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid;
  v_account text;
  v_send record;
  v_kept timestamptz[] := array[]::timestamptz[];
  v_slot timestamptz;
  v_document jsonb;
begin
  for v_workspace, v_account in
    select distinct s.workspace_id, s.target_account_id
    from private.sequence_step_sends e
    join public.sequences s on s.id = e.sequence_id and s.status = 'ativa'
    join private.sequence_authorizations a on a.id = e.authorization_id and a.revoked_at is null
    where e.status = 'scheduled'
      and e.scheduled_for <= private.clock_now()
      and (e.claimed_until is null or e.claimed_until < now())
      and (a.document ->> 'maximoDiario') ~ '^[0-9]+$'
  loop
    perform pg_catalog.pg_advisory_xact_lock(hashtext(v_workspace::text || ':' || v_account));
    v_kept := array[]::timestamptz[];
    select coalesce(array_agg(coalesce(e.sent_at, e.scheduled_for)), array[]::timestamptz[])
      into v_kept
    from private.sequence_step_sends e
    join public.sequences s on s.id = e.sequence_id
    where s.workspace_id = v_workspace and s.target_account_id = v_account
      and coalesce(e.sent_at, e.scheduled_for) is not null
      and (
        e.status in ('sent', 'sending', 'uncertain')
        or (e.status in ('scheduled', 'confirmed') and e.claimed_until >= now())
      );

    for v_send in
      select e.id, e.sequence_id, e.channel, e.scheduled_for, e.step_id, a.document
      from private.sequence_step_sends e
      join public.sequences s on s.id = e.sequence_id and s.status = 'ativa'
      join private.sequence_authorizations a on a.id = e.authorization_id and a.revoked_at is null
      where s.workspace_id = v_workspace and s.target_account_id = v_account
        and e.status = 'scheduled'
        and e.scheduled_for <= private.clock_now()
        and (e.claimed_until is null or e.claimed_until < now())
      order by (
        select p.sent_at
        from private.sequence_step_sends p
        where p.sequence_id = e.sequence_id and p.status = 'sent' and p.step_id = (
          select nullif(btrim(coalesce(st ->> 'predecessorId', '')), '')
          from jsonb_array_elements(case when jsonb_typeof(a.document -> 'steps') = 'array'
            then a.document -> 'steps' else '[]'::jsonb end) st
          where st ->> 'id' = e.step_id
          limit 1
        )
        limit 1
      ) nulls first, e.scheduled_for, e.id
    loop
      v_document := v_send.document;
      v_slot := private.account_send_slot(
        v_send.sequence_id, v_send.channel, v_send.scheduled_for,
        private.step_window(v_document, '{}'::jsonb), v_document, v_kept);
      if v_slot > private.clock_now() then
        update private.sequence_step_sends
        set scheduled_for = v_slot, claimed_until = null, updated_at = now()
        where id = v_send.id and status = 'scheduled';
      else
        v_kept := v_kept || v_send.scheduled_for;
      end if;
    end loop;
  end loop;
end;
$$;

revoke all on function private.apply_account_send_limits() from public, anon, authenticated, service_role;

-- Programar passos elegíveis. Sem liberacao explícita, a fila serial de 20261019120000 permanece.
create or replace function private.schedule_next_step(p_sequence_id uuid, p_base timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth private.sequence_authorizations;
  v_status text;
  v_workspace uuid;
  v_owner uuid;
  v_account text;
  v_step jsonb;
  v_send private.sequence_step_sends;
  v_pred private.sequence_step_sends;
  v_window jsonb;
  v_at timestamptz;
  v_base timestamptz;
  v_sender_id uuid;
  v_entry_kind text;
  v_first uuid;
  v_placed timestamptz[] := array[]::timestamptz[];
  v_ready boolean;
  v_n bigint;
  v_prev_sent boolean;
  v_tz text;
  v_days integer[];
begin
  select a.* into v_auth from private.sequence_authorizations a
  where a.sequence_id = p_sequence_id and a.revoked_at is null;
  if not found then
    return null;
  end if;
  select s.status, s.workspace_id, s.owner_user_id, s.target_account_id
    into v_status, v_workspace, v_owner, v_account
  from public.sequences s
  where s.id = p_sequence_id
  for update;
  if v_status is distinct from 'ativa' then
    return null;
  end if;

  if not private.document_has_explicit_release(v_auth.document) then
    for v_step in
      select t.step from jsonb_array_elements(case when jsonb_typeof(v_auth.document -> 'steps') = 'array'
        then v_auth.document -> 'steps' else '[]'::jsonb end) with ordinality as t(step, n)
      order by t.n
    loop
      if v_step ->> 'canal' is distinct from 'email'
        and not (v_step ->> 'canal' in ('whatsapp', 'linkedin') and private.chat_channel_enabled(v_step ->> 'canal')) then
        return null;
      end if;
      select e.* into v_send from private.sequence_step_sends e
      where e.sequence_id = p_sequence_id and e.step_id = v_step ->> 'id';
      if not found then
        return null;
      end if;
      if v_send.status = 'sent' then
        continue;
      end if;
      if v_send.status <> 'waiting' or v_send.authorization_id is distinct from v_auth.id then
        return null;
      end if;
      v_window := private.step_window(v_auth.document, v_step);
      v_at := greatest(
        private.next_send_slot(coalesce(p_base, private.clock_now()), private.step_delay(v_step), v_window),
        private.next_send_slot(private.clock_now(), 0, v_window));
      if private.send_rate_enabled() then
        v_at := private.jittered_send_slot(v_at, v_window, (
          select r.schedule_jitter_seconds from private.send_rate(v_workspace, v_step ->> 'canal') r));
        v_entry_kind := private.company_entry_kind(v_step ->> 'canal');
        if v_entry_kind is not null and v_account ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' then
          select a.id into v_sender_id
          from private.sender_accounts a
          where a.workspace_id = v_workspace and a.owner_user_id = v_owner and a.channel = v_step ->> 'canal'
            and a.status = 'ready' and not a.reconciliation_required
          order by a.last_status_at desc
          limit 1;
          if v_sender_id is not null then
            v_at := private.place_company_entry(v_sender_id, v_workspace, v_account::uuid, v_entry_kind, v_at, v_window);
          end if;
        end if;
      end if;
      update private.sequence_step_sends set
        status = case when mode = 'auto' then 'scheduled' else 'confirmed' end,
        scheduled_for = v_at,
        claimed_until = null,
        updated_at = now()
      where id = v_send.id;
      return v_send.id;
    end loop;
    return null;
  end if;

  v_tz := private.agenda_timezone(v_auth.document);
  v_days := private.agenda_weekdays(v_auth.document);
  if (v_auth.document ->> 'maximoDiario') ~ '^[0-9]+$' then
    select coalesce(array_agg(coalesce(e.sent_at, e.scheduled_for)), array[]::timestamptz[])
      into v_placed
    from private.sequence_step_sends e
    join public.sequences s on s.id = e.sequence_id
    where s.workspace_id = v_workspace and s.target_account_id = v_account
      and coalesce(e.sent_at, e.scheduled_for) is not null
      and (
        e.status in ('sent', 'sending', 'uncertain')
        or (e.status in ('scheduled', 'confirmed') and (e.claimed_until >= now() or e.scheduled_for > private.clock_now()))
      );
  end if;
  for v_step, v_n in
    select t.step, t.n from jsonb_array_elements(case when jsonb_typeof(v_auth.document -> 'steps') = 'array'
      then v_auth.document -> 'steps' else '[]'::jsonb end) with ordinality as t(step, n)
    order by t.n
  loop
    if v_step ->> 'canal' is distinct from 'email'
      and not (v_step ->> 'canal' in ('whatsapp', 'linkedin') and private.chat_channel_enabled(v_step ->> 'canal')) then
      continue;
    end if;
    select e.* into v_send from private.sequence_step_sends e
    where e.sequence_id = p_sequence_id and e.step_id = v_step ->> 'id';
    if not found or v_send.status = 'sent' then
      continue;
    end if;
    if v_send.status <> 'waiting' or v_send.authorization_id is distinct from v_auth.id then
      continue;
    end if;

    v_ready := false;
    v_base := coalesce(p_base, v_auth.authorized_at, private.clock_now());
    if nullif(btrim(coalesce(v_step ->> 'liberacao', '')), '') is null then
      v_prev_sent := not exists (
        select 1
        from jsonb_array_elements(v_auth.document -> 'steps') with ordinality as prev(step, n)
        where prev.n < v_n
          and not exists (
            select 1 from private.sequence_step_sends p
            where p.sequence_id = p_sequence_id and p.step_id = prev.step ->> 'id' and p.status = 'sent'
          )
      );
      if v_prev_sent then
        select p.sent_at into v_base
        from jsonb_array_elements(v_auth.document -> 'steps') with ordinality as prev(step, n)
        join private.sequence_step_sends p
          on p.sequence_id = p_sequence_id and p.step_id = prev.step ->> 'id' and p.status = 'sent'
        where prev.n < v_n
        order by prev.n desc
        limit 1;
        v_base := coalesce(v_base, v_auth.authorized_at, private.clock_now());
        v_ready := true;
      end if;
    elsif v_step ->> 'liberacao' = 'ativacao' then
      v_base := coalesce(v_auth.authorized_at, private.clock_now());
      v_ready := true;
    elsif v_step ->> 'liberacao' = 'predecessor' then
      select p.* into v_pred
      from private.sequence_step_sends p
      where p.sequence_id = p_sequence_id and p.step_id = v_step ->> 'predecessorId' and p.status = 'sent'
      order by p.sent_at desc nulls last
      limit 1;
      if found and v_pred.sent_at is not null then
        v_base := v_pred.sent_at;
        v_ready := true;
      end if;
    end if;
    if not v_ready then
      continue;
    end if;

    v_window := private.step_window(v_auth.document, v_step);
    if v_days is null then
      v_at := greatest(
        private.next_send_slot(v_base, private.step_delay(v_step), v_window),
        private.next_send_slot(private.clock_now(), 0, v_window));
    else
      v_at := greatest(
        private.next_send_slot(v_base, private.step_delay(v_step), v_window, v_tz, v_days),
        private.next_send_slot(private.clock_now(), 0, v_window, v_tz, v_days));
    end if;
    if private.send_rate_enabled() then
      v_at := private.jittered_send_slot(v_at, v_window, (
        select r.schedule_jitter_seconds from private.send_rate(v_workspace, v_step ->> 'canal') r));
      v_entry_kind := private.company_entry_kind(v_step ->> 'canal');
      if v_entry_kind is not null and v_account ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' then
        select a.id into v_sender_id
        from private.sender_accounts a
        where a.workspace_id = v_workspace and a.owner_user_id = v_owner and a.channel = v_step ->> 'canal'
          and a.status = 'ready' and not a.reconciliation_required
        order by a.last_status_at desc
        limit 1;
        if v_sender_id is not null then
          v_at := private.place_company_entry(v_sender_id, v_workspace, v_account::uuid, v_entry_kind, v_at, v_window);
        end if;
      end if;
    end if;
    if (v_auth.document ->> 'maximoDiario') ~ '^[0-9]+$' then
      perform pg_catalog.pg_advisory_xact_lock(hashtext(v_workspace::text || ':' || v_account));
      v_at := private.account_send_slot(p_sequence_id, v_step ->> 'canal', v_at, v_window, v_auth.document, v_placed);
    end if;
    update private.sequence_step_sends set
      status = case when mode = 'auto' then 'scheduled' else 'confirmed' end,
      scheduled_for = v_at,
      claimed_until = null,
      updated_at = now()
    where id = v_send.id and status = 'waiting';
    v_placed := v_placed || v_at;
    v_first := coalesce(v_first, v_send.id);
  end loop;
  return v_first;
end;
$$;

-- Reserva: a definição de 20261019120000, mais o teto da Conta antes de escolher o lote.
create or replace function public.claim_due_step_sends(p_limit integer default 10)
returns table (send_id uuid, owner_user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_pace boolean := private.send_rate_enabled();
begin
  perform private.expire_stale_sends(null);
  if v_pace then
    perform private.rebalance_due_company_entries();
  end if;
  perform private.apply_account_send_limits();

  return query
  with eligible as (
    select e.id,
      case when v_pace then row_number() over (partition by e.workspace_id, e.owner_user_id order by e.scheduled_for, e.id) else 1 end as rn
    from private.sequence_step_sends e
    join public.sequences s on s.id = e.sequence_id and s.status = 'ativa'
    join private.sequence_authorizations a on a.id = e.authorization_id and a.revoked_at is null
    where e.channel = 'email'
      and e.status = 'scheduled' and e.scheduled_for <= private.clock_now()
      and (e.claimed_until is null or e.claimed_until < now())
  ), due as (
    select e.id from private.sequence_step_sends e
    join eligible g on g.id = e.id and g.rn = 1
    order by e.scheduled_for
    limit greatest(1, least(coalesce(p_limit, 10), 50))
    for update of e skip locked
  )
  update private.sequence_step_sends e set claimed_until = now() + interval '2 minutes'
  from due
  where e.id = due.id
  returning e.id, e.owner_user_id;
end;
$$;

create or replace function public.claim_due_chat_step_sends(p_limit integer default 10)
returns table (send_id uuid, owner_user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_pace boolean := private.send_rate_enabled();
begin
  perform private.expire_stale_sends(null);
  if v_pace then
    perform private.rebalance_due_company_entries();
  end if;
  perform private.apply_account_send_limits();

  return query
  with eligible as (
    select e.id,
      case when v_pace then row_number() over (partition by e.workspace_id, e.owner_user_id, e.channel order by e.scheduled_for, e.id) else 1 end as rn
    from private.sequence_step_sends e
    join public.sequences s on s.id = e.sequence_id and s.status = 'ativa'
    join private.sequence_authorizations a on a.id = e.authorization_id and a.revoked_at is null
    where e.channel in ('whatsapp', 'linkedin') and private.chat_channel_enabled(e.channel)
      and e.status = 'scheduled' and e.scheduled_for <= private.clock_now()
      and (e.claimed_until is null or e.claimed_until < now())
  ), due as (
    select e.id from private.sequence_step_sends e
    join eligible g on g.id = e.id and g.rn = 1
    order by e.scheduled_for
    limit greatest(1, least(coalesce(p_limit, 10), 50))
    for update of e skip locked
  )
  update private.sequence_step_sends e set claimed_until = now() + interval '2 minutes'
  from due
  where e.id = due.id
  returning e.id, e.owner_user_id;
end;
$$;

-- Ativação parcial: só os passos confirmados agora entram na autorização. Completar depois é outra chamada.
create function public.activate_sequence(p_sequence_id uuid, p_step_ids text[], p_agenda jsonb)
returns table (outcome text, step_id text, version integer, scheduled_for timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
  v_sequence public.sequences;
  v_document jsonb;
  v_steps jsonb;
  v_step jsonb;
  v_n bigint;
  v_channel text;
  v_contact public.contacts;
  v_account public.target_accounts;
  v_owner_name text;
  v_ordinal integer;
  v_destination text;
  v_phone record;
  v_subtype text;
  v_auth private.sequence_authorizations;
  v_version integer;
  v_pending jsonb := '[]'::jsonb;
  v_item jsonb;
  v_problem text;
  v_selected text[] := array[]::text[];
  v_authorized_steps jsonb := '[]'::jsonb;
  v_agenda_problem text;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  v_agenda_problem := private.confirmed_agenda_problem(p_agenda);
  if v_agenda_problem is not null then
    return query select v_agenda_problem, null::text, null::integer, null::timestamptz;
    return;
  end if;

  select s.* into v_sequence
  from public.sequences s
  join public.workspace_memberships m
    on m.workspace_id = s.workspace_id and m.user_id = v_user_id and m.active
  join public.sales_responsibilities r
    on r.workspace_id = s.workspace_id and r.target_account_id = s.target_account_id and r.owner_user_id = v_user_id
  where s.id = p_sequence_id and s.owner_user_id = v_user_id
  for update of s;
  if not found then
    raise exception 'sequence not found or not owned by active user' using errcode = '42501';
  end if;
  if v_sequence.status <> 'ativa' then
    return query select 'sequence_not_active', null::text, null::integer, null::timestamptz;
    return;
  end if;

  select d.document into v_document from private.sequence_documents d where d.sequence_id = v_sequence.id;
  v_steps := case when jsonb_typeof(v_document -> 'steps') = 'array' then v_document -> 'steps' else '[]'::jsonb end;
  if p_step_ids is null or cardinality(p_step_ids) = 0 then
    return query select 'no_steps', null::text, null::integer, null::timestamptz;
    return;
  end if;
  if v_sequence.target_account_id !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' then
    raise exception 'target account not found' using errcode = 'P0002';
  end if;

  select a.* into v_account from public.target_accounts a where a.id::text = v_sequence.target_account_id;
  select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(u.raw_user_meta_data ->> 'name'), ''), u.email)
    into v_owner_name from auth.users u where u.id = v_user_id;

  for v_step, v_n in
    select t.step, t.n from jsonb_array_elements(v_steps) with ordinality as t(step, n) order by t.n
  loop
    continue when not (v_step ->> 'id' = any (p_step_ids));
    v_channel := v_step ->> 'canal';
    continue when v_channel is null;
    continue when v_channel <> 'email'
      and not (v_channel in ('whatsapp', 'linkedin') and private.chat_channel_enabled(v_channel));
    continue when exists (
      select 1 from private.sequence_step_sends e
      where e.sequence_id = v_sequence.id and e.step_id = v_step ->> 'id' and private.send_went_out(e.status));
    v_contact := null;
    if coalesce(v_step ->> 'contatoId', '') ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' then
      select c.* into v_contact from public.contacts c
      join public.contact_account_links l
        on l.workspace_id = c.workspace_id and l.contact_id = c.id
          and l.target_account_id = v_sequence.target_account_id::uuid and l.ended_at is null
      where c.id = (v_step ->> 'contatoId')::uuid and c.workspace_id = v_sequence.workspace_id;
    end if;
    if v_contact.id is null then
      return query select 'contact_unlinked', v_step ->> 'id', null::integer, null::timestamptz;
      return;
    end if;
    if v_channel = 'email' then
      v_ordinal := private.step_destination_ordinal(v_step);
      v_destination := private.contact_email_at(v_contact.id, v_ordinal);
      if v_destination is null then
        return query select case when v_ordinal = 1 then 'contact_without_email' else 'destination_not_found' end,
          v_step ->> 'id', null::integer, null::timestamptz;
        return;
      end if;
    elsif v_channel = 'whatsapp' then
      v_ordinal := private.step_destination_ordinal(v_step);
      select p.phone, p.whatsapp into v_phone from private.contact_phone_at(v_contact.id, v_ordinal) p;
      if not found then
        return query select case when v_ordinal = 1 then 'contact_without_phone' else 'phone_not_found' end,
          v_step ->> 'id', null::integer, null::timestamptz;
        return;
      end if;
      if not v_phone.whatsapp then
        return query select 'phone_without_whatsapp', v_step ->> 'id', null::integer, null::timestamptz;
        return;
      end if;
      v_destination := v_phone.phone;
    else
      if v_contact.linkedin is null then
        return query select 'contact_without_linkedin', v_step ->> 'id', null::integer, null::timestamptz;
        return;
      end if;
      if private.linkedin_public_identifier(v_contact.linkedin) is null then
        return query select 'linkedin_profile_invalid', v_step ->> 'id', null::integer, null::timestamptz;
        return;
      end if;
      v_subtype := coalesce(v_step ->> 'subtipoLinkedIn', 'convite');
      if v_subtype not in ('convite', 'mensagem', 'inmail') then
        return query select 'invalid_linkedin_subtype', v_step ->> 'id', null::integer, null::timestamptz;
        return;
      end if;
      v_destination := v_contact.linkedin;
    end if;
    if nullif(btrim(coalesce(v_step ->> 'corpo', '')), '') is null
      and not (v_channel = 'linkedin' and v_subtype = 'convite') then
      return query select 'empty_content', v_step ->> 'id', null::integer, null::timestamptz;
      return;
    end if;
    v_problem := private.step_attachments_problem(v_sequence.id, v_user_id, v_step);
    if v_problem is not null then
      return query select v_problem, v_step ->> 'id', null::integer, null::timestamptz;
      return;
    end if;
    if v_channel = 'linkedin' and v_subtype = 'convite' and char_length(
        private.render_step_template(v_step ->> 'corpo', v_account, v_contact, v_owner_name)
      ) > private.linkedin_invite_note_limit() then
      return query select 'invite_note_too_long', v_step ->> 'id', null::integer, null::timestamptz;
      return;
    end if;
    if v_channel = 'email' and exists (
      select 1 from private.sequence_step_sends e
      where e.sequence_id = v_sequence.id and e.status = 'bounced' and e.destination = v_destination) then
      return query select 'destination_bounced', v_step ->> 'id', null::integer, null::timestamptz;
      return;
    end if;
    v_selected := array_append(v_selected, v_step ->> 'id');
    v_authorized_steps := v_authorized_steps || jsonb_build_array(v_step);
    v_pending := v_pending || jsonb_build_object('step', v_step, 'n', v_n, 'channel', v_channel,
      'contact_id', v_contact.id, 'destination', v_destination);
  end loop;

  if cardinality(v_selected) = 0 then
    return query select 'no_steps', null::text, null::integer, null::timestamptz;
    return;
  end if;

  for v_step in select value from jsonb_array_elements(v_authorized_steps) loop
    if v_step ->> 'liberacao' = 'predecessor'
      and not (v_step ->> 'predecessorId' = any (v_selected))
      and not exists (
        select 1 from private.sequence_step_sends e
        where e.sequence_id = v_sequence.id and e.step_id = v_step ->> 'predecessorId' and e.status = 'sent'
      ) then
      return query select 'predecessor_not_confirmed', v_step ->> 'id', null::integer, null::timestamptz;
      return;
    end if;
  end loop;

  foreach v_channel in array array['email', 'whatsapp', 'linkedin'] loop
    if exists (select 1 from jsonb_array_elements(v_pending) i where i ->> 'channel' = v_channel)
      and not exists (
        select 1 from private.sender_accounts a
        where a.workspace_id = v_sequence.workspace_id and a.owner_user_id = v_user_id
          and a.channel = v_channel and a.status = 'ready' and not a.reconciliation_required) then
      return query select case v_channel when 'email' then 'sender_not_ready' else v_channel || '_sender_not_ready' end,
        (select i -> 'step' ->> 'id' from jsonb_array_elements(v_pending) i
          where i ->> 'channel' = v_channel and v_channel <> 'email' limit 1),
        null::integer, null::timestamptz;
      return;
    end if;
  end loop;

  update private.sequence_authorizations set revoked_at = now(), revoked_reason = 'reactivated'
  where sequence_id = v_sequence.id and revoked_at is null;
  select coalesce(max(a.version), 0) + 1 into v_version
  from private.sequence_authorizations a where a.sequence_id = v_sequence.id;
  insert into private.sequence_authorizations (sequence_id, version, document, authorized_by)
  values (v_sequence.id, v_version, jsonb_build_object(
    'steps', v_authorized_steps,
    'janelaPadrao', p_agenda -> 'janela',
    'fuso', p_agenda ->> 'fuso',
    'diasUteis', p_agenda -> 'diasUteis',
    'maximoDiario', (p_agenda ->> 'maximoDiario')::integer,
    'intervaloMinutos', (p_agenda ->> 'intervaloMinutos')::integer
  ), v_user_id)
  returning * into v_auth;

  for v_item in select value from jsonb_array_elements(v_pending) loop
    insert into private.sequence_step_sends (
      sequence_id, workspace_id, step_id, owner_user_id, contact_id, channel, destination,
      status, authorization_id, mode, step_order
    ) values (
      v_sequence.id, v_sequence.workspace_id, v_item -> 'step' ->> 'id', v_user_id, (v_item ->> 'contact_id')::uuid,
      v_item ->> 'channel', v_item ->> 'destination', 'waiting', v_auth.id,
      case when v_item ->> 'channel' = 'email' and v_item -> 'step' ->> 'modoEmail' = 'manual' then 'manual' else 'auto' end,
      (v_item ->> 'n')::integer
    )
    on conflict (sequence_id, step_id) do update set
      contact_id = excluded.contact_id,
      channel = excluded.channel,
      destination = excluded.destination,
      status = 'waiting',
      authorization_id = excluded.authorization_id,
      mode = excluded.mode,
      step_order = excluded.step_order,
      scheduled_for = null,
      claimed_until = null,
      attempts = 0,
      confirmed_at = now(),
      last_error = null,
      last_error_at = null,
      updated_at = now()
    where not private.send_went_out(private.sequence_step_sends.status);
  end loop;

  update private.sequence_step_sends e set
    status = 'cancelled', scheduled_for = null, claimed_until = null, updated_at = now()
  where e.sequence_id = v_sequence.id and e.authorization_id is distinct from v_auth.id
    and private.send_is_cancellable(e.status);

  perform private.schedule_next_step(v_sequence.id, private.clock_now());
  return query
    select 'activated', e.step_id, v_version, e.scheduled_for
    from private.sequence_step_sends e
    where e.sequence_id = v_sequence.id and e.authorization_id = v_auth.id
      and e.step_id = any (v_selected)
    order by e.step_order;
end;
$$;

revoke all on function public.activate_sequence(uuid, text[], jsonb) from public, anon;
grant execute on function public.activate_sequence(uuid, text[], jsonb) to authenticated;

-- Liberar um passo manual não cria autorização nem troca o Destino já fixado.
create function public.release_manual_sequence_step(p_sequence_id uuid, p_step_id text)
returns table (outcome text, scheduled_for timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
  v_sequence public.sequences;
  v_auth private.sequence_authorizations;
  v_step jsonb;
  v_send private.sequence_step_sends;
  v_window jsonb;
  v_at timestamptz;
  v_tz text;
  v_days integer[];
  v_occupied timestamptz[] := array[]::timestamptz[];
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
  where s.id = p_sequence_id and s.owner_user_id = v_user_id
  for update of s;
  if not found then
    raise exception 'sequence not found or not owned by active user' using errcode = '42501';
  end if;
  if v_sequence.status <> 'ativa' then
    return query select 'sequence_not_active', null::timestamptz;
    return;
  end if;
  select a.* into v_auth from private.sequence_authorizations a
  where a.sequence_id = v_sequence.id and a.revoked_at is null;
  if not found then
    return query select 'not_authorized', null::timestamptz;
    return;
  end if;
  select st into v_step
  from jsonb_array_elements(case when jsonb_typeof(v_auth.document -> 'steps') = 'array'
    then v_auth.document -> 'steps' else '[]'::jsonb end) st
  where st ->> 'id' = p_step_id
  limit 1;
  if v_step is null or v_step ->> 'liberacao' is distinct from 'manual' then
    return query select 'not_authorized', null::timestamptz;
    return;
  end if;
  select e.* into v_send from private.sequence_step_sends e
  where e.sequence_id = v_sequence.id and e.step_id = p_step_id and e.authorization_id = v_auth.id;
  if not found or v_send.status <> 'waiting' then
    return query select 'not_authorized', null::timestamptz;
    return;
  end if;
  v_window := private.step_window(v_auth.document, v_step);
  v_tz := private.agenda_timezone(v_auth.document);
  v_days := private.agenda_weekdays(v_auth.document);
  if v_days is null then
    v_at := private.next_send_slot(private.clock_now(), private.step_delay(v_step), v_window);
  else
    v_at := private.next_send_slot(private.clock_now(), private.step_delay(v_step), v_window, v_tz, v_days);
  end if;
  if (v_auth.document ->> 'maximoDiario') ~ '^[0-9]+$' then
    perform pg_catalog.pg_advisory_xact_lock(hashtext(v_sequence.workspace_id::text || ':' || v_sequence.target_account_id));
    select coalesce(array_agg(coalesce(e.sent_at, e.scheduled_for)), array[]::timestamptz[])
      into v_occupied
    from private.sequence_step_sends e
    join public.sequences s on s.id = e.sequence_id
    where s.workspace_id = v_sequence.workspace_id and s.target_account_id = v_sequence.target_account_id
      and e.id <> v_send.id
      and coalesce(e.sent_at, e.scheduled_for) is not null
      and (
        e.status in ('sent', 'sending', 'uncertain')
        or (e.status in ('scheduled', 'confirmed') and (e.claimed_until >= now() or e.scheduled_for > private.clock_now()))
      );
    v_at := private.account_send_slot(v_sequence.id, v_send.channel, v_at, v_window, v_auth.document, v_occupied);
  end if;
  update private.sequence_step_sends set
    status = case when mode = 'auto' then 'scheduled' else 'confirmed' end,
    scheduled_for = v_at,
    claimed_until = null,
    updated_at = now()
  where id = v_send.id and status = 'waiting'
  returning * into v_send;
  return query select 'released', v_send.scheduled_for;
end;
$$;

revoke all on function public.release_manual_sequence_step(uuid, text) from public, anon;
grant execute on function public.release_manual_sequence_step(uuid, text) to authenticated;

-- Entrada e entrega do WhatsApp (canais-07). Toda operação é server-side, pelo adaptador configurado para o simulador
-- em desenvolvimento ou para a Cloud API explicitamente habilitada.

create table private.whatsapp_channel_events (
  event_id text primary key check (length(event_id) between 1 and 200),
  received_at timestamptz not null default now()
);
alter table private.whatsapp_channel_events enable row level security;
revoke all on private.whatsapp_channel_events from public, anon, authenticated, service_role;

create table private.whatsapp_unknown_replies (
  phone_hash text not null,
  reply_day date not null default (timezone('America/Sao_Paulo', now()))::date,
  created_at timestamptz not null default now(),
  primary key (phone_hash, reply_day)
);
alter table private.whatsapp_unknown_replies enable row level security;
revoke all on private.whatsapp_unknown_replies from public, anon, authenticated, service_role;

create table private.whatsapp_message_statuses (
  message_id text primary key,
  status text not null,
  updated_at timestamptz not null,
  pricing jsonb,
  counted_at timestamptz
);
alter table private.whatsapp_message_statuses enable row level security;
revoke all on private.whatsapp_message_statuses from public, anon, authenticated, service_role;

create table private.whatsapp_monthly_usage (
  month date primary key,
  service_responses integer not null default 0 check (service_responses >= 0),
  templates integer not null default 0 check (templates >= 0),
  updated_at timestamptz not null default now()
);
alter table private.whatsapp_monthly_usage enable row level security;
revoke all on private.whatsapp_monthly_usage from public, anon, authenticated, service_role;

create table private.whatsapp_last_inbound (
  phone_hash text primary key,
  received_at timestamptz not null
);
alter table private.whatsapp_last_inbound enable row level security;
revoke all on private.whatsapp_last_inbound from public, anon, authenticated, service_role;

create table private.whatsapp_pending_answers (
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid not null references private.agent_runs(id) on delete cascade,
  answer text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, run_id)
);
create index whatsapp_pending_answers_queue_idx on private.whatsapp_pending_answers (user_id, created_at, run_id);
alter table private.whatsapp_pending_answers enable row level security;
revoke all on private.whatsapp_pending_answers from public, anon, authenticated, service_role;

alter table private.user_channel_notice_preferences
  add column stopped boolean not null default false;

create table private.whatsapp_channel_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  awaiting_workspace boolean not null default false,
  new_conversation boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table private.whatsapp_channel_sessions enable row level security;
revoke all on private.whatsapp_channel_sessions from public, anon, authenticated, service_role;

create function public.get_whatsapp_channel_session(p_user_id uuid)
returns table (workspace_id uuid, awaiting_workspace boolean, new_conversation boolean)
language sql stable security definer set search_path = '' as $$
  select s.workspace_id, s.awaiting_workspace, s.new_conversation from private.whatsapp_channel_sessions s where s.user_id = p_user_id
$$;

create function public.set_whatsapp_channel_session(p_user_id uuid, p_workspace_id uuid, p_awaiting_workspace boolean, p_new_conversation boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into private.whatsapp_channel_sessions(user_id, workspace_id, awaiting_workspace, new_conversation)
  values (p_user_id, p_workspace_id, coalesce(p_awaiting_workspace, false), coalesce(p_new_conversation, false))
  on conflict (user_id) do update set workspace_id = excluded.workspace_id, awaiting_workspace = excluded.awaiting_workspace,
    new_conversation = excluded.new_conversation, updated_at = now();
end; $$;

create function public.claim_whatsapp_channel_event(p_event_id text, p_phone text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_claimed boolean;
begin
  if p_event_id is null or btrim(p_event_id) = '' then raise exception 'event id is required' using errcode = '22023'; end if;
  insert into private.whatsapp_channel_events(event_id) values (p_event_id) on conflict do nothing;
  v_claimed := found;
  if v_claimed and coalesce(p_phone, '') ~ '^[0-9]{8,15}$' then
    insert into private.whatsapp_last_inbound(phone_hash, received_at)
    values (encode(extensions.digest(p_phone, 'sha256'), 'hex'), now())
    on conflict (phone_hash) do update set received_at = excluded.received_at;
  end if;
  return v_claimed;
end; $$;

create function public.claim_whatsapp_pending_answer(p_user_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_answer text;
begin
  with next_answer as (
    select user_id, run_id from private.whatsapp_pending_answers
    where user_id = p_user_id order by created_at, run_id for update skip locked limit 1
  )
  delete from private.whatsapp_pending_answers p using next_answer n
  where p.user_id = n.user_id and p.run_id = n.run_id returning p.answer into v_answer;
  return v_answer;
end; $$;

create function public.record_whatsapp_channel_status(p_message_id text, p_status text, p_updated_at timestamptz, p_pricing jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_counted boolean;
begin
  insert into private.whatsapp_message_statuses(message_id, status, updated_at, pricing)
  values (p_message_id, p_status, p_updated_at, p_pricing)
  on conflict (message_id) do update set status = excluded.status, updated_at = excluded.updated_at,
    pricing = coalesce(excluded.pricing, private.whatsapp_message_statuses.pricing);
  if coalesce(p_pricing ->> 'billable', 'false') = 'true' then
    update private.whatsapp_message_statuses set counted_at = now()
    where message_id = p_message_id and counted_at is null returning true into v_counted;
    if coalesce(v_counted, false) then
      insert into private.whatsapp_monthly_usage(month, service_responses, templates)
      values (date_trunc('month', now())::date,
        case when p_pricing ->> 'category' = 'service' then 1 else 0 end,
        case when p_pricing ->> 'category' in ('authentication', 'utility', 'marketing') then 1 else 0 end)
      on conflict (month) do update set
        service_responses = private.whatsapp_monthly_usage.service_responses + excluded.service_responses,
        templates = private.whatsapp_monthly_usage.templates + excluded.templates,
        updated_at = now();
    end if;
  end if;
end; $$;

create function public.whatsapp_channel_account_by_phone(p_phone text)
returns uuid language sql stable security definer set search_path = '' as $$
  select p.user_id
  from private.user_channel_phones p
  join auth.users u on u.id = p.user_id
  where p.phone_e164 = '+' || regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')
    and p.verified_at is not null
    and u.last_sign_in_at >= now() - interval '30 days'
  limit 1
$$;

create function public.whatsapp_channel_eligible_workspaces(p_user_id uuid)
returns table (workspace_id uuid, workspace_name text)
language sql stable security definer set search_path = '' as $$
  select m.workspace_id, w.name
  from public.workspace_memberships m
  join public.workspaces w on w.id = m.workspace_id
  join private.whatsapp_channel_settings c on c.workspace_id = m.workspace_id and c.enabled
  where m.user_id = p_user_id and m.active
    and private.automation_contract_block(m.workspace_id) is null
  order by w.name, m.workspace_id
$$;

create function public.whatsapp_channel_notice_stopped(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.stopped from private.user_channel_notice_preferences p where p.user_id = p_user_id), false)
$$;

create function public.set_whatsapp_channel_notices_stopped(p_user_id uuid, p_stopped boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  insert into private.user_channel_notice_preferences(user_id, stopped)
  values (p_user_id, coalesce(p_stopped, false))
  on conflict (user_id) do update set stopped = excluded.stopped, updated_at = now();
  return coalesce(p_stopped, false);
end; $$;

create function public.claim_whatsapp_unknown_reply(p_phone text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_hash text;
begin
  if coalesce(p_phone, '') !~ '^[0-9]{8,15}$' then return false; end if;
  v_hash := encode(extensions.digest(p_phone, 'sha256'), 'hex');
  insert into private.whatsapp_unknown_replies(phone_hash)
  values (v_hash) on conflict do nothing;
  return found;
end; $$;

create function public.start_channel_run(
  p_workspace_id uuid, p_user_id uuid, p_text text, p_event_id text, p_new_conversation boolean default false
) returns table (conversation_id uuid, run_id uuid, status text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_text text := btrim(coalesce(p_text, ''));
  v_request uuid;
  v_conversation_id uuid;
  v_run_id uuid;
  v_workspace_name text;
begin
  if p_event_id is null or btrim(p_event_id) = '' then raise exception 'event id is required' using errcode = '22023'; end if;
  if p_user_id is null or not exists (
    select 1 from public.workspace_memberships m where m.workspace_id = p_workspace_id and m.user_id = p_user_id and m.active
  ) then raise exception 'active workspace membership required' using errcode = '42501'; end if;
  if not exists (select 1 from private.whatsapp_channel_settings s where s.workspace_id = p_workspace_id and s.enabled)
    or private.automation_contract_block(p_workspace_id) is not null
    or not exists (select 1 from private.user_channel_phones p join auth.users u on u.id = p.user_id
      where p.user_id = p_user_id and p.phone_e164 is not null and p.verified_at is not null
        and u.last_sign_in_at >= now() - interval '30 days') then
    raise exception 'whatsapp channel is not eligible' using errcode = '42501';
  end if;
  if length(v_text) not between 1 and 4000 then raise exception 'invalid request text' using errcode = '22023'; end if;
  v_request := md5('whatsapp:' || p_event_id)::uuid;
  return query select r.conversation_id, r.id, r.status from private.agent_runs r
    where r.requested_by = p_user_id and r.client_request_id = v_request and r.workspace_id = p_workspace_id;
  if found then return; end if;

  perform pg_advisory_xact_lock(hashtext('whatsapp_conversation:' || p_workspace_id::text || ':' || p_user_id::text));
  perform private.expire_run_if_stale(r.id)
  from private.agent_runs r join private.agent_conversations c on c.id = r.conversation_id
  where c.workspace_id = p_workspace_id and c.owner_id = p_user_id and c.origin = 'whatsapp'
    and r.status in ('queued', 'running');
  if exists (
    select 1 from private.agent_runs r join private.agent_conversations c on c.id = r.conversation_id
    where c.workspace_id = p_workspace_id and c.owner_id = p_user_id and c.origin = 'whatsapp'
      and r.status in ('queued', 'running')
  ) then raise exception 'conversation busy' using errcode = '55006'; end if;
  if not coalesce(p_new_conversation, false) then
    select c.id into v_conversation_id from private.agent_conversations c
    where c.workspace_id = p_workspace_id and c.owner_id = p_user_id and c.origin = 'whatsapp'
      and c.kind = 'coordenada' and c.updated_at >= now() - interval '4 hours'
    order by c.updated_at desc limit 1 for update;
  end if;
  if v_conversation_id is not null and exists (
    select 1 from private.agent_runs r where r.conversation_id = v_conversation_id and r.status in ('queued', 'running')
      and private.expire_run_if_stale(r.id)
  ) then raise exception 'conversation busy' using errcode = '55006'; end if;
  if v_conversation_id is null then
    insert into private.agent_conversations(workspace_id, owner_id, kind, origin)
    values (p_workspace_id, p_user_id, 'coordenada', 'whatsapp') returning id into v_conversation_id;
  end if;
  select w.name into v_workspace_name from public.workspaces w where w.id = p_workspace_id;
  insert into private.agent_runs(workspace_id, conversation_id, requested_by, client_request_id, request_text, trigger_kind)
  values (p_workspace_id, v_conversation_id, p_user_id, v_request,
    'Workspace: ' || v_workspace_name || E'\n\n' || v_text, 'canal') returning id into v_run_id;
  update private.agent_conversations c set updated_at = clock_timestamp() where c.id = v_conversation_id;
  return query select v_conversation_id, v_run_id, 'queued'::text;
end; $$;

create function public.claim_whatsapp_channel_delivery(p_run_id uuid)
returns table (status text, error_code text, answer text, phone text, within_window boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v_run private.agent_runs%rowtype; v_phone text; v_answer text; v_within_window boolean;
begin
  select * into v_run from private.agent_runs r where r.id = p_run_id for update;
  if not found or v_run.trigger_kind <> 'canal' or v_run.status not in ('succeeded', 'failed')
    or v_run.channel_posted_at is not null or v_run.channel_delivery_failed_at is not null
    or (v_run.channel_delivered_at is not null and v_run.channel_delivered_at > now() - interval '2 minutes')
    or not exists (select 1 from private.agent_conversations c where c.id = v_run.conversation_id and c.origin = 'whatsapp') then
    return;
  end if;
  select p.phone_e164 into v_phone from private.user_channel_phones p
  where p.user_id = v_run.requested_by and p.phone_e164 is not null and p.verified_at is not null;
  if v_phone is null or not exists (select 1 from private.whatsapp_channel_settings s where s.workspace_id = v_run.workspace_id and s.enabled) then
    update private.agent_runs r set channel_delivery_failed_at = now(), channel_delivery_error = 'canal_indisponivel' where r.id = p_run_id;
    return;
  end if;
  select i.received_at >= now() - interval '24 hours' into v_within_window
  from private.whatsapp_last_inbound i
  where i.phone_hash = encode(extensions.digest(regexp_replace(v_phone, '\\D', '', 'g'), 'sha256'), 'hex');
  v_within_window := coalesce(v_within_window, false);
  if v_run.status = 'failed' then
    select case coalesce(e.payload ->> 'motivo', v_run.error_code)
      when 'insufficient_credits' then 'Não foi possível responder: o Workspace está sem Créditos para este pedido, ou você chegou ao seu limite do mês. Avise o Administrador.'
      when 'contrato_inativo' then 'Não foi possível responder: este Workspace está sem contrato ativo na Althius.'
      when 'membership_inactive' then 'Não foi possível responder: você não participa mais deste Workspace.'
      when 'timeout' then 'O pedido passou do tempo e foi interrompido, sem resposta. Tente de novo.'
      else 'Não consegui terminar a resposta a este pedido. Tente de novo em instantes.'
    end into v_answer
    from private.agent_run_events e where e.run_id = p_run_id and e.kind = 'falha'
    order by e.seq desc limit 1;
    v_answer := coalesce(v_answer, 'Não consegui terminar a resposta a este pedido. Tente de novo em instantes.');
  else
    select string_agg(e.payload ->> 'texto', E'\n\n' order by e.seq) into v_answer
    from private.agent_run_events e where e.run_id = p_run_id and e.kind in ('texto', 'resposta')
      and coalesce(e.payload ->> 'texto', '') <> '';
  end if;
  if not v_within_window and v_answer is not null then
    insert into private.whatsapp_pending_answers(user_id, run_id, answer)
    values (v_run.requested_by, p_run_id, v_answer)
    on conflict (user_id, run_id) do update set answer = excluded.answer, created_at = now();
  end if;
  update private.agent_runs r set channel_delivered_at = now(), channel_delivery_attempts = r.channel_delivery_attempts + 1 where r.id = p_run_id;
  return query select v_run.status, v_run.error_code, case when v_within_window then v_answer else null end,
    v_phone, v_within_window;
end; $$;

create function public.confirm_whatsapp_channel_delivery(p_run_id uuid)
returns boolean language sql security definer set search_path = '' as $$
  update private.agent_runs r set channel_posted_at = now(), channel_delivery_error = null
  where r.id = p_run_id and r.trigger_kind = 'canal' and r.channel_posted_at is null
    and exists (select 1 from private.agent_conversations c where c.id = r.conversation_id and c.origin = 'whatsapp')
  returning true
$$;

create function public.fail_whatsapp_channel_delivery(p_run_id uuid, p_error text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_run private.agent_runs%rowtype;
begin
  select * into v_run from private.agent_runs r where r.id = p_run_id for update;
  if not found or v_run.channel_posted_at is not null or v_run.channel_delivery_failed_at is not null
    or not exists (select 1 from private.agent_conversations c where c.id = v_run.conversation_id and c.origin = 'whatsapp') then return 'nada'; end if;
  if v_run.channel_delivery_attempts >= 5 then
    update private.agent_runs set channel_delivery_failed_at = now(), channel_delivery_error = left(coalesce(p_error, 'desconhecido'), 100) where id = p_run_id;
    return 'desistiu';
  end if;
  update private.agent_runs set channel_delivered_at = null, channel_delivery_error = left(coalesce(p_error, 'desconhecido'), 100) where id = p_run_id;
  return 'nova_tentativa';
end; $$;

create function private.whatsapp_channel_delivery_target()
returns table (url text, secret text) language sql stable security definer set search_path = '' as $$
  select private.integration_secret_get('whatsapp_channel_delivery_url'), private.integration_secret_get('whatsapp_channel_delivery_secret')
$$;

create function private.retry_whatsapp_channel_deliveries()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text; v_run_id uuid; v_count integer := 0;
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'net' and p.proname = 'http_post') then return 0; end if;
  select t.url, t.secret into v_url, v_secret from private.whatsapp_channel_delivery_target() t;
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then return 0; end if;
  for v_run_id in
    select r.id from private.agent_runs r join private.agent_conversations c on c.id = r.conversation_id
    where r.trigger_kind = 'canal' and c.origin = 'whatsapp' and r.status in ('succeeded', 'failed')
      and r.channel_posted_at is null and r.channel_delivery_failed_at is null
      and (r.channel_delivered_at is null or r.channel_delivered_at <= now() - interval '2 minutes')
      and r.finished_at between now() - interval '1 day' and now() - interval '1 minute'
    order by r.finished_at limit 100
  loop
    begin
      execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 10000)'
      using v_url, jsonb_build_object('run_id', v_run_id),
        jsonb_build_object('Content-Type', 'application/json', 'x-whatsapp-delivery-secret', v_secret);
      v_count := v_count + 1;
    exception when others then raise warning 'whatsapp channel delivery retry not requested for run %: %', v_run_id, sqlstate; end;
  end loop;
  return v_count;
end; $$;

create or replace function private.notify_slack_channel_delivery()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  if not exists (select 1 from private.agent_conversations c where c.id = new.conversation_id and c.origin = 'slack') then return null; end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'net' and p.proname = 'http_post') then return null; end if;
  select t.url, t.secret into v_url, v_secret from private.slack_channel_delivery_target() t;
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then return null; end if;
  begin
    execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 10000)'
    using v_url, jsonb_build_object('run_id', new.id), jsonb_build_object('Content-Type', 'application/json', 'x-slack-delivery-secret', v_secret);
  exception when others then raise warning 'slack channel delivery not requested for run %: %', new.id, sqlstate; end;
  return null;
end; $$;

create function private.notify_whatsapp_channel_delivery()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  if not exists (select 1 from private.agent_conversations c where c.id = new.conversation_id and c.origin = 'whatsapp') then return null; end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'net' and p.proname = 'http_post') then return null; end if;
  select t.url, t.secret into v_url, v_secret from private.whatsapp_channel_delivery_target() t;
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then return null; end if;
  begin
    execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 10000)'
    using v_url, jsonb_build_object('run_id', new.id), jsonb_build_object('Content-Type', 'application/json', 'x-whatsapp-delivery-secret', v_secret);
  exception when others then raise warning 'whatsapp channel delivery not requested for run %: %', new.id, sqlstate; end;
  return null;
end; $$;

drop trigger if exists agent_runs_whatsapp_channel_delivery on private.agent_runs;
create trigger agent_runs_whatsapp_channel_delivery after update of status on private.agent_runs
  for each row when (new.trigger_kind = 'canal' and new.status in ('succeeded', 'failed') and old.status is distinct from new.status)
  execute function private.notify_whatsapp_channel_delivery();

revoke all on function public.claim_whatsapp_channel_event(text, text) from public, anon, authenticated;
revoke all on function public.claim_whatsapp_pending_answer(uuid) from public, anon, authenticated;
revoke all on function public.get_whatsapp_channel_session(uuid) from public, anon, authenticated;
revoke all on function public.set_whatsapp_channel_session(uuid, uuid, boolean, boolean) from public, anon, authenticated;
revoke all on function public.record_whatsapp_channel_status(text, text, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.whatsapp_channel_account_by_phone(text) from public, anon, authenticated;
revoke all on function public.whatsapp_channel_eligible_workspaces(uuid) from public, anon, authenticated;
revoke all on function public.whatsapp_channel_notice_stopped(uuid) from public, anon, authenticated;
revoke all on function public.set_whatsapp_channel_notices_stopped(uuid, boolean) from public, anon, authenticated;
revoke all on function public.claim_whatsapp_unknown_reply(text) from public, anon, authenticated;
revoke all on function public.start_channel_run(uuid, uuid, text, text, boolean) from public, anon, authenticated;
revoke all on function public.claim_whatsapp_channel_delivery(uuid) from public, anon, authenticated;
revoke all on function public.confirm_whatsapp_channel_delivery(uuid) from public, anon, authenticated;
revoke all on function public.fail_whatsapp_channel_delivery(uuid, text) from public, anon, authenticated;
revoke all on function private.whatsapp_channel_delivery_target() from public, anon, authenticated, service_role;
revoke all on function private.retry_whatsapp_channel_deliveries() from public, anon, authenticated, service_role;
revoke all on function private.notify_slack_channel_delivery() from public, anon, authenticated, service_role;
revoke all on function private.notify_whatsapp_channel_delivery() from public, anon, authenticated, service_role;
grant execute on function public.claim_whatsapp_channel_event(text, text) to service_role;
grant execute on function public.claim_whatsapp_pending_answer(uuid) to service_role;
grant execute on function public.get_whatsapp_channel_session(uuid) to service_role;
grant execute on function public.set_whatsapp_channel_session(uuid, uuid, boolean, boolean) to service_role;
grant execute on function public.whatsapp_channel_account_by_phone(text) to service_role;
grant execute on function public.whatsapp_channel_eligible_workspaces(uuid) to service_role;
grant execute on function public.whatsapp_channel_notice_stopped(uuid) to service_role;
grant execute on function public.set_whatsapp_channel_notices_stopped(uuid, boolean) to service_role;
grant execute on function public.claim_whatsapp_unknown_reply(text) to service_role;
grant execute on function public.start_channel_run(uuid, uuid, text, text, boolean) to service_role;
grant execute on function public.claim_whatsapp_channel_delivery(uuid) to service_role;
grant execute on function public.confirm_whatsapp_channel_delivery(uuid) to service_role;
grant execute on function public.fail_whatsapp_channel_delivery(uuid, text) to service_role;

do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('althius-whatsapp-channel-delivery-retry', '*/2 * * * *', 'select private.retry_whatsapp_channel_deliveries()');
  end if;
end
$cron$;

grant execute on function public.record_whatsapp_channel_status(text, text, timestamptz, jsonb) to service_role;

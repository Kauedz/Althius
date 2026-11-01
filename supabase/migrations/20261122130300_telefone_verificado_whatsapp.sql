-- Telefone verificado da Conta de usuário para reconhecer a pessoa no Canal WhatsApp.
create extension if not exists pgcrypto with schema extensions;

create table private.user_channel_phones (
  user_id uuid primary key references auth.users(id) on delete cascade,
  phone_e164 text unique,
  pending_phone_e164 text unique,
  verification_hash text,
  verification_salt text,
  verification_expires_at timestamptz,
  attempts integer not null default 0 check (attempts between 0 and 5),
  requests_count integer not null default 1,
  requests_window_started_at timestamptz not null default now(),
  resends integer not null default 0,
  resend_window_started_at timestamptz,
  verified_at timestamptz,
  email_notification_pending boolean not null default false,
  updated_at timestamptz not null default now(),
  check ((pending_phone_e164 is null) = (verification_hash is null)),
  check ((pending_phone_e164 is null) = (verification_salt is null))
);
alter table private.user_channel_phones enable row level security;
revoke all on private.user_channel_phones from public, anon, authenticated;

create function public.get_my_channel_phone()
returns table (phone_e164 text, verified_at timestamptz, suspended boolean, email_pending boolean)
language sql stable security definer set search_path = '' as $$
  select p.phone_e164, p.verified_at, p.phone_e164 is not null and coalesce(u.last_sign_in_at < now() - interval '30 days', true), coalesce(p.email_notification_pending, false)
  from (select auth.uid() as user_id) me
  left join private.user_channel_phones p on p.user_id = me.user_id
  left join auth.users u on u.id = me.user_id
  where me.user_id is not null;
$$;

create function public.get_my_channel_phone_pending(p_user_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select pending_phone_e164 from private.user_channel_phones where user_id = p_user_id;
$$;

-- Essas RPCs só são chamadas pelo backend depois de validar o JWT da sessão.
create function public.start_my_channel_phone_verification(p_user_id uuid, p_phone_e164 text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_code text; v_salt text; v_last_login timestamptz; v_requests integer; v_window timestamptz;
begin
  -- Serializa novos pedidos da Conta antes de a linha de telefone existir, sem bloquear outros usuários.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 1));
  select last_sign_in_at into v_last_login from auth.users where id = p_user_id;
  if not found then raise exception 'Conta inválida' using errcode = '42501'; end if;
  if coalesce(v_last_login, '-infinity'::timestamptz) < now() - interval '30 days' then raise exception 'recent login required' using errcode = '42501'; end if;
  if p_phone_e164 !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'invalid phone' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_phone_e164, 0));
  if exists(select 1 from private.user_channel_phones where user_id <> p_user_id and (phone_e164 = p_phone_e164 or pending_phone_e164 = p_phone_e164)) then
    raise exception 'phone already used' using errcode = '23505';
  end if;
  select requests_count, requests_window_started_at into v_requests, v_window
  from private.user_channel_phones where user_id = p_user_id for update;
  if found and v_window > now() - interval '1 hour' and v_requests >= 3 then
    raise exception 'verification request limit reached' using errcode = '22023';
  end if;
  v_code := lpad((('x' || substring(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6))::bit(24)::integer % 1000000)::text, 6, '0');
  v_salt := gen_random_uuid()::text;
  insert into private.user_channel_phones(user_id, pending_phone_e164, verification_hash, verification_salt, verification_expires_at, attempts, resends, resend_window_started_at)
  values (p_user_id, p_phone_e164, encode(extensions.digest(v_salt || ':' || v_code, 'sha256'), 'hex'), v_salt, now() + interval '10 minutes', 0, 0, now())
  on conflict (user_id) do update set pending_phone_e164 = excluded.pending_phone_e164,
    verification_hash = excluded.verification_hash, verification_salt = excluded.verification_salt, verification_expires_at = excluded.verification_expires_at,
    attempts = 0, resends = 0, resend_window_started_at = now(),
    requests_count = case when v_window > now() - interval '1 hour' then v_requests + 1 else 1 end,
    requests_window_started_at = case when v_window > now() - interval '1 hour' then v_window else now() end,
    updated_at = now();
  return v_code;
end; $$;

create function public.resend_my_channel_phone_verification(p_user_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_code text; v_pending text; v_count integer; v_started timestamptz; v_salt text; v_last_login timestamptz;
begin
  select pending_phone_e164, resends, resend_window_started_at into v_pending, v_count, v_started
  from private.user_channel_phones where user_id = p_user_id for update;
  if v_pending is null then raise exception 'verification unavailable' using errcode = '22023'; end if;
  select last_sign_in_at into v_last_login from auth.users where id = p_user_id;
  if coalesce(v_last_login, '-infinity'::timestamptz) < now() - interval '30 days' then raise exception 'recent login required' using errcode = '42501'; end if;
  if v_started > now() - interval '1 hour' and v_count >= 3 then raise exception 'resend limit reached' using errcode = '22023'; end if;
  v_code := lpad((('x' || substring(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6))::bit(24)::integer % 1000000)::text, 6, '0');
  v_salt := gen_random_uuid()::text;
  update private.user_channel_phones set verification_hash = encode(extensions.digest(v_salt || ':' || v_code, 'sha256'), 'hex'),
    verification_salt = v_salt,
    verification_expires_at = now() + interval '10 minutes', attempts = 0,
    resends = case when v_started > now() - interval '1 hour' then resends + 1 else 1 end,
    resend_window_started_at = case when v_started > now() - interval '1 hour' then resend_window_started_at else now() end,
    updated_at = now() where user_id = p_user_id;
  return v_code;
end; $$;

create function public.change_my_channel_phone(p_user_id uuid, p_phone_e164 text)
returns text language sql security definer set search_path = '' as $$
  select public.start_my_channel_phone_verification(p_user_id, p_phone_e164);
$$;

create function public.confirm_my_channel_phone(p_user_id uuid, p_code text)
returns table (phone_e164 text, email text) language plpgsql security definer set search_path = '' as $$
declare v_row private.user_channel_phones%rowtype; v_email text;
begin
  select * into v_row from private.user_channel_phones where user_id = p_user_id for update;
  if v_row.pending_phone_e164 is null or v_row.verification_expires_at < now() or v_row.attempts >= 5 then
    raise exception 'verification expired' using errcode = '22023';
  end if;
  if p_code !~ '^[0-9]{6}$' or encode(extensions.digest(v_row.verification_salt || ':' || p_code, 'sha256'), 'hex') <> v_row.verification_hash then
    update private.user_channel_phones set attempts = attempts + 1 where user_id = p_user_id;
    return;
  end if;
  update private.user_channel_phones set phone_e164 = pending_phone_e164, pending_phone_e164 = null,
    verification_hash = null, verification_salt = null, verification_expires_at = null, attempts = 0, verified_at = now(), email_notification_pending = true, updated_at = now()
  where user_id = p_user_id;
  select u.email::text into v_email from auth.users u where u.id = p_user_id;
  return query select v_row.pending_phone_e164, v_email;
end; $$;

create function public.get_my_channel_phone_verification_email(p_user_id uuid)
returns table (phone_e164 text, email text) language sql stable security definer set search_path = '' as $$
  select p.phone_e164, u.email::text from private.user_channel_phones p join auth.users u on u.id = p.user_id
  where p.user_id = p_user_id and p.email_notification_pending;
$$;

create function public.mark_my_channel_phone_email_sent(p_user_id uuid)
returns void language sql security definer set search_path = '' as $$
  update private.user_channel_phones set email_notification_pending = false, updated_at = now()
  where user_id = p_user_id and email_notification_pending;
$$;

create function public.remove_my_channel_phone(p_user_id uuid)
returns void language sql security definer set search_path = '' as $$
  delete from private.user_channel_phones where user_id = p_user_id;
$$;

revoke all on function public.get_my_channel_phone() from public, anon;
revoke all on function public.get_my_channel_phone_pending(uuid) from public, anon, authenticated;
revoke all on function public.start_my_channel_phone_verification(uuid, text) from public, anon, authenticated;
revoke all on function public.resend_my_channel_phone_verification(uuid) from public, anon, authenticated;
revoke all on function public.change_my_channel_phone(uuid, text) from public, anon, authenticated;
revoke all on function public.confirm_my_channel_phone(uuid, text) from public, anon, authenticated;
revoke all on function public.remove_my_channel_phone(uuid) from public, anon, authenticated;
revoke all on function public.get_my_channel_phone_verification_email(uuid) from public, anon, authenticated;
revoke all on function public.mark_my_channel_phone_email_sent(uuid) from public, anon, authenticated;
grant execute on function public.get_my_channel_phone() to authenticated;
grant execute on function public.get_my_channel_phone_pending(uuid) to service_role;
grant execute on function public.start_my_channel_phone_verification(uuid, text) to service_role;
grant execute on function public.resend_my_channel_phone_verification(uuid) to service_role;
grant execute on function public.change_my_channel_phone(uuid, text) to service_role;
grant execute on function public.confirm_my_channel_phone(uuid, text) to service_role;
grant execute on function public.remove_my_channel_phone(uuid) to service_role;
grant execute on function public.get_my_channel_phone_verification_email(uuid) to service_role;
grant execute on function public.mark_my_channel_phone_email_sent(uuid) to service_role;

-- Preferências proativas são da Conta de usuário e independem do número verificado.
create table private.user_channel_notice_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferences jsonb not null default '{"resposta_lead":false,"aprovacao_pendente":false,"rotina_terminada":false,"sinal_novo":false,"sequencia_pausada":false,"creditos_baixos":false}'::jsonb,
  updated_at timestamptz not null default now(),
  check (preferences ?& array['resposta_lead','aprovacao_pendente','rotina_terminada','sinal_novo','sequencia_pausada','creditos_baixos'])
);
alter table private.user_channel_notice_preferences enable row level security;
revoke all on private.user_channel_notice_preferences from public, anon, authenticated;

create function public.get_my_channel_notice_preferences()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select preferences from private.user_channel_notice_preferences where user_id = auth.uid()),
    '{"resposta_lead":false,"aprovacao_pendente":false,"rotina_terminada":false,"sinal_novo":false,"sequencia_pausada":false,"creditos_baixos":false}'::jsonb)
  where auth.uid() is not null;
$$;

create function public.save_my_channel_notice_preferences(p_preferences jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_preferences jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_preferences is null or jsonb_typeof(p_preferences) <> 'object' or p_preferences = '{}'::jsonb
    or exists(select 1 from jsonb_each(p_preferences) where key not in ('resposta_lead','aprovacao_pendente','rotina_terminada','sinal_novo','sequencia_pausada','creditos_baixos') or jsonb_typeof(value) <> 'boolean')
  then raise exception 'invalid channel notice preferences' using errcode = '22023'; end if;
  insert into private.user_channel_notice_preferences(user_id, preferences)
  values (auth.uid(), '{"resposta_lead":false,"aprovacao_pendente":false,"rotina_terminada":false,"sinal_novo":false,"sequencia_pausada":false,"creditos_baixos":false}'::jsonb || p_preferences)
  on conflict (user_id) do update set preferences = private.user_channel_notice_preferences.preferences || excluded.preferences, updated_at = now()
  returning preferences into v_preferences;
  return v_preferences;
end; $$;

revoke all on function public.get_my_channel_notice_preferences() from public, anon;
revoke all on function public.save_my_channel_notice_preferences(jsonb) from public, anon;
grant execute on function public.get_my_channel_notice_preferences() to authenticated;
grant execute on function public.save_my_channel_notice_preferences(jsonb) to authenticated;

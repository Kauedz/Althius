-- Rate limits do webhook e teto por Workspace; conteúdo de mensagens não entra na trilha de atividade.
create table private.whatsapp_channel_security_limits (
  singleton boolean primary key default true check (singleton),
  messages_per_10m integer not null default 20 check (messages_per_10m > 0),
  messages_per_day integer not null default 200 check (messages_per_day > 0),
  runs_per_workspace_hour integer not null default 20 check (runs_per_workspace_hour > 0),
  updated_at timestamptz not null default now()
);
insert into private.whatsapp_channel_security_limits(singleton) values (true);
alter table private.whatsapp_channel_security_limits enable row level security;
revoke all on private.whatsapp_channel_security_limits from public, anon, authenticated;
grant select, update on private.whatsapp_channel_security_limits to service_role;

create table private.whatsapp_channel_inbound_rates (
  phone_hash text not null,
  received_at timestamptz not null default now()
);
create index whatsapp_channel_inbound_rates_lookup on private.whatsapp_channel_inbound_rates(phone_hash, received_at desc);
alter table private.whatsapp_channel_inbound_rates enable row level security;
revoke all on private.whatsapp_channel_inbound_rates from public, anon, authenticated, service_role;

create function public.set_whatsapp_channel_security_limits(
  p_messages_per_10m integer,
  p_messages_per_day integer,
  p_runs_per_workspace_hour integer
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_messages_per_10m not between 1 and 10000 or p_messages_per_day not between 1 and 100000
    or p_runs_per_workspace_hour not between 1 and 10000 then
    raise exception 'invalid WhatsApp channel limits' using errcode = '22023';
  end if;
  update private.whatsapp_channel_security_limits set
    messages_per_10m = p_messages_per_10m,
    messages_per_day = p_messages_per_day,
    runs_per_workspace_hour = p_runs_per_workspace_hour,
    updated_at = now()
  where singleton;
end; $$;
revoke all on function public.set_whatsapp_channel_security_limits(integer, integer, integer) from public, anon, authenticated;
grant execute on function public.set_whatsapp_channel_security_limits(integer, integer, integer) to service_role;

create function public.claim_whatsapp_channel_message(p_phone text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_hash text;
  v_per_10m integer;
  v_per_day integer;
  v_today timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
begin
  if coalesce(p_phone, '') !~ '^[0-9]{8,15}$' then return false; end if;
  v_hash := encode(extensions.digest(p_phone, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('whatsapp_rate:' || v_hash, 0));
  select messages_per_10m, messages_per_day into v_per_10m, v_per_day
  from private.whatsapp_channel_security_limits where singleton;
  if (select count(*) from private.whatsapp_channel_inbound_rates where phone_hash = v_hash and received_at > now() - interval '10 minutes') >= v_per_10m
    or (select count(*) from private.whatsapp_channel_inbound_rates where phone_hash = v_hash and received_at >= v_today) >= v_per_day then
    return false;
  end if;
  insert into private.whatsapp_channel_inbound_rates(phone_hash) values (v_hash);
  delete from private.whatsapp_channel_inbound_rates where phone_hash = v_hash and received_at < now() - interval '1 day';
  return true;
end; $$;
revoke all on function public.claim_whatsapp_channel_message(text) from public, anon, authenticated;
grant execute on function public.claim_whatsapp_channel_message(text) to service_role;

create function private.enforce_whatsapp_workspace_run_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_limit integer;
begin
  if new.trigger_kind is distinct from 'canal' then return new; end if;
  if not exists (
    select 1 from private.agent_conversations c
    where c.id = new.conversation_id and c.origin = 'whatsapp'
  ) then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('whatsapp_workspace_runs:' || new.workspace_id::text, 0));
  select runs_per_workspace_hour into v_limit from private.whatsapp_channel_security_limits where singleton;
  if (select count(*) from private.agent_runs r
      join private.agent_conversations c on c.id = r.conversation_id and c.origin = 'whatsapp'
      where r.workspace_id = new.workspace_id and r.trigger_kind = 'canal'
        and r.created_at >= now() - interval '1 hour') >= v_limit then
    raise exception 'WhatsApp workspace run limit reached' using errcode = '55000';
  end if;
  return new;
end; $$;
revoke all on function private.enforce_whatsapp_workspace_run_limit() from public, anon, authenticated, service_role;
create trigger whatsapp_workspace_run_limit
  before insert on private.agent_runs
  for each row execute function private.enforce_whatsapp_workspace_run_limit();

comment on table private.whatsapp_channel_security_limits is 'Limites operacionais do Canal WhatsApp; alterados somente por service_role.';
comment on table private.whatsapp_channel_inbound_rates is 'Contadores por hash do telefone; não guarda o telefone nem o texto recebido.';

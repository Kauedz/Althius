-- Conversas só são aceitas com sinal recente do motor. Nenhum dado de Workspace é armazenado aqui.
create table private.agent_engine_heartbeat (
  singleton boolean primary key default true check (singleton),
  last_seen_at timestamptz not null
);
alter table private.agent_engine_heartbeat enable row level security;
revoke all on private.agent_engine_heartbeat from public, anon, authenticated, service_role;

create function public.record_agent_engine_heartbeat()
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.agent_engine_heartbeat (singleton, last_seen_at)
  values (true, clock_timestamp())
  on conflict (singleton) do update set last_seen_at = excluded.last_seen_at;
$$;

create function public.agent_engine_last_heartbeat()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select last_seen_at from private.agent_engine_heartbeat where singleton;
$$;

revoke all on function public.record_agent_engine_heartbeat() from public, anon, authenticated;
revoke all on function public.agent_engine_last_heartbeat() from public, anon, authenticated;
grant execute on function public.record_agent_engine_heartbeat() to service_role;
grant execute on function public.agent_engine_last_heartbeat() to service_role;

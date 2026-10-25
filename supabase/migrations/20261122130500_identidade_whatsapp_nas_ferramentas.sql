-- Auditoria das RPCs executadas por ferramentas do Canal. O conteúdo da mensagem nunca é armazenado.
create table private.channel_tool_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  workspace_id uuid not null references public.workspaces(id),
  channel text not null check (channel = 'whatsapp'),
  tool text not null check (length(btrim(tool)) between 1 and 100),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  outcome text not null check (length(btrim(outcome)) between 1 and 80),
  created_at timestamptz not null default now()
);
alter table private.channel_tool_activity enable row level security;
revoke all on private.channel_tool_activity from public, anon, authenticated;
grant select, insert on private.channel_tool_activity to service_role;

create function public.record_whatsapp_tool_activity(
  p_user_id uuid,
  p_workspace_id uuid,
  p_tool text,
  p_payload_hash text,
  p_outcome text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if p_user_id is null or p_workspace_id is null or p_tool is null or length(btrim(p_tool)) not between 1 and 100
    or p_payload_hash !~ '^[0-9a-f]{64}$' or p_outcome is null or length(btrim(p_outcome)) not between 1 and 80 then
    raise exception 'invalid channel activity' using errcode = '22023';
  end if;
  insert into private.channel_tool_activity(user_id, workspace_id, channel, tool, payload_hash, outcome)
  values (p_user_id, p_workspace_id, 'whatsapp', btrim(p_tool), p_payload_hash, btrim(p_outcome))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.record_whatsapp_tool_activity(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.record_whatsapp_tool_activity(uuid, uuid, text, text, text) to service_role;

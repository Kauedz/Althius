create table private.whatsapp_action_confirmations (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users(id),
  workspace_id uuid not null references public.workspaces(id),
  tool text not null check (length(btrim(tool)) between 1 and 100),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{32}$'),
  state text not null default 'pendente' check (state in ('pendente', 'aprovado', 'recusado', 'expirado', 'alterado')),
  expires_at timestamptz not null default now() + interval '10 minutes',
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
alter table private.whatsapp_action_confirmations enable row level security;
revoke all on private.whatsapp_action_confirmations from public, anon, authenticated, service_role;

create function public.create_whatsapp_confirmation(
  p_token text, p_user_id uuid, p_workspace_id uuid, p_tool text, p_payload jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_token is null or length(p_token) < 32 or p_user_id is null or p_workspace_id is null
    or p_tool is null or length(btrim(p_tool)) not between 1 and 100
    or p_payload is null then
    raise exception 'invalid WhatsApp confirmation' using errcode = '22023';
  end if;
  insert into private.whatsapp_action_confirmations(token_hash, user_id, workspace_id, tool, payload_hash)
  values (encode(extensions.digest(p_token, 'sha256'), 'hex'), p_user_id, p_workspace_id, btrim(p_tool), private.approval_payload_hash(p_payload))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.create_whatsapp_confirmation(text, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_whatsapp_confirmation(text, uuid, uuid, text, jsonb) to service_role;

create function public.decide_whatsapp_confirmation(
  p_token text, p_user_id uuid, p_workspace_id uuid, p_tool text, p_payload jsonb, p_decision text
) returns text language plpgsql security definer set search_path = '' as $$
declare v private.whatsapp_action_confirmations%rowtype;
begin
  if p_token is null or p_payload is null or p_decision not in ('aprovar', 'recusar') then
    return 'invalido';
  end if;
  select * into v from private.whatsapp_action_confirmations
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') for update;
  if not found or v.user_id <> p_user_id or v.workspace_id <> p_workspace_id or v.tool <> p_tool then return 'invalido'; end if;
  if v.state <> 'pendente' then return 'usado'; end if;
  if v.expires_at <= now() then
    update private.whatsapp_action_confirmations set state = 'expirado' where id = v.id;
    return 'expirado';
  end if;
  if v.payload_hash <> private.approval_payload_hash(p_payload) then
    update private.whatsapp_action_confirmations set state = 'alterado' where id = v.id;
    return 'alterado';
  end if;
  update private.whatsapp_action_confirmations
  set state = case p_decision when 'aprovar' then 'aprovado' else 'recusado' end, decided_at = now()
  where id = v.id;
  return p_decision;
end;
$$;
revoke all on function public.decide_whatsapp_confirmation(text, uuid, uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.decide_whatsapp_confirmation(text, uuid, uuid, text, jsonb, text) to service_role;

create table private.whatsapp_action_links (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users(id),
  workspace_id uuid not null references public.workspaces(id),
  tool text not null check (length(btrim(tool)) between 1 and 100),
  action jsonb not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{32}$'),
  state text not null default 'pendente' check (state in ('pendente', 'aprovado', 'recusado', 'expirado', 'alterado')),
  expires_at timestamptz not null default now() + interval '15 minutes',
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
alter table private.whatsapp_action_links enable row level security;
revoke all on private.whatsapp_action_links from public, anon, authenticated, service_role;

create function public.create_whatsapp_action_link(
  p_token text, p_user_id uuid, p_workspace_id uuid, p_tool text, p_action jsonb
) returns text language plpgsql security definer set search_path = '' as $$
begin
  if p_token is null or length(p_token) < 32 or p_user_id is null or p_workspace_id is null
    or p_tool is null or length(btrim(p_tool)) not between 1 and 100 or p_action is null then
    raise exception 'invalid WhatsApp action link' using errcode = '22023';
  end if;
  insert into private.whatsapp_action_links(token_hash, user_id, workspace_id, tool, action, payload_hash)
  values (encode(extensions.digest(p_token, 'sha256'), 'hex'), p_user_id, p_workspace_id, btrim(p_tool), p_action,
    private.approval_payload_hash(p_action));
  return 'criado';
end;
$$;
revoke all on function public.create_whatsapp_action_link(text, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_whatsapp_action_link(text, uuid, uuid, text, jsonb) to service_role;

create function public.get_whatsapp_action_link(p_token text)
returns table (workspace_id uuid, tool text, action jsonb, state text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v private.whatsapp_action_links%rowtype;
begin
  if auth.uid() is null or p_token is null then return; end if;
  select * into v from private.whatsapp_action_links
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and user_id = auth.uid();
  if not found then return; end if;
  if v.expires_at <= now() and v.state = 'pendente' then
    update private.whatsapp_action_links set state = 'expirado' where id = v.id;
    v.state := 'expirado';
  end if;
  return query select v.workspace_id, v.tool, v.action, v.state, v.expires_at;
end;
$$;
revoke all on function public.get_whatsapp_action_link(text) from public, anon;
grant execute on function public.get_whatsapp_action_link(text) to authenticated;

create function public.decide_whatsapp_action_link(p_token text, p_decision text)
returns text language plpgsql security definer set search_path = '' as $$
declare v private.whatsapp_action_links%rowtype; v_login timestamptz;
begin
  if auth.uid() is null or p_token is null or p_decision is null or p_decision not in ('aprovar', 'recusar') then return 'invalido'; end if;
  select * into v from private.whatsapp_action_links
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and user_id = auth.uid() for update;
  if not found then return 'invalido'; end if;
  if v.state <> 'pendente' then return 'usado'; end if;
  if v.expires_at <= now() then
    update private.whatsapp_action_links set state = 'expirado' where id = v.id;
    return 'expirado';
  end if;
  if v.payload_hash <> private.approval_payload_hash(v.action) then
    update private.whatsapp_action_links set state = 'alterado' where id = v.id;
    return 'alterado';
  end if;
  select last_sign_in_at into v_login from auth.users where id = auth.uid();
  if v_login is null or v_login < now() - interval '12 hours' then return 'login_recente'; end if;
  update private.whatsapp_action_links
  set state = case p_decision when 'aprovar' then 'aprovado' else 'recusado' end, decided_at = now()
  where id = v.id;
  return p_decision;
end;
$$;
revoke all on function public.decide_whatsapp_action_link(text, text) from public, anon;
grant execute on function public.decide_whatsapp_action_link(text, text) to authenticated;

-- Pedidos de acesso (acesso-e-planos). O visitante do Workspace de demonstração que tenta uma ação paga abre o modal
-- "Fale com a equipe Althius" e manda nome, empresa, telefone e mensagem. O pedido fica em private.access_requests, a RPC
-- limita os envios por usuário e a Edge Function access-request-notify avisa a equipe por e-mail (mesmo padrão do pedido
-- de Sinal). O destino do e-mail é fixo no servidor; nada do que o cliente escreve escolhe o destinatário.

create table if not exists private.access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- O e-mail da Conta de usuário no envio, para a equipe responder.
  email text not null,
  name text not null check (length(btrim(name)) between 1 and 120),
  company text not null check (length(btrim(company)) between 1 and 160),
  phone text not null check (length(btrim(phone)) between 5 and 40),
  message text not null check (length(btrim(message)) between 1 and 2000),
  notified_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists access_requests_user_idx on private.access_requests (user_id, created_at desc);

alter table private.access_requests enable row level security;
revoke all on private.access_requests from public, anon, authenticated, service_role;

-- Quantos pedidos cada Conta de usuário manda por dia.
create or replace function private.access_request_daily_limit()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 5;
$$;

revoke all on function private.access_request_daily_limit() from public, anon, authenticated, service_role;

create or replace function public.submit_access_request(p_name text, p_company text, p_phone text, p_message text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select u.email into v_email from auth.users u where u.id = v_user;
  if v_email is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_name, ''))) not between 1 and 120
     or length(btrim(coalesce(p_company, ''))) not between 1 and 160
     or length(btrim(coalesce(p_phone, ''))) not between 5 and 40
     or length(btrim(coalesce(p_message, ''))) not between 1 and 2000 then
    raise exception 'invalid access request' using errcode = '22023';
  end if;
  -- Um envio por vez por usuário: duas abas não passam do limite juntas.
  perform pg_advisory_xact_lock(hashtext('access-request:' || v_user::text));
  if (select count(*) from private.access_requests r
      where r.user_id = v_user and r.created_at > now() - interval '24 hours') >= private.access_request_daily_limit() then
    raise exception 'too many access requests' using errcode = 'P0001', hint = 'rate_limit';
  end if;
  insert into private.access_requests (user_id, email, name, company, phone, message)
  values (v_user, v_email, btrim(p_name), btrim(p_company), btrim(p_phone), btrim(p_message))
  returning id into v_id;
  return v_id;
end;
$$;

-- A Edge Function reserva o aviso com a sessão de quem pediu. Uma vez só.
create or replace function public.claim_access_request_notice(p_request_id uuid)
returns table (name text, company text, phone text, message text, email text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  return query
  update private.access_requests r
  set notified_at = now()
  where r.id = p_request_id and r.user_id = auth.uid() and r.notified_at is null
  returning r.name, r.company, r.phone, r.message, r.email;
end;
$$;

-- Se o provedor recusou o envio, o aviso volta a poder ser reservado.
create or replace function public.release_access_request_notice(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  update private.access_requests r set notified_at = null
  where r.id = p_request_id and r.user_id = auth.uid();
end;
$$;

revoke all on function public.submit_access_request(text, text, text, text) from public, anon;
revoke all on function public.claim_access_request_notice(uuid) from public, anon;
revoke all on function public.release_access_request_notice(uuid) from public, anon;
grant execute on function public.submit_access_request(text, text, text, text) to authenticated;
grant execute on function public.claim_access_request_notice(uuid) to authenticated;
grant execute on function public.release_access_request_notice(uuid) to authenticated;

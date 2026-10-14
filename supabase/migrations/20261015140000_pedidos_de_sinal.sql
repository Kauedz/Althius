-- Pedido de Sinal à equipe Althius. O Workspace descreve o evento; a equipe monta. Sem cobrança.
-- Membro ativo lê e insere os pedidos do próprio Workspace. Só private.althius_staff atualiza o status.
-- Depende de private.is_althius_staff (20261015130000).

create table public.signal_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  requested_by uuid not null references auth.users(id),
  evento text not null check (length(btrim(evento)) between 1 and 2000),
  empresas_ou_nicho text not null check (length(btrim(empresas_ou_nicho)) between 1 and 2000),
  fontes_conhecidas text check (fontes_conhecidas is null or length(fontes_conhecidas) <= 2000),
  urgencia text not null check (urgencia in ('esta_semana', 'este_mes', 'sem_pressa')),
  contato jsonb not null,
  status text not null default 'novo' check (status in ('novo', 'em_analise', 'em_construcao', 'disponivel', 'recusado')),
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    jsonb_typeof(contato) = 'object'
    and length(btrim(coalesce(contato->>'nome', ''))) between 1 and 120
    and length(btrim(coalesce(contato->>'email', ''))) between 3 and 200
    and (contato->>'whatsapp' is null or length(contato->>'whatsapp') <= 40)
  )
);

create index signal_requests_workspace_idx on public.signal_requests (workspace_id, created_at desc);

alter table public.signal_requests enable row level security;
revoke all on public.signal_requests from public, anon, authenticated;
grant select, insert on public.signal_requests to authenticated;
grant update (status) on public.signal_requests to authenticated;

create policy "members read their workspace signal requests"
  on public.signal_requests for select to authenticated
  using (exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = signal_requests.workspace_id
      and m.user_id = (select auth.uid()) and m.active
  ));

create policy "members insert their own signal request"
  on public.signal_requests for insert to authenticated
  with check (
    requested_by = (select auth.uid())
    and status = 'novo'
    and notified_at is null
    and exists (
      select 1 from public.workspace_memberships m
      where m.workspace_id = signal_requests.workspace_id
        and m.user_id = (select auth.uid()) and m.active
    )
  );

create policy "althius staff updates signal request status"
  on public.signal_requests for update to authenticated
  using (private.is_althius_staff((select auth.uid())))
  with check (private.is_althius_staff((select auth.uid())));

create function public.request_signal(
  p_workspace_id uuid,
  p_evento text,
  p_empresas_ou_nicho text,
  p_fontes_conhecidas text,
  p_urgencia text,
  p_contato jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_user();
  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = p_workspace_id and m.user_id = (select auth.uid()) and m.active
  ) then
    raise exception 'not a member of this workspace' using errcode = '42501';
  end if;
  if p_urgencia not in ('esta_semana', 'este_mes', 'sem_pressa') then
    raise exception 'invalid urgency' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_evento, ''))) not between 1 and 2000
     or length(btrim(coalesce(p_empresas_ou_nicho, ''))) not between 1 and 2000
     or (p_fontes_conhecidas is not null and length(p_fontes_conhecidas) > 2000) then
    raise exception 'invalid signal request' using errcode = '22023';
  end if;
  insert into public.signal_requests (
    workspace_id, requested_by, evento, empresas_ou_nicho, fontes_conhecidas, urgencia, contato
  ) values (
    p_workspace_id, (select auth.uid()), btrim(p_evento), btrim(p_empresas_ou_nicho),
    nullif(btrim(coalesce(p_fontes_conhecidas, '')), ''), p_urgencia, p_contato
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.request_signal(uuid, text, text, text, text, jsonb) from public, anon;
grant execute on function public.request_signal(uuid, text, text, text, text, jsonb) to authenticated;

create function public.list_signal_requests(p_workspace_id uuid)
returns table (
  id uuid,
  evento text,
  empresas_ou_nicho text,
  fontes_conhecidas text,
  urgencia text,
  contato jsonb,
  status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_user();
  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = p_workspace_id and m.user_id = (select auth.uid()) and m.active
  ) then
    raise exception 'not a member of this workspace' using errcode = '42501';
  end if;
  return query
  select r.id, r.evento, r.empresas_ou_nicho, r.fontes_conhecidas, r.urgencia, r.contato, r.status, r.created_at
  from public.signal_requests r
  where r.workspace_id = p_workspace_id
  order by r.created_at desc;
end;
$$;

revoke all on function public.list_signal_requests(uuid) from public, anon;
grant execute on function public.list_signal_requests(uuid) to authenticated;

create function public.review_signal_request(p_id uuid, p_status text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_user();
  if not private.is_althius_staff((select auth.uid())) then
    raise exception 'only the Althius team updates a signal request' using errcode = '42501';
  end if;
  if p_status not in ('novo', 'em_analise', 'em_construcao', 'disponivel', 'recusado') then
    raise exception 'invalid signal request status' using errcode = '22023';
  end if;
  update public.signal_requests set status = p_status where id = p_id;
  if not found then
    raise exception 'signal request not found' using errcode = 'P0002';
  end if;
  return p_status;
end;
$$;

revoke all on function public.review_signal_request(uuid, text) from public, anon;
grant execute on function public.review_signal_request(uuid, text) to authenticated;

-- A Edge Function reserva o aviso com a sessão de quem pediu. Uma vez só.
create function public.claim_signal_request_notice(p_workspace_id uuid, p_request_id uuid)
returns table (
  evento text,
  empresas_ou_nicho text,
  fontes_conhecidas text,
  urgencia text,
  contato jsonb,
  workspace_name text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_user();
  return query
  update public.signal_requests r
  set notified_at = now()
  from public.workspaces w
  where r.id = p_request_id
    and r.workspace_id = p_workspace_id
    and r.workspace_id = w.id
    and r.requested_by = (select auth.uid())
    and r.notified_at is null
  returning r.evento, r.empresas_ou_nicho, r.fontes_conhecidas, r.urgencia, r.contato, w.name;
end;
$$;

revoke all on function public.claim_signal_request_notice(uuid, uuid) from public, anon;
grant execute on function public.claim_signal_request_notice(uuid, uuid) to authenticated;

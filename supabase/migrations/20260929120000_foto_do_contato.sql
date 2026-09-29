-- A foto pública do Contato (CRM-12). A Edge Function contact-photo-lookup pede a imagem do perfil LinkedIn do Contato
-- a um Actor do Apify e grava aqui o resultado. A foto é um campo próprio: nome, cargo e os demais campos do Contato
-- nunca são lidos nem alterados por esta consulta, e o conteúdo do perfil além da URL da imagem nem é guardado.
--
-- Guardamos só a URL devolvida pelo Actor, não a imagem: a URL do LinkedIn expira, e sem cópia não há arquivo para
-- reter ou apagar. Uma foto some da tela (a visão devolve foto nula, e a tela mostra as iniciais) quando a URL passa da
-- validade que ela mesma traz (`e=` na consulta), quando passam 30 dias da observação ou quando o LinkedIn do Contato
-- deixa de ser o consultado; um job diário apaga a URL de vez.
--
-- Limites: uma consulta em andamento por Contato, uma por minuto e três por dia para o mesmo Contato, e cinquenta por
-- dia para o Workspace. Cada reserva conta, tenha o Actor achado a foto ou não. Não há repetição automática: quem quiser
-- tenta de novo, dentro do limite do Contato.

-- Cada reserva de consulta: a trilha de custo (o que o Apify cobra por execução) e a base dos limites.
create table private.contact_photo_lookups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null,
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  finished_at timestamptz,
  -- found (o Actor devolveu a foto), not_found (o perfil não tem foto pública) ou failed (erro ou prazo do Actor).
  outcome text check (outcome in ('found', 'not_found', 'failed')),
  actor_id text,
  run_id text,
  error_code text,
  foreign key (workspace_id, contact_id) references public.contacts(workspace_id, id) on delete cascade
);

create index contact_photo_lookups_contact_idx on private.contact_photo_lookups (contact_id, requested_at);
create index contact_photo_lookups_workspace_idx on private.contact_photo_lookups (workspace_id, requested_at);
create index contact_photo_lookups_requested_by_idx on private.contact_photo_lookups (requested_by);

alter table private.contact_photo_lookups enable row level security;
revoke all on private.contact_photo_lookups from public, anon, authenticated;

-- O estado atual da foto de cada Contato: uma linha por Contato.
create table public.contact_photos (
  contact_id uuid primary key,
  workspace_id uuid not null,
  -- Quem informou a foto. 'manual' é reservado para uma foto escrita por uma pessoa: a consulta não a substitui.
  origin text not null default 'apify' check (origin in ('apify', 'manual')),
  -- O estado da última consulta: pending (em andamento), found, not_found ou failed.
  status text not null check (status in ('pending', 'found', 'not_found', 'failed')),
  photo_url text check (photo_url is null or (photo_url ~ '^https://' and length(photo_url) <= 2048)),
  -- A validade que a própria URL declara, quando declara.
  photo_url_expires_at timestamptz,
  -- O LinkedIn consultado: se o Contato passar a ter outro, a foto deixa de valer.
  linkedin_url text not null,
  actor_id text,
  run_id text,
  error_code text,
  -- Quando o Actor respondeu com a foto ou com a ausência dela; nulo até a primeira resposta.
  observed_at timestamptz,
  lookup_id uuid references private.contact_photo_lookups(id) on delete set null,
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, contact_id) references public.contacts(workspace_id, id) on delete cascade
);

create index contact_photos_workspace_idx on public.contact_photos (workspace_id);
create index contact_photos_lookup_idx on public.contact_photos (lookup_id);
create index contact_photos_requested_by_idx on public.contact_photos (requested_by);

alter table public.contact_photos enable row level security;

create policy "active members read contact photos"
  on public.contact_photos for select to authenticated
  using (exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = contact_photos.workspace_id
      and m.user_id = (select auth.uid()) and m.active
  ));

revoke all on public.contact_photos from anon, authenticated;
grant select on public.contact_photos to authenticated;

-- O que a tela lê: o estado da última consulta e a foto, só quando ela ainda vale. Lida com o RLS de quem consulta.
create view public.contact_photo_status with (security_invoker = true) as
select
  p.contact_id,
  p.workspace_id,
  p.status,
  case
    when p.photo_url is not null
      and c.linkedin = p.linkedin_url
      and p.observed_at > now() - interval '30 days'
      and (p.photo_url_expires_at is null or p.photo_url_expires_at > now())
    then p.photo_url
  end as photo_url,
  p.origin,
  p.actor_id,
  p.run_id,
  p.error_code,
  p.observed_at,
  p.requested_at
from public.contact_photos p
join public.contacts c on c.workspace_id = p.workspace_id and c.id = p.contact_id;

revoke all on public.contact_photo_status from anon, authenticated;
grant select on public.contact_photo_status to authenticated;

-- Reserva a consulta da foto do Contato, com a sessão de quem pede, e devolve o perfil a consultar. Qualquer
-- Participação ativa do Workspace do Contato serve; um Contato de outro Workspace não é encontrado (P0002). Erros:
-- 22023 (o LinkedIn do Contato não é um perfil /in/), 55000 (foto manual, que a consulta não substitui), 55006
-- (consulta em andamento) e 54000 (limite do Contato ou do Workspace); nesses casos nada é gravado.
create function public.begin_contact_photo_lookup(p_contact_id uuid)
returns table (lookup_id uuid, workspace_id uuid, linkedin_url text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_contact public.contacts;
  v_photo public.contact_photos;
  v_lookup_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select c.* into v_contact from public.contacts c
  join public.workspace_memberships m
    on m.workspace_id = c.workspace_id and m.user_id = v_user_id and m.active
  where c.id = p_contact_id
  for share of c;
  if not found then
    raise exception 'contact not found' using errcode = 'P0002';
  end if;

  if v_contact.linkedin is null or v_contact.linkedin !~ '^https://www\.linkedin\.com/in/[^/]+$' then
    raise exception 'contact has no linkedin profile url' using errcode = '22023';
  end if;

  -- Serializa as reservas do Workspace: o limite diário não estoura por duas reservas ao mesmo tempo.
  perform pg_advisory_xact_lock(hashtextextended(v_contact.workspace_id::text, 0));

  select * into v_photo from public.contact_photos p where p.contact_id = v_contact.id for update;
  if found then
    if v_photo.origin = 'manual' then
      raise exception 'manual photo needs confirmation to be replaced' using errcode = '55000';
    end if;
    -- Uma consulta parada há mais de 3 minutos (a função caiu no meio) deixa de segurar o Contato.
    if v_photo.status = 'pending' and v_photo.updated_at > now() - interval '3 minutes' then
      raise exception 'photo lookup in flight' using errcode = '55006';
    end if;
  end if;

  if exists (
    select 1 from private.contact_photo_lookups l
    where l.contact_id = v_contact.id and l.requested_at > now() - interval '1 minute'
  ) or (
    select count(*) from private.contact_photo_lookups l
    where l.contact_id = v_contact.id and l.requested_at > now() - interval '1 day'
  ) >= 3 then
    raise exception 'contact photo lookup limit reached' using errcode = '54000';
  end if;
  if (
    select count(*) from private.contact_photo_lookups l
    where l.workspace_id = v_contact.workspace_id and l.requested_at > now() - interval '1 day'
  ) >= 50 then
    raise exception 'workspace photo lookup limit reached' using errcode = '54000';
  end if;

  insert into private.contact_photo_lookups (workspace_id, contact_id, requested_by)
  values (v_contact.workspace_id, v_contact.id, v_user_id)
  returning id into v_lookup_id;

  -- A foto anterior fica onde está até a nova resposta; só o estado da consulta muda.
  insert into public.contact_photos (contact_id, workspace_id, status, linkedin_url, lookup_id, requested_by)
  values (v_contact.id, v_contact.workspace_id, 'pending', v_contact.linkedin, v_lookup_id, v_user_id)
  on conflict (contact_id) do update set
    status = 'pending',
    linkedin_url = excluded.linkedin_url,
    lookup_id = excluded.lookup_id,
    requested_by = excluded.requested_by,
    requested_at = now(),
    error_code = null,
    updated_at = now();

  return query select v_lookup_id, v_contact.workspace_id, v_contact.linkedin;
end;
$$;

revoke all on function public.begin_contact_photo_lookup(uuid) from public, anon;
grant execute on function public.begin_contact_photo_lookup(uuid) to authenticated;

-- Grava a resposta do Actor. Só a Edge Function, com a chave de serviço: quem tem sessão de usuário não escolhe a URL
-- da foto. found guarda a URL; not_found (o perfil não tem foto pública) apaga a anterior; failed mantém a anterior e
-- registra o erro. Devolve false quando a reserva já foi encerrada ou substituída por outra (nada muda no estado).
create function public.finish_contact_photo_lookup(
  p_lookup_id uuid,
  p_outcome text,
  p_photo_url text default null,
  p_photo_url_expires_at timestamptz default null,
  p_actor_id text default null,
  p_run_id text default null,
  p_error_code text default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lookup private.contact_photo_lookups;
begin
  if p_outcome not in ('found', 'not_found', 'failed') then
    raise exception 'invalid photo lookup outcome' using errcode = '22023';
  end if;
  if p_outcome = 'found' and (p_photo_url is null or p_photo_url !~ '^https://') then
    raise exception 'a found photo needs an https url' using errcode = '22023';
  end if;

  update private.contact_photo_lookups l set
    finished_at = now(), outcome = p_outcome, actor_id = p_actor_id, run_id = p_run_id, error_code = p_error_code
  where l.id = p_lookup_id and l.finished_at is null
  returning * into v_lookup;
  if not found then
    return false;
  end if;

  update public.contact_photos p set
    status = p_outcome,
    photo_url = case p_outcome when 'found' then p_photo_url when 'not_found' then null else p.photo_url end,
    photo_url_expires_at = case p_outcome
      when 'found' then p_photo_url_expires_at when 'not_found' then null else p.photo_url_expires_at end,
    observed_at = case when p_outcome = 'failed' then p.observed_at else now() end,
    actor_id = p_actor_id,
    run_id = p_run_id,
    error_code = p_error_code,
    updated_at = now()
  where p.contact_id = v_lookup.contact_id and p.lookup_id = p_lookup_id and p.origin <> 'manual';
  return found;
end;
$$;

revoke all on function public.finish_contact_photo_lookup(uuid, text, text, timestamptz, text, text, text)
  from public, anon, authenticated;
grant execute on function public.finish_contact_photo_lookup(uuid, text, text, timestamptz, text, text, text)
  to service_role;

-- Retenção: apaga a URL que já não vale (passou dos 30 dias, ou a validade dela venceu). O estado, o Actor e a data
-- de observação ficam como registro, e a trilha de consultas (sem URL) segue para auditar o custo.
create function private.purge_contact_photos()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_apagadas integer;
begin
  update public.contact_photos p set photo_url = null, photo_url_expires_at = null, updated_at = now()
  where p.photo_url is not null and p.origin <> 'manual'
    and (p.observed_at <= now() - interval '30 days'
      or (p.photo_url_expires_at is not null and p.photo_url_expires_at <= now()));
  get diagnostics v_apagadas = row_count;
  return v_apagadas;
end;
$$;

revoke all on function private.purge_contact_photos() from public, anon, authenticated, service_role;

-- O relógio, como no Executor da Sequência: onde não há pg_cron, a limpeza não é agendada, e a visão já esconde a foto
-- vencida.
do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('althius-contact-photo-retention', '17 3 * * *', 'select private.purge_contact_photos()');
  end if;
end
$cron$;

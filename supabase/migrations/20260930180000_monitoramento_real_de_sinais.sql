-- O Monitoramento real de Sinais (sinais-reais, ticket 02): a configuração que diz o que acompanhar e em quais Contas-alvo.
-- Só um Sinal cujo actor está "disponível" no registro (ticket 01) deixa criar Monitoramento. O Monitoramento guarda o
-- público (as Contas-alvo do Workspace que ele varre), os critérios do tipo de Sinal e de quanto em quanto tempo roda.
-- O Sinal em si, a varredura e a Quente vêm nas partes seguintes da mesma migration.

create table private.signal_monitors (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  signal_type text not null references private.signal_actors(signal_type),
  name text not null check (name = btrim(name) and length(name) between 1 and 120),
  state text not null default 'rascunho' check (state in ('rascunho', 'em-preparacao', 'ativo', 'pausado')),
  -- O público: as Contas-alvo do Workspace que este Monitoramento varre ({"accountIds": [uuid, ...]}).
  audience jsonb not null default '{}'::jsonb,
  criteria jsonb not null default '{}'::jsonb,
  every_hours integer not null default 24 check (every_hours between 1 and 720),
  created_by uuid references auth.users(id) on delete set null,
  last_run_at timestamptz,
  next_run_at timestamptz,
  claimed_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);

create index signal_monitors_workspace_idx on private.signal_monitors (workspace_id, created_at);
create index signal_monitors_due_idx on private.signal_monitors (next_run_at) where state = 'ativo';
create index signal_monitors_created_by_idx on private.signal_monitors (created_by);

alter table private.signal_monitors enable row level security;
revoke all on private.signal_monitors from public, anon, authenticated, service_role;

-- Valida o público e os critérios; devolve o público só com identificadores de Contas do Workspace.
create function private.validate_signal_monitor(
  p_workspace_id uuid, p_name text, p_state text, p_audience jsonb, p_criteria jsonb, p_every_hours integer
) returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id text;
begin
  if p_name is null or btrim(p_name) = '' or length(btrim(p_name)) > 120
    or p_state not in ('rascunho', 'em-preparacao', 'ativo', 'pausado')
    or p_audience is null or jsonb_typeof(p_audience) <> 'object'
    or p_criteria is null or jsonb_typeof(p_criteria) <> 'object'
    or p_every_hours is null or p_every_hours not between 1 and 720
    or exists (select 1 from jsonb_object_keys(p_audience) k where k <> 'accountIds')
    or (p_audience ? 'accountIds' and (jsonb_typeof(p_audience -> 'accountIds') <> 'array'
      or jsonb_array_length(p_audience -> 'accountIds') > 500))
    or length(p_criteria::text) > 20000
  then
    raise exception 'invalid monitor' using errcode = '22023';
  end if;
  for v_id in select jsonb_array_elements_text(coalesce(p_audience -> 'accountIds', '[]'::jsonb)) loop
    if v_id !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
      or not exists (select 1 from public.target_accounts a where a.workspace_id = p_workspace_id and a.id = v_id::uuid)
    then
      raise exception 'invalid monitor' using errcode = '22023';
    end if;
  end loop;
  if p_state = 'ativo' and jsonb_array_length(coalesce(p_audience -> 'accountIds', '[]'::jsonb)) = 0 then
    raise exception 'an active monitor needs at least one target account' using errcode = '22023';
  end if;
end;
$$;

revoke all on function private.validate_signal_monitor(uuid, text, text, jsonb, jsonb, integer) from public, anon, authenticated, service_role;

-- Cria (id nulo) ou atualiza um Monitoramento. Todo participante ativo cria; só quem criou, ou um Administrador, muda.
create function public.save_signal_monitor(
  p_workspace_id uuid,
  p_id uuid,
  p_signal_type text,
  p_name text,
  p_state text,
  p_audience jsonb,
  p_criteria jsonb,
  p_every_hours integer default 24
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.require_active_membership(p_workspace_id);
  v_existing private.signal_monitors%rowtype;
  v_id uuid;
begin
  if not exists (select 1 from private.signal_actors a where a.signal_type = p_signal_type and a.state = 'available') then
    raise exception 'signal type is not available' using errcode = '55000';
  end if;
  perform private.validate_signal_monitor(p_workspace_id, p_name, p_state, p_audience, p_criteria, p_every_hours);

  if p_id is null then
    insert into private.signal_monitors
      (workspace_id, signal_type, name, state, audience, criteria, every_hours, created_by, next_run_at)
    values (p_workspace_id, p_signal_type, btrim(p_name), p_state, p_audience, p_criteria, p_every_hours, auth.uid(),
            case when p_state = 'ativo' then now() end)
    returning id into v_id;
    return v_id;
  end if;

  select * into v_existing from private.signal_monitors m where m.workspace_id = p_workspace_id and m.id = p_id for update;
  if not found then
    raise exception 'monitor not found' using errcode = 'P0002';
  end if;
  if v_role <> 'admin' and v_existing.created_by is distinct from auth.uid() then
    raise exception 'only the creator or an administrator can change this monitor' using errcode = '42501';
  end if;
  update private.signal_monitors set
    signal_type = p_signal_type, name = btrim(p_name), state = p_state, audience = p_audience, criteria = p_criteria,
    every_hours = p_every_hours, updated_at = now(),
    next_run_at = case when p_state = 'ativo' then coalesce(next_run_at, now()) end
  where id = p_id;
  return p_id;
end;
$$;

-- Liga, pausa ou volta a rascunho um Monitoramento.
create function public.set_signal_monitor_state(p_id uuid, p_state text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v private.signal_monitors%rowtype;
  v_role text;
begin
  select * into v from private.signal_monitors m where m.id = p_id for update;
  if not found then
    raise exception 'monitor not found' using errcode = 'P0002';
  end if;
  v_role := private.require_active_membership(v.workspace_id);
  if v_role <> 'admin' and v.created_by is distinct from auth.uid() then
    raise exception 'only the creator or an administrator can change this monitor' using errcode = '42501';
  end if;
  perform private.validate_signal_monitor(v.workspace_id, v.name, p_state, v.audience, v.criteria, v.every_hours);
  update private.signal_monitors set
    state = p_state, updated_at = now(),
    next_run_at = case when p_state = 'ativo' then coalesce(next_run_at, now()) end
  where id = p_id;
end;
$$;

create function public.delete_signal_monitor(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v private.signal_monitors%rowtype;
begin
  select * into v from private.signal_monitors m where m.id = p_id for update;
  if not found then
    raise exception 'monitor not found' using errcode = 'P0002';
  end if;
  if private.require_active_membership(v.workspace_id) <> 'admin' and v.created_by is distinct from auth.uid() then
    raise exception 'only the creator or an administrator can change this monitor' using errcode = '42501';
  end if;
  delete from private.signal_monitors where id = p_id;
end;
$$;

-- Os Monitoramentos do Workspace, do mais antigo ao mais novo. Todo participante ativo consulta.
create function public.list_signal_monitors(p_workspace_id uuid)
returns table (
  id uuid, signal_type text, name text, state text, audience jsonb, criteria jsonb, every_hours integer,
  created_by uuid, last_run_at timestamptz, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);
  return query
  select m.id, m.signal_type, m.name, m.state, m.audience, m.criteria, m.every_hours, m.created_by, m.last_run_at, m.created_at
  from private.signal_monitors m where m.workspace_id = p_workspace_id
  order by m.created_at, m.id;
end;
$$;

revoke all on function public.save_signal_monitor(uuid, uuid, text, text, text, jsonb, jsonb, integer) from public, anon;
revoke all on function public.set_signal_monitor_state(uuid, text) from public, anon;
revoke all on function public.delete_signal_monitor(uuid) from public, anon;
revoke all on function public.list_signal_monitors(uuid) from public, anon;
grant execute on function public.save_signal_monitor(uuid, uuid, text, text, text, jsonb, jsonb, integer) to authenticated;
grant execute on function public.set_signal_monitor_state(uuid, text) to authenticated;
grant execute on function public.delete_signal_monitor(uuid) to authenticated;
grant execute on function public.list_signal_monitors(uuid) to authenticated;

-- Os Sinais reais. Cada acontecimento é um Sinal só, pela chave dele dentro da Conta e do tipo: reencontrá-lo não gera
-- outro Sinal nem renova o prazo (ADR-0007). Fica no histórico mesmo depois de vencer; vale 30 dias a partir do disparo.
create table private.signals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  target_account_id uuid not null,
  monitor_id uuid references private.signal_monitors(id) on delete set null,
  signal_type text not null references private.signal_actors(signal_type),
  -- A chave do acontecimento, montada pelo adaptador do tipo (ex.: empresa + cargo + data da vaga).
  event_key text not null check (length(event_key) between 1 and 300),
  phrase text not null check (length(phrase) between 1 and 300),
  fired_at timestamptz not null,
  source text check (source is null or length(source) <= 200),
  evidence text check (evidence is null or length(evidence) <= 2000),
  seen_again_at timestamptz,
  seen_again_monitor_id uuid references private.signal_monitors(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, target_account_id) references public.target_accounts(workspace_id, id) on delete cascade,
  unique (workspace_id, target_account_id, signal_type, event_key)
);

create index signals_account_idx on private.signals (workspace_id, target_account_id, fired_at desc);
create index signals_monitor_idx on private.signals (monitor_id);
create index signals_seen_again_monitor_idx on private.signals (seen_again_monitor_id);

alter table private.signals enable row level security;
revoke all on private.signals from public, anon, authenticated, service_role;

-- Quanto tempo um Sinal vale (ADR-0007).
create function private.signal_validity()
returns interval
language sql
immutable
set search_path = ''
as $$
  select interval '30 days';
$$;

revoke all on function private.signal_validity() from public, anon, authenticated, service_role;

-- Grava o Sinal de um acontecimento. Devolve true quando é novo e false quando já existia (o reencontro só fica
-- registrado). Um Sinal novo e ainda válido leva o cartão do kanban para Quente. Só o servidor chama.
create function private.record_signal(
  p_workspace_id uuid,
  p_target_account_id uuid,
  p_monitor_id uuid,
  p_signal_type text,
  p_event_key text,
  p_phrase text,
  p_fired_at timestamptz,
  p_source text,
  p_evidence text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted uuid;
begin
  if not exists (select 1 from public.target_accounts a where a.workspace_id = p_workspace_id and a.id = p_target_account_id) then
    raise exception 'target account not found' using errcode = 'P0002';
  end if;
  if p_monitor_id is not null and not exists (
    select 1 from private.signal_monitors m where m.workspace_id = p_workspace_id and m.id = p_monitor_id
  ) then
    raise exception 'monitor not found' using errcode = 'P0002';
  end if;
  insert into private.signals
    (workspace_id, target_account_id, monitor_id, signal_type, event_key, phrase, fired_at, source, evidence)
  values (p_workspace_id, p_target_account_id, p_monitor_id, p_signal_type, p_event_key, btrim(p_phrase), p_fired_at, p_source, p_evidence)
  on conflict (workspace_id, target_account_id, signal_type, event_key) do nothing
  returning id into v_inserted;

  if v_inserted is null then
    update private.signals set seen_again_at = now(), seen_again_monitor_id = p_monitor_id
    where workspace_id = p_workspace_id and target_account_id = p_target_account_id
      and signal_type = p_signal_type and event_key = p_event_key;
    return false;
  end if;
  if p_fired_at > now() - private.signal_validity() then
    perform private.record_prospecting_event(p_workspace_id, p_target_account_id, 'sinal_novo');
  end if;
  return true;
end;
$$;

revoke all on function private.record_signal(uuid, uuid, uuid, text, text, text, timestamptz, text, text) from public, anon, authenticated, service_role;

-- Uma função pública fina para o servidor gravar o Sinal (o Executor chama pelo RPC; a lógica fica na privada).
create function public.record_signal(
  p_workspace_id uuid,
  p_target_account_id uuid,
  p_monitor_id uuid,
  p_signal_type text,
  p_event_key text,
  p_phrase text,
  p_fired_at timestamptz,
  p_source text,
  p_evidence text
) returns boolean
language sql
security definer
set search_path = ''
as $$
  select private.record_signal(p_workspace_id, p_target_account_id, p_monitor_id, p_signal_type, p_event_key,
    p_phrase, p_fired_at, p_source, p_evidence);
$$;

revoke all on function public.record_signal(uuid, uuid, uuid, text, text, text, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.record_signal(uuid, uuid, uuid, text, text, text, timestamptz, text, text) to service_role;

-- O foguinho: por Conta, quantos Sinais válidos, se está Quente e o último Sinal (mesmo vencido). Só as Contas com Sinal.
create function public.list_account_signals(p_workspace_id uuid)
returns table (target_account_id uuid, valid_signals integer, hot boolean, last_phrase text, last_fired_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);
  return query
  select g.target_account_id,
    (count(*) filter (where g.fired_at > now() - private.signal_validity()))::integer,
    bool_or(g.fired_at > now() - private.signal_validity()),
    (array_agg(g.phrase order by g.fired_at desc))[1],
    max(g.fired_at)
  from private.signals g
  where g.workspace_id = p_workspace_id
  group by g.target_account_id;
end;
$$;

-- Os Sinais do Workspace ou de uma Conta, do mais novo ao mais antigo, com a evidência.
create function public.list_signals(p_workspace_id uuid, p_target_account_id uuid default null, p_limit integer default 200)
returns table (
  id uuid, target_account_id uuid, monitor_id uuid, signal_type text, event_key text, phrase text,
  fired_at timestamptz, source text, evidence text, seen_again_at timestamptz, valid boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);
  return query
  select g.id, g.target_account_id, g.monitor_id, g.signal_type, g.event_key, g.phrase, g.fired_at, g.source, g.evidence,
    g.seen_again_at, g.fired_at > now() - private.signal_validity()
  from private.signals g
  where g.workspace_id = p_workspace_id and (p_target_account_id is null or g.target_account_id = p_target_account_id)
  order by g.fired_at desc, g.id desc
  limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end;
$$;

revoke all on function public.list_account_signals(uuid) from public, anon;
revoke all on function public.list_signals(uuid, uuid, integer) from public, anon;
grant execute on function public.list_account_signals(uuid) to authenticated;
grant execute on function public.list_signals(uuid, uuid, integer) to authenticated;

-- Os Sinais vencidos: a Conta que já teve Sinal, não tem nenhum válido e ainda está em Quente ou Fit antes da
-- abordagem volta a Descoberta (kanban 02). Devolve quantas Contas moveu. O relógio o chama uma vez por dia.
create function private.expire_signals()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_moved integer := 0;
begin
  for v in
    select distinct g.workspace_id, g.target_account_id
    from private.signals g
    join private.prospecting_stages s on s.workspace_id = g.workspace_id and s.target_account_id = g.target_account_id
    where s.stage in ('quente', 'fit')
      and not exists (
        select 1 from private.signals x
        where x.workspace_id = g.workspace_id and x.target_account_id = g.target_account_id
          and x.fired_at > now() - private.signal_validity())
  loop
    if private.record_prospecting_event(v.workspace_id, v.target_account_id, 'sinais_vencidos') then
      v_moved := v_moved + 1;
    end if;
  end loop;
  return v_moved;
end;
$$;

revoke all on function private.expire_signals() from public, anon, authenticated, service_role;

-- O relógio do vencimento: uma vez por dia, onde o pg_cron existe.
do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
    and (select rolsuper from pg_roles where rolname = current_user) then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('althius-signals-expiry', '17 3 * * *', 'select private.expire_signals()');
  end if;
end
$cron$;

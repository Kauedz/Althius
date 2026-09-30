-- O Monitoramento real de Sinais e a varredura automática (sinais-reais, ticket 02).
--
-- O Monitoramento diz o que acompanhar e em quais Contas-alvo do Workspace; só um Sinal cujo actor está "disponível" no
-- registro (ticket 01) deixa criar um. O Sinal é um acontecimento com data, fonte e evidência: o mesmo acontecimento
-- conta uma vez, reencontrá-lo não renova o prazo, e ele vale 30 dias a partir do disparo (ADR-0007). Um Sinal novo e
-- ainda válido leva o cartão do kanban para Quente; quando os Sinais vencem antes da abordagem, o cartão que eles
-- puseram em Quente volta a Descoberta (kanban 02). A varredura automática (Edge Function signal-runner) é chamada pelo
-- relógio do banco, no desenho da Sequência em segundo plano: token gerado e guardado só aqui dentro. Cada Conta varrida
-- reserva 1 crédito, confere o teto da varredura automática (creditos-e-planos 02 e 03) e só debita quando conclui.
-- Apagar uma Conta definitivamente apaga os Sinais dela (CRM-18).

-- 1. Monitoramentos.
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
  -- Quando a próxima rodada vence; é também o "slot" que identifica a rodada (uma rodada cobra cada Conta uma vez).
  next_run_at timestamptz,
  claimed_until timestamptz,
  -- O motivo de a última rodada não ter varrido tudo, em palavras do produto.
  last_error text check (last_error is null or length(last_error) <= 500),
  -- Por onde a próxima rodada começa no público: a rodada que não deu conta de todas as Contas (o tempo da função
  -- acaba) continua de onde parou na seguinte, então nenhuma Conta fica sem varredura.
  scan_offset integer not null default 0 check (scan_offset >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);

create index signal_monitors_workspace_idx on private.signal_monitors (workspace_id, created_at);
create index signal_monitors_due_idx on private.signal_monitors (next_run_at) where state = 'ativo';
create index signal_monitors_created_by_idx on private.signal_monitors (created_by);

alter table private.signal_monitors enable row level security;
revoke all on private.signal_monitors from public, anon, authenticated, service_role;

-- Valida o nome, o estado, o público e os critérios; o público só leva Contas do Workspace.
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

-- Só quem criou o Monitoramento, ou um Administrador, o muda ou apaga.
create function private.assert_can_change_monitor(p_role text, p_created_by uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_role <> 'admin' and p_created_by is distinct from auth.uid() then
    raise exception 'only the creator or an administrator can change this monitor' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.validate_signal_monitor(uuid, text, text, jsonb, jsonb, integer) from public, anon, authenticated, service_role;
revoke all on function private.assert_can_change_monitor(text, uuid) from public, anon, authenticated, service_role;

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
  perform private.assert_can_change_monitor(v_role, v_existing.created_by);
  -- Pausar guarda a hora marcada: retomar antes dela não força uma rodada nova (nem um gasto de crédito).
  update private.signal_monitors set
    signal_type = p_signal_type, name = btrim(p_name), state = p_state, audience = p_audience, criteria = p_criteria,
    every_hours = p_every_hours, scan_offset = 0, updated_at = now(),
    next_run_at = case when p_state = 'ativo' then coalesce(next_run_at, now()) else next_run_at end
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
begin
  select * into v from private.signal_monitors m where m.id = p_id for update;
  if not found then
    raise exception 'monitor not found' using errcode = 'P0002';
  end if;
  perform private.assert_can_change_monitor(private.require_active_membership(v.workspace_id), v.created_by);
  perform private.validate_signal_monitor(v.workspace_id, v.name, p_state, v.audience, v.criteria, v.every_hours);
  update private.signal_monitors set
    state = p_state, updated_at = now(),
    next_run_at = case when p_state = 'ativo' then coalesce(next_run_at, now()) else next_run_at end
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
  perform private.assert_can_change_monitor(private.require_active_membership(v.workspace_id), v.created_by);
  delete from private.signal_monitors where id = p_id;
end;
$$;

-- Os Monitoramentos do Workspace, do mais antigo ao mais novo, com o motivo da última falha. Todo participante ativo
-- consulta.
create function public.list_signal_monitors(p_workspace_id uuid)
returns table (
  id uuid, signal_type text, name text, state text, audience jsonb, criteria jsonb, every_hours integer,
  created_by uuid, last_run_at timestamptz, last_error text, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);
  return query
  select m.id, m.signal_type, m.name, m.state, m.audience, m.criteria, m.every_hours, m.created_by, m.last_run_at,
    m.last_error, m.created_at
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

-- 2. Sinais reais. Cada acontecimento é um Sinal só, pela chave dele dentro da Conta e do tipo. Fica no histórico
-- mesmo depois de vencer.
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

-- O Sinal ainda vale? Cada Sinal vale 30 dias a partir do disparo (ADR-0007).
create function private.signal_is_valid(p_fired_at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_fired_at > now() - interval '30 days';
$$;

revoke all on function private.signal_is_valid(timestamptz) from public, anon, authenticated, service_role;

-- Grava o Sinal de um acontecimento. Devolve true quando é novo e false quando já existia (o reencontro só fica
-- registrado). Um Sinal novo e ainda válido leva o cartão do kanban para Quente. A Conta arquivada ou apagada não
-- recebe Sinal novo, e a data do disparo não pode estar mais de um dia no futuro. Só o servidor chama.
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
  v_monitor_type text;
begin
  if p_fired_at is null or p_fired_at > now() + interval '1 day' then
    raise exception 'invalid signal date' using errcode = '22023';
  end if;
  perform private.assert_account_operable(p_workspace_id, p_target_account_id);
  if not exists (select 1 from public.target_accounts a where a.workspace_id = p_workspace_id and a.id = p_target_account_id) then
    raise exception 'target account not found' using errcode = 'P0002';
  end if;
  if p_monitor_id is not null then
    select m.signal_type into v_monitor_type from private.signal_monitors m
    where m.workspace_id = p_workspace_id and m.id = p_monitor_id;
    if not found then
      raise exception 'monitor not found' using errcode = 'P0002';
    end if;
    if v_monitor_type <> p_signal_type then
      raise exception 'the monitor does not match the signal type' using errcode = '22023';
    end if;
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
  if private.signal_is_valid(p_fired_at) then
    perform private.record_prospecting_event(p_workspace_id, p_target_account_id, 'sinal_novo');
  end if;
  return true;
end;
$$;

revoke all on function private.record_signal(uuid, uuid, uuid, text, text, text, timestamptz, text, text) from public, anon, authenticated, service_role;

-- Uma função pública fina para o servidor gravar o Sinal pelo RPC; a lógica fica na privada.
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
    (count(*) filter (where private.signal_is_valid(g.fired_at)))::integer,
    bool_or(private.signal_is_valid(g.fired_at)),
    (array_agg(g.phrase order by g.fired_at desc, g.id desc))[1],
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
  fired_at timestamptz, source text, evidence text, seen_again_at timestamptz, seen_again_monitor_id uuid, valid boolean
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
    g.seen_again_at, g.seen_again_monitor_id, private.signal_is_valid(g.fired_at)
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

-- Os Sinais vencidos: o cartão que um Sinal pôs em Quente, e que ficou sem nenhum Sinal válido antes da abordagem,
-- volta a Descoberta (kanban 02). Fit (a Aderência) e o cartão que a pessoa pôs em Quente à mão ficam onde estão.
-- Devolve quantas Contas moveu. O relógio o chama toda hora.
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
    select s.workspace_id, s.target_account_id
    from private.prospecting_stages s
    where s.stage = 'quente'
      and exists (
        select 1 from private.signals g
        where g.workspace_id = s.workspace_id and g.target_account_id = s.target_account_id)
      and not exists (
        select 1 from private.signals x
        where x.workspace_id = s.workspace_id and x.target_account_id = s.target_account_id
          and private.signal_is_valid(x.fired_at))
      and (
        select h.moved_by is null from private.prospecting_stage_history h
        where h.workspace_id = s.workspace_id and h.target_account_id = s.target_account_id
        order by h.created_at desc, h.id desc limit 1)
  loop
    if private.record_prospecting_event(v.workspace_id, v.target_account_id, 'sinais_vencidos') then
      v_moved := v_moved + 1;
    end if;
  end loop;
  return v_moved;
end;
$$;

revoke all on function private.expire_signals() from public, anon, authenticated, service_role;

-- 3. A varredura automática. O relógio olha se há Monitoramento vencido e, só então, chama a Edge Function
-- signal-runner pelo pg_net. O token é gerado aqui dentro e guardado só no banco: a função o confere por uma RPC, então
-- nenhum segredo passa por pessoas nem pela configuração dela. O endereço é o único passo manual
-- (private.configure_signal_runner, no SQL Editor, uma vez por projeto). Sem endereço, nada é chamado.
create table private.signal_runner_settings (
  singleton boolean primary key default true check (singleton),
  function_url text,
  token text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  updated_at timestamptz not null default now()
);

insert into private.signal_runner_settings default values;

alter table private.signal_runner_settings enable row level security;
revoke all on private.signal_runner_settings from public, anon, authenticated, service_role;

create function public.signal_runner_token_matches(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.signal_runner_settings s
    where length(coalesce(p_token, '')) >= 32 and s.token = p_token);
$$;

revoke all on function public.signal_runner_token_matches(text) from public, anon, authenticated;
grant execute on function public.signal_runner_token_matches(text) to service_role;

create function private.configure_signal_runner(p_project_url text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
begin
  if coalesce(p_project_url, '') !~ '^https://[A-Za-z0-9.-]+(:[0-9]{2,5})?/?$' then
    raise exception 'project url must look like https://<ref>.supabase.co' using errcode = '22023';
  end if;
  v_url := regexp_replace(p_project_url, '/$', '') || '/functions/v1/signal-runner';
  update private.signal_runner_settings set function_url = v_url, updated_at = now();
  return v_url;
end;
$$;

revoke all on function private.configure_signal_runner(text) from public, anon, authenticated, service_role;

-- A chamada HTTP em si, separada para os testes a trocarem dentro da transação (o CI não fala com a função).
create function private.post_to_signal_runner(p_url text, p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform net.http_post(
    url := p_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-runner-token', p_token),
    timeout_milliseconds := 5000);
end;
$$;

revoke all on function private.post_to_signal_runner(text, text) from public, anon, authenticated, service_role;

-- Há Monitoramento ativo, vencido, sem reserva viva e de um Sinal com actor disponível?
create function private.signal_monitors_due()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.signal_monitors m
    join private.signal_actors a on a.signal_type = m.signal_type and a.state = 'available'
    where m.state = 'ativo' and m.next_run_at <= now() and (m.claimed_until is null or m.claimed_until < now()));
$$;

revoke all on function private.signal_monitors_due() from public, anon, authenticated, service_role;

create function private.kick_signal_runner()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings private.signal_runner_settings;
begin
  select s.* into v_settings from private.signal_runner_settings s;
  if v_settings.function_url is null or not private.signal_monitors_due() then
    return false;
  end if;
  perform private.post_to_signal_runner(v_settings.function_url, v_settings.token);
  return true;
end;
$$;

revoke all on function private.kick_signal_runner() from public, anon, authenticated, service_role;

-- Reivindica até p_limit Monitoramentos vencidos, com uma reserva de 15 minutos, e devolve o slot da rodada e as Contas
-- do público de cada um (sem as arquivadas nem as apagadas), começando por onde a rodada anterior parou. O criador só
-- vem se ainda participa do Workspace. Só o servidor.
create function public.claim_due_signal_monitors(p_limit integer default 5)
returns table (
  monitor_id uuid, workspace_id uuid, signal_type text, criteria jsonb, created_by uuid, slot timestamptz, accounts jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select m.id from private.signal_monitors m
    join private.signal_actors a on a.signal_type = m.signal_type and a.state = 'available'
    where m.state = 'ativo' and m.next_run_at <= now() and (m.claimed_until is null or m.claimed_until < now())
    order by m.next_run_at, m.id
    limit least(greatest(coalesce(p_limit, 5), 1), 20)
    for update of m skip locked
  ), claimed as (
    update private.signal_monitors m set claimed_until = now() + interval '15 minutes'
    from due where m.id = due.id
    returning m.*
  )
  select c.id, c.workspace_id, c.signal_type, c.criteria,
    (select p.user_id from public.workspace_memberships p
     where p.workspace_id = c.workspace_id and p.user_id = c.created_by and p.active),
    c.next_run_at,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'domain', x.domain, 'linkedinUrl', x.linkedin_url)
        order by (((x.pos - 1 - c.scan_offset) % x.total) + x.total) % x.total)
      from (
        select t.id, t.name, t.domain, t.linkedin_url,
          row_number() over (order by t.name, t.id) as pos, count(*) over () as total
        from public.target_accounts t
        where t.workspace_id = c.workspace_id and t.archived_at is null and t.deleted_at is null
          and t.id::text in (select jsonb_array_elements_text(c.audience -> 'accountIds'))
      ) x
    ), '[]'::jsonb)
  from claimed c;
end;
$$;

-- Termina a rodada: solta a reserva, guarda o motivo (se houve) e avança a rotação pelas Contas que tentou. Agenda a
-- próxima daqui a `every_hours`, ou já, quando o tempo acabou no meio e ainda há Contas por varrer (p_continue).
create function public.finish_signal_monitor_run(
  p_monitor_id uuid, p_attempted integer, p_error text, p_continue boolean default false
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.signal_monitors set
    last_run_at = now(),
    next_run_at = case when p_continue then now() else now() + make_interval(hours => every_hours) end,
    claimed_until = null,
    scan_offset = (scan_offset + greatest(coalesce(p_attempted, 0), 0)) % 1000000,
    last_error = nullif(left(coalesce(p_error, ''), 500), '')
  where id = p_monitor_id;
  if not found then
    raise exception 'monitor not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.claim_due_signal_monitors(integer) from public, anon, authenticated;
revoke all on function public.finish_signal_monitor_run(uuid, integer, text, boolean) from public, anon, authenticated;
grant execute on function public.claim_due_signal_monitors(integer) to service_role;
grant execute on function public.finish_signal_monitor_run(uuid, integer, text, boolean) to service_role;

-- Para a varredura automática: o actor de um tipo de Sinal e o estado dele.
create function public.signal_actor_for_type(p_signal_type text)
returns table (actor_id text, signal_type text, state text, version text, max_cost_usd numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select a.actor_id, a.signal_type, a.state, a.version, a.max_cost_usd
  from private.signal_actors a where a.signal_type = p_signal_type;
$$;

revoke all on function public.signal_actor_for_type(text) from public, anon, authenticated;
grant execute on function public.signal_actor_for_type(text) to service_role;

-- 4. Crédito e teto de cada Conta varrida, de forma atômica.
-- Devolve ao teto mensal o que uma varredura que não concluiu não gastou; tirar o gasto abaixo do teto tira a pausa.
create function private.refund_automation_cap(p_workspace_id uuid, p_scope text, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month date := date_trunc('month', now())::date;
  v_spent numeric;
begin
  perform pg_advisory_xact_lock(hashtext('automation:' || p_workspace_id::text || ':' || p_scope));
  update private.automation_spend set spent = greatest(spent - p_amount, 0)
  where workspace_id = p_workspace_id and scope = p_scope and month = v_month
  returning spent into v_spent;
  if found then
    update private.automation_settings set paused_at = null
    where workspace_id = p_workspace_id and scope = p_scope and monthly_cap > v_spent;
  end if;
end;
$$;

revoke all on function private.refund_automation_cap(uuid, text, numeric) from public, anon, authenticated, service_role;

-- Abre a varredura de uma Conta numa rodada: reserva 1 crédito, confere o teto da varredura automática e diz o que
-- fazer. A chave da reserva é a Conta, o Monitoramento e o slot da rodada, então repetir a rodada (a função caiu no
-- meio) nunca cobra duas vezes:
--   go / resume  varre (resume: a reserva já existia); done: já concluída nesta rodada; skip: já falhou nesta rodada;
--   no_credits   sem saldo ou no limite mensal do participante; confirmar, sem_teto, teto_atingido: o automático não roda.
-- Uma recusa não deixa nada para trás. O criador que saiu do Workspace não trava a varredura: o crédito é do Workspace.
create function public.begin_account_scan(
  p_workspace_id uuid, p_user_id uuid, p_monitor_id uuid, p_account_id uuid, p_slot timestamptz
) returns table (outcome text, reservation_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := 'scan:' || p_monitor_id::text || ':' || p_account_id::text || ':' || extract(epoch from p_slot)::bigint::text;
  v_existing private.credit_reservations%rowtype;
  v_user uuid;
  v_id uuid;
  v_cap text;
begin
  perform pg_advisory_xact_lock(hashtext('scan:' || v_key));
  select * into v_existing from private.credit_reservations r where r.workspace_id = p_workspace_id and r.action_key = v_key;
  if found then
    return query select
      case v_existing.status when 'reserved' then 'resume' when 'settled' then 'done' else 'skip' end,
      v_existing.id;
    return;
  end if;
  if not exists (
    select 1 from private.signal_monitors m where m.workspace_id = p_workspace_id and m.id = p_monitor_id
  ) or not exists (
    select 1 from public.target_accounts a where a.workspace_id = p_workspace_id and a.id = p_account_id
  ) then
    raise exception 'monitor or target account not found' using errcode = 'P0002';
  end if;

  v_user := case when p_user_id is not null and exists (
    select 1 from public.workspace_memberships m where m.workspace_id = p_workspace_id and m.user_id = p_user_id and m.active
  ) then p_user_id end;
  begin
    v_id := public.reserve_credits(p_workspace_id, v_user, 'account_scan', v_key, 1, false);
  exception when others then
    if sqlerrm in ('insufficient credits', 'monthly credit limit reached') then
      return query select 'no_credits'::text, null::uuid;
      return;
    end if;
    raise;
  end;
  v_cap := public.consume_automation_cap(
    p_workspace_id, 'acao:varredura', (select r.amount from private.credit_reservations r where r.id = v_id));
  if v_cap <> 'ok' then
    delete from private.credit_reservations where id = v_id;
    return query select v_cap, null::uuid;
    return;
  end if;
  return query select 'go'::text, v_id;
end;
$$;

-- Fecha a varredura de uma Conta: concluída, debita o crédito; falha, solta a reserva e devolve o teto. Repetir não
-- faz nada.
create function public.end_account_scan(p_reservation_id uuid, p_success boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v private.credit_reservations%rowtype;
begin
  select * into v from private.credit_reservations r where r.id = p_reservation_id for update;
  if not found then
    raise exception 'credit reservation not found' using errcode = 'P0002';
  end if;
  if v.status <> 'reserved' then
    return;
  end if;
  if p_success then
    perform public.settle_credits(v.id, null);
  else
    perform public.release_credits(v.id);
    perform private.refund_automation_cap(v.workspace_id, 'acao:varredura', v.amount);
  end if;
end;
$$;

revoke all on function public.begin_account_scan(uuid, uuid, uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.end_account_scan(uuid, boolean) from public, anon, authenticated;
grant execute on function public.begin_account_scan(uuid, uuid, uuid, uuid, timestamptz) to service_role;
grant execute on function public.end_account_scan(uuid, boolean) to service_role;

-- A faxina: a reserva que ficou presa (a função caiu no meio) é solta depois de duas horas. Devolve quantas soltou.
create function private.release_stale_credit_reservations(p_older_than interval default interval '2 hours')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_released integer;
begin
  update private.credit_reservations set status = 'released', closed_at = now()
  where status = 'reserved' and created_at < now() - p_older_than;
  get diagnostics v_released = row_count;
  return v_released;
end;
$$;

revoke all on function private.release_stale_credit_reservations(interval) from public, anon, authenticated, service_role;

-- 5. Apagar a Conta definitivamente apaga os Sinais dela e a tira do público dos Monitoramentos (CRM-18): o marcador
-- que fica no lugar dela não guarda dado da empresa. Redefinida a partir da definição mais recente
-- (20260929160000_arquivar_e_apagar_dados_comerciais.sql), com os Sinais a mais.
create or replace function private.erase_account_extensions(p_workspace_id uuid, p_account_id uuid, p_account public.target_accounts)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_signals integer;
begin
  delete from private.signals g where g.workspace_id = p_workspace_id and g.target_account_id = p_account_id;
  get diagnostics v_signals = row_count;
  update private.signal_monitors m set audience = jsonb_set(
    m.audience, '{accountIds}',
    coalesce((select jsonb_agg(e) from jsonb_array_elements(m.audience -> 'accountIds') e where e #>> '{}' <> p_account_id::text), '[]'::jsonb))
  where m.workspace_id = p_workspace_id and m.audience -> 'accountIds' @> to_jsonb(p_account_id::text);
  return private.erase_import_data(p_workspace_id, p_account_id, p_account.canonical_url, null, null, null, null)
    || jsonb_build_object('agent_facts_erased', private.erase_agent_memory(
      p_workspace_id, array[p_account.name, p_account.canonical_url, p_account.domain, p_account.linkedin_url]))
    || jsonb_build_object('signals_erased', v_signals);
end;
$$;

-- 6. Os relógios, onde o pg_cron e o pg_net existem (no Supabase e no CI, que roda a imagem dele): a varredura a cada
-- 10 minutos, o vencimento dos Sinais e a faxina das reservas toda hora. Onde não existem, nada é ligado.
do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
    and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('althius-signal-runner', '*/10 * * * *', 'select private.kick_signal_runner()');
    perform cron.schedule('althius-signals-expiry', '43 * * * *', 'select private.expire_signals()');
    perform cron.schedule('althius-credit-janitor', '11 * * * *', 'select private.release_stale_credit_reservations()');
  end if;
end
$cron$;

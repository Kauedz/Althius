-- Sinais em cascata, infraestrutura dos ICPs: o feed de Sinais de mercado e as fotografias das cascatas.
--
-- Sinal de mercado (decisão 9): acontece no mercado todo (Comex Stat, DOU, Plano Safra) e não é de uma Conta, então não
-- passa pelo `record_signal`. Grava no feed do Workspace que pagou a busca (`private.market_signals`), com a mesma regra de
-- sempre: o mesmo acontecimento conta uma vez. A tela lê o feed por `list_market_signals`, que confere a Participação ativa;
-- ele aparece fora da Conta.
--
-- Fotografia: o estado de uma empresa (CNPJ) ou Conta numa data — processos, funcionários, porte, filiais —, para a rodada
-- seguinte comparar (salto de processos, cruzar faixa de headcount, nova filial). Só dado da empresa: nunca nome de pessoa
-- (sócio entra como contagem; processo, como número). Só o servidor lê e grava.

create table private.market_signals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  signal_type text not null references private.signal_catalog(signal_type),
  event_key text not null check (length(event_key) between 1 and 300),
  phrase text not null check (length(btrim(phrase)) between 1 and 300),
  fired_at timestamptz not null,
  source text check (source is null or length(source) <= 200),
  evidence text check (evidence is null or length(evidence) <= 2000),
  -- Os números do acontecimento (FOB, volume, variação), para a tela e o Hermes mostrarem.
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object' and length(payload::text) <= 20000),
  created_at timestamptz not null default now(),
  unique (workspace_id, signal_type, event_key)
);

create index market_signals_feed_idx on private.market_signals (workspace_id, fired_at desc);
create index market_signals_type_idx on private.market_signals (signal_type);

alter table private.market_signals enable row level security;
revoke all on private.market_signals from public, anon, authenticated, service_role;

create table private.signal_snapshots (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  signal_type text not null references private.signal_catalog(signal_type),
  -- Quem foi fotografado: o CNPJ (só dígitos) ou o id da Conta.
  subject_key text not null check (length(subject_key) between 1 and 200),
  taken_at timestamptz not null default now(),
  data jsonb not null check (jsonb_typeof(data) = 'object' and length(data::text) <= 20000),
  primary key (workspace_id, signal_type, subject_key, taken_at)
);

alter table private.signal_snapshots enable row level security;
revoke all on private.signal_snapshots from public, anon, authenticated, service_role;

-- Grava um Sinal de mercado. Devolve true quando é novo e false quando já existia. Só o servidor.
create function public.record_market_signal(
  p_workspace_id uuid,
  p_signal_type text,
  p_event_key text,
  p_phrase text,
  p_fired_at timestamptz,
  p_source text,
  p_evidence text,
  p_payload jsonb default '{}'::jsonb
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.workspaces w where w.id = p_workspace_id) then
    raise exception 'workspace not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from private.signal_cascades c where c.signal_type = p_signal_type and c.scope = 'mercado') then
    raise exception 'not a market signal type' using errcode = '22023';
  end if;
  if p_fired_at is null or p_fired_at > now() + interval '1 day' then
    raise exception 'invalid signal date' using errcode = '22023';
  end if;
  insert into private.market_signals (workspace_id, signal_type, event_key, phrase, fired_at, source, evidence, payload)
  values (p_workspace_id, p_signal_type, p_event_key, btrim(p_phrase), p_fired_at, p_source, p_evidence, coalesce(p_payload, '{}'::jsonb))
  on conflict (workspace_id, signal_type, event_key) do nothing
  returning id into v_id;
  return v_id is not null;
end;
$$;

-- O feed de Sinais de mercado do Workspace, do mais novo ao mais antigo. Todo participante ativo lê.
create function public.list_market_signals(p_workspace_id uuid, p_limit integer default 100)
returns table (id uuid, signal_type text, event_key text, phrase text, fired_at timestamptz, source text, evidence text, payload jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);
  return query
  select m.id, m.signal_type, m.event_key, m.phrase, m.fired_at, m.source, m.evidence, m.payload
  from private.market_signals m where m.workspace_id = p_workspace_id
  order by m.fired_at desc, m.id desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

-- Grava as fotografias de uma rodada: [{ "subjectKey": "...", "data": {...}, "takenAt": "..." }]. A do mesmo assunto e do
-- mesmo instante é substituída. Devolve quantas gravou. Só o servidor.
create function public.signal_snapshots_put(p_workspace_id uuid, p_signal_type text, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_count integer := 0;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 500 then
    raise exception 'invalid snapshots' using errcode = '22023';
  end if;
  if not exists (select 1 from private.signal_catalog c where c.signal_type = p_signal_type) then
    raise exception 'unknown signal type' using errcode = '22023';
  end if;
  if not exists (select 1 from public.workspaces w where w.id = p_workspace_id) then
    raise exception 'workspace not found' using errcode = 'P0002';
  end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce(btrim(v_item ->> 'subjectKey'), '') = '' or jsonb_typeof(v_item -> 'data') <> 'object' then
      raise exception 'invalid snapshot' using errcode = '22023';
    end if;
    insert into private.signal_snapshots (workspace_id, signal_type, subject_key, taken_at, data)
    values (p_workspace_id, p_signal_type, v_item ->> 'subjectKey', coalesce((v_item ->> 'takenAt')::timestamptz, now()), v_item -> 'data')
    on conflict (workspace_id, signal_type, subject_key, taken_at) do update set data = excluded.data;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- A fotografia mais recente de cada assunto (antes de p_before, quando informado). Só o servidor.
create function public.signal_snapshots_get(
  p_workspace_id uuid, p_signal_type text, p_subject_keys text[], p_before timestamptz default null
) returns table (subject_key text, taken_at timestamptz, data jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (s.subject_key) s.subject_key, s.taken_at, s.data
  from private.signal_snapshots s
  where s.workspace_id = p_workspace_id and s.signal_type = p_signal_type and s.subject_key = any (p_subject_keys)
    and (p_before is null or s.taken_at < p_before)
  order by s.subject_key, s.taken_at desc;
$$;

revoke all on function public.record_market_signal(uuid, text, text, text, timestamptz, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.list_market_signals(uuid, integer) from public, anon;
revoke all on function public.signal_snapshots_put(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.signal_snapshots_get(uuid, text, text[], timestamptz) from public, anon, authenticated;
grant execute on function public.record_market_signal(uuid, text, text, text, timestamptz, text, text, jsonb) to service_role;
grant execute on function public.list_market_signals(uuid, integer) to authenticated;
grant execute on function public.signal_snapshots_put(uuid, text, jsonb) to service_role;
grant execute on function public.signal_snapshots_get(uuid, text, text[], timestamptz) to service_role;

-- Semente de uma cascata a partir de um JSON, para as migrações de cada ICP registrarem as suas sem repetir o INSERT:
--   { "signalType", "icp", "name", "state"?, "semFonteMotivo"?, "scope"?, "capUsd"?, "capCredits"?, "cadenceHours"?, "maxAccounts"?,
--     "notes"?, "steps": [ { "ordem", "kind", "handler", "actorId"?, "fallbacks"?, "inputTemplate"?, "priceModel"?, "knownPrice"?,
--       "estFixedUsd"?, "estPerItemUsd"?, "estItems"?, "maxItems"? } ] }
-- Todo actor novo nasce em teste (o estado padrão); "sem_fonte" exige o motivo e não tem passos. Devolve o id da cascata.
create function private.seed_signal_cascade(p_def jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_step jsonb;
begin
  insert into private.signal_cascades
    (signal_type, icp, name, state, sem_fonte_motivo, scope, cap_usd, cap_credits, cadence_hours, max_accounts, notes)
  values (
    p_def ->> 'signalType', p_def ->> 'icp', p_def ->> 'name', coalesce(p_def ->> 'state', 'testing'), p_def ->> 'semFonteMotivo',
    coalesce(p_def ->> 'scope', 'conta'), coalesce((p_def ->> 'capUsd')::numeric, 0.50), (p_def ->> 'capCredits')::integer,
    coalesce((p_def ->> 'cadenceHours')::integer, 24), coalesce((p_def ->> 'maxAccounts')::integer, 200), p_def ->> 'notes')
  returning id into v_id;
  for v_step in select * from jsonb_array_elements(coalesce(p_def -> 'steps', '[]'::jsonb)) loop
    insert into private.signal_cascade_steps
      (cascade_id, ordem, kind, handler, actor_id, fallbacks, input_template, price_model, known_price, est_fixed_usd, est_per_item_usd, est_items, max_items)
    values (
      v_id, (v_step ->> 'ordem')::smallint, v_step ->> 'kind', v_step ->> 'handler', v_step ->> 'actorId',
      coalesce(v_step -> 'fallbacks', '[]'::jsonb), coalesce(v_step -> 'inputTemplate', '{}'::jsonb),
      coalesce(v_step ->> 'priceModel', 'NONE'), v_step -> 'knownPrice', coalesce((v_step ->> 'estFixedUsd')::numeric, 0),
      coalesce((v_step ->> 'estPerItemUsd')::numeric, 0), coalesce((v_step ->> 'estItems')::integer, 0), (v_step ->> 'maxItems')::integer);
  end loop;
  return v_id;
end;
$$;

revoke all on function private.seed_signal_cascade(jsonb) from public, anon, authenticated, service_role;

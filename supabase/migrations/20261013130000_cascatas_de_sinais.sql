-- Sinais em cascata (fatia 2): um Sinal é uma cascata de 1..N passos. Cada passo é um actor do Apify, uma fonte pública
-- aberta ou uma regra interna; a saída de um é a entrada do próximo, e a cascata inteira é UM Sinal: uma reserva de
-- crédito, uma execução com N passos e um record_signal por acontecimento no fim.
--
-- Modelo (Decisão 7): tabelas novas de cascata. O registro de actors (private.signal_actors, um actor por Sinal) segue
-- como está para os 9 Sinais de lançamento e para tudo o que já usa `signal_type` único; as cascatas entram ao lado, no
-- mesmo catálogo de tipos (private.signal_catalog), e o relógio, o catálogo e a criação de Monitoramento passam a olhar os
-- dois ("rodável": actor disponível OU cascata disponível). Nenhum dado é apagado nem renomeado; não há mudança no
-- `unique` de signal_actors.
--
--   private.signal_cascades          a cascata de um tipo de Sinal: ICP, estado (testing|available|sem_fonte|disabled),
--                                    multiplicador de preço, tetos e a cadência sugerida
--   private.signal_cascade_steps     os passos, na ordem; actor, alternativas, preço conhecido (interno) e modelo de
--                                    preço (aluguel nunca entra)
--   private.signal_cascade_runs      uma execução: reserva, custo estimado e real, créditos cobrados, erro amigável
--   private.signal_cascade_run_steps cada tentativa de cada passo: run id, actor, build, conta usada (índice, nunca o
--                                    token), itens, custo real, status HTTP e o erro real truncado e sem segredo
--
-- Nada disto sai em RPC lido pela tela nem em ferramenta do Hermes: todas as funções abaixo são do servidor. O motivo de
-- "sem fonte", o erro amigável e os nomes não citam o fornecedor (checks no banco).

-- 1. Ajustes globais do custo: quanto vale um crédito e o teto do dia.
create table private.signal_cascade_settings (
  singleton boolean primary key default true check (singleton),
  -- O preço de um crédito, em dólar de PREÇO ao usuário (custo Apify × multiplicador). Com o multiplicador 3 e US$ 0,30,
  -- 1 crédito paga US$ 0,10 de custo da fonte: a régua da consulta de CNPJ (US$ 0,0002 por 1 crédito) é só piso.
  usd_per_credit numeric(8, 4) not null default 0.30 check (usd_per_credit > 0),
  -- O teto de créditos que as cascatas de um Workspace gastam por dia (UTC), somando reservado e liquidado.
  daily_credit_cap integer not null default 50 check (daily_credit_cap >= 0),
  updated_at timestamptz not null default now()
);
insert into private.signal_cascade_settings default values;
alter table private.signal_cascade_settings enable row level security;
revoke all on private.signal_cascade_settings from public, anon, authenticated, service_role;

-- A ação de crédito da cascata: 1 unidade = 1 crédito; a quantidade é o custo × multiplicador ÷ preço do crédito.
insert into private.credit_action_prices (action, credits, description) values
  ('cascata_de_sinais', 1, 'Um crédito de uma busca de Sinais em várias fontes (custo real da fonte × multiplicador)');

-- A tabela de preços da tela não mostra a ação interna.
create or replace function public.list_credit_action_prices()
returns table (action text, credits numeric, description text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.action, c.credits, c.description from private.credit_action_prices c
  where c.action not in ('account_discovery', 'cnpj_receita', 'cascata_de_sinais')
  order by c.action;
$$;

revoke all on function public.list_credit_action_prices() from public, anon;
grant execute on function public.list_credit_action_prices() to authenticated;

-- 2. Validações compartilhadas.
create function private.texto_sem_marca(p_texto text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_texto is null or p_texto !~* '(apify|\yactors?\y)';
$$;

-- Um token do Apify (apify_api_...) ou um cabeçalho Bearer nunca fica gravado.
create function private.texto_sem_segredo(p_texto text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_texto is null or p_texto !~* '(apify_api_[a-z0-9]{10,}|bearer +[a-z0-9._~+/=-]{20,})';
$$;

-- Os modelos de preço que o plano Free aceita: pagamento por evento ou por resultado, só computação, ou grátis. O aluguel
-- (FLAT_PRICE_PER_MONTH) nunca entra.
create function private.modelo_de_preco_free(p_modelo text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_modelo in ('PAY_PER_EVENT', 'PRICE_PER_DATASET_ITEM', 'COMPUTE_ONLY', 'FREE');
$$;

-- As alternativas de um passo: cada uma é um actor (com o modelo de preço, que não pode ser aluguel) ou uma fonte pública.
create function private.cascata_alternativas_validas(p_alternativas jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_alternativas) = 'array' and not exists (
    select 1 from jsonb_array_elements(p_alternativas) a
    where jsonb_typeof(a) <> 'object'
      or not (
        (a ->> 'kind' = 'actor'
          and coalesce(a ->> 'actorId', '') ~ '^[A-Za-z0-9_.-]+~[A-Za-z0-9_.-]+$'
          and private.modelo_de_preco_free(a ->> 'priceModel'))
        or (a ->> 'kind' = 'fonte_publica' and coalesce(a ->> 'source', '') ~ '^[a-z][a-z0-9_]{1,60}$')));
$$;

revoke all on function private.texto_sem_marca(text) from public, anon, authenticated, service_role;
revoke all on function private.texto_sem_segredo(text) from public, anon, authenticated, service_role;
revoke all on function private.modelo_de_preco_free(text) from public, anon, authenticated, service_role;
revoke all on function private.cascata_alternativas_validas(jsonb) from public, anon, authenticated, service_role;

-- 3. As cascatas.
create table private.signal_cascades (
  id uuid primary key default gen_random_uuid(),
  signal_type text not null unique check (signal_type ~ '^[a-z][a-z0-9_]{1,60}$'),
  icp text not null check (icp ~ '^[A-H]$'),
  name text not null check (btrim(name) <> '' and length(name) <= 120 and private.texto_sem_marca(name)),
  version integer not null default 1 check (version >= 1),
  -- testing: ainda sem execução real; available: passou na execução real; sem_fonte: não há fonte boa (resultado válido,
  -- nunca falha); disabled: tirada do ar.
  state text not null default 'testing' check (state in ('testing', 'available', 'sem_fonte', 'disabled')),
  sem_fonte_motivo text check (sem_fonte_motivo is null or (length(sem_fonte_motivo) <= 500 and private.texto_sem_marca(sem_fonte_motivo))),
  -- conta: o Sinal é de uma Conta do Workspace; mercado: acontece no mercado todo (Comex Stat, DOU, Plano Safra) e não
  -- vai para uma Conta.
  scope text not null default 'conta' check (scope in ('conta', 'mercado')),
  -- O preço ao usuário é o custo real da fonte × este multiplicador.
  price_multiplier numeric(6, 2) not null default 3 check (price_multiplier >= 1),
  -- O teto rígido de uma execução: nenhum passo começa se o custo acumulado mais a estimativa do passo passar dele.
  cap_usd numeric(8, 4) not null default 0.50 check (cap_usd > 0 and cap_usd <= 50),
  cap_credits integer check (cap_credits is null or cap_credits > 0),
  -- A cadência sugerida de um Monitoramento deste Sinal, em horas.
  cadence_hours integer not null default 24 check (cadence_hours between 1 and 8760),
  max_accounts integer not null default 200 check (max_accounts between 1 and 500),
  notes text check (notes is null or length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (state <> 'sem_fonte' or sem_fonte_motivo is not null)
);

alter table private.signal_cascades enable row level security;
revoke all on private.signal_cascades from public, anon, authenticated, service_role;

create table private.signal_cascade_steps (
  cascade_id uuid not null references private.signal_cascades(id) on delete cascade,
  ordem smallint not null check (ordem between 1 and 12),
  kind text not null check (kind in ('actor', 'fonte_publica', 'regra')),
  -- Quem implementa o passo no servidor (a função que monta a entrada e lê o resultado).
  handler text not null check (handler ~ '^[a-z][a-z0-9_]{1,60}$'),
  actor_id text check (actor_id is null or actor_id ~ '^[A-Za-z0-9_.-]+~[A-Za-z0-9_.-]+$'),
  -- O que roda quando o principal falha: actors (cada um com o modelo de preço) ou fontes públicas.
  fallbacks jsonb not null default '[]'::jsonb check (private.cascata_alternativas_validas(fallbacks)),
  input_template jsonb not null default '{}'::jsonb check (jsonb_typeof(input_template) = 'object' and length(input_template::text) <= 20000),
  -- O modelo de preço do actor. Aluguel (FLAT_PRICE_PER_MONTH) nunca é aceito: não roda no plano Free.
  price_model text not null default 'NONE' check (price_model = 'NONE' or private.modelo_de_preco_free(price_model)),
  -- O preço como a fonte o publica e de onde veio: interno, nunca sai para a tela nem para o Hermes.
  known_price jsonb,
  -- A estimativa: valor fixo por execução, valor por item cobrado e quantos itens se espera. O teto de itens vai ao actor.
  est_fixed_usd numeric(10, 6) not null default 0 check (est_fixed_usd >= 0),
  est_per_item_usd numeric(10, 6) not null default 0 check (est_per_item_usd >= 0),
  est_items integer not null default 0 check (est_items >= 0),
  max_items integer check (max_items is null or max_items between 1 and 1000),
  primary key (cascade_id, ordem),
  check ((kind = 'actor') = (actor_id is not null)),
  check (kind <> 'actor' or price_model <> 'NONE'),
  check (kind = 'actor' or price_model in ('NONE', 'FREE'))
);

alter table private.signal_cascade_steps enable row level security;
revoke all on private.signal_cascade_steps from public, anon, authenticated, service_role;

-- Um Sinal sem fonte não tem passos (e uma cascata com passos não vira "sem fonte" sem antes tirá-los).
create function private.cascata_sem_fonte_sem_passos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'signal_cascade_steps' then
    if exists (select 1 from private.signal_cascades c where c.id = new.cascade_id and c.state = 'sem_fonte') then
      raise exception 'a signal without a source has no steps' using errcode = '23514';
    end if;
  elsif new.state = 'sem_fonte' and exists (select 1 from private.signal_cascade_steps s where s.cascade_id = new.id) then
    raise exception 'a signal without a source has no steps' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.cascata_sem_fonte_sem_passos() from public, anon, authenticated, service_role;

create trigger signal_cascade_steps_sem_fonte before insert or update on private.signal_cascade_steps
  for each row execute function private.cascata_sem_fonte_sem_passos();
create trigger signal_cascades_sem_fonte before update of state on private.signal_cascades
  for each row execute function private.cascata_sem_fonte_sem_passos();

-- A cascata entra no catálogo de tipos de Sinal (Monitoramentos e Sinais apontam para ele); um tipo não tem actor e
-- cascata ao mesmo tempo, nem é interno.
create function private.put_signal_cascade_in_catalog()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from private.signal_actors a where a.signal_type = new.signal_type)
    or exists (select 1 from private.signal_catalog c where c.signal_type = new.signal_type and c.origin <> 'externo') then
    raise exception 'a signal type has either an actor or a cascade' using errcode = '23514';
  end if;
  insert into private.signal_catalog (signal_type, origin) values (new.signal_type, 'externo')
  on conflict (signal_type) do nothing;
  return new;
end;
$$;

revoke all on function private.put_signal_cascade_in_catalog() from public, anon, authenticated, service_role;

create trigger signal_cascades_in_catalog before insert on private.signal_cascades
  for each row execute function private.put_signal_cascade_in_catalog();

alter table private.signal_cascades
  add constraint signal_cascades_signal_type_catalog_fkey foreign key (signal_type) references private.signal_catalog(signal_type);

-- 4. As execuções.
create table private.signal_cascade_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  cascade_id uuid not null references private.signal_cascades(id),
  origin text not null check (origin in ('conversa', 'monitor', 'rotina')),
  monitor_id uuid references private.signal_monitors(id) on delete set null,
  requested_by uuid references auth.users(id) on delete set null,
  -- Repetir o pedido com a mesma chave devolve esta execução, sem cobrar nem gravar Sinal de novo.
  idempotency_key text not null check (length(idempotency_key) between 1 and 300),
  reservation_id uuid references private.credit_reservations(id) on delete set null,
  state text not null default 'running' check (state in ('running', 'succeeded', 'partial', 'aborted', 'failed')),
  est_cost_usd numeric(10, 6) not null check (est_cost_usd >= 0),
  est_credits integer not null check (est_credits >= 0),
  cap_usd numeric(10, 6) not null check (cap_usd > 0),
  real_cost_usd numeric(14, 6) check (real_cost_usd is null or real_cost_usd >= 0),
  credits_charged integer check (credits_charged is null or credits_charged >= 0),
  matched_items integer not null default 0 check (matched_items >= 0),
  signals_new integer not null default 0 check (signals_new >= 0),
  signals_repeated integer not null default 0 check (signals_repeated >= 0),
  -- O motivo da falha ou do aborto, em palavras do produto (sem o fornecedor).
  friendly_error text check (friendly_error is null or (length(friendly_error) <= 500 and private.texto_sem_marca(friendly_error))),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (workspace_id, idempotency_key)
);

create index signal_cascade_runs_workspace_idx on private.signal_cascade_runs (workspace_id, started_at desc);
create index signal_cascade_runs_cascade_idx on private.signal_cascade_runs (cascade_id);
create index signal_cascade_runs_monitor_idx on private.signal_cascade_runs (monitor_id) where monitor_id is not null;
create index signal_cascade_runs_reservation_idx on private.signal_cascade_runs (reservation_id);
create index signal_cascade_runs_requested_by_idx on private.signal_cascade_runs (requested_by);

alter table private.signal_cascade_runs enable row level security;
revoke all on private.signal_cascade_runs from public, anon, authenticated, service_role;

create table private.signal_cascade_run_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references private.signal_cascade_runs(id) on delete cascade,
  ordem smallint not null,
  -- 1 é o actor principal; 2 em diante, as alternativas, na ordem.
  attempt smallint not null default 1 check (attempt >= 1),
  handler text not null,
  kind text not null check (kind in ('actor', 'fonte_publica', 'regra')),
  actor_id text,
  actor_build text,
  apify_run_id text,
  -- Qual conta do Apify rodou (0 = APIFY_TOKEN, 1 = APIFY_TOKEN_2...). Nunca o token.
  token_index smallint check (token_index is null or token_index >= 0),
  items_in integer not null default 0 check (items_in >= 0),
  items_out integer not null default 0 check (items_out >= 0),
  cost_usd numeric(14, 6) check (cost_usd is null or cost_usd >= 0),
  http_status smallint,
  -- O erro real, truncado e sem segredo, para quem investiga; nunca sai do servidor.
  real_error text check (real_error is null or (length(real_error) <= 2000 and private.texto_sem_segredo(real_error))),
  state text not null default 'running' check (state in ('running', 'succeeded', 'empty', 'failed', 'skipped', 'aborted_cap')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (run_id, ordem, attempt)
);

alter table private.signal_cascade_run_steps enable row level security;
revoke all on private.signal_cascade_run_steps from public, anon, authenticated, service_role;

-- 5. Leitura para o servidor.
-- A definição de uma cascata (e dos passos, na ordem), ou nulo.
create function public.signal_cascade_for_type(p_signal_type text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id, 'signalType', c.signal_type, 'icp', c.icp, 'name', c.name, 'version', c.version, 'state', c.state,
    'semFonteMotivo', c.sem_fonte_motivo, 'scope', c.scope, 'multiplier', c.price_multiplier, 'capUsd', c.cap_usd,
    'capCredits', c.cap_credits, 'cadenceHours', c.cadence_hours, 'maxAccounts', c.max_accounts,
    'steps', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ordem', s.ordem, 'kind', s.kind, 'handler', s.handler, 'actorId', s.actor_id, 'fallbacks', s.fallbacks,
        'inputTemplate', s.input_template, 'priceModel', s.price_model, 'estFixedUsd', s.est_fixed_usd,
        'estPerItemUsd', s.est_per_item_usd, 'estItems', s.est_items, 'maxItems', s.max_items) order by s.ordem)
      from private.signal_cascade_steps s where s.cascade_id = c.id), '[]'::jsonb))
  from private.signal_cascades c where c.signal_type = p_signal_type;
$$;

-- O catálogo de Sinais por cascata, sem nada técnico: o que o Hermes pode oferecer e explicar.
create function public.signal_cascade_catalog()
returns table (signal_type text, icp text, name text, state text, scope text, sem_fonte_motivo text, cadence_hours integer)
language sql
stable
security definer
set search_path = ''
as $$
  select c.signal_type, c.icp, c.name, c.state, c.scope, c.sem_fonte_motivo, c.cadence_hours
  from private.signal_cascades c order by c.icp, c.signal_type;
$$;

create function public.signal_cascade_settings()
returns table (usd_per_credit numeric, daily_credit_cap integer)
language sql
stable
security definer
set search_path = ''
as $$
  select s.usd_per_credit, s.daily_credit_cap from private.signal_cascade_settings s;
$$;

-- As Contas ativas de um Workspace (todas, ou as pedidas) para a cascata casar com o resultado. Só as do Workspace.
create function public.signal_cascade_accounts(p_workspace_id uuid, p_account_ids uuid[], p_limit integer default 200)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', x.id, 'name', x.name, 'domain', x.domain, 'linkedinUrl', x.linkedin_url, 'cnpj', x.legal_identifier) order by x.name, x.id), '[]'::jsonb)
  from (
    select t.id, t.name, t.domain, t.linkedin_url, t.legal_identifier
    from public.target_accounts t
    where t.workspace_id = p_workspace_id and t.archived_at is null and t.deleted_at is null
      and (p_account_ids is null or t.id = any (p_account_ids))
    order by t.name, t.id
    limit least(greatest(coalesce(p_limit, 200), 1), 500)
  ) x;
$$;

-- Muda o estado de uma cascata depois de testada (ou a tira do ar). Só o servidor.
create function public.set_signal_cascade_state(p_signal_type text, p_state text, p_version text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v private.signal_cascades%rowtype;
begin
  if p_state not in ('testing', 'available', 'disabled') then
    raise exception 'invalid state' using errcode = '22023';
  end if;
  select * into v from private.signal_cascades c where c.signal_type = p_signal_type for update;
  if not found then
    raise exception 'cascade not found' using errcode = 'P0002';
  end if;
  if v.state = 'sem_fonte' then
    raise exception 'a signal without a source cannot be enabled' using errcode = '55000';
  end if;
  if p_state = 'available' and not exists (select 1 from private.signal_cascade_steps s where s.cascade_id = v.id) then
    raise exception 'a cascade without steps cannot be available' using errcode = '55000';
  end if;
  update private.signal_cascades set state = p_state, version = coalesce(nullif(p_version, '')::integer, version), updated_at = now()
  where id = v.id;
end;
$$;

-- 6. Abrir e fechar uma execução. Reserva a estimativa, confere os tetos e devolve o que fazer:
--   go            roda; em_andamento: a execução com esta chave já existe e não terminou; done: já terminou;
--   sem_fonte, em_teste, indisponivel, sem_cascata   nada é reservado;
--   no_credits    sem saldo ou no limite mensal de quem pede;
--   limite_diario o teto de créditos do dia das cascatas do Workspace;
--   ja_rodou_hoje o Monitoramento automático roda uma vez por dia;
--   confirmar, sem_teto, teto_atingido  o automático não roda (só a origem monitor).
create function public.begin_cascade_run(
  p_workspace_id uuid,
  p_user_id uuid,
  p_signal_type text,
  p_origin text,
  p_monitor_id uuid,
  p_key text,
  p_est_usd numeric,
  p_cap_credits integer default null,
  p_allow_testing boolean default false
) returns table (outcome text, run_id uuid, reservation_id uuid, est_credits integer, cap_usd numeric)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_c private.signal_cascades%rowtype;
  v_set private.signal_cascade_settings%rowtype;
  v_existing private.signal_cascade_runs%rowtype;
  v_cap numeric;
  v_est numeric;
  v_credits integer;
  v_user uuid;
  v_res uuid;
  v_cap_state text;
  v_today numeric;
  v_run uuid;
begin
  if p_origin not in ('conversa', 'monitor', 'rotina') or p_key is null or btrim(p_key) = ''
    or p_est_usd is null or p_est_usd < 0 or (p_cap_credits is not null and p_cap_credits < 1) then
    raise exception 'invalid cascade request' using errcode = '22023';
  end if;
  if not exists (select 1 from public.workspaces w where w.id = p_workspace_id) then
    raise exception 'workspace not found' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtext('cascade:' || p_workspace_id::text || ':' || p_key));

  select * into v_c from private.signal_cascades c where c.signal_type = p_signal_type;
  if not found then
    return query select 'sem_cascata'::text, null::uuid, null::uuid, 0, 0::numeric;
    return;
  end if;
  if v_c.state = 'sem_fonte' then
    return query select 'sem_fonte'::text, null::uuid, null::uuid, 0, 0::numeric;
    return;
  end if;
  if v_c.state = 'disabled' then
    return query select 'indisponivel'::text, null::uuid, null::uuid, 0, 0::numeric;
    return;
  end if;
  if v_c.state = 'testing' and not coalesce(p_allow_testing, false) then
    return query select 'em_teste'::text, null::uuid, null::uuid, 0, 0::numeric;
    return;
  end if;

  select * into v_existing from private.signal_cascade_runs r where r.workspace_id = p_workspace_id and r.idempotency_key = p_key;
  if found then
    -- Uma execução presa (a função caiu no meio) há mais de 20 minutos é fechada como falha, liberando a reserva; a chave
    -- fica gasta: quem quiser tentar de novo usa outra chave.
    if v_existing.state = 'running' and v_existing.started_at < now() - interval '20 minutes' then
      perform public.finish_cascade_run(v_existing.id, 'failed', null, 0, 0, 0, 'A busca anterior não terminou; tente de novo.');
      select * into v_existing from private.signal_cascade_runs r where r.id = v_existing.id;
    end if;
    return query select case v_existing.state when 'running' then 'em_andamento' else 'done' end, v_existing.id,
      v_existing.reservation_id, v_existing.est_credits, v_existing.cap_usd;
    return;
  end if;

  select * into v_set from private.signal_cascade_settings;
  -- O teto rígido da execução, em dólar: o da cascata e, se menor, o que quem pede aceita pagar em créditos.
  v_cap := v_c.cap_usd;
  if v_c.cap_credits is not null then
    v_cap := least(v_cap, v_c.cap_credits * v_set.usd_per_credit / v_c.price_multiplier);
  end if;
  if p_cap_credits is not null then
    v_cap := least(v_cap, p_cap_credits * v_set.usd_per_credit / v_c.price_multiplier);
  end if;
  v_est := least(p_est_usd, v_cap);
  v_credits := greatest(1, ceil(v_est * v_c.price_multiplier / v_set.usd_per_credit)::integer);

  if p_origin = 'monitor' and exists (
    select 1 from private.signal_cascade_runs r
    where r.workspace_id = p_workspace_id and r.cascade_id = v_c.id and r.origin = 'monitor'
      and r.monitor_id is not distinct from p_monitor_id and r.state <> 'failed'
      and r.started_at >= date_trunc('day', now())) then
    return query select 'ja_rodou_hoje'::text, null::uuid, null::uuid, 0, 0::numeric;
    return;
  end if;

  select coalesce(sum(case when r.status = 'settled' then r.unit_credits * r.settled_quantity else r.amount end), 0)
  into v_today
  from private.credit_reservations r
  where r.workspace_id = p_workspace_id and r.action = 'cascata_de_sinais' and r.status in ('reserved', 'settled')
    and r.created_at >= date_trunc('day', now());
  if v_today + v_credits > v_set.daily_credit_cap then
    return query select 'limite_diario'::text, null::uuid, null::uuid, 0, 0::numeric;
    return;
  end if;

  v_user := case when p_user_id is not null and exists (
    select 1 from public.workspace_memberships m where m.workspace_id = p_workspace_id and m.user_id = p_user_id and m.active
  ) then p_user_id end;
  begin
    v_res := public.reserve_credits(p_workspace_id, v_user, 'cascata_de_sinais', 'cascade:' || p_key, v_credits, false);
  exception when others then
    if sqlerrm in ('insufficient credits', 'monthly credit limit reached') then
      return query select 'no_credits'::text, null::uuid, null::uuid, 0, 0::numeric;
      return;
    end if;
    raise;
  end;

  if p_origin = 'monitor' then
    v_cap_state := public.consume_automation_cap(p_workspace_id, 'acao:varredura', v_credits);
    if v_cap_state <> 'ok' then
      delete from private.credit_reservations where id = v_res;
      return query select v_cap_state, null::uuid, null::uuid, 0, 0::numeric;
      return;
    end if;
  end if;

  insert into private.signal_cascade_runs
    (workspace_id, cascade_id, origin, monitor_id, requested_by, idempotency_key, reservation_id, est_cost_usd, est_credits, cap_usd)
  values (p_workspace_id, v_c.id, p_origin, p_monitor_id, v_user, p_key, v_res, v_est, v_credits, v_cap)
  returning id into v_run;
  return query select 'go'::text, v_run, v_res, v_credits, v_cap;
end;
$$;

-- Fecha a execução e liquida o crédito pelo custo real: custo × multiplicador ÷ preço do crédito, arredondado para baixo
-- (a favor de quem paga), no mínimo 1 quando gerou Sinal novo, e nunca acima do reservado. Falha ou aborto sem custo
-- liberam a reserva; falha parcial cobra só o consumido. Custo desconhecido: cobra a estimativa só se gerou Sinal novo.
-- Repetir devolve o mesmo resultado, sem cobrar de novo.
create function public.finish_cascade_run(
  p_run_id uuid,
  p_state text,
  p_real_cost_usd numeric,
  p_matched integer,
  p_signals_new integer,
  p_signals_repeated integer,
  p_friendly_error text
) returns table (credits_charged integer, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_run private.signal_cascade_runs%rowtype;
  v_c private.signal_cascades%rowtype;
  v_set private.signal_cascade_settings%rowtype;
  v_res private.credit_reservations%rowtype;
  v_credits integer;
begin
  if p_state not in ('succeeded', 'partial', 'aborted', 'failed') then
    raise exception 'invalid state' using errcode = '22023';
  end if;
  if p_real_cost_usd is not null and (p_real_cost_usd < 0 or p_real_cost_usd > 100000) then
    raise exception 'invalid cost' using errcode = '22023';
  end if;
  select * into v_run from private.signal_cascade_runs r where r.id = p_run_id for update;
  if not found then
    raise exception 'cascade run not found' using errcode = 'P0002';
  end if;
  if v_run.state <> 'running' then
    return query select coalesce(v_run.credits_charged, 0), v_run.state;
    return;
  end if;
  select * into v_c from private.signal_cascades c where c.id = v_run.cascade_id;
  select * into v_set from private.signal_cascade_settings;
  select * into v_res from private.credit_reservations r where r.id = v_run.reservation_id;

  if coalesce(p_real_cost_usd, 0) = 0 and (p_state = 'failed' or p_real_cost_usd is not null) then
    v_credits := 0;
  elsif p_real_cost_usd is null then
    v_credits := case when coalesce(p_signals_new, 0) > 0 then v_run.est_credits else 0 end;
  else
    v_credits := floor(p_real_cost_usd * v_c.price_multiplier / v_set.usd_per_credit)::integer;
  end if;
  if coalesce(p_signals_new, 0) > 0 then
    v_credits := greatest(v_credits, 1);
  end if;
  v_credits := least(v_credits, v_run.est_credits);
  if v_res.id is not null then
    v_credits := least(v_credits, v_res.quantity);
  end if;

  if v_res.id is not null and v_res.status = 'reserved' then
    perform public.settle_credits(v_res.id, v_credits);
    if v_run.origin = 'monitor' and v_res.amount - v_credits * v_res.unit_credits > 0 then
      perform private.refund_automation_cap(v_run.workspace_id, 'acao:varredura', v_res.amount - v_credits * v_res.unit_credits);
    end if;
  elsif v_res.id is not null and v_res.status = 'released' then
    v_credits := 0;
  end if;

  update private.signal_cascade_runs set
    state = p_state, real_cost_usd = p_real_cost_usd, credits_charged = v_credits,
    matched_items = greatest(coalesce(p_matched, 0), 0), signals_new = greatest(coalesce(p_signals_new, 0), 0),
    signals_repeated = greatest(coalesce(p_signals_repeated, 0), 0),
    friendly_error = left(nullif(p_friendly_error, ''), 500), finished_at = now()
  where id = p_run_id;
  return query select v_credits, p_state;
end;
$$;

-- O rastro de cada tentativa de cada passo: abre antes de chamar a fonte e fecha com o que aconteceu.
create function public.start_cascade_step(
  p_run_id uuid, p_ordem integer, p_attempt integer, p_handler text, p_kind text, p_actor_id text, p_items_in integer
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from private.signal_cascade_runs r where r.id = p_run_id) then
    raise exception 'cascade run not found' using errcode = 'P0002';
  end if;
  insert into private.signal_cascade_run_steps (run_id, ordem, attempt, handler, kind, actor_id, items_in)
  values (p_run_id, p_ordem, greatest(coalesce(p_attempt, 1), 1), p_handler, p_kind, p_actor_id, greatest(coalesce(p_items_in, 0), 0))
  on conflict (run_id, ordem, attempt) do update set started_at = private.signal_cascade_run_steps.started_at
  returning id into v_id;
  return v_id;
end;
$$;

create function public.finish_cascade_step(
  p_step_id uuid, p_state text, p_apify_run_id text, p_build text, p_token_index integer, p_items_out integer,
  p_cost_usd numeric, p_http_status integer, p_real_error text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_id uuid;
  v_actor text;
begin
  if p_state not in ('succeeded', 'empty', 'failed', 'skipped', 'aborted_cap') then
    raise exception 'invalid state' using errcode = '22023';
  end if;
  update private.signal_cascade_run_steps set
    state = p_state, apify_run_id = left(p_apify_run_id, 100), actor_build = left(p_build, 50), token_index = p_token_index,
    items_out = greatest(coalesce(p_items_out, 0), 0), cost_usd = p_cost_usd, http_status = p_http_status,
    real_error = left(nullif(p_real_error, ''), 2000), finished_at = now()
  where id = p_step_id
  returning run_id, actor_id into v_run_id, v_actor;
  if not found then
    raise exception 'cascade step not found' using errcode = 'P0002';
  end if;
  -- O custo real do run vai também para o relatório de custos (uma linha por run do Apify; repetir não duplica).
  if p_apify_run_id is not null and p_cost_usd is not null and v_actor is not null then
    insert into private.action_costs (workspace_id, action_type, provider, model_or_actor, input_units, cost_usd, source_ref)
    select r.workspace_id, 'apify_actor', 'apify', v_actor, greatest(coalesce(p_items_out, 0), 0), p_cost_usd, p_apify_run_id
    from private.signal_cascade_runs r where r.id = v_run_id
    on conflict (action_type, source_ref) do nothing;
  end if;
end;
$$;

revoke all on function public.signal_cascade_for_type(text) from public, anon, authenticated;
revoke all on function public.signal_cascade_catalog() from public, anon, authenticated;
revoke all on function public.signal_cascade_settings() from public, anon, authenticated;
revoke all on function public.signal_cascade_accounts(uuid, uuid[], integer) from public, anon, authenticated;
revoke all on function public.set_signal_cascade_state(text, text, text) from public, anon, authenticated;
revoke all on function public.begin_cascade_run(uuid, uuid, text, text, uuid, text, numeric, integer, boolean) from public, anon, authenticated;
revoke all on function public.finish_cascade_run(uuid, text, numeric, integer, integer, integer, text) from public, anon, authenticated;
revoke all on function public.start_cascade_step(uuid, integer, integer, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.finish_cascade_step(uuid, text, text, text, integer, integer, numeric, integer, text) from public, anon, authenticated;
grant execute on function public.signal_cascade_for_type(text) to service_role;
grant execute on function public.signal_cascade_catalog() to service_role;
grant execute on function public.signal_cascade_settings() to service_role;
grant execute on function public.signal_cascade_accounts(uuid, uuid[], integer) to service_role;
grant execute on function public.set_signal_cascade_state(text, text, text) to service_role;
grant execute on function public.begin_cascade_run(uuid, uuid, text, text, uuid, text, numeric, integer, boolean) to service_role;
grant execute on function public.finish_cascade_run(uuid, text, numeric, integer, integer, integer, text) to service_role;
grant execute on function public.start_cascade_step(uuid, integer, integer, text, text, text, integer) to service_role;
grant execute on function public.finish_cascade_step(uuid, text, text, text, integer, integer, numeric, integer, text) to service_role;

-- 7. O relógio, o catálogo e o Monitoramento passam a olhar as cascatas além dos actors.
-- "Rodável": o actor do tipo está disponível, ou a cascata do tipo está.
create function private.signal_type_is_runnable(p_signal_type text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.signal_actors a where a.signal_type = p_signal_type and a.state = 'available')
    or exists (select 1 from private.signal_cascades c where c.signal_type = p_signal_type and c.state = 'available');
$$;

revoke all on function private.signal_type_is_runnable(text) from public, anon, authenticated, service_role;

-- Redefinida a partir de 20260930180000: o actor disponível passa a ser "rodável".
create or replace function private.signal_monitors_due()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.signal_monitors m
    where private.signal_type_is_runnable(m.signal_type)
      and m.state = 'ativo' and m.next_run_at <= now() and (m.claimed_until is null or m.claimed_until < now()));
$$;

-- Redefinida a partir de 20260930221000: "rodável" no lugar do join com o actor, e o CNPJ da Conta entra em cada Conta
-- do público (a cascata o usa para consultar a Receita).
create or replace function public.claim_due_signal_monitors(p_limit integer default 5)
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
    where private.signal_type_is_runnable(m.signal_type)
      and m.state = 'ativo' and m.next_run_at <= now() and (m.claimed_until is null or m.claimed_until < now())
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
      select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'domain', x.domain, 'linkedinUrl', x.linkedin_url,
          'cnpj', x.legal_identifier, 'contatos', private.signal_scan_contacts(c.workspace_id, x.id))
        order by (((x.pos - 1 - c.scan_offset) % x.total) + x.total) % x.total)
      from (
        select t.id, t.name, t.domain, t.linkedin_url, t.legal_identifier,
          row_number() over (order by t.name, t.id) as pos, count(*) over () as total
        from public.target_accounts t
        where t.workspace_id = c.workspace_id and t.archived_at is null and t.deleted_at is null
          and t.id::text in (select jsonb_array_elements_text(c.audience -> 'accountIds'))
      ) x
    ), '[]'::jsonb)
  from claimed c;
end;
$$;

revoke all on function public.claim_due_signal_monitors(integer) from public, anon, authenticated;
grant execute on function public.claim_due_signal_monitors(integer) to service_role;

-- Redefinida a partir de 20261009050000: a cascata disponível também aceita Monitoramento.
create or replace function private.available_signal_origin(p_signal_type text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select c.origin from private.signal_catalog c
  where c.signal_type = p_signal_type and (
    (c.origin = 'interno' and c.state = 'available')
    or (c.origin = 'externo' and private.signal_type_is_runnable(c.signal_type)));
$$;

-- Redefinida a partir de 20261009050000: o estado de uma cascata aparece no catálogo (sem_fonte e disabled são "out").
create or replace function public.list_signal_catalog()
returns table (signal_type text, origin text, state text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_user();
  return query
  select c.signal_type, c.origin, coalesce(
    c.state, a.state,
    case k.state when 'available' then 'available' when 'testing' then 'testing' when 'sem_fonte' then 'out' when 'disabled' then 'out' end,
    'out')
  from private.signal_catalog c
  left join private.signal_actors a on a.signal_type = c.signal_type
  left join private.signal_cascades k on k.signal_type = c.signal_type
  order by c.origin, c.signal_type;
end;
$$;

revoke all on function public.list_signal_catalog() from public, anon;
grant execute on function public.list_signal_catalog() to authenticated;

-- 8. Diagnóstico de "o Monitoramento nunca roda" (fatia 0): uma linha, só leitura, sem segredo. O Nan a chama no SQL
-- Editor; nenhum RPC da tela a devolve.
create function private.signal_runner_diagnostics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_url boolean;
  v_cron boolean := false;
  v_job boolean := false;
begin
  select s.function_url is not null into v_url from private.signal_runner_settings s;
  v_cron := exists (select 1 from pg_extension where extname = 'pg_cron');
  if v_cron then
    execute 'select exists (select 1 from cron.job where jobname = ''althius-signal-runner'' and active)' into v_job;
  end if;
  return jsonb_build_object(
    'function_url_set', coalesce(v_url, false),
    'pg_cron', v_cron,
    'pg_net', exists (select 1 from pg_extension where extname = 'pg_net'),
    'cron_job_active', v_job,
    'actors_available', (select count(*) from private.signal_actors a where a.state = 'available'),
    'cascades_available', (select count(*) from private.signal_cascades c where c.state = 'available'),
    'monitors_active', (select count(*) from private.signal_monitors m where m.state = 'ativo'),
    'monitors_due', (select count(*) from private.signal_monitors m
      where m.state = 'ativo' and m.next_run_at <= now() and (m.claimed_until is null or m.claimed_until < now())),
    'monitors_runnable_and_due', (select count(*) from private.signal_monitors m
      where private.signal_type_is_runnable(m.signal_type) and m.state = 'ativo' and m.next_run_at <= now()
        and (m.claimed_until is null or m.claimed_until < now())),
    'monitors_never_ran', (select count(*) from private.signal_monitors m where m.state = 'ativo' and m.last_run_at is null),
    'signals', (select count(*) from private.signals));
end;
$$;

revoke all on function private.signal_runner_diagnostics() from public, anon, authenticated, service_role;

-- 9. A primeira cascata: ICP A, vaga de analista de comex (A1). Nasce em teste, como todo actor novo: só passa a
-- "disponível" depois de uma execução real (passo do Nan). Preços da API pública da Apify Store (12/10/2026, faixa Free);
-- os campos de entrada vêm do esquema de entrada publicado de cada actor.
with c as (
  insert into private.signal_cascades (signal_type, icp, name, scope, cap_usd, cadence_hours, notes)
  values ('vaga_comex', 'A', 'Vaga de analista de comex', 'conta', 0.50, 24,
    'Empresas que abriram, há até 7 dias, vaga com termo de comércio exterior, casadas com as Contas-alvo do Workspace.')
  returning id
)
insert into private.signal_cascade_steps
  (cascade_id, ordem, kind, handler, actor_id, fallbacks, input_template, price_model, known_price, est_fixed_usd, est_per_item_usd, est_items, max_items)
select c.id, s.ordem, s.kind, s.handler, s.actor_id, s.fallbacks::jsonb, s.input_template::jsonb, s.price_model, s.known_price::jsonb,
  s.est_fixed_usd, s.est_per_item_usd, s.est_items, s.max_items
from c, (values
  (1::smallint, 'actor', 'linkedin_vagas', 'curious_coder~linkedin-jobs-scraper',
   '[{"kind":"actor","actorId":"valig~linkedin-jobs-scraper","priceModel":"PAY_PER_EVENT","estFixedUsd":0.001,"estPerItemUsd":0.0004},{"kind":"actor","actorId":"zen-studio~gupy-jobs-scraper","priceModel":"PAY_PER_EVENT","estFixedUsd":0.00005,"estPerItemUsd":0.00299}]',
   '{"termos":["analista de comércio exterior","analista de comex","analista de importação","despachante aduaneiro"],"pais":"Brazil","janelaDias":7,"porTermo":25}',
   'PAY_PER_EVENT', '{"fonte":"API pública da Apify Store, 12/10/2026, faixa Free","porResultado":0.002,"porExecucao":0.00005}', 0.00005, 0.002, 100, 100),
  (2::smallint, 'regra', 'confirmar_vaga_comex', null,
   '[]',
   '{"termosConfirmacao":["comercio exterior","comex","importacao","exportacao","despachante","aduaneiro","aduaneira","desembaraco aduaneiro","logistica internacional","foreign trade","import export"],"janelaDias":7}',
   'NONE', null, 0, 0, 0, null),
  (3::smallint, 'actor', 'linkedin_empresa', 'harvestapi~linkedin-company',
   '[]',
   '{}',
   'PAY_PER_EVENT', '{"fonte":"API pública da Apify Store, 12/10/2026, faixa Free","porResultado":0.004,"porExecucao":0.00005}', 0.00005, 0.004, 30, 50),
  (4::smallint, 'regra', 'casar_com_contas', null,
   '[]',
   '{}',
   'NONE', null, 0, 0, 0, null),
  (5::smallint, 'actor', 'cnpj_da_conta', 'johnatan029~cnpj-empresas-brasil-scraper',
   '[{"kind":"fonte_publica","source":"brasilapi_cnpj"}]',
   '{}',
   'PAY_PER_EVENT', '{"fonte":"API pública da Apify Store, 12/10/2026, faixa Free","porResultado":0.0015,"porExecucao":0.00005}', 0.00005, 0.0015, 10, 20)
) as s(ordem, kind, handler, actor_id, fallbacks, input_template, price_model, known_price, est_fixed_usd, est_per_item_usd, est_items, max_items);

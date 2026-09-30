-- O custo real de cada ação (creditos-e-planos, ticket 01): o dado para fechar a tabela de créditos e as cotas dos
-- planos. Cada Execução de Agente grava os tokens e o modelo; cada execução de actor do Apify grava o custo que o Apify
-- devolve. Uma tabela privada, sem dado pessoal (nem pedido, nem Contato, nem pessoa): só o Workspace, o fornecedor, o
-- modelo ou actor, as unidades e o valor. O relatório mensal é só do Administrador.

create table private.action_costs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  occurred_at timestamptz not null default clock_timestamp(),
  -- agent_run: uma Execução de Agente; apify_actor: uma execução de actor do Apify.
  action_type text not null check (action_type in ('agent_run', 'apify_actor')),
  provider text not null check (provider in ('anthropic', 'groq', 'hermes', 'apify', 'other')),
  model_or_actor text not null check (length(model_or_actor) between 1 and 200),
  -- Agente: tokens de entrada e de saída (nulos quando o motor não informa). Apify: perfis consultados (entrada).
  input_units bigint check (input_units >= 0),
  output_units bigint check (output_units >= 0),
  -- O valor em dólar que o fornecedor informou (o Apify informa; os modelos, não): nulo quando não se sabe.
  cost_usd numeric(14, 6) check (cost_usd >= 0),
  -- A Execução ou a execução do actor de onde vem o registro: repetir o registro não duplica.
  source_ref text not null check (length(source_ref) between 1 and 200),
  unique (action_type, source_ref)
);

create index action_costs_workspace_idx on private.action_costs (workspace_id, occurred_at);

-- Os preços por milhão de tokens de cada modelo, quando alguém os informa (a partir da página de preços do provedor).
-- Nasce vazia: sem preço, o relatório mostra os tokens e deixa a estimativa em branco, em vez de inventar um valor.
create table private.model_prices (
  model text primary key check (length(model) between 1 and 200),
  input_usd_per_million numeric(12, 4) not null check (input_usd_per_million >= 0),
  output_usd_per_million numeric(12, 4) not null check (output_usd_per_million >= 0),
  updated_at timestamptz not null default now()
);

alter table private.action_costs enable row level security;
alter table private.model_prices enable row level security;
revoke all on private.action_costs from public, anon, authenticated, service_role;
revoke all on private.model_prices from public, anon, authenticated, service_role;

-- O fornecedor de um modelo gravado na Execução: "groq/<modelo>", "hermes" ou "claude-...".
create function private.provider_of_model(p_model text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_model like 'groq/%' then 'groq'
    when p_model = 'hermes' then 'hermes'
    when p_model like 'claude-%' then 'anthropic'
    else 'other'
  end;
$$;

revoke all on function private.provider_of_model(text) from public, anon, authenticated, service_role;

-- Registra o custo de uma Execução de Agente já fechada: os tokens vêm dos eventos dela (payload.uso), somados. Repetir
-- não duplica. Uma Execução em andamento ainda não tem custo fechado.
create function public.record_agent_run_cost(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run private.agent_runs%rowtype;
  v_input bigint;
  v_output bigint;
begin
  select * into v_run from private.agent_runs r where r.id = p_run_id;
  if not found then
    raise exception 'run not found' using errcode = 'P0002';
  end if;
  if v_run.status not in ('succeeded', 'failed') then
    raise exception 'run is not finished' using errcode = '55000';
  end if;
  select
    sum((e.payload -> 'uso' ->> 'entrada')::bigint) filter (where (e.payload -> 'uso' ->> 'entrada') ~ '^[0-9]{1,15}$'),
    sum((e.payload -> 'uso' ->> 'saida')::bigint) filter (where (e.payload -> 'uso' ->> 'saida') ~ '^[0-9]{1,15}$')
  into v_input, v_output
  from private.agent_run_events e
  where e.run_id = p_run_id and jsonb_typeof(e.payload -> 'uso') = 'object';
  insert into private.action_costs
    (workspace_id, action_type, provider, model_or_actor, input_units, output_units, source_ref)
  values (v_run.workspace_id, 'agent_run', private.provider_of_model(v_run.model),
    coalesce(v_run.model, 'desconhecido'), v_input, v_output, p_run_id::text)
  on conflict (action_type, source_ref) do nothing;
end;
$$;

-- Registra o custo de uma busca de foto (actor do Apify) com o valor que o Apify informou; nulo quando não informou.
create function public.record_apify_lookup_cost(p_lookup_id uuid, p_cost_usd numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lookup private.contact_photo_lookups%rowtype;
begin
  select * into v_lookup from private.contact_photo_lookups l where l.id = p_lookup_id;
  if not found then
    raise exception 'lookup not found' using errcode = 'P0002';
  end if;
  if p_cost_usd is not null and (p_cost_usd < 0 or p_cost_usd > 100000) then
    raise exception 'invalid cost' using errcode = '22023';
  end if;
  insert into private.action_costs
    (workspace_id, action_type, provider, model_or_actor, input_units, cost_usd, source_ref)
  values (v_lookup.workspace_id, 'apify_actor', 'apify', coalesce(v_lookup.actor_id, 'desconhecido'), 1, p_cost_usd,
    coalesce(v_lookup.run_id, v_lookup.id::text))
  on conflict (action_type, source_ref) do nothing;
end;
$$;

-- O custo do mês do Workspace por tipo de ação, fornecedor e modelo ou actor. Só o Administrador lê.
create function public.get_cost_report(p_workspace_id uuid, p_month date default (now() at time zone 'utc')::date)
returns table (
  action_type text,
  provider text,
  model_or_actor text,
  actions bigint,
  input_units bigint,
  output_units bigint,
  recorded_cost_usd numeric,
  estimated_cost_usd numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := date_trunc('month', p_month::timestamp) at time zone 'utc';
begin
  if private.require_active_membership(p_workspace_id) <> 'admin' then
    raise exception 'only administrators can read costs' using errcode = '42501';
  end if;
  return query
    select c.action_type, c.provider, c.model_or_actor,
      count(*)::bigint,
      sum(c.input_units)::bigint,
      sum(c.output_units)::bigint,
      sum(c.cost_usd),
      -- Só quando há preço do modelo e tokens conhecidos: sem isso, em branco, nunca um valor inventado.
      case when max(p.model) is not null and bool_and(c.input_units is not null and c.output_units is not null)
        then sum(c.input_units * p.input_usd_per_million / 1000000.0 + c.output_units * p.output_usd_per_million / 1000000.0)
      end
    from private.action_costs c
    left join private.model_prices p on p.model = c.model_or_actor and c.action_type = 'agent_run'
    where c.workspace_id = p_workspace_id
      and c.occurred_at >= v_start and c.occurred_at < v_start + interval '1 month'
    group by c.action_type, c.provider, c.model_or_actor
    order by c.action_type, c.provider, c.model_or_actor;
end;
$$;

revoke all on function public.record_agent_run_cost(uuid) from public, anon, authenticated;
revoke all on function public.record_apify_lookup_cost(uuid, numeric) from public, anon, authenticated;
revoke all on function public.get_cost_report(uuid, date) from public, anon;
grant execute on function public.record_agent_run_cost(uuid) to service_role;
grant execute on function public.record_apify_lookup_cost(uuid, numeric) to service_role;
grant execute on function public.get_cost_report(uuid, date) to authenticated;

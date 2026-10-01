-- A busca de Contas pelo ICP (enriquecimento-em-cascata): o que o banco decide antes e depois de a Edge Function
-- `account-discovery` rodar o Actor do Apify. Antes: o custo em Créditos mostrado à pessoa e a reserva do saldo; uma busca
-- de cada vez por Workspace; um Actor "em teste" só roda para um Administrador que pede o modo de teste. Depois: a busca
-- se fecha, e o crédito só é debitado se ela trouxe empresa (os Créditos da busca vêm do mesmo saldo, dos mesmos limites
-- por pessoa e da mesma regra de reservar, liquidar e liberar da varredura de Sinais). Uma busca que ninguém fechou
-- (a função caiu no meio) vence em 15 minutos e solta a reserva.
--
-- Preço provisório, como os outros: 5 Créditos por até 50 empresas pedidas (o Apify cobra de US$ 0,002 a US$ 0,004 por
-- empresa). A Edge Function só roda a busca depois de reservar; e a reserva é a prova de que a pessoa viu o custo
-- (a tela o mostra antes do clique, por `quote_account_discovery`).

insert into private.credit_action_prices (action, credits, description) values
  ('account_discovery', 5, 'Uma busca de Contas candidatas pelo ICP (até 50 empresas; 100 contam duas)');

-- A consulta do catálogo de ações provisórias (ADR-0019) preserva as cinco ações base acordadas na sabatina;
-- a descoberta tem o seu orçamento próprio cotado por quote_account_discovery.
create or replace function public.list_credit_action_prices()
returns table (action text, credits numeric, description text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.action, c.credits, c.description from private.credit_action_prices c
  where c.action <> 'account_discovery'
  order by c.action;
$$;

revoke all on function public.list_credit_action_prices() from public, anon;
grant execute on function public.list_credit_action_prices() to authenticated;

-- Quantos blocos de 50 empresas a busca pede: o preço é por bloco.
create function private.discovery_blocks(p_max_results integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select greatest(ceil(coalesce(p_max_results, 1) / 50.0)::integer, 1);
$$;

revoke all on function private.discovery_blocks(integer) from public, anon, authenticated, service_role;

-- A busca que ninguém fechou vence: a de empresas em andamento há mais de 15 minutos falha, sem cobrar, e solta o
-- saldo; o pedido de Agente que ninguém confirmou em 7 dias é cancelado. Devolve quantas buscas mudaram.
create function private.expire_stale_discovery_runs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run record;
  v_count integer := 0;
  v_vencidos integer;
begin
  for v_run in
    update private.discovery_runs set
      state = 'falhou', finished_at = now(), last_error = 'A busca não terminou a tempo. Nada foi cobrado.'
    where state = 'em_andamento' and started_at < now() - interval '15 minutes'
    returning reservation_id
  loop
    v_count := v_count + 1;
    if v_run.reservation_id is not null and exists (
      select 1 from private.credit_reservations c where c.id = v_run.reservation_id and c.status = 'reserved'
    ) then
      perform public.release_credits(v_run.reservation_id);
    end if;
  end loop;
  update private.discovery_runs set state = 'cancelada', finished_at = now(),
    last_error = 'O pedido venceu sem confirmação.'
  where state = 'aguardando_confirmacao' and created_at < now() - interval '7 days';
  get diagnostics v_vencidos = row_count;
  return v_count + v_vencidos;
end;
$$;

revoke all on function private.expire_stale_discovery_runs() from public, anon, authenticated, service_role;

-- O custo antes do clique: quantos Créditos a busca custa, o saldo disponível, se já há uma busca em andamento, em que
-- estado está o Actor (disponível, em teste ou nenhum) e se quem pergunta pode rodar em modo de teste.
create function public.quote_account_discovery(p_workspace_id uuid, p_max_results integer default 50)
returns table (credits numeric, available numeric, in_progress boolean, actor_state text, can_test boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_role text := private.require_active_membership(p_workspace_id);
  v_price numeric;
begin
  perform private.expire_stale_discovery_runs();
  select c.credits into v_price from private.credit_action_prices c where c.action = 'account_discovery';
  return query select
    v_price * private.discovery_blocks(p_max_results),
    (select t.booked - t.reserved from private.credit_totals(p_workspace_id) t),
    exists (
      select 1 from private.discovery_runs r
      where r.workspace_id = p_workspace_id and r.kind = 'contas' and r.state = 'em_andamento'),
    case
      when exists (select 1 from private.discovery_actors a where a.purpose = 'buscar_contas' and a.state = 'available') then 'available'
      when exists (select 1 from private.discovery_actors a where a.purpose = 'buscar_contas' and a.state = 'testing') then 'testing'
      else 'none' end,
    v_role = 'admin';
end;
$$;

-- Abre a busca de empresas. Quem pede é quem tem a Participação ativa (a sessão dele; o crédito sai do Workspace e
-- entra no limite mensal dele). Devolve:
--   go        a busca começou e o saldo ficou reservado: a Edge Function roda o Actor;
--   existing  essa chave (ou esse pedido de Agente) já tinha busca: nada é rodado nem cobrado de novo.
-- Recusas (a Edge Function as traduz): 'insufficient credits' e 'monthly credit limit reached' (P0001), uma busca já
-- em andamento (55006), Actor fora do registro (P0002), fora do ar ou ainda em teste sem o aval de um Administrador
-- (55000), filtros inválidos (22023). `p_run_id` confirma um pedido que um Agente propôs: os filtros são os dele.
create function public.begin_account_discovery(
  p_workspace_id uuid,
  p_request_key text,
  p_criteria jsonb,
  p_max_results integer,
  p_actor_id text,
  p_icp_version integer default null,
  p_allow_testing boolean default false,
  p_run_id uuid default null
) returns table (run_id uuid, outcome text, reservation_id uuid, state text, actor_version text, max_cost_usd numeric)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_role text := private.require_active_membership(p_workspace_id);
  v_user uuid := auth.uid();
  v_actor private.discovery_actors%rowtype;
  v_run private.discovery_runs%rowtype;
  v_criteria jsonb := p_criteria;
  v_max integer := p_max_results;
  v_id uuid;
  v_res uuid;
  v_price numeric;
begin
  perform private.expire_stale_discovery_runs();

  if p_request_key is not null and (length(btrim(p_request_key)) = 0 or length(p_request_key) > 100) then
    raise exception 'invalid request key' using errcode = '22023';
  end if;
  if p_request_key is not null then
    select * into v_run from private.discovery_runs r
    where r.workspace_id = p_workspace_id and r.request_key = p_request_key;
    if found then
      return query select v_run.id, 'existing'::text, v_run.reservation_id, v_run.state, v_run.actor_version, null::numeric;
      return;
    end if;
  end if;

  if p_run_id is not null then
    select * into v_run from private.discovery_runs r
    where r.id = p_run_id and r.workspace_id = p_workspace_id and r.kind = 'contas'
    for update;
    if not found then
      raise exception 'discovery run not found' using errcode = 'P0002';
    end if;
    if v_run.state = 'em_andamento' then
      return query select v_run.id, 'existing'::text, v_run.reservation_id, v_run.state, v_run.actor_version, null::numeric;
      return;
    end if;
    if v_run.state <> 'aguardando_confirmacao' then
      raise exception 'the discovery request is not waiting for confirmation' using errcode = '55000';
    end if;
    v_criteria := v_run.criteria;
    v_max := v_run.max_results;
  end if;

  if v_criteria is null or jsonb_typeof(v_criteria) <> 'object' or length(v_criteria::text) > 20000
    or v_max is null or v_max not between 1 and 100 then
    raise exception 'invalid discovery criteria' using errcode = '22023';
  end if;

  select * into v_actor from private.discovery_actors a where a.purpose = 'buscar_contas' and a.actor_id = p_actor_id;
  if not found then
    raise exception 'discovery actor not found' using errcode = 'P0002';
  end if;
  if v_actor.state = 'out' then
    raise exception 'discovery actor is out' using errcode = '55000';
  end if;
  if v_actor.state = 'testing' and not (coalesce(p_allow_testing, false) and v_role = 'admin') then
    raise exception 'discovery actor is still in testing' using errcode = '55000';
  end if;

  if exists (
    select 1 from private.discovery_runs r
    where r.workspace_id = p_workspace_id and r.kind = 'contas' and r.state = 'em_andamento'
  ) then
    raise exception 'a discovery is already running' using errcode = '55006';
  end if;

  v_id := coalesce(p_run_id, gen_random_uuid());
  v_res := public.reserve_credits(p_workspace_id, v_user, 'account_discovery', 'discovery:' || v_id::text,
    private.discovery_blocks(v_max));
  select c.credits * private.discovery_blocks(v_max) into v_price
  from private.credit_action_prices c where c.action = 'account_discovery';

  begin
    if p_run_id is null then
      insert into private.discovery_runs (
        id, workspace_id, kind, requested_by, state, request_key, icp_version, criteria, max_results, actor_id,
        actor_version, estimated_credits, estimated_cost_usd, reservation_id, started_at)
      values (
        v_id, p_workspace_id, 'contas', v_user, 'em_andamento', p_request_key, p_icp_version, v_criteria, v_max,
        v_actor.actor_id, v_actor.version, v_price, v_actor.max_cost_usd, v_res, now());
    else
      update private.discovery_runs set
        state = 'em_andamento', requested_by = v_user, request_key = coalesce(request_key, p_request_key),
        icp_version = coalesce(icp_version, p_icp_version), actor_id = v_actor.actor_id,
        actor_version = v_actor.version, estimated_credits = v_price, estimated_cost_usd = v_actor.max_cost_usd,
        reservation_id = v_res, started_at = now()
      where id = v_id;
    end if;
  exception when unique_violation then
    raise exception 'a discovery is already running' using errcode = '55006';
  end;
  return query select v_id, 'go'::text, v_res, 'em_andamento'::text, v_actor.version, v_actor.max_cost_usd;
end;
$$;

-- Fecha a busca. Só o servidor. `p_success` diz que o Actor rodou; o crédito só é debitado se ela trouxe ao menos
-- uma empresa (nova ou repetida), e só pelos blocos de 50 que de fato vieram. Sem empresa, ou com falha, o saldo
-- reservado volta. O custo real que o Apify informou (nulo se não informou) fica na busca. Fechar de novo não faz nada.
create function public.finish_account_discovery(
  p_run_id uuid,
  p_success boolean,
  p_apify_run_id text,
  p_cost_usd numeric,
  p_error text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v private.discovery_runs%rowtype;
  v_reserved integer;
begin
  select * into v from private.discovery_runs r where r.id = p_run_id for update;
  if not found then
    raise exception 'discovery run not found' using errcode = 'P0002';
  end if;
  if v.state <> 'em_andamento' then
    return;
  end if;
  if p_cost_usd is not null and (p_cost_usd < 0 or p_cost_usd > 100000) then
    raise exception 'invalid cost' using errcode = '22023';
  end if;
  if v.reservation_id is not null and exists (
    select 1 from private.credit_reservations c where c.id = v.reservation_id and c.status = 'reserved'
  ) then
    if p_success and v.found > 0 then
      select c.quantity into v_reserved from private.credit_reservations c where c.id = v.reservation_id;
      perform public.settle_credits(v.reservation_id, least(v_reserved, private.discovery_blocks(v.found)));
    else
      perform public.release_credits(v.reservation_id);
    end if;
  end if;
  update private.discovery_runs set
    state = case when p_success then 'concluida' else 'falhou' end,
    finished_at = now(),
    apify_run_id = coalesce(nullif(left(btrim(coalesce(p_apify_run_id, '')), 200), ''), apify_run_id),
    actual_cost_usd = p_cost_usd,
    last_error = nullif(left(btrim(coalesce(p_error, '')), 500), '')
  where id = v.id;
end;
$$;

-- O custo real de uma execução do Apify de descoberta, para o relatório de custos (creditos-e-planos 01). Só o servidor.
create function public.record_discovery_cost(
  p_workspace_id uuid,
  p_actor_id text,
  p_run_id text,
  p_items integer,
  p_cost_usd numeric
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.workspaces w where w.id = p_workspace_id) then
    raise exception 'workspace not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from private.discovery_actors a where a.actor_id = p_actor_id) then
    raise exception 'actor not found' using errcode = 'P0002';
  end if;
  if p_cost_usd is not null and (p_cost_usd < 0 or p_cost_usd > 100000) then
    raise exception 'invalid cost' using errcode = '22023';
  end if;
  if p_run_id is null or length(btrim(p_run_id)) = 0 then
    raise exception 'run id required' using errcode = '22023';
  end if;
  insert into private.action_costs
    (workspace_id, action_type, provider, model_or_actor, input_units, cost_usd, source_ref)
  values (p_workspace_id, 'apify_actor', 'apify', p_actor_id, greatest(coalesce(p_items, 0), 0), p_cost_usd, p_run_id)
  on conflict (action_type, source_ref) do nothing;
end;
$$;

revoke all on function public.quote_account_discovery(uuid, integer) from public, anon;
revoke all on function public.begin_account_discovery(uuid, text, jsonb, integer, text, integer, boolean, uuid) from public, anon;
revoke all on function public.finish_account_discovery(uuid, boolean, text, numeric, text) from public, anon, authenticated;
revoke all on function public.record_discovery_cost(uuid, text, text, integer, numeric) from public, anon, authenticated;
grant execute on function public.quote_account_discovery(uuid, integer) to authenticated;
grant execute on function public.begin_account_discovery(uuid, text, jsonb, integer, text, integer, boolean, uuid) to authenticated;
grant execute on function public.finish_account_discovery(uuid, boolean, text, numeric, text) to service_role;
grant execute on function public.record_discovery_cost(uuid, text, text, integer, numeric) to service_role;

-- A busca que ficou presa vence mesmo que ninguém abra a tela: o relógio do banco a encerra a cada 10 minutos, onde o
-- pg_cron existe (no Supabase e no CI, que roda a imagem dele).
do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('althius-discovery-expire', '*/10 * * * *', 'select private.expire_stale_discovery_runs()');
  end if;
end
$cron$;

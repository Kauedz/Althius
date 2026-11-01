-- Sinal descrito em texto no mercado endereçável, sem exigir Contas (Trilha C, ticket 5a).
-- O Plano do Sinal passa a aceitar escopo {"tipo":"mercado"} para Abertura de vagas (vaga_linkedin), o único tipo que roda
-- no mercado (gatilho do Monitoramento de mercado, 20261114120000). save_signal_plan grava o público como
-- {"escopo":"mercado","accountIds":[]} e o Monitoramento fica em rascunho; nicho e país são conferidos ao ativar, pelas
-- mesmas regras do editor (validate_market_criteria). Espelho de supabase/functions/_shared/plano-do-sinal/plano.ts.
-- Mesmas assinaturas e permissões; o resto das duas funções é idêntico às definições anteriores.

create or replace function private.validate_signal_plan(p_workspace_id uuid, p_plan jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scope jsonb;
  v_signals jsonb;
  v_signal jsonb;
  v_type text;
  v_ids jsonb;
  v_item jsonb;
  v_id uuid;
  v_seen uuid[] := '{}';
  v_origin text;
begin
  if p_plan is null or jsonb_typeof(p_plan) <> 'object'
    or length(p_plan::text) > private.signal_plan_limit('plan_max_chars')
  then
    raise exception 'invalid signal plan' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_plan) k
    where k not in ('versao', 'origem', 'escopo', 'sinais', 'explicacao', 'maxEmpresasPorRodada', 'modeloId')
  ) then
    raise exception 'invalid signal plan' using errcode = '22023';
  end if;
  if p_plan -> 'versao' is distinct from '1'::jsonb then
    raise exception 'invalid signal plan' using errcode = '22023';
  end if;
  if jsonb_typeof(p_plan -> 'origem') is distinct from 'string'
    or (p_plan ->> 'origem') not in ('briefing', 'modelo', 'formulario')
  then
    raise exception 'invalid signal plan' using errcode = '22023';
  end if;
  v_origin := p_plan ->> 'origem';
  if jsonb_typeof(p_plan -> 'explicacao') is distinct from 'string'
    or length(p_plan ->> 'explicacao') > private.signal_plan_limit('explanation_max')
  then
    raise exception 'invalid signal plan' using errcode = '22023';
  end if;
  if jsonb_typeof(p_plan -> 'maxEmpresasPorRodada') is distinct from 'number' then
    raise exception 'invalid signal plan' using errcode = '22023';
  end if;
  if (p_plan ->> 'maxEmpresasPorRodada')::numeric <> trunc((p_plan ->> 'maxEmpresasPorRodada')::numeric)
    or (p_plan ->> 'maxEmpresasPorRodada')::numeric not between private.signal_plan_limit('per_round_min') and private.signal_plan_limit('per_round_max')
  then
    raise exception 'invalid signal plan' using errcode = '22023';
  end if;
  if p_plan ? 'modeloId' and (v_origin <> 'modelo' or jsonb_typeof(p_plan -> 'modeloId') <> 'string'
    or btrim(p_plan ->> 'modeloId') = '' or length(p_plan ->> 'modeloId') > private.signal_plan_limit('seed_max'))
  then
    raise exception 'invalid signal plan' using errcode = '22023';
  end if;

  -- O Sinal: exatamente um (DECISÃO PENDENTE 8), de um tipo disponível, com os critérios desse tipo.
  v_signals := p_plan -> 'sinais';
  if jsonb_typeof(v_signals) is distinct from 'array'
    or jsonb_array_length(v_signals) <> private.signal_plan_limit('signals_per_plan')
  then
    raise exception 'invalid signal plan' using errcode = '22023';
  end if;
  v_signal := v_signals -> 0;
  if jsonb_typeof(v_signal) is distinct from 'object' then
    raise exception 'invalid signal plan' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(v_signal) k where k not in ('tipo', 'criterios'))
    or jsonb_typeof(v_signal -> 'tipo') is distinct from 'string'
  then
    raise exception 'invalid signal plan' using errcode = '22023';
  end if;
  v_type := v_signal ->> 'tipo';
  if private.signal_plan_criteria_keys(v_type) is null
    or not exists (select 1 from private.signal_actors a where a.signal_type = v_type and a.state = 'available')
  then
    raise exception 'signal type is not available' using errcode = '55000';
  end if;
  perform private.validate_signal_plan_criteria(v_type, coalesce(v_signal -> 'criterios', '{}'::jsonb));

  -- O escopo: Contas escolhidas ou o mercado endereçável. No mercado não há Conta e só Abertura de vagas
  -- (vaga_linkedin) roda; os critérios passam também pelos limites do Monitoramento de mercado.
  v_scope := p_plan -> 'escopo';
  if jsonb_typeof(v_scope) is distinct from 'object' then
    raise exception 'invalid signal plan' using errcode = '22023';
  end if;
  if v_scope ->> 'tipo' = 'mercado' then
    if exists (select 1 from jsonb_object_keys(v_scope) k where k <> 'tipo') or v_type <> 'vaga_linkedin' then
      raise exception 'invalid signal plan' using errcode = '22023';
    end if;
    perform private.validate_market_criteria('rascunho', coalesce(v_signal -> 'criterios', '{}'::jsonb));
    return;
  end if;
  if exists (select 1 from jsonb_object_keys(v_scope) k where k not in ('tipo', 'contaIds'))
    or v_scope ->> 'tipo' is distinct from 'contas'
  then
    raise exception 'invalid signal plan' using errcode = '22023';
  end if;
  v_ids := v_scope -> 'contaIds';
  if jsonb_typeof(v_ids) is distinct from 'array'
    or jsonb_array_length(v_ids) not between 1 and private.signal_plan_limit('accounts_max')
  then
    raise exception 'invalid signal plan' using errcode = '22023';
  end if;
  for v_item in select e from jsonb_array_elements(v_ids) e loop
    if jsonb_typeof(v_item) <> 'string'
      or (v_item #>> '{}') !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
    then
      raise exception 'invalid signal plan' using errcode = '22023';
    end if;
    v_id := (v_item #>> '{}')::uuid;
    if v_id = any (v_seen)
      or not exists (select 1 from public.target_accounts a where a.workspace_id = p_workspace_id and a.id = v_id)
    then
      raise exception 'invalid signal plan' using errcode = '22023';
    end if;
    v_seen := v_seen || v_id;
    perform private.assert_account_operable(p_workspace_id, v_id);
  end loop;
end;
$$;

create or replace function public.save_signal_plan(
  p_workspace_id uuid,
  p_name text,
  p_brief text,
  p_plan jsonb,
  p_monitor_id uuid default null,
  p_created_via text default 'sinais_novo'
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.require_active_membership(p_workspace_id);
  v_brief text := nullif(btrim(coalesce(p_brief, '')), '');
  v_existing private.signal_monitors%rowtype;
  v_id uuid;
  v_type text;
  v_audience jsonb;
  v_criteria jsonb;
  v_origin text;
  v_seed text;
begin
  if p_created_via not in ('sinais_novo', 'composer', 'modelo') then
    raise exception 'invalid signal creation origin' using errcode = '22023';
  end if;
  if v_brief is not null and length(v_brief) > private.signal_plan_limit('brief_max') then
    raise exception 'invalid signal plan' using errcode = '22023';
  end if;
  perform private.validate_signal_plan(p_workspace_id, p_plan);
  v_type := p_plan -> 'sinais' -> 0 ->> 'tipo';
  v_criteria := coalesce(p_plan -> 'sinais' -> 0 -> 'criterios', '{}'::jsonb);
  v_audience := case when p_plan -> 'escopo' ->> 'tipo' = 'mercado'
    then jsonb_build_object('escopo', 'mercado', 'accountIds', '[]'::jsonb)
    else jsonb_build_object('accountIds', p_plan -> 'escopo' -> 'contaIds') end;
  v_origin := p_plan ->> 'origem';
  v_seed := nullif(btrim(coalesce(p_plan ->> 'modeloId', '')), '');
  if p_monitor_id is null then
    perform private.validate_signal_monitor(p_workspace_id, p_name, 'rascunho', v_audience, v_criteria, 24);
    insert into private.signal_monitors
      (workspace_id, signal_type, name, state, audience, criteria, every_hours, created_by,
       brief, plan, plan_version, plan_origin, plan_seed, created_via)
    values (p_workspace_id, v_type, btrim(p_name), 'rascunho', v_audience, v_criteria, 24, auth.uid(),
            v_brief, p_plan, 1, v_origin, v_seed, p_created_via)
    returning id into v_id;
  else
    select * into v_existing from private.signal_monitors m where m.workspace_id = p_workspace_id and m.id = p_monitor_id for update;
    if not found then
      raise exception 'monitor not found' using errcode = 'P0002';
    end if;
    perform private.assert_can_change_monitor(v_role, v_existing.created_by);
    -- O Plano não troca o escopo de um Monitoramento existente (Contas continua Contas; mercado continua mercado).
    if private.monitor_scope(v_existing.audience) <> private.monitor_scope(v_audience) then
      raise exception 'invalid signal plan' using errcode = '22023';
    end if;
    perform private.validate_signal_monitor(p_workspace_id, p_name, v_existing.state, v_audience, v_criteria, v_existing.every_hours);
    update private.signal_monitors set
      signal_type = v_type, name = btrim(p_name), audience = v_audience, criteria = v_criteria, scan_offset = 0,
      brief = v_brief, plan = p_plan, plan_version = v_existing.plan_version + 1, plan_origin = v_origin,
      plan_seed = v_seed, updated_at = now()
    where id = p_monitor_id;
    v_id := p_monitor_id;
  end if;
  return v_id;
end;
$$;

revoke all on function public.save_signal_plan(uuid, text, text, jsonb, uuid, text) from public, anon;
grant execute on function public.save_signal_plan(uuid, text, text, jsonb, uuid, text) to authenticated;
revoke all on function private.validate_signal_plan(uuid, jsonb) from public, anon, authenticated, service_role;

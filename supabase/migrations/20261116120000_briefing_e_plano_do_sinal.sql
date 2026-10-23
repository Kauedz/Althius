-- Briefing e Plano do Sinal (agente-de-sinal 01, escopo Contas escolhidas, parte 1).
--
-- A pessoa escreve o Briefing; a Edge Function `signal-plan` devolve um Plano estruturado e editável (sem gravar); a pessoa
-- revisa e `save_signal_plan` grava o Plano como rascunho do Monitoramento. Nada roda, nada é cobrado e nada é ativado:
-- o Briefing nunca chega ao `signal-runner`, que segue lendo `criteria`, `audience` e `signal_type` como sempre.
--
-- 1. `private.signal_monitors` ganha `brief`, `plan`, `plan_version`, `plan_origin` e `plan_seed` (colunas novas, anuláveis
--    ou com padrão; nenhum dado é tocado).
-- 2. `private.validate_signal_plan` confere o Plano no servidor (o mesmo contrato de `_shared/plano-do-sinal`): o tipo é
--    um actor `available`, as Contas são do Workspace e estão operáveis, os limites valem. Plano inválido é recusado com
--    código claro e sem detalhe interno.
-- 3. `public.save_signal_plan` deriva `signal_type`, `audience` e `criteria` do Plano e passa por
--    `private.validate_signal_monitor`, então valem as mesmas regras do editor. Nunca ativa; incrementa `plan_version`.
-- 4. `public.list_signal_monitors` ganha `brief`, `plan`, `plan_version` e `plan_origin` (as colunas antigas seguem iguais).
-- 5. `private.signal_plan_requests` e `public.begin_signal_plan_request` limitam a geração do Plano: não cobra crédito, mas
--    há um teto por Workspace nas últimas 24 horas (DECISÃO PENDENTE 13, em `private.signal_plan_limit`).
--
-- Redefinidas a partir da definição mais recente: public.list_signal_monitors e public.save_signal_monitor
-- (20261009050000_sinais_internos_das_interacoes.sql). A segunda só ganha uma coisa: o Plano guardado deixa de valer
-- quando o tipo, o público ou os critérios mudam por fora do Plano (o editor), para o Plano nunca divergir do que roda.

-- 1. As colunas.
alter table private.signal_monitors
  add column brief text check (brief is null or length(brief) <= 1000),
  add column plan jsonb check (plan is null or length(plan::text) <= 20000),
  add column plan_version integer not null default 0 check (plan_version >= 0),
  add column plan_origin text check (plan_origin is null or plan_origin in ('briefing', 'modelo', 'formulario')),
  add column plan_seed text check (plan_seed is null or length(plan_seed) <= 80);

comment on column private.signal_monitors.brief is
  'O Briefing que a pessoa escreveu. É dado: nunca vai ao signal-runner e nunca escolhe fonte, preço nem limite.';
comment on column private.signal_monitors.plan is
  'O Plano do Sinal v1 (_shared/plano-do-sinal): o tipo e os critérios que viraram signal_type, audience e criteria.';
comment on column private.signal_monitors.plan_version is
  'Quantas vezes o Plano foi gravado (0: o Monitoramento nunca teve Plano).';
comment on column private.signal_monitors.plan_seed is
  'O id do Modelo de Sinal de onde o Plano veio, quando plan_origin é modelo (os Modelos chegam num lote seguinte).';

-- 2. Os limites, num lugar só do banco. Os mesmos números de _shared/plano-do-sinal/limites.ts (um teste confere).
create function private.signal_plan_limit(p_name text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_name
    when 'brief_max' then 1000
    when 'explanation_max' then 600
    when 'plan_max_chars' then 20000
    when 'signals_per_plan' then 1                -- DECISÃO PENDENTE 8
    when 'accounts_max' then 50                   -- DECISÃO PENDENTE 10
    when 'per_round_min' then 1                   -- DECISÃO PENDENTE 10
    when 'per_round_max' then 100                 -- DECISÃO PENDENTE 10
    when 'custom_text_max' then 60
    when 'custom_roles_max' then 10
    when 'list_items_max' then 30
    when 'keywords_max' then 200
    when 'seed_max' then 80
    when 'plans_per_day' then 20                  -- DECISÃO PENDENTE 13
  end;
$$;

revoke all on function private.signal_plan_limit(text) from public, anon, authenticated, service_role;

-- Os campos de critério que o adaptador de cada Sinal de Conta lê (signal-runner/adaptadores). Tipo sem linha aqui não
-- entra no Plano, mesmo disponível. Os mesmos de _shared/plano-do-sinal/campos.ts (um teste confere).
create function private.signal_plan_criteria_keys(p_signal_type text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_signal_type
    when 'vaga_linkedin' then array['funcoes', 'senioridade', 'localizacao', 'periodo', 'palavras', 'nicho', 'nichoCustom']
    when 'vaga_indeed' then array['funcoes', 'senioridade', 'localizacao', 'periodo', 'palavras', 'nicho', 'nichoCustom']
    when 'mudanca_de_emprego' then array['cargos', 'movimento', 'periodo']
    when 'nova_lideranca' then array['cargos', 'movimento', 'pessoas', 'localizacao', 'periodo']
    when 'entradas_e_saidas' then array['cargos', 'movimento', 'pessoas', 'localizacao', 'periodo']
    when 'anuncio_de_movimentacao' then array['cargos', 'movimento', 'pessoas', 'periodo']
    when 'anuncio_linkedin' then array['localizacao', 'periodo', 'palavras']
    when 'anuncio_meta' then array['localizacao', 'periodo', 'palavras']
    when 'anuncio_google' then array['localizacao', 'periodo']
    when 'avaliacoes_google_maps' then array['nota', 'periodo', 'palavras']
    when 'crescimento_de_equipes' then array[]::text[]
    when 'publicacao_da_empresa' then array['periodo']
  end;
$$;

revoke all on function private.signal_plan_criteria_keys(text) from public, anon, authenticated, service_role;

-- As opções prontas de "Cargos" (Sinais de pessoas), sem acento e sem caixa.
create function private.signal_plan_ready_titles()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array(select private.normalized_role(r) from unnest(array[
    'CDO', 'CTO', 'VP de Engenharia', 'Head de Dados', 'CFO', 'Procurement'
  ]) r);
$$;

revoke all on function private.signal_plan_ready_titles() from public, anon, authenticated, service_role;

-- Uma escolha entre opções fechadas (texto) ou várias (lista sem repetir).
create function private.signal_plan_choice_ok(p_value jsonb, p_options text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p_value) = 'string' then (p_value #>> '{}') = any (p_options) else false end;
$$;

create function private.signal_plan_multi_choice_ok(p_value jsonb, p_options text[])
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_item jsonb;
  v_seen text[] := '{}';
begin
  if jsonb_typeof(p_value) <> 'array' then
    return false;
  end if;
  for v_item in select e from jsonb_array_elements(p_value) e loop
    if jsonb_typeof(v_item) <> 'string' or not ((v_item #>> '{}') = any (p_options)) or (v_item #>> '{}') = any (v_seen) then
      return false;
    end if;
    v_seen := v_seen || (v_item #>> '{}');
  end loop;
  return true;
end;
$$;

-- Cargos ou funções: até 60 caracteres cada, nenhum repetido (sem acento e sem caixa), e até 10 escritos pela pessoa fora
-- das opções prontas (os mesmos limites de validate_market_criteria e de criterios-custom.ts).
create function private.signal_plan_roles_ok(p_value jsonb, p_ready text[])
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_item jsonb;
  v_key text;
  v_seen text[] := '{}';
  v_custom integer := 0;
begin
  if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) > private.signal_plan_limit('list_items_max') then
    return false;
  end if;
  for v_item in select e from jsonb_array_elements(p_value) e loop
    if jsonb_typeof(v_item) <> 'string'
      or length(btrim(v_item #>> '{}')) > private.signal_plan_limit('custom_text_max')
    then
      return false;
    end if;
    v_key := private.normalized_role(v_item #>> '{}');
    if v_key = '' or v_key = any (v_seen) then
      return false;
    end if;
    v_seen := v_seen || v_key;
    if not (v_key = any (p_ready)) then
      v_custom := v_custom + 1;
    end if;
  end loop;
  return v_custom <= private.signal_plan_limit('custom_roles_max');
end;
$$;

revoke all on function private.signal_plan_choice_ok(jsonb, text[]) from public, anon, authenticated, service_role;
revoke all on function private.signal_plan_multi_choice_ok(jsonb, text[]) from public, anon, authenticated, service_role;
revoke all on function private.signal_plan_roles_ok(jsonb, text[]) from public, anon, authenticated, service_role;

-- Os critérios de um tipo: só os campos que o adaptador dele lê, cada um dentro dos limites.
create function private.validate_signal_plan_criteria(p_signal_type text, p_criteria jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_keys text[] := private.signal_plan_criteria_keys(p_signal_type);
  v_key text;
  v_value jsonb;
  v_ok boolean;
begin
  if v_keys is null or p_criteria is null or jsonb_typeof(p_criteria) <> 'object' then
    raise exception 'invalid signal plan' using errcode = '22023';
  end if;
  for v_key, v_value in select k, v from jsonb_each(p_criteria) as t(k, v) loop
    if not (v_key = any (v_keys)) then
      raise exception 'invalid signal plan' using errcode = '22023';
    end if;
    v_ok := case v_key
      when 'funcoes' then private.signal_plan_roles_ok(v_value, private.suggested_job_roles())
      when 'cargos' then private.signal_plan_roles_ok(v_value, private.signal_plan_ready_titles())
      when 'senioridade' then private.signal_plan_choice_ok(v_value, array['Qualquer', 'Liderança', 'Especialista', 'Pleno e sênior'])
      when 'periodo' then private.signal_plan_choice_ok(v_value, array['Últimos 7 dias', 'Últimos 14 dias', 'Últimos 30 dias', 'Últimos 90 dias'])
      when 'pessoas' then private.signal_plan_choice_ok(v_value, array['Qualquer pessoa no cargo', 'Contatos das Contas-alvo', 'Compradores de negócios ganhos', 'Campeões de negócios perdidos'])
      when 'nota' then private.signal_plan_choice_ok(v_value, array['Qualquer nota', 'Até 3 estrelas', 'Até 2 estrelas'])
      when 'localizacao' then private.signal_plan_multi_choice_ok(v_value, private.market_countries())
      when 'movimento' then private.signal_plan_multi_choice_ok(v_value, array['Chegada', 'Promoção', 'Mudança de empresa'])
      when 'palavras' then jsonb_typeof(v_value) = 'string'
        and length(v_value #>> '{}') <= private.signal_plan_limit('keywords_max')
      when 'nicho' then jsonb_typeof(v_value) = 'string'
        and length(v_value #>> '{}') <= private.signal_plan_limit('custom_text_max')
        and ((v_value #>> '{}') in ('qualquer', 'custom') or (v_value #>> '{}') ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
      when 'nichoCustom' then jsonb_typeof(v_value) = 'string'
        and length(btrim(v_value #>> '{}')) <= private.signal_plan_limit('custom_text_max')
      else false
    end;
    if v_ok is not true then
      raise exception 'invalid signal plan' using errcode = '22023';
    end if;
  end loop;
end;
$$;

revoke all on function private.validate_signal_plan_criteria(text, jsonb) from public, anon, authenticated, service_role;

-- 3. O Plano, conferido no servidor. Os limites e o formato são os de _shared/plano-do-sinal (a fonte do esquema).
--    Recusas: 22023 `invalid signal plan` (formato, limites, Conta que não é do Workspace), 55000 `signal type is not
--    available` (tipo inexistente, em teste ou fora) e 55006 (Conta arquivada ou apagada).
create function private.validate_signal_plan(p_workspace_id uuid, p_plan jsonb)
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

  -- O escopo: só Contas escolhidas por enquanto (o mercado está previsto no esquema, mas não é oferecido).
  v_scope := p_plan -> 'escopo';
  if jsonb_typeof(v_scope) is distinct from 'object' then
    raise exception 'invalid signal plan' using errcode = '22023';
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

revoke all on function private.validate_signal_plan(uuid, jsonb) from public, anon, authenticated, service_role;

-- 4. Grava o Plano como rascunho do Monitoramento. A permissão é a de save_signal_monitor: todo participante ativo cria;
--    só quem criou, ou um Administrador, muda. Nunca ativa: o Monitoramento novo nasce em rascunho e o que já existe
--    mantém o estado (ativar segue pelo fluxo de hoje). A ordem dos parâmetros põe o `p_monitor_id` por último porque
--    ele é o único com padrão.
create function public.save_signal_plan(
  p_workspace_id uuid,
  p_name text,
  p_brief text,
  p_plan jsonb,
  p_monitor_id uuid default null
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
  if v_brief is not null and length(v_brief) > private.signal_plan_limit('brief_max') then
    raise exception 'invalid signal plan' using errcode = '22023';
  end if;
  perform private.validate_signal_plan(p_workspace_id, p_plan);
  v_type := p_plan -> 'sinais' -> 0 ->> 'tipo';
  v_criteria := coalesce(p_plan -> 'sinais' -> 0 -> 'criterios', '{}'::jsonb);
  v_audience := jsonb_build_object('accountIds', p_plan -> 'escopo' -> 'contaIds');
  v_origin := p_plan ->> 'origem';
  v_seed := nullif(btrim(coalesce(p_plan ->> 'modeloId', '')), '');

  if p_monitor_id is null then
    perform private.validate_signal_monitor(p_workspace_id, p_name, 'rascunho', v_audience, v_criteria, 24);
    insert into private.signal_monitors
      (workspace_id, signal_type, name, state, audience, criteria, every_hours, created_by,
       brief, plan, plan_version, plan_origin, plan_seed)
    values (p_workspace_id, v_type, btrim(p_name), 'rascunho', v_audience, v_criteria, 24, auth.uid(),
            v_brief, p_plan, 1, v_origin, v_seed)
    returning id into v_id;
  else
    select * into v_existing from private.signal_monitors m where m.workspace_id = p_workspace_id and m.id = p_monitor_id for update;
    if not found then
      raise exception 'monitor not found' using errcode = 'P0002';
    end if;
    perform private.assert_can_change_monitor(v_role, v_existing.created_by);
    -- O Plano é só de Contas escolhidas: um Monitoramento de mercado não vira Plano por aqui.
    if private.monitor_scope(v_existing.audience) <> 'contas' then
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

revoke all on function public.save_signal_plan(uuid, text, text, jsonb, uuid) from public, anon;
grant execute on function public.save_signal_plan(uuid, text, text, jsonb, uuid) to authenticated;

-- 5. O editor segue gravando como sempre. Redefinida a partir de 20261009050000: o único acréscimo é que o Plano guardado
--    deixa de valer quando o tipo, o público ou os critérios mudam por aqui (o Briefing e a versão ficam como estão).
create or replace function public.save_signal_monitor(
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
  v_origin text := private.available_signal_origin(p_signal_type);
  v_existing private.signal_monitors%rowtype;
  v_id uuid;
begin
  if v_origin is null then
    raise exception 'signal type is not available' using errcode = '55000';
  end if;
  perform private.validate_signal_monitor(p_workspace_id, p_name, p_state, p_audience, p_criteria, p_every_hours);
  if v_origin = 'interno' and private.internal_signal_days(p_criteria) is null then
    raise exception 'invalid monitor' using errcode = '22023';
  end if;

  if p_id is null then
    insert into private.signal_monitors
      (workspace_id, signal_type, name, state, audience, criteria, every_hours, created_by, next_run_at)
    values (p_workspace_id, p_signal_type, btrim(p_name), p_state, p_audience, p_criteria, p_every_hours, auth.uid(),
            case when p_state = 'ativo' then now() end)
    returning id into v_id;
  else
    select * into v_existing from private.signal_monitors m where m.workspace_id = p_workspace_id and m.id = p_id for update;
    if not found then
      raise exception 'monitor not found' using errcode = 'P0002';
    end if;
    perform private.assert_can_change_monitor(v_role, v_existing.created_by);
    -- Pausar guarda a hora marcada: retomar antes dela não força uma rodada nova (nem um gasto de crédito).
    update private.signal_monitors set
      signal_type = p_signal_type, name = btrim(p_name), state = p_state, audience = p_audience, criteria = p_criteria,
      every_hours = p_every_hours, scan_offset = 0, updated_at = now(),
      next_run_at = case when p_state = 'ativo' then coalesce(next_run_at, now()) else next_run_at end,
      plan = case when v_existing.signal_type = p_signal_type and v_existing.audience = p_audience
        and v_existing.criteria = p_criteria then v_existing.plan end,
      plan_origin = case when v_existing.signal_type = p_signal_type and v_existing.audience = p_audience
        and v_existing.criteria = p_criteria then v_existing.plan_origin end,
      plan_seed = case when v_existing.signal_type = p_signal_type and v_existing.audience = p_audience
        and v_existing.criteria = p_criteria then v_existing.plan_seed end
    where id = p_id;
    v_id := p_id;
  end if;

  if v_origin = 'interno' and p_state = 'ativo' then
    perform private.run_internal_signal_monitor(v_id);
  end if;
  return v_id;
end;
$$;

-- 6. Os Monitoramentos do Workspace, com o Briefing e o Plano. Redefinida a partir de 20261009050000: as colunas
--    antigas seguem na mesma ordem e as quatro novas vêm no fim, então quem já lê a função não quebra.
drop function public.list_signal_monitors(uuid);

create function public.list_signal_monitors(p_workspace_id uuid)
returns table (
  id uuid, signal_type text, name text, state text, audience jsonb, criteria jsonb, every_hours integer,
  created_by uuid, last_run_at timestamptz, last_error text, created_at timestamptz, last_run jsonb,
  brief text, plan jsonb, plan_version integer, plan_origin text
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
    m.last_error, m.created_at,
    (select jsonb_build_object(
        'state', x.state, 'startedAt', x.started_at, 'finishedAt', x.finished_at, 'accountsChecked', x.accounts_checked,
        'signalsNew', x.signals_new, 'signalsRepeated', x.signals_repeated)
     from private.signal_monitor_runs x
     where x.workspace_id = m.workspace_id and x.monitor_id = m.id
     order by x.started_at desc, x.id desc
     limit 1),
    m.brief, m.plan, m.plan_version, m.plan_origin
  from private.signal_monitors m where m.workspace_id = p_workspace_id
  order by m.created_at, m.id;
end;
$$;

revoke all on function public.list_signal_monitors(uuid) from public, anon;
grant execute on function public.list_signal_monitors(uuid) to authenticated;

-- 7. O limite de Planos por dia. Gerar o Plano não cobra crédito (DECISÃO PENDENTE 13), mas o pedido ao motor tem um teto
--    por Workspace nas últimas 24 horas. A tabela não tem `grant` ao navegador: o acesso é só pelas funções abaixo, com a
--    Participação conferida.
create table private.signal_plan_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  origin text not null default 'briefing' check (origin in ('briefing', 'modelo', 'formulario')),
  -- Como o Plano saiu: pelo motor (ia), pela regra (regra) ou não saiu (falhou). Nulo até a função terminar.
  outcome text check (outcome is null or outcome in ('ia', 'regra', 'falhou')),
  created_at timestamptz not null default now()
);

create index signal_plan_requests_workspace_idx on private.signal_plan_requests (workspace_id, created_at desc);

alter table private.signal_plan_requests enable row level security;
revoke all on private.signal_plan_requests from public, anon, authenticated, service_role;

-- Abre um pedido de Plano: confere a Participação e o limite do dia e devolve o id do pedido e os tipos que o Plano aceita
-- (os actors `available` cujos campos de critério são conhecidos). Todo pedido conta, mesmo o que falha.
create function public.begin_signal_plan_request(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_types jsonb;
begin
  perform private.require_active_membership(p_workspace_id);
  -- Dois pedidos ao mesmo tempo não passam juntos do limite.
  perform pg_advisory_xact_lock(hashtextextended('signal_plan_requests:' || p_workspace_id::text, 0));
  if (select count(*) from private.signal_plan_requests r
      where r.workspace_id = p_workspace_id and r.created_at > now() - interval '24 hours')
     >= private.signal_plan_limit('plans_per_day')
  then
    raise exception 'signal plan daily limit reached' using errcode = '54000';
  end if;
  insert into private.signal_plan_requests (workspace_id, requested_by)
  values (p_workspace_id, auth.uid())
  returning id into v_id;
  select coalesce(jsonb_agg(a.signal_type order by a.signal_type), '[]'::jsonb) into v_types
  from private.signal_actors a
  where a.state = 'available' and private.signal_plan_criteria_keys(a.signal_type) is not null;
  return jsonb_build_object('requestId', v_id, 'tipos', v_types);
end;
$$;

-- Registra como o Plano saiu. Só quem abriu o pedido, no próprio Workspace, e uma vez só.
create function public.finish_signal_plan_request(p_workspace_id uuid, p_request_id uuid, p_outcome text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);
  if p_outcome is null or p_outcome not in ('ia', 'regra', 'falhou') then
    raise exception 'invalid signal plan' using errcode = '22023';
  end if;
  update private.signal_plan_requests r set outcome = p_outcome
  where r.id = p_request_id and r.workspace_id = p_workspace_id and r.requested_by = auth.uid() and r.outcome is null;
  if not found then
    raise exception 'signal plan request not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.begin_signal_plan_request(uuid) from public, anon;
grant execute on function public.begin_signal_plan_request(uuid) to authenticated;
revoke all on function public.finish_signal_plan_request(uuid, uuid, text) from public, anon;
grant execute on function public.finish_signal_plan_request(uuid, uuid, text) to authenticated;

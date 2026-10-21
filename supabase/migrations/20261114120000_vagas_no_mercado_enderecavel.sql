-- Abertura de vagas no mercado endereçável (vagas-mercado-enderecavel): o Monitoramento de Abertura de vagas pode
-- procurar empresas novas que estão contratando os cargos dele no nicho, sem Conta-alvo.
--
-- 1. O público do Monitoramento ganha o escopo: `audience.escopo` é 'contas' (o padrão, o comportamento de sempre) ou
--    'mercado'. No mercado, ativar sem Conta-alvo é permitido, mas exige ao menos um cargo (`criteria.funcoes`) e o país
--    (`criteria.localizacao`); o estado é opcional. O servidor confere os limites da tela (#245): nicho Custom até 60
--    caracteres, cargos de até 60, até 10 cargos Custom e nenhum repetido. Só Abertura de vagas (`vaga_linkedin`) tem
--    mercado, e ativá-lo exige contrato ativo (ou a Equipe, ilimitada). O modo Contas-alvo não muda.
-- 2. A cascata da descoberta (`vaga_mercado`, `market_discovery`): busca as vagas pelos cargos e pelo nicho, confirma
--    cada vaga pelos cargos do Monitoramento, completa site e LinkedIn das empresas que não são Conta e entrega cada uma
--    ao banco (`record_signal_for_company`): Conta vira Sinal da Conta; o resto, candidata da Caixa de Descobertas, com
--    aceite manual. Nada cria Conta nem Sequência, nada envia mensagem. Nasce em teste, como toda cascata nova.
-- 3. O preço é fixo por rodada: `private.market_discovery_credits_per_run()` (4 créditos), reservado por
--    `begin_cascade_run` com `reserve_credits` (contrato ativo, saldo, teto da varredura automática). Fora do Monitoramento
--    de mercado a cascata não roda, e ela não aparece no catálogo de cascatas.
-- 4. A empresa que continua sem site depois do enriquecimento vira candidata pela página do LinkedIn, com a etiqueta
--    "sem site", em vez de sumir.
--
-- Redefinidas a partir da definição mais recente: private.validate_signal_monitor (20260930180000),
-- public.begin_cascade_run (20261020120000), private.record_signal_for_company (20261018110000),
-- public.list_cascade_catalog (20261014130000) e public.signal_cascade_catalog (20261013130000).

-- 1. O escopo do público.
create or replace function private.monitor_scope(p_audience jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(nullif(p_audience ->> 'escopo', ''), 'contas');
$$;

revoke all on function private.monitor_scope(jsonb) from public, anon, authenticated, service_role;

-- O cargo para comparar repetidos: sem acento, sem caixa e com um espaço só.
create or replace function private.normalized_role(p_role text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(lower(translate(coalesce(p_role, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucaaaaaeeeeiiiiooooouuuuc')), '[^a-z0-9]+', ' ', 'g'));
$$;

revoke all on function private.normalized_role(text) from public, anon, authenticated, service_role;

-- As opções de cargo que a tela oferece (a lista geral e as sugestões de cada nicho, `catalogo.ts` e `nichos.ts`). Um
-- cargo fora delas foi escrito pelo usuário (Custom) e conta no limite de 10.
create or replace function private.suggested_job_roles()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array(select private.normalized_role(r) from unnest(array[
    'Engenharia de dados', 'IA e machine learning', 'Plataforma e infraestrutura', 'RevOps e GTM', 'Finanças',
    'Recursos humanos',
    'Analista de comércio exterior', 'Coordenador de importação', 'Especialista em drawback', 'Despachante aduaneiro',
    'Analista fiscal', 'Coordenador tributário', 'Contador', 'Analista de obrigações acessórias',
    'Advogado empresarial', 'Analista jurídico', 'Coordenador de contratos', 'Compliance',
    'Analista de energia', 'Gestor de mercado livre', 'Engenheiro eletricista', 'Comprador de energia',
    'Engenheiro de manutenção', 'Comprador industrial', 'Coordenador de produção', 'Engenheiro de processos',
    'Analista de logística', 'Coordenador de transporte', 'Gerente de centro de distribuição', 'Planejador de rotas',
    'Consultor de benefícios', 'Analista de recursos humanos', 'Coordenador de gente e gestão', 'Gerente de benefícios',
    'Agrônomo', 'Gerente comercial agro', 'Analista de crédito rural', 'Coordenador de compras agrícolas'
  ]) r);
$$;

revoke all on function private.suggested_job_roles() from public, anon, authenticated, service_role;

-- Os países e os estados que o mercado aceita (a "Localização" da tela e os estados do Brasil).
create or replace function private.market_countries()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['Brasil', 'México', 'Colômbia', 'Argentina', 'Chile', 'Estados Unidos'];
$$;

create or replace function private.brazilian_states()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['Acre', 'Alagoas', 'Amapá', 'Amazonas', 'Bahia', 'Ceará', 'Distrito Federal', 'Espírito Santo', 'Goiás',
    'Maranhão', 'Mato Grosso', 'Mato Grosso do Sul', 'Minas Gerais', 'Pará', 'Paraíba', 'Paraná', 'Pernambuco', 'Piauí',
    'Rio de Janeiro', 'Rio Grande do Norte', 'Rio Grande do Sul', 'Rondônia', 'Roraima', 'Santa Catarina', 'São Paulo',
    'Sergipe', 'Tocantins'];
$$;

revoke all on function private.market_countries() from public, anon, authenticated, service_role;
revoke all on function private.brazilian_states() from public, anon, authenticated, service_role;

-- Os critérios do mercado. Os limites valem em qualquer estado; o cargo e o país só são exigidos para ativar.
create or replace function private.validate_market_criteria(p_state text, p_criteria jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_funcoes jsonb := p_criteria -> 'funcoes';
  v_paises jsonb := p_criteria -> 'localizacao';
  v_vistos text[] := '{}';
  v_custom integer := 0;
  v_chave text;
  v_item jsonb;
begin
  if (v_funcoes is not null and jsonb_typeof(v_funcoes) <> 'array')
    or (v_paises is not null and jsonb_typeof(v_paises) <> 'array')
    or (p_criteria ? 'nichoCustom' and (jsonb_typeof(p_criteria -> 'nichoCustom') <> 'string'
      or length(btrim(p_criteria ->> 'nichoCustom')) > 60))
    or (p_criteria ? 'estado' and jsonb_typeof(p_criteria -> 'estado') <> 'null'
      and (jsonb_typeof(p_criteria -> 'estado') <> 'string'
        or (btrim(p_criteria ->> 'estado') <> '' and not (p_criteria ->> 'estado' = any (private.brazilian_states())))))
  then
    raise exception 'market monitor limits exceeded' using errcode = '22023';
  end if;
  for v_item in select e from jsonb_array_elements(coalesce(v_funcoes, '[]'::jsonb)) e loop
    if jsonb_typeof(v_item) <> 'string' or length(btrim(v_item #>> '{}')) > 60 then
      raise exception 'market monitor limits exceeded' using errcode = '22023';
    end if;
    v_chave := private.normalized_role(v_item #>> '{}');
    if v_chave = '' or v_chave = any (v_vistos) then
      raise exception 'market monitor limits exceeded' using errcode = '22023';
    end if;
    v_vistos := v_vistos || v_chave;
    if not (v_chave = any (private.suggested_job_roles())) then
      v_custom := v_custom + 1;
    end if;
  end loop;
  if v_custom > 10 then
    raise exception 'market monitor limits exceeded' using errcode = '22023';
  end if;
  for v_item in select e from jsonb_array_elements(coalesce(v_paises, '[]'::jsonb)) e loop
    if jsonb_typeof(v_item) <> 'string' or not ((v_item #>> '{}') = any (private.market_countries())) then
      raise exception 'market monitor limits exceeded' using errcode = '22023';
    end if;
  end loop;
  -- O estado é do Brasil: com outro país sem o Brasil, não faz sentido.
  if coalesce(btrim(p_criteria ->> 'estado'), '') <> '' and not coalesce(v_paises, '[]'::jsonb) ? 'Brasil' then
    raise exception 'market monitor limits exceeded' using errcode = '22023';
  end if;
  if p_state = 'ativo' and (jsonb_array_length(coalesce(v_funcoes, '[]'::jsonb)) = 0
    or jsonb_array_length(coalesce(v_paises, '[]'::jsonb)) = 0) then
    raise exception 'a market monitor needs at least one role and a country' using errcode = '22023';
  end if;
end;
$$;

revoke all on function private.validate_market_criteria(text, jsonb) from public, anon, authenticated, service_role;

-- Redefinida a partir de 20260930180000: o público aceita `escopo`; no mercado não há Conta-alvo e os critérios são
-- conferidos. Com escopo 'contas' (ou sem escopo), tudo é como antes.
create or replace function private.validate_signal_monitor(
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
    or exists (select 1 from jsonb_object_keys(p_audience) k where k not in ('accountIds', 'escopo'))
    or (p_audience ? 'accountIds' and (jsonb_typeof(p_audience -> 'accountIds') <> 'array'
      or jsonb_array_length(p_audience -> 'accountIds') > 500))
    or (p_audience ? 'escopo' and (jsonb_typeof(p_audience -> 'escopo') <> 'string'
      or p_audience ->> 'escopo' not in ('contas', 'mercado')))
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
  if private.monitor_scope(p_audience) = 'mercado' then
    -- No mercado, o público são as empresas que a busca acha: Conta-alvo escolhida não entra.
    if jsonb_array_length(coalesce(p_audience -> 'accountIds', '[]'::jsonb)) > 0 then
      raise exception 'invalid monitor' using errcode = '22023';
    end if;
    perform private.validate_market_criteria(p_state, p_criteria);
    return;
  end if;
  if p_state = 'ativo' and jsonb_array_length(coalesce(p_audience -> 'accountIds', '[]'::jsonb)) = 0 then
    raise exception 'an active monitor needs at least one target account' using errcode = '22023';
  end if;
end;
$$;

revoke all on function private.validate_signal_monitor(uuid, text, text, jsonb, jsonb, integer)
  from public, anon, authenticated, service_role;

-- O mercado é só de Abertura de vagas, e ligá-lo exige contrato ativo (a Equipe, ilimitada, também liga). A guarda fica na
-- tabela, para valer em toda porta (salvar e mudar o estado). Só olha a passagem para ativo: a rodada do relógio, que não
-- toca no estado, no público nem no tipo, não passa por aqui.
create or replace function private.signal_monitor_market_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.monitor_scope(new.audience) <> 'mercado' then
    return new;
  end if;
  if new.signal_type <> 'vaga_linkedin' then
    raise exception 'the market scope is only for job openings' using errcode = '22023';
  end if;
  if new.state = 'ativo' and (tg_op = 'INSERT' or old.state <> 'ativo' or private.monitor_scope(old.audience) <> 'mercado')
    and private.automation_contract_block(new.workspace_id) is not null then
    raise exception 'the market scope needs an active contract' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.signal_monitor_market_guard() from public, anon, authenticated, service_role;

create trigger signal_monitors_market_guard
  before insert or update of signal_type, state, audience on private.signal_monitors
  for each row execute function private.signal_monitor_market_guard();

-- O escopo de um Monitoramento, para o signal-runner (que reivindica pelo `claim_due_signal_monitors` de sempre).
create or replace function public.signal_monitor_scope(p_monitor_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select private.monitor_scope(m.audience) from private.signal_monitors m where m.id = p_monitor_id;
$$;

revoke all on function public.signal_monitor_scope(uuid) from public, anon, authenticated;
grant execute on function public.signal_monitor_scope(uuid) to service_role;

-- 2. A cascata da descoberta no mercado endereçável.
alter table private.signal_cascades add column if not exists market_discovery boolean not null default false;

comment on column private.signal_cascades.market_discovery is
  'Procura empresas no mercado endereçável, sem Conta-alvo: só roda pelo Monitoramento de mercado e cobra o preço fixo da rodada.';

-- A descoberta serve a qualquer nicho: em vez de uma letra A–H (que agrupa as cascatas de cada ICP), leva '*'. Só a cascata
-- da descoberta aceita '*'; as outras continuam com a letra do ICP. A regra antiga é substituída pela mesma, mais o '*'.
do $$
declare
  v_nome text;
begin
  for v_nome in
    select c.conname from pg_constraint c
    where c.conrelid = 'private.signal_cascades'::regclass and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%icp%' and pg_get_constraintdef(c.oid) like '%A-H%'
  loop
    execute format('alter table private.signal_cascades drop constraint %I', v_nome);
  end loop;
end;
$$;
alter table private.signal_cascades add constraint signal_cascades_icp_check
  check (icp ~ '^[A-H]$' or (icp = '*' and market_discovery));

-- 3. O preço fixo de uma rodada no mercado: o teto de créditos por rodada, decidido no servidor.
create or replace function private.market_discovery_credits_per_run()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 4;
$$;

revoke all on function private.market_discovery_credits_per_run() from public, anon, authenticated, service_role;

-- Os passos: a busca de vagas pelos cargos e pelo nicho (LinkedIn, com o Gupy como alternativa do mesmo esquema), a
-- confirmação pelos cargos do Monitoramento e pelo nicho, o site e o LinkedIn das empresas que não são Conta (até 25 por
-- rodada) e o casamento com as Contas (o resto vira candidata, também sem site). A cascata serve a qualquer nicho ('*') e
-- não aparece no catálogo.
with c as (
  insert into private.signal_cascades
    (signal_type, icp, name, scope, price_multiplier, cap_usd, cap_credits, cadence_hours, max_accounts, market_discovery, notes)
  values ('vaga_mercado', '*', 'Vagas no mercado endereçável', 'conta', 1, 0.50, 4, 24, 500, true,
    'Empresas do mercado endereçável que abriram vaga nos cargos do Monitoramento, no nicho e no país dele. As que não são Conta viram candidatas da Caixa de Descobertas.')
  returning id
)
insert into private.signal_cascade_steps
  (cascade_id, ordem, kind, handler, actor_id, fallbacks, input_template, price_model, known_price, est_fixed_usd, est_per_item_usd, est_items, max_items)
select c.id, s.ordem, s.kind, s.handler, s.actor_id, s.fallbacks::jsonb, s.input_template::jsonb, s.price_model, s.known_price::jsonb,
  s.est_fixed_usd, s.est_per_item_usd, s.est_items, s.max_items
from c, (values
  (1::smallint, 'actor', 'linkedin_vagas_mercado', 'curious_coder~linkedin-jobs-scraper',
   '[{"kind":"actor","actorId":"valig~linkedin-jobs-scraper","priceModel":"PAY_PER_EVENT","estFixedUsd":0.001,"estPerItemUsd":0.0004}]',
   '{"pais":"Brazil","janelaDias":30}',
   'PAY_PER_EVENT', '{"fonte":"API pública da Apify Store, 12/10/2026, faixa Free","porResultado":0.002,"porExecucao":0.00005}', 0.00005, 0.002, 100, 100),
  (2::smallint, 'regra', 'confirmar_vaga_mercado', null, '[]', '{}', 'NONE', null, 0, 0, 0, null),
  (3::smallint, 'actor', 'linkedin_empresa_mercado', 'harvestapi~linkedin-company', '[]', '{}',
   'PAY_PER_EVENT', '{"fonte":"API pública da Apify Store, 12/10/2026, faixa Free","porResultado":0.004,"porExecucao":0.00005}', 0.00005, 0.004, 25, 25),
  (4::smallint, 'regra', 'casar_com_contas', null, '[]', '{"semSiteViraCandidata":true}', 'NONE', null, 0, 0, 0, null)
) as s(ordem, kind, handler, actor_id, fallbacks, input_template, price_model, known_price, est_fixed_usd, est_per_item_usd, est_items, max_items);

-- O catálogo de cascatas (tela e Hermes) não mostra a descoberta: ela é um modo do Monitoramento de Abertura de vagas.
create or replace function public.list_cascade_catalog()
returns table (signal_type text, icp text, name text, state text, scope text, sem_fonte_motivo text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_user();
  return query
  select c.signal_type, c.icp, c.name, c.state, c.scope, c.sem_fonte_motivo
  from private.signal_cascades c
  where c.state <> 'disabled' and not c.market_discovery
  order by c.icp, c.signal_type;
end;
$$;

create or replace function public.signal_cascade_catalog()
returns table (signal_type text, icp text, name text, state text, scope text, sem_fonte_motivo text, cadence_hours integer)
language sql
stable
security definer
set search_path = ''
as $$
  select c.signal_type, c.icp, c.name, c.state, c.scope, c.sem_fonte_motivo, c.cadence_hours
  from private.signal_cascades c where not c.market_discovery order by c.icp, c.signal_type;
$$;

-- Redefinida a partir de 20261020120000: a descoberta só abre pelo Monitoramento de mercado, ao preço fixo da rodada.
create or replace function public.begin_cascade_run(
  p_workspace_id uuid,
  p_user_id uuid,
  p_signal_type text,
  p_origin text,
  p_monitor_id uuid,
  p_key text,
  p_est_usd numeric,
  p_cap_credits integer default null,
  p_allow_testing boolean default false,
  p_accounts integer default null
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
  v_run uuid;
  v_block text;
  v_hint text;
  v_today numeric;
begin
  if p_origin not in ('conversa', 'monitor', 'rotina') or p_key is null or btrim(p_key) = ''
    or p_est_usd is null or p_est_usd < 0 or (p_cap_credits is not null and p_cap_credits < 1) then
    raise exception 'invalid cascade request' using errcode = '22023';
  end if;
  if not exists (select 1 from public.workspaces w where w.id = p_workspace_id) then
    raise exception 'workspace not found' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtext('cascade:' || p_workspace_id::text || ':' || p_key));

  if private.automation_contract_block(p_workspace_id) is not null then
    return query select 'contrato_inativo'::text, null::uuid, null::uuid, 0, 0::numeric;
    return;
  end if;

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
  -- A descoberta no mercado endereçável só roda pelo Monitoramento de mercado que a pediu: nem a conversa, nem a rotina,
  -- nem um Monitoramento de Contas-alvo.
  if v_c.market_discovery and (p_origin <> 'monitor' or not exists (
    select 1 from private.signal_monitors m
    where m.workspace_id = p_workspace_id and m.id = p_monitor_id and private.monitor_scope(m.audience) = 'mercado'
  )) then
    return query select 'indisponivel'::text, null::uuid, null::uuid, 0, 0::numeric;
    return;
  end if;

  select * into v_existing from private.signal_cascade_runs r where r.workspace_id = p_workspace_id and r.idempotency_key = p_key;
  if found then
    if v_existing.state = 'running' and v_existing.started_at < now() - interval '20 minutes' then
      perform public.finish_cascade_run(v_existing.id, 'failed', null, 0, 0, 0, 'A busca anterior não terminou; tente de novo.');
      select * into v_existing from private.signal_cascade_runs r where r.id = v_existing.id;
    end if;
    return query select case v_existing.state when 'running' then 'em_andamento' else 'done' end, v_existing.id,
      v_existing.reservation_id, v_existing.est_credits, v_existing.cap_usd;
    return;
  end if;

  select * into v_set from private.signal_cascade_settings;
  v_cap := v_c.cap_usd;
  if v_c.cap_credits is not null then
    v_cap := least(v_cap, v_c.cap_credits * v_set.usd_per_credit / v_c.price_multiplier);
  end if;
  if p_cap_credits is not null then
    v_cap := least(v_cap, p_cap_credits * v_set.usd_per_credit / v_c.price_multiplier);
  end if;
  v_est := least(p_est_usd, v_cap);
  -- O preço é fixo (creditos-moeda-unica): Sinal de Mercado, sem Conta, custa `credits_per_run` por execução; Sinal de Conta
  -- custa `credits_per_account` por Conta da execução. O custo da fonte e o multiplicador só alimentam a guarda em dólar.
  v_credits := case
    when v_c.market_discovery then private.market_discovery_credits_per_run()
    when v_c.scope = 'mercado' then v_set.credits_per_run
    else greatest(private.credits_per_account(p_signal_type), 1) * greatest(coalesce(p_accounts, 1), 1)
  end;

  if p_origin = 'monitor' and exists (
    select 1 from private.signal_cascade_runs r
    where r.workspace_id = p_workspace_id and r.cascade_id = v_c.id and r.origin = 'monitor'
      and r.monitor_id is not distinct from p_monitor_id and r.state not in ('failed', 'adiado')
      and r.started_at >= date_trunc('day', now())) then
    return query select 'ja_rodou_hoje'::text, null::uuid, null::uuid, 0, 0::numeric;
    return;
  end if;

  v_block := private.signal_budget_block(p_workspace_id, v_est);
  if v_block is not null then
    return query select v_block, null::uuid, null::uuid, 0, 0::numeric;
    return;
  end if;

  select coalesce(sum(case when r.status = 'settled' then r.unit_credits * r.settled_quantity else r.amount end), 0)
  into v_today
  from private.credit_reservations r
  where r.workspace_id = p_workspace_id and r.action = 'cascata_de_sinais' and r.status in ('reserved', 'settled')
    and r.created_at >= date_trunc('day', now());
  if not private.credits_unlimited(p_workspace_id) and v_today + v_credits > v_set.daily_credit_cap then
    return query select 'limite_diario'::text, null::uuid, null::uuid, 0, 0::numeric;
    return;
  end if;

  v_user := case when p_user_id is not null and exists (
    select 1 from public.workspace_memberships m where m.workspace_id = p_workspace_id and m.user_id = p_user_id and m.active
  ) then p_user_id end;
  begin
    v_res := public.reserve_credits(p_workspace_id, v_user, 'cascata_de_sinais', 'cascade:' || p_key, v_credits, false);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    if sqlerrm = 'monthly credit limit reached' and v_hint = 'workspace_limit' then
      return query select 'teto_atingido'::text, null::uuid, null::uuid, 0, 0::numeric;
      return;
    end if;
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

-- 4. Redefinida a partir de 20261018110000: a empresa sem site que a descoberta achou vira candidata pela página do
-- LinkedIn, com a etiqueta "sem site". Fora isso, a resolução é a mesma.
create or replace function private.record_signal_for_company(
  p_workspace_id uuid,
  p_company jsonb,
  p_monitor_id uuid,
  p_signal_type text,
  p_event_key text,
  p_phrase text,
  p_fired_at timestamptz,
  p_source text,
  p_evidence text,
  p_weight integer default null,
  p_market_signal_id uuid default null
) returns table (
  resolved text,
  is_new boolean,
  target_account_id uuid,
  discovered_account_id uuid,
  reopened boolean
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_monitor_type text;
  v_name text;
  v_cnpj text;
  v_website text;
  v_domain text;
  v_linkedin text;
  v_linkedin_key text;
  v_uf text;
  v_name_key text;
  v_account_id uuid;
  v_id uuid;
  v_cand private.discovered_accounts%rowtype;
  v_signal uuid;
  v_new boolean;
  v_reopened boolean := false;
  v_resolved text;
  v_known boolean;
  v_sem_site boolean;
begin
  if p_company is null or jsonb_typeof(p_company) <> 'object' then
    raise exception 'invalid company' using errcode = '22023';
  end if;
  if not exists (select 1 from public.workspaces w where w.id = p_workspace_id) then
    raise exception 'workspace not found' using errcode = 'P0002';
  end if;
  if p_fired_at is null or p_fired_at > now() + interval '1 day' then
    raise exception 'invalid signal date' using errcode = '22023';
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

  v_cnpj := private.cnpj_key(p_company ->> 'cnpj');
  v_website := private.try_canonical_company_url(p_company ->> 'website');
  v_domain := case when v_website is null then null else private.domain_of(v_website) end;
  v_linkedin := nullif(left(btrim(coalesce(p_company ->> 'linkedinUrl', '')), 300), '');
  v_linkedin_key := private.linkedin_company_key(v_linkedin);
  -- A empresa sem site que a descoberta no mercado endereçável achou (`semSite`) vira candidata pela página do LinkedIn,
  -- com a etiqueta "sem site", e não some em silêncio. Sem a página, continua sem identidade.
  v_sem_site := v_cnpj is null and v_domain is null and coalesce(p_company ->> 'semSite', '') = 'true'
    and v_linkedin_key is not null;
  if v_cnpj is null and v_domain is null and not v_sem_site then
    return query select 'sem_identidade'::text, false, null::uuid, null::uuid, false;
    return;
  end if;
  v_uf := upper(nullif(btrim(coalesce(p_company ->> 'uf', '')), ''));
  if v_uf is not null and v_uf !~ '^[A-Z]{2}$' then
    v_uf := null;
  end if;
  -- Um Sinal de mercado costuma trazer só o CNPJ (nunca o nome do licenciado): o CNPJ faz as vezes do nome até a Conta
  -- ser enriquecida.
  v_name := coalesce(
    nullif(btrim(left(coalesce(p_company ->> 'name', ''), 300)), ''),
    case when v_cnpj is not null then 'CNPJ ' || private.format_cnpj(v_cnpj) else coalesce(v_domain, v_linkedin_key) end);
  v_name_key := private.company_name_key(v_name);

  -- 1. É Conta do Workspace? CNPJ primeiro, depois domínio.
  select a.id into v_account_id
  from public.target_accounts a
  where a.workspace_id = p_workspace_id and a.deleted_at is null
    and ((v_cnpj is not null and private.cnpj_key(a.legal_identifier) = v_cnpj)
      or (v_domain is not null and a.domain = v_domain))
  order by case when v_cnpj is not null and private.cnpj_key(a.legal_identifier) = v_cnpj then 0 else 1 end,
    a.created_at, a.id
  limit 1;
  if v_account_id is not null then
    select k.resolved, k.is_new into v_resolved, v_new
    from private.record_signal_on_known_account(
      p_workspace_id, v_account_id, p_monitor_id, p_signal_type, p_event_key, p_phrase, p_fired_at, p_source,
      p_evidence, p_market_signal_id) k;
    return query select v_resolved, v_new, v_account_id, null::uuid, false;
    return;
  end if;

  -- 2. Já é Conta por LinkedIn ou nome? Então não vira candidata.
  if private.discovery_duplicate(p_workspace_id, v_domain, v_cnpj, v_linkedin_key, v_name_key, v_uf) = 'conta' then
    return query select 'ja_e_conta'::text, false, null::uuid, null::uuid, false;
    return;
  end if;

  -- 3. A candidata: a que já existe pela regra de deduplicação, ou uma nova. Um por Workspace de cada vez, para dois
  -- Sinais da mesma empresa não criarem duas candidatas.
  perform pg_advisory_xact_lock(hashtext('discovery-signal:' || p_workspace_id::text));
  v_id := private.find_discovered_account(p_workspace_id, v_domain, v_cnpj, v_linkedin_key, v_name_key, v_uf);
  if v_id is null then
    insert into private.discovered_accounts (
      workspace_id, origin, name, website, domain, cnpj, linkedin_url, location, uf, city, country, sector, size_label,
      source_actor, domain_key, cnpj_key, linkedin_key, name_key, tags
    ) values (
      p_workspace_id, 'sinal', v_name, v_website, v_domain, v_cnpj, v_linkedin,
      nullif(left(btrim(coalesce(p_company ->> 'location', '')), 200), ''), v_uf,
      nullif(left(btrim(coalesce(p_company ->> 'city', '')), 120), ''),
      nullif(left(btrim(coalesce(p_company ->> 'country', '')), 80), ''),
      nullif(left(btrim(coalesce(p_company ->> 'sector', '')), 200), ''),
      nullif(left(btrim(coalesce(p_company ->> 'sizeLabel', '')), 60), ''),
      left('sinal:' || p_signal_type, 200), v_domain, v_cnpj, v_linkedin_key, v_name_key,
      case when v_sem_site then array['sem site'] else '{}'::text[] end
    )
    on conflict do nothing
    returning id into v_id;
    if v_id is null then
      v_id := private.find_discovered_account(p_workspace_id, v_domain, v_cnpj, v_linkedin_key, v_name_key, v_uf);
    end if;
  end if;
  select * into v_cand from private.discovered_accounts d where d.id = v_id for update;

  -- A candidata já foi aceita: a empresa é Conta agora, e o Sinal vai para ela.
  if v_cand.state = 'aceita' and v_cand.target_account_id is not null then
    select exists (
      select 1 from public.target_accounts a
      where a.workspace_id = p_workspace_id and a.id = v_cand.target_account_id and a.deleted_at is null
    ) into v_known;
    if v_known then
      select k.resolved, k.is_new into v_resolved, v_new
      from private.record_signal_on_known_account(
        p_workspace_id, v_cand.target_account_id, p_monitor_id, p_signal_type, p_event_key, p_phrase, p_fired_at,
        p_source, p_evidence, p_market_signal_id) k;
      return query select v_resolved, v_new, v_cand.target_account_id, null::uuid, false;
      return;
    end if;
  end if;

  -- 4. O Sinal da candidata. A vaga já achada por outra fonte de vagas é um reencontro (a mesma regra do `record_signal`).
  v_signal := null;
  if p_event_key like 'vaga|%' and p_signal_type like 'vaga\_%' then
    update private.signals g set seen_again_at = now(), seen_again_monitor_id = p_monitor_id
    where g.workspace_id = p_workspace_id and g.discovered_account_id = v_id
      and g.signal_type like 'vaga\_%' and g.signal_type <> p_signal_type and g.event_key = p_event_key;
    if found then
      return query select 'candidata'::text, false, null::uuid, v_id, false;
      return;
    end if;
  end if;

  insert into private.signals (
    workspace_id, discovered_account_id, monitor_id, signal_type, event_key, phrase, fired_at, source, evidence,
    market_signal_id
  ) values (
    p_workspace_id, v_id, p_monitor_id, p_signal_type, p_event_key, btrim(p_phrase), p_fired_at, p_source, p_evidence,
    p_market_signal_id
  )
  on conflict (workspace_id, discovered_account_id, signal_type, event_key) where discovered_account_id is not null
  do nothing
  returning id into v_signal;

  if v_signal is null then
    update private.signals g set seen_again_at = now(), seen_again_monitor_id = p_monitor_id
    where g.workspace_id = p_workspace_id and g.discovered_account_id = v_id
      and g.signal_type = p_signal_type and g.event_key = p_event_key;
    return query select 'candidata'::text, false, null::uuid, v_id, false;
    return;
  end if;

  insert into private.discovery_reasons (discovered_account_id, signal_id, workspace_id, weight)
  values (v_id, v_signal, p_workspace_id, least(greatest(coalesce(p_weight, 20), 0), 100))
  on conflict do nothing;

  -- 5. Um Sinal novo muda a candidata. Nova: o Sinal passa a ser o motivo dela estar na lista (a origem `busca` vira
  -- `sinal`; `sincronizacao` nunca muda) e completa o que faltava, sem tomar a chave de outra candidata. Descartada: só
  -- volta se o Sinal é novo, ainda vale, aconteceu depois do descarte e chegou mais de 90 dias depois dele.
  if v_cand.state = 'nova' then
    update private.discovered_accounts d set
      origin = case when d.origin = 'busca' then 'sinal' else d.origin end,
      website = case when d.website is null and v_website is not null
          and not exists (select 1 from private.discovered_accounts x
            where x.workspace_id = d.workspace_id and x.id <> d.id and x.domain_key = v_domain) then v_website else d.website end,
      domain = case when d.domain_key is null and v_domain is not null
          and not exists (select 1 from private.discovered_accounts x
            where x.workspace_id = d.workspace_id and x.id <> d.id and x.domain_key = v_domain) then v_domain else d.domain end,
      domain_key = case when d.domain_key is null and v_domain is not null
          and not exists (select 1 from private.discovered_accounts x
            where x.workspace_id = d.workspace_id and x.id <> d.id and x.domain_key = v_domain) then v_domain else d.domain_key end,
      cnpj = case when d.cnpj_key is null and v_cnpj is not null
          and not exists (select 1 from private.discovered_accounts x
            where x.workspace_id = d.workspace_id and x.id <> d.id and x.cnpj_key = v_cnpj) then v_cnpj else d.cnpj end,
      cnpj_key = case when d.cnpj_key is null and v_cnpj is not null
          and not exists (select 1 from private.discovered_accounts x
            where x.workspace_id = d.workspace_id and x.id <> d.id and x.cnpj_key = v_cnpj) then v_cnpj else d.cnpj_key end
    where d.id = v_id;
  elsif v_cand.state = 'descartada'
    and private.signal_is_valid(p_fired_at)
    and p_fired_at > v_cand.decided_at
    and now() > v_cand.decided_at + interval '90 days'
  then
    update private.discovered_accounts d set
      state = 'nova',
      origin = case when d.origin = 'sincronizacao' then d.origin else 'sinal' end,
      reopened_by_signal_at = now(),
      reopened_decided_at = d.decided_at,
      reopened_discard_reason = d.discard_reason,
      decided_by = null,
      decided_at = null,
      discard_reason = null
    where d.id = v_id;
    v_reopened := true;
  end if;

  return query select 'candidata'::text, true, null::uuid, v_id, v_reopened;
end;
$$;

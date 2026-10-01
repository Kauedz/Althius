-- A Caixa de Descobertas (enriquecimento-em-cascata, a base é o Apify): empresas candidatas que a Althius acha pelo ICP e
-- propõe ao Workspace. O Agente propõe, a pessoa decide (ADR-0002): nada vira Conta-alvo sem alguém aceitar, e quem
-- aceita vira o Vendedor responsável, porque a Conta nasce pela regra que já existe, `save_target_account`, chamada
-- como a pessoa (a regra exige `auth.uid()`). Uma descartada não volta: a Caixa lembra dela.
--
-- Aqui ficam: as chaves de comparação (domínio, CNPJ, página do LinkedIn, nome sem forma jurídica), o pedido de busca
-- (`private.discovery_runs`), as candidatas (`private.discovered_accounts`), o registro dos Actors de descoberta, a
-- deduplicação contra as Contas-alvo do Workspace e contra Descobertas anteriores, e as funções de listar, aceitar,
-- descartar e desfazer. Rodar a busca de verdade (créditos, Apify) é a migration seguinte e a Edge Function
-- `account-discovery`.
--
-- Vocabulário: o encaixe de uma candidata no ICP (alto, médio, baixo) não é a Aderência. A Aderência (Fit ou Não fit) é
-- do Scopus e só existe para uma Conta-alvo (ADR-0006: nenhuma nota numérica aparece ao usuário). O número guardado
-- aqui só ordena a lista.

-- 1. As chaves de comparação. Todas puras: a mesma empresa escrita de outro jeito dá a mesma chave.

-- O nome para comparação: sem acento nem pontuação, em minúsculas e sem a forma jurídica do fim ("Acme S.A." e
-- "ACME Ltda" dão "acme"). Um nome que seria só a forma jurídica fica como está.
create function private.company_name_key(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(nullif(regexp_replace(t.s, '( (ltda|sa|me|epp|eireli|inc|llc|ltd|corp|plc|gmbh|cia)| s a)+$', ''), ''), t.s)
  from (
    select btrim(regexp_replace(
      lower(translate(coalesce(p_name, ''),
        'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
        'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')),
      '[^a-z0-9]+', ' ', 'g')) as s
  ) t;
$$;

-- O CNPJ em 14 caracteres, ou nulo se o dígito verificador não fecha. Vale o CNPJ alfanumérico (IN RFB 2.229/2024): as
-- 12 primeiras posições aceitam letras, e o dígito verificador usa o valor ASCII menos 48, módulo 11, com os pesos de sempre.
create function private.cnpj_key(p_value text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := upper(regexp_replace(coalesce(p_value, ''), '[^0-9A-Za-z]', '', 'g'));
  v_pesos1 integer[] := array[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  v_pesos2 integer[] := array[6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  v_soma integer := 0;
  v_resto integer;
  v_dv1 integer;
  v_dv2 integer;
begin
  if v !~ '^[0-9A-Z]{12}[0-9]{2}$' or v ~ '^(.)\1{13}$' then
    return null;
  end if;
  for i in 1..12 loop
    v_soma := v_soma + (ascii(substr(v, i, 1)) - 48) * v_pesos1[i];
  end loop;
  v_resto := v_soma % 11;
  v_dv1 := case when v_resto < 2 then 0 else 11 - v_resto end;
  if (ascii(substr(v, 13, 1)) - 48) <> v_dv1 then
    return null;
  end if;
  v_soma := 0;
  for i in 1..13 loop
    v_soma := v_soma + (ascii(substr(v, i, 1)) - 48) * v_pesos2[i];
  end loop;
  v_resto := v_soma % 11;
  v_dv2 := case when v_resto < 2 then 0 else 11 - v_resto end;
  if (ascii(substr(v, 14, 1)) - 48) <> v_dv2 then
    return null;
  end if;
  return v;
end;
$$;

-- O CNPJ com a máscara (00.000.000/0000-00), para a Conta mostrar como as pessoas escrevem.
create function private.format_cnpj(p_key text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_key ~ '^[0-9A-Z]{12}[0-9]{2}$'
    then substr(p_key, 1, 2) || '.' || substr(p_key, 3, 3) || '.' || substr(p_key, 6, 3) || '/' || substr(p_key, 9, 4) || '-' || substr(p_key, 13, 2)
    else p_key end;
$$;

-- O domínio de um site ou endereço, sem "www.", ou nulo se não parece um domínio.
create function private.domain_of(p_value text)
returns text
language sql
stable
set search_path = ''
as $$
  select case when t.u is null then null else regexp_replace(substr(t.u, 9), '[:/].*$', '') end
  from (select private.try_canonical_company_url(p_value) as u) t;
$$;

-- A página da empresa no LinkedIn (/company/<página>), em minúsculas, ou nulo.
create function private.linkedin_company_key(p_url text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(lower((regexp_match(coalesce(p_url, ''), 'linkedin\.com/(?:company|school|showcase)/([^/?#[:space:]]+)', 'i'))[1]), '');
$$;

revoke all on function private.company_name_key(text) from public, anon, authenticated, service_role;
revoke all on function private.cnpj_key(text) from public, anon, authenticated, service_role;
revoke all on function private.format_cnpj(text) from public, anon, authenticated, service_role;
revoke all on function private.domain_of(text) from public, anon, authenticated, service_role;
revoke all on function private.linkedin_company_key(text) from public, anon, authenticated, service_role;

-- 2. O pedido de busca. Uma linha por busca: o ICP usado, os filtros, o Actor, o custo estimado e o real, o estado e o erro.
-- `kind` 'comite' é a busca das pessoas de uma Conta (fatia de Contatos); 'contas' é a busca de empresas pelo ICP.
-- Um Agente só propõe (aguardando_confirmacao): quem confirma é uma pessoa, e só então a busca roda e gasta Créditos.
create table private.discovery_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null default 'contas' check (kind in ('contas', 'comite')),
  target_account_id uuid,
  requested_by uuid references auth.users(id) on delete set null,
  requested_by_agent_id uuid,
  -- Por que o Agente propôs, em palavras dele (texto livre, cortado).
  agent_reason text check (agent_reason is null or length(agent_reason) <= 500),
  state text not null default 'em_andamento'
    check (state in ('aguardando_confirmacao', 'em_andamento', 'concluida', 'falhou', 'cancelada')),
  -- A chave do clique: repetir o pedido com a mesma chave devolve a mesma busca, sem cobrar duas vezes.
  request_key text check (request_key is null or length(request_key) between 1 and 100),
  -- A versão da seção ICP do Playbook de onde os filtros foram montados; nulo se foram escritos à mão.
  icp_version integer,
  criteria jsonb not null default '{}'::jsonb check (jsonb_typeof(criteria) = 'object' and length(criteria::text) <= 20000),
  max_results integer not null check (max_results between 1 and 200),
  actor_id text,
  actor_version text,
  -- Quanto custava quando a pessoa confirmou (Créditos) e o teto de cobrança do Apify (dólar).
  estimated_credits numeric(12, 2) not null default 0 check (estimated_credits >= 0),
  estimated_cost_usd numeric(10, 4) check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  -- O que o Apify informou de verdade (nulo quando ele não informou).
  actual_cost_usd numeric(14, 6) check (actual_cost_usd is null or actual_cost_usd >= 0),
  apify_run_id text,
  reservation_id uuid references private.credit_reservations(id) on delete set null,
  found integer not null default 0 check (found >= 0),
  added integer not null default 0 check (added >= 0),
  duplicates integer not null default 0 check (duplicates >= 0),
  last_error text check (last_error is null or length(last_error) <= 500),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  foreign key (workspace_id, target_account_id) references public.target_accounts(workspace_id, id) on delete cascade,
  foreign key (workspace_id, requested_by_agent_id) references private.agents(workspace_id, id)
    on delete set null (requested_by_agent_id),
  check ((kind = 'comite') = (target_account_id is not null)),
  unique (workspace_id, id)
);

create unique index discovery_runs_request_key_idx on private.discovery_runs (workspace_id, request_key)
  where request_key is not null;
-- Uma busca de empresas de cada vez por Workspace, e uma busca de pessoas de cada vez por Conta.
create unique index discovery_runs_one_running_idx on private.discovery_runs
  (workspace_id, kind, coalesce(target_account_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where state = 'em_andamento';
create index discovery_runs_workspace_idx on private.discovery_runs (workspace_id, created_at desc);
create index discovery_runs_requested_by_idx on private.discovery_runs (requested_by);
create index discovery_runs_agent_idx on private.discovery_runs (workspace_id, requested_by_agent_id);
create index discovery_runs_reservation_idx on private.discovery_runs (reservation_id);

alter table private.discovery_runs enable row level security;
revoke all on private.discovery_runs from public, anon, authenticated, service_role;

-- 3. A Caixa: as candidatas. A origem fica em cada uma (o Actor e a execução do Apify), e a chave de cada campo de
-- comparação é única por Workspace, então a mesma empresa não entra duas vezes nem depois de descartada.
create table private.discovered_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  run_id uuid references private.discovery_runs(id) on delete set null,
  state text not null default 'nova' check (state in ('nova', 'aceita', 'descartada')),
  name text not null check (name = btrim(name) and length(name) between 1 and 300),
  -- A URL canônica do site (https://...), que é o que identifica uma Conta-alvo; nula quando a fonte não traz site.
  website text check (website is null or (website like 'https://%' and length(website) <= 300)),
  domain text,
  cnpj text check (cnpj is null or cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$'),
  linkedin_url text check (linkedin_url is null or length(linkedin_url) <= 300),
  location text check (location is null or length(location) <= 200),
  uf text check (uf is null or uf ~ '^[A-Z]{2}$'),
  city text check (city is null or length(city) <= 120),
  country text check (country is null or length(country) <= 80),
  sector text check (sector is null or length(sector) <= 200),
  size_label text check (size_label is null or length(size_label) <= 60),
  employee_count integer check (employee_count is null or employee_count >= 0),
  description text check (description is null or length(description) <= 1000),
  -- As especialidades e tecnologias que a fonte listou da empresa (até 20).
  tags text[] not null default '{}' check (cardinality(tags) <= 20),
  source_actor text not null check (length(source_actor) between 1 and 200),
  source_run_id text check (source_run_id is null or length(source_run_id) <= 200),
  -- O identificador da empresa na fonte (a página do LinkedIn, o CNPJ), para conferir depois.
  source_ref text check (source_ref is null or length(source_ref) <= 300),
  -- O encaixe no ICP: o número só ordena a lista; a tela mostra o nível e os motivos.
  fit_score smallint not null default 0 check (fit_score between 0 and 100),
  fit_level text not null default 'sem_dado' check (fit_level in ('alto', 'medio', 'baixo', 'sem_dado')),
  reasons jsonb not null default '[]'::jsonb check (jsonb_typeof(reasons) = 'array' and length(reasons::text) <= 6000),
  -- Indícios de Sinal que a própria fonte trouxe (ex.: CNPJ aberto há pouco). Não são Sinais registrados: viram Sinal
  -- só numa varredura da Conta depois de aceita.
  signals jsonb not null default '[]'::jsonb check (jsonb_typeof(signals) = 'array' and length(signals::text) <= 3000),
  domain_key text,
  cnpj_key text,
  linkedin_key text,
  name_key text not null,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  discard_reason text check (discard_reason is null or length(discard_reason) <= 300),
  target_account_id uuid,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, target_account_id) references public.target_accounts(workspace_id, id)
    on delete set null (target_account_id),
  check ((state = 'nova') = (decided_at is null)),
  unique (workspace_id, id)
);

create unique index discovered_accounts_domain_idx on private.discovered_accounts (workspace_id, domain_key)
  where domain_key is not null;
create unique index discovered_accounts_cnpj_idx on private.discovered_accounts (workspace_id, cnpj_key)
  where cnpj_key is not null;
create unique index discovered_accounts_linkedin_idx on private.discovered_accounts (workspace_id, linkedin_key)
  where linkedin_key is not null;
create index discovered_accounts_name_idx on private.discovered_accounts (workspace_id, name_key);
create index discovered_accounts_list_idx on private.discovered_accounts (workspace_id, state, fit_score desc, created_at desc);
create index discovered_accounts_run_idx on private.discovered_accounts (run_id);
create index discovered_accounts_decided_by_idx on private.discovered_accounts (decided_by);
create index discovered_accounts_target_idx on private.discovered_accounts (workspace_id, target_account_id);

alter table private.discovered_accounts enable row level security;
revoke all on private.discovered_accounts from public, anon, authenticated, service_role;

-- 4. O registro dos Actors de descoberta. É irmão do `private.signal_actors` (os Sinais), separado dele porque um mesmo
-- Actor pode servir a mais de um fim (o de CNPJ consulta e descobre) e porque um Actor de descoberta nunca pode virar
-- Monitoramento. Nasce tudo "em teste": nenhum rodou de verdade; o Administrador roda uma busca pequena em modo de teste,
-- confere o resultado e só então o Actor passa a "disponível" (set_discovery_actor_state). Os ids, as versões e os preços
-- foram lidos na API pública do Apify em 01/10/2026 (esquema de entrada do build mais recente de cada um).
create table private.discovery_actors (
  purpose text not null check (purpose in ('buscar_contas', 'cnpj_receita', 'buscar_pessoas', 'revelar_contato')),
  actor_id text not null check (actor_id ~ '^[A-Za-z0-9_.-]+~[A-Za-z0-9_.-]+$'),
  -- Menor primeiro: a cascata tenta os Actors de um mesmo fim nesta ordem.
  priority smallint not null default 100,
  state text not null default 'testing' check (state in ('available', 'testing', 'out')),
  version text,
  known_price text,
  max_cost_usd numeric(8, 4) not null default 0.5 check (max_cost_usd > 0 and max_cost_usd <= 50),
  notes text,
  updated_at timestamptz not null default now(),
  primary key (purpose, actor_id)
);

alter table private.discovery_actors enable row level security;
revoke all on private.discovery_actors from public, anon, authenticated, service_role;

insert into private.discovery_actors (purpose, actor_id, priority, version, known_price, max_cost_usd, notes) values
  ('buscar_contas', 'harvestapi~linkedin-company-search', 10, '0.0.21',
   'US$ 0,004 por empresa no modo completo (US$ 0,002 no curto) mais US$ 0,001 por execução na faixa Free. API pública do Apify, 01/10/2026.',
   0.45,
   'Empresas do LinkedIn por palavra-chave, local e porte; traz site, número de funcionários, setor e locais. A validar numa execução real (busca por texto booleana e locais em texto).'),
  ('buscar_contas', 'johnatan029~cnpj-empresas-brasil-scraper', 20, '1.0.11',
   'US$ 0,0015 por empresa mais US$ 0,00005 por execução. API pública do Apify, 01/10/2026.',
   0.20,
   'Modo discovery: empresas da Receita Federal por CNAE, UF e município; traz CNPJ, razão social, porte e endereço, sem site. A validar numa execução real.'),
  ('cnpj_receita', 'johnatan029~cnpj-empresas-brasil-scraper', 10, '1.0.11',
   'US$ 0,0015 por CNPJ consultado mais US$ 0,00005 por execução. API pública do Apify, 01/10/2026.',
   0.05,
   'Modo lookup: dados cadastrais da Receita Federal por CNPJ (fontes: Minha Receita, BrasilAPI e CNPJ.ws). A validar numa execução real.'),
  ('buscar_pessoas', 'harvestapi~linkedin-company-employees', 10, '0.0.161',
   'US$ 0,003 por perfil curto (US$ 0,008 no completo) mais US$ 0,02 por execução na faixa Free. API pública do Apify, 01/10/2026.',
   0.25,
   'Pessoas da página da empresa no LinkedIn, por cargo e local; é o Actor que o Sinal de entradas já usa. A validar a busca por cargos do comitê.'),
  ('revelar_contato', 'harvestapi~linkedin-profile-scraper', 10, '0.0.135',
   'US$ 0,01 por perfil com busca de e-mail (US$ 0,004 sem). Não cobra a busca quando o perfil é incompleto. API pública do Apify, 01/10/2026.',
   0.05,
   'Perfil do LinkedIn com busca de e-mail. O nome do campo do e-mail no resultado não está documentado: a validar numa execução real. Telefone: nenhum Actor validado.');

-- O que a tela precisa saber: para que serve cada Actor e em que estado está. Preço e teto são internos.
create function public.list_discovery_actors()
returns table (purpose text, actor_id text, state text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_user();
  return query
    select a.purpose, a.actor_id, a.state from private.discovery_actors a order by a.purpose, a.priority, a.actor_id;
end;
$$;

-- Para a Edge Function: os Actors de um fim, na ordem da cascata, com o teto de cobrança de cada um.
create function public.discovery_actors_for(p_purpose text)
returns table (actor_id text, state text, version text, max_cost_usd numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select a.actor_id, a.state, a.version, a.max_cost_usd
  from private.discovery_actors a
  where a.purpose = p_purpose and a.state <> 'out'
  order by a.priority, a.actor_id;
$$;

-- Muda o estado de um Actor depois de testado (ou o tira do ar). Só o servidor.
create function public.set_discovery_actor_state(p_purpose text, p_actor_id text, p_state text, p_version text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_state not in ('available', 'testing', 'out') then
    raise exception 'invalid state' using errcode = '22023';
  end if;
  update private.discovery_actors
  set state = p_state, version = coalesce(p_version, version), updated_at = now()
  where purpose = p_purpose and actor_id = p_actor_id;
  if not found then
    raise exception 'actor not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.list_discovery_actors() from public, anon;
revoke all on function public.discovery_actors_for(text) from public, anon, authenticated;
revoke all on function public.set_discovery_actor_state(text, text, text, text) from public, anon, authenticated;
grant execute on function public.list_discovery_actors() to authenticated;
grant execute on function public.discovery_actors_for(text) to service_role;
grant execute on function public.set_discovery_actor_state(text, text, text, text) to service_role;

-- 5. A deduplicação. 'conta': a empresa já é uma Conta-alvo do Workspace (domínio, CNPJ, página do LinkedIn ou nome);
-- 'descoberta': já esteve na Caixa, aceita, descartada ou à espera. O nome sozinho só conta quando nada mais o
-- desmente: dois sites diferentes, ou dois estados diferentes, são empresas diferentes de mesmo nome. Uma Conta apagada
-- (CRM-18) é só um marcador e não conta.
create function private.discovery_duplicate(
  p_workspace_id uuid,
  p_domain_key text,
  p_cnpj_key text,
  p_linkedin_key text,
  p_name_key text,
  p_uf text
) returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.target_accounts a
    where a.workspace_id = p_workspace_id and a.deleted_at is null
      and ((p_domain_key is not null and a.domain = p_domain_key)
        or (p_cnpj_key is not null and private.cnpj_key(a.legal_identifier) = p_cnpj_key)
        or (p_linkedin_key is not null and private.linkedin_company_key(a.linkedin_url) = p_linkedin_key)
        or (coalesce(p_name_key, '') <> '' and private.company_name_key(a.name) = p_name_key
          and (p_domain_key is null or a.domain = p_domain_key)))
  ) then
    return 'conta';
  end if;
  if exists (
    select 1 from private.discovered_accounts d
    where d.workspace_id = p_workspace_id
      and ((p_domain_key is not null and d.domain_key = p_domain_key)
        or (p_cnpj_key is not null and d.cnpj_key = p_cnpj_key)
        or (p_linkedin_key is not null and d.linkedin_key = p_linkedin_key)
        or (coalesce(p_name_key, '') <> '' and d.name_key = p_name_key
          and (p_domain_key is null or d.domain_key is null or d.domain_key = p_domain_key)
          and (p_uf is null or d.uf is null or d.uf = p_uf)))
  ) then
    return 'descoberta';
  end if;
  return null;
end;
$$;

revoke all on function private.discovery_duplicate(uuid, text, text, text, text, text)
  from public, anon, authenticated, service_role;

-- 6. Grava as candidatas que a busca trouxe. Só o servidor (a Edge Function). Cada uma passa pela deduplicação; o
-- que repete uma Conta ou uma Descoberta não entra e conta como repetida. Uma candidata sem nome é ignorada. As
-- chaves de comparação saem daqui, não de quem chama, então a regra é uma só. Devolve quantas entraram, quantas
-- repetiam e quantas foram ignoradas.
create function public.record_discovered_accounts(p_run_id uuid, p_candidates jsonb)
returns table (added integer, duplicates integer, ignored integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_run private.discovery_runs%rowtype;
  c jsonb;
  v_name text;
  v_website text;
  v_domain text;
  v_cnpj text;
  v_linkedin text;
  v_uf text;
  v_level text;
  v_tags text[];
  v_inserted integer;
  v_added integer := 0;
  v_dups integer := 0;
  v_ignored integer := 0;
begin
  select * into v_run from private.discovery_runs r where r.id = p_run_id for update;
  if not found then
    raise exception 'discovery run not found' using errcode = 'P0002';
  end if;
  if v_run.kind <> 'contas' then
    raise exception 'this run does not look for accounts' using errcode = '22023';
  end if;
  if p_candidates is null or jsonb_typeof(p_candidates) <> 'array' or jsonb_array_length(p_candidates) > 500 then
    raise exception 'invalid candidates' using errcode = '22023';
  end if;

  for c in select e from jsonb_array_elements(p_candidates) e loop
    if jsonb_typeof(c) <> 'object' then
      v_ignored := v_ignored + 1;
      continue;
    end if;
    v_name := nullif(btrim(left(coalesce(c ->> 'name', ''), 300)), '');
    if v_name is null then
      v_ignored := v_ignored + 1;
      continue;
    end if;
    v_website := private.try_canonical_company_url(c ->> 'website');
    v_domain := case when v_website is null then null else private.domain_of(v_website) end;
    v_cnpj := private.cnpj_key(c ->> 'cnpj');
    v_linkedin := nullif(left(btrim(coalesce(c ->> 'linkedinUrl', '')), 300), '');
    v_uf := upper(nullif(btrim(coalesce(c ->> 'uf', '')), ''));
    if v_uf is not null and v_uf !~ '^[A-Z]{2}$' then
      v_uf := null;
    end if;
    v_level := coalesce(nullif(c ->> 'level', ''), 'sem_dado');
    if v_level not in ('alto', 'medio', 'baixo', 'sem_dado') then
      v_level := 'sem_dado';
    end if;
    v_tags := coalesce((
      select array_agg(left(t, 60)) from (
        select jsonb_array_elements_text(case when jsonb_typeof(c -> 'tags') = 'array' then c -> 'tags' else '[]'::jsonb end) t
        limit 20) x), '{}');

    if private.discovery_duplicate(v_run.workspace_id, v_domain, v_cnpj, private.linkedin_company_key(v_linkedin),
         private.company_name_key(v_name), v_uf) is not null then
      v_dups := v_dups + 1;
      continue;
    end if;

    insert into private.discovered_accounts (
      workspace_id, run_id, name, website, domain, cnpj, linkedin_url, location, uf, city, country, sector, size_label,
      employee_count, description, tags, source_actor, source_run_id, source_ref, fit_score, fit_level,
      reasons, signals, domain_key, cnpj_key, linkedin_key, name_key
    ) values (
      v_run.workspace_id, v_run.id, v_name, v_website, v_domain, v_cnpj, v_linkedin,
      nullif(left(btrim(coalesce(c ->> 'location', '')), 200), ''), v_uf,
      nullif(left(btrim(coalesce(c ->> 'city', '')), 120), ''),
      nullif(left(btrim(coalesce(c ->> 'country', '')), 80), ''),
      nullif(left(btrim(coalesce(c ->> 'sector', '')), 200), ''),
      nullif(left(btrim(coalesce(c ->> 'sizeLabel', '')), 60), ''),
      case when (c ->> 'employeeCount') ~ '^[0-9]{1,9}$' then (c ->> 'employeeCount')::integer end,
      nullif(left(btrim(coalesce(c ->> 'description', '')), 1000), ''),
      v_tags,
      coalesce(nullif(left(btrim(coalesce(c ->> 'sourceActor', '')), 200), ''), nullif(left(v_run.actor_id, 200), ''), 'desconhecido'),
      coalesce(nullif(left(btrim(coalesce(c ->> 'sourceRunId', '')), 200), ''), v_run.apify_run_id),
      nullif(left(btrim(coalesce(c ->> 'sourceRef', '')), 300), ''),
      case when (c ->> 'score') ~ '^[0-9]{1,3}$' then least((c ->> 'score')::integer, 100) else 0 end,
      v_level,
      case when jsonb_typeof(c -> 'reasons') = 'array' and length((c -> 'reasons')::text) <= 6000 then c -> 'reasons' else '[]'::jsonb end,
      case when jsonb_typeof(c -> 'signals') = 'array' and length((c -> 'signals')::text) <= 3000 then c -> 'signals' else '[]'::jsonb end,
      v_domain, v_cnpj, private.linkedin_company_key(v_linkedin), private.company_name_key(v_name)
    )
    on conflict do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 1 then
      v_added := v_added + 1;
    else
      v_dups := v_dups + 1;
    end if;
  end loop;

  update private.discovery_runs set
    found = found + v_added + v_dups,
    added = added + v_added,
    duplicates = duplicates + v_dups
  where id = v_run.id;
  return query select v_added, v_dups, v_ignored;
end;
$$;

revoke all on function public.record_discovered_accounts(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_discovered_accounts(uuid, jsonb) to service_role;

-- 7. A Caixa para quem participa. Toda Participação ativa lê. Do mais encaixado ao menos, e do mais novo ao mais antigo.
create function public.list_discovered_accounts(p_workspace_id uuid, p_state text default 'nova', p_limit integer default 200)
returns table (
  id uuid,
  run_id uuid,
  state text,
  name text,
  website text,
  domain text,
  cnpj text,
  linkedin_url text,
  location text,
  uf text,
  sector text,
  size_label text,
  employee_count integer,
  description text,
  tags text[],
  source_actor text,
  fit_level text,
  reasons jsonb,
  signals jsonb,
  target_account_id uuid,
  decided_by uuid,
  decided_at timestamptz,
  discard_reason text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);
  if p_state is not null and p_state not in ('nova', 'aceita', 'descartada') then
    raise exception 'invalid state' using errcode = '22023';
  end if;
  return query
    select d.id, d.run_id, d.state, d.name, d.website, d.domain, d.cnpj, d.linkedin_url, d.location, d.uf, d.sector,
      d.size_label, d.employee_count, d.description, d.tags, d.source_actor, d.fit_level, d.reasons, d.signals,
      d.target_account_id, d.decided_by, d.decided_at, d.discard_reason, d.created_at
    from private.discovered_accounts d
    where d.workspace_id = p_workspace_id and (p_state is null or d.state = p_state)
    order by d.fit_score desc, d.created_at desc, d.id
    limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;

-- As buscas do Workspace, da mais nova à mais antiga.
create function public.list_discovery_runs(p_workspace_id uuid, p_kind text default 'contas', p_limit integer default 20)
returns table (
  id uuid,
  kind text,
  target_account_id uuid,
  state text,
  criteria jsonb,
  max_results integer,
  actor_id text,
  estimated_credits numeric,
  found integer,
  added integer,
  duplicates integer,
  last_error text,
  requested_by uuid,
  requested_by_agent_id uuid,
  agent_reason text,
  created_at timestamptz,
  finished_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);
  return query
    select r.id, r.kind, r.target_account_id, r.state, r.criteria, r.max_results, r.actor_id, r.estimated_credits,
      r.found, r.added, r.duplicates, r.last_error, r.requested_by, r.requested_by_agent_id, r.agent_reason,
      r.created_at, r.finished_at
    from private.discovery_runs r
    where r.workspace_id = p_workspace_id and (p_kind is null or r.kind = p_kind)
    order by r.created_at desc, r.id
    limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;

revoke all on function public.list_discovered_accounts(uuid, text, integer) from public, anon;
revoke all on function public.list_discovery_runs(uuid, text, integer) from public, anon;
grant execute on function public.list_discovered_accounts(uuid, text, integer) to authenticated;
grant execute on function public.list_discovery_runs(uuid, text, integer) to authenticated;

-- 8. Aceitar. Quem aceita vira o Vendedor responsável, porque a Conta nasce por `save_target_account`, chamada aqui
-- como a pessoa (a regra pede `auth.uid()`; esta função roda com a mesma sessão). Aceitar de novo devolve a mesma
-- Conta. Se a URL já é de uma Conta do Workspace (alguém cadastrou nesse meio tempo), a candidata se liga a ela sem
-- tocar nos dados dela. Uma candidata sem site precisa de um endereço: `p_url`. A Conta é "recomendada" (a Althius
-- recomendou, uma pessoa confirmou) e os campos que vieram da fonte ficam com a origem "automático" no registro de
-- origem por campo, para uma importação posterior poder corrigi-los sem confirmação.
create function public.accept_discovered_account(p_id uuid, p_url text default null)
returns table (target_account_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user uuid := auth.uid();
  v_d private.discovered_accounts%rowtype;
  v_url text;
  v_existing public.target_accounts%rowtype;
  v_account public.target_accounts;
begin
  select d.* into v_d from private.discovered_accounts d
  join public.workspace_memberships m on m.workspace_id = d.workspace_id and m.user_id = v_user and m.active
  where d.id = p_id
  for update of d;
  if not found then
    raise exception 'discovered account not found' using errcode = 'P0002';
  end if;
  if v_d.state = 'aceita' then
    return query select v_d.target_account_id, false;
    return;
  end if;
  if v_d.state = 'descartada' then
    raise exception 'discovered account was discarded' using errcode = '55000';
  end if;

  v_url := nullif(btrim(coalesce(p_url, '')), '');
  if v_url is null then
    v_url := v_d.website;
  end if;
  if v_url is null then
    raise exception 'a website is required to accept this account' using errcode = '22023';
  end if;
  v_url := private.canonical_company_url(v_url);

  select * into v_existing from public.target_accounts a
  where a.workspace_id = v_d.workspace_id and a.canonical_url = v_url and a.deleted_at is null;
  if found then
    update private.discovered_accounts set
      state = 'aceita', target_account_id = v_existing.id, decided_by = v_user, decided_at = now()
    where id = v_d.id;
    return query select v_existing.id, false;
    return;
  end if;

  v_account := public.save_target_account(
    v_d.workspace_id, v_d.name, v_url,
    case when v_d.cnpj is null then null else private.format_cnpj(v_d.cnpj) end,
    v_d.linkedin_url, v_d.sector);
  update public.target_accounts set origin = 'recomendacao' where id = v_account.id and origin = 'manual';
  update private.account_field_sources set origin = 'automatico', observed_at = now()
  where target_account_id = v_account.id and field in ('name', 'legal_identifier', 'linkedin_url', 'segment');

  update private.discovered_accounts set
    state = 'aceita', target_account_id = v_account.id, decided_by = v_user, decided_at = now()
  where id = v_d.id;
  return query select v_account.id, true;
end;
$$;

-- Descartar: a candidata sai da lista e não volta, nem numa busca futura (a Caixa lembra dela).
create function public.discard_discovered_account(p_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_d private.discovered_accounts%rowtype;
begin
  select d.* into v_d from private.discovered_accounts d
  join public.workspace_memberships m on m.workspace_id = d.workspace_id and m.user_id = auth.uid() and m.active
  where d.id = p_id
  for update of d;
  if not found then
    raise exception 'discovered account not found' using errcode = 'P0002';
  end if;
  if v_d.state = 'descartada' then
    return;
  end if;
  if v_d.state = 'aceita' then
    raise exception 'discovered account was already accepted' using errcode = '55000';
  end if;
  update private.discovered_accounts set
    state = 'descartada', decided_by = auth.uid(), decided_at = now(), discard_reason = nullif(left(btrim(coalesce(p_reason, '')), 300), '')
  where id = v_d.id;
end;
$$;

-- Desfazer o descarte: a candidata volta para a lista de novas.
create function public.restore_discovered_account(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_d private.discovered_accounts%rowtype;
begin
  select d.* into v_d from private.discovered_accounts d
  join public.workspace_memberships m on m.workspace_id = d.workspace_id and m.user_id = auth.uid() and m.active
  where d.id = p_id
  for update of d;
  if not found then
    raise exception 'discovered account not found' using errcode = 'P0002';
  end if;
  if v_d.state = 'nova' then
    return;
  end if;
  if v_d.state = 'aceita' then
    raise exception 'discovered account was already accepted' using errcode = '55000';
  end if;
  update private.discovered_accounts set state = 'nova', decided_by = null, decided_at = null, discard_reason = null
  where id = v_d.id;
end;
$$;

revoke all on function public.accept_discovered_account(uuid, text) from public, anon;
revoke all on function public.discard_discovered_account(uuid, text) from public, anon;
revoke all on function public.restore_discovered_account(uuid) from public, anon;
grant execute on function public.accept_discovered_account(uuid, text) to authenticated;
grant execute on function public.discard_discovered_account(uuid, text) to authenticated;
grant execute on function public.restore_discovered_account(uuid) to authenticated;

-- 9. Apagar a Conta definitivamente (CRM-18) leva junto o que a Caixa sabia dela: a candidata aceita some, e com ela o
-- CNPJ, o site e o resto. O marcador da Conta nunca mais muda, então este gatilho roda uma vez.
create function private.erase_discovery_data_of_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.discovered_accounts d
  where d.workspace_id = new.workspace_id and d.target_account_id = new.id;
  delete from private.discovery_runs r
  where r.workspace_id = new.workspace_id and r.kind = 'comite' and r.target_account_id = new.id;
  return null;
end;
$$;

revoke all on function private.erase_discovery_data_of_account() from public, anon, authenticated, service_role;

create trigger target_accounts_erase_discovery_data
  after update of deleted_at on public.target_accounts
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function private.erase_discovery_data_of_account();

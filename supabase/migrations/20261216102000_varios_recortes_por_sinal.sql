-- Critérios de vagas aceitam mais de um nicho pronto e mais de um setor escrito, mantendo o formato antigo legível.

create or replace function private.validate_market_criteria(p_state text, p_criteria jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_funcoes jsonb := p_criteria -> 'funcoes';
  v_paises jsonb := p_criteria -> 'localizacao';
  v_nichos jsonb := p_criteria -> 'nichos';
  v_nichos_custom jsonb := p_criteria -> 'nichosCustom';
  v_vistos text[] := '{}';
  v_custom integer := 0;
  v_vistos_nichos text[] := '{}';
  v_vistos_custom text[] := '{}';
  v_chave text;
  v_item jsonb;
  v_nicho text;
begin
  if (v_funcoes is not null and jsonb_typeof(v_funcoes) <> 'array')
    or (v_paises is not null and jsonb_typeof(v_paises) <> 'array')
    or (v_nichos is not null and jsonb_typeof(v_nichos) <> 'array')
    or (v_nichos_custom is not null and jsonb_typeof(v_nichos_custom) <> 'array')
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
  for v_item in select e from jsonb_array_elements(coalesce(v_nichos, '[]'::jsonb)) e loop
    if jsonb_typeof(v_item) <> 'string' then
      raise exception 'market monitor limits exceeded' using errcode = '22023';
    end if;
    v_nicho := v_item #>> '{}';
    if v_nicho not in ('comex-e-importacao', 'contabilidade-e-tributario', 'juridico-empresarial',
      'energia-e-mercado-livre', 'industria-fornecedores-b2b', 'logistica-e-transporte',
      'corretoras-de-beneficios', 'agro-b2b') or v_nicho = any (v_vistos_nichos) then
      raise exception 'market monitor limits exceeded' using errcode = '22023';
    end if;
    v_vistos_nichos := v_vistos_nichos || v_nicho;
  end loop;
  for v_item in select e from jsonb_array_elements(coalesce(v_nichos_custom, '[]'::jsonb)) e loop
    if jsonb_typeof(v_item) <> 'string' or length(btrim(v_item #>> '{}')) not between 1 and 60 then
      raise exception 'market monitor limits exceeded' using errcode = '22023';
    end if;
    v_chave := private.normalized_role(v_item #>> '{}');
    if v_chave = '' or v_chave = any (v_vistos_custom) then
      raise exception 'market monitor limits exceeded' using errcode = '22023';
    end if;
    v_vistos_custom := v_vistos_custom || v_chave;
    if cardinality(v_vistos_custom) > 5 then
      raise exception 'market monitor limits exceeded' using errcode = '22023';
    end if;
  end loop;
  for v_item in select e from jsonb_array_elements(coalesce(v_paises, '[]'::jsonb)) e loop
    if jsonb_typeof(v_item) <> 'string' or not ((v_item #>> '{}') = any (private.market_countries())) then
      raise exception 'market monitor limits exceeded' using errcode = '22023';
    end if;
  end loop;
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

create or replace function private.signal_plan_criteria_keys(p_signal_type text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_signal_type
    when 'vaga_linkedin' then array['funcoes', 'senioridade', 'localizacao', 'periodo', 'palavras', 'nichos', 'nichosCustom', 'nicho', 'nichoCustom']
    when 'vaga_indeed' then array['funcoes', 'senioridade', 'localizacao', 'periodo', 'palavras', 'nichos', 'nichosCustom', 'nicho', 'nichoCustom']
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

create or replace function private.signal_plan_recortes_ok(p_value jsonb, p_custom boolean)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_item jsonb;
  v_valor text;
  v_chave text;
  v_vistos text[] := '{}';
  v_prontos text[] := array['comex-e-importacao', 'contabilidade-e-tributario', 'juridico-empresarial',
    'energia-e-mercado-livre', 'industria-fornecedores-b2b', 'logistica-e-transporte',
    'corretoras-de-beneficios', 'agro-b2b'];
begin
  if jsonb_typeof(p_value) <> 'array' or (p_custom and jsonb_array_length(p_value) > 5) then
    return false;
  end if;
  for v_item in select e from jsonb_array_elements(p_value) e loop
    if jsonb_typeof(v_item) <> 'string' then return false; end if;
    v_valor := v_item #>> '{}';
    if p_custom then
      if length(btrim(v_valor)) not between 1 and 60 then return false; end if;
      v_chave := private.normalized_role(v_valor);
    else
      if not (v_valor = any (v_prontos)) then return false; end if;
      v_chave := v_valor;
    end if;
    if v_chave = '' or v_chave = any (v_vistos) then return false; end if;
    v_vistos := v_vistos || v_chave;
  end loop;
  return true;
end;
$$;

revoke all on function private.signal_plan_recortes_ok(jsonb, boolean) from public, anon, authenticated, service_role;

create or replace function private.validate_signal_plan_criteria(p_signal_type text, p_criteria jsonb)
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
      when 'nichos' then private.signal_plan_recortes_ok(v_value, false)
      when 'nichosCustom' then private.signal_plan_recortes_ok(v_value, true)
      else false
    end;
    if v_ok is not true then
      raise exception 'invalid signal plan' using errcode = '22023';
    end if;
  end loop;
end;
$$;

revoke all on function private.validate_signal_plan_criteria(text, jsonb) from public, anon, authenticated, service_role;

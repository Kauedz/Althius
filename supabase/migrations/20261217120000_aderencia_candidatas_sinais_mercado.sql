-- Aderência qualitativa das candidatas encontradas por Sinais de mercado (Sinais first, ticket 05).
-- A avaliação usa apenas os campos estruturados vigentes do ICP. Campos vazios não contam como divergência.

create or replace function private.score_market_discovery_icp(p_discovered_account_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_account private.discovered_accounts%rowtype;
  v_icp private.workspace_icp_versions%rowtype;
  v_total integer := 0;
  v_known integer := 0;
begin
  select * into v_account from private.discovered_accounts d where d.id = p_discovered_account_id;
  if not found then return null; end if;

  select * into v_icp from private.workspace_icp_versions i
  where i.workspace_id = v_account.workspace_id order by i.version desc limit 1;
  if not found then return null; end if;

  if btrim(v_icp.sector) <> '' then
    v_known := v_known + 1;
    if lower(coalesce(v_account.sector, '') || ' ' || coalesce(v_account.description, '') || ' ' || array_to_string(v_account.tags, ' '))
       like '%' || lower(btrim(v_icp.sector)) || '%' then v_total := v_total + 1; end if;
  end if;
  if btrim(v_icp.company_size) <> '' then
    v_known := v_known + 1;
    if lower(coalesce(v_account.size_label, '') || ' ' || coalesce(v_account.employee_count::text, ''))
       like '%' || lower(btrim(v_icp.company_size)) || '%' then v_total := v_total + 1; end if;
  end if;
  if btrim(v_icp.geography) <> '' then
    v_known := v_known + 1;
    if lower(coalesce(v_account.location, '') || ' ' || coalesce(v_account.uf, '') || ' ' || coalesce(v_account.city, '') || ' ' || coalesce(v_account.country, ''))
       like '%' || lower(btrim(v_icp.geography)) || '%' then v_total := v_total + 1; end if;
  end if;
  if v_known = 0 then return null; end if;
  return round(100.0 * v_total / v_known)::integer;
end;
$$;
revoke all on function private.score_market_discovery_icp(uuid) from public, anon, authenticated, service_role;

create or replace function private.refresh_market_discovery_fit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_market boolean;
  v_score integer;
begin
  if new.discovered_account_id is null then return new; end if;
  select exists (select 1 from private.signals g
    where g.id = new.signal_id and g.market_signal_id is not null) into v_market;
  if not v_market then return new; end if;
  v_score := private.score_market_discovery_icp(new.discovered_account_id);
  update private.discovered_accounts d set
    fit_score = coalesce(v_score, 0),
    fit_level = case when v_score is null then 'sem_dado' else private.discovery_level(v_score, 'baixo') end
  where d.id = new.discovered_account_id and d.origin = 'sinal';
  return new;
end;
$$;
revoke all on function private.refresh_market_discovery_fit() from public, anon, authenticated, service_role;
create trigger refresh_market_discovery_fit
  after insert or update of weight on private.discovery_reasons
  for each row execute function private.refresh_market_discovery_fit();

-- Uma candidata de Busca pode receber um Sinal de mercado; o fluxo troca sua origem para `sinal` depois de gravar o
-- motivo. Recalcula também nesse momento, e retroativamente para candidatas de mercado já existentes.
create function private.refresh_market_discovery_origin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_score integer;
begin
  if new.origin <> 'sinal' or not exists (select 1 from private.signals g
    where g.discovered_account_id = new.id and g.market_signal_id is not null) then return new; end if;
  v_score := private.score_market_discovery_icp(new.id);
  update private.discovered_accounts d set fit_score = coalesce(v_score, 0),
    fit_level = case when v_score is null then 'sem_dado' else private.discovery_level(v_score, 'baixo') end
  where d.id = new.id;
  return new;
end;
$$;
revoke all on function private.refresh_market_discovery_origin() from public, anon, authenticated, service_role;
create trigger refresh_market_discovery_origin
  after update of origin on private.discovered_accounts
  for each row when (old.origin is distinct from new.origin)
  execute function private.refresh_market_discovery_origin();

create function private.refresh_market_discovery_for_icp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  with scored as materialized (
    select d.id, private.score_market_discovery_icp(d.id) as score
    from private.discovered_accounts d
    where d.workspace_id = new.workspace_id and d.origin = 'sinal'
      and exists (select 1 from private.signals g
        where g.discovered_account_id = d.id and g.market_signal_id is not null)
  )
  update private.discovered_accounts d set fit_score = coalesce(s.score, 0),
    fit_level = case when s.score is null then 'sem_dado' else private.discovery_level(s.score, 'baixo') end
  from scored s where s.id = d.id;
  return new;
end;
$$;
revoke all on function private.refresh_market_discovery_for_icp() from public, anon, authenticated, service_role;
create trigger refresh_market_discovery_for_icp
  after insert on private.workspace_icp_versions
  for each row execute function private.refresh_market_discovery_for_icp();

with scored as materialized (
  select d.id, private.score_market_discovery_icp(d.id) as score
  from private.discovered_accounts d
  where d.origin = 'sinal' and exists (select 1 from private.signals g
    where g.discovered_account_id = d.id and g.market_signal_id is not null)
)
update private.discovered_accounts d set fit_score = coalesce(s.score, 0),
  fit_level = case when s.score is null then 'sem_dado' else private.discovery_level(s.score, 'baixo') end
from scored s where s.id = d.id;

-- A interface só recebe o nível. Quando o ICP ainda não tem critérios estruturados, Sinais não fabricam um encaixe.
create or replace function public.list_discovered_accounts(p_workspace_id uuid, p_state text default 'nova', p_limit integer default 200)
returns table (
  id uuid, run_id uuid, state text, name text, website text, domain text, cnpj text, linkedin_url text,
  location text, uf text, sector text, size_label text, employee_count integer, description text, tags text[],
  source_actor text, fit_level text, reasons jsonb, signals jsonb, target_account_id uuid, decided_by uuid,
  decided_at timestamptz, discard_reason text, created_at timestamptz, origin text,
  reopened_by_signal_at timestamptz, reopened_discard_reason text, signal_reasons jsonb
)
language plpgsql stable security definer set search_path = '' as $$
declare v_now timestamptz := now();
begin
  perform private.require_active_membership(p_workspace_id);
  if p_state is not null and p_state not in ('nova', 'aceita', 'descartada') then
    raise exception 'invalid state' using errcode = '22023';
  end if;
  return query
    select d.id, d.run_id, d.state, d.name, d.website, d.domain, d.cnpj, d.linkedin_url, d.location, d.uf, d.sector,
      d.size_label, d.employee_count, d.description, d.tags, d.source_actor,
      case when d.origin = 'sinal' and private.score_market_discovery_icp(d.id) is null then 'sem_dado'
        else private.discovery_level(private.discovery_fit_adjusted(d.fit_score, d.id, v_now) + least(60::numeric, s.peso), d.fit_level) end,
      d.reasons, d.signals, d.target_account_id, d.decided_by, d.decided_at, d.discard_reason, d.created_at,
      d.origin, d.reopened_by_signal_at, d.reopened_discard_reason,
      coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'tipo', g.signal_type,
        'frase', private.texto_do_sinal_para_a_tela(g.phrase, 'Sinal registrado.'),
        'fonte', private.texto_do_sinal_para_a_tela(g.source, null), 'data', g.fired_at,
        'valido', private.signal_is_valid(g.fired_at), 'mercado', g.market_signal_id is not null)
        order by g.fired_at desc, g.id desc)
        from (select g2.* from private.discovery_reasons r2 join private.signals g2 on g2.id = r2.signal_id
          where r2.discovered_account_id = d.id order by g2.fired_at desc, g2.id desc limit 50) g), '[]'::jsonb)
    from private.discovered_accounts d
    cross join lateral (select coalesce(sum(r.weight * private.discovery_signal_decay(g.fired_at, v_now)), 0) as peso,
      max(g.fired_at) as ultimo from private.discovery_reasons r join private.signals g on g.id = r.signal_id
      where r.discovered_account_id = d.id) s
    where d.workspace_id = p_workspace_id and (p_state is null or d.state = p_state)
    order by private.discovery_fit_adjusted(d.fit_score, d.id, v_now) + least(60::numeric, s.peso) desc,
      s.ultimo desc nulls last, d.created_at desc, d.id
    limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;
revoke all on function public.list_discovered_accounts(uuid, text, integer) from public, anon;
grant execute on function public.list_discovered_accounts(uuid, text, integer) to authenticated;

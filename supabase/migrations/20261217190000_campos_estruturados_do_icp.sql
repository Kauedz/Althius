-- Campos estruturados do ICP (Sinais first, ticket 16). Setor, porte e região passam a ser preenchidos pela pessoa
-- (onboarding e Configurações) e lidos pela Aderência das candidatas de Sinais de mercado. Sem coluna nova: cada
-- campo guarda uma lista curta separada por vírgula, normalizada aqui. Nada é gravado sem a ação de um Administrador.

-- Lista curta normalizada: itens aparados, sem vazios, sem repetidos (sem diferenciar maiúsculas, mantendo o primeiro),
-- no máximo 20 itens de até 80 caracteres. Fora disso a gravação é recusada, nunca cortada em silêncio.
create function private.normalize_icp_field(p_value text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  v_items text[];
begin
  select coalesce(array_agg(item order by first_position), '{}') into v_items
  from (
    select min(s.ordinality) as first_position, (array_agg(btrim(s.item) order by s.ordinality))[1] as item
    from regexp_split_to_table(coalesce(p_value, ''), ',') with ordinality as s(item, ordinality)
    where btrim(s.item) <> ''
    group by lower(btrim(s.item))
  ) itens;
  if cardinality(v_items) > 20 or exists (select 1 from unnest(v_items) i where length(i) > 80) then
    raise exception 'ICP field list too long' using errcode = '22023';
  end if;
  return array_to_string(v_items, ', ');
end;
$$;
revoke all on function private.normalize_icp_field(text) from public, anon, authenticated, service_role;

-- Grava os três campos como uma versão nova do ICP estruturado único, copiando o resto da versão vigente. Só um
-- Administrador ativo grava direto (como a edição direta do Playbook); o gatilho do ticket 05 recalcula a Aderência.
create function public.save_my_workspace_icp_fields(
  p_workspace_id uuid, p_sector text, p_company_size text, p_geography text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_current private.workspace_icp_versions%rowtype;
  v_sector text;
  v_size text;
  v_geography text;
  v_item text;
begin
  if private.require_active_membership(p_workspace_id) <> 'admin' then
    raise exception 'only administrators can edit the ICP fields' using errcode = '42501';
  end if;
  v_sector := private.normalize_icp_field(p_sector);
  v_geography := private.normalize_icp_field(p_geography);
  v_size := upper(private.normalize_icp_field(p_company_size));
  if v_size <> '' then
    foreach v_item in array string_to_array(v_size, ', ') loop
      if v_item not in ('1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5001-10000', '10001+',
                        'MEI', 'ME', 'EPP', 'DEMAIS') then
        raise exception 'invalid company size' using errcode = '22023';
      end if;
    end loop;
  end if;

  perform pg_advisory_xact_lock(hashtext('workspace-icp:' || p_workspace_id::text));
  select * into v_current from private.workspace_icp_versions v
  where v.workspace_id = p_workspace_id order by v.version desc limit 1;
  if (found and v_current.sector = v_sector and v_current.company_size = v_size and v_current.geography = v_geography)
     or (not found and v_sector = '' and v_size = '' and v_geography = '') then
    return public.get_my_workspace_icp(p_workspace_id);
  end if;

  insert into private.workspace_icp_versions
    (workspace_id, version, sector, company_size, geography, target_roles, free_text, playbook_content,
     o_que_vende, mini_icp, por_que_compram, created_by)
  values (p_workspace_id, coalesce(v_current.version, 0) + 1, v_sector, v_size, v_geography,
    coalesce(v_current.target_roles, '[]'::jsonb), coalesce(v_current.free_text, ''),
    coalesce(v_current.playbook_content, '{}'::jsonb), coalesce(v_current.o_que_vende, ''),
    coalesce(v_current.mini_icp, ''), coalesce(v_current.por_que_compram, ''), auth.uid());
  return public.get_my_workspace_icp(p_workspace_id);
end;
$$;
revoke all on function public.save_my_workspace_icp_fields(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.save_my_workspace_icp_fields(uuid, text, text, text) to authenticated;

-- Redefinida a partir de 20261217120000_aderencia_candidatas_sinais_mercado.sql. Mesma assinatura e mesma regra de
-- "sem dado" (sem ICP ou sem campo preenchido, nulo). Cada campo agora é uma lista: setor e região batem quando
-- qualquer item bate; porte bate pela faixa de funcionários ou pelo rótulo de porte igual a um item.
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
  v_sector_text text;
  v_place_text text;
begin
  select * into v_account from private.discovered_accounts d where d.id = p_discovered_account_id;
  if not found then return null; end if;

  select * into v_icp from private.workspace_icp_versions i
  where i.workspace_id = v_account.workspace_id order by i.version desc limit 1;
  if not found then return null; end if;

  v_sector_text := lower(coalesce(v_account.sector, '') || ' ' || coalesce(v_account.description, '') || ' '
    || coalesce(array_to_string(v_account.tags, ' '), ''));
  v_place_text := lower(coalesce(v_account.location, '') || ' ' || coalesce(v_account.uf, '') || ' '
    || coalesce(v_account.city, '') || ' ' || coalesce(v_account.country, ''));

  if btrim(v_icp.sector) <> '' then
    v_known := v_known + 1;
    if exists (select 1 from regexp_split_to_table(v_icp.sector, ',') x(item)
               where btrim(x.item) <> '' and v_sector_text like '%' || lower(btrim(x.item)) || '%') then
      v_total := v_total + 1;
    end if;
  end if;
  if btrim(v_icp.company_size) <> '' then
    v_known := v_known + 1;
    if exists (select 1 from regexp_split_to_table(v_icp.company_size, ',') x(item)
               where btrim(x.item) <> '' and (
                 lower(btrim(x.item)) = lower(btrim(coalesce(v_account.size_label, '')))
                 or (btrim(x.item) ~ '^[0-9]+-[0-9]+$'
                     and lower(coalesce(v_account.size_label, '')) like '%' || lower(btrim(x.item)) || '%')
                 or (v_account.employee_count is not null and btrim(x.item) = '10001+' and v_account.employee_count >= 10001)
                 or (v_account.employee_count is not null and btrim(x.item) ~ '^[0-9]+-[0-9]+$'
                     and v_account.employee_count between split_part(btrim(x.item), '-', 1)::bigint
                                                     and split_part(btrim(x.item), '-', 2)::bigint))) then
      v_total := v_total + 1;
    end if;
  end if;
  if btrim(v_icp.geography) <> '' then
    v_known := v_known + 1;
    if exists (select 1 from regexp_split_to_table(v_icp.geography, ',') x(item)
               where btrim(x.item) <> '' and (
                 lower(btrim(x.item)) = lower(btrim(coalesce(v_account.uf, '')))
                 or v_place_text like '%' || lower(btrim(x.item)) || '%')) then
      v_total := v_total + 1;
    end if;
  end if;
  if v_known = 0 then return null; end if;
  return round(100.0 * v_total / v_known)::integer;
end;
$$;
revoke all on function private.score_market_discovery_icp(uuid) from public, anon, authenticated, service_role;

-- Recalcula as candidatas de mercado já existentes com a regra nova, como a 20261217120000 fez com a anterior.
with scored as materialized (
  select d.id, private.score_market_discovery_icp(d.id) as score
  from private.discovered_accounts d
  where d.origin = 'sinal' and exists (select 1 from private.signals g
    where g.discovered_account_id = d.id and g.market_signal_id is not null)
)
update private.discovered_accounts d set fit_score = coalesce(s.score, 0),
  fit_level = case when s.score is null then 'sem_dado' else private.discovery_level(s.score, 'baixo') end
from scored s where s.id = d.id;

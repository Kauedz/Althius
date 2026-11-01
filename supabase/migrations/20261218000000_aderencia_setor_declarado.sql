-- Aderência pelo setor declarado, nunca pelo nome nem pela descrição (Trilha C, ticket 6a).
-- Antes o setor do ICP batia em setor || descrição || tags com LIKE: "Logistica Total" (IT Services) e "Logistica Talks"
-- (Professional Training) saíam com 100. Agora o setor do ICP só bate na atividade declarada (indústria do LinkedIn ou
-- CNAE da Receita, ambos em discovered_accounts.sector), sem acento, por palavra inteira, pelo próprio termo ou pelo
-- vocabulário de setores (espelho de supabase/functions/account-discovery/setores.ts).

create or replace function private.normalize_sector_text(p_text text)
returns text language sql immutable set search_path = '' as $$
  select ' ' || btrim(regexp_replace(
    translate(lower(coalesce(p_text, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
    '[^a-z0-9]+', ' ', 'g')) || ' '
$$;
revoke all on function private.normalize_sector_text(text) from public, anon, authenticated, service_role;

create or replace function private.icp_sector_matches(p_activity text, p_icp_item text)
returns boolean language sql immutable set search_path = '' as $$
  with alvo as (select private.normalize_sector_text(p_activity) as atividade, btrim(private.normalize_sector_text(p_icp_item)) as item),
  vocabulario(raiz, nome) as (values
    ('logistic', 'transportation logistics supply chain and storage'), ('logistic', 'truck transportation'),
    ('logistic', 'freight and package transportation'), ('logistic', 'warehousing and storage'), ('logistic', 'logistics'),
    ('logistic', 'supply chain'), ('logistic', 'freight'), ('logistic', 'warehousing'), ('logistic', 'transportation'),
    ('logistic', 'transporte'), ('logistic', 'transportes'), ('logistic', 'logistica'), ('logistic', 'armazenamento'),
    ('logistic', 'armazens gerais'), ('logistic', 'carga'), ('logistic', 'cargas'),
    ('transport', 'transportation logistics supply chain and storage'), ('transport', 'truck transportation'),
    ('transport', 'freight and package transportation'), ('transport', 'warehousing and storage'), ('transport', 'logistics'),
    ('transport', 'supply chain'), ('transport', 'freight'), ('transport', 'warehousing'), ('transport', 'transportation'),
    ('transport', 'transporte'), ('transport', 'transportes'), ('transport', 'logistica'), ('transport', 'armazenamento'),
    ('transport', 'armazens gerais'), ('transport', 'carga'), ('transport', 'cargas'),
    ('segur', 'insurance'), ('segur', 'insurance agencies and brokerages'), ('segur', 'insurance carriers'),
    ('segur', 'seguros'), ('segur', 'seguro'), ('segur', 'corretores e agentes de seguros'),
    ('software', 'software development'), ('software', 'it services and it consulting'),
    ('software', 'desenvolvimento de programas de computador'),
    ('tecnolog', 'software development'), ('tecnolog', 'it services and it consulting'), ('tecnolog', 'information technology'),
    ('tecnolog', 'tecnologia da informacao'), ('tecnolog', 'desenvolvimento de programas de computador'),
    ('industri', 'manufacturing'), ('industri', 'machinery manufacturing'), ('industri', 'industrial machinery manufacturing'),
    ('industri', 'industrial automation'), ('industri', 'fabricacao'),
    ('manufatur', 'manufacturing'), ('manufatur', 'machinery manufacturing'), ('manufatur', 'industrial machinery manufacturing'),
    ('manufatur', 'fabricacao'),
    ('varej', 'retail'), ('varej', 'comercio varejista'), ('atacad', 'wholesale'), ('atacad', 'comercio atacadista'),
    ('saude', 'hospitals and health care'), ('saude', 'medical practices'), ('saude', 'atividades de atencao a saude humana'),
    ('saude', 'atendimento hospitalar'),
    ('educac', 'education'), ('educac', 'education administration programs'), ('educac', 'e learning providers'),
    ('educac', 'higher education'), ('educac', 'educacao'), ('educac', 'ensino'),
    ('agro', 'farming'), ('agro', 'agriculture'), ('agro', 'cultivo'), ('agro', 'criacao de'), ('agro', 'agricultura'),
    ('constru', 'construction'), ('constru', 'civil engineering'), ('constru', 'construcao'), ('constru', 'obras'),
    ('energ', 'utilities'), ('energ', 'renewable energy'), ('energ', 'renewables environment'), ('energ', 'oil and gas'),
    ('energ', 'energia eletrica'), ('energ', 'geracao de energia'),
    ('aliment', 'food and beverage manufacturing'), ('aliment', 'food and beverage services'), ('aliment', 'food beverages'),
    ('aliment', 'alimenticios'), ('aliment', 'alimentos'),
    ('financ', 'financial services'), ('financ', 'banking'), ('financ', 'investment management'), ('financ', 'servicos financeiros')
  )
  select a.item <> '' and btrim(a.atividade) <> '' and (
    position(' ' || a.item || ' ' in a.atividade) > 0
    or exists (select 1 from vocabulario v where position(v.raiz in a.item) > 0 and position(' ' || v.nome || ' ' in a.atividade) > 0)
  ) from alvo a
$$;
revoke all on function private.icp_sector_matches(text, text) from public, anon, authenticated, service_role;

create or replace function private.score_market_discovery_icp(p_discovered_account_id uuid)
returns integer language plpgsql stable security definer set search_path = '' as $$
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
    if exists (select 1 from regexp_split_to_table(v_icp.sector, ',') x(item)
      where private.icp_sector_matches(v_account.sector, x.item)) then v_total := v_total + 1; end if;
  end if;
  if btrim(v_icp.company_size) <> '' then
    v_known := v_known + 1;
    if exists (select 1 from regexp_split_to_table(v_icp.company_size, ',') x(item) where btrim(x.item) <> '' and
      (lower(btrim(x.item)) = lower(btrim(coalesce(v_account.size_label, ''))) or
       (btrim(x.item) ~ '^[0-9]+-[0-9]+$' and lower(coalesce(v_account.size_label, '')) like '%' || lower(btrim(x.item)) || '%') or
       (v_account.employee_count is not null and btrim(x.item) = '10001+' and v_account.employee_count >= 10001) or
       (v_account.employee_count is not null and btrim(x.item) ~ '^[0-9]+-[0-9]+$' and v_account.employee_count between split_part(btrim(x.item), '-', 1)::bigint and split_part(btrim(x.item), '-', 2)::bigint))) then v_total := v_total + 1; end if;
  end if;
  if btrim(v_icp.geography) <> '' then
    v_known := v_known + 1;
    if exists (select 1 from regexp_split_to_table(v_icp.geography, ',') x(item) where btrim(x.item) <> '' and
      (lower(btrim(x.item)) = lower(btrim(coalesce(v_account.uf, ''))) or lower(coalesce(v_account.location, '') || ' ' || coalesce(v_account.uf, '') || ' ' || coalesce(v_account.city, '') || ' ' || coalesce(v_account.country, '')) like '%' || lower(btrim(x.item)) || '%')) then v_total := v_total + 1; end if;
  end if;
  if v_known = 0 then return null; end if;
  return round(100.0 * v_total / v_known)::integer;
end; $$;
revoke all on function private.score_market_discovery_icp(uuid) from public, anon, authenticated, service_role;

-- Recalcula as candidatas de mercado já existentes com a regra nova, como a 20261217190000 fez com a anterior.
with scored as materialized (
  select d.id, private.score_market_discovery_icp(d.id) as score
  from private.discovered_accounts d
  where d.origin = 'sinal' and exists (select 1 from private.signals g
    where g.discovered_account_id = d.id and g.market_signal_id is not null)
)
update private.discovered_accounts d set fit_score = coalesce(s.score, 0),
  fit_level = case when s.score is null then 'sem_dado' else private.discovery_level(s.score, 'baixo') end
from scored s where s.id = d.id;

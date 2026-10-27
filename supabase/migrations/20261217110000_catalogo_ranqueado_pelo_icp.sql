-- A prateleira "Para o seu nicho" cruza o catálogo existente com a versão vigente do ICP.
-- O ICP não é copiado para o catálogo e a chamada só devolve ids de cards globais.
create function public.list_signal_catalog_for_my_icp(p_workspace_id uuid)
returns table (id text, matches_icp boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_icp text;
  v_niche text;
begin
  perform private.require_active_membership(p_workspace_id);

  select lower(concat_ws(' ', v.sector, v.company_size, v.geography, v.target_roles::text,
    v.free_text, v.o_que_vende, v.mini_icp, v.por_que_compram))
  into v_icp
  from private.workspace_icp_versions v
  where v.workspace_id = p_workspace_id
  order by v.version desc
  limit 1;

  v_icp := coalesce(v_icp, '');
  v_niche := case
    when v_icp like '%comex%' or v_icp like '%comércio exterior%' or v_icp like '%comercio exterior%'
      or v_icp like '%importa%' or v_icp like '%exporta%' or v_icp like '%aduan%' or v_icp like '%trading%'
      then 'comex-e-importacao'
    when v_icp like '%contab%' or v_icp like '%tribut%' or v_icp like '%fiscal%' then 'contabilidade-e-tributario'
    when v_icp like '%juridic%' or v_icp like '%advoca%' or v_icp like '%direito%' then 'juridico-empresarial'
    when v_icp like '%energia%' or v_icp like '%mercado livre%' or v_icp like '%eletric%' then 'energia-e-mercado-livre'
    when v_icp like '%industria%' or v_icp like '%fabrica%' or v_icp like '%manufatura%' or v_icp like '%fornecedor%'
      then 'industria-fornecedores-b2b'
    when v_icp like '%logistic%' or v_icp like '%transporte%' or v_icp like '%frete%' or v_icp like '%armazen%'
      then 'logistica-e-transporte'
    when v_icp like '%corretora%' or v_icp like '%beneficio%' or v_icp like '%plano de saude%' or v_icp like '%seguro%'
      then 'corretoras-de-beneficios'
    when v_icp like '%agro%' or v_icp like '%agricol%' or v_icp like '%cooperativa%' or v_icp like '%rural%' or v_icp like '%safra%'
      then 'agro-b2b'
    else null
  end;

  return query
  select c.id, (v_niche is not null and exists (
    select 1 from public.signal_catalog_niches n
    where n.catalog_id = c.id and n.niche_slug = v_niche
  ))
  from public.signal_catalog c
  where c.workspace_id is null or c.workspace_id = p_workspace_id
  order by c.sort_order, c.name;
end;
$$;

revoke all on function public.list_signal_catalog_for_my_icp(uuid) from public, anon;
grant execute on function public.list_signal_catalog_for_my_icp(uuid) to authenticated;

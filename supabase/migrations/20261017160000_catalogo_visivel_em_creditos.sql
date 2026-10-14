-- O catálogo visível só fala em créditos (creditos-moeda-unica). A RPC que a tela chama devolvia `estimated_cost_usd` e a
-- tabela deixava o cliente ler a coluna: o dólar de custo sai dos dois. A RPC passa a devolver `credits_per_account`, e o papel
-- authenticated lê as colunas do card, menos o dólar. Dado nenhum é apagado: `estimated_cost_usd` continua na tabela.

drop function if exists public.list_visible_signal_catalog(uuid);

create function public.list_visible_signal_catalog(p_workspace_id uuid)
returns table (
  id text,
  name text,
  phrase text,
  family text,
  source_label text,
  estimated_cost_label text,
  credits_per_account integer,
  niche_slugs text[],
  collector_types text[],
  job_filters jsonb,
  workspace_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_user();
  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = p_workspace_id and m.user_id = (select auth.uid()) and m.active
  ) then
    raise exception 'not a member of this workspace' using errcode = '42501';
  end if;
  return query
  select c.id, c.name, c.phrase, c.family, c.source_label, c.estimated_cost_label, c.credits_per_account,
    coalesce(
      (select array_agg(n.niche_slug order by n.niche_slug) from public.signal_catalog_niches n where n.catalog_id = c.id),
      '{}'::text[]
    ),
    c.collector_types, c.job_filters, c.workspace_id
  from public.signal_catalog c
  where c.workspace_id is null or c.workspace_id = p_workspace_id
  order by c.sort_order, c.name;
end;
$$;

revoke all on function public.list_visible_signal_catalog(uuid) from public, anon;
grant execute on function public.list_visible_signal_catalog(uuid) to authenticated;

-- O cliente lê o card sem o dólar de custo.
revoke select on public.signal_catalog from authenticated;
grant select (id, name, phrase, family, source_label, estimated_cost_label, credits_per_account, collector_types, job_filters,
  workspace_id, sort_order, created_at) on public.signal_catalog to authenticated;

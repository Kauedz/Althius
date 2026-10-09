-- Ticket 31: limita a vitrine de Conexões sem apagar referências, habilitações ou Acessos.
alter table private.integration_catalog add column available boolean not null default true;
update private.integration_catalog set available = id in ('hubspot', 'notion');

create or replace function public.list_workspace_integrations(p_workspace_id uuid)
returns table (
  id text,
  name text,
  category text,
  description text,
  writes boolean,
  status text,
  enabled_at timestamptz,
  enabled_by uuid,
  app_portal text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);

  return query
  select
    c.id,
    c.name,
    c.category,
    c.description,
    c.writes,
    case
      when pr.integration_id is not null then
        case
          when wi.integration_id is not null then 'habilitada'
          else 'nao_habilitada'
        end
      else 'em_breve'
    end as status,
    wi.enabled_at,
    wi.enabled_by,
    wi.app_portal
  from private.integration_catalog c
  left join private.integration_connection_profiles pr
    on pr.integration_id = c.id
  left join public.workspace_integrations wi
    on wi.integration_id = c.id
   and wi.workspace_id = p_workspace_id
  where c.available
  order by
    case c.category
      when 'CRM' then 1
      when 'Enriquecimento' then 2
      when 'Conhecimento' then 3
      when 'Mídia paga' then 4
      else 5
    end,
    c.id;
end;
$$;


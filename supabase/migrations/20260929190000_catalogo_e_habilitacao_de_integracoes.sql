-- O catálogo real de Integrações e a habilitação pelo Administrador no Workspace (ticket 02).
-- As Integrações já constam em private.integration_catalog (criado na migration 20260929140000).
-- Aqui adicionamos categoria e descrição às integrações do catálogo e criamos public.workspace_integrations
-- para registrar quais integrações foram habilitadas em cada Workspace, por quem e quando.

alter table private.integration_catalog
  add column if not exists category text,
  add column if not exists description text;

update private.integration_catalog set
  category = case id
    when 'hubspot' then 'CRM'
    when 'clay' then 'Enriquecimento'
    when 'apollo' then 'Enriquecimento'
    when 'lusha' then 'Enriquecimento'
    when 'notion' then 'Conhecimento'
    when 'meta-ads' then 'Mídia paga'
    when 'google-ads' then 'Mídia paga'
  end,
  description = case id
    when 'hubspot' then 'Contas, contatos, negócios e sequências.'
    when 'clay' then 'Dados firmográficos e de tecnologia.'
    when 'apollo' then 'Contatos e sinais de compra.'
    when 'lusha' then 'Cargos e contatos do Comitê de compra.'
    when 'notion' then 'Páginas usadas como base de conhecimento e pautas.'
    when 'meta-ads' then 'Campanhas no Facebook e no Instagram.'
    when 'google-ads' then 'Campanhas de busca e display.'
  end
where category is null or description is null;

alter table private.integration_catalog
  alter column category set not null,
  alter column description set not null;

-- Registra quais Integrações foram habilitadas em cada Workspace por um Administrador ativo.
-- O primeiro Acesso conecta e fixa o app_portal (ticket 03); no ticket 02 ele começa nulo.
create table public.workspace_integrations (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  integration_id text not null references private.integration_catalog(id),
  enabled_by uuid not null references auth.users(id),
  enabled_at timestamptz not null default now(),
  app_portal text,
  primary key (workspace_id, integration_id)
);

alter table public.workspace_integrations enable row level security;

-- Toda Participação ativa lê as Integrações habilitadas do próprio Workspace.
create policy "active members read workspace integrations"
  on public.workspace_integrations for select to authenticated
  using (exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = workspace_integrations.workspace_id
      and m.user_id = (select auth.uid()) and m.active
  ));

revoke insert, update, delete on public.workspace_integrations from public, anon, authenticated;
grant select on public.workspace_integrations to authenticated;

-- Somente Administrador ativo pode habilitar Integrações no Workspace.
create function private.require_integration_admin(p_workspace_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if private.require_active_membership(p_workspace_id) <> 'admin' then
    raise exception 'only administrators can enable integrations' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.require_integration_admin(uuid) from public, anon, authenticated, service_role;

-- Lista o catálogo de Integrações com o estado no Workspace indicado:
-- 'habilitada', 'nao_habilitada' (para as disponíveis: hubspot e notion) ou 'em_breve' (para as demais).
create function public.list_workspace_integrations(p_workspace_id uuid)
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
      when c.id in ('hubspot', 'notion') then
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
  left join public.workspace_integrations wi
    on wi.integration_id = c.id
   and wi.workspace_id = p_workspace_id
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

revoke all on function public.list_workspace_integrations(uuid) from public, anon;
grant execute on function public.list_workspace_integrations(uuid) to authenticated;

-- Habilita uma Integração disponível no Workspace. Exige Administrador ativo.
create function public.enable_workspace_integration(
  p_workspace_id uuid,
  p_integration_id text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  perform private.require_integration_admin(p_workspace_id);

  if not exists (select 1 from private.integration_catalog where id = p_integration_id) then
    raise exception 'integration not found' using errcode = '22023';
  end if;

  if p_integration_id not in ('hubspot', 'notion') then
    raise exception 'integration is not available for enablement' using errcode = '22023';
  end if;

  insert into public.workspace_integrations (workspace_id, integration_id, enabled_by, enabled_at)
  values (p_workspace_id, p_integration_id, v_user_id, now())
  on conflict (workspace_id, integration_id) do nothing;
end;
$$;

revoke all on function public.enable_workspace_integration(uuid, text) from public, anon;
grant execute on function public.enable_workspace_integration(uuid, text) to authenticated;

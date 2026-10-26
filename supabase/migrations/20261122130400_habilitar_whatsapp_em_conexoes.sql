-- Habilitação do Canal WhatsApp por Workspace. Retirar preserva o registro e os dados de Conversas/Atividade.
create table private.whatsapp_channel_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  enabled boolean not null default false,
  ever_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table private.whatsapp_channel_settings enable row level security;
revoke all on private.whatsapp_channel_settings from public, anon, authenticated, service_role;

create function public.whatsapp_channel_status(p_workspace_id uuid)
returns table (state text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_enabled boolean;
  v_ever_enabled boolean;
begin
  perform private.require_active_membership(p_workspace_id);
  select s.enabled, s.ever_enabled into v_enabled, v_ever_enabled
  from private.whatsapp_channel_settings s where s.workspace_id = p_workspace_id;
  if not found then
    return query select 'nao_habilitado'::text;
  elsif v_enabled then
    return query select 'ativo'::text;
  elsif v_ever_enabled then
    return query select 'retirado'::text;
  else
    return query select 'nao_habilitado'::text;
  end if;
end;
$$;

create function public.set_whatsapp_channel_enabled(p_workspace_id uuid, p_enabled boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.require_active_admin(p_workspace_id);
  insert into private.whatsapp_channel_settings (workspace_id, enabled, ever_enabled, updated_by)
  values (p_workspace_id, coalesce(p_enabled, false), coalesce(p_enabled, false), auth.uid())
  on conflict (workspace_id) do update
    set enabled = coalesce(p_enabled, false), ever_enabled = true, updated_at = now(), updated_by = auth.uid();
  return coalesce(p_enabled, false);
end;
$$;

revoke all on function public.whatsapp_channel_status(uuid) from public, anon;
grant execute on function public.whatsapp_channel_status(uuid) to authenticated;
revoke all on function public.set_whatsapp_channel_enabled(uuid, boolean) from public, anon;
grant execute on function public.set_whatsapp_channel_enabled(uuid, boolean) to authenticated;

-- A preferência continua editável pelo Administrador. O padrão de todo Agente recebe o canal, preservando outros canais.
update private.agent_settings s
set channels = array(select distinct channel from unnest(s.channels || array['whatsapp']) channel order by channel)
from private.agents a
where a.id = s.agent_id and a.kind = 'padrao' and not ('whatsapp' = any(s.channels));

create or replace function private.seed_default_agents(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  with novos as (
    insert into private.agents (workspace_id, specialty, kind)
    select p_workspace_id, c.specialty, 'padrao'
    from private.specialty_catalog c
    on conflict do nothing
    returning id, workspace_id, specialty
  ), configuracao as (
    insert into private.agent_settings (agent_id, workspace_id, channels)
    select n.id, n.workspace_id, array['whatsapp']::text[] from novos n
  )
  insert into private.agent_permissions (agent_id, workspace_id, integration_id, permission)
  select n.id, n.workspace_id, d.integration_id, d.permission
  from novos n
  join private.specialty_default_permissions d on d.specialty = n.specialty;
end;
$$;

revoke all on function private.seed_default_agents(uuid) from public, anon, authenticated, service_role;

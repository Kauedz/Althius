-- O resultado da revogação fica disponível à pessoa que iniciou a retirada, sem guardar tokens.
create table private.integration_revocation_results (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  integration_id text not null references private.integration_catalog(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  result text not null check (result in ('revogado', 'nao_suportado', 'falhou', 'nao_se_aplica')),
  recorded_at timestamptz not null default now()
);
alter table private.integration_revocation_results enable row level security;
revoke all on private.integration_revocation_results from public, anon, authenticated, service_role;
create index integration_revocation_results_user_idx on private.integration_revocation_results (workspace_id, user_id, recorded_at desc);

create function public.integration_accesses_for_revocation(p_workspace_id uuid, p_user_id uuid, p_integration_id text)
returns table (user_id uuid, kind text, state text, secret text)
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = p_workspace_id and m.user_id = p_user_id and m.active and m.role = 'admin'
  ) then raise exception 'only administrators can enable integrations' using errcode = '42501'; end if;
  if not exists (select 1 from public.workspace_integrations wi where wi.workspace_id = p_workspace_id and wi.integration_id = p_integration_id) then
    raise exception 'integration not enabled' using errcode = '22023';
  end if;
  return query select a.user_id, a.kind, a.state,
    case when a.state = 'conectado' then private.integration_secret_get(a.secret_name) else null end
  from private.integration_accesses a
  where a.workspace_id = p_workspace_id and a.integration_id = p_integration_id
  order by a.user_id;
end;
$$;

create function public.disable_workspace_integration_with_revocation_results(
  p_workspace_id uuid, p_user_id uuid, p_integration_id text, p_results jsonb
) returns integer language plpgsql volatile security definer set search_path = '' as $$
declare v_removed integer;
begin
  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = p_workspace_id and m.user_id = p_user_id and m.active and m.role = 'admin'
  ) then raise exception 'only administrators can enable integrations' using errcode = '42501'; end if;
  if not exists (select 1 from public.workspace_integrations wi where wi.workspace_id = p_workspace_id and wi.integration_id = p_integration_id) then
    raise exception 'integration not enabled' using errcode = '22023';
  end if;
  insert into private.integration_revocation_results(workspace_id, integration_id, user_id, result)
  select p_workspace_id, p_integration_id, x.user_id, x.result
  from jsonb_to_recordset(coalesce(p_results, '[]'::jsonb)) as x(user_id uuid, result text)
  where exists (select 1 from private.integration_accesses a where a.workspace_id = p_workspace_id and a.integration_id = p_integration_id and a.user_id = x.user_id)
    and x.result in ('revogado', 'nao_suportado', 'falhou', 'nao_se_aplica');
  delete from private.integration_connect_attempts a where a.workspace_id = p_workspace_id and a.integration_id = p_integration_id;
  with removidos as (
    delete from private.integration_accesses a where a.workspace_id = p_workspace_id and a.integration_id = p_integration_id returning 1
  ) select count(*)::integer into v_removed from removidos;
  delete from public.workspace_integrations wi where wi.workspace_id = p_workspace_id and wi.integration_id = p_integration_id;
  return v_removed;
end;
$$;

revoke all on function public.integration_accesses_for_revocation(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.disable_workspace_integration_with_revocation_results(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.integration_accesses_for_revocation(uuid, uuid, text) to service_role;
grant execute on function public.disable_workspace_integration_with_revocation_results(uuid, uuid, text, jsonb) to service_role;

-- A retirada precisa passar pelo servidor para revogar antes de apagar os segredos.
revoke all on function public.disable_workspace_integration(uuid, text) from authenticated;

-- Cada participante consulta apenas o próprio resultado após a Integração sair do catálogo habilitado.
create function public.integration_revocation_results_for_user(p_workspace_id uuid, p_user_id uuid)
returns table (integration_id text, result text, recorded_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or auth.uid() <> p_user_id then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from public.workspace_memberships m where m.workspace_id = p_workspace_id and m.user_id = p_user_id and m.active) then
    raise exception 'active workspace membership required' using errcode = '42501';
  end if;
  return query select r.integration_id, r.result, r.recorded_at
  from private.integration_revocation_results r
  where r.workspace_id = p_workspace_id and r.user_id = p_user_id
  order by r.recorded_at desc limit 20;
end;
$$;
revoke all on function public.integration_revocation_results_for_user(uuid, uuid) from public, anon;
grant execute on function public.integration_revocation_results_for_user(uuid, uuid) to authenticated;

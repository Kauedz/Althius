-- Desconectar pelo servidor (conector-clay 02): a Edge Function `integration-connect` revoga o token no app (RFC 7009)
-- antes de apagar o Acesso, então a remoção passa a acontecer pela chave de serviço, com o participante que o JWT
-- identificou. Mesma regra de `disconnect_integration_access` (20261001160000): só o Acesso da própria pessoa, só com
-- Participação ativa, e o gatilho `integration_accesses_drop_secret` apaga o segredo no Vault. Não exige a Integração
-- habilitada: o que sobrou de uma Integração retirada também sai. A RPC antiga continua, sem mudança.
create function public.disconnect_integration_access_for_user(p_workspace_id uuid, p_user_id uuid, p_integration_id text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_removed integer;
begin
  if p_user_id is null or not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = p_workspace_id and m.user_id = p_user_id and m.active
  ) then
    raise exception 'active workspace membership required' using errcode = '42501';
  end if;
  with removidos as (
    delete from private.integration_accesses x
    where x.workspace_id = p_workspace_id and x.integration_id = p_integration_id and x.user_id = p_user_id
    returning 1
  )
  select count(*)::integer into v_removed from removidos;
  return v_removed > 0;
end;
$$;

revoke all on function public.disconnect_integration_access_for_user(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.disconnect_integration_access_for_user(uuid, uuid, text) to service_role;

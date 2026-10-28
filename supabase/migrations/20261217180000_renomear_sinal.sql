-- Renomeia um Monitoramento sem reenviar Plano, público, critérios ou Agenda.
create function public.rename_signal_monitor(
  p_workspace_id uuid,
  p_id uuid,
  p_name text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.require_active_membership(p_workspace_id);
  v_existing private.signal_monitors%rowtype;
begin
  select * into v_existing
  from private.signal_monitors m
  where m.workspace_id = p_workspace_id and m.id = p_id
  for update;

  if not found then
    raise exception 'monitor not found' using errcode = 'P0002';
  end if;

  perform private.assert_can_change_monitor(v_role, v_existing.created_by);

  if p_name is null or btrim(p_name) = '' or length(btrim(p_name)) > 120 then
    raise exception 'invalid monitor' using errcode = '22023';
  end if;

  update private.signal_monitors
  set name = btrim(p_name), updated_at = now()
  where id = p_id;

  return p_id;
end;
$$;

revoke all on function public.rename_signal_monitor(uuid, uuid, text) from public, anon;
grant execute on function public.rename_signal_monitor(uuid, uuid, text) to authenticated;

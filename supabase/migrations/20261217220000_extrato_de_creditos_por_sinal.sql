-- O extrato inclui o Monitoramento associado à reserva, sem alterar o leitor antigo.
create function public.list_credit_statement(p_workspace_id uuid, p_limit integer default 200)
returns table (
  id uuid, amount numeric, kind text, action text, note text, created_at timestamptz,
  signal_id uuid, signal_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin boolean;
begin
  v_admin := private.require_active_membership(p_workspace_id) = 'admin';
  return query
  select e.id, e.amount, e.kind, r.action, e.note, e.created_at, m.id, m.name
  from private.credit_entries e
  left join private.credit_reservations r on r.id = e.reservation_id
  left join lateral (
    select case
      when r.action = 'cascata_de_sinais' then cr.monitor_id
      when r.action = 'account_scan' and split_part(r.action_key, ':', 1) = 'scan'
        and split_part(r.action_key, ':', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then split_part(r.action_key, ':', 2)::uuid
      when r.action = 'account_scan' and split_part(r.action_key, ':', 1) in ('rescan-manual', 'rescan-auto')
        and split_part(r.action_key, ':', 3) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then split_part(r.action_key, ':', 3)::uuid
      else null::uuid
    end as id
    from private.credit_reservations rr
    left join private.signal_cascade_runs cr
      on r.action = 'cascata_de_sinais' and cr.workspace_id = rr.workspace_id and cr.reservation_id = rr.id
    where rr.id = r.id
    limit 1
  ) link on true
  left join private.signal_monitors m on m.id = link.id and m.workspace_id = e.workspace_id
  where e.workspace_id = p_workspace_id
    and (v_admin or e.kind <> 'acao' or e.user_id = auth.uid())
  order by e.created_at desc, e.id desc
  limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;

revoke all on function public.list_credit_statement(uuid, integer) from public, anon;
grant execute on function public.list_credit_statement(uuid, integer) to authenticated;

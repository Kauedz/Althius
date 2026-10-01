-- Os desfechos dos Envios de uma Sequência, para a tela do titular (motor-hermes, ticket 03). Lê o que
-- private.send_outcomes guarda (migration 20261001100000) para os Envios da Sequência de quem chama; a classificação
-- continua por public.set_send_outcome. Só o titular da Sequência, com Participação ativa, lê.

create function public.list_send_outcomes(p_sequence_id uuid)
returns table (send_id uuid, outcome text, classified_by_kind text, classified_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.sequences s
    join public.workspace_memberships m
      on m.workspace_id = s.workspace_id and m.user_id = v_user_id and m.active
    where s.id = p_sequence_id and s.owner_user_id = v_user_id
  ) then
    raise exception 'sequence not found or not owned by active user' using errcode = '42501';
  end if;
  return query
    select o.send_id, o.outcome, o.classified_by_kind, o.classified_at
    from private.send_outcomes o
    join private.sequence_step_sends e on e.id = o.send_id
    where e.sequence_id = p_sequence_id;
end;
$$;

revoke all on function public.list_send_outcomes(uuid) from public, anon;
grant execute on function public.list_send_outcomes(uuid) to authenticated;

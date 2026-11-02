-- Reunião marcada move o cartão do kanban (spec kanban-de-prospeccao, ticket 07, Parte A). O desfecho de um Envio
-- (`private.send_outcomes`, 20261001100000) que vira "reunião marcada" ou "oportunidade" (que pressupõe a reunião)
-- chama o gancho `private.record_prospecting_event` com `reuniao_marcada`. Entra por gatilho, como o Envio e a
-- resposta do ticket 02, sem redefinir `private.record_send_outcome`.
--
-- O gancho só leva o cartão para a frente: Conta em Reunião ou No CRM fica onde está, e reclassificar o Envio depois
-- (ex.: para resposta negativa) não volta o cartão. Só a Conta do mesmo Workspace do desfecho é alcançada.

create function private.prospecting_on_send_outcome()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
begin
  if new.outcome in ('reuniao_marcada', 'oportunidade')
     and (tg_op = 'INSERT' or old.outcome not in ('reuniao_marcada', 'oportunidade')) then
    for v in
      select a.* from private.sequence_step_sends s
      cross join lateral private.sequence_prospecting_account(s.sequence_id) a
      where s.id = new.send_id and a.workspace_id = new.workspace_id
    loop
      perform private.record_prospecting_event(v.workspace_id, v.target_account_id, 'reuniao_marcada');
    end loop;
  end if;
  return null;
end;
$$;

revoke all on function private.prospecting_on_send_outcome() from public, anon, authenticated, service_role;

create trigger send_outcomes_prospecting
  after insert or update of outcome on private.send_outcomes
  for each row execute function private.prospecting_on_send_outcome();

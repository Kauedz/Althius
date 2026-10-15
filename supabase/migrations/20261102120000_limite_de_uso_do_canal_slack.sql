-- Limite de uso do Canal Slack por pessoa e por Workspace (slack-canal 08). Só aditiva: colunas novas com padrão na
-- instalação, um índice e uma RPC nova, sem `drop`.
--
-- Os limites ficam na instalação do Canal do Workspace e podem ser ajustados por Workspace com um `update` (nada na tela
-- por enquanto). Padrões: 20 pedidos por pessoa a cada 10 minutos e 200 pedidos por Workspace por hora. Conta as
-- Execuções com o gatilho Canal criadas na janela; as recusas do bot não criam Execução e não contam.

alter table private.slack_channel_installations
  add column person_limit integer not null default 20 check (person_limit between 1 and 10000),
  add column person_window interval not null default interval '10 minutes'
    check (person_window between interval '1 minute' and interval '1 day'),
  add column workspace_limit integer not null default 200 check (workspace_limit between 1 and 100000),
  add column workspace_window interval not null default interval '1 hour'
    check (workspace_window between interval '1 minute' and interval '1 day');

create index agent_runs_channel_usage_idx on private.agent_runs (workspace_id, created_at, requested_by)
  where trigger_kind = 'canal';

-- 'ok', 'pessoa' (a pessoa passou do limite dela) ou 'workspace' (o Workspace passou do dele). Sem instalação ativa,
-- valem os padrões. Só o service role (a função de eventos) chama.
create function public.slack_channel_usage_limit(p_workspace_id uuid, p_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_person_limit integer := 20;
  v_person_window interval := interval '10 minutes';
  v_workspace_limit integer := 200;
  v_workspace_window interval := interval '1 hour';
begin
  select i.person_limit, i.person_window, i.workspace_limit, i.workspace_window
  into v_person_limit, v_person_window, v_workspace_limit, v_workspace_window
  from private.slack_channel_installations i
  where i.workspace_id = p_workspace_id and i.state = 'ativo';
  if not found then
    v_person_limit := 20;
    v_person_window := interval '10 minutes';
    v_workspace_limit := 200;
    v_workspace_window := interval '1 hour';
  end if;

  if (select count(*) from private.agent_runs r
      where r.workspace_id = p_workspace_id and r.trigger_kind = 'canal' and r.requested_by = p_user_id
        and r.created_at > clock_timestamp() - v_person_window) >= v_person_limit then
    return 'pessoa';
  end if;
  if (select count(*) from private.agent_runs r
      where r.workspace_id = p_workspace_id and r.trigger_kind = 'canal'
        and r.created_at > clock_timestamp() - v_workspace_window) >= v_workspace_limit then
    return 'workspace';
  end if;
  return 'ok';
end;
$$;

revoke all on function public.slack_channel_usage_limit(uuid, uuid) from public, anon, authenticated;
grant execute on function public.slack_channel_usage_limit(uuid, uuid) to service_role;

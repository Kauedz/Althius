-- A Atividade dos Agentes no Workspace operacional: a página do Agente lista as Execuções dele (private.agent_runs),
-- as mais recentes primeiro, com o gatilho (Conversa, Rotina ou Canal), o pedido e o começo da resposta.
-- Vale a regra da Conversa (20260929180000): ela é de quem a começou, e só ele a lê. Por isso a Atividade de cada pessoa
-- traz só as Execuções das Conversas dela, inclusive as abertas por uma Menção no Slack (cujo dono é quem mencionou) e
-- as das Rotinas que ela criou. Sair do Workspace corta a leitura, como nas outras leituras de Agentes.
-- Entram as Conversas diretas com um Agente; a Coordenação não é um Agente e fica fora. Só leitura: nada aqui cria,
-- altera ou roda uma Execução.

create or replace function public.agent_activity(
  p_workspace_id uuid,
  p_agent_id uuid default null,
  p_trigger_kind text default null,
  p_limit integer default 50,
  p_before timestamptz default null
)
returns table (
  id uuid,
  agent_id uuid,
  agent_name text,
  conversation_id uuid,
  trigger_kind text,
  status text,
  request_text text,
  result_text text,
  error_code text,
  created_at timestamptz,
  finished_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user();
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  perform private.require_active_membership(p_workspace_id);
  return query
    select r.id, c.agent_id, a.name, r.conversation_id, r.trigger_kind, r.status, r.request_text,
      (select left(e.payload ->> 'texto', 280) from private.agent_run_events e
       where e.run_id = r.id and e.kind = 'resposta' and coalesce(e.payload ->> 'texto', '') <> ''
       order by e.seq desc limit 1),
      r.error_code, r.created_at, r.finished_at
    from private.agent_runs r
    join private.agent_conversations c on c.workspace_id = r.workspace_id and c.id = r.conversation_id
    join private.agents a on a.workspace_id = c.workspace_id and a.id = c.agent_id
    where r.workspace_id = p_workspace_id
      and c.owner_id = v_user_id
      and c.kind = 'agente'
      and (p_agent_id is null or c.agent_id = p_agent_id)
      and (p_trigger_kind is null or r.trigger_kind = p_trigger_kind)
      and (p_before is null or r.created_at < p_before)
    order by r.created_at desc, r.id desc
    limit v_limit;
end;
$$;

revoke all on function public.agent_activity(uuid, uuid, text, integer, timestamptz) from public, anon;
grant execute on function public.agent_activity(uuid, uuid, text, integer, timestamptz) to authenticated;

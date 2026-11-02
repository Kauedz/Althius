-- Ticket 03 do desfazer do Sinais first: a Sequência volta a ser responsabilidade do Rhetor.
-- A Permissão de passo continua existindo para auditoria e para o gatilho de semeadura; a guarda operacional volta a ser a Especialidade.

create or replace function private.agent_can_propose_sequence(p_workspace_id uuid, p_agent_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.agents a
    where a.workspace_id = p_workspace_id
      and a.id = p_agent_id
      and a.specialty = 'rhetor'
  );
$$;

revoke all on function private.agent_can_propose_sequence(uuid, uuid) from public, anon, authenticated, service_role;


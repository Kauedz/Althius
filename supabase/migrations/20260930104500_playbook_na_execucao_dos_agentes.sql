-- O Playbook chega à Execução dos Agentes (agentes-em-conversa, ticket 03). A Reserva (claim_agent_run) não muda:
-- o motor pede o Playbook pela Execução em andamento, como já pede as Contas-alvo, e a função resolve o Workspace
-- dela. Devolve a seção Empresa e as seções da Especialidade do Agente que vai falar (playbook_for_specialty), só as
-- já escritas. Nada de Contatos: o Playbook é o texto da empresa, não dado de pessoas.

create function public.agent_run_playbook(p_run_id uuid, p_specialty text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
begin
  select r.workspace_id into v_workspace_id from private.agent_runs r where r.id = p_run_id and r.status = 'running';
  if v_workspace_id is null then
    raise exception 'run is not running' using errcode = '55000';
  end if;
  return public.playbook_for_specialty(v_workspace_id, p_specialty);
end;
$$;

revoke all on function public.agent_run_playbook(uuid, text) from public, anon, authenticated;
grant execute on function public.agent_run_playbook(uuid, text) to service_role;

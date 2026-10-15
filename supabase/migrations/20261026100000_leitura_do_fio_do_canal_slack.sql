-- Ler o fio do Canal Slack pela chave (slack-canal 04; decisões Q13, Q19 e Q20). Dentro de um thread que já é um fio, a
-- função de eventos precisa saber, antes de pedir qualquer Execução, de quem é o fio e com qual Agente: o dono continua
-- a Conversa sem novo @ (Q19); outra pessoa recebe "este fio é a Conversa de <dono>" (Q13); o dono que menciona outro
-- Agente recebe "este fio é do Agente <X>" (Q20). As recusas saem daqui sem tocar a Execução nem os Créditos. A
-- continuação e o "ocupado" seguem pela start_slack_channel_run (20261025100000), sem mudança.
--
-- Devolve o dono (a Conta de usuário e o nome que a Althius mostra dela: o de Meu perfil ou, sem ele, o do cadastro) e o
-- Agente (id e nome), ou nenhuma linha quando o thread não é um fio deste Workspace. Nunca devolve o e-mail.
create function public.slack_channel_thread(
  p_workspace_id uuid,
  p_team_id text,
  p_channel_id text,
  p_thread_ts text
) returns table (owner_id uuid, owner_name text, agent_id uuid, agent_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select t.owner_id,
    coalesce(p.display_name, private.registered_name(u.raw_user_meta_data)),
    t.agent_id,
    a.name
  from private.slack_channel_threads t
  join private.agents a on a.id = t.agent_id
  join auth.users u on u.id = t.owner_id
  left join private.user_profiles p on p.user_id = t.owner_id
  where t.workspace_id = p_workspace_id
    and t.team_id = p_team_id
    and t.channel_id = p_channel_id
    and t.thread_ts = p_thread_ts
$$;

revoke all on function public.slack_channel_thread(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.slack_channel_thread(uuid, text, text, text) to service_role;

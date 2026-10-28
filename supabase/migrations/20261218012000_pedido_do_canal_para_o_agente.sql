-- Fase 7 (o mesmo agente pelo Slack e pelo WhatsApp): um pedido que chegou por um Canal pode ser levado ao agente único
-- no app. O worker responde no Canal com um link para a `/`; a tela lê aqui o texto do pedido e a pessoa confere e envia,
-- com a sessão dela. Nada roda no Canal sem passar pelo app: é a aprovação pelo link.
-- Só quem pediu lê, e só Execução de Canal de um Workspace onde ainda participa. Não muda nada.

create function public.get_my_channel_request(p_run_id uuid)
returns table (request_text text, origin text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user();
  v_workspace_id uuid;
begin
  select r.workspace_id into v_workspace_id
  from private.agent_runs r
  where r.id = p_run_id and r.requested_by = v_user_id and r.trigger_kind = 'canal';
  if not found then
    raise exception 'channel request not found' using errcode = 'P0002';
  end if;
  perform private.require_active_membership(v_workspace_id);
  return query
    select r.request_text, c.origin, r.created_at
    from private.agent_runs r
    join private.agent_conversations c on c.id = r.conversation_id
    where r.id = p_run_id;
end;
$$;

revoke all on function public.get_my_channel_request(uuid) from public, anon;
grant execute on function public.get_my_channel_request(uuid) to authenticated;

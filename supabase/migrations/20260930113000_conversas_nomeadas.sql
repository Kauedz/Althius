-- Conversas nomeadas (agentes-em-conversa, ticket 04). A Conversa de quem a começou ganha um nome opcional: sem nome, a
-- tela mostra o primeiro pedido. Aditiva: a coluna nasce vazia, as funções antigas não mudam (list_agent_conversations
-- segue devolvendo as mesmas colunas), e a Conversa continua só de quem a começou (ADR-0008).

alter table private.agent_conversations
  add column title text check (title is null or (title = btrim(title) and length(title) between 1 and 80));

-- As Conversas de quem pede, da mais recente à mais antiga, com o nome e o primeiro pedido para a lista.
create function public.list_named_agent_conversations(p_workspace_id uuid)
returns table (
  id uuid,
  kind text,
  agent_id uuid,
  title text,
  first_request text,
  updated_at timestamptz,
  open_run_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user();
begin
  perform private.require_active_membership(p_workspace_id);
  return query
    select c.id, c.kind, c.agent_id, c.title,
      (select r.request_text from private.agent_runs r where r.conversation_id = c.id order by r.created_at, r.id limit 1),
      c.updated_at,
      (select r.id from private.agent_runs r where r.conversation_id = c.id and r.status in ('queued', 'running'))
    from private.agent_conversations c
    where c.workspace_id = p_workspace_id and c.owner_id = v_user_id
    order by c.updated_at desc, c.id
    limit 50;
end;
$$;

-- Dá nome à Conversa; um nome vazio volta ao padrão (o primeiro pedido). Renomear não muda a ordem da lista.
create function public.rename_agent_conversation(p_conversation_id uuid, p_title text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user();
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_workspace_id uuid;
begin
  select c.workspace_id into v_workspace_id from private.agent_conversations c
  where c.id = p_conversation_id and c.owner_id = v_user_id;
  if v_workspace_id is null then
    raise exception 'conversation not found' using errcode = 'P0002';
  end if;
  perform private.require_active_membership(v_workspace_id);
  if v_title is not null and length(v_title) > 80 then
    raise exception 'invalid title' using errcode = '22023';
  end if;
  update private.agent_conversations set title = v_title where id = p_conversation_id;
end;
$$;

revoke all on function public.list_named_agent_conversations(uuid) from public, anon;
revoke all on function public.rename_agent_conversation(uuid, text) from public, anon;
grant execute on function public.list_named_agent_conversations(uuid) to authenticated;
grant execute on function public.rename_agent_conversation(uuid, text) to authenticated;

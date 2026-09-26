-- As respostas recebidas de uma Sequência, para a página de detalhe do titular (canais-04, PR 3: tela).
-- Mesma projeção de get_received_email, uma linha por resposta, só para o Vendedor responsável ativo.
create function public.list_received_emails(p_sequence_id uuid)
returns table (
  interaction_id uuid, sequence_id uuid, send_id uuid, contact_id uuid, from_email text, from_name text,
  subject text, body text, snippet text, received_at timestamptz, attachments jsonb
)
language plpgsql
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
    select r.interaction_id, r.sequence_id, r.send_id, r.contact_id, r.from_email, r.from_name,
      r.subject, r.body, r.snippet, r.received_at, r.attachments
    from private.received_emails r
    where r.sequence_id = p_sequence_id
    order by r.received_at desc;
end;
$$;

revoke all on function public.list_received_emails(uuid) from public, anon;
grant execute on function public.list_received_emails(uuid) to authenticated;

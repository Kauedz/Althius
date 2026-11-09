-- Retirada do Playbook (contexto-da-empresa, ticket 07). O rascunho de resposta do Rhetor (Propostas de resposta,
-- canais-08) era a última operação ativa que lia as seções do Playbook: reply_proposal_context (de 20261001180000, a
-- única definição) passa a devolver os três textos vigentes do Contexto da empresa em `contexto`, no lugar de
-- `playbook`. O resto do contrato não muda: a Conta-alvo, o Contato, a conversa e o tom do Rhetor.
-- Nada é apagado: as tabelas e as funções do Playbook ficam no banco, sem uso pela tela nem pelas Edge Functions.

create or replace function public.reply_proposal_context(p_job_id uuid, p_claim_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_job private.reply_proposal_jobs;
  v_proposal private.reply_proposals;
  v_account public.target_accounts;
  v_contact public.contacts;
  v_workspace text;
  v_seller text;
  v_agent jsonb;
  v_messages jsonb;
  v_contexto jsonb := null;
begin
  v_job := private.running_reply_job(p_job_id, p_claim_token);
  select p.* into v_proposal from private.reply_proposals p where p.id = v_job.proposal_id;
  select a.* into v_account from public.target_accounts a
  where a.workspace_id = v_proposal.workspace_id and a.id = v_proposal.target_account_id;
  select c.* into v_contact from public.contacts c
  where c.workspace_id = v_proposal.workspace_id and c.id = v_proposal.contact_id;
  select w.name into v_workspace from public.workspaces w where w.id = v_proposal.workspace_id;
  select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(u.raw_user_meta_data ->> 'name'), ''))
    into v_seller from auth.users u where u.id = v_proposal.owner_user_id;

  select jsonb_build_object('name', a.name, 'instructions', coalesce(s.instructions, ''), 'voice_tone', coalesce(s.voice_tone, ''))
    into v_agent
  from private.agents a
  left join private.agent_settings s on s.agent_id = a.id
  where a.workspace_id = v_proposal.workspace_id and a.specialty = 'rhetor' and a.kind = 'padrao';

  -- A conversa: as respostas recebidas dela, o que o vendedor enviou ao Contato na Sequência e as respostas já enviadas.
  select coalesce(jsonb_agg(m.item order by m.at), '[]'::jsonb) into v_messages
  from (
    select x.at, x.item from (
      select r.received_at as at, jsonb_build_object(
        'direction', 'recebida', 'at', r.received_at, 'subject', r.subject, 'text', left(coalesce(r.body, r.snippet, ''), 6000)) as item
      from private.received_emails r
      where r.sequence_id = v_proposal.sequence_id
        and r.workspace_id = v_proposal.workspace_id
        and (case when v_proposal.channel = 'email' then
          coalesce(nullif(btrim(r.provider_thread_id), ''), 'de:' || lower(coalesce(r.from_email, ''))) = v_proposal.conversation_ref
          else false end)
      union all
      select e.sent_at, jsonb_build_object(
        'direction', 'enviada', 'at', e.sent_at, 'subject', e.subject, 'text', left(coalesce(e.body, ''), 6000))
      from private.sequence_step_sends e
      where e.sequence_id = v_proposal.sequence_id and e.status = 'sent' and e.sent_at is not null
        and e.contact_id is not distinct from v_proposal.contact_id and e.body is not null
      union all
      select o.sent_at, jsonb_build_object(
        'direction', 'enviada', 'at', o.sent_at, 'subject', o.subject, 'text', left(coalesce(o.body, ''), 6000))
      from private.reply_proposals o
      where o.sequence_id = v_proposal.sequence_id and o.channel = v_proposal.channel
        and o.conversation_ref is not distinct from v_proposal.conversation_ref
        and o.status = 'enviada' and o.id <> v_proposal.id and o.sent_at is not null
      order by 1 desc
      limit 8
    ) x
  ) m;

  -- O que o Workspace definiu sobre a empresa: os três textos vigentes do Contexto da empresa, com a versão.
  v_contexto := private.current_company_context(v_proposal.workspace_id);

  return jsonb_build_object(
    'workspace', v_workspace,
    'channel', v_proposal.channel,
    'subject', v_proposal.subject,
    'seller', v_seller,
    'account', jsonb_build_object('name', v_account.name, 'domain', v_account.domain, 'segment', v_account.segment),
    'contact', case when v_contact.id is null then null
      else jsonb_build_object('name', v_contact.name, 'role', v_contact.role) end,
    'recipient_name', v_proposal.recipient_name,
    'messages', v_messages,
    'contexto', jsonb_build_object('version', v_contexto -> 'version', 'empresa', coalesce(v_contexto ->> 'empresa', ''),
      'icp', coalesce(v_contexto ->> 'icp', ''), 'personas', coalesce(v_contexto ->> 'personas', '')),
    'agent', coalesce(v_agent, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.reply_proposal_context(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reply_proposal_context(uuid, uuid) to service_role;

-- Propostas de resposta pelo Hermes (ADR-0018, emenda de 2026-10-14: toda IA da Althius passa pelo Hermes).
-- A fila de IA dos Sinais (private.signal_llm_requests) é uma fila genérica de texto (sistema, pedido, limite de tokens)
-- que o worker `_hermes-worker` já responde. Ela passa a levar também o rascunho da Proposta de resposta, com a
-- finalidade marcada: o worker usa a instrução de rascunho, não a de classificação. O reply-proposal-runner enfileira
-- pela Proposta reservada (job + token): o Workspace vem do banco, nunca do chamador.

alter table private.signal_llm_requests
  add column purpose text not null default 'sinal' check (purpose in ('sinal', 'resposta'));

-- O sistema da Proposta leva o Playbook (até 24.000 caracteres, MAX_CARACTERES_DO_PLAYBOOK) mais as instruções do
-- Rhetor: os 20.000 da fila dos Sinais não cabem. O teto passa a 40.000; a função corta antes (modelo-hermes.ts) e trata
-- o pedido grande demais como falha que não passa sozinha.
alter table private.signal_llm_requests
  drop constraint signal_llm_requests_system_prompt_check,
  add constraint signal_llm_requests_system_prompt_check check (length(system_prompt) between 1 and 40000);

create function public.enqueue_reply_proposal_llm_request(
  p_job_id uuid,
  p_claim_token uuid,
  p_system text,
  p_user text,
  p_max_tokens integer default 2000
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.reply_proposal_jobs;
  v_workspace uuid;
  v_id uuid;
begin
  v_job := private.running_reply_job(p_job_id, p_claim_token);
  select p.workspace_id into v_workspace from private.reply_proposals p where p.id = v_job.proposal_id;
  -- Mesmas regras da fila (limpeza, prazo de 3 minutos, 50 pedidos por Workspace).
  v_id := public.enqueue_signal_llm_request(v_workspace, p_system, p_user, p_max_tokens);
  update private.signal_llm_requests set purpose = 'resposta' where id = v_id;
  return v_id;
end;
$$;
revoke all on function public.enqueue_reply_proposal_llm_request(uuid, uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.enqueue_reply_proposal_llm_request(uuid, uuid, text, text, integer) to service_role;

drop function public.claim_signal_llm_request();
create function public.claim_signal_llm_request()
returns table (id uuid, system_prompt text, user_prompt text, max_tokens integer, purpose text)
language sql
security definer
set search_path = ''
as $$
  update private.signal_llm_requests r
     set status = 'running', claimed_at = now()
   where r.id = (
     select q.id from private.signal_llm_requests q
      where q.status = 'queued' and q.created_at > now() - interval '3 minutes'
      order by q.created_at
      for update skip locked
      limit 1)
  returning r.id, r.system_prompt, r.user_prompt, r.max_tokens, r.purpose;
$$;
revoke all on function public.claim_signal_llm_request() from public, anon, authenticated;
grant execute on function public.claim_signal_llm_request() to service_role;

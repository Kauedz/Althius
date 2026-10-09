-- O teto das Propostas de resposta e os escopos sem executor (creditos-e-planos, ticket 03; decisão 6 do Renan em
-- 08/10/2026). A primeira geração de uma proposta é uma ação automática de Agente: só roda com Execuções de Agentes e o
-- Rhetor em automático, cada um com teto, e soma o crédito da rodada aos dois. Gerar de novo é o clique do titular, que
-- vale como confirmação e não passa pelo teto. Quem consulta é o reply-proposal-runner, antes de reservar o crédito
-- (begin_reply_proposal_round segue como está). Os escopos que ninguém executa ficam em confirmar: o banco recusa ligar o
-- automático deles, e a página os mostra travados.

-- O que a geração automática somou aos tetos; nulo quando nada foi somado ou quando a falha já devolveu.
alter table private.reply_proposal_jobs
  add column automatic_spend numeric(12, 2) check (automatic_spend >= 0);

-- Quem roda sozinho hoje: a varredura de Sinais (sinais-reais 02 e 08), as Execuções de Agentes e o Rhetor (a primeira
-- geração das Propostas de resposta). Quem ligar o automático de outro escopo (o enriquecimento-em-cascata 02, por
-- exemplo) redefine esta função na migration dele.
create function private.automation_scope_runs(p_workspace_id uuid, p_scope text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_scope in ('acao:varredura', 'acao:agentes')
    or exists (
      select 1 from private.agents a
      where a.workspace_id = p_workspace_id and a.specialty = 'rhetor' and a.kind = 'padrao'
        and p_scope = 'agente:' || a.id::text
    );
$$;

-- Travar em confirmar vale também para o que já foi gravado: o automático ligado antes desta migration num escopo que
-- ninguém executa volta a confirmar (o teto fica). Quem liberar o escopo depois não herda um automático esquecido.
update private.automation_settings s set mode = 'confirmar', updated_at = now()
where s.mode = 'automatico' and not private.automation_scope_runs(s.workspace_id, s.scope);

-- Por que o escopo recusaria uma rodada deste valor, sem gastar nada: confirmar, sem_teto, teto_atingido (pausado ou já
-- no teto) ou sem_espaco (a rodada passaria do teto: consultar o escopo o pausa e avisa). Nulo quando ela cabe.
create function private.automation_scope_refusal(p_workspace_id uuid, p_scope text, p_amount numeric)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v private.automation_settings%rowtype;
  v_spent numeric;
begin
  select * into v from private.automation_settings c where c.workspace_id = p_workspace_id and c.scope = p_scope;
  select g.spent into v_spent from private.automation_spend g
  where g.workspace_id = p_workspace_id and g.scope = p_scope and g.month = date_trunc('month', now())::date;
  return coalesce(
    private.automation_block_reason(v.mode, v.monthly_cap, v_spent, v.paused_at),
    case when coalesce(v_spent, 0) + p_amount > v.monthly_cap then 'sem_espaco' end
  );
end;
$$;

-- Os tetos de uma proposta: Execuções de Agentes e o Rhetor que a escreve.
create function private.reply_proposal_cap_scopes(p_author_agent_id uuid)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['acao:agentes']
    || case when p_author_agent_id is null then '{}'::text[] else array['agente:' || p_author_agent_id::text] end;
$$;

-- Os créditos de uma rodada da geração, como reserve_credits os cobra: 1, ou 20% com a chave de IA do cliente.
create function private.reply_proposal_round_credits(p_workspace_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from private.workspace_ai_keys k where k.workspace_id = p_workspace_id)
      then round(c.credits * private.own_ai_key_factor(), 2)
    else c.credits
  end
  from private.credit_action_prices c where c.action = 'agent_round';
$$;

revoke all on function private.automation_scope_runs(uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.automation_scope_refusal(uuid, text, numeric) from public, anon, authenticated, service_role;
revoke all on function private.reply_proposal_cap_scopes(uuid) from public, anon, authenticated, service_role;
revoke all on function private.reply_proposal_round_credits(uuid) from public, anon, authenticated, service_role;

-- A página: os escopos que rodam sozinhos. Os outros aparecem travados em confirmar. Todo participante lê.
create function public.list_runnable_automation_scopes(p_workspace_id uuid)
returns table (scope text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);
  return query
  select s.scope from private.automation_scopes(p_workspace_id) s
  where private.automation_scope_runs(p_workspace_id, s.scope)
  order by s.ordem;
end;
$$;

revoke all on function public.list_runnable_automation_scopes(uuid) from public, anon;
grant execute on function public.list_runnable_automation_scopes(uuid) to authenticated;

-- O Administrador liga ou desliga o automático e aprova o teto. Automático sem teto é recusado, e também o de um escopo
-- que ninguém executa. Subir o teto acima do gasto do mês tira a pausa. (Redefinida de 20260930170000.)
create or replace function public.save_automation_setting(p_workspace_id uuid, p_scope text, p_mode text, p_monthly_cap numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_spent numeric;
begin
  if private.require_active_membership(p_workspace_id) <> 'admin' then
    raise exception 'only administrators can change automation' using errcode = '42501';
  end if;
  if not exists (select 1 from private.automation_scopes(p_workspace_id) s where s.scope = p_scope) then
    raise exception 'unknown automation scope' using errcode = '22023';
  end if;
  if p_mode not in ('confirmar', 'automatico') then
    raise exception 'invalid automation mode' using errcode = '22023';
  end if;
  if p_mode = 'automatico' and not private.automation_scope_runs(p_workspace_id, p_scope) then
    raise exception 'automatic mode is not available for this scope yet' using errcode = '22023';
  end if;
  if p_monthly_cap is not null and p_monthly_cap <= 0 then
    raise exception 'invalid monthly cap' using errcode = '22023';
  end if;
  if p_mode = 'automatico' and p_monthly_cap is null then
    raise exception 'automatic mode requires an approved monthly cap' using errcode = '22023';
  end if;
  select g.spent into v_spent from private.automation_spend g
  where g.workspace_id = p_workspace_id and g.scope = p_scope and g.month = date_trunc('month', now())::date;
  insert into private.automation_settings (workspace_id, scope, mode, monthly_cap, updated_by)
  values (p_workspace_id, p_scope, p_mode, p_monthly_cap, auth.uid())
  on conflict (workspace_id, scope) do update set
    mode = excluded.mode,
    monthly_cap = excluded.monthly_cap,
    paused_at = case when excluded.monthly_cap > coalesce(v_spent, 0) then null else private.automation_settings.paused_at end,
    updated_by = excluded.updated_by,
    updated_at = now();
end;
$$;

-- Para o reply-proposal-runner, antes de reservar o crédito da geração: 'ok' (pode gerar) ou o motivo de a proposta não
-- sair sozinha (confirmar, sem_teto, teto_atingido). Na primeira geração, soma a rodada aos dois tetos, uma vez por
-- trabalho; gerar de novo é o clique do titular e só devolve 'ok'.
create function public.consume_reply_proposal_cap(p_job_id uuid, p_claim_token uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.reply_proposal_jobs;
  v_proposal private.reply_proposals;
  v_scopes text[];
  v_scope text;
  v_amount numeric;
  v_reason text;
begin
  perform private.running_reply_job(p_job_id, p_claim_token);
  select j.* into v_job from private.reply_proposal_jobs j where j.id = p_job_id for update;
  select p.* into v_proposal from private.reply_proposals p where p.id = v_job.proposal_id;
  -- O titular pediu esta geração, ou a rodada já foi somada (a função caiu antes de terminar).
  if v_proposal.generations > 1 or v_job.automatic_spend is not null then
    return 'ok';
  end if;

  -- Primeiro sem gastar nada: o teto que recusaria a rodada. Uma recusa sem efeito (confirmar, sem teto, pausado) vem
  -- antes da falta de espaço, para nenhum teto pausar e avisar por uma rodada que o outro já barra.
  v_scopes := private.reply_proposal_cap_scopes(v_proposal.author_agent_id);
  v_amount := private.reply_proposal_round_credits(v_proposal.workspace_id);
  select s.scope, r.reason into v_scope, v_reason
  from unnest(v_scopes) with ordinality as s (scope, ordem)
  cross join lateral (select private.automation_scope_refusal(v_proposal.workspace_id, s.scope, v_amount) as reason) r
  where r.reason is not null
  order by r.reason = 'sem_espaco', s.ordem
  limit 1;
  if v_reason = 'sem_espaco' then
    -- Só o teto sem espaço é consultado: ele pausa e avisa os Administradores uma vez, e a rodada não soma no outro.
    v_reason := public.consume_automation_cap(v_proposal.workspace_id, v_scope, v_amount);
    if v_reason = 'ok' then
      -- Abriu espaço entre a leitura e a consulta: devolve e deixa a próxima rodada tentar.
      perform private.refund_automation_cap(v_proposal.workspace_id, v_scope, v_amount);
      v_reason := 'teto_atingido';
    end if;
  end if;
  if v_reason is not null then
    return v_reason;
  end if;

  for i in 1 .. array_length(v_scopes, 1) loop
    v_reason := public.consume_automation_cap(v_proposal.workspace_id, v_scopes[i], v_amount);
    if v_reason <> 'ok' then
      -- Outra rodada ocupou o espaço entre a leitura e a soma: o que esta já somou nos anteriores volta.
      for j in 1 .. i - 1 loop
        perform private.refund_automation_cap(v_proposal.workspace_id, v_scopes[j], v_amount);
      end loop;
      return v_reason;
    end if;
  end loop;
  update private.reply_proposal_jobs set automatic_spend = v_amount, updated_at = now() where id = v_job.id;
  return 'ok';
end;
$$;

-- Para o reply-proposal-runner, quando a geração automática falha: devolve aos dois tetos o que ela somou. Repetir, ou
-- chamar numa geração que o titular pediu, não faz nada.
create function public.refund_reply_proposal_cap(p_job_id uuid, p_claim_token uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.reply_proposal_jobs;
  v_proposal private.reply_proposals;
  v_scope text;
begin
  perform private.running_reply_job(p_job_id, p_claim_token);
  select j.* into v_job from private.reply_proposal_jobs j where j.id = p_job_id for update;
  if v_job.automatic_spend is null then
    return;
  end if;
  select p.* into v_proposal from private.reply_proposals p where p.id = v_job.proposal_id;
  if v_proposal.generations > 1 then
    return;
  end if;
  foreach v_scope in array private.reply_proposal_cap_scopes(v_proposal.author_agent_id) loop
    perform private.refund_automation_cap(v_proposal.workspace_id, v_scope, v_job.automatic_spend);
  end loop;
  update private.reply_proposal_jobs set automatic_spend = null, updated_at = now() where id = v_job.id;
end;
$$;

revoke all on function public.consume_reply_proposal_cap(uuid, uuid) from public, anon, authenticated;
revoke all on function public.refund_reply_proposal_cap(uuid, uuid) from public, anon, authenticated;
grant execute on function public.consume_reply_proposal_cap(uuid, uuid) to service_role;
grant execute on function public.refund_reply_proposal_cap(uuid, uuid) to service_role;

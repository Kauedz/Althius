-- Análise de resposta pela IA (sequencias-multicontato, ticket 05; ADR-0031). Depois que uma resposta já está
-- correlacionada e a Conta já está retida (ticket 03/04), a IA lê só aquela resposta e o contexto mínimo autorizado
-- (a Conta-alvo, o Contato e a última mensagem enviada pelo vendedor na mesma conversa) e grava uma interpretação, um
-- trecho de evidência, uma classificação (humana, automática ou possível pedido de não contato) e uma recomendação
-- (pausar ou continuar). Ela NUNCA decide: a decisão de pausar/continuar continua só em decide_sequence_retention
-- (20261112120000), sem nenhuma dependência desta análise. Falha, teto ou créditos indisponíveis deixam a análise
-- "falhou", sem tocar na resposta, na retenção nem na decisão — o titular decide manualmente do mesmo jeito.
--
-- O trabalho nasce de um gatilho em private.sequence_correlated_replies (não do e-mail ou do chat diretamente): essa
-- tabela já deduplica o evento do provedor (unique por sequence_id + provider_event_id), então um evento duplicado nunca
-- gera uma segunda análise nem uma segunda cobrança. O texto recebido entra só como dado de uma mensagem; esta função
-- NUNCA passa `tools` ao modelo (reply-analysis-runner), então nenhuma instrução escrita nele chega a executar algo.

create table private.reply_analyses (
  id uuid primary key default gen_random_uuid(),
  -- Uma análise por resposta correlacionada: a resposta é imutável, então um resultado atrasado nunca se mistura com
  -- uma resposta diferente nem com uma decisão já tomada sobre outro conjunto.
  correlated_reply_id uuid not null unique references private.sequence_correlated_replies(id) on delete cascade,
  sequence_id uuid not null references public.sequences(id) on delete cascade,
  workspace_id uuid not null,
  -- O titular: o Vendedor responsável pela Sequência no momento em que a resposta chegou. Só ele lê.
  owner_user_id uuid not null references auth.users(id),
  -- O Rhetor do Workspace (o mesmo que redige as Propostas de resposta), a quem a análise é atribuída para o teto.
  author_agent_id uuid,
  status text not null default 'gerando' check (status in ('gerando', 'pronta', 'falhou')),
  classification text check (classification in ('humana', 'automatica', 'possivel_nao_contato', 'indeterminada')),
  interpretation text check (interpretation is null or length(interpretation) <= 800),
  evidence text check (evidence is null or length(evidence) <= 500),
  recommendation text check (recommendation in ('pausar', 'continuar', 'indeterminado')),
  model text,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, author_agent_id) references private.agents(workspace_id, id) on delete set null (author_agent_id),
  check (status <> 'pronta' or (classification is not null and recommendation is not null))
);

-- O trabalho de gerar a análise: um por resposta correlacionada (a chave da idempotência). Mesmo desenho de
-- private.reply_proposal_jobs (20261001180000): reserva exclusiva (claim_token), tentativas limitadas, motivo gravado.
create table private.reply_analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null unique references private.reply_analyses(id) on delete cascade,
  workspace_id uuid not null,
  correlated_reply_id uuid not null unique references private.sequence_correlated_replies(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  run_after timestamptz not null default now(),
  claimed_until timestamptz,
  claim_token uuid,
  -- O que a consulta ao Teto somou (private.consume_reply_analysis_cap); nulo quando nada foi somado ou a falha já devolveu.
  automatic_spend numeric(12, 2) check (automatic_spend >= 0),
  last_error text,
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

create index reply_analysis_jobs_due_idx on private.reply_analysis_jobs (run_after) where status in ('queued', 'running');

alter table private.reply_analyses enable row level security;
alter table private.reply_analysis_jobs enable row level security;
revoke all on private.reply_analyses from public, anon, authenticated, service_role;
revoke all on private.reply_analysis_jobs from public, anon, authenticated, service_role;

comment on table private.reply_analyses is
  'Interpretação, evidência, classificação e recomendação da IA sobre uma resposta correlacionada já registrada. Só o '
  'titular lê, via RPC. Nunca decide nem altera a retenção: public.decide_sequence_retention não depende dela.';
comment on table private.reply_analysis_jobs is
  'O trabalho idempotente de analisar uma resposta: um por resposta correlacionada, reservado por claim_reply_analysis_jobs.';

create function private.reply_analysis_max_attempts()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 3;
$$;

revoke all on function private.reply_analysis_max_attempts() from public, anon, authenticated, service_role;

-- -------------------------------------------------------------------------------------------------------------
-- Enfileirar. Nasce de uma resposta já correlacionada (não do e-mail/chat cru): essa tabela já é o ponto único e
-- deduplicado de "houve uma resposta nova", para retenção (20261112120000) e para análise.
-- -------------------------------------------------------------------------------------------------------------

create function private.enqueue_reply_analysis(p_correlated_reply_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reply private.sequence_correlated_replies;
  v_sequence public.sequences;
  v_agent uuid;
  v_analysis_id uuid;
begin
  select r.* into v_reply from private.sequence_correlated_replies r where r.id = p_correlated_reply_id;
  if not found then
    return null;
  end if;

  select s.* into v_sequence from public.sequences s where s.id = v_reply.sequence_id;
  -- Sem Sequência, encerrada, ou sem Vendedor responsável ativo, não há a quem recomendar nem por quê.
  if not found or v_sequence.status = 'encerrada'
    or not exists (
      select 1 from public.workspace_memberships m
      where m.workspace_id = v_reply.workspace_id and m.user_id = v_sequence.owner_user_id and m.active)
    or not exists (
      select 1 from public.sales_responsibilities sr
      where sr.workspace_id = v_reply.workspace_id and sr.target_account_id = v_sequence.target_account_id
        and sr.owner_user_id = v_sequence.owner_user_id) then
    return null;
  end if;

  select a.id into v_agent from private.agents a
  where a.workspace_id = v_reply.workspace_id and a.specialty = 'rhetor' and a.kind = 'padrao';

  insert into private.reply_analyses (correlated_reply_id, sequence_id, workspace_id, owner_user_id, author_agent_id)
  values (p_correlated_reply_id, v_reply.sequence_id, v_reply.workspace_id, v_sequence.owner_user_id, v_agent)
  on conflict (correlated_reply_id) do nothing
  returning id into v_analysis_id;
  if v_analysis_id is null then
    return null;
  end if;

  insert into private.reply_analysis_jobs (analysis_id, workspace_id, correlated_reply_id)
  values (v_analysis_id, v_reply.workspace_id, p_correlated_reply_id)
  on conflict (correlated_reply_id) do nothing;
  return v_analysis_id;
end;
$$;

revoke all on function private.enqueue_reply_analysis(uuid) from public, anon, authenticated, service_role;

-- Nunca falha o registro da resposta: um erro aqui vira aviso no log, e a resposta e a retenção ficam como estão.
create function private.enqueue_reply_analysis_on_correlated_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform private.enqueue_reply_analysis(new.id);
  exception when others then
    raise warning 'reply analysis was not queued: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function private.enqueue_reply_analysis_on_correlated_reply() from public, anon, authenticated, service_role;

create trigger sequence_correlated_replies_enqueue_analysis
  after insert on private.sequence_correlated_replies
  for each row execute function private.enqueue_reply_analysis_on_correlated_reply();

-- -------------------------------------------------------------------------------------------------------------
-- A IA: o trabalho de analisar. Só o servidor (service_role), pela Edge Function reply-analysis-runner, que não recebe
-- ferramenta nem credencial de envio e nunca chama o modelo com `tools`: ela só classifica e escreve texto.
-- -------------------------------------------------------------------------------------------------------------

create function public.claim_reply_analysis_jobs(p_limit integer default 5)
returns table (job_id uuid, analysis_id uuid, claim_token uuid, attempt integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_row record;
  v_job private.reply_analysis_jobs;
  v_analysis private.reply_analyses;
  v_token uuid;
begin
  for v_row in
    select j.id as job_id, j.analysis_id
    from private.reply_analysis_jobs j
    join private.reply_analyses a on a.id = j.analysis_id
    where (j.status = 'queued' and j.run_after <= now())
       or (j.status = 'running' and j.claimed_until < now())
    order by j.run_after, j.id
    limit greatest(coalesce(p_limit, 5), 1)
    for update of a skip locked
  loop
    select a.* into v_analysis from private.reply_analyses a where a.id = v_row.analysis_id;
    select j.* into v_job from private.reply_analysis_jobs j where j.id = v_row.job_id for update;
    if not ((v_job.status = 'queued' and v_job.run_after <= now())
      or (v_job.status = 'running' and v_job.claimed_until < now())) then
      continue;
    end if;

    if v_analysis.status <> 'gerando' then
      update private.reply_analysis_jobs set
        status = 'cancelled', claimed_until = null, claim_token = null, finished_at = now(), updated_at = now()
      where id = v_job.id;
      continue;
    end if;
    if not exists (
      select 1 from public.workspace_memberships m
      where m.workspace_id = v_analysis.workspace_id and m.user_id = v_analysis.owner_user_id and m.active
    ) then
      update private.reply_analysis_jobs set
        status = 'failed', last_error = 'owner_not_responsible', last_error_at = now(), claimed_until = null,
        claim_token = null, finished_at = now(), updated_at = now()
      where id = v_job.id;
      update private.reply_analyses set status = 'falhou', failure_code = 'owner_not_responsible', updated_at = now()
      where id = v_analysis.id;
      continue;
    end if;
    if v_job.attempts >= private.reply_analysis_max_attempts() then
      update private.reply_analysis_jobs set
        status = 'failed', last_error = coalesce(last_error, 'attempts_exhausted'), last_error_at = now(),
        claimed_until = null, claim_token = null, finished_at = now(), updated_at = now()
      where id = v_job.id;
      update private.reply_analyses set status = 'falhou', failure_code = 'attempts_exhausted', updated_at = now()
      where id = v_analysis.id;
      continue;
    end if;

    v_token := gen_random_uuid();
    update private.reply_analysis_jobs set
      status = 'running', attempts = attempts + 1, claim_token = v_token,
      claimed_until = now() + interval '5 minutes', updated_at = now()
    where id = v_job.id;
    return query select v_job.id, v_analysis.id, v_token, v_job.attempts + 1;
  end loop;
end;
$$;

-- O trabalho em andamento, de quem tem o token; senão o resultado dele não vale.
create function private.running_reply_analysis_job(p_job_id uuid, p_claim_token uuid)
returns private.reply_analysis_jobs
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_job private.reply_analysis_jobs;
begin
  select j.* into v_job from private.reply_analysis_jobs j
  where j.id = p_job_id and j.status = 'running' and j.claim_token is not null and j.claim_token = p_claim_token;
  if not found then
    raise exception 'the reply analysis job is not running for this claim' using errcode = '55000';
  end if;
  return v_job;
end;
$$;

revoke all on function private.running_reply_analysis_job(uuid, uuid) from public, anon, authenticated, service_role;

-- O contexto MÍNIMO e autorizado: a Conta-alvo, o Contato (se houver), a resposta correlacionada em si e, só para
-- situar, a última mensagem que o vendedor enviou a esse Contato nesta Sequência antes da resposta. Nada de outros
-- Contatos, de outras Contas, de Playbook ou de dados de contato (e-mail/telefone): a IA só classifica e interpreta,
-- não escreve uma resposta a enviar (isso é reply_proposal_context, inalterado).
create function public.reply_analysis_context(p_job_id uuid, p_claim_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_job private.reply_analysis_jobs;
  v_analysis private.reply_analyses;
  v_reply private.sequence_correlated_replies;
  v_target_account_id text;
  v_account public.target_accounts;
  v_contact public.contacts;
  v_workspace text;
  v_channel text;
  v_subject text;
  v_text text;
  v_from_name text;
  v_received_at timestamptz;
  v_previous jsonb;
begin
  v_job := private.running_reply_analysis_job(p_job_id, p_claim_token);
  select a.* into v_analysis from private.reply_analyses a where a.id = v_job.analysis_id;
  select r.* into v_reply from private.sequence_correlated_replies r where r.id = v_analysis.correlated_reply_id;
  select s.target_account_id into v_target_account_id from public.sequences s where s.id = v_analysis.sequence_id;

  select acc.* into v_account from public.target_accounts acc
  where acc.workspace_id = v_analysis.workspace_id and acc.id::text = v_target_account_id;
  select c.* into v_contact from public.contacts c
  where c.workspace_id = v_analysis.workspace_id and c.id = v_reply.contact_id;
  select w.name into v_workspace from public.workspaces w where w.id = v_analysis.workspace_id;

  if v_reply.source_kind = 'email' then
    select 'email', e.subject, left(coalesce(e.body, e.snippet, ''), 4000), e.from_name, e.received_at
      into v_channel, v_subject, v_text, v_from_name, v_received_at
    from private.received_emails e where e.interaction_id = v_reply.source_id;
  else
    select c.channel, null, left(coalesce(c.body, ''), 4000), c.from_name, c.received_at
      into v_channel, v_subject, v_text, v_from_name, v_received_at
    from private.received_chat_messages c where c.interaction_id = v_reply.source_id;
  end if;

  select jsonb_build_object('subject', p.subject, 'text', left(coalesce(p.body, ''), 2000)) into v_previous
  from private.sequence_step_sends p
  where p.sequence_id = v_analysis.sequence_id and p.contact_id is not distinct from v_reply.contact_id
    and p.status = 'sent' and p.sent_at is not null and p.sent_at <= coalesce(v_received_at, now()) and p.body is not null
  order by p.sent_at desc
  limit 1;

  return jsonb_build_object(
    'workspace', v_workspace,
    'channel', v_channel,
    'account', jsonb_build_object('name', v_account.name, 'domain', v_account.domain, 'segment', v_account.segment),
    'contact', case when v_contact.id is null then null
      else jsonb_build_object('name', v_contact.name, 'role', v_contact.role) end,
    'from_name', v_from_name,
    'received_at', v_received_at,
    'subject', v_subject,
    'text', coalesce(v_text, ''),
    'previous_sent', v_previous
  );
end;
$$;

-- Os tetos e os créditos da análise são os mesmos das Propostas de resposta (20261009010000): Execuções de Agentes e o
-- Rhetor, 1 crédito por rodada (20% com a chave de IA do cliente). Reaproveita as funções de lá: não é um teto novo.
create function public.consume_reply_analysis_cap(p_job_id uuid, p_claim_token uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.reply_analysis_jobs;
  v_analysis private.reply_analyses;
  v_scopes text[];
  v_scope text;
  v_amount numeric;
  v_reason text;
begin
  perform private.running_reply_analysis_job(p_job_id, p_claim_token);
  select j.* into v_job from private.reply_analysis_jobs j where j.id = p_job_id for update;
  select a.* into v_analysis from private.reply_analyses a where a.id = v_job.analysis_id;
  -- A rodada já foi somada (a função caiu antes de terminar): não soma de novo.
  if v_job.automatic_spend is not null then
    return 'ok';
  end if;

  v_scopes := private.reply_proposal_cap_scopes(v_analysis.author_agent_id);
  v_amount := private.reply_proposal_round_credits(v_analysis.workspace_id);
  select s.scope, r.reason into v_scope, v_reason
  from unnest(v_scopes) with ordinality as s (scope, ordem)
  cross join lateral (select private.automation_scope_refusal(v_analysis.workspace_id, s.scope, v_amount) as reason) r
  where r.reason is not null
  order by r.reason = 'sem_espaco', s.ordem
  limit 1;
  if v_reason = 'sem_espaco' then
    v_reason := public.consume_automation_cap(v_analysis.workspace_id, v_scope, v_amount);
    if v_reason = 'ok' then
      perform private.refund_automation_cap(v_analysis.workspace_id, v_scope, v_amount);
      v_reason := 'teto_atingido';
    end if;
  end if;
  if v_reason is not null then
    return v_reason;
  end if;

  for i in 1 .. array_length(v_scopes, 1) loop
    v_reason := public.consume_automation_cap(v_analysis.workspace_id, v_scopes[i], v_amount);
    if v_reason <> 'ok' then
      for j in 1 .. i - 1 loop
        perform private.refund_automation_cap(v_analysis.workspace_id, v_scopes[j], v_amount);
      end loop;
      return v_reason;
    end if;
  end loop;
  update private.reply_analysis_jobs set automatic_spend = v_amount, updated_at = now() where id = v_job.id;
  return 'ok';
end;
$$;

-- Quando a análise automática falha: devolve aos tetos o que ela somou.
create function public.refund_reply_analysis_cap(p_job_id uuid, p_claim_token uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.reply_analysis_jobs;
  v_analysis private.reply_analyses;
  v_scope text;
begin
  perform private.running_reply_analysis_job(p_job_id, p_claim_token);
  select j.* into v_job from private.reply_analysis_jobs j where j.id = p_job_id for update;
  if v_job.automatic_spend is null then
    return;
  end if;
  select a.* into v_analysis from private.reply_analyses a where a.id = v_job.analysis_id;
  foreach v_scope in array private.reply_proposal_cap_scopes(v_analysis.author_agent_id) loop
    perform private.refund_automation_cap(v_analysis.workspace_id, v_scope, v_job.automatic_spend);
  end loop;
  update private.reply_analysis_jobs set automatic_spend = null, updated_at = now() where id = v_job.id;
end;
$$;

-- Abre a rodada de crédito, como begin_reply_proposal_round: free, go, paid ou no_credits. O cliente nunca vê este
-- valor em dólar, só o crédito debitado (end_agent_round), como qualquer outra rodada de Agente.
create function public.begin_reply_analysis_round(p_job_id uuid, p_claim_token uuid)
returns table (outcome text, reservation_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.reply_analysis_jobs;
  v_analysis private.reply_analyses;
  v_key text;
  v_existing private.credit_reservations%rowtype;
  v_user uuid;
  v_id uuid;
  v_own boolean;
begin
  v_job := private.running_reply_analysis_job(p_job_id, p_claim_token);
  select a.* into v_analysis from private.reply_analyses a where a.id = v_job.analysis_id;
  if not private.credits_enforced(v_analysis.workspace_id) then
    return query select 'free'::text, null::uuid;
    return;
  end if;

  v_key := 'reply-analysis:' || v_job.id::text || ':' || v_job.attempts::text;
  perform pg_advisory_xact_lock(hashtext('agent-round:' || v_key));
  select * into v_existing from private.credit_reservations r
  where r.workspace_id = v_analysis.workspace_id and r.action_key = v_key;
  if found then
    if v_existing.status = 'reserved' then
      return query select 'go'::text, v_existing.id;
      return;
    elsif v_existing.status = 'settled' then
      return query select 'paid'::text, v_existing.id;
      return;
    end if;
    delete from private.credit_reservations where id = v_existing.id;
  end if;

  v_user := case when exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = v_analysis.workspace_id and m.user_id = v_analysis.owner_user_id and m.active
  ) then v_analysis.owner_user_id end;
  v_own := exists (select 1 from private.workspace_ai_keys k where k.workspace_id = v_analysis.workspace_id);
  begin
    v_id := public.reserve_credits(v_analysis.workspace_id, v_user, 'agent_round', v_key, 1, v_own);
  exception when others then
    if sqlerrm in ('insufficient credits', 'monthly credit limit reached') then
      return query select 'no_credits'::text, null::uuid;
      return;
    end if;
    raise;
  end;
  return query select 'go'::text, v_id;
end;
$$;

-- A chave de IA do cliente do Workspace da análise, como reply_proposal_ai_key. Só o servidor.
create function public.reply_analysis_ai_key(p_job_id uuid, p_claim_token uuid)
returns table (provider text, model text, api_key text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.reply_analysis_jobs;
  v_config private.workspace_ai_keys%rowtype;
  v_secret text;
begin
  v_job := private.running_reply_analysis_job(p_job_id, p_claim_token);
  select * into v_config from private.workspace_ai_keys k where k.workspace_id = v_job.workspace_id;
  if not found then
    return;
  end if;
  select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = v_config.secret_name;
  if v_secret is null or btrim(v_secret) = '' then
    raise exception 'workspace ai key unavailable' using errcode = '55000';
  end if;
  return query select v_config.provider, v_config.model, btrim(v_secret);
end;
$$;

-- Grava o resultado: a análise "gerando" fica pronta. Uma que já falhou (o limite de tentativas esgotou antes de a
-- chamada responder) não muda: o titular já está decidindo sem ela.
create function public.save_reply_analysis(
  p_job_id uuid,
  p_claim_token uuid,
  p_classification text,
  p_interpretation text,
  p_evidence text,
  p_recommendation text,
  p_model text default null
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.reply_analysis_jobs;
  v_analysis private.reply_analyses;
  v_analysis_id uuid;
  v_interpretation text := btrim(coalesce(p_interpretation, ''));
  v_evidence text := btrim(coalesce(p_evidence, ''));
begin
  select j.analysis_id into v_analysis_id from private.reply_analysis_jobs j where j.id = p_job_id;
  select a.* into v_analysis from private.reply_analyses a where a.id = v_analysis_id for update;
  v_job := private.running_reply_analysis_job(p_job_id, p_claim_token);

  if p_classification not in ('humana', 'automatica', 'possivel_nao_contato', 'indeterminada') then
    raise exception 'unknown reply classification' using errcode = '22023';
  end if;
  if p_recommendation not in ('pausar', 'continuar', 'indeterminado') then
    raise exception 'unknown reply recommendation' using errcode = '22023';
  end if;
  if v_interpretation = '' or length(v_interpretation) > 800 then
    raise exception 'the interpretation must have between 1 and 800 characters' using errcode = '22023';
  end if;
  if length(v_evidence) > 500 then
    raise exception 'the evidence excerpt is too long' using errcode = '22023';
  end if;

  if v_analysis.status = 'gerando' then
    update private.reply_analyses set
      status = 'pronta', classification = p_classification, interpretation = v_interpretation,
      evidence = nullif(v_evidence, ''), recommendation = p_recommendation,
      model = nullif(btrim(coalesce(p_model, '')), ''), failure_code = null, updated_at = now()
    where id = v_analysis.id
    returning status into v_analysis.status;
  end if;
  update private.reply_analysis_jobs set
    status = 'done', claimed_until = null, claim_token = null, last_error = null, finished_at = now(), updated_at = now()
  where id = v_job.id;
  return v_analysis.status;
end;
$$;

-- A IA não respondeu ou respondeu algo inválido (model_invalid_output não é passageiro: o titular já pode decidir sem
-- ela). Um motivo passageiro devolve o trabalho à fila; senão, ou esgotado o limite, a análise fica "falhou".
create function public.fail_reply_analysis_job(
  p_job_id uuid, p_claim_token uuid, p_error_code text, p_retryable boolean default false
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.reply_analysis_jobs;
  v_analysis private.reply_analyses;
  v_analysis_id uuid;
  v_code text := left(coalesce(nullif(btrim(p_error_code), ''), 'unknown'), 100);
begin
  select j.analysis_id into v_analysis_id from private.reply_analysis_jobs j where j.id = p_job_id;
  select a.* into v_analysis from private.reply_analyses a where a.id = v_analysis_id for update;
  v_job := private.running_reply_analysis_job(p_job_id, p_claim_token);

  if p_retryable and v_job.attempts < private.reply_analysis_max_attempts() and v_analysis.status = 'gerando' then
    update private.reply_analysis_jobs set
      status = 'queued', claimed_until = null, claim_token = null, last_error = v_code, last_error_at = now(),
      run_after = now() + (v_job.attempts * interval '2 minutes'), updated_at = now()
    where id = v_job.id;
    return 'retry';
  end if;

  update private.reply_analysis_jobs set
    status = 'failed', claimed_until = null, claim_token = null, last_error = v_code, last_error_at = now(),
    finished_at = now(), updated_at = now()
  where id = v_job.id;
  if v_analysis.status = 'gerando' then
    update private.reply_analyses set status = 'falhou', failure_code = v_code, updated_at = now()
    where id = v_analysis.id;
  end if;
  return 'failed';
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- O Executor das análises: a cada minuto o pg_cron chama a Edge Function reply-analysis-runner pelo pg_net, só quando há
-- trabalho devido, com um token próprio guardado no banco. Mesmo desenho de 20261001180000 (reply-proposal-runner).

create table private.reply_analysis_runner_settings (
  singleton boolean primary key default true check (singleton),
  function_url text,
  token text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  updated_at timestamptz not null default now()
);

insert into private.reply_analysis_runner_settings default values;

alter table private.reply_analysis_runner_settings enable row level security;
revoke all on private.reply_analysis_runner_settings from public, anon, authenticated, service_role;

comment on table private.reply_analysis_runner_settings is
  'Where the database calls the reply-analysis-runner Edge Function and the token that proves the call came from it.';

create function public.reply_analysis_runner_token_matches(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.reply_analysis_runner_settings s
    where length(coalesce(p_token, '')) >= 32 and s.token = p_token);
$$;

create function private.configure_reply_analysis_runner(p_project_url text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
begin
  if coalesce(p_project_url, '') !~ '^https://[A-Za-z0-9.-]+(:[0-9]{2,5})?/?$' then
    raise exception 'project url must look like https://<ref>.supabase.co' using errcode = '22023';
  end if;
  v_url := regexp_replace(p_project_url, '/$', '') || '/functions/v1/reply-analysis-runner';
  update private.reply_analysis_runner_settings set function_url = v_url, updated_at = now();
  return v_url;
end;
$$;

-- A chamada HTTP em si, separada para os testes a trocarem dentro da transação (o CI não fala com a função).
create function private.post_to_reply_analysis_runner(p_url text, p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform net.http_post(
    url := p_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-runner-token', p_token),
    timeout_milliseconds := 5000);
end;
$$;

-- O que o pg_cron roda a cada minuto. Chama a função só quando há trabalho devido; devolve se chamou.
create function private.kick_reply_analysis_runner()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings private.reply_analysis_runner_settings;
  v_url text;
begin
  select s.* into v_settings from private.reply_analysis_runner_settings s;
  v_url := coalesce(v_settings.function_url, (
    select replace(q.function_url, '/functions/v1/sequence-runner', '/functions/v1/reply-analysis-runner')
    from private.sequence_runner_settings q
    where q.function_url like '%/functions/v1/sequence-runner'));
  if v_url is null then
    return false;
  end if;
  if not exists (
    select 1 from private.reply_analysis_jobs j
    where (j.status = 'queued' and j.run_after <= now())
       or (j.status = 'running' and j.claimed_until < now())) then
    return false;
  end if;
  perform private.post_to_reply_analysis_runner(v_url, v_settings.token);
  return true;
end;
$$;

revoke all on function private.configure_reply_analysis_runner(text) from public, anon, authenticated, service_role;
revoke all on function private.post_to_reply_analysis_runner(text, text) from public, anon, authenticated, service_role;
revoke all on function private.kick_reply_analysis_runner() from public, anon, authenticated, service_role;

do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
    and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('althius-reply-analysis-runner', '* * * * *', 'select private.kick_reply_analysis_runner()');
  end if;
end
$cron$;

-- ---------------------------------------------------------------------------------------------------------------------
-- A tela: a análise entra dentro da resposta pendente, só para o titular (can_read_content), como o resto da revisão.
-- Quem não é o titular continua sem ver nada do conteúdo, inclusive a análise. O ticket 04 (20261204120000) já renomeou
-- a função original para list_sequence_reply_review_core e criou public.list_sequence_reply_review como um invólucro
-- que acrescenta "paused_contacts"; redefinimos aqui só o _core (mesmo contrato de 20261112120000, mais a chave
-- "analysis" em cada pendente), e o invólucro do ticket 04 continua valendo sem mudança.

create or replace function public.list_sequence_reply_review_core(p_sequence_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_sequence public.sequences;
  v_hold private.sequence_reply_holds;
  v_owner boolean;
  v_hold_found boolean := false;
  v_pending jsonb := '[]'::jsonb;
  v_decisions jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select s.* into v_sequence from public.sequences s where s.id = p_sequence_id;
  if not found or not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = v_sequence.workspace_id and m.user_id = v_user_id and m.active
  ) then
    raise exception 'sequence not found or not owned by active user' using errcode = '42501';
  end if;

  v_owner := private.reply_hold_owner(p_sequence_id);
  select h.* into v_hold from private.sequence_reply_holds h where h.sequence_id = p_sequence_id;
  v_hold_found := found;

  if v_owner then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', d.id,
      'decision', d.decision,
      'version', d.reviewed_version,
      'reviewed_reply_ids', to_jsonb(d.reviewed_reply_ids),
      'outcome', d.outcome,
      'created_at', d.created_at
    ) order by d.created_at desc), '[]'::jsonb)
    into v_decisions
    from private.sequence_retention_decisions d
    where d.sequence_id = p_sequence_id;
  end if;

  if v_hold_found and v_owner and v_hold.open then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id,
      'source_kind', r.source_kind,
      'contact_id', r.contact_id,
      'received_at', r.received_at,
      'channel', case when r.source_kind = 'email' then 'email' else c.channel end,
      'subject', e.subject,
      'snippet', coalesce(e.snippet, left(c.body, 180)),
      'from_name', coalesce(e.from_name, c.from_name),
      'from_email', e.from_email,
      'analysis', case when an.id is null then null else jsonb_build_object(
        'status', an.status,
        'classification', an.classification,
        'interpretation', an.interpretation,
        'evidence', an.evidence,
        'recommendation', an.recommendation,
        'failure_code', an.failure_code
      ) end
    ) order by r.created_at, r.id), '[]'::jsonb)
    into v_pending
    from private.sequence_correlated_replies r
    left join private.received_emails e
      on r.source_kind = 'email' and e.interaction_id = r.source_id
    left join private.received_chat_messages c
      on r.source_kind = 'chat' and c.interaction_id = r.source_id
    left join private.reply_analyses an on an.correlated_reply_id = r.id
    where r.sequence_id = p_sequence_id and r.created_at >= v_hold.opened_at;
  elsif v_hold_found and not v_owner and v_hold.open then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id,
      'received_at', r.received_at
    ) order by r.created_at, r.id), '[]'::jsonb)
    into v_pending
    from private.sequence_correlated_replies r
    where r.sequence_id = p_sequence_id and r.created_at >= v_hold.opened_at;
  end if;

  if not v_hold_found then
    return jsonb_build_object(
      'open', false,
      'state', 'none',
      'version', 0,
      'pending', '[]'::jsonb,
      'decisions', case when v_owner then v_decisions else '[]'::jsonb end,
      'can_read_content', v_owner,
      'can_decide', v_owner
    );
  end if;

  return jsonb_build_object(
    'open', v_hold.open,
    'state', case when v_hold.open then v_hold.state else 'none' end,
    'version', v_hold.version,
    'pending', v_pending,
    'decisions', case when v_owner then v_decisions else '[]'::jsonb end,
    'can_read_content', v_owner,
    'can_decide', v_owner
  );
end;
$$;

revoke all on function public.list_sequence_reply_review_core(uuid) from public, anon;
grant execute on function public.list_sequence_reply_review_core(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- Permissões. Só o servidor (service_role) chama as RPCs da análise; nada para authenticated/anon.

revoke all on function public.claim_reply_analysis_jobs(integer) from public, anon, authenticated;
revoke all on function public.reply_analysis_context(uuid, uuid) from public, anon, authenticated;
revoke all on function public.consume_reply_analysis_cap(uuid, uuid) from public, anon, authenticated;
revoke all on function public.refund_reply_analysis_cap(uuid, uuid) from public, anon, authenticated;
revoke all on function public.begin_reply_analysis_round(uuid, uuid) from public, anon, authenticated;
revoke all on function public.reply_analysis_ai_key(uuid, uuid) from public, anon, authenticated;
revoke all on function public.save_reply_analysis(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.fail_reply_analysis_job(uuid, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.reply_analysis_runner_token_matches(text) from public, anon, authenticated;
grant execute on function public.claim_reply_analysis_jobs(integer) to service_role;
grant execute on function public.reply_analysis_context(uuid, uuid) to service_role;
grant execute on function public.consume_reply_analysis_cap(uuid, uuid) to service_role;
grant execute on function public.refund_reply_analysis_cap(uuid, uuid) to service_role;
grant execute on function public.begin_reply_analysis_round(uuid, uuid) to service_role;
grant execute on function public.reply_analysis_ai_key(uuid, uuid) to service_role;
grant execute on function public.save_reply_analysis(uuid, uuid, text, text, text, text, text) to service_role;
grant execute on function public.fail_reply_analysis_job(uuid, uuid, text, boolean) to service_role;
grant execute on function public.reply_analysis_runner_token_matches(text) to service_role;

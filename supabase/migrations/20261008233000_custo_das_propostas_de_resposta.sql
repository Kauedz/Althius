-- O custo real das Propostas de resposta (creditos-e-planos, ticket 01). Cada chamada do Rhetor ao modelo grava o modelo
-- e os tokens que ele informou, como a Execução de Agente. Só quem tem a reserva do trabalho grava, e a chave do registro
-- é a mesma da rodada de crédito (o trabalho, a tentativa e a geração): repetir a mesma chamada não duplica, e gerar de
-- novo é outro custo. Nada do texto, do Contato ou do token da reserva vai para a tabela de custos.

alter table private.action_costs drop constraint action_costs_action_type_check;
alter table private.action_costs add constraint action_costs_action_type_check
  check (action_type in ('agent_run', 'apify_actor', 'reply_proposal'));

-- Registra o que uma chamada ao modelo gastou para gerar a proposta. Os tokens ficam nulos quando o motor não informa.
create function public.record_reply_proposal_cost(
  p_job_id uuid, p_claim_token uuid, p_model text, p_input_tokens bigint, p_output_tokens bigint
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.reply_proposal_jobs;
  v_generations integer;
  v_model text := left(coalesce(nullif(btrim(p_model), ''), 'desconhecido'), 200);
begin
  v_job := private.running_reply_job(p_job_id, p_claim_token);
  if p_input_tokens < 0 or p_output_tokens < 0 then
    raise exception 'invalid token count' using errcode = '22023';
  end if;
  select p.generations into v_generations from private.reply_proposals p where p.id = v_job.proposal_id;
  insert into private.action_costs
    (workspace_id, action_type, provider, model_or_actor, input_units, output_units, source_ref)
  values (v_job.workspace_id, 'reply_proposal', private.provider_of_model(v_model), v_model, p_input_tokens,
    p_output_tokens, 'reply-proposal:' || v_job.id::text || ':' || v_job.attempts::text || ':' || v_generations::text)
  on conflict (action_type, source_ref) do nothing;
end;
$$;

-- O relatório estima pelo preço do modelo também as Propostas de resposta, que gastam tokens como a Execução.
create or replace function public.get_cost_report(p_workspace_id uuid, p_month date default (now() at time zone 'utc')::date)
returns table (
  action_type text,
  provider text,
  model_or_actor text,
  actions bigint,
  input_units bigint,
  output_units bigint,
  recorded_cost_usd numeric,
  estimated_cost_usd numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := date_trunc('month', p_month::timestamp) at time zone 'utc';
begin
  if private.require_active_membership(p_workspace_id) <> 'admin' then
    raise exception 'only administrators can read costs' using errcode = '42501';
  end if;
  return query
    select c.action_type, c.provider, c.model_or_actor,
      count(*)::bigint,
      sum(c.input_units)::bigint,
      sum(c.output_units)::bigint,
      sum(c.cost_usd),
      -- Só quando há preço do modelo e tokens conhecidos: sem isso, em branco, nunca um valor inventado.
      case when max(p.model) is not null and bool_and(c.input_units is not null and c.output_units is not null)
        then sum(c.input_units * p.input_usd_per_million / 1000000.0 + c.output_units * p.output_usd_per_million / 1000000.0)
      end
    from private.action_costs c
    left join private.model_prices p
      on p.model = c.model_or_actor and c.action_type in ('agent_run', 'reply_proposal')
    where c.workspace_id = p_workspace_id
      and c.occurred_at >= v_start and c.occurred_at < v_start + interval '1 month'
    group by c.action_type, c.provider, c.model_or_actor
    order by c.action_type, c.provider, c.model_or_actor;
end;
$$;

revoke all on function public.record_reply_proposal_cost(uuid, uuid, text, bigint, bigint) from public, anon, authenticated;
grant execute on function public.record_reply_proposal_cost(uuid, uuid, text, bigint, bigint) to service_role;

-- Resultado de Sequências deduplicado por Conta-alvo (multicontato-09).
-- O período é todo o histórico; o corte fica no retorno para tornar explícito até quando desfechos foram observados.
create function public.sequence_account_outcome_summary(p_workspace_id uuid)
returns table (
  cutoff_at timestamptz,
  approached_accounts bigint,
  positive_accounts bigint,
  meeting_accounts bigint,
  negative_accounts bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cutoff timestamptz := statement_timestamp();
begin
  perform private.require_active_membership(p_workspace_id);
  return query
  with por_conta as (
    select q.target_account_id,
           bool_or(o.outcome in ('resposta_positiva', 'reuniao_marcada', 'oportunidade')) as positiva,
           bool_or(o.outcome in ('reuniao_marcada', 'oportunidade')) as reuniao,
           bool_or(o.outcome = 'resposta_negativa') as negativa
    from private.sequence_step_sends s
    join public.sequences q on q.id = s.sequence_id and q.workspace_id = p_workspace_id
    left join private.send_outcomes o
      on o.send_id = s.id and o.workspace_id = p_workspace_id and o.classified_at <= v_cutoff
    where s.workspace_id = p_workspace_id
      and s.status = 'sent'
      and s.sent_at <= v_cutoff
    group by q.target_account_id
  )
  select v_cutoff,
         count(*)::bigint,
         count(*) filter (where positiva)::bigint,
         count(*) filter (where reuniao)::bigint,
         count(*) filter (where negativa)::bigint
  from por_conta
  having count(*) > 0;
end;
$$;

revoke all on function public.sequence_account_outcome_summary(uuid) from public, anon;
grant execute on function public.sequence_account_outcome_summary(uuid) to authenticated;

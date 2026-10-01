-- As taxas do Resultado dos Envios por abordagem (motor-hermes, ticket 03). Decisão do Nan (2026-10-01): a abordagem
-- é o título do passo da Sequência. Para cada Envio que saiu, o título vem do documento da Sequência dele, pelo id do
-- passo; passo sem título, ou que já não está no documento, aparece como "Sem título". O título é o de agora: renomear
-- o passo junta o histórico dele sob o nome novo. Só números e o título; nenhum corpo ou assunto de mensagem.
-- Todo Participante ativo lê, como em public.send_outcome_rates.

create function public.send_outcome_rates_by_approach(p_workspace_id uuid)
returns table (
  approach text, channel text, sent bigint, replied bigint, positive bigint, meetings bigint, opportunities bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);
  return query
  select coalesce(nullif(btrim(passo.titulo), ''), 'Sem título'),
         s.channel,
         count(*)::bigint,
         count(o.send_id)::bigint,
         count(*) filter (where o.outcome in ('resposta_positiva', 'reuniao_marcada', 'oportunidade'))::bigint,
         count(*) filter (where o.outcome in ('reuniao_marcada', 'oportunidade'))::bigint,
         count(*) filter (where o.outcome = 'oportunidade')::bigint
  from private.sequence_step_sends s
  left join private.sequence_documents d on d.sequence_id = s.sequence_id
  left join lateral (
    select p ->> 'titulo' as titulo
    from jsonb_array_elements(case when jsonb_typeof(d.document -> 'steps') = 'array' then d.document -> 'steps' else '[]'::jsonb end) p
    where p ->> 'id' = s.step_id
    limit 1
  ) passo on true
  left join private.send_outcomes o on o.send_id = s.id
  where s.workspace_id = p_workspace_id and s.status = 'sent'
  group by 1, 2
  order by 1, 2;
end;
$$;

revoke all on function public.send_outcome_rates_by_approach(uuid) from public, anon;
grant execute on function public.send_outcome_rates_by_approach(uuid) to authenticated;

-- Sinal interno "Proposta recusada" (auditoria de Sinais de 13/10/2026).
--
-- O catálogo mostrava o card, mas o banco só avaliava `sem_resposta` e `negociacao_parada` (20261009050000). Faltava um
-- registro de recusa, e ele existe: o desfecho de um Envio de Sequência (`private.send_outcomes`, 20261001100000) vira
-- `resposta_negativa` quando a pessoa responsável pela Sequência, ou um Agente, diz que a Conta recusou. Nenhuma Interação
-- o grava, e é por isso que o Sinal nasce do desfecho e não de `account_interactions`.
--
--   proposta_recusada  a recusa mais recente da Conta (o Envio classificado como resposta negativa) foi registrada há pelo
--                      menos o prazo, e a Conta não voltou a conversar depois do registro (e-mail ou mensagem recebidos,
--                      ligação ou reunião). A chave é esse Envio: reclassificá-lo não cria outro Sinal, e uma recusa nova
--                      (outro Envio) é outro acontecimento. Envio nosso depois da recusa não a supera.
--
-- O Sinal dispara no dia em que o prazo venceu depois do registro (`classified_at` + prazo), como os outros internos, e
-- aponta, quando há, a Interação da resposta que o Envio recebeu (e-mail ou conversa). A frase e a evidência trazem só os
-- dias e o prazo: nada de nome, e-mail, canal, texto da resposta nem de quem classificou. É um Sinal da Conta que recusou,
-- uma Conta-alvo do Workspace, nunca do vendedor. Não gasta crédito e não chama fornecedor: roda no banco, pelo relógio
-- que já existe (`althius-internal-signals`).
--
-- Redefine `private.internal_signal_candidates` a partir da definição mais recente (20261009050000_sinais_internos_das_interacoes.sql;
-- nenhuma migration posterior a redefiniu). As duas regras que já existiam ficam exatamente como estavam. Nada é apagado.

insert into private.signal_catalog (signal_type, origin, state) values ('proposta_recusada', 'interno', 'available');

create or replace function private.internal_signal_candidates(p_workspace_id uuid, p_signal_type text, p_days integer, p_account_ids uuid[])
returns table (target_account_id uuid, interaction_id uuid, event_key text, phrase text, evidence text, fired_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with interacoes as (
    select i.id, i.target_account_id, i.kind, i.occurred_at,
      i.kind in ('email-recebido', 'mensagem-recebida', 'ligacao', 'reuniao') as conversa
    from public.account_interactions i
    where i.workspace_id = p_workspace_id and i.target_account_id = any(p_account_ids)
  ),
  ultima_conversa as (
    select x.target_account_id, max(x.occurred_at) as em from interacoes x where x.conversa group by x.target_account_id
  ),
  -- O primeiro envio depois da última conversa (ou o primeiro de todos, se nunca houve conversa).
  silencio as (
    select distinct on (x.target_account_id) x.target_account_id, x.id, x.kind, x.occurred_at
    from interacoes x
    left join ultima_conversa u on u.target_account_id = x.target_account_id
    where not x.conversa and (u.em is null or x.occurred_at > u.em)
    order by x.target_account_id, x.occurred_at, x.id
  ),
  -- A última Interação da Conta, quando ela foi uma conversa: depois dela, ninguém escreveu.
  parada as (
    select y.target_account_id, y.id, y.kind, y.occurred_at
    from (
      select distinct on (x.target_account_id) x.target_account_id, x.id, x.kind, x.occurred_at, x.conversa
      from interacoes x
      order by x.target_account_id, x.occurred_at desc, x.id desc
    ) y
    where y.conversa
  ),
  -- A recusa mais recente de cada Conta: o Envio enviado que alguém classificou como resposta negativa. A Sequência liga o
  -- Envio à Conta (uma por Conta). O dia da recusa é o do registro do desfecho.
  recusa as (
    select distinct on (t.id) t.id as target_account_id, o.send_id as id, o.classified_at as occurred_at
    from private.send_outcomes o
    join private.sequence_step_sends e on e.id = o.send_id and e.status = 'sent'
    join public.sequences q on q.id = e.sequence_id and q.workspace_id = p_workspace_id
    join public.target_accounts t on t.workspace_id = p_workspace_id and t.id::text = q.target_account_id and t.id = any(p_account_ids)
    where o.workspace_id = p_workspace_id and o.outcome = 'resposta_negativa'
    order by t.id, o.classified_at desc, o.send_id desc
  ),
  -- Só vale a recusa que ninguém superou: a Conta não voltou a conversar depois do registro.
  recusa_em_aberto as (
    select r.target_account_id, r.id, r.occurred_at
    from recusa r
    where not exists (
      select 1 from interacoes x where x.target_account_id = r.target_account_id and x.conversa and x.occurred_at > r.occurred_at)
  )
  select s.target_account_id, s.id, 'sem_resposta|' || s.id::text,
    'Sem resposta desde ' || private.signal_day(s.occurred_at),
    format('Primeiro envio sem resposta: %s em %s. Nenhuma resposta, ligação ou reunião registrada desde então '
      '(prazo do Monitoramento: %s dias).',
      case s.kind when 'email-enviado' then 'e-mail' else 'mensagem' end, private.signal_day(s.occurred_at), p_days),
    s.occurred_at + make_interval(days => p_days)
  from silencio s
  where p_signal_type = 'sem_resposta' and s.occurred_at <= now() - make_interval(days => p_days)
  union all
  select p.target_account_id, p.id, 'negociacao_parada|' || p.id::text,
    'Negociação parada desde ' || private.signal_day(p.occurred_at),
    format('Última Interação: %s em %s. Nenhuma Interação registrada desde então (prazo do Monitoramento: %s dias).',
      case p.kind
        when 'email-recebido' then 'e-mail recebido'
        when 'mensagem-recebida' then 'mensagem recebida'
        when 'ligacao' then 'ligação'
        else 'reunião'
      end,
      private.signal_day(p.occurred_at), p_days),
    p.occurred_at + make_interval(days => p_days)
  from parada p
  where p_signal_type = 'negociacao_parada' and p.occurred_at <= now() - make_interval(days => p_days)
  union all
  select a.target_account_id,
    -- A Interação da resposta que o Envio recebeu, quando há (e-mail ou conversa); a recusa registrada à mão não tem.
    (select i.id from public.account_interactions i
     where i.id in (
       select re.interaction_id from private.received_emails re where re.send_id = a.id
       union all
       select rc.interaction_id from private.received_chat_messages rc where rc.send_id = a.id)
     order by i.occurred_at desc, i.id desc
     limit 1),
    'proposta_recusada|' || a.id::text,
    'Proposta recusada desde ' || private.signal_day(a.occurred_at),
    format('Resposta negativa registrada em %s. A Conta não voltou a conversar desde então (prazo do Monitoramento: %s dias).',
      private.signal_day(a.occurred_at), p_days),
    a.occurred_at + make_interval(days => p_days)
  from recusa_em_aberto a
  where p_signal_type = 'proposta_recusada' and a.occurred_at <= now() - make_interval(days => p_days);
$$;

revoke all on function private.internal_signal_candidates(uuid, text, integer, uuid[]) from public, anon, authenticated, service_role;

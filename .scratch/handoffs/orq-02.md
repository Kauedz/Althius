# Handoff: orquestracao 02, Reserva de Créditos antes de executar

Branch `kaue/orq-02-reserva-creditos`, base `main` (8db6a58, com o 01 mesclado e ainda não publicado). Ticket: `.scratch/orquestracao/issues/02-reserva-de-creditos-antes-de-executar.md`, 11 de 11 critérios marcados. Nada foi aplicado no remoto nem publicado.

## O que foi feito

O `claim_agent_run` passa a reservar a estimativa da Execução antes de devolver qualquer coisa ao motor; a rodada de cada Agente consome essa reserva; `finish_agent_run` (e o `timeout`) acerta. O contrato é o da consulta de CNPJ: reservar antes, liquidar o que aconteceu.

- **Migration** `supabase/migrations/20261012143547_reserva_de_creditos_na_execucao.sql` (aditiva; redefine cinco funções a partir da definição mais recente da `main`):
  - `claim_agent_run` (a do 01): com a cobrança ligada, reserva `quantity = estimativa` de `agent_round` com a chave `run:<execução>` (Conversa de um Agente = 1 + @mencionados que existem; Coordenação = 3). Sem saldo ou acima do limite mensal da pessoa, fecha a Execução como `failed`/`insufficient_credits`, não deixa reserva e devolve `null`. A chave de IA do cliente vale (20%).
  - `begin_agent_round`: com a reserva de estimativa aberta e lugar nela, a rodada **sai dela** (não reserva de novo). Acabada a estimativa, reserva 1 por rodada, como hoje. Execução de Rotina: a rodada além das que o relógio já contou (`routine_cap_rounds()`, 3) consulta o teto `rotina:<id>` antes de abrir e devolve `cap_reached` se o teto barra. O desfecho novo é só esse; os de sempre (`free`, `go`, `paid`, `no_credits`) e a assinatura são os mesmos.
  - `end_agent_round`: o id que ela recebe é a reserva da rodada **ou** a linha da rodada no caderno (rodada que saiu da estimativa); assinatura igual.
  - `finish_agent_run` e `private.expire_run_if_stale`: depois de fechar a Execução, chamam `private.close_run_credits`, que solta as rodadas abertas, liquida a estimativa com as rodadas concluídas (zero libera; quem falha depois de uma rodada concluída paga só ela) e devolve ao teto da Rotina a diferença entre o que o relógio somou e o que as rodadas concluídas custaram. Uma vez por Execução (`agent_runs.credits_closed`). O `timeout` solta na hora; a faxina de 2 horas continua.
  - Tabela nova `private.agent_run_rounds` (o caderno das rodadas: de onde sai a contagem das concluídas) e colunas `agent_runs.cap_extra` e `credits_closed`. RLS ligada, nenhum papel do app lê.
- **TypeScript** (`supabase/functions/_shared/orquestracao.ts`): `TetoAtingido` (`automation_cap_reached`), `creditosDoBanco` traduz `cap_reached` e devolve o id de uma rodada `free` (a Rotina com cobrança desligada conta as rodadas para o teto). `worker.ts`, `main.ts` e `agent-conversation/index.ts` **não mudaram**: o worker já ignora o pedido cujo claim devolve `null`.
- **Front**: `supabase-conversas.ts` traduz `automation_cap_reached`.

## Decisões (os padrões propostos nas dúvidas do ticket, sem resposta do Renan)

1. Reserva por Execução com a rodada como medidor, mais o caderno das rodadas (a primeira opção do ticket, com a contagem em uma tabela pequena em vez de contar reservas liquidadas, porque a rodada coberta não tem reserva própria).
2. O teto `agente:<id>` não vale para a Conversa que a pessoa abre; o limite por pessoa vale. Testado com `acao:agentes` no teto.
3. Estimativa: 1 Agente por 1 rodada (+ menções) e 3 para a Coordenação; as rodadas extras são reservadas uma a uma.
4. Modo `HERMES_UMA_CHAMADA` (uma chamada só): o banco não sabe o modo, então o claim reserva a estimativa e o fim a solta, sem cobrar nada (nenhuma rodada abre). Se o Workspace estiver sem saldo, esse modo também é recusado na porta. Confirmar com o Renan se esse modo pode sumir.
5. Rotina em sobreposição: pular o horário não soma teto (já era assim no 01; este ticket não mexeu).

## O que o ticket não previa

- **`refund_automation_cap` já existe**: `private.refund_automation_cap(workspace, escopo, valor)` (`20260930180000_monitoramento_real_de_sinais.sql:627`, usado pela varredura, pela proposta e pelo relógio das Rotinas). O ticket pedia uma função nova; usei a existente, sem criar uma segunda. O estorno só roda dentro do banco (fim e timeout da Execução), então não precisou de função pública.
- A rodada de Rotina além do que o relógio contou só consulta o teto a partir da 4ª rodada da Execução (o relógio já somou 3). Hoje uma Rotina (Conversa de um Agente, sem menções) chega a 3 rodadas, então na prática o teto se esgota quando o relógio soma, e o `cap_reached` é a rede de segurança. Consultar o teto em toda rodada extra somaria duas vezes o que o relógio já somou e dispararia um Aviso de "teto atingido" falso.
- O claim também acerta o teto de uma Execução de Rotina que fecha sem rodar (`membership_inactive`, `routine_paused`, `insufficient_credits`): o relógio já tinha somado a estimativa.

## Arquivos compartilhados que alterei (Renan: agentes, créditos e Aprovações)

- `supabase/migrations/20261012143547_reserva_de_creditos_na_execucao.sql` (arquivo novo), que redefine: `public.claim_agent_run`, `public.finish_agent_run`, `private.expire_run_if_stale` (Agentes); `public.begin_agent_round` e `public.end_agent_round` (créditos). Usa, sem alterar, `reserve_credits`, `settle_credits`, `release_credits`, `consume_automation_cap` e `private.refund_automation_cap`.
- `supabase/functions/_shared/orquestracao.ts` (`Creditos`, `creditosDoBanco`, classe `TetoAtingido`): o ponto onde a proposta de resposta e os Agentes se encontram; a ponte e o worker o usam juntos.
- `projeto-althius-frontend/src/fonte/supabase-conversas.ts` (a tradução de motivos).
- Nenhum teste existente foi alterado. Testes novos: `supabase/tests/reserva_de_creditos_na_execucao.sql` (89), `supabase/functions/_shared/reserva-de-creditos.test.ts`, `supabase/functions/_hermes-worker/worker-reserva.test.ts`, `projeto-althius-frontend/src/fonte/supabase-conversas-teto.test.ts`.

## Testes

- **Vermelho antes:** o pgTAP falhou com `function "private.close_run_credits(uuid)" does not exist`; os testes Deno falharam na checagem de tipos (`TetoAtingido` não existia) e o do front com a mensagem genérica.
- **Depois:** pgTAP do zero num Postgres 16 descartável com todas as migrations em ordem: os 83 arquivos passam e `reserva_de_creditos_na_execucao.sql` fecha 89/89; `creditos_das_execucoes_de_agentes.sql` (19), `interruptores_e_tetos.sql`, `custos_por_acao.sql`, `teto_das_propostas_de_resposta.sql` e `rotinas_que_rodam_sozinhas.sql` seguem verdes sem edição. `deno test --allow-all supabase/functions`: 1014 passaram, 0 falharam; `deno check` das três Edge Functions limpo; `tsc -b` limpo; `oxlint` só com os avisos que já existiam.
- **Os testes têm dentes:** com uma mutação de cada vez no SQL, falham as asserções certas ao tirar o acerto do `finish_agent_run` (15), a liberação do `timeout` (3), a consulta ao teto na rodada extra (1), o consumo da estimativa pela rodada (5) e o estorno do teto da Rotina (3).
- O pgTAP não usa o relógio do banco para o disparo das Rotinas: `p_now` e os horários são fixos.

## Passos do Nan

1. Com o CI verde e antes do merge, aplicar `supabase/migrations/20261012143547_reserva_de_creditos_na_execucao.sql` no projeto `ycbdilsmydvzezhlymty` conforme `docs/agents/migrations.md` (bloco atômico no `execute_sql`, depois conferir o `md5` do histórico e os advisors). Só acrescenta (tabela e duas colunas) e redefine cinco funções com a mesma assinatura; nenhuma linha sai. A ordem importa: banco primeiro, depois as funções.
2. Publicar a ponte e reiniciar o worker:
   ```powershell
   cd "$HOME\Althius"
   git checkout main
   git pull
   npx supabase functions deploy agent-conversation --project-ref ycbdilsmydvzezhlymty
   ```
   No terminal do worker, `Ctrl+C` e ligar de novo:
   ```powershell
   npx -y deno@2 run --node-modules-dir=none --allow-net --allow-env --allow-read --env-file=supabase/functions/_hermes-worker/.env supabase/functions/_hermes-worker/main.ts
   ```
   Entre a migration e o deploy o motor antigo segue funcionando: a rodada sai da estimativa do claim e é fechada pelo `end_agent_round`. O que o motor antigo não faz é contar as rodadas da Rotina com a cobrança desligada (o teto de uma Rotina volta inteiro no fim da Execução) nem reconhecer `cap_reached`; os dois só valem com o motor novo.
3. Nada muda para um Workspace sem cobrança ligada (`credits_enforced`), a não ser o teto das Rotinas, que vale sempre. Para ver a falta de saldo na porta num Workspace de teste (a IA liga a cobrança, tira o saldo, faz um pedido e desliga de novo; nada disso foi feito no remoto): `select public.set_credits_enforced('<workspace>', true);`, um pedido a um Agente deve fechar como `insufficient_credits` sem reserva (`select * from private.credit_reservations where action_key like 'run:%' order by created_at desc limit 3;`), e depois `select public.set_credits_enforced('<workspace>', false);`.

## Riscos e o que não foi feito

- A estimativa da Coordenação é otimista (3 Agentes por 1 rodada): uma Coordenação com mais rodadas reserva o resto uma a uma e pode parar no meio por falta de saldo, mantendo o que concluiu. É o padrão proposto na dúvida 3.
- O relatório de custos (`get_cost_report`) não foi tocado: o crédito segue em `credit_entries` e o dólar em `action_costs`, e o pgTAP confere que o claim e o fim não escrevem em `action_costs`.

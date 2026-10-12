# 02: Reserva de Créditos antes de executar, com teto de parada dura

**What to build:** hoje a Execução de um Agente só reserva crédito **depois** de começar: `comCreditos` abre uma rodada paga por Agente dentro do worker (`begin_agent_round`/`end_agent_round`, `supabase/functions/_shared/orquestracao.ts:498-543`), e `claim_agent_run` e `finish_agent_run` não sabem de crédito. Uma Rotina (ticket 01) que roda de madrugada pode então abrir a Execução, gastar o modelo e só falhar na primeira rodada. Este ticket move a reserva para a porta: `claim_agent_run` reserva a **estimativa** da Execução antes de devolver qualquer coisa ao motor, e `finish_agent_run` acerta, debitando o que as rodadas concluídas custaram e liberando o resto. É o contrato da consulta de CNPJ, que reserva antes (`begin_cnpj_receita`, `20261008203000_consulta_cnpj_reserva_credito.sql:27`) e liquida o que achou ou libera (`finish_cnpj_receita`, `:75`). Em cima disso, o teto de um Agente ou de uma Rotina vira uma **parada dura**: batido o teto, a Execução não abre, ou para antes da rodada seguinte, sem resposta inventada.

**Blocked by:** 01: Rotinas que rodam sozinhas (o teto da Rotina e o escopo `rotina:<id>` nascem lá).

**Status:** needs-triage (a primeira dúvida para o Renan decide o desenho da reserva; o padrão proposto basta para começar)

## O que existe hoje (lido na `main` em 12/10/2026)

- `begin_agent_round(execução, Agente, rodada, chave_do_cliente)` devolve `free` (cobrança desligada), `go`, `paid` ou `no_credits`; `end_agent_round(reserva, concluída)` debita ou solta (`20260930190000_creditos_das_execucoes_de_agentes.sql:50` e `:109`). A chave da reserva é `agent:<execução>:<Agente>:<rodada>`, então repetir nunca cobra duas vezes.
- A cobrança nasce desligada por Workspace (`private.workspace_billing.credits_enforced`, `:17`): sem ela nada é reservado. O modo de uma chamada só do Hermes (`HERMES_UMA_CHAMADA=true`) não tem rodada por Agente e segue sem cobrar.
- Sem saldo, o Agente nem roda e a Execução fecha com `insufficient_credits` (`SemSaldo`, `_shared/orquestracao.ts:473-480`); a tela traduz em `projeto-althius-frontend/src/fonte/supabase-conversas.ts:74`.
- Contrato de créditos (`20260930160000_saldo_e_lancamentos_de_credito.sql`): `reserve_credits` (`:147`, idempotente pela chave, recusa sem saldo ou acima do limite mensal da pessoa), `settle_credits(reserva, quantidade_usada)` (`:220`, zero usado libera) e `release_credits` (`:260`). A faxina `private.release_stale_credit_reservations` solta reservas de mais de 2 horas (`20260930180000_monitoramento_real_de_sinais.sql:742`, job `althius-credit-janitor`).
- `expire_run_if_stale` (`20260929180000_conversas_dos_agentes.sql:110`) fecha a Execução parada como `timeout` mas **não solta crédito**: a reserva só volta pela faxina, até 2 horas depois.
- Teto de automático: `consume_automation_cap(workspace, escopo, valor)` (`20260930170000_interruptores_e_tetos.sql:161`) soma o gasto e devolve `ok`, `confirmar`, `sem_teto` ou `teto_atingido`; a proposta de resposta já devolve o que somou quando a geração falha (`consume_reply_proposal_cap`/`refund_reply_proposal_cap`, `20261009010000_teto_das_propostas_de_resposta.sql:155`). Não existe um estorno genérico de teto.
- `record_agent_run_cost` (`20260930120000_custos_por_acao.sql:59`) grava tokens e modelo em `private.action_costs`; é custo real em dólar, outro livro, e **não** debita crédito.
- `reserve_credits` não expõe o preço; o preço de `agent_round` (1) está em `private.credit_action_prices`, e o runner da proposta já repete o valor em `private.reply_proposal_round_credits` por causa disso.

## Desenho

- **Estimativa na reserva.** `claim_agent_run`, com a cobrança ligada, reserva `quantity = rodadas estimadas` da ação `agent_round`, com a chave `run:<execução>` (idempotente: reclamar duas vezes não reserva duas). Estimativa padrão: Conversa de um Agente = 1 Agente × 1 rodada mais as menções; Coordenação = `MAX_ESCOLHIDOS = 3` Agentes × 1 rodada (`_shared/orquestracao.ts:103-105`); as rodadas extras (até `MAX_RODADAS_DO_PEDIDO = 3`, `:203`) são reservadas uma a uma, como hoje, pelo `begin_agent_round`.
- **Sem saldo na porta.** Sem saldo ou no limite mensal da pessoa, o claim fecha a Execução como `failed` com `insufficient_credits` e devolve `null`; nenhuma chamada ao modelo, nada fica reservado. A chave de IA do cliente (20%) vale na reserva, como hoje.
- **Acerto no fim.** `finish_agent_run` liquida a reserva de estimativa com `settle_credits(reserva, rodadas concluídas)` (zero concluídas libera; falha depois de uma rodada concluída debita só ela, como "quem falha não é cobrado"). A contagem sai das reservas de rodada liquidadas da Execução; o contrato de assinatura de `finish_agent_run(uuid, text, text, text)` não muda.
- **Sem cobrança em dobro.** `begin_agent_round` passa a **consumir** a reserva de estimativa enquanto houver rodada reservada e só reserva de novo quando ela acabou. Isso muda a assinatura de retorno do TS (`Creditos.abrir`/`fechar` em `_shared/orquestracao.ts:489-543`) só no que for preciso e nos dois motores ao mesmo tempo (ponte e worker).
- **Timeout solta na hora.** `expire_run_if_stale` passa a liberar a reserva da Execução que fechou como `timeout`; a faxina de 2 horas fica como rede de segurança.
- **Teto com parada dura.** Execução de Rotina: o cron do ticket 01 já soma a estimativa provisória (3) ao `rotina:<id>`; o fim da Execução **devolve** a diferença (`refund_automation_cap`, função nova, servidor apenas), e uma rodada extra de Rotina consulta o teto antes de abrir: batido, a Execução fecha com `automation_cap_reached` e não chama o modelo. Execução de Agente por pessoa (Conversa, Menção, Coordenação): o clique da pessoa vale como confirmação e não passa pelo teto `agente:<id>`, como decidido para a proposta de resposta (ver dúvida 2).

## Critérios

- [ ] Cobrança ligada, saldo suficiente: depois do `claim_agent_run` existe uma reserva `reserved` com a chave `run:<execução>` e a quantidade estimada, antes de qualquer evento de modelo. Chamar o claim de novo (a Execução já `running`) devolve `null` e não cria segunda reserva.
- [ ] Sem saldo, ou acima do limite mensal da pessoa: o claim devolve `null`, a Execução fica `failed` com `insufficient_credits`, não há reserva aberta e o worker não chama o Hermes (teste Deno com banco falso).
- [ ] Execução com sucesso e todas as rodadas concluídas: `finish_agent_run` deixa a reserva `settled` com `settled_quantity` = rodadas concluídas, e o extrato (`credit_entries`) tem um único lançamento `acao` para a Execução.
- [ ] Execução que reservou 3 e concluiu 1 rodada: debita 1, e o saldo disponível volta a ser saldo menos 1. Execução que falha sem rodada concluída: reserva `released`, nada debitado.
- [ ] Rodada extra além da estimativa: reserva mais uma e, sem saldo, a Execução fecha como `insufficient_credits` mantendo o que as rodadas anteriores já concluíram.
- [ ] Chave de IA do cliente: a reserva e o acerto saem a 20% por rodada (`private.own_ai_key_factor`).
- [ ] Cobrança desligada (`credits_enforced = false`): nada é reservado, nada é debitado e os pgTAP de `creditos_das_execucoes_de_agentes.sql` continuam verdes sem edição.
- [ ] Execução presa que vira `timeout` solta a reserva na mesma transação; o job `althius-credit-janitor` continua existindo.
- [ ] Rotina: teto `rotina:<id>` de 5 créditos, estimativa provisória 3: depois de uma Execução que usou 1 rodada, o gasto do escopo no mês é 1, não 3 (estorno da diferença). No teto, a próxima Execução da Rotina não nasce (`teto_atingido`) e uma Execução em andamento que pede rodada extra fecha com `automation_cap_reached` e sem chamar o modelo.
- [ ] O teto de um Agente não bloqueia a Conversa que a pessoa abre com ele; o limite mensal da pessoa (`credit_member_limits`) continua valendo.
- [ ] Isolamento: reserva, estorno e teto de um Workspace nunca mexem em outro; as funções novas são só do `service_role`.
- [ ] `get_credit_balance` e o relatório de custos (`get_cost_report`) seguem coerentes: o crédito continua em `credit_entries`, o dólar em `action_costs`, sem se misturarem.

## Pode mexer

- Uma migration nova, com timestamp UTC maior que a última da `main`, e um pgTAP novo: `supabase/tests/reserva_de_creditos_na_execucao.sql`.
- `claim_agent_run`, `finish_agent_run`, `expire_run_if_stale` e `begin_agent_round`/`end_agent_round`, redefinidas a partir da definição mais recente da `main` (a do ticket 01 para o claim).
- `refund_automation_cap` (função nova) e o escopo `rotina:` já criado pelo 01.
- `supabase/functions/_shared/orquestracao.ts` (`Creditos`, `comCreditos`, `creditosDoBanco`), `supabase/functions/_hermes-worker/worker.ts` e `main.ts`, `supabase/functions/agent-conversation/index.ts`: só o necessário para a reserva e o acerto.
- `projeto-althius-frontend/src/fonte/supabase-conversas.ts`: só a mensagem de `automation_cap_reached`.
- Testes novos: Deno em `_hermes-worker/` e em `_shared/`, e pgTAP.

## Não mexa

- Em `reserve_credits`, `settle_credits`, `release_credits` e `grant_credits` (`20260930160000_saldo_e_lancamentos_de_credito.sql`): outras frentes os usam (Sinais, enriquecimento, CNPJ, proposta de resposta). Só chamar.
- Em `begin_reply_proposal_round`, `consume_reply_proposal_cap` e no `reply-proposal-runner`.
- Em `begin_cnpj_receita`/`finish_cnpj_receita`: são o precedente, não se mexe.
- Em testes existentes: um ticket só acrescenta testes (`creditos_das_execucoes_de_agentes.sql`, `interruptores_e_tetos.sql`, `custos_por_acao.sql`, `worker-consumo.test.ts`).
- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- O preço de `agent_round` e o desconto da chave do cliente continuam os da ADR-0019.

## Arquivos compartilhados com a área do Renan

- `20260930160000_saldo_e_lancamentos_de_credito.sql`, `20260930190000_creditos_das_execucoes_de_agentes.sql`, `20260930170000_interruptores_e_tetos.sql` e `20261009010000_teto_das_propostas_de_resposta.sql`: o livro de créditos, `begin_agent_round` e os tetos são da frente de créditos.
- `supabase/functions/_shared/orquestracao.ts` (`Creditos`, `comCreditos`): é o ponto onde a proposta de resposta e os Agentes se encontram; a ponte `agent-conversation` e o worker o usam juntos.
- `reply-proposal-runner` e `private.reply_proposal_round_credits`: só leitura, como referência de como o preço foi repetido.
- `supabase/tests/creditos_das_execucoes_de_agentes.sql` e `teto_das_propostas_de_resposta.sql`: só leitura; afirmam os desfechos que não podem mudar.
- `projeto-althius-frontend/src/fonte/supabase-conversas.ts` (a tradução de motivos) e a página de Automação (`secao-automacao.tsx`).

## Dúvidas para o Renan

1. **Uma reserva por Execução ou a rodada como medidor?** O pedido original é reservar a estimativa no claim e acertar no finish. O desenho que propus mantém `begin_agent_round` como medidor por cima dela. A alternativa é uma tabela `agent_run_credit` (Execução, reserva, rodadas reservadas, rodadas usadas) e `begin_agent_round` só incrementar. Padrão proposto: a primeira, que mexe menos no que a frente de créditos já fechou.
2. **O teto `agente:<id>` vale para a Conversa que a pessoa abre?** Na proposta de resposta ele não vale (o clique é a confirmação). "Teto por Agente com parada dura" pode querer dizer o contrário. Padrão proposto: só automático (Rotina e, depois, Canal); o limite por pessoa já protege o resto.
3. **Estimativa.** 1 rodada por Agente chamado é otimista para a Coordenação, que pode ir a 3 Agentes × 3 rodadas. Padrão proposto: o valor acima, com as rodadas extras reservadas uma a uma. O alternativo (reservar o máximo e liberar o que sobrar) segura até 12 créditos por pedido e pode negar o que caberia.
4. **O modo de uma chamada só do Hermes** (`HERMES_UMA_CHAMADA`) hoje não cobra. Padrão proposto: continua sem cobrar e a reserva da porta não se aplica a ele; confirme se esse modo pode sumir.
5. **Rotina em sobreposição.** Se o ticket 01 pula o horário com a Execução anterior aberta, o teto não foi somado. Confirme que pular não gasta teto.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Aplicar a migration conforme `docs/agents/migrations.md`, com o CI verde e antes do merge. A ordem importa: banco primeiro, depois as funções.
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
   Entre a migration e o deploy, o motor antigo ainda abre as rodadas pelo `begin_agent_round` e segue funcionando; com o motor novo e o banco antigo, a Execução falha. Por isso o banco vem antes.
3. Nada muda para um Workspace sem cobrança ligada (`credits_enforced`, ticket `creditos-e-planos` 06). Para ver a falta de saldo na porta, a IA liga a cobrança num Workspace de teste, tira o saldo, faz um pedido e desliga de novo.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

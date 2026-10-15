# 05: Falhas e Aprovações chegam ao thread

Spec: [../spec.md](../spec.md) (seção "Entrega da resposta no thread"; US 38–41). 

**What to build:** quando a Execução de um fio falha (sem Créditos, sem contrato ativo, erro do Agente, expirada por prazo), o thread recebe uma falha clara com o motivo humano, nunca uma resposta inventada. Quando o Agente propõe uma ação com a Permissão Propor, a Aprovação vai para a fila da Althius com o gatilho Canal e o thread avisa que ela aguarda lá, sem botões no Slack. Se o Canal foi retirado entre o pedido e a entrega, nada é postado e a Execução só é marcada como entregue.

**GATE:** uma migration, `20261031100000_falhas_e_aprovacoes_do_canal_slack.sql`, com pgTAP. Ela **não é só aditiva**: faz `drop function` e `create` de `public.claim_slack_channel_delivery(uuid)`, porque o retorno ganha a coluna `pending_approvals` e o Postgres não troca o tipo de retorno com `create or replace` (nenhum dado se perde, os grants são refeitos). Ela também cria o índice `agent_runs_open_channel_idx` e o relógio `private.expire_stale_slack_channel_runs()`, agendado no `pg_cron` a cada 5 minutos (`althius-slack-channel-expiry`). Sem deploy e sem aplicar no remoto. Aprovação decidida no Slack fica fora.

**Blocked by:** 03 (Abrir um fio e o Agente responde no thread).

**Status:** ready-for-human (código no PR #224; falta o merge, o Nan aplicar a migration `20261031100000` e republicar a função de entrega)

## Pode mexer

- a função de entrega e os testes dela
- se necessário, uma migration aditiva com pgTAP para a Aprovação guardar o gatilho Canal ou para o gatilho cobrir a expiração

## Não mexa

- a função de eventos, `agent-conversation`, `_hermes-worker`, `_shared/executor-de-aprovacoes.ts`
- frontend
- testes existentes

## Critérios

- [x] Execução sem Créditos, sem contrato e com erro do Agente: cada uma posta uma falha com o motivo humano certo
- [x] Execução expirada por prazo também é postada como falha
- [x] Aprovação pedida pela Execução fica na fila com o gatilho Canal e o thread diz que ela aguarda na Althius (pgTAP: a Aprovação da fila, por `list_approvals`, chega à Execução `canal` pelo `run_id`)
- [x] Canal retirado antes da entrega: nada postado, Execução marcada
- [x] Cada Execução é postada uma vez só
- [x] `chat.postMessage` com 429 respeita o `Retry-After` (até 5s) e tenta de novo; 5xx e rede fora são tentados até 3 vezes; recusa `ok: false` não é repetida (`_shared/slack-api-postar.test.ts`)
- [x] Falha ao postar fica no log com o `run_id` (`falha_ao_postar`) e a função responde 502
- [x] lint, `deno test`, `deno check` e pgTAP do zero verdes (pgTAP `falhas_e_aprovacoes_do_canal_slack.sql` verde no CI do PR #224 com o assert novo, run 38776771010)

## Passos do Nan

- Republicar a função de entrega (e aplicar a migration, se houver)
- No Slack de teste: pedir ao Agente uma ação com Permissão Propor e conferir a Aprovação na fila e o aviso no thread

## Comments

**2026-10-15, agente:** implementado em `0445bb3` (PR #224); migration renomeada para `20261031100000` no `0237c90`.

- Testes Deno em `slack-channel-delivery/handler-falhas.test.ts`: sem Créditos, sem contrato, erro do Agente, prazo, Aprovação pendente (sem `<!channel>`), Canal retirado e entrega única.
- `drop` e `create` de `claim_slack_channel_delivery`: troca de assinatura, sem perda de dado. O corpo do PR e o RALPH-STATUS diziam "sem drop", o que estava errado e foi corrigido.
- O relógio de prazo vence **todas** as Execuções `canal` paradas, não só as do Slack. Quando entrar o WhatsApp, rever o nome e o escopo.
- Fica para o ticket 09: a entrega ainda marca a Execução como entregue **antes** de postar. Se o Slack falhar depois das tentativas, a resposta só fica no log com o `run_id`.


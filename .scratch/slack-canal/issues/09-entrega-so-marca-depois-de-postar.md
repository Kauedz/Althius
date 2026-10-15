# 09: A entrega só fica marcada depois de postar

Spec: [../spec.md](../spec.md) (seções "Entrega da resposta no thread" e "Limites e falhas de postagem").

**What to build:** antes, `claim_slack_channel_delivery` marcava a Execução como entregue **antes** de postar; se o `chat.postMessage` falhasse, a resposta não chegava ao thread. Agora: reservar (com prazo), postar e só então confirmar. Numa falha, soltar a reserva com o motivo e a contagem de tentativas; um relógio do banco pede a entrega de novo; desistir depois de N tentativas, com log.

**Padrões:** reserva com prazo de 2 minutos; até 5 tentativas; relógio a cada 2 minutos (`pg_cron`, job `althius-slack-channel-delivery-retry`), para Execuções terminadas há mais de 1 minuto e há menos de 1 dia, até 100 por volta. Uma recusa do Slack (`ok: false`, por exemplo canal apagado ou bot fora do canal) desiste na hora.

**GATE:** migration `20261101110000_entrega_confirmada_do_canal_slack.sql`, com pgTAP. Aditiva: colunas novas em `private.agent_runs` (`channel_posted_at`, `channel_delivery_attempts`, `channel_delivery_failed_at`, `channel_delivery_error`), índice, RPCs novas `confirm_slack_channel_delivery` e `fail_slack_channel_delivery`, relógio `private.retry_slack_channel_deliveries()`, e `claim_slack_channel_delivery` redefinida com `create or replace` (mesmo retorno, **sem `drop`**). Ela tem um `update` de dados: as Execuções já reservadas antes contam como postadas (`channel_posted_at = channel_delivered_at`), para o relógio não repostar o histórico. Sem deploy e sem aplicar no remoto.

**Blocked by:** 05.

**Status:** ready-for-human (código no PR #224; falta o merge, o Nan aplicar a migration e republicar `slack-channel-delivery`)

## Critérios

- [x] A Execução só fica confirmada (`channel_posted_at`) depois de o Slack aceitar o post; `channel_delivered_at` passa a ser a reserva (Deno: ordem reservar → postar → confirmar; pgTAP)
- [x] Uma vez só continua: enquanto a reserva vale, ninguém mais reserva; confirmada ou desistida, nunca mais (pgTAP)
- [x] Falha ao postar grava o motivo e a tentativa, solta a reserva, e o relógio pede a entrega de novo até 5 tentativas; recusa definitiva do Slack desiste na primeira (pgTAP e Deno)
- [x] O relógio pede a entrega pendente, inclusive a que o pg_net perdeu, e não a confirmada nem a desistida (pgTAP)
- [x] Canal retirado continua sem postar: a reserva vem sem token e já marca a desistência com `canal_retirado` (pgTAP e Deno)
- [x] Tudo no log com o `run_id`: `falha_ao_postar` (com a decisão `nova_tentativa` ou `desistiu`), `falha_ao_confirmar`, `falha_ao_registrar_falha`
- [x] lint, `deno test`, `deno check` e pgTAP do zero verdes (ver Comments)

## Comments

**2026-10-15, agente:** implementado no PR #224 (`slack-channel-delivery/handler-confirmacao.test.ts`, 5 testes; pgTAP `limite_e_entrega_confirmada_do_canal_slack.sql`). Risco que fica: se o post sair e a confirmação falhar, a reserva vence em 2 minutos e o relógio pode postar de novo (duplicata rara, registrada no log `falha_ao_confirmar`). Os testes de entrega que já existiam não mudaram.

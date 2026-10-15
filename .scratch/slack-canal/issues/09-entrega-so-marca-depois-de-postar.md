# 09: A entrega só fica marcada depois de postar

Spec: [../spec.md](../spec.md) (seções "Entrega da resposta no thread" e "Limites e falhas de postagem").

**What to build:** hoje `claim_slack_channel_delivery` marca a Execução como entregue **antes** de postar (é isso que garante "uma vez só"). Se o `chat.postMessage` falhar depois das tentativas do 05, a resposta não chega ao thread; só fica no log `falha_ao_postar` com o `run_id`. Separar a reserva da confirmação: reservar (com prazo), postar, e então confirmar entregue; numa falha, gravar `delivery_failed` com o motivo, e uma nova tentativa pelo relógio do `pg_cron` até um limite. A Conversa na Althius continua com a resposta de qualquer forma.

**GATE:** migration com pgTAP (novo estado da entrega e RPC de confirmar ou falhar); sem deploy e sem aplicar no remoto. Mexe na garantia de "uma vez só", então precisa de revisão cuidadosa.

**Blocked by:** 05.

**Status:** needs-triage (não implementado: muda o contrato da entrega com o banco; maior que um ajuste)

## Critérios

- [ ] A Execução só fica entregue depois de o Slack confirmar o post
- [ ] Falha ao postar grava o motivo e o `run_id`, e a entrega é tentada de novo até um limite, nunca duas vezes com sucesso
- [ ] Canal retirado continua sem postar
- [ ] pgTAP: reservar, confirmar, falhar e tentar de novo; Deno: falha do Slack chama a RPC de falha

# Handoff: canais-cadencia-backend 06, ciclo real por WhatsApp

Branch: `kaue/canais-06-ciclo-real-whatsapp`. Ticket: `.scratch/canais-cadencia-backend/issues/06-ciclo-real-whatsapp.md`. Status do ticket: segue `ready-for-human`.

## Tarefa

O gate passou (Blocked by 05 está `closed`). Os sete critérios já estavam no código da `main`, com teste (reconciliação de
2026-10-07 no próprio ticket). Esta sessão fechou a única lacuna que o ticket deixou para agente: nenhum teste Deno cobria
o roteamento de `message.new` do webhook até `ingestChatEvent`.

## Arquivos

- `supabase/functions/unipile-account-status/handler.test.ts`: 6 testes novos. `message.new` vai à ingestão de conversa com
  id do evento, conta e payload e não toca a ingestão de e-mail; conversa pessoal (outcome `unrelated`) é confirmada com 2xx;
  sem id de evento ou sem payload dá 400 e não chega ao banco; erro na ingestão dá 500 (a Unipile tenta de novo);
  `relation.new` só chega ao banco para registro; sem `ingestChatEvent` o evento é ignorado com 200.
- `.scratch/canais-cadencia-backend/issues/06-ciclo-real-whatsapp.md`: comentário curto sobre a lacuna fechada.
- `.scratch/handoffs/canais-06.md` (este arquivo).

Nenhum código de produção mudou. Sem migration. Sem deploy.

## Loop

Os testes já nascem verdes, porque o roteamento existe. Para provar que não são vazios, troquei a condição do roteamento em
`handler.ts` por `false`: 5 dos 6 testes ficaram vermelhos (16 passed, 5 failed). Voltei o arquivo ao original. O sexto
(sem `ingestChatEvent`) cobre o caminho que já ignora o evento.

Resultado final: `deno test supabase/functions/unipile-account-status/handler.test.ts` 21 passed; junto com `send-chat-step`,
`send-chat-step-adapters` e `sequence-runner`: 96 passed, 0 failed.

## Contagem de critérios

AC 7/7 no código e nos testes com dublês. Os checkboxes do ticket ficam desmarcados de propósito: o ticket os reserva à
confirmação com WhatsApp real (campos `users_ids`, `is_sender`, `sender_id` marcados "não confirmado"). Não marquei nada
que só o envio real prova.

## Pendente (humano)

Os "Passos do Nan" do ticket, sem mudança: conectar o WhatsApp, `bash scripts/wizard-unipile.sh` (webhook com `message.new`),
deploy de `sequence-runner` e `unipile-account-status --no-verify-jwt`, ligar o canal com
`select private.set_chat_channel_enabled('whatsapp', true);`, enviar a um número real, responder e conferir.
Esta sessão não tinha número real de teste nem acesso à Unipile: BLOCKED para a validação externa (AC 12 da spec).

## Aprendizados

- O ambiente não tinha Deno; `npm install -g deno` resolve.
- `deno lint` já acusa 11 problemas nessa pasta na `main` (o CI só roda `deno check` e `deno test`); os testes novos somam 1
  (`require-await` em dublê assíncrono), igual aos dublês existentes.

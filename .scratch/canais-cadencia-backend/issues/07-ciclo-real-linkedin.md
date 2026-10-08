# 07: Executar passos e receber respostas pelo LinkedIn

**What to build:** ampliar o executor para convite, mensagem e InMail pelo LinkedIn pessoal do responsável, respeitando relação, elegibilidade e capacidade da conta. Resposta real pausa a Conta-alvo; aceite de convite, eco da nota e evento de relação não são tratados como resposta.

**Blocked by:** 05: Executar a Sequência com o navegador fechado.

**Status:** ready-for-human (InMail fora, por decisão do Renan; o ticket fecha com convite e mensagem no LinkedIn depois do envio real)

- [ ] A identidade pública do Contato é resolvida para o identificador nativo correto antes do envio.
- [ ] Convite, mensagem e InMail são enviados somente quando a conta e a relação suportam o subtipo escolhido.
- [ ] Falta de crédito, assinatura, elegibilidade ou relação aparece como impedimento acionável e não gera retentativa cega.
- [ ] `new_relation`, aceite de convite, nota original e eventos técnicos não são contados como resposta comercial.
- [ ] Uma mensagem real do Contato pausa toda a Sequência da Conta-alvo, preservando conteúdo privado e evento público mínimo.
- [ ] Eventos atrasados, repetidos ou fora de ordem não duplicam Interação nem fazem a Sequência oscilar incorretamente.
- [ ] Testes cobrem ao menos um caminho permitido e os principais impedimentos de convite, mensagem e InMail.

## Dependências externas

- LinkedIn do titular conectado e perfil real de teste indicado pelo usuário, com capacidade compatível com o subtipo validado.


## Comments

- **2026-10-01, backend** (migration `20261001150000_canais_whatsapp_e_linkedin.sql`, aplicada): ativação, liberação e resultado dos passos de LinkedIn no mesmo Executor do E-mail; ingestão de `message.new` (eco, resposta do Contato pausa a Sequência de forma idempotente, conversa sem Contato participante ignorada, duplicado e fora de ordem). Núcleo em `supabase/functions/_shared/send-chat-step.ts` e adaptadores em `send-chat-step-adapters.ts`; pgTAP `canais_whatsapp_linkedin.sql` e testes deno com dublês.
- **Desligado por padrão:** `private.chat_channel_settings` nasce com LinkedIn desligado. Enquanto estiver assim, a ativação ignora os passos de LinkedIn e o Executor não os envia.
- **2026-10-01, tela:** os bloqueios novos da ativação e do envio aparecem em português (`src/fonte/motivos-do-envio.ts` e `supabase-sequencias.ts`).
- **Não confirmado** (contrato da Unipile v2 levantado por busca, sem acesso à documentação oficial): os nomes de campo marcados com `não confirmado:` em `send-chat-step-adapters.ts` e `ingest-chat-event.ts`, entre eles `users_ids` ou `user_ids` e o nome do evento de nova relação do LinkedIn. O primeiro envio real confirma.

- 2026-10-07 (reconciliação contra a `main` 59e53a6). Não é duplicado do C1 nem do C3.
  - Cumpridos no código, com teste: identidade resolvida antes do envio (`_shared/send-chat-step.ts:313-332`; Deno "perfil: GET /v2/{conta}/users/{perfil}…"); nova relação, aceite e nota não contam como resposta (`20261001150000_canais_whatsapp_e_linkedin.sql:1299-1307`; pgTAP "an accepted invitation (new relation) is only recorded", "the echo of the invitation note is not a reply"); resposta real pausa a Sequência (pgTAP "a LinkedIn reply pauses the Sequência"); eventos atrasados ou repetidos (pgTAP "a reply that arrives before the send result cannot be tied yet", "a redelivered reply event is ignored").
  - Parcial (critério 2): convite e mensagem estão certos (`send-chat-step.ts:184-190,340-357`), mas o InMail sai pelo `startChat` (`:359-361`), cujo corpo leva só `users_ids` e `text` (`send-chat-step-adapters.ts:181-186`), sem marca de InMail.
  - Parcial (critério 3): o backend devolve impedimento sem retentativa (`send-chat-step-adapters.ts:77-93`; pgTAP "a blocked step is never retried blindly"; Deno "LinkedIn: sem crédito, assinatura ou elegibilidade…"), mas a tela não traduz `insufficient_credits`, `subscription_required`, `linkedin_not_connected`, `not_connected`, `recipient_not_found`, `provider_limit_reached` e `invite_already_pending` (`src/fonte/motivos-do-envio.ts:3-31`), e o rodapé do passo de chat nunca mostra o Envio (`src/paginas/detalhe-sequencia.tsx:1833-1834`). Isso foi para o C1.
  - Parcial (critério 7): o teste "LinkedIn: InMail só para quem não é conexão" confere que chama `startChat`, ou seja, fixa o erro.
  - Testes rodados: `deno test --allow-all supabase/functions/_shared/send-chat-step.test.ts supabase/functions/_shared/send-chat-step-adapters.test.ts supabase/functions/sequence-runner/handler-chat.test.ts` → 52 passed, 0 failed; pgTAP `canais_whatsapp_linkedin.sql` ok no CI 37707955273.
  - Decisão do Nan antes (ligada ao Seam de Canal da revisão de 29/09): barrar o subtipo `inmail` no núcleo com um motivo próprio, sem migration, ou mandar a marca de InMail no `startChat` com o campo marcado "não confirmado".
  - Depois (humano): o mesmo roteiro do ticket 06, com `select private.set_chat_channel_enabled('linkedin', true);` e um perfil seu. Não usar passo de InMail antes da decisão acima.

- 2026-10-07, decisão do Renan: o InMail fica fora. O ticket fecha com convite e mensagem no LinkedIn.
  - Com isso, os critérios ficam assim: a identidade resolvida, a nova relação, o aceite e a nota que não contam como resposta, a pausa e os eventos repetidos já estavam cumpridos; o critério 2 vale para convite e mensagem e está cumprido (`supabase/functions/_shared/send-chat-step.ts:184-190,340-357`); o critério 3 está cumprido no backend, e a tradução dos motivos na tela foi para o C1 da `prospeccao-funcional`; o critério 7 tem o caminho permitido e os impedimentos de convite e mensagem cobertos em `send-chat-step.test.ts` ("LinkedIn: quem ainda não é conexão recebe um convite com a nota do passo", "LinkedIn: quem já é conexão recebe mensagem, mesmo num passo de convite", "LinkedIn: mensagem a quem não é conexão é impedimento, nada é enviado", "LinkedIn: sem crédito, assinatura ou elegibilidade o convite vira impedimento com o motivo"), dentro dos 52 testes verdes da rodada anterior.
  - Falta só o envio real, igual ao ticket 06, com `select private.set_chat_channel_enabled('linkedin', true);` e um perfil de teste: um convite com nota para quem não é conexão e uma mensagem para quem já é. Depois, conferir com `select channel, status, last_error, linkedin_action, provider_chat_id, sent_at from private.sequence_step_sends where channel = 'linkedin' order by updated_at desc limit 10;`.
  - Risco que fica: a tela ainda oferece "InMail" no passo de LinkedIn (`projeto-althius-frontend/src/paginas/detalhe-sequencia.tsx:2199`), e o núcleo manda esse passo como mensagem comum pelo `startChat` (`send-chat-step.ts:359-361`). Enquanto o InMail estiver fora, nenhum passo deve usá-lo. Tirar a opção da tela e o núcleo recusar `inmail` com um motivo próprio (sem migration) é um ajuste pequeno de agente, que não entrou na fila sem o sim do Renan.

- 2026-10-08: o Renan deu o sim ao ajuste do InMail. Virou o [ticket 13](13-tirar-inmail-da-tela-e-recusar-no-envio.md) (tirar a opção da tela e o envio recusar o passo de InMail com o motivo `linkedin_inmail_not_supported`), bloqueado pelo C1 da `prospeccao-funcional` e na fila do `/implement` logo depois dele. Este ticket continua só à espera do envio real de convite e mensagem; não depende do 13.

## Passos do Nan

1. Conectar a sua Conta remetente de LinkedIn pela Unipile (o mesmo fluxo do E-mail).
2. Recadastrar o Webhook Endpoint com o evento `message.new` rodando `bash scripts/wizard-unipile.sh` (só quando combinado com a frente de envio).
3. Ligar o canal, no SQL Editor do Supabase:
   ```sql
   select private.set_chat_channel_enabled('linkedin', true);
   ```
4. Fazer um envio de teste para um perfil seu e responder, para conferir que a resposta pausa a Sequência.

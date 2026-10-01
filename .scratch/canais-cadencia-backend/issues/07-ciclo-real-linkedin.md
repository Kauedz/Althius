# 07: Executar passos e receber respostas pelo LinkedIn

**What to build:** ampliar o executor para convite, mensagem e InMail pelo LinkedIn pessoal do responsável, respeitando relação, elegibilidade e capacidade da conta. Resposta real pausa a Conta-alvo; aceite de convite, eco da nota e evento de relação não são tratados como resposta.

**Blocked by:** 05: Executar a Sequência com o navegador fechado.

**Status:** ready-for-agent

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

## Passos do Nan

1. Conectar a sua Conta remetente de LinkedIn pela Unipile (o mesmo fluxo do E-mail).
2. Recadastrar o Webhook Endpoint com o evento `message.new` rodando `bash scripts/wizard-unipile.sh` (só quando combinado com a frente de envio).
3. Ligar o canal, no SQL Editor do Supabase:
   ```sql
   select private.set_chat_channel_enabled('linkedin', true);
   ```
4. Fazer um envio de teste para um perfil seu e responder, para conferir que a resposta pausa a Sequência.

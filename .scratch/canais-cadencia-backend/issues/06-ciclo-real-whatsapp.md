# 06: Executar passos e receber respostas pelo WhatsApp

**What to build:** ampliar o executor para enviar passos reais pelo WhatsApp pessoal do responsável e receber respostas no mesmo modelo de privacidade e pausa validado por E-mail. Mensagens próprias, conversas pessoais e eventos técnicos não podem ser confundidos com resposta comercial.

**Blocked by:** 05: Executar a Sequência com o navegador fechado.

**Status:** ready-for-agent

- [ ] O responsável envia um passo ao número real e normalizado do Contato usando apenas sua Conta remetente de WhatsApp.
- [ ] Uma conversa existente é reutilizada quando correlacionada com segurança; uma nova conversa é iniciada somente para o destinatário aprovado.
- [ ] O evento `message_received` distingue mensagem recebida do Contato, envio do próprio titular e envio feito pela API.
- [ ] Conversa pessoal ou sem correlação com Contato participante não vira Interação compartilhada nem pausa a Sequência.
- [ ] Resposta comercial real pausa a Conta-alvo de forma idempotente e mantém o conteúdo restrito ao responsável.
- [ ] Timeout ou aceitação incerta não provoca reenvio cego nas rotas de chat.
- [ ] Reconexão deduplica o backlog relevante antes de permitir continuação da Sequência.

## Dependências externas

- WhatsApp do titular conectado e número real de teste indicado pelo usuário.


## Comments

- **2026-10-01, backend** (migration `20261001150000_canais_whatsapp_e_linkedin.sql`, aplicada): ativação, liberação e resultado dos passos de WhatsApp no mesmo Executor do E-mail; ingestão de `message.new` (eco, resposta do Contato pausa a Sequência de forma idempotente, conversa sem Contato participante ignorada, duplicado e fora de ordem). Núcleo em `supabase/functions/_shared/send-chat-step.ts` e adaptadores em `send-chat-step-adapters.ts`; pgTAP `canais_whatsapp_linkedin.sql` e testes deno com dublês.
- **Desligado por padrão:** `private.chat_channel_settings` nasce com WhatsApp desligado. Enquanto estiver assim, a ativação ignora os passos de WhatsApp e o Executor não os envia.
- **2026-10-01, tela:** os bloqueios novos da ativação e do envio aparecem em português (`src/fonte/motivos-do-envio.ts` e `supabase-sequencias.ts`).
- **Não confirmado** (contrato da Unipile v2 levantado por busca, sem acesso à documentação oficial): os nomes de campo marcados com `não confirmado:` em `send-chat-step-adapters.ts` e `ingest-chat-event.ts`, entre eles `users_ids` ou `user_ids` e o nome do evento de nova relação do LinkedIn. O primeiro envio real confirma.

## Passos do Nan

1. Conectar a sua Conta remetente de WhatsApp pela Unipile (o mesmo fluxo do E-mail).
2. Recadastrar o Webhook Endpoint com o evento `message.new` rodando `bash scripts/wizard-unipile.sh` (só quando combinado com a frente de envio).
3. Ligar o canal, no SQL Editor do Supabase:
   ```sql
   select private.set_chat_channel_enabled('whatsapp', true);
   ```
4. Fazer um envio de teste para um número seu e responder, para conferir que a resposta pausa a Sequência.

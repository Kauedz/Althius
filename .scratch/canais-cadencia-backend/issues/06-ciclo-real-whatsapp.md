# 06: Executar passos e receber respostas pelo WhatsApp

**What to build:** ampliar o executor para enviar passos reais pelo WhatsApp pessoal do responsável e receber respostas no mesmo modelo de privacidade e pausa validado por E-mail. Mensagens próprias, conversas pessoais e eventos técnicos não podem ser confundidos com resposta comercial.

**Blocked by:** 05: Executar a Sequência com o navegador fechado.

**Status:** ready-for-human (os sete critérios estão no código e nos testes com dublês; só o envio e a resposta reais pela Unipile confirmam os campos "não confirmado"; a tela de chat foi para o C1 da `prospeccao-funcional`)

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

- 2026-10-07 (reconciliação contra a `main` 59e53a6). Não é duplicado do C1 nem do C3: este ticket é o ciclo real; o C1 é a ativação pela tela e o C3, ver as respostas.
  - Critérios cumpridos no código, com teste:
    1. Número normalizado e só a conta do titular: Destino fixado na ativação (`20261002120000_anexos_dos_passos.sql:640`), liberação recusa canal desligado (`20261001150000_canais_whatsapp_e_linkedin.sql:948`), `_shared/send-chat-step.ts:166-169,298-306`; pgTAP "the WhatsApp Envio fixes the normalized phone as the Destino…"; Deno "WhatsApp: a primeira mensagem abre a conversa com o número do Destino…".
    2. Conversa reutilizada: `send-chat-step.ts:284-289,370-381`, `chat_conversation_for_send` (`20261001150000:1172`); Deno "WhatsApp: uma conversa já aberta com o Contato é reutilizada…".
    3. Contato, titular e API distinguidos: `20261001150000:1328-1365` (`is_sender`, `own_provider_id`); pgTAP "the message sent through the API coming back is an echo" e "what the owner wrote by hand in the app is an echo, not a reply". O critério fala em `message_received` (nome da v1); o código usa `message.new`.
    4. Conversa pessoal ignorada: pgTAP "a personal conversation with no tie to a Sequência is ignored".
    5. Resposta pausa, idempotente e privada: `20261001150000:1422-1444`; pgTAP "the reply pauses the whole Sequência", "repeated deliveries leave a single reply Interação", "another member cannot read the reply".
    6. Timeout sem reenvio cego: `send-chat-step.ts:260-274`; Deno "WhatsApp: timeout deixa o envio incerto, nunca falho"; pgTAP "an uncertain send is never released again".
    7. Reconexão confere o backlog: `chats_to_reconcile` (`20261001150000:1202`); Deno "a Conta de WhatsApp que voltou só é liberada depois de conferidos os chats dos Envios dela".
  - Testes rodados: `deno test --allow-all supabase/functions/_shared/send-chat-step.test.ts` (32 passed), `supabase/functions/_shared/send-chat-step-adapters.test.ts` (11), `supabase/functions/sequence-runner/handler-chat.test.ts` (9), `supabase/functions/unipile-account-status/handler.test.ts` (15), todos verdes; pgTAP `canais_whatsapp_linkedin.sql` (164) ok no CI 37707955273.
  - Riscos que o envio real confirma: os campos `users_ids`, `is_sender` e `sender_id` (`send-chat-step-adapters.ts:25-27`); uma resposta com remetente `@lid` vinda de outro chat não se correlaciona (`20261001150000:1379` só aceita `@s.whatsapp.net`).
  - Extra para agente, fora dos critérios: nenhum teste Deno cobre o roteamento de `message.new` do webhook para `ingestChatEvent` (`unipile-account-status/handler.ts:342-364`).
  - Passos do Nan, no PowerShell, na raiz, projeto `ycbdilsmydvzezhlymty`:
    1. Se a conta da Unipile trocou (o teste grátis vencia por volta de 03/10): `& "C:\Program Files\Git\bin\bash.exe" scripts/wizard-unipile.sh`, que já cadastra `message.new` (`scripts/wizard-unipile.sh:209`). Se é a mesma conta: no painel da Unipile, em Webhooks, acrescentar `message.new` ao webhook que já existe.
    2. `npx supabase functions deploy sequence-runner --project-ref ycbdilsmydvzezhlymty` e `npx supabase functions deploy unipile-account-status --no-verify-jwt --project-ref ycbdilsmydvzezhlymty`.
    3. Conectar o WhatsApp no app. No SQL Editor, conferir `select version, name from supabase_migrations.schema_migrations where version >= '20261001150000' order by version;` e `select * from private.chat_channel_settings;`, e ligar com `select private.set_chat_channel_enabled('whatsapp', true);`.
    4. Enviar para um número seu, responder e conferir: `select channel, status, last_error, provider_chat_id, sent_at from private.sequence_step_sends where channel = 'whatsapp' order by updated_at desc limit 10;` e `select event_type, outcome, provider_chat_id, received_at from private.unipile_chat_events order by received_at desc limit 20;`. Uma resposta real com `outcome = 'unrelated'` vira ticket de agente (`@lid` ou formato de campo).

## Passos do Nan

1. Conectar a sua Conta remetente de WhatsApp pela Unipile (o mesmo fluxo do E-mail).
2. Recadastrar o Webhook Endpoint com o evento `message.new` rodando `bash scripts/wizard-unipile.sh` (só quando combinado com a frente de envio).
3. Ligar o canal, no SQL Editor do Supabase:
   ```sql
   select private.set_chat_channel_enabled('whatsapp', true);
   ```
4. Fazer um envio de teste para um número seu e responder, para conferir que a resposta pausa a Sequência.

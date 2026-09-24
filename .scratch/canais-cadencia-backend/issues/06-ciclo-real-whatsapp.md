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


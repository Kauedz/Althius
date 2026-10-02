# C3: O titular vê as respostas de WhatsApp e LinkedIn

**What to build:** o titular da Sequência vê, no detalhe dela, as respostas de WhatsApp e de LinkedIn que já foram gravadas, no mesmo lugar em que vê as respostas de e-mail. Outro participante do Workspace não vê o texto. A resposta continua privativa de quem é o responsável pela Sequência.

**Blocked by:** C1. Os dois editam `detalhe-sequencia.tsx`. O merge na `main` espera o 00.

**Status:** ready-for-agent

- [ ] A Fonte de Sequências do Workspace operacional lê `list_received_chat_messages` para o titular e junta essas respostas às de e-mail que `list_received_emails` já devolve. Hoje `respostasRecebidas` só chama a de e-mail, e a função de chat não tem consumidor na tela.
- [ ] Cada resposta de chat mostra canal, texto, quem enviou e quando. O titular distingue WhatsApp de LinkedIn.
- [ ] Quem não é o titular não recebe o texto. A função já recusa quem não é o responsável pela Sequência; a tela não contorna isso com outro caminho.
- [ ] A Demonstração não passa a mostrar essas respostas como se fossem reais.
- [ ] Vitest cobre: o titular vê uma resposta de WhatsApp e uma de LinkedIn; outro participante não vê o corpo; a resposta de e-mail continua aparecendo.
- [ ] Conferência visual no navegador, desktop e 360px, no detalhe da Sequência do titular, com as duas respostas de chat e a de e-mail juntas.

## Pode mexer

- `projeto-althius-frontend/src/fonte/supabase-sequencias.ts` (`respostasRecebidas`)
- `projeto-althius-frontend/src/fonte/supabase-sequencias.test.ts`, só no que esse método passa a ler
- `projeto-althius-frontend/src/fonte/sequencias-tipos.ts`, se a resposta de chat precisar do canal no tipo que a tela já usa
- O bloco de respostas em `projeto-althius-frontend/src/paginas/detalhe-sequencia.tsx`, partindo do que o C1 deixou
- Teste de tela novo desse bloco

## Não mexa

- O diálogo de ativar como o C1 o deixar, além do necessário para as respostas continuarem visíveis depois de ativar.
- Proposta de resposta. Continua só para e-mail. Não crie proposta para WhatsApp nem LinkedIn.
- InMail, seam de Canal, a ingestão de `message.new` e a correlação `@lid`.
- `list_received_chat_messages`. Ela já devolve canal, corpo, remetente e hora, e já limita ao titular. Não a redefina.
- Conexões, Stripe, sinais jurídicos.
- Ciclo real na Unipile. O teste usa resposta já gravada, não um webhook ao vivo.

## Migration

Nenhuma.

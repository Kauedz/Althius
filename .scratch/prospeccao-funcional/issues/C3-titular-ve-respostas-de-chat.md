# C3: O titular vê as respostas de WhatsApp e LinkedIn

**What to build:** o titular da Sequência vê, no detalhe dela, as respostas de WhatsApp e de LinkedIn que já foram gravadas, no mesmo lugar em que vê as respostas de e-mail. Outro participante do Workspace não vê o texto. A resposta continua privativa de quem é o responsável pela Sequência.

**Blocked by:** C1. Os dois editam `detalhe-sequencia.tsx`. O merge na `main` espera o 00.

**Status:** closed (na `main` pelo PR #151, commit `ba61a073`. Não sobra passo humano de migration nem de deploy.)

- [x] A Fonte de Sequências do Workspace operacional lê `list_received_chat_messages` para o titular e junta essas respostas às de e-mail que `list_received_emails` já devolve. Hoje `respostasRecebidas` só chama a de e-mail, e a função de chat não tem consumidor na tela.
- [x] Cada resposta de chat mostra canal, texto, quem enviou e quando. O titular distingue WhatsApp de LinkedIn.
- [x] Quem não é o titular não recebe o texto. A função já recusa quem não é o responsável pela Sequência; a tela não contorna isso com outro caminho.
- [x] A Demonstração não passa a mostrar essas respostas como se fossem reais.
- [x] Vitest cobre: o titular vê uma resposta de WhatsApp e uma de LinkedIn; outro participante não vê o corpo; a resposta de e-mail continua aparecendo.
- [x] Conferência visual no navegador, desktop e 360px, no detalhe da Sequência do titular, com as duas respostas de chat e a de e-mail juntas.

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

## Comments

- 2026-10-07 (reconciliação contra a `main` 59e53a6): os seis critérios estão em aberto. Não é duplicado dos canais 06 e 07: lá a resposta de chat só é guardada em privado (pgTAP "the owner reads the reply"); aqui ela aparece ao titular.
  - A Fonte não lê o chat: `respostasRecebidas` (`src/fonte/supabase-sequencias.ts:647-653`) só chama `list_received_emails`. Nenhum consumidor de `list_received_chat_messages` (`20261001150000_canais_whatsapp_e_linkedin.sql:1457-1490`) em `src/`.
  - O tipo `RespostaRecebida` (`src/fonte/sequencias-tipos.ts:276-286`) não tem canal, e o bloco `RespostasRecebidas` (`src/paginas/detalhe-sequencia.tsx:2090` em diante) mostra só e-mail e assunto.
  - Já valem e precisam ser mantidos: o backend recusa quem não é o titular com 42501 (`:1475-1478`) e a Fonte devolve `[]` antes de chamar (`supabase-sequencias.ts:649`); a Demonstração devolve `[]` (`src/fonte/simulada-sequencias.ts:256-259`).
  - Testes rodados (a base de e-mail, verde): `npx vitest run src/fonte/supabase-sequencias.test.ts` (19, entre eles "a Responsável lê as respostas recebidas…" e "quem não é o Responsável não recebe Envios nem respostas") e os 2 de respostas recebidas de `src/raiz.test.tsx` ("a resposta recebida aparece com o conteúdo só para a Vendedora responsável…" e "outro participante vê que o Contato respondeu… sem o conteúdo").
  - Nota: a resposta de chat traz só `attachments_count`; a tela diz que há anexo sem prometer download.
  - Conferência visual depois (agente, desktop e 360px): o bloco "Respostas recebidas" no detalhe da Sequência, com o titular (WhatsApp, LinkedIn e e-mail juntos) e com outro participante.

- 2026-10-08: feito na tela, sem migration e sem push. A Fonte do titular junta `list_received_chat_messages` a `list_received_emails`, da mais recente para a mais antiga. A tela mostra WhatsApp ou LinkedIn, o texto, quem enviou e quando. O anexo de chat só conta ("1 anexo" / "N anexos"), sem botão de baixar. Quem não é o titular continua recebendo lista vazia antes de qualquer chamada, e a tela não busca o corpo por outro caminho. Se a leitura do chat falha, o e-mail já lido continua na lista. A Demonstração segue devolvendo `[]`.
  - Vermelho: `npx vitest run src/fonte/supabase-sequencias.test.ts -t "lê a resposta de WhatsApp" --maxWorkers=2` — a Fonte devolvia só o e-mail.
  - Verde focado, depois da revisão: `npx vitest run src/paginas/respostas-de-chat.test.tsx src/fonte/supabase-sequencias.test.ts --maxWorkers=2` — 2 arquivos, 24 testes (tela 3, fonte 21).
  - `npx tsc -b --pretty false` em `projeto-althius-frontend`, exit 0.
  - Suíte que fecha o ticket: `npx vitest run --maxWorkers=2` em `projeto-althius-frontend`, exit 0, 110 arquivos e 1090 testes. pgTAP não se aplica: este ticket não muda SQL.
  - Duas rodadas anteriores da mesma suíte perderam testes de outras telas por carga da máquina (timeout de 20s; o documento da Demonstração ainda em Carregando). Esses testes passam sozinhos e não fazem parte deste ticket.
  - Revisão: Padrões sem problema aberto. Spec: uma falha qualquer do chat não pode esconder o e-mail nem buscar o texto por outro caminho; isso ficou coberto pelo teste da recusa 42501. Sem problema aberto.
  - Conferência visual do titular: `issues/prints/c3-titular-desktop.jpg`, `c3-titular-pagina.jpg` e `c3-titular-360.jpg` (WhatsApp, LinkedIn e e-mail juntos; no 360 o bloco ocupa a coluna e o texto quebra). Outro participante: `c3-outro-participante.jpg` e `c3-outro-participante-360.jpg` (resumo público, sem o texto).
- 2026-10-28 (fechamento da spec): `ralph/frente-canais` entrou na `main` via `ralph/consolidado` (PR #151). Status atualizado.

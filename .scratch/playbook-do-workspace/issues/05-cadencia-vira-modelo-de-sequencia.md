# 05: A Cadência do Playbook vira o modelo de Sequência

**What to build:** a seção Cadência (dia, canal, objetivo e template de cada toque) vira o modelo oferecido ao criar uma Sequência; o Rhetor personaliza cada toque pelo Sinal da Conta e pela Persona do Contato, usando Templates e Objeções.

**Blocked by:** 01: Seções do Playbook no banco; `agentes-em-conversa` 03 (contexto do Playbook nos Agentes).

**Status:** closed (os três critérios estão cumpridos; o Rhetor personalizar cada toque fica para um ticket novo, bloqueado pelo B2 da `prospeccao-funcional`)

## Pode mexer

- A criação de Sequência no frontend (oferecer o modelo) e a leitura da seção Cadência.
- O pedido ao Rhetor para personalizar os toques, pelo contrato de Execução existente.

## Não mexa

- Nas funções de Sequência e de envio (`confirm_sequence_step`, `activate_sequence`, `private.release_step_send`) sem partir da definição da migration 20260929170000.
- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [x] Criar Sequência oferece o modelo do Playbook; sem Cadência no Playbook, segue como hoje.
- [x] Toques de WhatsApp e LinkedIn ficam marcados "depende do canal" enquanto canais-06/07 não estiverem na `main`.
- [x] Nenhum envio sai sem a confirmação de passo que já existe (ADR-0014).

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

## Comments

- Em "Nova sequência", se a seção Cadência do Playbook tem linhas, aparece "Usar a Cadência do Playbook como modelo (N toques)", marcada por padrão, com a lista dos toques. Desmarcar cria a Sequência vazia, como antes. Sem Playbook ou sem Cadência, nada muda.
- Cada linha (toque, canal, dia, objetivo) vira um passo; o Template de mesmo nome (seção Templates) dá assunto e corpo. O espaço entre passos é a diferença de dias da Cadência; todos nascem no primeiro Contato selecionado; o e-mail nasce em modo manual.
- Só E-mail, LinkedIn e WhatsApp viram passo. Os outros canais (ligação, SMS...) ficam de fora, listados na própria tela.
- LinkedIn e WhatsApp aparecem com "depende do canal" enquanto o ciclo real deles (canais 06 e 07) não entrar na `main`. Nada sai sem a confirmação de passo que já existe (ADR-0014): o modelo só cria os passos.
- Fica aberto: o Rhetor personalizar cada toque pelo Sinal da Conta e pela Persona do Contato. Pede uma Execução própria e a Persona do Contato, que ainda não existe.

- 2026-10-07 (reconciliação contra a `main` 59e53a6):
  - O modelo do Playbook na Nova sequência: `src/paginas/nova-sequencia.tsx:64-78,150,261-286`, `src/fonte/modelo-de-cadencia.ts:40-67`; testes "oferece o modelo com os toques, marca o que depende do canal e cria a Sequência já com os passos", "desmarcar o modelo cria a Sequência vazia, como antes", "sem linhas na Cadência, não há modelo".
  - "depende do canal" em WhatsApp e LinkedIn: `modelo-de-cadencia.ts:17-18,63`, `nova-sequencia.tsx:278`; teste "vira toques só nos canais suportados, lista os que ficam de fora e marca WhatsApp e LinkedIn como dependentes do canal". Os canais 06 e 07 seguem sem o envio real.
  - Nenhum envio sem a confirmação de passo: o modelo só põe os passos no documento (`modelo-de-cadencia.ts:69-83`, `criarSequencia` em `src/fonte/supabase-sequencias.ts:434-455`); Envios só nascem em `confirm_sequence_step` e `activate_sequence` (`20260929170000_varios_emails_e_telefones_por_contato.sql:469,609`).
  - Testes rodados: `npx vitest run src/fonte/modelo-de-cadencia.test.ts src/paginas/sequencias.test.tsx` → 5 + 20 passed.
  - Ticket novo a abrir: o Rhetor personaliza cada toque pelo Sinal da Conta e pela Persona do Contato. Depende do B2 (a Persona chegar ao Contato), de uma Execução própria do Rhetor sobre os passos (hoje `start_agent_run` só aceita pedido em texto livre, `20260929180000_conversas_dos_agentes.sql:154-245`) que grave no documento sem pular `confirm_sequence_step`, e da importação estruturada (playbook 03) para a Cadência importada gerar o modelo. No contexto vão só o nome da Persona e o Sinal da Conta (o agentes-em-conversa 03 proíbe dado pessoal de Contatos).
  - As "Decisões a confirmar" abaixo continuam com o Nan.

## Decisões a confirmar

- Casar o Template ao toque pelo nome igual é uma escolha minha; se a planilha usar outro critério, o casamento muda.
- Tocar `simulada-playbook.ts` (exemplo de Cadência e Templates na Demonstração) fica fora do "Pode mexer".

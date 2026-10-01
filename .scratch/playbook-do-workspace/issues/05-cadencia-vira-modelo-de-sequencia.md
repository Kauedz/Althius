# 05: A Cadência do Playbook vira o modelo de Sequência

**What to build:** a seção Cadência (dia, canal, objetivo e template de cada toque) vira o modelo oferecido ao criar uma Sequência; o Rhetor personaliza cada toque pelo Sinal da Conta e pela Persona do Contato, usando Templates e Objeções.

**Blocked by:** 01: Seções do Playbook no banco; `agentes-em-conversa` 03 (contexto do Playbook nos Agentes).

**Status:** ready-for-agent (modelo pronto; falta só o Rhetor personalizar cada toque, que fica para uma Execução própria)

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

## Decisões a confirmar

- Casar o Template ao toque pelo nome igual é uma escolha minha; se a planilha usar outro critério, o casamento muda.
- Tocar `simulada-playbook.ts` (exemplo de Cadência e Templates na Demonstração) fica fora do "Pode mexer".

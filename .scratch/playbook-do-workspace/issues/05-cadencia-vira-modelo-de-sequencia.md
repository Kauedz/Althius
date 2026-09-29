# 05: A Cadência do Playbook vira o modelo de Sequência

**What to build:** a seção Cadência (dia, canal, objetivo e template de cada toque) vira o modelo oferecido ao criar uma Sequência; o Rhetor personaliza cada toque pelo Sinal da Conta e pela Persona do Contato, usando Templates e Objeções.

**Blocked by:** 01: Seções do Playbook no banco; `agentes-em-conversa` 03 (contexto do Playbook nos Agentes).

**Status:** ready-for-agent

## Pode mexer

- A criação de Sequência no frontend (oferecer o modelo) e a leitura da seção Cadência.
- O pedido ao Rhetor para personalizar os toques, pelo contrato de Execução existente.

## Não mexa

- Nas funções de Sequência e de envio (`confirm_sequence_step`, `activate_sequence`, `private.release_step_send`) sem partir da definição da migration 20260929170000.
- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] Criar Sequência oferece o modelo do Playbook; sem Cadência no Playbook, segue como hoje.
- [ ] Toques de WhatsApp e LinkedIn ficam marcados "depende do canal" enquanto canais-06/07 não estiverem na `main`.
- [ ] Nenhum envio sai sem a confirmação de passo que já existe (ADR-0014).

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

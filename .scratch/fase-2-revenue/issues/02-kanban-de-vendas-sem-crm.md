# 02: Kanban de vendas para quem não tem CRM

**What to build:** para o Workspace sem CRM, um kanban simples com as fases do Closer que vêm da seção Pipeline do Playbook.

**Blocked by:** Primeiro cliente pagando e a prospecção rodando (decisão da sabatina, Q3 e Q45).

**Status:** needs-triage

## Pode mexer

- A definir na triagem.

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] Triagem com o Nan antes de qualquer código.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

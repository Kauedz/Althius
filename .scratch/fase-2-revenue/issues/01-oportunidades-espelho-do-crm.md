# 01: Oportunidades espelhadas do CRM

**What to build:** uma visão de Oportunidades que espelha o estágio do negócio no CRM do cliente e acrescenta a inteligência da Althius (transcrições, objeções, próximos passos, follow-up); a venda continua no CRM.

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

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Decidir quando a fase 2 começa.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

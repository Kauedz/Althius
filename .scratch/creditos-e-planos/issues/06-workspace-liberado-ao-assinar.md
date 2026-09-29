# 06: O Workspace real só é liberado ao assinar

**What to build:** sem assinatura ativa, a pessoa entra só na Demonstração; o Workspace operacional (pessoal ou da empresa) fica bloqueado com a tela de assinatura; o setup libera o Workspace da empresa.

**Blocked by:** 05: Planos e assentos; a escolha do meio de pagamento.

**Status:** needs-info (falta escolher o meio de pagamento)

## Pode mexer

- O fluxo de entrada (`auth/aplicativo.tsx`) e uma função que diz se o Workspace está ativo.

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] Sem assinatura: só Demonstração, com a chamada para assinar.
- [ ] Os Workspaces de hoje (pré-produção) continuam liberados por uma marca manual do Administrador da Althius.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Escolher o meio de pagamento (ex.: Stripe, Asaas, Pagar.me) e criar a conta; a chave fica só nos segredos do Supabase, digitada pelo Nan.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

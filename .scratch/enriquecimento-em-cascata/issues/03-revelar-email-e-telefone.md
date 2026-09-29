# 03: Revelar e-mail e telefone em cascata

**What to build:** para um Contato, a Althius tenta os fornecedores em ordem até achar o e-mail ou o telefone; cobra só quando acha (2 por e-mail, 5 por telefone) e grava o valor como e-mail ou telefone adicional pelo `set_contact_channels`.

**Blocked by:** 01: Fornecedores da cascata; `creditos-e-planos` 02.

**Status:** ready-for-agent

## Pode mexer

- A ação no Contato e a cascata.

## Não mexa

- Na regra de unicidade de `set_contact_channels` (migration 20260929170000).
- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] Não achou: nenhum crédito debitado.
- [ ] O valor achado respeita a unicidade entre Contatos.
- [ ] Ação em lote mostra o custo máximo antes de rodar.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Se o ticket criou migration: `git checkout main`, `git pull`, `npx supabase db push` (na raiz do repositório).
2. Publicar a Edge Function da cascata (`npx supabase functions deploy <nome> --project-ref ycbdilsmydvzezhlymty`).
3. Guardar os segredos dos fornecedores pagos, se houver, direto no PowerShell (`npx supabase secrets set <NOME>=... --project-ref ycbdilsmydvzezhlymty`), nunca no chat.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

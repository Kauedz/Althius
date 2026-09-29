# 02: Saldo e lançamentos de crédito do Workspace

**What to build:** cada Workspace tem um saldo de créditos e um extrato de lançamentos (entrada por plano ou pacote, saída por ação); uma função reserva e debita de forma idempotente, e o Administrador define um limite mensal por participante.

**Blocked by:** 01: Medir o custo real.

**Status:** ready-for-agent

## Pode mexer

- Migration aditiva: saldo, extrato, limites por participante, a tabela de preço em créditos por ação (provisória) e as funções `reserve_credits`, `settle_credits`, `release_credits` (serviço) e `get_credit_balance` (usuário).
- pgTAP novo.

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] Débito idempotente por chave de ação; reserva que não se confirma volta ao saldo.
- [ ] Enriquecimento só debita quando acha (a reserva é liberada quando não acha).
- [ ] Limite por participante respeitado; saldo nunca fica negativo.
- [ ] Tabela provisória da sabatina: 1 por Agente por rodada, 1 por Conta varrida, 1 por pessoa coletada, 2 por e-mail, 5 por telefone; chave de IA do cliente = 20% da Execução.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Aplicar a migration: `git checkout main`, `git pull`, `npx supabase db push` (na raiz do repositório).

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

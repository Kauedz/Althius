# 02: Saldo e lançamentos de crédito do Workspace

**What to build:** cada Workspace tem um saldo de créditos e um extrato de lançamentos (entrada por plano ou pacote, saída por ação); uma função reserva e debita de forma idempotente, e o Administrador define um limite mensal por participante.

**Blocked by:** 01: Medir o custo real.

**Status:** closed

## Pode mexer

- Migration aditiva: saldo, extrato, limites por participante, a tabela de preço em créditos por ação (provisória) e as funções `reserve_credits`, `settle_credits`, `release_credits` (serviço) e `get_credit_balance` (usuário).
- pgTAP novo.

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [x] Débito idempotente por chave de ação; reserva que não se confirma volta ao saldo.
- [x] Enriquecimento só debita quando acha (a reserva é liberada quando não acha).
- [x] Limite por participante respeitado; saldo nunca fica negativo.
- [x] Tabela provisória da sabatina: 1 por Agente por rodada, 1 por Conta varrida, 1 por pessoa coletada, 2 por e-mail, 5 por telefone; chave de IA do cliente = 20% da Execução.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Aplicar a migration: `git checkout main`, `git pull`, `npx supabase db push` (na raiz do repositório).

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

## Comments

- Serviço (só `service_role`): `grant_credits`, `reserve_credits(workspace, usuário, ação, chave, quantidade, chave_de_ia_do_cliente)`, `settle_credits(reserva, usado)` (0 usado libera), `release_credits`.
- Usuário: `get_credit_balance`, `list_credit_entries` (Admin vê tudo; Membro, entradas e as próprias ações), `set_member_credit_limit` (só Admin), `list_credit_action_prices`.
- Ações: `agent_round`, `account_scan`, `person_collected`, `email_revealed`, `phone_revealed`. Chave de IA do cliente só em `agent_round` (20%).
- Nenhum Workspace recebe crédito sozinho: a entrada por plano é do ticket 05.

- 2026-10-07 (reconciliação contra a `main` 59e53a6): os quatro critérios têm código e pgTAP verde (`saldo_e_lancamentos_de_credito.sql` ok no CI 37707955273).
  - Débito idempotente e reserva que volta: `reserve_credits` e `settle_credits` em `20260930160000_saldo_e_lancamentos_de_credito.sql:147-279`; a reserva presa é solta pela faxina (`20260930180000:742`, pg_cron em `:795`). Asserções "repetir a reserva não cria outra", "liquidar de novo não debita outra vez", "a ação que não rodou libera a reserva".
  - Só debita quando acha: `settle_credits(…, 0)` libera (`:246`). Asserções "não achou o telefone: não debita" e "e a reserva volta ao saldo".
  - Limite por participante, saldo nunca negativo: `:199-207`. Asserções "o Bruno (6 usados, limite 7) não passa do limite", "ajuste não deixa o saldo negativo" e "sem saldo disponível, não reserva".
  - Tabela provisória e 20% da chave de IA do cliente: `:14-29`. Asserções "os preços provisórios em créditos" e "5 rodadas com a chave do cliente custam 1".
  - Fora dos critérios e ainda sem dono: nenhuma tela chama `get_credit_balance`, `list_credit_entries` ou `set_member_credit_limit` (histórias 1 e 2 da spec). Pede um ticket novo de tela de saldo, extrato e limite por pessoa. E um Workspace novo continua sem crédito (`credits_per_seat` 0): ver o ticket 05.

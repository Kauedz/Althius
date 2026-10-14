# Spec: Workspace Equipe Althius com créditos ilimitados

**Status:** ready-for-human (código neste PR; a migração e o deploy ficam com o Nan)

**Frente:** créditos e Sinais. Guia geral: [`docs/visao-geral-da-plataforma.md`](../../docs/visao-geral-da-plataforma.md).
Decisão de créditos: [ADR-0019](../../docs/adr/0019-creditos-e-cobranca-por-usuario.md). O teto de US$ 20/mês está em
`.scratch/redesign-catalogo/`.

## Problema

Os fundadores usam a Althius para montar o produto. O saldo e o Teto de Sinais (o automático da varredura e o teto de
US$ 20/mês em `private.workspace_signal_budget`) param a Equipe no meio do trabalho. Não há tela de super admin para
liberar isso, e não vai haver: a exceção fica no código.

## Solução

Um Workspace da empresa **Equipe Althius**, criado pela migração de forma idempotente, com os quatro fundadores como
Administradores quando a Conta já existe. Nesse Workspace, `private.workspace_billing.unlimited_credits` é verdadeiro e
o teto mensal de Sinais fica nulo (isento). Os outros Workspaces continuam com saldo, limite por pessoa e teto de
US$ 20.

O uso continua registrado: a reserva e a liquidação gravam o extrato mesmo sem saldo.

## Decisões

- A coluna `unlimited_credits` nasce `false`. Só a migração liga a da Equipe. Não há RPC de super admin.
- `reserve_credits` pula a checagem de saldo e a de limite mensal por participante quando o Workspace é ilimitado. A
  Participação ativa continua obrigatória. A mesma chave continua devolvendo a mesma reserva.
- A cobrança do Workspace (`credits_enforced`) fica ligada na Equipe, para as rodadas de Agente passarem por
  `reserve_credits` e o uso aparecer no extrato. Sem saldo, o lançamento pode deixar o saldo numérico negativo: a tela
  mostra **Ilimitado**, não esse número.
- `workspace_signal_budget.monthly_cap_usd` passa a aceitar nulo. Nulo é sem teto. Sem linha, o Workspace segue com
  US$ 20. A Equipe fica com nulo.
- O Teto que deixa de bloquear a Equipe é o do Workspace: teto do automático de varredura (`acao:varredura`), teto
  diário da cascata e gasto do mês em dólar (`action_costs` de actor). O teto técnico de uma execução de cascata (o
  `cap_usd` do tipo) continua limitando cada chamada ao fornecedor, para um passo não pedir gasto sem fim.
- No ilimitado, o automático de varredura não exige teto aprovado nem para em "confirmar": não existe tela para
  configurar essa exceção.
- `get_credit_balance` ganha a coluna `unlimited`. A tela de Plano do Workspace operacional mostra "Ilimitado".
- A liberação manual da assinatura (`set_manual_release`) fica ligada, para o Workspace continuar aberto quando a
  cobrança global for ligada.
- Quem ainda não tem Conta no Auth não é inventado. A migração não escreve em `auth.users`. Quando a Conta existir, a
  função idempotente pode ser chamada de novo e o vínculo entra.

## Fora de escopo

- Tela de super admin.
- Conectores, segredos, deploy e aplicar a migração no projeto remoto.
- Apagar dado ou reescrever migração já aplicada.
- Tirar o teto técnico por execução de cascata (o que cabe numa chamada).

## Testes

- pgTAP novo: reserva sem saldo passa no ilimitado e falha no normal; limite por participante idem; o Teto de Sinais
  não bloqueia o ilimitado e bloqueia o normal; a Equipe nasce uma vez só, com `unlimited_credits` e teto nulo.
- Deno: o motor da cascata não aborta o ilimitado no teto da execução, e cada chamada continua limitada ao `cap_usd`
  do tipo; o signal-runner não para o ilimitado num desfecho de teto quando a reserva existe.
- Vitest: Plano operacional mostra "Ilimitado".

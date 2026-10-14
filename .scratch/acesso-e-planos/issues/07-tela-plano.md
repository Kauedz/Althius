# 07: Tela Plano com contrato

**What to build:** "Contrato ativo", faixa, saldo, limite mensal e uso do mês; sem checkout nem portal quando o modo é `contrato`.

**GATE:** não apagar o código do Stripe; layout de Configurações inalterado.

**Blocked by:** 01, 02.

**Status:** ready-for-human

## Pode mexer
- `supabase/migrations/20261016160000_resumo_do_contrato.sql`, `src/paginas/configuracoes/secao-plano.tsx`, `src/auth/assinatura.tsx`, `src/fonte/*contrato*`

## Critérios
- [x] Mostra Contrato ativo, faixa, saldo, limite mensal e uso do mês.
- [x] Contrato suspenso/encerrado: tela sem Stripe, com "Fale com a equipe Althius".

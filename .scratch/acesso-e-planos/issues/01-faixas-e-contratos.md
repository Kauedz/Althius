# 01: Faixas e contratos no banco

**What to build:** `private.contract_tiers` e `private.workspace_contracts`, com as três faixas, o contrato ativo da Equipe Althius e `workspace_access` liberando pelo contrato quando o modo é `contrato`.

**GATE:** só migração nova (versão maior que `20261015170000`), aditiva e idempotente, RLS ligado, sem `drop`/`delete`/`truncate` de dado, sem aplicar no remoto, sem tocar em `stripe-billing`/`stripe-webhook`.

**Blocked by:** nenhum.

**Status:** ready-for-human

## Pode mexer
- `supabase/migrations/20261016100000_faixas_e_contratos.sql`, `supabase/tests/acesso_e_planos.sql`
- `public.workspace_access`, `private.ensure_equipe_althius_workspace`

## Não mexa
- Stripe (Edge Functions, `apply_stripe_subscription`, `grant_seat_credits`). Migrações já escritas.

## Critérios
- [x] Faixas: Essencial 2/3.000/US$ 140, Profissional 3/4.500/US$ 195, Escala 5/6.000/US$ 280.
- [x] Contrato com `status`, `starts_at`, `billing_mode` (padrão `contrato`), `notes`, uma linha por Workspace.
- [x] `workspace_access` libera pelo contrato (`contrato`, `contrato_suspenso`, `contrato_encerrado`); `saas` e sem contrato seguem o caminho antigo.
- [x] A Equipe Althius tem contrato ativo (Escala) e continua ilimitada e sem Teto.
- [x] Os Workspaces de teste não ganham contrato.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan.**

1. Com o CI verde, aplicar as migrações deste PR no projeto `ycbdilsmydvzezhlymty`, **na ordem**, pelo `execute_sql` em bloco atômico (`docs/agents/migrations.md`). Não usar `apply_migration`. Conferir `md5(statements[1])` contra o `md5sum` de cada arquivo e os advisors.
2. Os Workspaces de teste ficam sem contrato (ações pagas recusadas). Quem decide depois é o Kauê.

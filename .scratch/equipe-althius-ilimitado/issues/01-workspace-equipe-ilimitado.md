# 01: Workspace Equipe Althius com créditos ilimitados

**What to build:** O Workspace da empresa Equipe Althius, criado pela migração de forma idempotente, com créditos ilimitados e sem Teto de Sinais. Os quatro fundadores entram como Administradores quando a Conta já existe. A reserva continua gravando o uso. A tela de Plano do Workspace operacional mostra "Ilimitado". Não há tela de super admin.

**GATE:** não editar conectores, Unipile, segredos, telas de catálogo de Sinais nem migração já aplicada. Sem `apply_migration`. Sem `execute_sql` que confirme. Sem deploy. Sem escrita em `auth.users`. Sem SQL destrutivo (sem drop de dado, sem apagar Workspace). A versão da migração é maior que `20261015160000`.

**Blocked by:** nenhum.

**Status:** ready-for-human

## Pode mexer

- `supabase/migrations/20261015170000_equipe_althius_ilimitado.sql`
- `supabase/tests/equipe_althius_ilimitado.sql`
- `public.reserve_credits`, `public.get_credit_balance`, `public.workspace_signal_monthly_cap`, `public.consume_automation_cap`, `public.begin_account_scan`, `public.begin_cascade_run`, `public.request_account_rescan`, `public.quote_reveal_contact`, `public.set_credits_enforced`, `private.enqueue_monthly_rescans`
- `supabase/functions/signal-runner` e o motor da cascata em `supabase/functions/_shared/cascata-de-sinais` (`motor.ts`, `db.ts`, `tipos.ts`)
- A tela de Plano e as telas que comparam saldo (`buscar-sinais-de-novo`, Descobertas, revelação de Contato), com a fonte de créditos
- Este diretório

## Não mexa

- Conectores e Unipile. Segredos. Auth settings. O projeto remoto `ycbdilsmydvzezhlymty`.
- Migrações já escritas. Telas do catálogo de Sinais.
- O teto técnico de uma chamada ao fornecedor (`cap_usd` do tipo de cascata, `maxTotalChargeUsd`).

## Critérios

- [x] A migração adiciona `unlimited_credits` (falso por padrão) e cria a Equipe Althius uma vez só, com a coluna verdadeira, teto de Sinais nulo e liberação manual.
- [x] Fundador que já existe no Auth vira Administrador; quem não existe não é inventado.
- [x] `reserve_credits` sem saldo passa no ilimitado e falha no normal; o limite mensal por participante idem; a liquidação grava o extrato.
- [x] O Teto (dólar do mês, automático da varredura, teto diário da cascata) não bloqueia o ilimitado e bloqueia o normal.
- [x] `get_credit_balance` e o Plano operacional mostram "Ilimitado".
- [x] pgTAP novo cobre reserva e Teto. Teste que lista tabelas de um Workspace novo só muda se a migração passar a criar linha em toda criação (não cria).

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan.**

1. Com o CI verde, aplicar no projeto `ycbdilsmydvzezhlymty` pelo `execute_sql`, em bloco atômico, como em `docs/agents/migrations.md`. Não usar `apply_migration`. Conferir que `md5(statements[1])` é o `md5sum` do arquivo e que os advisors não ganharam aviso novo.

   - `supabase/migrations/20261015170000_equipe_althius_ilimitado.sql`

2. Só depois da migração aplicada, publicar as funções que leem `workspace_credits_unlimited`. Sem `--no-verify-jwt`:

```powershell
npx supabase functions deploy signal-runner signal-cascade --project-ref ycbdilsmydvzezhlymty
```

3. As Contas dos fundadores já existem no Auth. A migração não cria Conta. Se uma delas for criada depois, rodar de novo, no SQL Editor, `select private.ensure_equipe_althius_workspace();`. Não cadastrar segredo. Não marcar cascata como disponível.

## Comments

- A migração não foi aplicada no remoto a partir daqui. O job Banco do CI executa `supabase/tests/equipe_althius_ilimitado.sql`.

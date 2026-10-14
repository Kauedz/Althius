# 05: Entrada fechada (sem Workspace pessoal novo, sem criar Workspace, sem cadastro aberto)

**What to build:** `bootstrap_personal_workspace` só grava o aceite; `create_company_workspace` sai de `authenticated`; o botão e o cadastro aberto saem da tela.

**GATE:** não apagar Workspace pessoal nem Participação. Quem é convidado continua entrando pelo link do convite.

**Blocked by:** 01.

**Status:** ready-for-human

## Pode mexer
- `supabase/migrations/20261016140000_entrada_fechada.sql`, `supabase/tests/workspace_pessoal.sql`, `supabase/tests/workspace_da_empresa.sql`
- `src/auth/*`

## Critérios
- [x] Login novo não cria Workspace; os pessoais que existem continuam.
- [x] Sem o link "Criar conta" no login; `/cadastro` sem convite leva à entrada; o cadastro pelo convite funciona.
- [x] Sem botão "Criar Workspace da empresa" nem o componente.

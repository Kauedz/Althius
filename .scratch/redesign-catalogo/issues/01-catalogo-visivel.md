# 01: Catálogo visível no banco

**Status:** ready-for-agent

**GATE:** nenhum bloqueio de outro ticket. Sem aplicar migração no projeto remoto. Sem `delete`, `drop` ou reescrita de dado existente. A migração nova tem timestamp maior que `20261015120000`. `private.signal_catalog` (registro técnico) não muda de contrato. A Automação não é ligada.

## O que construir

- `public.signal_niches`, `public.signal_catalog` (`workspace_id` nulo = global) e `public.signal_catalog_niches`.
- RLS: autenticado lê o global e o do próprio Workspace; só a equipe Althius (`private.althius_staff` + `private.is_althius_staff()`) insere ou atualiza card de Workspace.
- RPC `list_visible_signal_catalog(p_workspace_id)` para membro ativo. Sem nome de fornecedor.
- `private.workspace_signal_budget.monthly_cap_usd` default **20**, preenchido nos Workspaces que já existem e nos novos. Não mexe em `automation_settings`.

## Pode mexer

- Uma migração nova e o pgTAP dela.
- `docs/sinais-arquivados.md` só se o texto do teto precisar apontar para cá.

## Não mexa

- Funções já publicadas (`list_signal_catalog`, `list_cascade_catalog`, `save_signal_monitor`).
- Segredos, deploy, `apply_migration` / `execute_sql` no remoto.

## Critérios

- [ ] pgTAP: anon não lê; membro lê os globais e os do seu Workspace e não os de outro; staff grava card com `workspace_id`; o default do teto é 20; nenhum texto cita fornecedor.
- [ ] Nenhum teste pgTAP antigo foi editado.

## Passos do Nan

1. Com o CI verde, aplicar `supabase/migrations/20261015130000_catalogo_visivel_de_sinais.sql` pelo bloco atômico de `docs/agents/migrations.md` (não usar `apply_migration`).
2. Conferir `md5(statements[1])` com o `md5sum` do arquivo.
3. Não publicar a Edge Function neste ticket.

## Comments

Implementado nesta branch, sem aplicar no remoto. A migração `20261015130000_catalogo_visivel_de_sinais.sql` cria `public.signal_niches`, `public.signal_catalog` (workspace_id nulo = global), `public.signal_catalog_niches`, `private.althius_staff`, `private.is_althius_staff` e `private.workspace_signal_budget` (default 20, com backfill e gatilho no Workspace novo). A RPC `list_visible_signal_catalog` e `workspace_signal_monthly_cap` ficam para o membro ativo. pgTAP em `supabase/tests/catalogo_visivel_de_sinais.sql` (plan 14). O Docker local não estava disponível; o job Banco do CI é a conferência.

Passos do Nan, depois do CI verde: aplicar o arquivo pelo bloco atômico de `docs/agents/migrations.md` (não usar `apply_migration`) e conferir o md5. Não publicar Edge Function neste ticket.

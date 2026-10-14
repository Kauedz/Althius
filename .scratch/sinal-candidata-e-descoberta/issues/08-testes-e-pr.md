# 08: Testes, CI e PR

**What to build:** tudo verde e PR aberto sem merge.

**GATE:** só migração nova (versão maior que `20261017160000`), aditiva e idempotente, RLS por Workspace mantida; sem aplicar no remoto, sem deploy, sem segredo, sem SQL destrutivo de dado; nenhum conector ou integração (HubSpot, Pipedrive, Notion, Unipile, WhatsApp, LinkedIn, e-mail); textos da tela em pt-BR, sem letra de nicho A–H e sem emojis; nenhuma mudança de rota, menu ou layout.

**Blocked by:** 01 a 07.

**Status:** ready-for-human

## Critérios
- [x] pgTAP, Deno, `deno check`, lint, `tsc -b`, Vitest e build verdes; migrações reaplicam sem erro.
- [x] PR com migrações (versão e nome), Edge Functions alteradas, ordem de publicação, Passos do Kauê e decisões a confirmar.
- [x] Sem merge: o Kauê faz o merge, com merge commit.

## Passos do Nan

Aplicar as migrações do PR na ordem e publicar as Edge Functions listadas no corpo do PR (`docs/agents/migrations.md`).
Não usar `apply_migration`; conferir `md5(statements[1])` contra o `md5sum` do arquivo.

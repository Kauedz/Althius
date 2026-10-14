# 01: Crédito é a única moeda da UI

**What to build:** remover todo US$ de custo da UI do cliente (catalogo-visivel, pagina-do-tipo, vitrine) e trocar os rótulos do banco por preço em créditos.

**GATE:** só migração nova (versão maior que `20261016160000`), aditiva e idempotente, RLS por Workspace mantida; sem aplicar no remoto, sem deploy, sem segredo, sem SQL destrutivo de dado; nenhum conector ou integração; nenhum "US$" de custo na UI do cliente; sem emojis.

**Blocked by:** nenhum.

**Status:** ready-for-human

## Critérios
- [x] Conforme a spec (`../spec.md`).

## Passos do Nan
Aplicar as migrações do PR na ordem e publicar as Edge Functions listadas no corpo do PR.

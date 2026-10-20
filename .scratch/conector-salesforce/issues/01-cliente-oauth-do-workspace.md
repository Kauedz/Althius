# 01: cliente oauth do workspace

**What to build:** Implementar o ADR do cliente OAuth por Workspace: uma tabela privada com RLS, RPCs só do Administrador para cadastrar e trocar (segredo no Vault), e `cliente-oauth.ts` usando o cliente do Workspace quando o perfil pedir. pgTAP e testes Deno.

**Blocked by:** conector-google-ads/02 (ADR aprovado)

**Status:** needs-info

## Comments

**20/10/2026 (agente).** O ADR proposto é o [`0028`](../../../docs/adr/0028-cliente-oauth-do-workspace-para-apps-que-exigem-o-app-do-cliente.md). Este ticket continua parado até ele ser aprovado.

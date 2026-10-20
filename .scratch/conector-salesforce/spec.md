# Spec: Conector Salesforce

**Status:** needs-info (depende do ADR do cliente OAuth por Workspace)

**Frente:** Conexões funcionais. Fonte: [pesquisa de 19/10](../conexoes-funcionais/pesquisa-2026-10-19-crms.md). Substitui o ticket `conexoes-funcionais/15`.

## Problem Statement

- Uma URL compartilhada: `https://api.salesforce.com/platform/mcp/v1/<servidor>`. **Sem registro dinâmico.**
- O 401 vem sem `WWW-Authenticate`, então a descoberta vai direto ao `.well-known` com o caminho (a Althius já tenta). Escopos `mcp_api refresh_token`; revogação em `login.salesforce.com/services/oauth2/revoke`.
- **O admin de cada org cria um External Client App**, e o client id e o secret são da org do Cliente. Hoje o perfil lê o cliente de segredos globais, então o Salesforce precisa guardar um cliente OAuth **por Workspace**.
- O portal (org) se fixa pelo OrgId da resposta do token.

## Escolha desta spec

O Salesforce espera o ADR de [`conector-google-ads/02`](../conector-google-ads/issues/02-adr-cliente-oauth-por-workspace.md) (cliente OAuth por Workspace). Com o ADR aprovado:
- o Administrador cadastra o client id e o secret do External Client App, no Vault;
- o perfil usa o cliente do Workspace;
- o portal fica fixo pelo OrgId;
- `writes = true`.

## Tickets

01 (bloqueado pelo ADR) cliente OAuth do Workspace no backend e na tela · 02 perfil Salesforce, portal pelo OrgId e testes Deno · 03 cartão e prints · 04 (humano) org de teste com External Client App.

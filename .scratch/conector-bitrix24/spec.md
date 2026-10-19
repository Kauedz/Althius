# Spec: Conector Bitrix24 funcional

**Status:** ready-for-agent

**Frente:** Conexões funcionais. Fonte: [pesquisa de 19/10](../conexoes-funcionais/pesquisa-2026-10-19-crms.md). Substitui o ticket `conexoes-funcionais/18`. CRM: o envio ao CRM pelas ferramentas segue a ADR-0023.

## Problem Statement

O perfil em `conectores.ts` está certo. Ao vivo:
- registro dinâmico aberto em `https://mcp.bitrix24.com/oauth/register/mcp/`;
- escopos `auth profile`;
- só `client_secret_post`;
- sem revogação.

Faltam: o `resource` correto, que é `https://mcp.bitrix24.com` (sem `/mcp/`); a identidade do portal para fixá-lo no Workspace, que não está confirmada; e tirar dos passos humanos a criação manual de app OAuth. No portal, o admin precisa ligar **"Permitir conexão de IAs externas"**.

## Solution

1. O perfil manda o `resource` da descoberta, sem barra de caminho. Um teste trava isso.
2. O portal fica fixo (`portalFixo`/`pins_portal = true`, como um CRM). A identidade vem do domínio do portal na resposta do token ou de uma ferramenta de perfil, a confirmar no real. Sem portal identificado, a conexão é recusada (regra da ADR-0017).
3. `writes = true`, com a escrita sob Aprovação. Desconectar só apaga (`nao_suportado`).

## Tickets

01 resource, portal fixo (migration de `pins_portal` com pgTAP) e testes Deno · 02 cartão e prints · 03 (humano) portal de teste com "Permitir conexão de IAs externas" ligado e o portal confirmado.

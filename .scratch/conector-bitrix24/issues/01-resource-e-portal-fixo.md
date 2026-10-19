# 01: resource e portal fixo

**What to build:** Perfil do Bitrix24: `resource` da descoberta (`https://mcp.bitrix24.com`), `portalFixo: true` com a identificação do portal (resposta do token: `domain` ou `member_id`, a confirmar) e migration aditiva com `pins_portal = true` e pgTAP. Testes Deno: o portal diferente é recusado, e o sem portal também.

**Blocked by:** nenhum

**Status:** needs-info (portal fixo bloqueado: pgTAP antigo e identidade do portal não confirmada)

## Comments

**19/10/2026 (agente, conferência).**
- **`resource` resolvido sem código:** o metadado ao vivo (`/.well-known/oauth-protected-resource[/mcp/]`) devolve `resource: https://mcp.bitrix24.com`, e a Althius manda o `resource` da descoberta, não a URL do perfil.
- **Portal fixo parado por dois motivos:**
  1. o pgTAP antigo `catalogo_de_conectores.sql:65` fixa `bitrix24:oauth_mcp:false` (`pins_portal = false`), e o repositório proíbe alterar pgTAP antigo;
  2. a identidade do portal não está confirmada, e com `pins_portal = true` sem portal identificado **toda** conexão seria recusada (`integration portal unknown`).
- Recomendação: ligar o portal fixo só depois de o ticket 03 (portal real) mostrar de onde vem o domínio, junto com a decisão sobre o pgTAP antigo.

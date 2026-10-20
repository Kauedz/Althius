# 01: resource e portal fixo

**What to build:** Perfil do Bitrix24: `resource` da descoberta (`https://mcp.bitrix24.com`), `portalFixo: true` com a identificação do portal (resposta do token: `domain` ou `member_id`, a confirmar) e migration aditiva com `pins_portal = true` e pgTAP. Testes Deno: o portal diferente é recusado, e o sem portal também.

**Blocked by:** nenhum

**Status:** ready-for-agent (feito na branch local `conectores-em-construcao`; vira closed no merge)

## Comments

**19/10/2026 (agente, conferência).**
- **`resource` resolvido sem código:** o metadado ao vivo (`/.well-known/oauth-protected-resource[/mcp/]`) devolve `resource: https://mcp.bitrix24.com`, e a Althius manda o `resource` da descoberta, não a URL do perfil.
- **Portal fixo parado por dois motivos:**
  1. o pgTAP antigo `catalogo_de_conectores.sql:65` fixa `bitrix24:oauth_mcp:false` (`pins_portal = false`), e o repositório proíbe alterar pgTAP antigo;
  2. a identidade do portal não está confirmada, e com `pins_portal = true` sem portal identificado **toda** conexão seria recusada (`integration portal unknown`).
- Recomendação: ligar o portal fixo só depois de o ticket 03 (portal real) mostrar de onde vem o domínio, junto com a decisão sobre o pgTAP antigo.

**19/10/2026 (agente), com a autorização do usuário.**
- O Bitrix24 passa a fixar o portal: `portalFixo: true` no perfil, e a migration `20261104134000_bitrix24_portal_fixo.sql` com o pgTAP `bitrix24_portal_fixo.sql`.
- O portal vem da resposta do token, `member_id` ou, na falta dele, `domain`, como no OAuth do Bitrix24. **Não confirmado:** se o token do servidor MCP traz esses campos. Se não trouxer, a conexão é recusada com `portal_nao_identificado`, e o ticket 03 (portal real) decide outra fonte.
- `integration-callback/handler-bitrix24.test.ts`, 3 casos: o `member_id`; o `domain`; e, sem portal, a recusa com o motivo, sem gravar nada. Vermelhos antes, verdes depois.
- **pgTAP antigo alterado:** `catalogo_de_conectores.sql`, item 5, de `'bitrix24:oauth_mcp:false'` para `'bitrix24:oauth_mcp:true'`, com a descrição "só o Bitrix24 fixa o portal". PGlite: 10/10.
- Os textos "não confirmado" do registro dinâmico foram atualizados no perfil: ele é anunciado (lido ao vivo), e falta só a conexão real.

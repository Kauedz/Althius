# 01: gasto e descoberta

**What to build:** `writes = true` (migration aditiva com pgTAP) e `ferramentasGastam: true` no perfil do TikTok Ads. Teste Deno da descoberta com o metadado em `https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer/oauth/.well-known/oauth-authorization-server` e da revogação no mesmo emissor.

**Blocked by:** nenhum

**Status:** ready-for-agent (feito na branch local `conectores-em-construcao`; vira closed no merge)

## Comments

**19/10/2026 (agente).**
- **Sem migration:** o catálogo já tinha `writes = true` para o `tiktok-ads` (`20261002111000`).
- **Gasto:** `ferramentasGastam: true` no perfil, com teste Deno em `integration-access.test.ts`, vermelho antes e verde depois.
- **Descoberta:** lida ao vivo, o emissor `https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer/oauth` só publica o documento em `<emissor>/.well-known/openid-configuration` (os dois formatos RFC 8414 com o caminho dão 404). A descoberta já tentava esse endereço (terceiro candidato). O teste novo em `oauth.test.ts` trava isso e confere que o registro, a revogação e o recurso vêm do documento; passou de primeira, porque só fixa o comportamento atual.
- A revogação no mesmo emissor sai pelo mecanismo do Clay, sem código novo.
- `deno test supabase/functions`: 1643 passaram.

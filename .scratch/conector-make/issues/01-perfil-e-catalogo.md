# 01: perfil e catalogo

**What to build:** O Make no catálogo (Automação; migration aditiva com pgTAP) e o perfil com `https://mcp.make.com` (não `/mcp`), registro dinâmico e `ferramentasGastam: true`. Testes Deno: descoberta, registro e revogação.

**Blocked by:** nenhum

**Status:** ready-for-agent (feito na branch local `conectores-em-construcao`; vira closed no merge)

## Comments

**19/10/2026 (agente).**
- Perfil em `conectores.ts`: `https://mcp.make.com`, registro dinâmico, `ferramentasGastam: true` e `enviarRecurso`. Lido ao vivo: o emissor `https://www.make.com/mcp` tem o metadado em `/.well-known/oauth-authorization-server/mcp`, o primeiro candidato da descoberta.
- Testes: `integration-connect/handler-automacao.test.ts` (descoberta, registro como cliente confidencial com `client_secret_post` e consentimento com `resource=https://mcp.make.com/`) e `integration-access.test.ts` (gasto). Vermelhos antes, verdes depois.
- A revogação em `www.make.com/oauth/v2/revoke` sai pelo mecanismo do Clay (mesma origem do token).
- **Catálogo:** migration `20261104135000_conectores_de_automacao.sql` (Make e Zapier em "Automação", `writes = true`, `available = false`; perfis de conexão) com o pgTAP `conectores_de_automacao.sql` (3 asserções).
- **pgTAP antigo alterado (com a autorização do usuário):** `conexoes_catalogo_disponivel.sql:31`, a lista das Integrações ocultas, ganhou `'make'` e `'zapier'`, com a descrição citando a migration.
- **Deno antigo alterado:** `conectores.test.ts` (o mapa de endereços ganhou o Make) e `perfis.test.ts` (o `SEED_DO_BANCO` ganhou o Zapier). Os dois espelham os dados.
- **PGlite:** a suíte pgTAP inteira, com todas as migrations até `20261104135000`, deu 138 arquivos verdes.
- **Frontend:** `IntegracaoId` ganhou `make` e `zapier`, `CategoriaDeIntegracao` ganhou `Automação` (também em `CATEGORIAS`), e o nome entrou em `logos.tsx`. `tsc -b` limpo.

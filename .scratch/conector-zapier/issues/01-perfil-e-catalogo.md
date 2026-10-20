# 01: perfil e catalogo

**What to build:** O Zapier no catálogo (categoria Automação; migration aditiva com pgTAP) e o perfil com OAuth por registro dinâmico, mais o token de conexão como chave (cabeçalho `Authorization: Bearer` no MCP), `ferramentasGastam: true` e a conta pelo userinfo. Testes Deno dos dois caminhos.

**Blocked by:** nenhum

**Status:** ready-for-agent (feito na branch local `conectores-em-construcao`; vira closed no merge)

## Comments

**19/10/2026 (agente).**
- Perfil em `perfis.ts`, porque tem chave: OAuth por registro dinâmico (escopos `openid email`, conta pelo userinfo do Zapier) e o token de conexão como chave, mandado como `Authorization: Bearer` ao servidor MCP. `ferramentasGastam: true`, porque cada chamada gasta 2 tasks.
- Testes, vermelhos antes e verdes depois:
  - `integration-connect/handler-automacao.test.ts`: o token validado no MCP e guardado; o recusado não é guardado;
  - `integration-access.test.ts`: o Bearer em todas as chamadas, e o gasto.
- `integration-callback/handler-zapier.test.ts` (troca como cliente público e conta pelo userinfo) passou de primeira, porque foi escrito depois do perfil; ele trava o comportamento.
- **Catálogo:** migration `20261104135000_conectores_de_automacao.sql` (Make e Zapier em "Automação", `writes = true`, `available = false`; perfis de conexão) com o pgTAP `conectores_de_automacao.sql` (3 asserções).
- **pgTAP antigo alterado (com a autorização do usuário):** `conexoes_catalogo_disponivel.sql:31`, a lista das Integrações ocultas, ganhou `'make'` e `'zapier'`, com a descrição citando a migration.
- **Deno antigo alterado:** `conectores.test.ts` (o mapa de endereços ganhou o Make) e `perfis.test.ts` (o `SEED_DO_BANCO` ganhou o Zapier). Os dois espelham os dados.
- **PGlite:** a suíte pgTAP inteira, com todas as migrations até `20261104135000`, deu 138 arquivos verdes.
- **Frontend:** `IntegracaoId` ganhou `make` e `zapier`, `CategoriaDeIntegracao` ganhou `Automação` (também em `CATEGORIAS`), e o nome entrou em `logos.tsx`. `tsc -b` limpo.
- **Não confirmado:** se o Zapier aceita um cliente registrado fora da lista dele e se o token de conexão vale em `/api/v1/connect`. O ticket 03 decide, e o caminho que falhar sai de `kinds`.

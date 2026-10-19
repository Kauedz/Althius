# 02: A chave de API do Apollo pelo servidor MCP

**What to build:** `chaveDeApi.via = 'mcp'` com `mcp.chave = { cabecalho: 'X-Api-Key' }`, como no Lusha. A chave é validada listando as ferramentas do MCP, e o `rest: APOLLO_REST` sai do perfil. O diálogo da chave ganha o aviso da chave mestra.

**Blocked by:** nenhum.

**Status:** ready-for-agent (feito na branch local `conectores-em-construcao`; vira closed no merge)

- [ ] Teste Deno (`integration-connect`): a chave do Apollo é validada no MCP com `X-Api-Key`. O 401 ou 403 vira "chave recusada", e a chave nunca volta na resposta.
- [ ] Os testes REST do Apollo que ficarem órfãos saem junto com o `APOLLO_REST` (anotar quais aqui).
- [ ] Teste do app: o diálogo da chave do Apollo mostra o aviso da chave mestra.

## Pode mexer
- `supabase/functions/_shared/integracoes/perfis.ts` (Apollo e `APOLLO_REST`) e os testes do Apollo, `projeto-althius-frontend/src/paginas/conexoes.tsx` (texto do diálogo por Integração)

## Não mexa
- As ferramentas REST dos outros apps (HubSpot, Pipedrive, RD Station) e os stubs de `_shared/provedor-de-contatos.ts` (cascata da Althius, outro assunto).

## Comments

**19/10/2026 (agente).**
- A chave do Apollo passou a ir ao MCP (`chave: { cabecalho: 'X-Api-Key' }`, `chaveDeApi.via = 'mcp'`), e o `APOLLO_REST` saiu do perfil, com as 3 ferramentas REST da Althius: `search_people`, `enrich_organization` e `match_person`. Nenhum teste dependia delas, nem nenhum outro código (só `perfis.ts` as citava). Os stubs de `provedor-de-contatos.ts` não mudaram.
- Testes Deno novos, vermelhos antes e verdes depois:
  - `integration-connect/handler-apollo-chave.test.ts`: a chave validada só no MCP, guardada e nunca devolvida; a chave recusada vira `chave_recusada`, sem ser guardada;
  - `integration-access.test.ts`: a chave vai no `x-api-key` em todas as chamadas ao MCP.
- Diálogo da chave: `AVISO_DA_CHAVE` em `conexoes.tsx` troca o aviso genérico por "Use a chave mestra da sua própria conta do Apollo: chaves com escopo não funcionam no MCP." ([print](prints/03-dialogo-chave.jpg)).
- `deno test supabase/functions`: 1637 passaram.

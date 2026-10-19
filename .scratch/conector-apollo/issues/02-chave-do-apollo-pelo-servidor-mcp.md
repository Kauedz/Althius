# 02: A chave de API do Apollo pelo servidor MCP

**What to build:** `chaveDeApi.via = 'mcp'` com `mcp.chave = { cabecalho: 'X-Api-Key' }`, como no Lusha. A chave é validada listando as ferramentas do MCP, e o `rest: APOLLO_REST` sai do perfil. O diálogo da chave ganha o aviso da chave mestra.

**Blocked by:** nenhum.

**Status:** ready-for-agent

- [ ] Teste Deno (`integration-connect`): a chave do Apollo é validada no MCP com `X-Api-Key`. O 401 ou 403 vira "chave recusada", e a chave nunca volta na resposta.
- [ ] Os testes REST do Apollo que ficarem órfãos saem junto com o `APOLLO_REST` (anotar quais aqui).
- [ ] Teste do app: o diálogo da chave do Apollo mostra o aviso da chave mestra.

## Pode mexer
- `supabase/functions/_shared/integracoes/perfis.ts` (Apollo e `APOLLO_REST`) e os testes do Apollo, `projeto-althius-frontend/src/paginas/conexoes.tsx` (texto do diálogo por Integração)

## Não mexa
- As ferramentas REST dos outros apps (HubSpot, Pipedrive, RD Station) e os stubs de `_shared/provedor-de-contatos.ts` (cascata da Althius, outro assunto).

## Comments

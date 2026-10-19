# 12: Conectar o Acesso ao Lusha

**What to build:** o Lusha sai de "Em breve" e funciona como o Notion: o Administrador habilita, cada participante conecta a própria conta do Lusha pelo servidor MCP oficial (`https://mcp.lusha.com`), vê o Acesso conectado e as ferramentas do servidor, e desconecta. Mais uma Integração do catálogo funcionando no Workspace operacional, sem mudar a tela.

**Blocked by:** 08 (Conectar o Acesso ao Notion).

**Status:** ready-for-agent (hoje só chave de API; o servidor passou a publicar OAuth com registro dinâmico, ver Comments)

- [ ] Confirmar com fonte oficial como o servidor do Lusha registra um cliente OAuth de terceiros (registro dinâmico ou cliente pré-registrado) e registrar a resposta no `## Comments`. A documentação mostra chave de API e o blog oficial fala em OAuth: se o servidor não aceitar OAuth de um cliente de terceiros, o ticket para e volta para decisão de produto.
- [ ] O Lusha entra no catálogo do backend com o que foi confirmado; a tela não muda para recebê-lo.
- [ ] Conectar, reconectar e desconectar seguem as mesmas regras do HubSpot e do Notion.
- [ ] O cartão do Lusha não oferece Sincronização.
- [ ] Os testes do app cobrem o cartão do Lusha nos seus estados.
- [ ] Conferência visual no navegador, com prints no `## Comments` deste ticket. A conexão com uma conta real do Lusha fica registrada como pendência humana, se ninguém tiver conta para o teste.

**19/10/2026 (agente, conferência com o código e com o servidor).** No código, o Lusha conecta só por chave de API, no cabeçalho `x-api-key` do servidor MCP (`perfis.ts`, seed `kinds = {api_key}`). Os testes Deno e pgTAP desse caminho existem (`handler.test.ts`, "Lusha: a chave é validada…", e `acessos_as_integracoes.sql`).

O que o Lusha publica hoje (lido com `curl`):
- `https://mcp.lusha.com/.well-known/oauth-protected-resource` aponta o servidor de autorização `https://auth.lusha.com`.
- `https://auth.lusha.com` traz o registro dinâmico (`/oauth/register`), a revogação (`/oauth/revoke`), escopo `mcp` e PKCE S256. O cliente precisa ser confidencial: só `client_secret_post` ou `client_secret_basic`, sem `none`.
- `POST https://mcp.lusha.com` sem credencial responde 401 com `missing Authorization header`. Não sei se o `x-api-key` ainda vale, porque não testei sem uma chave.

**Isso resolve a dúvida do ticket.** O servidor aceita OAuth de cliente de terceiros, e pela ADR-0017 esse é o caminho principal. A chave de API fica como alternativa (ADR-0021).

Falta (código):
- perfil `oauth` com registro dinâmico;
- migration aditiva com `kinds = {oauth_mcp, api_key}`;
- testes do cartão com os dois caminhos;
- prints.

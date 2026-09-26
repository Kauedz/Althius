# Pesquisa: servidores MCP das Integrações

Ticket: [01](./issues/01-pesquisar-servidores-mcp-das-integracoes.md). Feita em 2026-09-26.

## Como a pesquisa foi feita

O proxy de rede do ambiente bloqueou a leitura direta das páginas oficiais (`developers.hubspot.com`, `developers.notion.com`, `mcp.hubspot.com` e `mcp.notion.com`). As afirmações abaixo vêm da busca na web restrita aos domínios oficiais de cada provedor, e cada uma cita a página oficial de onde veio. Tudo o que a busca não mostrou com clareza está marcado como **não confirmado**. Quem tiver acesso às páginas deve conferir os pontos não confirmados antes do ticket 03.

## Conclusão

1. **HubSpot conecta pelo MCP, com cliente pré-registrado.** O HubSpot não oferece registro dinâmico de cliente: a Althius cria um MCP Auth App (um "MCP connector") numa conta HubSpot e recebe client ID, client secret e as URLs de retorno. A conexão usa OAuth com PKCE e refresh token.
2. **A Sincronização lê pelo MCP, com a leitura isolada na Edge Function.** O servidor MCP do HubSpot é construído sobre a API de busca do CRM, que pagina até 200 registros por página, para em 10.000 resultados por consulta e filtra pela data de modificação. Não confirmamos os parâmetros exatos da ferramenta de busca do MCP nem se o token do MCP Auth App vale para a API REST. Por isso a leitura segue o ADR-0017: o ticket 04 lê pelo MCP, em janelas por data de modificação para não bater no teto de 10.000, e só a leitora da Edge Function muda se o MCP não servir. A função SQL de aplicação dos lotes, a tela e a Fonte de Conexões não dependem dessa escolha.
3. **Notion conecta pelo mecanismo genérico, com registro dinâmico.** O ticket 08 não precisa de app registrado no Notion.
4. **Apollo, Clay, Lusha e Meta Ads têm servidor MCP remoto oficial.** Cada um ganhou um ticket, bloqueado pelo 08, cujo primeiro critério confirma a forma de registrar o cliente OAuth.
5. **Google Ads não tem servidor remoto hospedado pelo Google.** O servidor oficial é código aberto para cada um hospedar. Ele continua "Em breve" até uma decisão de produto sobre a Althius hospedar esse servidor.

## HubSpot

| Ponto | O que a fonte oficial diz | Estado |
| --- | --- | --- |
| Servidor | Remoto em `https://mcp.hubspot.com`, disponível para todas as contas desde abril de 2026. Lê e escreve no CRM respeitando as permissões do usuário no HubSpot. [1][2] | confirmado |
| Registro do cliente | Em Development > MCP Auth Apps, cria-se um app, e o HubSpot gera um connector com client ID, client secret e URLs de retorno. [3][4] | confirmado |
| OAuth | PKCE obrigatório, com o `code_verifier` na troca pelo token. Usar o refresh token recebido e esperar que ele mude a cada renovação. [4] | confirmado |
| URL de retorno | A URL de retorno do cliente precisa ser igual a uma das cadastradas no connector; a primeira é a padrão. [4] | confirmado |
| Escopos | O app é de nível de usuário, com escopos de leitura dos objetos do CRM que se quer acessar. [4] | confirmado; a lista exata de escopos para Companies, Contacts e owners não foi confirmada |
| Ferramentas | Há `get_user_details`, que diz quais ferramentas e objetos a conta tem; a disponibilidade varia por assinatura, permissões e configuração. Companies e Contacts estão entre os objetos. [1][4] | confirmado; a lista completa de ferramentas e os parâmetros da busca **não confirmados** |
| Paginação | O servidor é construído sobre a API de busca do CRM: até 200 por página, 10.000 resultados no máximo por consulta, filtros por propriedade, inclusive a data de modificação. [1][5] | confirmado para a API de busca; que a ferramenta MCP expõe o cursor e o filtro **não confirmado** |
| Associações | O acesso a associações se limita aos mesmos objetos disponíveis. [1] | confirmado em termos gerais; como ler Contact↔Company pela ferramenta **não confirmado** |
| Owners | **não confirmado** que o servidor MCP devolva o e-mail do owner de uma Company. |
| Portal da conta | Para tokens OAuth do HubSpot, `GET /oauth/v1/access-tokens/{token}` devolve `hub_id` e o e-mail do usuário, e a troca pelo token já devolve `hub_id`. [6] | confirmado para OAuth do HubSpot; que valha para o token do MCP Auth App **não confirmado** |
| Token na API REST | **não confirmado** se o token do MCP Auth App autoriza chamadas à API REST. |
| Limite de instalações | Apps do MCP seguem os limites de distribuição dos demais apps: 25 instalações até serem listados no marketplace. [7] | confirmado; se conta por pessoa ou por portal **não confirmado** |

## Notion

| Ponto | O que a fonte oficial diz | Estado |
| --- | --- | --- |
| Servidor | Remoto em `https://mcp.notion.com/mcp`, com OAuth, respeitando as permissões de cada usuário no Notion. [8] | confirmado |
| Registro do cliente | Aceita registro dinâmico de cliente (RFC 7591). A descoberta segue o metadado do recurso protegido e o do servidor de autorização (RFC 8414). [9] | confirmado |
| Credenciais | Guardar o client ID e o client secret do registro dinâmico e reaproveitá-los: registrar de novo deixa órfãs as autorizações anteriores. [9] | confirmado |
| Renovação | Cada renovação troca o refresh token, e o novo precisa ser gravado junto com o access token antes da próxima chamada. O refresh token vence em 180 dias desde a autorização ou em 30 dias sem renovação. [9] | confirmado |
| Ferramentas | Busca no workspace e contexto de bancos de dados. [8] | lista completa **não confirmada** |

## Outras Integrações do catálogo

| Integração | O que a fonte oficial diz | Estado | Decisão |
| --- | --- | --- | --- |
| Apollo | Servidor oficial remoto em `https://mcp.apollo.io/mcp`, Streamable HTTP e OAuth 2.0, com acesso limitado ao usuário que autoriza. [10] | confirmado; registro do cliente **não confirmado** | ticket 10 |
| Clay | Servidor MCP oficial; uma plataforma pode se registrar como cliente OAuth e conectar ao servidor. [11] | confirmado; endereço e forma do registro **não confirmados** | ticket 11 |
| Lusha | Servidor oficial em `https://mcp.lusha.com`. A documentação mostra chave de API no cabeçalho, e o blog oficial diz que o MCP conecta por OAuth. [12][13] | servidor confirmado; OAuth para cliente de terceiros **não confirmado** | ticket 12 |
| Meta Ads | Servidor oficial remoto em `https://mcp.facebook.com/ads`, com conexão autenticada pela Meta a partir da conta de anúncios. [14][15] | servidor confirmado; OAuth para cliente de terceiros **não confirmado** | ticket 13 |
| Google Ads | Servidor MCP oficial de código aberto, para hospedar localmente ou na nuvem, com ferramentas só de leitura e relatório. [16][17] | confirmado; **não há** servidor hospedado pelo Google | continua "Em breve" |

## O que muda nos tickets

- **03:** usa o connector pré-registrado do HubSpot (client ID e secret como segredos desta frente), PKCE e renovação com troca do refresh token. O portal do Workspace sai de `hub_id`; se o token do MCP não servir para a consulta de metadados, sai de `get_user_details`. A implementação confere esse ponto com o que houver de documentação acessível e deixa a confirmação real para o 09.
- **04 a 06:** a leitora da Edge Function usa a busca do MCP em janelas pela data de modificação, para nunca passar de 10.000 resultados por consulta. Se a ferramenta não expuser cursor, filtro, associações ou o e-mail do owner, a leitora troca para um app OAuth separado, sem mudar mais nada.
- **08:** registro dinâmico, com as credenciais do registro guardadas e reaproveitadas, e a troca do refresh token a cada renovação.
- **09:** passa a confirmar, com um portal real, os pontos não confirmados do HubSpot.
- **Novos:** 10 Apollo, 11 Clay, 12 Lusha e 13 Meta Ads.

## Fontes

1. [HubSpot MCP Server](https://developers.hubspot.com/ai-tools/mcp)
2. [Remote HubSpot MCP server is now generally available](https://developers.hubspot.com/changelog/remote-hubspot-mcp-server-is-now-generally-available)
3. [Public Beta: Self-Service MCP Auth Apps for the HubSpot Remote MCP Server](https://developers.hubspot.com/changelog/public-beta-self-service-mcp-auth-apps-for-the-hubspot-remote-mcp-server)
4. [Integrate AI tools with the HubSpot MCP server](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/integrate-with-the-remote-hubspot-mcp-server)
5. [CRM Search API](https://developers.hubspot.com/docs/api-reference/latest/crm/search-the-crm)
6. [Get metadata for OAuth 2.0 access token](https://developers.hubspot.com/docs/api-reference/legacy/oauth-v1/get-oauth-v1-access-tokens-token)
7. [New Marketplace Distribution App Install Limits](https://developers.hubspot.com/changelog/new-marketplace-distribution-app-install-limits)
8. [Notion MCP](https://developers.notion.com/guides/mcp/overview)
9. [Build an MCP client for Notion](https://developers.notion.com/guides/mcp/build-mcp-client)
10. [Apollo MCP](https://docs.apollo.io/docs/apollo-mcp)
11. [MCP in Clay](https://university.clay.com/docs/mcp-settings)
12. [Lusha MCP Server](https://docs.lusha.com/mcp-docs)
13. [Your Lusha MCP questions answered](https://www.lusha.com/blog/your-lusha-mcp-questions-answered-webinar-recap/)
14. [Ads MCP Server, Meta for Developers](https://developers.facebook.com/documentation/ads-commerce/ads-ai-connectors/ads-mcp-server/ads-mcp-server-overview)
15. [Meta's ads MCP server is now available for developers](https://developers.facebook.com/blog/post/2026/07/16/meta-ads-mcp-server/)
16. [Google Ads MCP server: Developer integration guide](https://developers.google.com/google-ads/api/docs/developer-toolkit/mcp-server)
17. [googleads/google-ads-mcp](https://github.com/googleads/google-ads-mcp)

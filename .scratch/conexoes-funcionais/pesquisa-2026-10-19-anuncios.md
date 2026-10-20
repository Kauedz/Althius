# Pesquisa: conectores de anúncios (Google Ads, LinkedIn Ads, TikTok Ads, Meta Ads)

Feita em 2026-10-19. Atualiza a parte de anúncios da [pesquisa de 2026-10-02](./pesquisa-conectores-mcp-todos.md), que foi feita sem acesso direto aos metadados OAuth. Desta vez os servidores responderam: cada afirmação marcada como "ao vivo" vem de um `curl` feito hoje, e o resto vem da documentação oficial do fornecedor, com o link. O que nenhuma das duas fontes mostrou está marcado como **não confirmado**.

Regras da Althius que valem aqui: cliente MCP com OAuth por participante, com registro dinâmico (RFC 7591) quando houver e app pré-registrado quando não houver (ADR-0017); chave de API só quando não há MCP utilizável (ADR-0021); ferramentas que escrevem ou gastam passam por Aprovação (ADR-0022).

## Como foi conferido

Para cada URL candidata:

1. `POST <url-mcp>` com um `initialize` do MCP, sem token, para ler o `WWW-Authenticate` do 401.
2. `GET` no `resource_metadata` que o 401 aponta (RFC 9728).
3. `GET` no metadado do servidor de autorização (RFC 8414), nos dois formatos de caminho (`/.well-known/oauth-authorization-server/<caminho>` e `<issuer>/.well-known/oauth-authorization-server`).

Nenhum cliente foi registrado e nenhum token foi pedido: o `POST` no `registration_endpoint` criaria um cliente real no fornecedor.

## Resumo

| App | Servidor MCP remoto oficial | Registro do cliente | Revogação no metadado | Caminho para a Althius |
| --- | --- | --- | --- | --- |
| Meta Ads | sim, `https://mcp.facebook.com/ads` (ao vivo) | **dinâmico**, cliente público, PKCE S256 (ao vivo) | não anunciada | MCP OAuth (dinâmico) |
| TikTok Ads | sim, `.../open_mcp/tt-ads-mcp-layer` e `-flat` (ao vivo) | **dinâmico**, cliente público, PKCE S256, também Client ID Metadata Document (ao vivo) | sim, `.../oauth/revoke` (ao vivo) | MCP OAuth (dinâmico) |
| Google Ads | **não** para o público; só código aberto para hospedar e um piloto hospedado fechado | — | — | fica "Em breve" |
| LinkedIn Ads | **não** | — | — | fica "Em breve" (ou REST com app aprovado, mais tarde) |

O que muda em relação a 2026-10-02: a Meta **tem** registro dinâmico (a pesquisa anterior dizia app pré-registrado, e o comentário em `perfis.ts` repete isso); o TikTok **tem** registro dinâmico confirmado e endpoint de revogação; o Google passou a citar um piloto de endpoint hospedado, fechado a convidados, e a política do Google Ads proíbe expressamente servidor MCP de terceiros que reexponha a API.

## Meta Ads

| Ponto | O que foi visto | Estado |
| --- | --- | --- |
| (a) URL | `https://mcp.facebook.com/ads`. `POST` sem token devolve 401 com `resource_metadata="https://mcp.facebook.com/.well-known/oauth-protected-resource/ads"`. | confirmado ao vivo |
| (b) Registro | Metadado de `https://www.facebook.com/.well-known/oauth-authorization-server/ads`: `issuer` `https://www.facebook.com/ads`, `registration_endpoint` `https://mcp.facebook.com/.well-known/register/ads`, `token_endpoint_auth_methods_supported: ["none"]` (cliente público), `code_challenge_methods_supported: ["S256"]`, `grant_types` `authorization_code` e `refresh_token`. Autorização em `https://www.facebook.com/v26.0/dialog/oauth`, token em `https://graph.facebook.com/v26.0/oauth/access_token`. Nada contradiz o que já se sabia; contradiz só o comentário de "app pré-registrado" em `perfis.ts`. | confirmado ao vivo |
| (c) Escopos | O 401 e os dois metadados anunciam: `ads_management ads_read catalog_management business_management pages_show_list pages_manage_ads instagram_basic instagram_branded_content_ads_brand ads_mcp_management`. Leitura: `ads_read`, `pages_show_list`, `instagram_basic`. Escrita e gasto: `ads_management` (cria, edita e ativa campanhas, ou seja gasta), `catalog_management`, `business_management`, `pages_manage_ads`, `instagram_branded_content_ads_brand`. `ads_mcp_management`: o significado não está documentado nas páginas lidas. | lista confirmada ao vivo; se o servidor aceita só um subconjunto (por exemplo só `ads_read`) **não confirmado** |
| (d) Identidade | Graph API `GET /me` (usuário) e `GET /me/adaccounts` (contas de anúncio). Se o token emitido pelo MCP vale na Graph API: **não confirmado**. Alternativa: uma ferramenta de listagem de contas do próprio MCP, nome **não confirmado**. | **não confirmado** |
| (e) Ferramentas, limites | Sete grupos: relatórios, criação e gestão de anúncios, catálogos, sinais e datasets, ajuda, testes A/B e lift, logs de atividade [1][2]. Nomes exatos, limites de chamada e revisão do app (no registro dinâmico não há app nosso para revisar) **não confirmados**. | grupos confirmados |
| (f) Revogação | O metadado **não** tem `revocation_endpoint`. A Graph API documenta `DELETE /{user-id}/permissions` para tirar a autorização do app [3]; se vale para o cliente registrado no MCP, **não confirmado**. | **não confirmado** |

## TikTok Ads

| Ponto | O que foi visto | Estado |
| --- | --- | --- |
| (a) URL | Duas variantes: `https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer` (~40 ferramentas no início, as outras sob demanda) e `https://business-api.tiktok.com/open_mcp/tt-ads-mcp-flat` (~400 ferramentas de uma vez) [4][5]. `POST` sem token devolve 401 com `resource_metadata="https://business-api.tiktok.com/.well-known/oauth-protected-resource/open_mcp/tt-ads-mcp-layer"`. | confirmado ao vivo |
| (b) Registro | O recurso aponta para o servidor `https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer/oauth`. O metadado fica em `<issuer>/.well-known/oauth-authorization-server` (o formato RFC 8414 com o caminho no fim dá 404). Ele traz `registration_endpoint` `.../tt-ads-mcp-layer/oauth/register`, `client_id_metadata_document_supported: true`, `token_endpoint_auth_methods_supported: ["none"]` (cliente público), PKCE `S256`, autorização em `https://business-api.tiktok.com/portal/mcp-tt4b-authorize`, token em `.../oauth/token`. A variante `-flat` tem o mesmo desenho, com `.../tt-ads-mcp-flat/oauth/...`. Cada variante é um servidor de autorização separado: o cliente registrado numa não vale na outra (**não confirmado**, mas é o que os issuers distintos indicam). | confirmado ao vivo |
| (c) Escopos | Um único escopo, `mcp:tt4b`, nos dois metadados. Não há escopo só de leitura: a separação entre ler e gastar teria de vir da tela de consentimento do TikTok (que mostra as permissões [6]) ou das ferramentas. Quais permissões o consentimento concede **não confirmado**. | escopo confirmado ao vivo |
| (d) Identidade | O metadado tem `jwks_uri` e `id_token_signing_alg_values_supported` (RS256), o que sugere `id_token`; se ele vem na troca e o que traz **não confirmado**. Os anunciantes autorizados viriam de uma ferramenta do MCP (equivalente a `oauth2/advertiser/get` da Marketing API), nome **não confirmado**. | **não confirmado** |
| (e) Ferramentas, limites | ~400 ferramentas: gestão de campanhas, relatórios, catálogos, criativos, públicos, Business Center. Exemplos citados: criar campanha, relatório de desempenho, atualizar segmentação, pausar grupo de anúncios, ajustar orçamento e lance [5]. Aberto a todos, sem app de desenvolvedor nem pedido de permissão; varia por região e conta [4]. A autorização vale **30 dias**; depois o usuário autoriza de novo com a mesma conta [6]. Limites de chamada e custo **não confirmados**. | confirmado na documentação |
| (f) Revogação | `revocation_endpoint` `https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer/oauth/revoke` (e o equivalente `-flat`). | confirmado ao vivo |

Os 30 dias pesam: mesmo com `refresh_token` no metadado, a documentação diz que é preciso reautorizar [6]. O cartão deve mostrar "Precisa reconectar" sem tratar isso como erro.

## Google Ads

| Ponto | O que foi visto | Estado |
| --- | --- | --- |
| (a) URL | Não há servidor hospedado público. O servidor oficial é código aberto (`googleads/google-ads-mcp`), rodado em stdio ou hospedado pelo próprio interessado no Cloud Run [7][8]. O guia agora diz que "participantes na lista do piloto de endpoint hospedado" têm um guia de configuração hospedada [7]; o link desse guia (`.../developer-toolkit/mcp/setup`) dá 404 para quem não está no piloto. A lista de servidores MCP remotos do Google Cloud não tem nenhum produto de anúncios [9]. Tentativas ao vivo em `googleads.googleapis.com/mcp`, `/mcp/v1`, `googleadsmcp.googleapis.com/mcp[/v1]` e `adsmcp.googleapis.com/mcp[/v1]`: todas 404. | ausência pública confirmada; URL do piloto **não confirmada** |
| (b) Registro | No servidor de código aberto, quem hospeda cria um cliente OAuth "Web application" no próprio projeto do Google Cloud (`GOOGLE_ADS_MCP_OAUTH_CLIENT_ID` e `_SECRET`) [7]. Sem registro dinâmico: o metadado do Google (`accounts.google.com/.well-known/openid-configuration`) não tem `registration_endpoint` (ao vivo). | confirmado |
| (c) Escopos | Um só: `https://www.googleapis.com/auth/adwords` [7]. Ele dá leitura **e** escrita na API; não existe escopo só de leitura. O servidor MCP oficial é só de leitura ("não altera lances, não pausa campanhas") [7], então a limitação está nas ferramentas, não no token. | confirmado |
| (d) Identidade | `list_accessible_customers` (ferramenta) ou `customers:listAccessibleCustomers` (API) devolve as contas a que o usuário tem acesso; o e-mail viria de `openid email` no mesmo consentimento. Conta gerente: `login-customer-id` (`GOOGLE_ADS_LOGIN_CUSTOMER_ID`), opcional [7]. | confirmado na documentação |
| (e) Ferramentas, limites | Ferramentas: `list_accessible_customers`, `search` (GAQL), `get_resource_metadata` [7]. O developer token foi encerrado em 9 de setembro de 2026; o nível de acesso agora fica no projeto do Google Cloud dono do cliente OAuth: Explorer (2.880 operações/dia em produção), Basic (15.000/dia), Standard (sem teto); Explorer e Basic por pedido automático, Standard por revisão manual, com verificação de marca para Basic e Standard [10][11]. A verificação do app OAuth pelo Google para o escopo `adwords` antes de abrir a muitos usuários: **não confirmado**. | confirmado |
| (f) Revogação | `https://oauth2.googleapis.com/revoke` (no metadado do Google, ao vivo). | confirmado ao vivo |

**Política que bloqueia o caminho óbvio.** A política da API do Google Ads, em "Prohibited practices > Programmatic use", proíbe interface hospedada por terceiro, wrapper, **servidor MCP** ou proxy que só reexponha a API do Google Ads como camada intermediária ("programmatic proxy"). Ela exige que agências e anunciantes usem **o próprio projeto do Google Cloud** e o próprio acesso ao Google Ads, e isenta só código aberto que o usuário baixa e conecta com as próprias credenciais [12]. Hospedar o servidor de código aberto para todos os Workspaces seria exatamente o que a política proíbe. Se um agente da Althius que chama a API com o cliente OAuth da Althius conta como "proxy" ou como uso próprio do produto: **não confirmado**; pela letra da regra sobre o projeto próprio do Google Cloud, o risco é alto.

## LinkedIn Ads

| Ponto | O que foi visto | Estado |
| --- | --- | --- |
| (a) URL | Nenhum servidor MCP oficial em `learn.microsoft.com/linkedin`, `developer.linkedin.com` ou `linkedin.com`. `mcp.linkedin.com/mcp` e `api.linkedin.com/mcp` dão 404 (ao vivo). Os servidores que aparecem na busca são de terceiros (Markifact, PaidSync, Ryze, AdPlug e projetos comunitários) e não entram pela ADR-0017. O servidor MCP da Microsoft Advertising é outro produto (Bing). | ausência confirmada |
| (b) Registro | Alternativa oficial: a Marketing API (REST, `api.linkedin.com/rest`, versionada por mês) com app de desenvolvedor pré-registrado, vinculado a uma Company Page, e o produto Advertising API aprovado [13][14]. OAuth de 3 pernas: autorização `https://www.linkedin.com/oauth/v2/authorization`, token `https://www.linkedin.com/oauth/v2/accessToken` (metadado OIDC, ao vivo), sem registro dinâmico. Tokens de 60 dias, refresh programático de 1 ano [15]. | confirmado |
| (c) Escopos | Leitura: `r_ads` (contas de anúncio), `r_ads_reporting` (relatórios), `r_organization_admin`, `r_basicprofile`. Escrita e gasto: `rw_ads` (criar e editar campanhas; só em contas onde o membro é `ACCOUNT_BILLING_ADMIN`, `ACCOUNT_MANAGER`, `CAMPAIGN_MANAGER` ou `CREATIVE_MANAGER`), `rw_organization_admin`, `w_member_social`, `w_organization_social`, `rw_*_boost` (a partir da versão 202610) [14]. | confirmado |
| (d) Identidade | `openid profile email` dão `GET https://api.linkedin.com/v2/userinfo` (`sub`, nome, e-mail; metadado OIDC ao vivo); se esses escopos convivem com os de anúncios no mesmo app, **não confirmado**. As contas de anúncio e o papel do membro vêm de `adAccountUsers` com o finder `authenticatedUser` [14]; caminho exato na versão atual **não confirmado**. | parcial |
| (e) Ferramentas, limites | Não há ferramentas (não há MCP). Acesso em dois níveis: Development (leitura sem limite nas contas que o membro administra, edição em até 5 contas, 1 conta de teste) e Standard (edição sem limite), este pedido por chamado no Developer Support Portal, a critério do LinkedIn [14]. Prazo de aprovação: **não confirmado** na fonte oficial (fontes de terceiros falam em meses). A versão 202511 sai do ar em 16/11/2026 [14]. | confirmado |
| (f) Revogação | Documentado: introspecção (`/introspectToken`) e revogação pelo membro nas configurações de privacidade [15]. `POST https://www.linkedin.com/oauth/v2/revoke` existe (respondeu `invalid_access_token` a um token falso, ao vivo), mas não achei a página oficial que o documente. | **não confirmado** na documentação |

## Recomendação por conector

**Meta Ads: MCP OAuth com registro dinâmico.** O metadado confirma o cliente público com PKCE, então o perfil `meta-ads` já está certo em `registro: 'dinamico'` e não precisa de `META_ADS_MCP_CLIENT_SECRET`; o comentário de "app pré-registrado" e o item correspondente em `naoConfirmado` ficaram velhos. Escopos padrão (mínimo): `ads_read pages_show_list`. Escopos a mais (`ads_management`, `business_management`, `pages_manage_ads`, `catalog_management`, `ads_mcp_management`) só se a escrita for liberada, e toda ferramenta de criar, editar, ativar ou mudar orçamento passa por Aprovação (ADR-0022). A testar no primeiro consentimento real: se o servidor aceita só `ads_read`, de onde vem a conta (`/me` e `/me/adaccounts` com o token do MCP) e o que `ads_mcp_management` libera. Sem `revocation_endpoint`, desconectar apaga o token do lado da Althius e mostra o link para remover o app nas configurações do Facebook.

**TikTok Ads: MCP OAuth com registro dinâmico, na variante `tt-ads-mcp-layer`.** Ela carrega ~40 ferramentas em vez de ~400, o que cabe melhor no contexto do Agente e na lista de Permissões por ferramenta. Escopo: `mcp:tt4b`, o único que existe; o mínimo privilégio vem das ferramentas, com padrão de Permissão "Ler" e Aprovação obrigatória para tudo que cria, pausa, ativa ou muda orçamento, lance e público. Revogar em `.../tt-ads-mcp-layer/oauth/revoke` ao desconectar. Tratar a expiração de 30 dias como reconexão esperada. A testar: os nomes das ferramentas de leitura de anunciante e de relatório, para a identificação da conta.

**Google Ads: fica "Em breve".** Não há endpoint hospedado público, e a política proíbe servir a API por um servidor MCP ou proxy de terceiros, além de exigir o projeto do Google Cloud do próprio anunciante. Dois caminhos futuros, nesta ordem: (1) o endpoint hospedado do Google, quando sair do piloto; vale pedir entrada no piloto e ler o metadado OAuth dele; (2) um cliente OAuth no projeto do Google Cloud de cada Workspace (como a External Client App do Salesforce), o que cumpre a regra do projeto próprio, à custa de configuração pesada para o cliente. Escopo, nos dois casos: `https://www.googleapis.com/auth/adwords` (não há outro) mais `openid email`, com as ferramentas limitadas à leitura (`list_accessible_customers`, `search`, `get_resource_metadata`) até a escrita existir e passar por Aprovação.

**LinkedIn Ads: fica "Em breve".** Não há MCP oficial, e a ADR-0017 descarta servidores de terceiros. Caminho futuro, se o Nan quiser: REST pela Marketing API com o app OAuth da Althius aprovado no produto Advertising API, em Development no início (leitura sem limite; edição em até 5 contas basta para testes) e Standard só se a escrita for liberada. Isso pede uma decisão nova, porque nem a ADR-0017 (MCP) nem a ADR-0021 (chave de API) cobrem "REST via app OAuth". Escopos padrão (mínimo): `r_ads r_ads_reporting`, mais `openid profile email` para identificar a conta se o app permitir; `rw_ads` só com escrita liberada e Aprovação em cada ferramenta.

## Fontes

1. [Introducing Meta Ads AI Connectors](https://www.facebook.com/business/news/meta-ads-ai-connectors)
2. [Meta's ads MCP server is now available for developers](https://developers.facebook.com/blog/post/2026/07/16/meta-ads-mcp-server/)
3. [Graph API: User permissions (DELETE /{user-id}/permissions)](https://developers.facebook.com/docs/graph-api/reference/user/permissions/)
4. [TikTok for Business MCP Server](https://business-api.tiktok.com/portal/docs/tiktok-ads-mcp-server/v1.3)
5. [About TikTok for Business Agentic Hub and MCP Server](https://ads.tiktok.com/help/article/about-tiktok-for-business-agentic-hub-and-mcp-server?lang=en)
6. [How to connect a ready-made agent to TikTok for Business MCP Server](https://business-api.tiktok.com/portal/docs/how-to-connect-to-tiktok-for-business-mcp-server/v1.3)
7. [Google Ads MCP server: Developer integration guide](https://developers.google.com/google-ads/api/docs/developer-toolkit/mcp-server) (atualizada em 2026-10-16)
8. [googleads/google-ads-mcp](https://github.com/googleads/google-ads-mcp)
9. [Google Cloud MCP servers: Supported products](https://docs.cloud.google.com/mcp/supported-products)
10. [Google Ads API: Access levels and permissible use](https://developers.google.com/google-ads/api/docs/api-policy/access-levels)
11. [Google Ads API: Developer token](https://developers.google.com/google-ads/api/docs/api-policy/developer-token)
12. [Google Ads API policies (Prohibited practices > Programmatic use)](https://support.google.com/adspolicy/answer/6169371?hl=en)
13. [LinkedIn Advertising API](https://developer.linkedin.com/product-catalog/marketing/advertising-api)
14. [LinkedIn Marketing API: Increasing Access](https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access?view=li-lms-2026-10)
15. [LinkedIn: Refresh Tokens with OAuth 2.0](https://learn.microsoft.com/en-us/linkedin/shared/authentication/programmatic-refresh-tokens) e [Token Introspection](https://learn.microsoft.com/en-us/linkedin/shared/authentication/token-introspection)

Metadados lidos ao vivo em 2026-10-19:

- `https://mcp.facebook.com/.well-known/oauth-protected-resource/ads`
- `https://www.facebook.com/.well-known/oauth-authorization-server/ads`
- `https://business-api.tiktok.com/.well-known/oauth-protected-resource/open_mcp/tt-ads-mcp-layer` (e `-flat`)
- `https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer/oauth/.well-known/oauth-authorization-server` (e `-flat`)
- `https://accounts.google.com/.well-known/openid-configuration`
- `https://www.linkedin.com/oauth/.well-known/openid-configuration`

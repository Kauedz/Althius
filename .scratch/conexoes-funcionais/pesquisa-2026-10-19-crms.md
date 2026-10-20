# Pesquisa 2026-10-19: CRMs (Salesforce, Zoho CRM, RD Station CRM, Bitrix24, Kommo)

Revisão da [pesquisa de 2026-10-02](./pesquisa-conectores-mcp-todos.md), agora com o metadado OAuth lido ao vivo. Cada sonda abaixo foi feita com `curl` em 2026-10-19: `POST <url-mcp>` com `initialize` sem token (para ler o `401` e o `WWW-Authenticate`), depois `/.well-known/oauth-protected-resource[/caminho]` (RFC 9728) e `/.well-known/oauth-authorization-server[/caminho]` (RFC 8414). Nenhum cliente foi registrado nos `registration_endpoint` (só se leu a resposta a um corpo vazio ou inválido). Vale o modelo das ADRs 0017, 0021, 0022 e 0023: Acesso por participante, portal fixado por Workspace, escrita sob a regra da ferramenta.

## Resumo

| CRM | Servidor MCP oficial | Registro do cliente | Revogação | Caminho Althius |
| --- | --- | --- | --- | --- |
| Salesforce | `https://api.salesforce.com/platform/mcp/v1/<servidor>` (uma URL para todas as orgs) | **por org**: External Client App criado pelo admin de cada org; sem registro dinâmico | `https://login.salesforce.com/services/oauth2/revoke` | OAuth MCP com client id/secret **por Workspace** (não cabe no perfil atual) |
| Zoho CRM | servidores pré-prontos da Zoho, URL com hash, hoje só em `.zohomcp.in` | **dinâmico** (anunciado no metadado) | anunciado no metadado | OAuth MCP dinâmico, mas só serve a contas do datacenter Índia: "Em breve" para o Brasil |
| RD Station CRM | sim, URL gerada no catálogo `mcp.rdstationmentor.com` por conexão | **não confirmado** (sem metadado público) | **não confirmado** | manter a chave de API (perfil atual) |
| Bitrix24 | `https://mcp.bitrix24.com/mcp/` (uma URL) | **dinâmico, confirmado ao vivo** | não anunciada | OAuth MCP dinâmico (perfil atual está certo) |
| Kommo | **não existe** | — | — | chave (token de longa duração) via REST, só de administrador |

## Salesforce

**Sondas ao vivo.**

- `POST https://api.salesforce.com/platform/mcp/v1/platform/sobject-all` → `401`, corpo `{"errors":[{"message":"JWT Token is required"}]}`, **sem** cabeçalho `WWW-Authenticate`. O cliente não descobre o metadado pelo 401; tem de ir direto ao `.well-known`.
- `/.well-known/oauth-protected-resource/platform/mcp/v1/platform/sobject-all` → `resource` igual à URL do servidor, `authorization_servers: ["https://login.salesforce.com"]`, `scopes_supported: ["mcp_api","refresh_token"]`.
- `/.well-known/oauth-authorization-server` (em `api.salesforce.com`) → `authorization_endpoint` `https://login.salesforce.com/services/oauth2/authorize?prompt=select_account`, `token_endpoint` `.../services/oauth2/token`, PKCE `S256`, `client_secret_post`, **sem `registration_endpoint`**.
- `https://login.salesforce.com/.well-known/openid-configuration` anuncia `registration_endpoint` `.../services/oauth2/register` e `revocation_endpoint` `.../services/oauth2/revoke`. Um `POST` sem credencial no registro devolve `{"error":"invalid_client","error_description":"invalid client credentials"}`: é o registro dinâmico autenticado da plataforma de identidade, não um registro aberto para cliente MCP.

| Ponto | Achado | Estado |
| --- | --- | --- |
| (a) URL | `https://api.salesforce.com/platform/mcp/v1/<servidor>` (ex.: `platform/sobject-all`, `platform/sobject-reads`, `platform/sobject-mutations`); sandbox em `.../v1/sandbox/<servidor>`; servidores customizados em `.../v1/custom/<nome>`. A URL é a mesma para toda org; a org sai do token. GA em abril de 2026. [1][2] | confirmado (ao vivo e doc) |
| (b) Registro | A Salesforce diz que o registro dinâmico não é suportado: o admin de cada org cria um External Client App (ECA), com PKCE obrigatório e tokens JWT para usuários nomeados (sem JWT, o token opaco é recusado). Recomenda um ECA por cliente MCP. Pode levar até 30 min para ativar. [3][4][5] Um ECA da org da Althius, ou empacotado num pacote gerenciado, servir para outras orgs: **não confirmado**. | por org, confirmado |
| (c) Escopos | `mcp_api` e `refresh_token` (metadado do recurso); guias também pedem `offline_access` e mandam evitar `api`. [3][5] | confirmado |
| (d) Identidade | A resposta do token da Salesforce traz `id` (`https://login.salesforce.com/id/<OrgId 00D…>/<UserId 005…>`) e `instance_url`; o OrgId fixa o portal. Que o token do MCP também vale em `userinfo`: **não confirmado**. | padrão OAuth Salesforce; para MCP **não confirmado** |
| (e) Ferramentas, limites, custo | `sobject-all` lê, cria, atualiza, exclui, consulta e busca em qualquer objeto, sob as permissões do usuário (CRUD, FLS, sharing). [2] Cada chamada conta na cota diária de API da org (compartilhada pela empresa inteira). Edições Enterprise ou superior e Developer; fontes de terceiros falam em cobrança futura por Flex Credits: **não confirmado**. Não há revisão de app/AppExchange para o caminho por org. [6] | parcial |
| (f) Revogação | `POST https://login.salesforce.com/services/oauth2/revoke` (OIDC ao vivo). Sandbox: `test.salesforce.com`. | confirmado |
| (g) Alternativa por chave | Não há chave de API pessoal; a REST também exige OAuth (Connected App/ECA). Sem caminho por chave. | — |

**Recomendação.** Viável só como OAuth MCP com **credenciais por Workspace**: o Administrador do Workspace cria o ECA na org dele (callback = Edge Function `integration-callback` da Althius, escopos `mcp_api refresh_token offline_access`, PKCE, JWT para usuários nomeados) e cola consumer key/secret na Althius (Vault). O perfil atual (`segredos` como variáveis de ambiente globais) não comporta isso: é um ticket de mecanismo, não só de perfil. O portal é o OrgId da resposta do token. A descoberta tem de ir direto ao `.well-known` com caminho, pois o 401 não traz `resource_metadata`.
**Trabalho humano.** Por cliente: admin da org Salesforce cria e libera o ECA (perfis/permission sets) e ativa os servidores MCP. Para o Nan: uma Developer Edition para teste, com o ECA apontando para a callback de pré-produção.

## Zoho CRM

**Sondas ao vivo** (servidor publicado na própria doc da Zoho: `https://zoho-crm-data-insights-60065097786.zohomcp.in/mcp/d17dfe13292e0414a929516bb8f8e797/message`).

- `POST` sem token → `401`, `WWW-Authenticate: Bearer resource_metadata="https://zoho-crm-data-insights-60065097786.zohomcp.in/.well-known/oauth-protected-resource"`.
- `oauth-protected-resource` (na raiz do host, não no caminho) → `resource` = URL completa do servidor, `authorization_servers` = o próprio host, 22 escopos de leitura (`zohocrm.modules.contacts.read`, `zohocrm.coql.read`, … e `ZohoMCP.tool.execute`).
- `oauth-authorization-server` → `authorization_endpoint` `https://mcp.zoho.in/mcp-client/<hash>/<id>/oauth`, `token_endpoint`, **`registration_endpoint`** `https://mcp.zoho.in/baas/mcp/v1/oauth/<hash>/<id>/register`, **`revocation_endpoint`** `.../revoke`, `token_endpoint_auth_methods_supported: ["none","client_secret_post"]`, PKCE `S256`.
- O servidor `zoho-crm-data-operations-…` anuncia 83 escopos, entre eles `create`, `update` e `delete` de cada módulo.

| Ponto | Achado | Estado |
| --- | --- | --- |
| (a) URL | Quatro servidores pré-prontos, hospedados pela Zoho, com hash na URL: `zoho-crm-data-insights`, `zoho-crm-data-operations`, `zoho-crm-module-customization`, `zoho-crm-automation` (todos `-60065097786.zohomcp.in/mcp/<hash>/message`). As páginas de setup (Claude, Cursor, VS Code, Windsurf) só mostram URLs `.zohomcp.in`; a Zoho diz que o recurso chega "em breve" a todos os datacenters. [7][8][9] Contas brasileiras costumam estar no datacenter `.com`: URL equivalente **não confirmada**. Além disso, o console Zoho MCP permite montar servidores próprios por conta (`https://<nome>-<org>.zohomcp.com/mcp/<chave>/message`), com a chave na URL. [10] | `.in` confirmado; `.com` **não confirmado** |
| (b) Registro | **Dinâmico**, anunciado no metadado (inclui cliente público `none`). | confirmado ao vivo (registro não executado) |
| (c) Escopos | Lista completa no `scopes_supported` de cada servidor (acima). | confirmado |
| (d) Identidade | A sessão é presa a uma org: trocar de org exige desconectar e autenticar de novo. [11] Como ler o org id (ferramenta MCP ou REST `/crm/v8/org` com o token do MCP): **não confirmado**. | parcial |
| (e) Ferramentas, limites, custo | Data Insights (só leitura, COQL, esquemas), Data Operations (CRUD, em massa, relacionados), Module Customization, Automation. Chamadas MCP gastam créditos de API como a API comum. [7] Nomes exatos das ferramentas: **não confirmados** (vêm do `tools/list`). Sem revisão de app. | parcial |
| (f) Revogação | `revocation_endpoint` por servidor (`.../revoke`, `client_secret_post`). | confirmado ao vivo |
| (g) Alternativa por chave | A REST do Zoho CRM é só OAuth (app no API Console, por datacenter); não há chave pessoal. A "chave" do console Zoho MCP fica na URL e vale como senha: inadequada como Acesso por participante. | — |

**Recomendação.** O mecanismo genérico (descoberta pelo 401, registro dinâmico, PKCE, `resource`) já serve; o perfil poderia apontar para `zoho-crm-data-operations` (escreve) ou para os dois servidores (leitura e operações), o que hoje exigiria duas Integrações. Mas até a Zoho publicar os servidores no datacenter `.com`, o Zoho CRM fica **"Em breve"** com o motivo "servidor oficial ainda só no datacenter da Índia". Reconferir as páginas de setup antes de liberar.
**Trabalho humano.** Nenhum app a criar (registro dinâmico). O Nan precisa de uma conta Zoho CRM de teste e de confirmar em qual datacenter ela fica.

## RD Station CRM

**Sondas ao vivo.** `https://mcp.rdstationmentor.com/` (o "Catálogo MCP da RD Station") é um app web Next.js: `POST /`, `/mcp` e `/sse` devolvem `200` com HTML; todos os `.well-known` OAuth devolvem `404`. O pacote JavaScript da página não expõe o formato da URL do servidor. Nenhum endpoint MCP foi achado sem login.

| Ponto | Achado | Estado |
| --- | --- | --- |
| (a) URL | Servidor oficial único para Marketing, CRM e Conversas. O cliente entra no catálogo `https://mcp.rdstationmentor.com/` com a conta RD, gera a conexão e copia a URL segura. [12][13] Formato da URL: **não confirmado** (exige login). | servidor confirmado; URL **não confirmada** |
| (b) Registro | A página fala em "token de autenticação" gerado no catálogo e, na FAQ, em OAuth 2.0 com login da conta RD. [12][13] Se a URL gerada aceita registro dinâmico de terceiros: **não confirmado**. | **não confirmado** |
| (c) Escopos | — | **não confirmado** |
| (d) Identidade | — | **não confirmado** |
| (e) Ferramentas, limites, custo | Consultar funil e histórico; cadastrar contatos, mover negociações, acionar automações, com confirmação. Planos: CRM Basic, Pro e Advanced; Marketing Pro e Advanced. Sem preço próprio; só pt-BR. [12] | parcial |
| (f) Revogação | "Você revoga o acesso quando quiser" no catálogo. [12] Endpoint: **não confirmado**. A API de Marketing tem `POST https://api.rd.services/auth/revoke`, mas não é a do MCP. [14] | **não confirmado** |
| (g) Alternativa por chave | A API CRM v1 aceita o token da conta no parâmetro `token` (perfil `rd-station` atual). Existe também a API CRM v2 com OAuth por app na App Store da RD (client id/secret). [15] | v1 confirmado; v2 OAuth: detalhes **não confirmados** |

**Recomendação.** Manter o caminho atual por chave de API (ADR-0021). Abrir uma investigação com conta de teste: gerar a conexão no catálogo, sondar a URL gerada (401, `.well-known`) e ver se é OAuth com registro dinâmico (aí vira OAuth MCP como o Bitrix24) ou URL com segredo embutido (aí não serve como Acesso por participante sem colar a URL, o que equivale a uma chave). A API CRM v2 com OAuth fica como plano B, com app pré-registrado.
**Trabalho humano.** O Nan cria a conta de teste RD Station CRM, gera uma conexão no catálogo e passa à IA só o formato (host e caminho, sem o segredo). Para a v2: criar o app na App Store da RD.

## Bitrix24

**Sondas ao vivo.**

- `POST https://mcp.bitrix24.com/mcp/` → `401`, `WWW-Authenticate: Bearer error="invalid_token", resource_metadata="https://mcp.bitrix24.com/.well-known/oauth-protected-resource"`.
- `oauth-protected-resource` (raiz e `/mcp`) → `{"resource":"https://mcp.bitrix24.com","authorization_servers":["https://mcp.bitrix24.com"]}`. Atenção: `resource` **sem** o caminho `/mcp/`.
- `oauth-authorization-server` (igual a `openid-configuration`) → `authorization_endpoint` `https://mcp.bitrix24.com/oauth/authorize/`, `token_endpoint` `https://mcp.bitrix24.com/oauth/token/`, **`registration_endpoint` `https://mcp.bitrix24.com/oauth/register/mcp/`**, `scopes_supported: ["auth","profile"]`, `token_endpoint_auth_methods_supported: ["client_secret_post"]`, PKCE `plain` e `S256`, **sem `revocation_endpoint`**.
- `POST` vazio no registro → `400 invalid_client_metadata` ("Field value must not be empty"): aberto, sem credencial inicial.

| Ponto | Achado | Estado |
| --- | --- | --- |
| (a) URL | `https://mcp.bitrix24.com/mcp/`, uma para todos os portais. O administrador do portal liga "Permitir conexão de IAs externas" em Configurações > Servidores MCP (vem desligado). [16][17] | confirmado |
| (b) Registro | **Dinâmico** (RFC 7591), aberto; o servidor só aceita `client_secret_post`, então o registro devolve um secret a guardar. | confirmado ao vivo |
| (c) Escopos | `auth`, `profile`. | confirmado ao vivo |
| (d) Identidade | O login é pela conta Bitrix24 Network; como o portal é escolhido e como lê-lo depois (domínio `*.bitrix24.com.br`, member id): **não confirmado**. Pode exigir uma ferramenta MCP de contexto. | **não confirmado** |
| (e) Ferramentas, limites, custo | CRM (negócios, etapas, funis), tarefas, estrutura da empresa, convites, e-mail (ler e enviar), sob as permissões do usuário. [16][17] Planos, limites e custo: **não confirmados**. Sem revisão de app. | parcial |
| (f) Revogação | Sem endpoint. O usuário fecha o acesso no perfil Bitrix24 Network (seção Conexões MCP); o admin desliga a opção para todos. [17] | confirmado (manual) |
| (g) Alternativa por chave | Token de conexão MCP (Aplicativos > Conexões MCP > Obter token), enviado como cabeçalho; ou webhook de entrada da REST, URL `https://<portal>/rest/<user>/<código>/` por usuário. [17] | token MCP confirmado; cabeçalho exato **não confirmado** |

**Recomendação.** O perfil em `conectores.ts` (`registro: 'dinamico'`) está certo; o `naoConfirmado` do registro pode sair. Ajustes: usar como `resource` o valor do metadado (`https://mcp.bitrix24.com`, sem `/mcp/`); desconectar só apaga o token local (sem `revocation_endpoint`) e a tela orienta fechar o acesso no Bitrix24 Network; `portalFixo` continua `false` até sabermos ler o portal. O token MCP pode virar o caminho por chave (`chave: { cabecalho: ... }`) depois de confirmar o cabeçalho.
**Trabalho humano.** O Nan cria o portal de teste e liga "Permitir conexão de IAs externas". Os segredos `BITRIX24_MCP_CLIENT_ID/_SECRET` do ticket 18 **não são necessários**.

## Kommo

**Sondas ao vivo.** `https://mcp.kommo.com/mcp` → `302` para `https://www.kommo.com`; `/.well-known/oauth-authorization-server` → `403`. `www.kommo.com/mcp/` e `developers.kommo.com/docs/mcp` → `404`. O índice `https://developers.kommo.com/llms.txt` não cita MCP.

| Ponto | Achado | Estado |
| --- | --- | --- |
| (a) URL | Nenhum servidor MCP oficial. | confirmado (ausência) |
| (b)–(f) | — | — |
| (g) Alternativa por chave | REST v4 em `https://<subdominio>.kommo.com/api/v4/`. OAuth 2.0: só administrador de conta instala a integração; o retorno traz `referer` = `<subdominio>.kommo.com` (o portal a fixar); integração pública exige requisitos e revisão do marketplace; o refresh token cai após 3 meses sem uso; o admin revoga na janela da integração e há webhook de desativação (com `account_id`). Token de longa duração: criado por admin numa integração privada, 1 dia a 5 anos, age com direitos de administrador. [18][19][20] | confirmado |

**Recomendação.** Fica **"Em breve"** pelo critério da ADR-0017. Se o Nan quiser cobrir já, o caminho é a ADR-0021 com o token de longa duração, mas ele é sempre de administrador e não do participante: contraria "Acesso por participante" e pede uma decisão nova (ADR) antes de virar perfil. Portal: subdomínio e `GET /api/v4/account` (`id`).
**Trabalho humano.** Para OAuth: criar a integração pública no Kommo e passar pela revisão. Para o token: o admin de cada conta cria a integração privada e gera o token.

## O que muda nos tickets

- **15 Salesforce:** sai do "só conta do cliente" para "OAuth MCP com credenciais do ECA por Workspace"; precisa de mudança no mecanismo (segredos por Workspace) e descoberta direto no `.well-known` com caminho.
- **16 Zoho CRM:** registro dinâmico confirmado; bloqueado só pelo datacenter (`.in`). "Em breve" com o motivo.
- **17 RD Station:** chave de API segue; investigar a URL do catálogo com conta de teste.
- **18 Bitrix24:** registro dinâmico confirmado; tirar do Passo do Nan a criação do app OAuth; corrigir o `resource`.
- **19 Kommo:** "Em breve"; token de admin só com nova ADR.

## Fontes

1. [Salesforce Hosted MCP Servers Are Now Generally Available](https://developer.salesforce.com/blogs/2026/04/salesforce-hosted-mcp-servers-are-now-generally-available)
2. [Standard Servers](https://developer.salesforce.com/docs/platform/hosted-mcp-servers/references/reference/servers-reference.html) e [SObject All](https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/sobject-all.html)
3. [Security Best Practices](https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/security-best-practices.md) (devolveu 403 ao WebFetch nesta data; conteúdo pelo índice de busca)
4. [Create an External Client App](https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/create-external-client-app.html)
5. Guias de terceiros sobre o ECA (não oficiais): [Arcade](https://docs.arcade.dev/en/operate/governance/mcp-gateways/add-remote-servers/salesforce), [Aembit](https://docs.aembit.io/ai-guide/mcp/identity-gateway/supported-servers/salesforce/), [Obot](https://obot.ai/mcp-catalog/salesforce/)
6. [Set Up Your Org](https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/setup-overview.html); edições e Flex Credits só por [terceiro](https://www.cleanlist.ai/blog/2026-10-05-salesforce-mcp-server-review) (**não confirmado**)
7. [Zoho CRM MCP Servers - Overview](https://www.zoho.com/crm/developer/docs/mcp/overview.html)
8. [Zoho CRM MCP - Claude Setup](https://www.zoho.com/crm/developer/docs/mcp/setup/claude.html) (e `cursor.html`, `vscode.html`, `windsurf.html`)
9. [Zoho CRM with Built-In MCP Support](https://help.zoho.com/portal/en-gb/community/topic/zoho-crm-with-built-in-mcp-support)
10. [Get Started With Zoho MCP](https://help.zoho.com/portal/en/kb/mcp/getting-started/articles/zoho-mcp-help-documentation)
11. [Zoho CRM MCP FAQs](https://www.zoho.com/crm/developer/docs/mcp/faqs.html)
12. [MCP da RD Station](https://www.rdstation.com/inteligencia-artificial/mcp/) e [Integração MCP](https://www.rdstation.com/mcp-rd-station/)
13. [Como conectar a Claude API aos dados da empresa com MCP](https://www.rdstation.com/blog/marketing/claude-api-mcp/)
14. [Como revogar o acesso de um token](https://developers.rdstation.com/reference/como-revogar-acesso-de-token)
15. [RD Station Developers](https://developers.rdstation.com/) (CRM v1 e v2)
16. [MCP in Bitrix24](https://helpdesk.bitrix24.com/open/25846367/)
17. [Manage Bitrix24 using external AI systems](https://helpdesk.bitrix24.com/open/25866707/)
18. [Kommo OAuth 2.0](https://developers.kommo.com/docs/oauth-20)
19. [Kommo Long-lived Token](https://developers.kommo.com/docs/long-lived-token)
20. [Kommo llms.txt](https://developers.kommo.com/llms.txt)

# Pesquisa 2026-10-19: Slack, Microsoft Teams e Webhooks/Zapier/Make

Complementa [pesquisa-conectores-mcp-todos.md](./pesquisa-conectores-mcp-todos.md) (2026-10-02), que não consultou os metadados OAuth ao vivo. Aqui cada servidor foi sondado com `curl` em 2026-10-19 (`POST` de `initialize` sem token, depois `/.well-known/oauth-protected-resource[/caminho]` e `/.well-known/oauth-authorization-server[/caminho]`). Tickets: [22](./issues/22-conectar-o-acesso-ao-slack.md), [23](./issues/23-conectar-o-acesso-ao-microsoft-teams.md), [28](./issues/28-conectar-o-acesso-ao-webhooks-zapier-make.md). Base: ADR-0017 (servidor MCP oficial, Acesso por participante), ADR-0021 (chave de API quando não há MCP utilizável), ADR-0022 (regra por ferramenta).

**Mudanças em relação a 2026-10-02:**
- **Slack:** os metadados existem e confirmam o perfil atual, sem registro dinâmico. Novidade que bloqueia a produção: **só app interno ou publicado no Slack Marketplace usa o MCP**.
- **Teams:** o `mcp_TeamsServer` por tenant agora é legado ("não usar em produção"). O caminho novo é o **Work IQ MCP** (GA), com uma URL só e um app multitenant.
- **Zapier e Make:** os dois têm servidor MCP hospedado com OAuth. O Make publica registro dinâmico. O Zapier publica `registration_endpoint`, mas a documentação limita o OAuth a clientes listados.

## 1. Slack (Integração via MCP)

| Ponto | Fato | Fonte | Estado |
| --- | --- | --- | --- |
| (a) URL | `https://mcp.slack.com/mcp`, igual para todo workspace. `POST` sem token → `401`, `WWW-Authenticate: Bearer resource_metadata="https://mcp.slack.com/.well-known/oauth-protected-resource"`. O PRM fica na raiz (com `/mcp` dá 404), com `resource: "https://mcp.slack.com"` (sem `/mcp`) e `authorization_servers: ["https://mcp.slack.com"]`. | curl; [S1] | confirmado |
| (b) Registro | O metadado do AS (`/.well-known/oauth-authorization-server` em `mcp.slack.com`) **não tem `registration_endpoint`**. `authorization_endpoint: https://slack.com/oauth/v2_user/authorize`, `token_endpoint: https://slack.com/api/oauth.v2.user.access`, `token_endpoint_auth_methods_supported: ["client_secret_post"]`, PKCE `S256`, `grant_types: authorization_code, refresh_token, jwt-bearer` (ID-JAG). O app é confidencial, com app ID fixo, e é preciso ligar **Agents → "Slack Model Context Protocol (MCP) Server"** nas configurações do app. | curl; [S1][S3] | confirmado |
| (c) Escopos | `scopes_supported` (PRM e AS): `canvases:read/write`, `channels:history/read/write`, `chat:write`, `emoji:read`, `files:read/write`, `groups:history/read/write`, `im:history/read/write`, `lists:read/write`, `mpim:history/read/write`, `reactions:read/write`, `search:read.files/.im/.mpim/.private/.public/.users`, `users:read`, `users:read.email`. São **escopos de usuário** (token de usuário). `emoji:read` não estava na pesquisa anterior. | curl; [S1] | confirmado |
| (d) Identidade | O MCP age como o usuário que consentiu. O AS não tem `userinfo`. A resposta de `oauth.v2.user.access` deve trazer o usuário e o time (`authed_user.id`, `team.id`), e o portal fixo do Workspace seria o `team.id`. | [S1] | campos exatos da resposta **não confirmados** |
| (e) Ferramentas | Buscar mensagens, arquivos, usuários, canais e emoji. Ler, enviar, agendar e rascunhar mensagens. Criar conversa. Reações. Canvases. Perfis e membros. Listas. Upload de arquivo (`slack_get_file_upload_url`, `slack_complete_file_upload`). | [S1] | outros nomes **não confirmados** (ler no `tools/list`) |
| (e) Limites | Por ferramenta, iguais aos da Web API (Tier 2/3/4; busca e envio têm limite próprio). Respeita os IPs permitidos do app. | [S1] | confirmado |
| (e) Custo | Nada cobrado pelo MCP em si. | [S1] | **não confirmado** (a página não fala de plano) |
| (e) Revisão do app | "Only directory-published apps or internal apps may use MCP"; app **unlisted** distribuído é proibido. O administrador do workspace aprova pelo fluxo normal de apps. Para entrar no Marketplace o app precisa de **10 instalações em workspaces ativos**, mantidas durante toda a revisão (regra de jul/2026). | [S1][S2][S4][S5] | confirmado |
| (f) Revogação | O AS não publica `revocation_endpoint`. `auth.revoke` (`https://slack.com/api/auth.revoke`, sem escopo, Tier 3) revoga o token passado. | [S6] | funcionar com token emitido pelo MCP **não confirmado** |

**Como convivem o Canal e a Integração.** O Canal ([.scratch/slack-canal](../slack-canal/decisoes.md), `slack-channel-*`) é inbound: o Administrador instala o bot @Althius (token de bot, escopos `app_mentions:read`, `im:history`, `channels:history`, `chat:write`, `users:read`, `users:read.email`, segredos `SLACK_CHANNEL_CLIENT_*`), e uma menção vira Conversa. A Integração (ticket 22) é o Acesso de cada participante: token de usuário pelo `oauth/v2_user/authorize`, retorno em `integration-callback`, ferramentas pelo `usar_conector` sob a ADR-0022, segredos `SLACK_MCP_CLIENT_*`. São fluxos OAuth, tokens e tabelas diferentes, e não se tocam no código.

O ponto que os une é o **app Slack**. Pela regra do Marketplace, o caminho viável é **um app só** para os dois: o bot dá a "funcionalidade dentro do Slack" que a revisão pede, e o mesmo app ID com o MCP ligado serve à Integração. Então `SLACK_MCP_CLIENT_ID/SECRET` recebem os mesmos valores de `SLACK_CHANNEL_CLIENT_ID/SECRET`, sem mudar código, e só a URL de retorno `integration-callback` se soma à do Canal. Dois apps exigiriam duas listagens. Na tela, o cartão do Canal (Administrador) e o da Integração (Acesso de cada um) aparecem separados, e o CONTEXT já distingue os dois termos. Ponto aberto: a Demonstração hoje esconde a Integração Slack para não duplicar o cartão (ticket 30).

**Recomendação Slack.** Manter o perfil (`registro: 'preregistrado'`, `enviarRecurso: false`). Resolver os dois `naoConfirmado` do perfil: os metadados existem e confirmam os endereços, e os escopos são a lista acima. Na pré-produção, usar o app como **interno** no workspace Slack da Althius. Para clientes, publicar no Marketplace (meta de 10 workspaces ativos com o Canal). Até lá, só o workspace da Althius conecta.

## 2. Microsoft Teams

| Ponto | Fato | Fonte | Estado |
| --- | --- | --- | --- |
| (a) URL recomendada | **Work IQ MCP**: `https://workiq.svc.cloud.microsoft/mcp`, uma URL para todos os tenants. `POST` → `401` com `resource_metadata=".../.well-known/oauth-protected-resource/mcp"`. PRM: `authorization_servers: ["https://login.microsoftonline.com/organizations/v2.0"]`, `scopes_supported: ["fdcc1f02-fc51-4226-8753-f668596af7f7/WorkIQAgent.Ask"]`. Work IQ MCP é GA; a ferramenta `retrieve` está em preview. | curl; [T1][T2] | confirmado |
| (a) URL legada | `https://agent365.svc.cloud.microsoft/agents/tenants/{tenantId}/servers/mcp_TeamsServer` (com `common` → 400 `TenantIdInvalid`; com um tenant real → 401 e PRM com escopo `.../mcp_TeamsServer/.default`). A Microsoft diz que os servidores por aplicativo são "only intended for backward compatibility … shouldn't be used in production". | curl; [T3][T4] | confirmado: **descartar** |
| (b) Registro | O Entra não tem registro dinâmico: o OIDC de `organizations/v2.0` não publica `registration_endpoint` nem `revocation_endpoint`. Pré-registrado: **um app multitenant da Althius** (`AzureADMultipleOrgs`), e o usuário entra pela autoridade do próprio tenant. Corrige a pesquisa anterior, que pedia um app por tenant. | curl; [T2] | confirmado |
| (c) Escopos | Delegado `api://workiq.svc.cloud.microsoft/WorkIQAgent.Ask` (o PRM anuncia o mesmo pelo appId `fdcc1f02-…`), mais `openid profile offline_access`. **AdminConsentRequired: Yes.** A visão geral fala em "quatro permissões amplas", mas a página só lista `WorkIQAgent.Ask`. Só delegado; sem app-only. | [T5][T2] | `WorkIQAgent.Ask` confirmado; as outras três **não confirmadas** |
| (d) Identidade | Token delegado do usuário. Do `id_token` saem `oid` (usuário) e `tid` (tenant); o `tid` seria o portal fixo do Workspace. | [T2] | uso de `tid` como portal **não confirmado** na prática |
| (e) Ferramentas | 10 ferramentas genéricas por caminho de recurso: `fetch`, `fetch_blob`, `create_entity`, `update_entity`, `delete_entity`, `do_action`, `call_function`, `ask`, `retrieve`, `list_agents`, `get_schema`, `search_paths`. Teams, por exemplo: `fetch /me/chats/{id}/messages`. Cobre também e-mail, agenda, OneDrive/SharePoint e Planner. | [T1] | confirmado (a página lista 12 nomes para "10 ferramentas") |
| (e) Custo e pré-requisitos | Cobrado em **Copilot Credits** (uso), no tenant do cliente. Cada tenant precisa: (1) plano de cobrança por uso no Copilot Studio, com assinatura Azure; (2) um Global Admin criar o service principal (`az ad sp create --id fdcc1f02-fc51-4226-8753-f668596af7f7`); (3) consentimento de administrador para o app da Althius. O admin governa ferramentas em Microsoft 365 admin center → Agents → Tools. | [T6][T1][T4] | confirmado |
| (f) Revogação | Sem endpoint de revogação no Entra. Desconectar = apagar o refresh token na Althius. O usuário ou o admin remove o consentimento do app no Entra. | curl | caminho de remoção no Entra **não confirmado** nesta pesquisa |

**Atenção (ADR-0022).** Com ferramentas genéricas, a regra por ferramenta perde granularidade: `do_action` envia e-mail e posta no Teams, e `fetch` lê caixa de entrada e chats. Bloquear `do_action` bloqueia tudo. O cartão "Microsoft Teams" daria acesso a todo o Microsoft 365 do usuário. Isso pede decisão do Nan: chamar o cartão de "Microsoft 365 (Work IQ)" ou aceitar o escopo largo. Teams como **Canal** (bot recebendo menções, como o Slack Canal) é outro projeto, com Bot Framework e Teams App, e fica fora daqui. O ticket 23 marca a categoria "Canal de conversa com os Agentes", mas pelo MCP isto é Integração.

**Recomendação Teams.** Trocar a URL do perfil para `https://workiq.svc.cloud.microsoft/mcp` com `registro: 'preregistrado'`, escopo `api://workiq.svc.cloud.microsoft/WorkIQAgent.Ask offline_access openid profile`, autoridade `organizations` e `enviarRecurso` desligado até testar.

Barreira prática: o cliente precisa de Global Admin, cobrança Azure e Copilot Credits. Para a pré-produção, o caminho é um tenant de teste do Microsoft 365 Developer Program com cobrança por uso. Se o Nan não quiser assumir isso agora, deixar "Em breve" com o motivo: "exige Work IQ habilitado e consentimento do administrador do Microsoft 365".

## 3. Webhooks, Zapier e Make

Zapier e Make têm servidor MCP oficial hospedado com OAuth. "Webhooks" não é um app: é uma funcionalidade da Althius e não cabe no mecanismo MCP. O ticket 28 mistura três coisas.

### Zapier

| Ponto | Fato | Fonte | Estado |
| --- | --- | --- | --- |
| (a) URL | `https://mcp.zapier.com/api/v1/connect`, igual para todos. `POST` → `401`, `resource_metadata=".../.well-known/oauth-protected-resource/api/v1/connect"`. PRM: `authorization_servers: ["https://mcp.zapier.com"]`. Só Streamable HTTP. | curl; [Z1][Z2] | confirmado |
| (b) Registro | O AS publica `registration_endpoint: https://mcp.zapier.com/api/v1/oauth/register` (um `POST {}` responde 422 "must have required property 'redirect_uris'", ou seja, o endpoint é ativo), além de `token_endpoint_auth_methods: none, client_secret_post, client_secret_basic` e PKCE S256. Mas a documentação diz que o OAuth vale para clientes **da lista suportada** (Claude, ChatGPT, Cursor, VS Code…) e que "outros" usam **token de conexão** (Bearer, criado em mcp.zapier.com, ligado a um servidor). | curl; [Z2][Z3] | registro dinâmico existe; aceitar a URL de retorno da Althius **não confirmado** (não registrei cliente) |
| (c) Escopos | `openid profile email`. As ações não são escopos: o OAuth cria um servidor com as ações dos apps já ligados à conta Zapier do usuário. | curl; [Z2] | confirmado |
| (d) Identidade | `userinfo_endpoint: https://mcp.zapier.com/api/v1/oauth/userinfo` (OIDC). | curl | confirmado |
| (e) Ferramentas e custo | As ações que o usuário habilitou (milhares de apps). **2 tasks do plano do usuário por chamada bem-sucedida**; falha não conta; sem limite além da cota de tasks. Para produto: "Embed Zapier MCP" (segredo do parceiro + URL por usuário) e o fluxo White Label (JWT do parceiro, cobrado na conta do parceiro). | [Z1][Z2][Z4][Z5] | confirmado |
| (f) Revogação | `revocation_endpoint: https://mcp.zapier.com/api/v1/oauth/revoke`. O usuário também revoga em mcp.zapier.com. | curl; [Z2] | confirmado |

### Make

| Ponto | Fato | Fonte | Estado |
| --- | --- | --- | --- |
| (a) URL | `https://mcp.make.com` (OAuth, sem token, todas as zonas). PRM da raiz: `resource: "https://mcp.make.com/"`, AS `https://www.make.com/mcp`. **Não usar `/mcp`**: o PRM dela aponta para o AS `https://www.make.com/mcp-openai`, de uso aparente do ChatGPT. `/stream` aponta para o AS `www.make.com/mcp`. Alternativa por token: `https://<zona>/mcp` com Bearer. | curl; [M1][M2] | confirmado; o papel de `/mcp-openai` é **não confirmado** |
| (b) Registro | **Registro dinâmico**: `registration_endpoint: https://www.make.com/oauth/v2/register/mcp` (um `POST {}` responde 400 "redirect_uris required"). `token_endpoint: https://www.make.com/oauth/v2/token` (`client_secret_post`), PKCE S256. | curl | confirmado |
| (c) Escopos | Escolhidos pelo usuário na tela de consentimento, junto com a organização Make. O metadado não lista os escopos. Documentado: "Run your scenarios"; as ferramentas de gestão exigem plano pago. | [M2][M1] | nomes técnicos **não confirmados** |
| (d) Identidade | A conta Make e a organização escolhida no consentimento. Sem `userinfo` no metadado. | [M2] | como ler a identidade **não confirmado** |
| (e) Ferramentas e custo | Cada cenário ativo "on demand" vira uma ferramenta (entradas e saídas do cenário). As ferramentas de gestão cobrem cenários, conexões, webhooks, data stores, times e organizações. Timeout de 25 s no OAuth (a execução continua até 40 min e devolve `executionId`). O custo segue os créditos do plano Make do usuário. | [M1] | custo exato **não confirmado** |
| (f) Revogação | `revocation_endpoint: https://www.make.com/oauth/v2/revoke` (`client_secret_post`). | curl | confirmado |

### Webhook genérico na Althius

Nenhum fornecedor oferece "webhook" como servidor MCP, e o Zapier e o Make já cobrem a automação. Um webhook genérico seria funcionalidade própria da Althius:
- **Saída:** a Althius posta eventos assinados com HMAC (Conta-alvo criada, resposta recebida…) numa URL do Administrador, que pode ser um "Catch Hook" do Zapier ou um "Custom webhook" do Make.
- **Entrada:** uma URL da Althius que recebe dados.

Isso pede spec e ADR próprias: catálogo de eventos, assinatura, novas tentativas e quem configura (Workspace e não Acesso por participante, o que foge da ADR-0017). Não confundir com o termo protegido **Webhook Endpoint** (Unipile), que os tickets mandam não tocar.

**Recomendação.** Dividir o ticket 28:
- **28a Zapier:** perfil MCP com registro dinâmico pelo mecanismo genérico. Se o Zapier recusar a URL de retorno, cair no token de conexão pela ADR-0021 (o participante cola o token do próprio servidor) ou pedir o Embed/White Label ao Zapier.
- **28b Make:** perfil MCP com registro dinâmico e URL `https://mcp.make.com`. É o mais simples dos três.
- **28c Webhooks:** "Em breve", até haver spec.

As tasks e os créditos são gastos do plano do usuário no app, e não créditos da Althius. Cabe ao Nan decidir se a escrita conta como "gasta" para o teto (`creditos-e-planos` 03). Pelo padrão da ADR-0022, as ferramentas sem `readOnlyHint` já pedem Aprovação.

## 4. Passos humanos (Nan)

1. **Slack:**
   - No app do Canal (api.slack.com/apps), ligar Agents → "Slack Model Context Protocol (MCP) Server".
   - Em OAuth & Permissions, somar os escopos de **usuário** acima e a URL de retorno `https://ycbdilsmydvzezhlymty.supabase.co/functions/v1/integration-callback`.
   - Gravar os mesmos ID e segredo do app em `SLACK_MCP_CLIENT_ID` e `SLACK_MCP_CLIENT_SECRET`, só no terminal: `npx supabase secrets set SLACK_MCP_CLIENT_ID=... SLACK_MCP_CLIENT_SECRET=... --project-ref ycbdilsmydvzezhlymty`.
   - Decidir se o app fica interno (só o workspace da Althius) até a listagem no Marketplace, que exige 10 workspaces ativos.
2. **Teams:**
   - Decidir entre Work IQ e "Em breve".
   - Se for Work IQ, registrar no Entra um app **multitenant** com a URL de retorno acima e a permissão delegada `WorkIQAgent.Ask`, e gravar `TEAMS_MCP_CLIENT_ID/SECRET` (nomes a definir no perfil).
   - Num tenant de teste: criar o plano de cobrança por uso no Copilot Studio, criar o service principal (`az ad sp create --id fdcc1f02-fc51-4226-8753-f668596af7f7`) e dar o consentimento de administrador.
3. **Zapier e Make:** criar conta de teste em cada um, conectar pelo navegador (um cenário "on demand" no Make, uma ação no Zapier) e conferir no `tools/list` o que aparece. Nenhum segredo da Althius se o registro dinâmico funcionar.
4. **Webhooks:** decidir se abre uma spec própria.

## Fontes

- [S1] https://docs.slack.dev/ai/slack-mcp-server/
- [S2] https://docs.slack.dev/ai/slack-mcp-server/connect-to-harnesses/
- [S3] https://docs.slack.dev/ai/slack-mcp-server/developing/
- [S4] https://docs.slack.dev/changelog/2026/09/01/slack-marketplace-install-requirement/
- [S5] https://docs.slack.dev/slack-marketplace/slack-marketplace-review-guide/
- [S6] https://docs.slack.dev/reference/methods/auth.revoke
- [T1] https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/work-iq/mcp/overview
- [T2] https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/work-iq/api-overview
- [T3] https://learn.microsoft.com/en-us/microsoft-copilot-studio/mcp-teams-tools
- [T4] https://learn.microsoft.com/en-us/microsoft-agent-365/tooling-servers-overview
- [T5] https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/work-iq/permissions
- [T6] https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/work-iq/enable-work-iq
- [Z1] https://docs.zapier.com/mcp/get-started/connect
- [Z2] https://docs.zapier.com/mcp/overview/how-connections-work
- [Z3] https://docs.zapier.com/mcp/get-started/connect/other
- [Z4] https://docs.zapier.com/mcp/embed/getting-started
- [Z5] https://docs.zapier.com/white-label/use-cases/ai-agent-connections
- [M1] https://developers.make.com/mcp-server
- [M2] https://developers.make.com/mcp-server/connect-using-oauth

# Pesquisa: servidor MCP remoto oficial de cada app do catálogo

Feita em 2026-10-02. Amplia a [pesquisa anterior](./pesquisa-servidores-mcp.md) (HubSpot, Notion, Apollo, Lusha, Meta Ads e Google Ads) para os 20 apps do catálogo de Integrações.

## Pergunta

Para cada app, existe um servidor MCP remoto oficial, mantido pelo fornecedor, a que um cliente de terceiros (a Althius) consegue se conectar por OAuth, como fazem os conectores do Claude? Quando existe: (a) URL, (b) forma de registro do cliente, (c) escopos, (d) ferramentas de escrita principais, (e) fonte.

## Como a pesquisa foi feita

O proxy do ambiente bloqueou a leitura direta das páginas e dos metadados OAuth (`/.well-known/...`) dos servidores (`CONNECT tunnel failed, response 403` para `mcp.apollo.io`, `mcp.pipedrive.ai`, `mcp.notion.com` e `mcp.hubspot.com`). Por isso cada afirmação vem da busca na web restrita aos domínios oficiais do fornecedor e cita a página oficial que a busca devolveu. O que a busca não mostrou com clareza está marcado como **não confirmado**. Quem tiver acesso direto deve conferir os pontos não confirmados lendo o metadado OAuth do próprio servidor (`/.well-known/oauth-protected-resource` e `/.well-known/oauth-authorization-server`): ali aparece se há `registration_endpoint` (registro dinâmico).

Para Apollo e Pipedrive, os nomes das ferramentas vêm também dos conectores ligados nesta sessão (só a lista de nomes; nenhuma ferramenta foi chamada).

Vocabulário da coluna "registro":
- **dinâmico**: o cliente se registra sozinho pelo RFC 7591; a Althius não precisa cadastrar app no fornecedor.
- **pré-registrado**: a Althius cria um app (client ID e secret) no portal do fornecedor antes.
- **por conta**: cada cliente final cria o app ou gera a URL dentro da própria conta; não existe um app da Althius que sirva para todos.
- **chave de API**: sem OAuth para cliente de terceiros.

## Resumo

| App | Servidor remoto oficial | URL | Registro do cliente | Serve para a Althius como conector OAuth? |
| --- | --- | --- | --- | --- |
| HubSpot | sim | `https://mcp.hubspot.com` | pré-registrado (MCP Auth App) | sim |
| Pipedrive | sim | `https://mcp.pipedrive.ai/mcp` | OAuth; forma **não confirmada** | provável |
| RD Station CRM | sim | URL gerada por conexão na conta | por conta (URL gerada) + OAuth 2.0 | **não confirmado** |
| Salesforce | sim | `https://api.salesforce.com/platform/mcp/v1/<servidor>` | por conta (External Client App em cada org) | só com app criado em cada org |
| Zoho CRM | sim | `https://<servidor>-<org>.zohomcp.com/mcp/<chave>/message` | por conta (URL com chave) + OAuth Zoho | não como URL única |
| Bitrix24 | sim | `https://mcp.bitrix24.com/mcp/` | OAuth ou token; forma **não confirmada** | provável |
| Kommo | **não encontrado** | — | — | não |
| Apollo | sim | `https://mcp.apollo.io/mcp` | OAuth; parceiros registram app OAuth | sim |
| Lusha | sim | `https://mcp.lusha.com` | OAuth só para Claude/ChatGPT/Codex; demais por chave de API | **não confirmado** |
| Clay | sim | URL **não confirmada** | dinâmico | sim |
| Notion | sim | `https://mcp.notion.com/mcp` | dinâmico | sim |
| Google Sheets | sim | `https://sheetsmcp.googleapis.com/mcp/v1` | pré-registrado (cliente OAuth no Google Cloud) | sim |
| Google Calendar | sim | `https://calendarmcp.googleapis.com/mcp/v1` | pré-registrado (cliente OAuth no Google Cloud) | sim |
| Calendly | sim | `https://mcp.calendly.com` | dinâmico | sim |
| Slack | sim | `https://mcp.slack.com/mcp` | pré-registrado (app Slack com ID fixo); sem registro dinâmico | sim |
| Microsoft Teams | sim (preview) | `https://agent365.svc.cloud.microsoft/agents/tenants/{tenantId}/servers/mcp_TeamsServer` | por conta (app no Entra de cada tenant) | só com app em cada tenant |
| Meta Ads | sim | `https://mcp.facebook.com/ads` | app de desenvolvedor Meta próprio (pré-registrado) | provável |
| Google Ads | **não** (só código aberto para hospedar) | — | — | não |
| LinkedIn Ads | **não encontrado** | — | — | não |
| TikTok Ads | sim | `https://business-api.tiktok.com/open_mcp/tt-ads-mcp-flat` ou `.../tt-ads-mcp-layer` | OAuth sem app de desenvolvedor; forma **não confirmada** | provável |

## CRMs

### HubSpot

| Ponto | O que a fonte oficial diz | Estado |
| --- | --- | --- |
| (a) URL | `https://mcp.hubspot.com`. [1][2] | confirmado |
| (b) Registro | Pré-registrado: em Development > MCP Auth Apps cria-se um app, que gera client ID, client secret e URLs de retorno. PKCE obrigatório; o refresh token muda a cada renovação. Sem registro dinâmico. [3][4] | confirmado |
| (c) Escopos | App de nível de usuário, com escopos dos objetos do CRM escolhidos. [4] | lista exata **não confirmada** |
| (d) Escrita | Criar e editar Contacts, Companies, Deals, Tickets, Line items, Products e engajamentos (Calls, Meetings, Notes, Tasks, Emails); criar associações, tarefas e notas. A disponibilidade varia por assinatura e permissão. [1][5] | confirmado; nomes exatos das ferramentas **não confirmados** |
| Limite | 25 instalações até o app ser listado no marketplace. [6] | confirmado |

### Pipedrive

| Ponto | O que a fonte oficial diz | Estado |
| --- | --- | --- |
| (a) URL | `https://mcp.pipedrive.ai/mcp`, a mesma informada nos guias de Claude e ChatGPT. Mantido pela Pipedrive, disponível em todos os planos, com limite de tokens por plano. [7][8][9][10] | confirmado (confere com tldv.io e usecarly.com) |
| (b) Registro | "Conexão OAuth segura", sem recurso de desenvolvedor: basta colar a URL no cliente. [7][8] O fato de o Claude conectar só com a URL sugere registro dinâmico, mas nenhuma página oficial diz isso. O servidor de autorização em `oauth.pipedrive.com` vem só das fontes secundárias. | OAuth confirmado; registro dinâmico **não confirmado** |
| (c) Escopos | As ações seguem as permissões do usuário e ficam no log de alterações. [8] | escopos OAuth **não confirmados** |
| (d) Escrita | Pela página de lançamento: buscar negócios, criar registros, atualizar contatos, agendar atividades. [8] Pelo conector desta sessão: `addDeal`, `updateDeal`, `addPerson`, `updatePerson`, `addOrganization`, `updateOrganization`, `addLead`, `updateLead`, `convertLeadToDeal`, `addActivity`, `updateActivity`, `addNote`, `updateNote`, `addProduct`, `addDealProduct`. | confirmado (nomes vindos do conector, não da documentação) |

### RD Station CRM

| Ponto | O que a fonte oficial diz | Estado |
| --- | --- | --- |
| (a) URL | Servidor pronto e hospedado pela RD Station, um só para Marketing, CRM e Conversas. Na página de conectores de IA da conta, o cliente cria uma conexão e copia a "URL segura" do MCP. [11][12] | servidor confirmado; formato da URL **não confirmado** |
| (b) Registro | Acesso por OAuth 2.0 respeitando as permissões da conta. [11][12] Como a URL é gerada por conexão, a Althius dependeria de cada cliente gerar a sua; não achamos fluxo para cliente de terceiros. | **não confirmado** |
| (c) Escopos | — | **não confirmado** |
| (d) Escrita | A página fala em "executar ações", sem listar ferramentas. [11] | **não confirmado** |

### Salesforce

| Ponto | O que a fonte oficial diz | Estado |
| --- | --- | --- |
| (a) URL | Servidores padrão: `https://api.salesforce.com/platform/mcp/v1/<SERVER-NAME>` em produção e `.../v1/sandbox/<SERVER-NAME>` em sandbox; customizados em `.../v1/custom/<NOME>`. Disponíveis desde abril de 2026. [13][14][15] | confirmado |
| (b) Registro | Por conta: em cada org cria-se um External Client App, com PKCE obrigatório e tokens JWT para usuários nomeados (sem isso toda chamada falha com `INVALID_JWT_FORMAT`). Cada servidor MCP liga a um app. O guia do Claude cadastra a URL de retorno `https://claude.ai/api/mcp/auth_callback` nesse app. [15][16][17] Não achamos registro dinâmico. | confirmado |
| (c) Escopos | `mcp_api`, `refresh_token`, `offline_access`. [15][16] | confirmado |
| (d) Escrita | O servidor `platform/sobject-all` expõe criar, ler, atualizar, excluir, consultar e buscar em qualquer objeto, respeitando permissões e segurança de campo; há também `sobject-mutations`. [18][19][20] | confirmado |

### Zoho CRM

| Ponto | O que a fonte oficial diz | Estado |
| --- | --- | --- |
| (a) URL | Remota, gerada por servidor no console Zoho MCP: `https://[nome]-[org-id].zohomcp.com/mcp/[api-key]/message` (`.zohomcp.in` na Índia). A URL contém uma chave e deve ser tratada como senha. [21][22][23] | confirmado |
| (b) Registro | Por conta: o cliente monta o servidor no Zoho MCP, escolhe as ferramentas e copia a URL; na primeira chamada abre o OAuth da Zoho ("Authorization on Demand", por usuário, ou "via Connections", com tokens do administrador). [21][22][24] Não há URL única que a Althius registre uma vez. | confirmado |
| (c) Escopos | A tela de OAuth lista as permissões das ferramentas habilitadas. [22] | lista **não confirmada** |
| (d) Escrita | Quatro servidores compostos para o CRM. [25] | ferramentas **não confirmadas** |

### Bitrix24

| Ponto | O que a fonte oficial diz | Estado |
| --- | --- | --- |
| (a) URL | `https://mcp.bitrix24.com/mcp/`. O administrador liga "Permitir conexão de IAs externas" em Configurações > Servidores MCP. Não confundir com `https://mcp-dev.bitrix24.com/mcp`, que só serve documentação. [26][27][28] | confirmado |
| (b) Registro | Duas formas: OAuth (cria-se um conector com a URL e escolhe-se OAuth) ou token gerado em Aplicativos > Conexões MCP. [27] | OAuth confirmado; registro dinâmico **não confirmado** |
| (c) Escopos | — | **não confirmado** |
| (d) Escrita | CRM, tarefas, estrutura da empresa, convites e e-mails, dentro das permissões. [26][27] | nomes **não confirmados** |

### Kommo

Nenhum servidor MCP oficial encontrado em `kommo.com`, `developers.kommo.com`, `pt-developers.kommo.com` e `support.kommo.com`. A Kommo oferece API REST com OAuth 2.0 e um índice para agentes em `https://developers.kommo.com/llms.txt`; a integração com ChatGPT é via Pluga. [29][30][31] Estado: **não existe**, até onde as fontes oficiais mostram.

## Prospecção e enriquecimento

### Apollo

| Ponto | O que a fonte oficial diz | Estado |
| --- | --- | --- |
| (a) URL | `https://mcp.apollo.io/mcp`, Streamable HTTP. [32] | confirmado |
| (b) Registro | OAuth 2.0 para qualquer cliente MCP remoto; chave de API para cliente sem navegador. Quem integra como parceiro deve registrar um app OAuth antes ("Apollo Partnerships MCP Setup"). O marketplace exige OAuth 2.0 como único método. [32][33][34] As instruções do servidor nesta sessão apontam o metadado em `https://mcp.apollo.io/.well-known/oauth-authorization-server`. | OAuth confirmado; para a Althius, app de parceiro pré-registrado; registro dinâmico **não confirmado** |
| (c) Escopos | — | **não confirmado** |
| (d) Escrita | Pelo conector desta sessão: `apollo_contacts_create`, `apollo_contacts_update`, `apollo_accounts_create`, `apollo_accounts_update`, `apollo_deals_create`, `apollo_tasks_create`, `apollo_emailer_campaigns_add_contact_ids`, `apollo_sequences_create`, `apollo_emailer_messages_send_now`, entre outras. Algumas consomem créditos. | confirmado (nomes do conector, não da documentação) |

### Lusha

| Ponto | O que a fonte oficial diz | Estado |
| --- | --- | --- |
| (a) URL | `https://mcp.lusha.com`. [35][36] | confirmado |
| (b) Registro | OAuth "para clientes de chat": Claude, ChatGPT e Codex, pelos diretórios desses produtos. Os demais clientes usam o cabeçalho `x-api-key`. [35][36][37] Não achamos OAuth aberto a um cliente qualquer. | para a Althius, chave de API confirmada; OAuth **não confirmado** |
| (c) Escopos | — | não se aplica à chave |
| (d) Escrita | Enriquecimento e busca (leitura). | lista **não confirmada** |

### Clay

| Ponto | O que a fonte oficial diz | Estado |
| --- | --- | --- |
| (a) URL | Servidor oficial usado por Claude, ChatGPT, Copilot e Glean. [38][39] | URL **não confirmada** |
| (b) Registro | Dinâmico: o servidor aceita clientes que se registram na hora da conexão, por OAuth em `app.clay.com/oauth`; esses clientes aparecem como "Unverified application" na tela de consentimento, sem bloquear. [40] | confirmado |
| (c) Escopos | — | **não confirmado** |
| (d) Escrita | Buscar e pesquisar empresas e pessoas a partir de fluxos montados no Clay. [38][41] | lista **não confirmada** |

## Produtividade e agenda

### Notion

| Ponto | O que a fonte oficial diz | Estado |
| --- | --- | --- |
| (a) URL | `https://mcp.notion.com/mcp`. [42] | confirmado |
| (b) Registro | Dinâmico (RFC 7591), com descoberta por RFC 9728 e RFC 8414. Guardar e reaproveitar o client ID; o refresh token muda a cada renovação. [43] | confirmado |
| (c) Escopos | Valem as permissões do usuário no Notion. [42] | escopos OAuth **não confirmados** |
| (d) Escrita | `notion-create-pages`, `notion-update-page` (aceitam `allow_async`). [44] | confirmado |

### Google Sheets

| Ponto | O que a fonte oficial diz | Estado |
| --- | --- | --- |
| (a) URL | `https://sheetsmcp.googleapis.com/mcp/v1`. [45][46] | confirmado |
| (b) Registro | Pré-registrado: cria-se um cliente OAuth num projeto Google Cloud, configura-se a tela de consentimento com os escopos, e o client ID e secret entram nas configurações avançadas do conector. [45][46] | confirmado |
| (c) Escopos | `drive.readonly`, `drive.file`, `spreadsheets.readonly`, `spreadsheets` (todos em `https://www.googleapis.com/auth/`). [46] | confirmado |
| (d) Escrita | `update_values`, `update_formulas`, `update_spreadsheet`, `insert_dimension`. [47][48] | confirmado |

### Google Calendar

| Ponto | O que a fonte oficial diz | Estado |
| --- | --- | --- |
| (a) URL | `https://calendarmcp.googleapis.com/mcp/v1`. [45][49] | confirmado |
| (b) Registro | Pré-registrado, igual ao Sheets. [49] | confirmado |
| (c) Escopos | Leitura: `calendar.calendarlist.readonly`, `calendar.events.freebusy`, `calendar.events.readonly`. Escrita: `calendar` ou `calendar.events`. [49][50] | confirmado |
| (d) Escrita | `create_event`, `update_event`, `delete_event`, `respond_to_event`. [50][51] | confirmado |

Obs.: escopos sensíveis do Google exigem verificação do app pelo Google antes de servir a muitos usuários; isso não foi pesquisado aqui.

### Calendly

| Ponto | O que a fonte oficial diz | Estado |
| --- | --- | --- |
| (a) URL | `https://mcp.calendly.com`, hospedado pela Calendly. [52][53] | confirmado |
| (b) Registro | Dinâmico: `POST https://calendly.com/oauth/register`, sem token de registro para MCP, mas validado e com limite de taxa. Depois, Authorization Code + PKCE. A Calendly recomenda registrar uma vez por ambiente e reaproveitar o client ID para todos os usuários finais. [53] | confirmado |
| (c) Escopos | `mcp:scheduling:read` e `mcp:scheduling:write`, ambos para acesso completo. [54] | confirmado |
| (d) Escrita | `meetings-create_invitee` (agendar; exige plano pago), `meetings-cancel_event`. [54] | confirmado |

## Comunicação

### Slack

| Ponto | O que a fonte oficial diz | Estado |
| --- | --- | --- |
| (a) URL | `https://mcp.slack.com/mcp`, JSON-RPC 2.0 sobre Streamable HTTP. [55] | confirmado |
| (b) Registro | Pré-registrado: o cliente MCP precisa ser um app Slack registrado, com app ID fixo, para os administradores aprovarem pelo fluxo normal de apps. Sem SSE e sem registro dinâmico. [55][56] | confirmado |
| (c) Escopos | Escopos de usuário por ferramenta: `search:read.public`, `search:read.private`, `search:read.im`, `search:read.mpim`, `search:read.files`, `search:read.users`, `chat:write`, `channels:history`, `groups:history`, `im:history`, `mpim:history`, `channels:write`, `groups:write`, `im:write`, `mpim:write`, `reactions:write`, `reactions:read`, `canvases:read`, `canvases:write`, `users:read`, `users:read.email`, `channels:read`, `groups:read`, `im:read`, `mpim:read`, `lists:read`, `lists:write`, `files:read`, `files:write`. [55] | confirmado |
| (d) Escrita | Enviar e agendar mensagem, criar conversa ou canal, reagir, criar e atualizar canvas, editar listas, enviar arquivo. [55] | confirmado; nomes exatos das ferramentas **não confirmados** |

### Microsoft Teams

| Ponto | O que a fonte oficial diz | Estado |
| --- | --- | --- |
| (a) URL | Work IQ Teams (Agent 365, em preview): `https://agent365.svc.cloud.microsoft/agents/tenants/{tenantId}/servers/mcp_TeamsServer`. [57][58] | confirmado, em preview |
| (b) Registro | Por conta: o tenant registra um aplicativo empresarial no Entra com as permissões dos servidores Work IQ e informa client ID e tenant ID ao cliente. O Entra não aceita registro dinâmico nem CIMD; só pré-registro. [57][59] | confirmado |
| (c) Escopos | `McpServers.Teams.All`. [58] | confirmado |
| (d) Escrita | Criar, atualizar e excluir chats; adicionar membros; postar mensagens e respostas; operações de canal. [57][58] | confirmado; nomes exatos **não confirmados** |

## Anúncios

### Meta Ads

| Ponto | O que a fonte oficial diz | Estado |
| --- | --- | --- |
| (a) URL | `https://mcp.facebook.com/ads`, hospedado pela Meta, para qualquer agente MCP. [60][61] | confirmado |
| (b) Registro | Dá para conectar qualquer aplicação de IA usando o próprio app de desenvolvedor Meta (pré-registrado), com Facebook Login for Business e URL de retorno cadastrada no painel do app. [61][62] | app próprio confirmado; o passo a passo do OAuth no MCP **não confirmado** |
| (c) Escopos | Para gerir anúncios de terceiros: `ads_management` ou `business_management`, `ads_read`, `pages_read_engagement`, com acesso avançado e o recurso Ads Management Standard Access. [61] | confirmado para a Marketing API; que o MCP peça exatamente esses **não confirmado** |
| (d) Escrita | Sete grupos: relatórios, criação e gestão de anúncios, catálogos, sinais e datasets, ajuda, testes A/B e estudos de lift, logs de atividade. [60] | grupos confirmados; nomes **não confirmados** |

### Google Ads

Não há servidor hospedado pelo Google. O servidor oficial é código aberto (Python, stdio ou HTTP/SSE no Cloud Run), só de leitura e relatório, e quem o hospeda configura `GOOGLE_ADS_MCP_OAUTH_CLIENT_ID` e `GOOGLE_ADS_MCP_OAUTH_CLIENT_SECRET`. O developer token deixou de ser exigido em 9 de setembro de 2026. [63][64] Estado: **não existe** servidor remoto oficial (confere com a pesquisa anterior).

### LinkedIn Ads

Nenhum servidor MCP oficial encontrado em `learn.microsoft.com/linkedin`, `developer.linkedin.com`, `business.linkedin.com` e `linkedin.com`. Existe só a Marketing API (Campaigns, Creatives, Ad Analytics), que pede app aprovado no programa. [65][66] Não confundir com o servidor MCP da Microsoft Advertising (Bing), que é outro produto. [67] Estado: **não existe**, até onde as fontes oficiais mostram.

### TikTok Ads

| Ponto | O que a fonte oficial diz | Estado |
| --- | --- | --- |
| (a) URL | Duas variantes: `https://business-api.tiktok.com/open_mcp/tt-ads-mcp-flat` (carrega ~400 ferramentas) e `https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer` (~40 ferramentas e as demais sob demanda). Aberto a todos. [68][69] | confirmado |
| (b) Registro | OAuth no TikTok Ads Manager, sem conta nem app de desenvolvedor e sem chave de API. A autorização vale 30 dias; depois é preciso autorizar de novo. [68][70] Não ter app de desenvolvedor sugere registro dinâmico, mas a página não diz. | OAuth confirmado; registro dinâmico **não confirmado** |
| (c) Escopos | A tela mostra as permissões pedidas. [70] | lista **não confirmada** |
| (d) Escrita | Gestão de campanhas, configuração de público e operações de criativo, além de relatórios. [68] | nomes **não confirmados** |

## O que isso significa para a Althius

- **Conectam pelo mecanismo genérico (registro dinâmico):** Notion, Calendly, Clay. Prováveis, a confirmar no metadado: Pipedrive, Bitrix24, TikTok Ads.
- **Precisam de app pré-registrado pela Althius:** HubSpot, Slack, Google Sheets, Google Calendar, Meta Ads, Apollo (app de parceiro).
- **Precisam de algo criado na conta de cada cliente:** Salesforce (External Client App por org), Microsoft Teams (app no Entra por tenant), Zoho CRM (URL com chave por servidor), RD Station CRM (URL gerada por conexão).
- **Só chave de API para terceiros:** Lusha.
- **Sem servidor remoto oficial:** Kommo, LinkedIn Ads, Google Ads.

## Fontes

1. [HubSpot MCP Server](https://developers.hubspot.com/ai-tools/mcp)
2. [Remote HubSpot MCP server is now generally available](https://developers.hubspot.com/changelog/remote-hubspot-mcp-server-is-now-generally-available)
3. [Public Beta: Self-Service MCP Auth Apps](https://developers.hubspot.com/changelog/public-beta-self-service-mcp-auth-apps-for-the-hubspot-remote-mcp-server)
4. [Integrate AI tools with the HubSpot MCP server](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/integrate-with-the-remote-hubspot-mcp-server)
5. [Using the HubSpot MCP server](https://developers.hubspot.com/docs/build-with-ai/remote-mcp-server)
6. [New Marketplace Distribution App Install Limits](https://developers.hubspot.com/changelog/new-marketplace-distribution-app-install-limits)
7. [Pipedrive MCP Server](https://www.pipedrive.com/en/features/mcp-server)
8. [Pipedrive launches native MCP server](https://www.pipedrive.com/en/newsroom/pipedrive-launches-native-mcp-server-bringing-crm-workflows-directly-into-ai-assistants)
9. [Pipedrive MCP for Claude](https://support.pipedrive.com/en/article/mcp-claude)
10. [Pipedrive MCP for ChatGPT](https://support.pipedrive.com/en/article/mcp-chatgpt)
11. [MCP RD Station](https://www.rdstation.com/mcp-rd-station/)
12. [MCP e CRM: como usar IA para gerenciar seu funil de Vendas](https://www.rdstation.com/blog/vendas/mcp-crm-vendas/)
13. [Salesforce Hosted MCP Servers Are Now Generally Available](https://developer.salesforce.com/blogs/2026/04/salesforce-hosted-mcp-servers-are-now-generally-available)
14. [Standard Servers](https://developer.salesforce.com/docs/platform/hosted-mcp-servers/references/reference/servers-reference.html)
15. [Create an External Client App](https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/create-external-client-app.html)
16. [Connect MCP Clients](https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/client-connection-overview.html)
17. [Connect Claude with Salesforce Hosted MCP Servers](https://developer.salesforce.com/blogs/2026/05/connect-claude-with-salesforce-hosted-mcp-servers)
18. [SObject All](https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/sobject-all.html)
19. [SObject Mutations](https://developer.salesforce.com/docs/platform/hosted-mcp-servers/references/reference/sobject-mutations.html)
20. [SObject Reads](https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/sobject-reads.html)
21. [Get Started With Zoho MCP](https://help.zoho.com/portal/en/kb/mcp/getting-started/articles/zoho-mcp-help-documentation)
22. [Zoho CRM MCP - Claude Setup Guide](https://www.zoho.com/crm/developer/docs/mcp/setup/claude.html)
23. [Configure Zoho MCP server](https://www.zoho.com/mail/help/mcp/mcp-server-configuration.html)
24. [Zoho MCP FAQ](https://help.zoho.com/portal/en/kb/mcp/help-support/articles/zoho-mcp-faq)
25. [MCP for Zoho CRM](https://www.zoho.com/crm/developer/mcp.html) e [Zoho CRM MCP - An Overview](https://www.zoho.com/crm/developer/docs/mcp/overview.html)
26. [MCP in Bitrix24](https://helpdesk.bitrix24.com/open/25846367/)
27. [Manage Bitrix24 using external AI systems](https://helpdesk.bitrix24.com/open/25866707/)
28. [MCP Server for Working with Bitrix24 REST API](https://apidocs.bitrix24.com/ai-tools/mcp.html)
29. [Kommo for developers](https://developers.kommo.com/docs/kommo-for-developers)
30. [Kommo OAuth 2.0](https://developers.kommo.com/docs/oauth-20)
31. [Integração ChatGPT via Pluga](https://www.kommo.com/integrations/chatgpt-crm/)
32. [Apollo MCP](https://docs.apollo.io/docs/apollo-mcp)
33. [OAuth 2.0 (Partners)](https://docs.apollo.io/docs/use-oauth-20-authorization-flow-to-access-apollo-user-information-partners)
34. [Add Your Integration to the Apollo.io Marketplace](https://docs.apollo.io/docs/add-your-integration-to-apollos-marketplace)
35. [Lusha MCP](https://docs.lusha.com/mcp-docs)
36. [Lusha MCP Server (Knowledge Hub)](https://docs.lusha.com/user-guide/mcp/lusha-model-context-protocol-mcp-server)
37. [MCP FAQ - Lusha](https://docs.lusha.com/faq/mcp)
38. [MCP in Clay](https://university.clay.com/docs/mcp-settings)
39. [Clay is now available as a connector in Claude](https://www.clay.com/blog/clay-in-claude)
40. [MCP troubleshooting and FAQs - Clay](https://university.clay.com/docs/mcp-troubleshooting-and-faqs)
41. [What Is Clay MCP?](https://www.clay.com/guides/clay-mcp)
42. [Notion MCP](https://developers.notion.com/guides/mcp/overview)
43. [Build an MCP client for Notion](https://developers.notion.com/guides/mcp/build-mcp-client)
44. [Notion MCP: Supported tools](https://developers.notion.com/guides/mcp/mcp-supported-tools)
45. [Configure the Google Workspace MCP servers](https://developers.google.com/workspace/guides/configure-mcp-servers)
46. [Configure the Sheets MCP server](https://developers.google.com/workspace/sheets/api/guides/configure-mcp-server)
47. [MCP Reference: sheetsmcp.googleapis.com](https://developers.google.com/workspace/sheets/api/reference/mcp)
48. [Sheets MCP: update_values](https://developers.google.com/workspace/sheets/api/reference/mcp/tools_list/update_values)
49. [Configure the Calendar MCP server](https://developers.google.com/workspace/calendar/api/guides/configure-mcp-server)
50. [Calendar MCP: create_event](https://developers.google.com/workspace/calendar/api/v3/reference/mcp/tools_list/create_event)
51. [MCP Reference: calendarmcp.googleapis.com](https://developers.google.com/workspace/calendar/api/v3/reference/mcp)
52. [Calendly MCP Server](https://developer.calendly.com/calendly-mcp-server)
53. [Calendly MCP Overview](https://developer.calendly.com/docs/mcp/calendly-mcp-server)
54. [Calendly MCP: Supported Tools](https://developer.calendly.com/supported-tools)
55. [Slack MCP server overview](https://docs.slack.dev/ai/slack-mcp-server/)
56. [Connect the Slack MCP server to agent harnesses](https://docs.slack.dev/ai/slack-mcp-server/connect-to-harnesses/)
57. [Work IQ MCP overview (preview)](https://learn.microsoft.com/en-us/microsoft-agent-365/tooling-servers-overview)
58. [Teams reference (preview)](https://learn.microsoft.com/en-us/microsoft-agent-365/mcp-server-reference/teams)
59. [Building MCP servers with Entra ID and pre-authorized clients](https://techcommunity.microsoft.com/blog/azuredevcommunityblog/building-mcp-servers-with-entra-id-and-pre-authorized-clients/4508453)
60. [Ads MCP Server, Meta for Developers](https://developers.facebook.com/documentation/ads-commerce/ads-ai-connectors/ads-mcp-server/ads-mcp-server-overview)
61. [Introducing Meta Ads AI Connectors](https://www.facebook.com/business/news/meta-ads-ai-connectors)
62. [Meta's ads MCP server is now available for developers](https://developers.facebook.com/blog/post/2026/07/16/meta-ads-mcp-server/)
63. [Google Ads MCP server: Developer integration guide](https://developers.google.com/google-ads/api/docs/developer-toolkit/mcp-server)
64. [googleads/google-ads-mcp](https://github.com/googleads/google-ads-mcp)
65. [LinkedIn Marketing API Program](https://learn.microsoft.com/en-us/linkedin/marketing/?view=li-lms-2026-09)
66. [LinkedIn Advertising API](https://developer.linkedin.com/product-catalog/marketing/advertising-api)
67. [MCP Server Setup Guide - Microsoft Advertising API](https://learn.microsoft.com/en-us/advertising/guides/mcp-setup?view=bingads-13)
68. [TikTok for Business MCP Server](https://business-api.tiktok.com/portal/docs/tiktok-ads-mcp-server/v1.3)
69. [About TikTok for Business Agentic Hub and MCP Server](https://ads.tiktok.com/help/article/about-tiktok-for-business-agentic-hub-and-mcp-server?lang=en)
70. [How to connect a ready-made agent to TikTok for Business MCP Server](https://business-api.tiktok.com/portal/docs/how-to-connect-to-tiktok-for-business-mcp-server/v1.3)

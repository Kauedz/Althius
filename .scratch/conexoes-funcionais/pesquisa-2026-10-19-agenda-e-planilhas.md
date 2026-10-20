# Pesquisa 2026-10-19: Google Calendar, Google Sheets e Calendly

Complementa `pesquisa-conectores-mcp-todos.md` (2026-10-02), que foi feita sem ler o metadado OAuth. Aqui cada servidor
foi sondado ao vivo com `curl` em 19/10/2026 (initialize, `tools/list`, `/.well-known/...`) e a documentação oficial foi relida.
Perfis atuais: `supabase/functions/_shared/integracoes/conectores.ts`. Tickets: 20 (Calendar), 21 (Calendly), 27 (Sheets).

## Achados que mudam o plano

1. **Os dois servidores MCP do Google estão em Developer Preview.** Para usar, é preciso entrar no Google Workspace
   Developer Preview Program, e os termos do programa dizem que recursos pré-GA não podem entrar em aplicativos públicos
   antes do anúncio de disponibilidade geral (GA). Também não se pode dar acesso a usuários fora do domínio sem
   permissão do Google. Ou seja: a Althius pode testar com contas do próprio Workspace, mas não pode servir clientes
   externos até o Google anunciar GA. [G1][G2][G3]
2. **O Google não exige token no `initialize` nem no `tools/list`.** Os dois respondem 200 sem `Authorization`. Só o
   `tools/call` devolve 401, com `WWW-Authenticate: Bearer resource_metadata=".../oauth-protected-resource/<nome-da-ferramenta>"`.
   A sonda da descoberta (`oauth.ts`) não acha desafio no initialize, mas o candidato com sufixo
   `/.well-known/oauth-protected-resource/mcp/v1` responde 200, então a descoberta funciona assim mesmo.
3. **Sem `access_type=offline` o Google não devolve refresh token**, e o access token vence em cerca de 1 h. Hoje
   `montarUrlDeAutorizacao` não aceita parâmetros extras. Para os dois perfis Google funcionarem é preciso que o perfil
   possa pedir `access_type=offline` (e `prompt=consent` na reconexão). [G1][G2]
4. **O metadado do Sheets não anuncia `drive.file`** (anuncia `drive.readonly`, `spreadsheets.readonly`, `drive` e
   `spreadsheets`), mas a referência de `update_values` aceita `drive.file`. E **o Sheets MCP não tem ferramenta para
   listar ou buscar planilhas**: o Agente precisa receber o ID ou a URL da planilha.
5. **O Calendly não anuncia `revocation_endpoint`**, mas `POST https://calendly.com/oauth/revoke` existe (responde 403
   `unauthorized_client` para um token inválido). Como a desconexão só revoga quando o metadado anuncia, hoje o
   Calendly fica sem revogação no app.

## Google Calendar

| Ponto | Resultado | Estado |
| --- | --- | --- |
| (a) URL | `https://calendarmcp.googleapis.com/mcp/v1`, Streamable HTTP, sem estado (`serverInfo.name = "StatelessServer"`), protocolo `2025-06-18`. Developer Preview. [G2] | confirmado (curl + doc) |
| (b) Registro | **Pré-registrado.** O metadado do recurso em `/.well-known/oauth-protected-resource/mcp/v1` aponta para `https://accounts.google.com/`. O metadado do servidor de autorização (`accounts.google.com/.well-known/oauth-authorization-server` e `openid-configuration`) **não tem `registration_endpoint`**. Na doc: cliente OAuth "Aplicativo da Web" marcado como "Use this client for an AI-powered agent", tela de consentimento com o nome "Calendar MCP Server", e as APIs `calendar-json.googleapis.com` e `calendarmcp.googleapis.com` ativadas no projeto. PKCE S256 aceito. [G2] | confirmado (curl + doc) |
| (c) Escopos | O metadado do recurso anuncia `calendar`, `calendar.acls`, `calendar.calendarlist`, `calendar.calendarlist.readonly`, `calendar.calendars`, `calendar.calendars.readonly`, `calendar.events`, `calendar.events.freebusy`, `calendar.events.readonly`, `calendar.freebusy`, `calendar.readonly`, `calendar.settings.readonly`. A doc de configuração lista só os três de leitura (`calendar.calendarlist.readonly`, `calendar.events.freebusy`, `calendar.events.readonly`). `create_event` exige `calendar` ou `calendar.events`. [G2][G4] | confirmado |
| (c) Verificação | Ler eventos do Calendar é o exemplo de escopo **sensível** na doc do Google: exige verificação do app (justificativa por escopo, vídeo de demonstração, marca verificada), que costuma levar **3 a 5 dias úteis**. Nenhum escopo de Calendar aparece como restrito, então **não há avaliação de segurança CASA**. A classificação exata de `calendar.events.freebusy` e `calendar.calendarlist.readonly` é **não confirmado** (a página de escopos do Calendar não traz a classificação; o console mostra ao adicionar). [G5][G6] | parcial |
| (d) Identidade | O MCP não tem ferramenta "quem sou eu", e a resposta do token só traz `id_token` se houver o escopo `openid`. Proposta: pedir também `openid email` (não sensíveis) e ler o `email` do `id_token`, ou chamar `userinfo_endpoint` (`openidconnect.googleapis.com/v1/userinfo`). `list_calendars` também devolve a agenda principal com o e-mail. | não confirmado (não testado com token) |
| (e) Ferramentas | Leitura: `list_events`, `get_event`, `list_calendars`, `suggest_time`, `search_events`. Escrita: `create_event`, `update_event`, `respond_to_event`, `delete_event` (`destructiveHint`). Lido do `tools/list` ao vivo. Limites e custo do MCP: **não confirmado** (a doc não fala; vale a cota da Calendar API do projeto). Sem custo por chamada documentado. | confirmado (curl) |
| (f) Revogação | `https://oauth2.googleapis.com/revoke`, anunciado no metadado. Mesma origem do token endpoint (`oauth2.googleapis.com/token`), então a desconexão atual já revoga. | confirmado (curl) |

## Google Sheets

| Ponto | Resultado | Estado |
| --- | --- | --- |
| (a) URL | `https://sheetsmcp.googleapis.com/mcp/v1`, Streamable HTTP, sem estado, Developer Preview. [G1] | confirmado (curl + doc) |
| (b) Registro | **Pré-registrado**, igual ao Calendar: metadado em `/.well-known/oauth-protected-resource/mcp/v1` aponta para `https://accounts.google.com/`, sem `registration_endpoint`. APIs a ativar: `sheets.googleapis.com` e `sheetsmcp.googleapis.com`. Tela de consentimento com o nome "Sheets MCP Server". [G1] | confirmado |
| (c) Escopos | Metadado: `drive.readonly`, `spreadsheets.readonly`, `drive`, `spreadsheets`. Doc: `drive.readonly`, `drive.file`, `spreadsheets.readonly`, `spreadsheets`. `update_values` aceita `drive`, `drive.file` ou `spreadsheets`. [G1][G7] | confirmado |
| (c) Verificação | `spreadsheets` e `spreadsheets.readonly`: **sensíveis** (verificação de 3 a 5 dias úteis, sem CASA). `drive.file`: **não sensível** (recomendado). `drive` e `drive.readonly`: **restritos**, o que exige avaliação de segurança anual por avaliador credenciado (CASA), com verificação que "pode levar várias semanas" e se repete a cada 12 meses. [G5][G8][G9] | confirmado |
| (d) Identidade | Igual ao Calendar: pedir `openid email` e ler o `id_token`. O MCP do Sheets não tem ferramenta de identidade. | não confirmado |
| (e) Ferramentas | Leitura: `get_values`, `get_spreadsheet`. Escrita: `update_values`, `update_formulas`, `update_spreadsheet`, `insert_dimension`. **Nenhuma lista ou busca planilhas**: o participante informa o ID ou a URL. Limites: tipos de valor aceitos são booleano, texto e número; nulo é ignorado. Cotas e custo: **não confirmado** (vale a cota da Sheets API). [G7] | confirmado (curl + doc) |
| (f) Revogação | `https://oauth2.googleapis.com/revoke` (o mesmo servidor de autorização). | confirmado |

**Sobre `drive.file`:** dá acesso só a arquivos que o app criou ou que o usuário abriu com o app (seletor do Google
Picker). Como o MCP não cria nem abre arquivos pelo seletor, com só `drive.file` o Agente provavelmente não lê uma
planilha que o participante já tinha. Se `drive.file` sozinho funciona para planilhas existentes: **não confirmado**
(precisa de teste com token). O caminho sem CASA para ler planilhas existentes é `spreadsheets.readonly` (sensível).

## Calendly

| Ponto | Resultado | Estado |
| --- | --- | --- |
| (a) URL | `https://mcp.calendly.com` (na raiz; `/mcp` responde 404). POST sem token devolve 401 com `WWW-Authenticate: Bearer error="invalid_token", ..., resource_metadata="https://mcp.calendly.com/.well-known/oauth-protected-resource"` e um `mcp-session-id`. Hospedado só pela Calendly. [C1] | confirmado (curl + doc) |
| (b) Registro | **Dinâmico.** Metadado do recurso: `resource = "https://mcp.calendly.com/"` (**com barra final**), `authorization_servers = ["https://calendly.com/"]`. Metadado do servidor (`calendly.com/.well-known/oauth-authorization-server`): `registration_endpoint = https://calendly.com/oauth/register`, `authorization_endpoint = .../oauth/authorize`, `token_endpoint = .../oauth/token`, `token_endpoint_auth_methods_supported = ["none"]` (cliente público, sem secret), PKCE só S256. Sem token de registro, mas com validação e limite de taxa; a Calendly recomenda registrar uma vez por ambiente e reaproveitar o client ID. [C1] | confirmado (curl + doc) |
| (c) Escopos | Só `mcp:scheduling:read` e `mcp:scheduling:write`; a doc diz que os dois são necessários para acesso completo e que o servidor os atribui sozinho. Não há escopo por ferramenta. Se dá para conectar só com `read`: **não confirmado**. [C1] | confirmado |
| (d) Identidade | Ferramenta `users-get_current_user` (equivale a `GET /users/me`). Na API v2 a resposta do token traz `owner` e `organization`; se o token do MCP também traz: **não confirmado**. [C2] | parcial |
| (e) Ferramentas | 36 ferramentas: tipos de evento e disponibilidade, eventos e convidados, links de agendamento, formulários de roteamento, usuários e organização, e duas de "skills". Escrita relevante: `meetings-create_invitee` (agenda; **exige plano pago**), `meetings-cancel_event`, `scheduling_links-create_single_use_scheduling_link`, `shares-create_share`, `event_types-create_event_type` e `-update_event_type`, `event_types-update_event_type_availability_schedule`, `meetings-create_invitee_no_show` e `-delete_invitee_no_show`, `organizations-create_organization_invitation` e `-revoke_organization_invitation`. Formulários de roteamento exigem plano Teams ou superior. Limites de taxa e custo do MCP: **não confirmado**. [C2] | confirmado (doc) |
| (f) Revogação | **Não anunciada no metadado.** `POST https://calendly.com/oauth/revoke` existe (403 `unauthorized_client` para token inválido); `auth.calendly.com/oauth/revoke` também. O refresh token gira: cada uso invalida o anterior, então só o mais novo vale. [C3][C4] | parcial |

## Caminho recomendado por conector

### Google Calendar

- **Caminho:** MCP oficial com cliente pré-registrado, mas **só em teste interno** até o GA. Até lá o cartão fica
  "Em breve" para Clientes, com o motivo "servidor do Google em prévia".
- **Escopos padrão (menor privilégio):** `calendar.calendarlist.readonly`, `calendar.events.readonly`,
  `calendar.events.freebusy` e `openid email`. `calendar.events` só quando o Workspace der Executar para
  `create_event`, `update_event`, `respond_to_event` ou `delete_event`. Hoje o perfil já pede `calendar.events` de
  saída; a proposta é tirar e pedir de novo quando necessário (consentimento incremental).
- **Código:** o perfil precisa poder pedir `access_type=offline` (e `prompt=consent` na reconexão). Sem isso, a conexão
  cai em cerca de 1 h.

### Google Sheets

- **Caminho:** igual ao Calendar (pré-registrado, teste interno até o GA).
- **Escopos padrão:** `spreadsheets.readonly` e `openid email`. Escrita: `spreadsheets` (sensível, sem CASA). **Não**
  pedir `drive` nem `drive.readonly` (restritos, com CASA anual). Trocar o perfil atual (`spreadsheets` + `drive.file`):
  `drive.file` provavelmente não alcança as planilhas que o participante já tem.
- **Produto:** como não há busca de planilhas, a interface precisa pedir a URL da planilha.

### Calendly

- **Caminho:** pronto para o mecanismo genérico (registro dinâmico, cliente público, PKCE). O perfil atual está certo.
- **Escopos:** os dois (`mcp:scheduling:read` e `mcp:scheduling:write`); a Calendly não oferece escopo menor. O menor
  privilégio fica na permissão por ferramenta (ADR-0022): Ler para as de leitura; `meetings-create_invitee`,
  `meetings-cancel_event` e as de organização e tipo de evento só com Executar.
- **Ajustes no perfil:** (1) o `resource` anunciado tem barra final (`https://mcp.calendly.com/`); confirmar que o
  `resource` enviado é o do metadado e não a URL sem barra. (2) Declarar `https://calendly.com/oauth/revoke` como
  revogação no perfil, na mesma origem do token endpoint. (3) Identidade por `users-get_current_user`, ou pelo `owner`
  da resposta do token, se vier.

## Passos humanos (Nan)

1. **Google Developer Preview:** com a conta Workspace da Althius, ler os termos do programa e enviar o formulário em
   developers.google.com/workspace/preview, informando o projeto do Google Cloud. A aprovação leva alguns dias; aceitar
   o convite do Google Group que chega por e-mail.
2. **Projeto Google Cloud:** ativar `calendar-json.googleapis.com`, `calendarmcp.googleapis.com`,
   `sheets.googleapis.com` e `sheetsmcp.googleapis.com`
   (`gcloud services enable ... --project=PROJECT_ID`).
3. **Tela de consentimento (Google Auth Platform):** marca, domínio verificado, política de privacidade, público
   "Interno" para o teste, ou "Externo" em Testing com usuários de teste. Em Testing com público externo, o refresh
   token vence em 7 dias. Em Acesso a dados, os escopos da seção acima. [G6]
4. **Cliente OAuth:** "Aplicativo da Web", marcado como cliente para agente de IA, com a URL de retorno
   `https://ycbdilsmydvzezhlymty.supabase.co/functions/v1/integration-callback`. Um cliente pode servir os dois
   conectores; os segredos `GOOGLE_CALENDAR_MCP_*` e `GOOGLE_SHEETS_MCP_*` podem guardar o mesmo par. Gravar com
   `npx supabase secrets set` (nunca no chat).
5. **Verificação do Google (depois do GA):** enviar para verificação com justificativa por escopo e vídeo de
   demonstração; os escopos sensíveis levam de 3 a 5 dias úteis. Só entra CASA se algum dia for pedido `drive` ou
   `drive.readonly`. Há um limite de 100 refresh tokens por conta e por client ID.
6. **Calendly:** nenhum app a criar; só conectar a conta de teste. Para testar `meetings-create_invitee`, a conta de
   teste precisa de plano pago.

## Fontes

- G1. [Configure the Sheets MCP server](https://developers.google.com/workspace/sheets/api/guides/configure-mcp-server)
- G2. [Configure the Calendar MCP server](https://developers.google.com/workspace/calendar/api/guides/configure-mcp-server)
- G3. [Google Workspace Developer Preview Program](https://developers.google.com/workspace/preview)
- G4. [Calendar MCP: create_event](https://developers.google.com/workspace/calendar/api/v3/reference/mcp/tools_list/create_event)
- G5. [Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)
- G6. [Using OAuth 2.0 to Access Google APIs (expiração do refresh token)](https://developers.google.com/identity/protocols/oauth2)
- G7. [Sheets MCP: update_values](https://developers.google.com/workspace/sheets/api/reference/mcp/tools_list/update_values)
- G8. [Choose Google Sheets API scopes](https://developers.google.com/workspace/sheets/api/scopes)
- G9. [Restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)
- C1. [Calendly MCP Overview](https://developer.calendly.com/docs/mcp/calendly-mcp-server)
- C2. [Calendly MCP: Supported Tools](https://developer.calendly.com/supported-tools)
- C3. [Calendly FAQ (revogação de token)](https://developer.calendly.com/frequently-asked-questions)
- C4. [Refresh token rotation guide](https://developer.calendly.com/refresh-token-rotation-guide)
- Checagens ao vivo (19/10/2026): `POST` initialize, `tools/list` e `tools/call` nos três servidores;
  `GET /.well-known/oauth-protected-resource[/mcp/v1]` e `/.well-known/oauth-authorization-server` em
  `calendarmcp`, `sheetsmcp`, `mcp.calendly.com`, `accounts.google.com` e `calendly.com`; `POST /oauth/revoke` com
  token inválido no Calendly.

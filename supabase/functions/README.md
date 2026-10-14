# Integração de Contas remetentes com Unipile v2

As funções deste diretório tratam somente de Contas remetentes pessoais usadas por Sequências. Elas são diferentes dos
Canais de conversa com Agentes.

## Segredos de ambiente

Configure em Supabase Edge Function Secrets:

- `UNIPILE_API_KEY`: a Service API Key da aplicação Unipile (host único `api.unipile.com`, sem DSN por instância). Uma
  Account API Key não serve: ela não gerencia webhooks.
- `UNIPILE_WEBHOOK_SECRET`: o `secret` que a própria Unipile gera ao criar o Webhook Endpoint
  (`POST /v2/webhooks/endpoints`); usado para validar o header `unipile-signature` (HMAC-SHA256).
- `APP_ORIGIN`: origem do frontend, sem caminho. Pode listar várias, separadas por vírgula (a publicada primeiro, porque é para ela que a conexão de canal volta); `http://localhost` e `http://127.0.0.1` em qualquer porta são sempre aceitos pelo CORS, já que as funções exigem o JWT do usuário; a única chamada pelo navegador sem JWT, a `existing-account-email`, responde sempre igual e não devolve dado nenhum. O CORS fica em `_shared/cors.ts` e libera o cabeçalho `x-client-info` que o supabase-js manda.

- `RESEND_API_KEY`: chave da API do Resend, só com permissão de envio, usada pela `workspace-invitation-email` para mandar o e-mail do Convite e pela `existing-account-email` para o aviso de conta existente. O domínio do remetente precisa estar verificado no Resend.
- `INVITE_EMAIL_FROM` (opcional): remetente do e-mail do Convite e do aviso de conta existente. Padrão: `Althius <contato@althius.com.br>`.
- `SIGNALS_LLM_PROVIDER` (opcional), em `signal-runner` e `signal-cascade`: quem responde os passos de IA dos Sinais (classificar notícia e diário oficial). `hermes` (recomendado): o passo enfileira a classificação (`private.signal_llm_requests`) e o worker do Hermes, que já tem a OpenAI, a responde; exige o worker ligado (`HERMES_SINAIS_IA` não pode estar `off`). `openai` (plano B): a API da OpenAI direto, com `OPENAI_API_KEY` e `OPENAI_MODEL`. `regra` ou ausente (**padrão**): sem modelo, os passos usam a regra de palavra-chave. Valor desconhecido, ou `openai` sem chave ou sem modelo, cai em `regra` e avisa no log só o nome do que falta. Nunca há Anthropic nos Sinais, e `ANTHROPIC_API_KEY` não é lida por `signal-runner` nem por `signal-cascade`. `SIGNALS_LLM_PRICE_INPUT_PER_MILLION` e `SIGNALS_LLM_PRICE_OUTPUT_PER_MILLION` (dólares por milhão de tokens do modelo escolhido; sem eles vale um preço conservador) e `SIGNALS_LLM_TIMEOUT_MS` (prazo de cada classificação; entre 5 000 e 90 000, padrão 45 000) são opcionais. O custo do modelo entra no custo real do passo e na liquidação de créditos; se a classificação falha ou estoura o prazo, o passo usa a regra. Nenhum texto lido pelo usuário cita o fornecedor.
- `APIFY_TOKEN_1` a `APIFY_TOKEN_5` (opcionais) e o legado `APIFY_TOKEN` (opcional, entra como mais uma conta, índice 0): as contas de coleta, lidas por `_shared/apify-ambiente.ts` (`contasDeColeta`). Segredo vazio é pulado. O rodízio espalha as chamadas e, em 402, crédito ou limite de uso insuficiente, ou 429, marca a conta como esgotada (30 min para crédito, 2 min para limite) e segue na seguinte. O log e o rastro guardam só o índice, nunca o valor. A espera fica em `private.collection_account_cooldowns` (migração `20261014150000`); sem ela, vale só na instância. Usado por `signal-runner`, `signal-scan`, `signal-cascade`, descoberta e enriquecimento. **`contact-photo-lookup` continua lendo só `APIFY_TOKEN`**: não apague o legado por causa do rodízio. Só existe aqui, nunca no navegador, no log, no prompt do Hermes nem em mensagem ao usuário. **`APIFY_API_TOKEN` não é lido por nenhuma função**: se existir no projeto, apague (`npx supabase secrets unset APIFY_API_TOKEN --project-ref <ref>`).
- `APIFY_PHOTO_ACTOR_ID`, `APIFY_PHOTO_INPUT` e `APIFY_PHOTO_MAX_CHARGE_USD` (opcionais): o Actor, o modelo de entrada dele e o teto de cobrança por execução. Padrões e motivos em `contact-photo-lookup/README.md`.
- `ANTHROPIC_API_KEY`: chave da API da Anthropic, usada pela `agent-conversation` para os Agentes e a Coordenação. Só existe aqui, nunca no navegador. Sem ela, a função responde que as Conversas estão indisponíveis e a tela diz isso, sem resposta simulada.
- `ANTHROPIC_MODEL` (opcional): o modelo dos Agentes. Padrão: `claude-opus-5-5`.
- `AGENT_PROVIDER` (opcional): quem responde pelos Agentes, `anthropic` (padrão) ou `groq`. O Groq é só para teste: com ele, `GROQ_API_KEY` (a chave do Groq, só aqui) e `GROQ_MODEL` (o nome de um modelo do Groq que aceite ferramentas, como aparece no painel dele). Sem a chave e o modelo do provedor escolhido, as Conversas ficam indisponíveis.

- `STRIPE_SECRET_KEY`: a chave do Stripe, de preferência restrita (`rk_…`, permissões em `stripe-billing/README.md`), usada pela `stripe-billing` para abrir o checkout, o portal e ajustar os assentos. Só existe aqui, nunca no navegador.
- `STRIPE_PRICE_ID`: o preço recorrente por assento no Stripe (`price_…`), mensal, R$ 500 por usuário.
- `STRIPE_AUTOMATIC_TAX` (opcional): `true` liga o Stripe Tax no Checkout, só com registro ativo no Stripe Tax.
- `STRIPE_WEBHOOK_SECRET`: o segredo de assinatura do endpoint de webhook (`whsec_…`), usado pela `stripe-webhook` para conferir o cabeçalho `Stripe-Signature`.
- `HUBSPOT_MCP_CLIENT_ID` e `HUBSPOT_MCP_CLIENT_SECRET`: o client ID e o client secret do MCP Auth App do HubSpot (Development > MCP Auth Apps), usados pela `integration-connect` e pela `integration-callback`. Sem eles, o HubSpot mostra "Precisa configurar" e nada é prometido. A URL de retorno cadastrada no app é a da `integration-callback` (`https://<ref>.supabase.co/functions/v1/integration-callback`). O mesmo vale, por Integração, para `NOTION_MCP_CLIENT_ID`/`_SECRET`, `APOLLO_MCP_CLIENT_ID`/`_SECRET` e `META_ADS_MCP_CLIENT_ID`/`_SECRET`, mas são opcionais: o Notion se registra sozinho (registro dinâmico) e os outros só precisam se o servidor não aceitar registro dinâmico. Nunca no navegador.

O runtime fornece `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`. Nenhum segredo Unipile deve ser
definido com prefixo `VITE_` ou enviado ao cliente.

## Endpoints

- `agent-conversation` exige JWT de usuário. Aceita `capability` (`{available}`: se o modelo está configurado) e `send` com `workspaceId`, `conversationId` (opcional), `agentId` (a página do Agente; sem ele, a Coordenação), `text`, `mentions` e `clientRequestId`. Guarda o pedido com `start_agent_run` (sessão de quem pede; o mesmo `clientRequestId` devolve a mesma Execução) e responde `202 {conversationId, runId, status}`. A Execução continua depois da resposta (`EdgeRuntime.waitUntil`): `claim_agent_run` a reserva uma vez só, cada passo é gravado com `append_agent_run_event` e `finish_agent_run` fecha com sucesso (só com a resposta gravada) ou falha, com o motivo. A tela acompanha pelo banco (`get_agent_run_events`), então recarregar não roda de novo. A única consulta dos Agentes é `agent_search_target_accounts` (Contas-alvo ativas do Workspace). Recusa e corte do modelo viram falha; nos modelos que aceitam, uma recusa é refeita no servidor por outro modelo (`fallbacks: "default"`). Banco e modelo entram por injeção de dependência; `handler.test.ts` e `runner.test.ts` rodam sem rede.
- `agent-conversation` também aceita `enviar_ao_crm` com `workspaceId`, `targetAccountId`, `integrationId` e `clientRequestId` (ADR-0023): para o CRM conectado pela autorização (MCP), `begin_crm_handoff_by_agents` (chave de serviço, com quem o JWT identificou) confere tudo, cria a Conversa e a Execução com o pacote do envio e a tentativa ligada a ela; responde `202 {conversationId, runId, status}` e a Execução roda como qualquer pedido. Recusas com `code`: `nao_responsavel`, `ja_enviada`, `pela_chave`, `sem_agente`, `sem_acesso`, `nao_habilitada`.
- `access-request-notify` exige JWT de usuário (acesso-e-planos). O visitante do Workspace de demonstração manda o formulário "Fale com a equipe Althius" (`submit_access_request`: nome, empresa, telefone e mensagem, com limite de 5 pedidos por usuário a cada 24 horas) e chama esta função com `{ requestId }`. Ela reserva o aviso com a sessão de quem pediu (`claim_access_request_notice`: uma vez só) e manda o e-mail pelo `resendMail` para `althius.relacionamento@gmail.com`, endereço fixo no servidor. Se o provedor recusar (502), o aviso é solto (`release_access_request_notice`) para uma nova tentativa; se o envio ficar incerto (504), não é solto, para não mandar duas vezes. Usa os mesmos segredos da `workspace-invitation-email` (`RESEND_API_KEY`, `APP_ORIGIN`, `INVITE_EMAIL_FROM`).
- `existing-account-email` não exige JWT (`verify_jwt = false`): quem chama é o cadastro, sem sessão, quando o `signUp` devolve um usuário sem identidades (o e-mail já tem conta e o Supabase Auth não manda nada). Aceita `{ email }` e responde sempre `202 {accepted: true}` (`400` só para e-mail fora do formato), antes de consultar o banco, para nem a resposta nem o tempo dizerem se o e-mail tem conta. Depois da resposta (`EdgeRuntime.waitUntil`), reserva o aviso com a chave de serviço (`claim_existing_account_notice`: Conta de usuário confirmada, um aviso a cada 10 minutos e três por dia por conta, 200 por hora no total) e manda pelo Resend o e-mail "Você já tem conta na Althius", com os links de `/entrar` e `/esqueci-a-senha` na origem de quem pediu, se estiver no `APP_ORIGIN`. O log diz o desfecho (`sent`, `skipped`, `claim_failed`, `refused`, `uncertain`), nunca o e-mail.
- `account-password` exige JWT de usuário (CRM-08): a troca de senha em Meu perfil, feita no servidor. Aceita `{ confirmacao: { tipo: 'senha', senhaAtual, captchaToken } | { tipo: 'codigo', codigo, captchaToken? }, novaSenha }`; a Conta de usuário e o e-mail vêm do JWT. Aplica a política de senha (`_shared/politica-de-senha.ts`), reserva a tentativa (`claim_password_change_attempt`: 5 sem sucesso em 15 minutos), confere a senha atual (`/token`, com o CAPTCHA) ou o código (`/verify`) no Supabase Auth e troca por `PUT /user` com a sessão aberta pela confirmação, que volta ao navegador. Responde `200 { ok, outrasSessoesEncerradas, sessao }` ou `{ erro }`: `sem_sessao`, `pedido_invalido`, `senha_fraca` (com `motivo`), `limite`, `captcha_invalido`, `confirmacao_invalida`, `mesma_senha`, `falha`. Detalhes, a configuração do Supabase Auth e por que não `auth.admin.updateUserById` em `account-password/README.md`.
- `integration-connect` exige JWT de usuário (conexoes-funcionais 03, ADR-0017 e ADR-0021). O participante conecta o PRÓPRIO Acesso a uma Integração habilitada no Workspace. Aceita `{ action, workspaceId, integrationId }`: `iniciar` (OAuth no servidor MCP oficial: descobre o servidor de autorização por RFC 9728/8414 ou usa os endereços do perfil, escolhe o cliente OAuth, o pré-registrado dos segredos de ambiente ou o de registro dinâmico RFC 7591 guardado no banco, abre a tentativa com `state` + PKCE S256 por 10 minutos e devolve `{ url }`, o consentimento) e `chave` (com `chave`: a chave de API do participante, validada chamando o app e só então guardada no Vault; devolve `{ ok, conta, portal }`, nunca a chave). O banco confere a Participação ativa e a habilitação (RPCs de serviço `start_integration_connect` e `save_integration_api_key` com o participante que o JWT identificou). Erros com `code`: `nao_configurada` (503, faltam os segredos do app de autorização: "Precisa configurar"), `nao_habilitada` e `portal_diferente` (409), `chave_recusada`, `chave_nao_validada` e `portal_nao_identificado` (422), `sem_participacao` (403), `indisponivel` (502).
- `integration-callback` não exige JWT (`verify_jwt = false`): é o destino do retorno do OAuth, um redirecionamento do navegador com `?code&state`. O `state` é a autenticação: precisa casar com uma tentativa pendente, no prazo, de um participante ainda ativo e com a Integração habilitada (`integration_connect_attempt`). A função troca o código com o verificador PKCE, identifica a conta e o portal, grava o Acesso (`complete_integration_connect`, que consome a tentativa: um retorno repetido não vale, e um portal diferente do fixado é recusado) e redireciona o navegador para `<origem do app>/conexoes?conexao=ok&integracao=<id>` ou `?conexao=erro&integracao=<id>&motivo=<invalida|usada|expirada|participacao_inativa|nao_habilitada|recusada|falha_na_troca|indisponivel|portal_diferente|portal_nao_identificado|erro>`. Só volta para origens do `APP_ORIGIN`. O token nunca passa pelo navegador nem pelo log.
- `integration-tools` exige JWT de usuário. `{ action: 'listar', workspaceId, integrationId }` devolve as ferramentas do servidor da Integração (nome, descrição, se escreve ou gasta) com o Acesso do participante; `{ action: 'chamar', …, ferramenta, argumentos, agentId? }` chama só ferramenta de LEITURA, sob a Permissão do Agente quando `agentId` vem. Erros tipados com `code`: `precisa_reconectar` (409, com `motivo`), `nao_habilitada` (409), `permissao_negada` (403, com `exigida` e `atual`), `indisponivel` (502), `ferramenta_invalida` (400). `{ action: 'executar_aprovacao', approvalId }` executa, logo depois de um Administrador aprovar na Conversa, a chamada de ferramenta que um Agente propôs (ADR-0022): exatamente aquela, uma vez, com o executor conferindo de novo que quem pede é Administrador ativo.
- `_shared/integration-access.ts` é a API que as outras funções e, depois, os Agentes usam: `listarFerramentas(deps, { workspaceId, userId, integrationId })` e `chamarFerramenta(deps, { …, ferramenta, argumentos, agenteId?, somenteLeitura? })`. Renovam o token quando está vencendo ou o app o recusa (gravando o refresh token novo junto com o access token, porque HubSpot e Notion o trocam a cada renovação), conferem a Permissão do Agente (Ler chama leitura; Propor devolve `permissao_negada` nas que escrevem, para o motor criar a Aprovação; Executar chama tudo; sem Agente, só leitura) e devolvem `{ ok: true, valor }` ou `{ ok: false, erro }` com o erro tipado, sem nunca devolver token. Os perfis por Integração (endereço do MCP, registro do OAuth, chave de API, ferramentas REST onde não há MCP) estão em `_shared/integracoes/perfis.ts`, com os pontos não confirmados marcados.
- `crm-handoff` exige JWT de usuário (kanban-de-prospeccao 05, ADR-0020). `{ action: 'enviar', workspaceId, targetAccountId, integrationId }` leva a Conta-alvo, os Contatos com Vínculo ativo e uma nota (Sinais ativos e abordagem) ao CRM em que o PRÓPRIO participante tem Acesso conectado. `begin_crm_handoff` (só `service_role`, com o participante do JWT) confere Participação ativa, Vendedor responsável, Integração de categoria CRM habilitada e Acesso `conectado`, e recusa um segundo envio da mesma Conta (depois do envio, o CRM manda). O escritor de cada CRM está em `_shared/envio-ao-crm.ts`: HubSpot (Company, Contacts associados por `associations` e nota associada), Pipedrive (organization, persons com `org_id` e nota) e RD Station CRM (empresa e contatos; a nota fica como pendência, sem endpoint confirmado). Cada objeto criado é gravado na hora (`save_crm_handoff_progress`); uma falha grava `falhou` com o que já existe no CRM, e a nova tentativa não cria de novo. Deu certo: `finish_crm_handoff` grava `enviado` e o cartão vai para No CRM. Só o caminho da chave de API tem as ferramentas de escrita: com o Acesso por autorização (MCP), responde 409 `caminho_sem_escrita` pedindo a chave (Private App no HubSpot). Respostas: `200 {status: 'enviado', mensagem, pendencias}`; erros com `error` e `code`: `nao_responsavel`/`participacao` (403), `conta` (404), `ja_enviada`, `sem_acesso`, `nao_habilitada`, `caminho_sem_escrita`, `precisa_reconectar` (409), `nao_crm` (400), `falhou`/`indisponivel` (502). A ação da pessoa não passa por Aprovação (ela já decide, ADR-0002): `chamarFerramenta` recebe `decisaoDaPessoa`, que só o servidor marca depois de o banco conferir. O executor das Aprovações de Agentes reaproveita `escreverNoCrm` passando `chamarFerramenta` com `agenteId` (próxima fatia).
- `sender-accounts` exige JWT de usuário e participação ativa no Workspace. Aceita `list`, `connect`, `reconnect` e
  `disconnect`; conecta e reconecta via `POST /v2/auth/link` (link novo usa `providers`, reconexão usa `account_id`) e
  desconecta via `DELETE /v2/accounts/{id}`.
- `sequence-step-sends` exige JWT do titular e participação ativa no Workspace. Aceita `send` com `workspaceId` e
  `sendId` (o Envio do passo criado por `confirm_sequence_step`). Não decide nada sozinha: chama
  `release_sequence_step_send` (só `service_role`, com o `p_user_id` validado pelo JWT), que trava a Sequência e exige
  Sequência `ativa`, titular com Participação ativa e ainda responsável, Conta remetente de E-mail em `ready` sem
  `reconciliation_required` e o e-mail atual do Contato igual ao Destino confirmado (ADR-0014). Liberado, envia por
  `POST /v2/{account_id}/emails/send` com `plain_text`, o cabeçalho `X-Althius-Envio: <id do Envio>` em `custom_headers`
  e, num passo cujo assunto começa com `Re:`, `reply_to_message_id` com o `message_id` do último e-mail enviado ao mesmo
  Contato nesta Sequência. O resultado vai para `record_sequence_step_send_result`: `sent` (guarda `id` e `message_id`,
  e registra a Interação `email-enviado` da Conta-alvo), `failed` (HTTP fora de 2xx) ou `uncertain` (timeout de 25 s ou
  falha de rede). Respostas: `200 {outcome: "sent"}`, `409 {outcome, message}` quando o banco bloqueia
  (`sender_not_ready`, `destination_changed`, `contact_unlinked`, `sequence_not_active`, `already_sent`, `in_flight`,
  `reconcile_required`, `not_confirmed`, `owner_not_responsible`), `502` para `failed` e `504` para `uncertain` (também
  quando a Unipile responde 2xx sem o `id`). Um Envio parado em `sending` há mais de 10 minutos vira `uncertain` na
  próxima liberação, em vez de ficar preso. Aceitação do provedor não é entrega nem leitura. A Unipile e o banco entram
  por injeção de dependência (`handler.ts`); `handler.test.ts` vai da requisição à resposta, e o CI roda `deno check` e
  `deno test` em `supabase/functions`.
- `unipile-account-status` é o único receptor de webhook: a Unipile v2 entrega todos os eventos de conta (`account.*`) e
  de e-mail (`email.new`, `email.new.bounce`) num Webhook Endpoint só, assinado por HMAC-SHA256. A lógica fica em
  `handler.ts`, com o banco, a Unipile e o Storage injetados; `handler.test.ts` vai da requisição à resposta, inclusive
  a assinatura. A correlação com a tentativa de conexão usa o campo `state` (o UUID da tentativa) enviado em
  `POST /v2/auth/link` e devolvido no evento `account.add`/`account.reconnect`, não mais um callback de redirecionamento
  separado. Os event types mapeiam para o mesmo vocabulário que a RPC já usava na v1: `account.add`→`CREATION_SUCCESS`,
  `account.reconnect`→`RECONNECTED`, `account.initial_sync.completed`→`SYNC_SUCCESS`, `account.status.running`→`OK`,
  `account.status.disconnected`→`CREDENTIALS`, `account.status.errored`→`ERROR`, `account.remove`→`DELETED`. Na v2 só
  WhatsApp e IMAP fazem sincronização inicial: para eles, é o `account.initial_sync.completed` que leva a conta de
  `syncing` a `ready`. Os outros provedores (Google, Outlook, LinkedIn) já chegam com o histórico disponível e nunca
  mandam esse evento, então a própria função aplica o `SYNC_SUCCESS` logo depois do `account.add`. O Webhook Endpoint
  precisa estar inscrito nesses 7 eventos de conta mais `email.new` e `email.new.bounce` (9 no total; o
  `scripts/wizard-unipile.sh` já os lista). Cada entrega deixa uma linha JSON nos logs da função, com o tipo, o id da
  conta na Unipile e o desfecho, sem o conteúdo do evento. Eventos v2 sem equivalente na v1
  (`account.status.degraded`/`partial`, `account.locked`/`unlocked`, `account.initial_sync.running`/`failed`) são
  reconhecidos (HTTP 200) e ignorados: não há estado interno para eles ainda.

Estados de erro (`CREDENTIALS`, `ERROR`, `STOPPED`) colocam a Conta remetente em `reconnect_required` e definem
`reconciliation_required`. O retorno de uma sincronização posterior mantém `syncing` enquanto essa trava estiver ativa.
A reconciliação do backlog e a liberação explícita dessa trava pertencem aos tickets posteriores de reconexão; eventos
de início atrasados não regridem uma Conta pronta.

- **E-mail recebido** (`email.new`, `email.new.bounce`): a função extrai o objeto Email do `payload.email`, os endereços
  do titular do `account_name` do envelope, e chama `ingest_unipile_email_event` (só `service_role`), que faz tudo numa
  transação: deduplica pelo `id` do evento (`evt_…`) e pelo par (Conta remetente, `email.id`), porque o `email.new` sai
  de novo quando o e-mail é movido; classifica **eco** (o `id`, o `message_id` ou o cabeçalho `X-Althius-Envio` batem
  com um Envio, ou o `from` é do titular: confirma um envio `sending`/`uncertain` como `sent`, guarda o `thread_id` e
  aprende o endereço do titular em `sender_accounts.email_address`, não pausa nada), **automático** (`mailer-daemon`,
  `no-reply`, `Auto-Submitted`: não é resposta comercial), **resposta** (o `thread_id` é de um passo enviado, ou o
  `In-Reply-To`/`References` traz um `message_id` enviado, e o `from` não é do titular: grava a Interação pública
  `email-recebido` da Conta-alvo, o conteúdo privado em `private.received_emails` e põe a Sequência em `pausada`, com
  `motivoPause` "Contato respondeu" no documento), **bounce** (`email.new.bounce` traz o e-mail ORIGINAL: o Envio vira
  `bounced`) ou **sem relação** (só o id do evento e o desfecho). Responde `2xx` logo depois; os anexos baixam em
  `EdgeRuntime.waitUntil`, pela `url` que vier no objeto Email ou por
  `GET /v2/{account_id}/emails/{email_id}/attachments/{attachment_id}`, para o bucket privado `email-attachments`
  (caminho `recebidos/<interação>/<anexo>/<nome>`; um id de anexo com mais de 120 caracteres, comum no Outlook, vira o
  SHA-256 dele; o tipo guardado vem do download, do Email ou da extensão), e `record_received_email_attachment` marca cada um como `stored` ou
  `failed`. Só o titular lê assunto, corpo e anexos, por `get_received_email` (`auth.uid()`); os demais veem a Interação
  sem conteúdo.
- `received-email-attachments` exige JWT do titular. Aceita `interactionId` e `attachmentId`, resolve o caminho por
  `get_received_email_attachment_path` (só o titular) e devolve uma URL assinada do bucket privado, válida por 5
  minutos.
- Antes de liberar um passo seguinte ao mesmo Contato (uma conversa já aberta por um envio anterior),
  `sequence-step-sends` chama `conversation_for_send` e confere a conversa na Unipile
  (`GET /v2/{account_id}/threads/{thread_id}` e `GET /v2/{account_id}/email-senders`): cada e-mail encontrado passa pela
  mesma ingestão; uma resposta ainda não gravada pausa a Sequência e o envio não sai (`409 reply_found`). Se a
  conferência falhar, o envio também não sai (`409 thread_check_failed`). A forma exata dessas duas respostas da Unipile
  ainda precisa ser conferida no primeiro envio real.

O webhook precisa ficar sem verificação JWT do gateway porque a Unipile não envia JWT Supabase; a própria função
autentica cada entrega pela assinatura HMAC, com uma janela de 5 minutos contra replay.

- `sequence-runner` é o Executor da Sequência (canais-05). O banco o chama, sem pessoa nem navegador:
  - a cada minuto, o pg_cron roda `private.kick_sequence_runner()`. Ele passa a incertos os envios esquecidos em voo e, só quando há passo automático vencido de uma versão ativa, chama a função pelo pg_net;
  - a chamada leva `x-runner-token`, um token gerado e guardado só no banco (`private.sequence_runner_settings`). A função o confere por `sequence_runner_token_matches` e roda sem verificação JWT do gateway;
  - a função responde `202` na hora e segue em segundo plano. Reserva até 5 passos (`claim_due_step_sends`) e envia um por vez pelo mesmo núcleo do envio manual (`_shared/send-step.ts`), liberando por `release_due_step_send`;
  - o resultado vai para `record_sequence_step_send_result`, com o `Retry-After` da Unipile quando houver;
  - com o ritmo ligado (ritmo-de-envio), cada rodada reserva no máximo um passo por Conta remetente, espera de 1 a 4 s entre dois envios, renova a reserva do que falta (`renew_due_step_send_claims`) e trata `rate_limited`, `daily_cap` e `weekly_cap` como adiamento: o banco reagenda o passo e nada é enviado.
- `sequence-runner` também reconcilia uma Conta remetente que voltou de uma queda (canais-03). Antes dos envios de cada rodada, com até 60 s, ele:
  - reserva as contas prontas para reconciliar (`claim_sender_reconciliations`);
  - confere na Unipile, em páginas e guardando até onde foi (`conversations_to_reconcile`, `record_reconciliation_progress`), a última conversa de cada Contato das Sequências que saíram pela conta;
  - só então libera a conta (`finish_sender_reconciliation`). Até lá, nenhum passo sai por ela.
- `sequence-step-sends` e `sequence-runner` compartilham o núcleo do envio: conferir a conversa, liberar pelo banco, enviar pela Unipile e gravar o resultado. Os adaptadores reais ficam em `_shared/send-step-adapters.ts`.

- `workspace-invitation-email` manda o e-mail do Convite (CRM-03). O navegador pede `{ workspaceId, invitationId }` depois de registrar o Convite. A função reserva o envio no banco com a sessão de quem pede (`claim_invitation_email`): só um Administrador ativo do Workspace, só um Convite pendente, e no máximo um e-mail por minuto e três por dia por Convite, e cinquenta por dia por Workspace (429 acima disso). Ela manda pelo Resend o link `<origem do app>/convite/<token>`, com a origem de quem pediu só se ela estiver no `APP_ORIGIN` (senão a primeira publicada), e responde `{ sent: true }` só quando o Resend confirma. Uma recusa volta 502 e um envio sem confirmação volta 504; nos dois casos o link continua na tela para ser copiado. O assunto é fixo: nomes escritos por quem usa o app só entram no corpo, escapados e cortados.

- `contact-photo-lookup` busca a foto pública do Contato pelo perfil LinkedIn dele (CRM-12), por um Actor do Apify. O navegador pede `{ contactId }` numa ação do Contato, nunca ao desenhar a lista. A função reserva a consulta no banco com a sessão de quem pede (`begin_contact_photo_lookup`): qualquer Participação ativa do Workspace do Contato, um perfil `/in/`, uma consulta em andamento por Contato, no máximo uma por minuto e três por dia por Contato e cinquenta por dia por Workspace (429 acima disso). Só então roda o Actor, e grava a resposta com a chave de serviço (`finish_contact_photo_lookup`, só `service_role`): guarda a URL da imagem, o Actor, a execução e a data de observação, e nada além disso do perfil. Respostas: `200 {status: "found" | "not_found"}`, `404` (Contato de outro Workspace), `409` (em andamento, ou foto manual), `422` (sem perfil LinkedIn), `429`, `502` (o Apify recusou) e `504` (prazo). Detalhes, Actor escolhido e retenção em `contact-photo-lookup/README.md`.
- `signal-cascade` roda a busca de Sinais por cascata a pedido da conversa (sinais em cascata): só o servidor chama (o worker do Hermes, com a chave de serviço; `verify_jwt = true` e papel de serviço). `{ workspaceId, userId, sinal, contas?, criterios?, tetoCreditos?, chave? }` roda o MESMO motor dos Monitoramentos (`_shared/cascata-de-sinais`) com as contas do Apify que só existem nos segredos desta função; `{ action: 'catalogo' }` devolve os tipos de Sinal por ICP e o estado de cada um. `validacao: true` (só a equipe, com a chave de serviço; o Hermes nunca o envia) deixa rodar um Sinal ainda em `testing`: é assim que se faz a execução real de validação antes de `set_signal_cascade_state(..., 'available')`. Nessa execução o registro guarda até 5 CNPJs e razões sociais achados que não são Conta (sem dado de pessoa), para criar a Conta e repetir a busca. A resposta é só itens normalizados, créditos e mensagem em palavras do produto. Detalhes em `signal-cascade/README.md`.
- `csv-import` recebe o CSV da importação de Contas e Contatos (CRM-07). O navegador manda um formulário `multipart` com `workspaceId` e `file` (até 5 MB e 5.000 linhas de dados). A função abre o lote com a sessão de quem pede (`create_import_batch`: só Participação ativa; o caminho no bucket sai do banco), guarda o arquivo no bucket privado `csv-imports` com a chave de serviço, lê o CSV (UTF-8 ou Windows-1252, delimitador `,` `;` tabulação ou `|`, cabeçalho detectado, aspas) e entrega os registros em blocos ao banco (`stage_import_rows`, `finish_import_upload`, só `service_role`), com um mapeamento sugerido pelos nomes das colunas. Responde `{ batchId }`. Um arquivo que não pode ser lido (vazio, aspas abertas, grande demais, codificação) falha o lote com o motivo (`fail_import_upload`, 422), e uma falha do Storage ou do banco também o fecha, para a tela não esperar. O mapeamento, a prévia, a confirmação e o processamento em blocos são funções do banco que o navegador chama direto (`preview_import_batch`, `confirm_import_batch`, `process_import_chunk`…), porque o banco confere Participação e papel por `auth.uid()`. Nenhuma política de Storage libera o bucket ao navegador.

- `storage-purge` apaga do Storage as pastas que o banco enfileirou quando dados pessoais são apagados (CRM-18). O Storage não deixa remover o arquivo por SQL, então `erase_target_account` e `erase_contact` só gravam o prefixo (`recebidos/<interação>/`, nunca o nome do arquivo) em `private.storage_purge_queue`, duas vezes: agora e uma hora depois, para pegar um anexo que um download em andamento gravou depois. A cada 5 minutos o pg_cron roda `private.kick_storage_purge()`, que só chama a função (pg_net, com o token do banco em `x-purge-token`, guardado em `private.storage_purge_settings`) quando há pasta vencida. A função confere o token por `storage_purge_token_matches`, roda sem verificação JWT do gateway, responde `202` e segue em segundo plano: reserva as pastas (`claim_storage_purge`), lista e remove tudo sob o prefixo pela API do Storage (com a chave de serviço) e dá baixa (`finish_storage_purge`); uma falha volta a pasta à fila, até 20 tentativas. Recusa prefixo de um só nível, para nunca apagar mais do que a pasta de um registro. Nada do prefixo vai para o log. A importação por CSV (CRM-07) pode usar a mesma fila para o bucket `csv-imports`.

## Ligar o e-mail do Convite (CRM-03)

1. No PowerShell, cadastrar a chave do Resend digitando-a no próprio terminal: `npx supabase secrets set RESEND_API_KEY=<chave> --project-ref <ref>`.
2. Publicar: `npx supabase functions deploy workspace-invitation-email --project-ref <ref>`.
3. Convidar um e-mail seu em Configurações → Workspace e conferir a caixa de entrada.

## Ligar a foto do Contato (CRM-12)

1. Aplicar a migration `20260929120000_foto_do_contato.sql` (conforme `docs/agents/migrations.md`).
2. Cadastrar o token do Apify digitando-o no próprio terminal: `npx supabase secrets set APIFY_TOKEN=<token> --project-ref <ref>` (o `APP_ORIGIN` já existe). Se for trocar o Actor, cadastre também `APIFY_PHOTO_ACTOR_ID` e `APIFY_PHOTO_INPUT`.
3. Publicar: `npx supabase functions deploy contact-photo-lookup --project-ref <ref>`.
4. Num Contato com LinkedIn `/in/`, usar a ação de buscar foto e conferir o estado em `contact_photo_status`.

## Ligar a limpeza do Storage (CRM-18)

1. Aplicar a migration `20260929160000_arquivar_e_apagar_dados_comerciais.sql` (conforme `docs/agents/migrations.md`); ela agenda o job `althius-storage-purge` onde há pg_cron e pg_net.
2. Publicar a função: `npx supabase functions deploy storage-purge --no-verify-jwt --project-ref <ref>`. Ela só usa o que o runtime fornece (`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`).
3. No SQL Editor, uma vez por projeto: `select private.configure_storage_purge('https://<ref>.supabase.co');`. Sem esse endereço, o banco não chama nada e a fila só cresce (o apagamento dos dados no banco não depende dela).

## Ligar o Executor (canais-05)

1. Aplicar as migrations (`npx supabase db push --linked`). A migration `20260927020000_executor_da_sequencia.sql` liga o pg_cron e o pg_net e agenda o job `althius-sequence-runner`.
2. Publicar a função: `npx supabase functions deploy sequence-runner --no-verify-jwt --project-ref <ref>`. Ela usa o mesmo segredo `UNIPILE_API_KEY`.
3. No SQL Editor, uma vez por projeto: `select private.configure_sequence_runner('https://<ref>.supabase.co');`. Sem esse endereço, o banco não chama nada.

`scripts/wizard-canais-05.sh` conduz esses três passos e o teste real com o navegador fechado.

## Ligar o ritmo de envio (ritmo-de-envio)

1. Aplicar a migration `20261010120000_ritmo_de_envio.sql` (conforme `docs/agents/migrations.md`).
2. Publicar: `npx supabase functions deploy sequence-runner sequence-step-sends --project-ref <ref>` (sem segredo novo).
3. Ligar, no SQL Editor: `select private.set_send_rate_enabled(true);`. Desligado, nada muda: o horário dos passos, o lote e a reserva são os de antes.

Os padrões (intervalo, variação e limites por Conta remetente) estão em `private.send_rate_settings` e `private.send_caps`; o administrador do Workspace os muda por `set_send_pacing` e `set_send_cap`.

## Ligar a importação por CSV (CRM-07)

1. Aplicar a migration `20260929150000_importacao_csv.sql` (ela cria o bucket privado `csv-imports` quando o Storage existe; se o projeto não o criar, crie-o privado, com limite de 5 MB, e sem nenhuma política).
2. Publicar: `npx supabase functions deploy csv-import --project-ref <ref>`. Não há segredo novo: usa `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `APP_ORIGIN`.

## Ativar o canais-04 (migrations, funções e eventos de e-mail)

`scripts/wizard-canais-04.sh` conduz a ativação num terminal: liga a Supabase CLI ao projeto, aplica as migrations pendentes com `supabase db push`, confere os três segredos, publica `sequence-step-sends`, `received-email-attachments` e `unipile-account-status` (esta com `--no-verify-jwt`), acrescenta `email.new` e `email.new.bounce` ao Webhook Endpoint já cadastrado (por API, ou pelo painel se a API recusar; nunca cria outro endpoint) e descreve o ciclo real de teste.

## Configurar ou trocar a conta Unipile

As funções `sender-accounts` e `unipile-account-status` estão publicadas em `ycbdilsmydvzezhlymty` (a versão com e-mail,
`sequence-step-sends` e `received-email-attachments` ainda precisam ser publicadas); a URL delas não muda entre contas
Unipile. Rode `scripts/wizard-unipile.sh` para obter a chave de API, registrar o Webhook Endpoint direto por API
(capturando o `secret` que a Unipile gera) e colar os três segredos — nenhum menu do painel da Unipile precisa ser
adivinhado. Depois, `npm run unipile:testar -- email` (em `projeto-althius-frontend`) conecta uma conta de verdade de
ponta a ponta e confere o estado pela mesma Edge Function que o app usa.

Rode o wizard de novo a cada troca de conta Unipile
([ADR-0015](../../docs/adr/0015-conta-unipile-descartavel-durante-a-pre-producao.md)): o teste grátis de 7 dias, depois
a conta paga de outro sócio, depois a conta oficial da empresa. Só os três segredos mudam; o código não é publicado de
novo. O wizard também marca as Contas remetentes conectadas na conta anterior como `reconnect_required`, porque o
`unipile_account_id` delas não existe na conta nova — sem apagar nada: Contatos, Contas-alvo, Sequências e Interações
continuam intactos, e cada pessoa só precisa reconectar o canal.

## Ligar as Conexões (conexoes-funcionais)

1. Aplicar a migration `20261001160000_acessos_as_integracoes.sql` (conforme `docs/agents/migrations.md`). Os tokens e as chaves ficam no Vault do Supabase (a extensão `supabase_vault` já vem no projeto).
2. Publicar: `npx supabase functions deploy integration-connect --project-ref <ref>`, `npx supabase functions deploy integration-tools --project-ref <ref>` e `npx supabase functions deploy integration-callback --no-verify-jwt --project-ref <ref>` (a `config.toml` já marca a `integration-callback` sem JWT).
3. HubSpot: criar o MCP Auth App no HubSpot (Development > MCP Auth Apps), cadastrar a URL de retorno `https://<ref>.supabase.co/functions/v1/integration-callback` e cadastrar os segredos digitando-os no próprio terminal: `npx supabase secrets set HUBSPOT_MCP_CLIENT_ID=<id> HUBSPOT_MCP_CLIENT_SECRET=<secret> --project-ref <ref>`. Mudar segredos exige combinar antes (AGENTS.md). O Notion não pede nada. Apollo e Meta Ads: ver os tickets 10 e 13.
4. No app, um Administrador habilita a Integração em Conexões e cada participante conecta o próprio Acesso. A conexão real com um portal é o ticket 09.

## Ligar o Envio ao CRM (kanban 05)

1. Aplicar a migration `20261001200000_envio_ao_crm.sql` (conforme `docs/agents/migrations.md`).
2. Publicar: `npx supabase functions deploy crm-handoff --project-ref <ref>` (sem segredo novo: usa `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `APP_ORIGIN`).
3. HubSpot: criar um Private App na conta de teste com os escopos `crm.objects.companies.write`, `crm.objects.contacts.write` (e os de leitura que a Sincronização já usa) e conectar em Conexões pela chave de API. Pela autorização (MCP), o envio responde pedindo a chave.

## Ligar os anexos dos passos (canais-10)

1. Aplicar a migration `20261002120000_anexos_dos_passos.sql` (conforme `docs/agents/migrations.md`). Ela cria o bucket privado `sequence-attachments` (16 MB, só imagem e MP4, sem política em `storage.objects`: só a função, com a chave de serviço, grava e assina).
2. Publicar: `npx supabase functions deploy sequence-attachments sequence-runner sequence-step-sends storage-purge --project-ref <ref>` (sem segredo novo). `sequence-attachments` exige o JWT do titular: o banco confere a Sequência, o passo e os limites do canal antes de o arquivo ir ao bucket, e abrir devolve uma URL assinada de 2 minutos.
3. Ligar o módulo, no SQL Editor: `select private.set_sequence_attachments_enabled(true);`. Desligado, a tela diz que os anexos não estão disponíveis.

## Ligar a pausa pela Conta remetente (canais-11)

1. Aplicar a migration `20261002121000_reconexao_e_acesso_revogado.sql`.
2. Publicar: `npx supabase functions deploy unipile-account-status --no-verify-jwt --project-ref <ref>` e `npx supabase functions deploy sequence-runner sender-accounts --project-ref <ref>`. Nenhum segredo e nenhum evento novo no Webhook Endpoint: os `account.status.*` e o `account.remove` já chegam.

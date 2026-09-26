# Integração de Contas remetentes com Unipile v2

As funções deste diretório tratam somente de Contas remetentes pessoais usadas por Sequências. Elas são diferentes dos
Canais de conversa com Agentes.

## Segredos de ambiente

Configure em Supabase Edge Function Secrets:

- `UNIPILE_API_KEY`: a Service API Key da aplicação Unipile (host único `api.unipile.com`, sem DSN por instância). Uma
  Account API Key não serve: ela não gerencia webhooks.
- `UNIPILE_WEBHOOK_SECRET`: o `secret` que a própria Unipile gera ao criar o Webhook Endpoint
  (`POST /v2/webhooks/endpoints`); usado para validar o header `unipile-signature` (HMAC-SHA256).
- `APP_ORIGIN`: origem HTTPS do frontend, sem caminho.

O runtime fornece `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`. Nenhum segredo Unipile deve ser
definido com prefixo `VITE_` ou enviado ao cliente.

## Endpoints

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
  (caminho `recebidos/<interação>/<anexo>/<nome>`), e `record_received_email_attachment` marca cada um como `stored` ou
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

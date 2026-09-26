# Integração de Contas remetentes com Unipile v2

As funções deste diretório tratam somente de Contas remetentes pessoais usadas por Sequências. Elas são diferentes dos Canais de conversa com Agentes.

## Segredos de ambiente

Configure em Supabase Edge Function Secrets:

- `UNIPILE_API_KEY`: a Service API Key da aplicação Unipile (host único `api.unipile.com`, sem DSN por instância). Uma Account API Key não serve: ela não gerencia webhooks.
- `UNIPILE_WEBHOOK_SECRET`: o `secret` que a própria Unipile gera ao criar o Webhook Endpoint (`POST /v2/webhooks/endpoints`); usado para validar o header `unipile-signature` (HMAC-SHA256).
- `APP_ORIGIN`: origem HTTPS do frontend, sem caminho.

O runtime fornece `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`. Nenhum segredo Unipile deve ser definido com prefixo `VITE_` ou enviado ao cliente.

## Endpoints

- `sender-accounts` exige JWT de usuário e participação ativa no Workspace. Aceita `list`, `connect`, `reconnect` e `disconnect`; conecta e reconecta via `POST /v2/auth/link` (link novo usa `providers`, reconexão usa `account_id`) e desconecta via `DELETE /v2/accounts/{id}`.
- `unipile-account-status` é o único receptor de webhook: a Unipile v2 entrega todos os eventos de conta (`account.*`) num Webhook Endpoint só, assinado por HMAC-SHA256. A correlação com a tentativa de conexão usa o campo `state` (o UUID da tentativa) enviado em `POST /v2/auth/link` e devolvido no evento `account.add`/`account.reconnect`, não mais um callback de redirecionamento separado. Os event types mapeiam para o mesmo vocabulário que a RPC já usava na v1: `account.add`→`CREATION_SUCCESS`, `account.reconnect`→`RECONNECTED`, `account.initial_sync.completed`→`SYNC_SUCCESS`, `account.status.running`→`OK`, `account.status.disconnected`→`CREDENTIALS`, `account.status.errored`→`ERROR`, `account.remove`→`DELETED`. Na v2 só WhatsApp e IMAP fazem sincronização inicial: para eles, é o `account.initial_sync.completed` que leva a conta de `syncing` a `ready`. Os outros provedores (Google, Outlook, LinkedIn) já chegam com o histórico disponível e nunca mandam esse evento, então a própria função aplica o `SYNC_SUCCESS` logo depois do `account.add`. O Webhook Endpoint precisa estar inscrito nesses 7 eventos. Cada entrega deixa uma linha JSON nos logs da função, com o tipo, o id da conta na Unipile e o desfecho, sem o conteúdo do evento. Eventos v2 sem equivalente na v1 (`account.status.degraded`/`partial`, `account.locked`/`unlocked`, `account.initial_sync.running`/`failed`) são reconhecidos (HTTP 200) e ignorados: não há estado interno para eles ainda.

Estados de erro (`CREDENTIALS`, `ERROR`, `STOPPED`) colocam a Conta remetente em `reconnect_required` e definem `reconciliation_required`. O retorno de uma sincronização posterior mantém `syncing` enquanto essa trava estiver ativa. A reconciliação do backlog e a liberação explícita dessa trava pertencem aos tickets posteriores de reconexão; eventos de início atrasados não regridem uma Conta pronta.

O webhook precisa ficar sem verificação JWT do gateway porque a Unipile não envia JWT Supabase; a própria função autentica cada entrega pela assinatura HMAC, com uma janela de 5 minutos contra replay.

## Configurar ou trocar a conta Unipile

As duas funções estão publicadas em `ycbdilsmydvzezhlymty`; a URL delas não muda entre contas Unipile. Rode `scripts/wizard-unipile.sh` para obter a chave de API, registrar o Webhook Endpoint direto por API (capturando o `secret` que a Unipile gera) e colar os três segredos — nenhum menu do painel da Unipile precisa ser adivinhado. Depois, `npm run unipile:testar -- email` (em `projeto-althius-frontend`) conecta uma conta de verdade de ponta a ponta e confere o estado pela mesma Edge Function que o app usa.

Rode o wizard de novo a cada troca de conta Unipile ([ADR-0015](../../docs/adr/0015-conta-unipile-descartavel-durante-a-pre-producao.md)): o teste grátis de 7 dias, depois a conta paga de outro sócio, depois a conta oficial da empresa. Só os três segredos mudam; o código não é publicado de novo. O wizard também marca as Contas remetentes conectadas na conta anterior como `reconnect_required`, porque o `unipile_account_id` delas não existe na conta nova — sem apagar nada: Contatos, Contas-alvo, Sequências e Interações continuam intactos, e cada pessoa só precisa reconectar o canal.

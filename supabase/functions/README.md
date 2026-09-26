# Integração de Contas remetentes com Unipile v1

As funções deste diretório tratam somente de Contas remetentes pessoais usadas por Sequências. Elas são diferentes dos Canais de conversa com Agentes.

## Segredos de ambiente

Configure em Supabase Edge Function Secrets:

- `UNIPILE_DSN`: host completo da instância, por exemplo `apiX.unipile.com:XXXXX`.
- `UNIPILE_API_KEY`: token privado da API Unipile.
- `UNIPILE_WEBHOOK_SECRET`: mesmo valor enviado no header `Unipile-Auth` do webhook v1 de ciclo de vida.
- `APP_ORIGIN`: origem HTTPS do frontend, sem caminho.

O runtime fornece `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`. Nenhum segredo Unipile deve ser definido com prefixo `VITE_` ou enviado ao cliente.

## Endpoints

- `sender-accounts` exige JWT de usuário e participação ativa no Workspace. Aceita `list`, `connect`, `reconnect` e `disconnect`.
- `unipile-hosted-auth-notify` recebe o callback Hosted Auth. A associação usa um UUID temporário privado e consulta `GET /api/v1/accounts/{id}` na instância antes de finalizar.
- `unipile-account-status` recebe `AccountStatus` v1 e valida `Unipile-Auth`. `CREATION_SUCCESS`/`RECONNECTED` significam sincronização iniciada; `SYNC_SUCCESS` ou `OK` liberam o estado pronto somente quando nenhuma reconciliação está pendente.

Estados de erro (`CREDENTIALS`, `ERROR`, `STOPPED`) colocam a Conta remetente em `reconnect_required` e definem `reconciliation_required`. O retorno de uma sincronização posterior mantém `syncing` enquanto essa trava estiver ativa. A reconciliação do backlog e a liberação explícita dessa trava pertencem aos tickets posteriores de reconexão; eventos de início atrasados não regridem uma Conta pronta.

O endpoint público de notificação de autenticação precisa ficar sem verificação JWT do gateway porque a Unipile não envia JWT Supabase. A própria função aceita somente tentativas temporárias existentes, valida o ID e tipo da conta com a chave privada da Unipile e revalida a participação no Workspace antes de gravar.

## Configurar ou trocar a conta Unipile

As três funções estão publicadas em `ycbdilsmydvzezhlymty`; a URL delas não muda entre contas Unipile. Rode `scripts/wizard-unipile.sh` para configurar os quatro segredos e registrar o webhook `account_status` direto por API (`POST /api/v1/webhooks`, `source: "account_status"`) — nenhum menu do painel da Unipile precisa ser adivinhado. Depois, `npm run unipile:testar -- email` (em `projeto-althius-frontend`) conecta uma conta de verdade de ponta a ponta e confere o estado pela mesma Edge Function que o app usa.

Rode o wizard de novo a cada troca de conta Unipile ([ADR-0015](../../docs/adr/0015-conta-unipile-descartavel-durante-a-pre-producao.md)): o teste grátis de 7 dias, depois a conta paga de outro sócio, depois a conta oficial da empresa. Só os quatro segredos mudam; o código não é publicado de novo. O wizard também marca as Contas remetentes conectadas na conta anterior como `reconnect_required`, porque o `unipile_account_id` delas não existe na conta nova — sem apagar nada: Contatos, Contas-alvo, Sequências e Interações continuam intactos, e cada pessoa só precisa reconectar o canal.

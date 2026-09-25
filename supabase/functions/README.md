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

## Configuração externa pendente

Registrar no painel Unipile v1 um webhook `account_status` apontando para `/functions/v1/unipile-account-status` e configurar o header `Unipile-Auth`. Depois de implantar a função, validar os status com uma conta pessoal de teste de cada canal. Para E-mail, Hosted Auth oferece Google, Microsoft e IMAP.

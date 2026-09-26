# Integração de Contas remetentes com Unipile v1

As funções deste diretório tratam somente de Contas remetentes pessoais usadas por Sequências e dos passos enviados por elas. Elas são diferentes dos Canais de conversa com Agentes.

## Segredos de ambiente

Configure em Supabase Edge Function Secrets:

- `UNIPILE_DSN`: host completo da instância, por exemplo `apiX.unipile.com:XXXXX`.
- `UNIPILE_API_KEY`: token privado da API Unipile.
- `UNIPILE_WEBHOOK_SECRET`: mesmo valor enviado no header `Unipile-Auth` do webhook v1 de ciclo de vida.
- `UNIPILE_MAIL_WEBHOOK_SECRET`: valor próprio do header `Unipile-Auth` do webhook v1 de e-mail. Não reutilize o segredo do ciclo de vida.
- `APP_ORIGIN`: origem HTTPS do frontend, sem caminho.

O runtime fornece `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`. Nenhum segredo Unipile deve ser definido com prefixo `VITE_` ou enviado ao cliente.

## Endpoints

- `sender-accounts` exige JWT de usuário e participação ativa no Workspace. Aceita `list`, `connect`, `reconnect` e `disconnect`.
- `unipile-hosted-auth-notify` recebe o callback Hosted Auth. A associação usa um UUID temporário privado e consulta `GET /api/v1/accounts/{id}` na instância antes de finalizar.
- `unipile-account-status` recebe `AccountStatus` v1 e valida `Unipile-Auth`. `CREATION_SUCCESS`/`RECONNECTED` significam sincronização iniciada; `SYNC_SUCCESS` ou `OK` liberam o estado pronto somente quando nenhuma reconciliação está pendente.
- `sequence-email-steps` exige JWT de usuário. Aceita `confirm` (o Vendedor responsável confirma um passo de E-mail e fixa o Destino atual do Contato, o conteúdo e a Conta remetente, ADR-0014), `send` (reserva o passo, envia por `POST /api/v1/emails` com `Idempotency-Key` e persiste o resultado) e `resend` (decisão do titular depois de uma reconciliação sem prova). Um resultado incerto (tempo esgotado, 5xx, resposta ilegível) nunca é reenviado direto: o próximo `send` procura o e-mail entre os enviados da conta (`GET /api/v1/emails?role=sent`) e, sem prova, devolve `decision: "owner"`.
- `unipile-mail-webhook` recebe `mail_received`, `mail_sent` e `mail_moved` e valida `Unipile-Auth`. Persiste o evento antes de responder 200 e processa depois com `EdgeRuntime.waitUntil`, retomando também eventos pendentes. `mail_sent` é do próprio titular: nunca pausa, e o eco de um passo guarda o Message-ID para correlacionar respostas. `mail_moved` é ignorado. Uma resposta de Contato da Conta-alvo grava a mensagem privada do titular, a Interação e o evento `contato-respondeu` e pausa a Sequência numa transação. E-mail sem relação com a Sequência é descartado, e o conteúdo bruto do webhook é apagado depois do processamento.

Estados de erro (`CREDENTIALS`, `ERROR`, `STOPPED`) colocam a Conta remetente em `reconnect_required` e definem `reconciliation_required`. O retorno de uma sincronização posterior mantém `syncing` enquanto essa trava estiver ativa. A reconciliação do backlog e a liberação explícita dessa trava pertencem aos tickets posteriores de reconexão; eventos de início atrasados não regridem uma Conta pronta.

O endpoint público de notificação de autenticação precisa ficar sem verificação JWT do gateway porque a Unipile não envia JWT Supabase. A própria função aceita somente tentativas temporárias existentes, valida o ID e tipo da conta com a chave privada da Unipile e revalida a participação no Workspace antes de gravar.

## Configuração externa pendente

Registrar no painel Unipile v1 um webhook `account_status` apontando para `/functions/v1/unipile-account-status` e configurar o header `Unipile-Auth`. Depois de implantar a função, validar os status com uma conta pessoal de teste de cada canal. Para E-mail, Hosted Auth oferece Google, Microsoft e IMAP.

Registrar também um webhook de origem `email`, formato JSON, com os eventos `mail_received`, `mail_sent` e `mail_moved`, apontando para `/functions/v1/unipile-mail-webhook`, com o header `Unipile-Auth` igual a `UNIPILE_MAIL_WEBHOOK_SECRET`. O destinatário do teste real precisa ser outra caixa, diferente da Conta remetente: a própria caixa do titular nunca conta como resposta.

## Testes

Os módulos em `_shared/` são testados com Deno contra o Postgres com as migrations aplicadas e a Unipile simulada (`_shared/simulated-unipile.ts`). Com o Supabase local no ar:

```sh
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  deno test --allow-env --allow-net --allow-read supabase/functions/
```

Cada teste roda numa transação desfeita no fim. Testes com mocks não comprovam a integração externa: a validação com contas reais continua pendente.

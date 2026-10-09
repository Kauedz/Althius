# Handoff: canais-cadencia-backend 16, cliente único da Unipile e adaptadores v1 e v2

Branch: `kaue/canais-16-cliente-unico-adaptadores`. Ticket: `.scratch/canais-cadencia-backend/issues/16-cliente-unico-e-adaptadores-v1-e-v2.md`. Spec, ADR-0024 e os handoffs do 14 e do 15 lidos.

## Gate

Os dois "Blocked by" (canais-14 e canais-15) estavam `ready-for-human`, e o `RALPH-STATUS.md` não os tinha como done. O Kauê aceitou seguir mesmo assim: o código do 14 e do 15 está na `main`, e a migration do 15, o wizard e o deploy do 14 são do Nan. Por isso **a leitura real da conexão ativa só se prova depois da migration `20261009205538` + o wizard** (ver "O que só se prova em produção").

Decisões do Kauê neste ticket: manter 429 e 503 como estão em `send-chat-step.ts` (não processada, com nova tentativa); não mexer nas funções SQL de ingestão (`ingest_unipile_*`, `apply_unipile_sender_status`, `hold_sequences_of_lost_sender`), que ficam para o canais-17.

## O que entrou

`supabase/functions/_shared/unipile/` (a área do contrato do canais-14):

- `client.ts`: o cliente HTTP único. Endereço da conexão, `X-API-KEY`, JSON ou multipart (`FormData`, sem `content-type`), query, tempo limite próprio (30 s) junto com o sinal de quem chama, e a classificação do erro: toda recusa HTTP é `UnipileChatRequestError`; 4xx (menos 408 e 429) é definitiva e leva o motivo (`classifyProviderError`); o resto é incerto, sem motivo. `bytes()` baixa um arquivo e **só manda a chave à origem da conexão**: uma URL de outra origem que veio num evento é baixada sem ela (antes a chave ia para qualquer URL https do evento).
- `bridge.ts`: a interface `UnipileBridge` (= `UnipileMail` + `UnipileChat` + contas: link de conexão, desconectar, listar contas e chats, baixar anexo) e `createBridge`, que escolhe o adaptador pela versão da conexão.
- `bridge-v2.ts`: o que os adaptadores de e-mail e de conversa faziam, movido para atrás da interface, sobre o cliente. Contrato igual ao de antes.
- `bridge-v1.ts`: o adaptador v1, portado do protótipo (`envio.ts`, `hospedado.ts`, `sincronizar.ts`; só leitura, o protótipo não foi alterado). E-mail em `POST /api/v1/emails` (corpo HTML escapado com `<br>`, `to[].identifier`, `Idempotency-Key` em UUID estável derivado do `X-Althius-Envio`); chats em multipart (`account_id` no corpo); link em `hosted/accounts/link` (provedores em maiúsculas, `notify_url`, `name` = id do pedido); contas em `accounts?limit=250` com o estado vindo da lista de fontes. O que a v1 ainda não faz **recusa antes de chamar a Unipile**, com `UnipileUnsupportedOperationError` (definitiva, motivo `unsupported_on_provider_version`): anexo, resposta dentro de uma conversa de e-mail (`reply_to_message_id`), `getEmail`, `listThreadEmails` e `listEmailSenders`.
- `connection.ts`: a conexão ativa. Lê `public.get_active_unipile_connection()` (endereço e versão do banco, chave e segredo do Vault), valida pelo schema do contrato, guarda em cache por 30 s (só leitura bem-sucedida) e entrega `createUnipileRuntime` (`connection()` e `bridge()`, nulos se o canal está desligado). Reservas: função ausente (migration não aplicada) → variáveis de hoje; chave ausente no Vault → a variável **só para a conexão padrão** (v2, `api.unipile.com`), nunca para outro endereço. É o único arquivo que escreve o endereço padrão e lê `UNIPILE_*`.
- `readers.ts`: `readLinkedInProfile`, `readChatSent` e constantes, movidos de `send-chat-step-adapters.ts` (que os reexporta) e ajustados para as duas versões.
- `conferir.ts` + `scripts/unipile-conferir.ts`: o diagnóstico só de leitura (`npm run unipile:conferir` na pasta do frontend, ou `deno run`): contas, estado e os 3 últimos chats de cada uma, e com `--link=<provedor> --retorno=…` um link de conexão. A chave vem do ambiente e nunca é impressa; uma falha mostra só o status.
- `errors.ts`: `UnipileChatRequestError` (movido de `send-chat-step.ts`, que o reexporta) e `UnipileUnsupportedOperationError`. `v1.ts` e `v2.ts` ganharam `listChats`; `index.ts` é o barril.

Adaptadores antigos: `send-step-adapters.ts` e `send-chat-step-adapters.ts` ficaram só com as RPCs do banco e dois atalhos, `unipileMailVia(chave)` e `unipileChatVia(chave, fetch)`, que são a ponte v2 no endereço padrão (os testes antigos seguem passando sem mudar de asserção).

Edge Functions: `sequence-runner`, `sequence-step-sends`, `reply-proposal-send`, `sender-accounts` e `unipile-account-status` não leem mais `UNIPILE_API_KEY` nem escrevem `api.unipile.com`. Cada pedido pega a ponte da conexão ativa; **sem conexão ativa ou sem chave, a função responde 503** (com CORS nas que o navegador chama) e nada é enviado nem reservado. `sender-accounts` checa a conexão antes de abrir uma tentativa de conexão. O webhook passa a conferir o HMAC v2 com o segredo da conexão ativa.

Banco: `supabase/migrations/20261009214037_leitura_da_conexao_unipile_ativa.sql`, uma função nova, `public.get_active_unipile_connection()` (security definer, só `service_role`, sem coluna nova e sem gravar nada). Lê o Vault dinamicamente com `to_regclass`, para o arquivo também aplicar num banco sem Vault. pgTAP: `supabase/tests/unipile_conexao_ativa_leitura.sql`, 13 asserções.

Arquivos compartilhados tocados (avisar): `.github/workflows/ci.yml` (um passo novo, `deno test --allow-read=supabase/functions …/sem-base-fixa.test.ts`), `projeto-althius-frontend/package.json` (o script `unipile:conferir`), `.scratch/ORDEM-BUILD-FUNCIONAL.md` (linha 87).

## Loop

Vermelho primeiro, depois verde:

- `client.test.ts`, `bridge.test.ts`, `connection.test.ts`, `conferir.test.ts`, `sem-base-fixa.test.ts`: nasceram vermelhos (módulos inexistentes; a guarda listou os 4 arquivos com base fixa). O contrato ganhou `listChats` com o exemplo antes do schema (2 testes vermelhos).
- pgTAP novo: vermelho com `function "public.get_active_unipile_connection()" does not exist`. Mutação: ler o segredo do webhook pelo nome da chave deixa as asserções 8 e 9 vermelhas; restaurado.
- O mesmo conjunto de testes do contrato (`bridge.test.ts`) roda contra a v1 e a v2 com `fetch` simulado, e o corpo que a ponte manda é validado pelo **schema de pedido** de cada versão.

Resultados:

- `deno test supabase/functions`: 883 passed, 0 failed, 2 ignored. Os 2 ignorados são a guarda `sem-base-fixa`, que precisa de `--allow-read`; rodou à parte (`deno test --allow-read=supabase/functions …/sem-base-fixa.test.ts`): 2 passed. Antes do ticket eram 837 testes; os 52 do 06 e do 07 passam sem mudar de asserção.
- `deno check supabase/functions/*/index.ts` e `deno check scripts/unipile-conferir.ts`: limpos. `deno lint`: 254 problemas, o mesmo número de antes, nenhum nos arquivos que toquei.
- pgTAP, suíte inteira do zero: 73 arquivos, todos ok, nenhuma falha (Postgres 16 local descartável, com o pgTAP carregado como script e sem Vault de verdade; o teste novo cria um `vault.decrypted_secrets` de mentira só onde o Vault não existe, e usa `vault.create_secret` no CI). `unipile_conexao_ativa_leitura.sql`: 13/13; `conexao_unipile_ativa.sql` (do 15): 51/51.
- Frontend (só o `package.json` ganhou um script): `tsc -b` 0; `oxlint` exit 0 (só avisos antigos de `detalhe-sequencia.tsx`); `vitest`: ver o PR.

## Só se prova em produção

1. **A leitura real da conexão ativa**: `get_active_unipile_connection()` lendo o Vault do projeto. Local, o Vault é uma tabela de mentira com `name` e `decrypted_secret`. Falta a migration do 15 (`20261009205538`), esta migration (`20261009214037`) e o wizard gravando a chave e o segredo.
2. **Todos os campos da v1**: o protótipo só alega ter conferido listar contas e chats, ler mensagens e enviar no LinkedIn. Nada da v1 foi visto pela Althius: provedores no assistente (`GOOGLE` vs `GOOGLE_OAUTH`), `Idempotency-Key`, o id do e-mail enviado, convite, perfil, mensagens da conversa, listar chats, desconectar e o endereço do anexo recebido. Primeiro uso real: `npm run unipile:conferir` numa conta v1, e registrar o que a Unipile devolveu.
3. **v2**: nada mudou de contrato; os campos "não confirmados" (`users_ids`, `is_sender`, `sender_id`) continuam esperando o primeiro envio real.
4. **O tempo limite de 30 s** do cliente nas leituras (antes não havia). Se a Unipile for mais lenta que isso, a leitura falha como incerta.

## Limites que ficam para quem pega depois

- **v1 e e-mail na mesma conversa**: `checkConversation` (`send-step.ts`) usa `getEmail` e `listThreadEmails` antes do próximo passo de uma conversa já aberta. Na v1 eles recusam, então o **primeiro** e-mail de uma Sequência sai, mas o seguinte na mesma conversa fica barrado pela conferência. Também não saem na v1 e-mail com anexo e a resposta aprovada na conversa (`reply-proposal-send`). Precisa conhecer o endpoint v1 de leitura de e-mail numa conta real: ticket novo.
- **Webhook v1**: o handler ainda confere só a assinatura v2. Com uma conta v1 ativa, o aviso recebe 401 até o canais-17. O link de conexão v1 já sai com `notify_url`, mas sem a chave `?k=` do pedido: o canais-17 a acrescenta (e a autenticação do aviso).
- **Funções SQL de ingestão** (`ingest_unipile_email_event`, `ingest_unipile_chat_event`, `apply_unipile_sender_status`, `hold_sequences_of_lost_sender`) ainda buscam a linha só por `unipile_account_id`, que agora pode repetir entre conexões. Não mexi (decisão do Kauê): é do canais-17.
- **429 e 503** seguem como estavam em `send-chat-step.ts` (não processada, com nova tentativa). O tipo `kind` do cliente os marca como incertos (contrato do 14); a decisão do núcleo não mudou.
- **Latência da troca**: uma troca de conta chega às funções em até 30 s (cache). Para valer na hora, redeploy ou esperar.
- O cache é por instância da função: duas instâncias podem ver a troca com até 30 s de diferença.
- O corpo de e-mail v1 é HTML simples gerado do texto (`<br>`), sem a assinatura nem o HTML que o usuário não escreve.

## Passos do Nan

1. Com o CI verde, aplicar `supabase/migrations/20261009214037_leitura_da_conexao_unipile_ativa.sql` no projeto `ycbdilsmydvzezhlymty` pelo `execute_sql`, no bloco atômico de `docs/agents/migrations.md`, **depois** da `20261009205538_conexao_unipile_ativa.sql` do canais-15. Não apliquei nada no remoto.
2. Rodar `bash scripts/wizard-unipile.sh` para cadastrar a conexão e gravar a chave e o segredo no Vault (do canais-15).
3. Publicar as funções: `sender-accounts`, `sequence-runner`, `sequence-step-sends`, `reply-proposal-send` e `unipile-account-status` (esta com `--no-verify-jwt`, como já é). Se publicar antes de aplicar a migration, elas seguem na configuração de hoje (a função ausente cai nas variáveis).
4. Com uma conta ativa, `npm run unipile:conferir` (pasta do frontend; precisa de `deno`) ou `deno run --allow-env --allow-net scripts/unipile-conferir.ts --env` com `UNIPILE_API_KEY`, `UNIPILE_API_URL` e `UNIPILE_API_VERSION` no ambiente. Numa conta v1, registrar o que veio nos Comments do ticket.

## Próximo passo

canais-17 (webhook v1, eventos normalizados e a autenticação do aviso), antes de a primeira conta v1 ficar ativa. Depois, a rodada real do 06 e do 07 com a conexão ativa.

# Handoff: canais-cadencia-backend 17, webhook da Unipile v1 e eventos normalizados

Branch: `kaue/canais-17-webhook-v1-eventos`. Ticket: `.scratch/canais-cadencia-backend/issues/17-webhook-v1-e-eventos-normalizados.md`. Spec, ADR-0024 e os handoffs do 14, 15 e 16 lidos. Protótipo `Kauedz/althius-revenue-os` lido (só leitura): `unipile.ts`, `servidor.ts`, `conexoes.ts`, `v1.test.ts`, `configurar-webhooks.mjs`.

## Gate

Passou. O único Blocked by é o canais-16, que está na `main` (PR #162) e só está `ready-for-human` pelos Passos do Nan (migrations, wizard, deploy), como o Kauê aceitou. "What to build" e os 9 critérios estavam completos.

Contexto novo dado no meio do trabalho: a próxima conta ativa é **v1** (`https://api68.unipile.com:19840`) e o webhook de conta `AAA` já existe no painel v1 apontando para `unipile-account-status`. Hoje o handler publicado devolve 401 a ele (só conhece `unipile-signature`); isso está resolvido aqui (ver "Passos do Nan", item sobre o `AAA`).

## O que entrou

`supabase/functions/_shared/unipile/` (a área do contrato):

- `events-v1.ts` (+ teste): `parseV1WebhookEvent`, validado com Zod, traduz `message_received`, `mail_received`, `new_relation`, `AccountStatus` (aninhado ou direto) e o aviso do link de conexão para a união canônica do canais-14. A mensagem v1 chega ao banco já no formato do `Message` da v2 (`id`, `chat_id`, `sender_id`, `is_sender`, `text`, `date`, `attachments`); o e-mail, no formato do `Email` (`from.email`, `thread_id`, `body`, `snippet`...). `private.chat_message_fields` e as RPCs de ingestão **não mudam**. Mensagem própria, grupo, evento sem texto, anúncio (`sponsored`, `linkedin_offer`), canal sem suporte (Instagram etc.) e estado passageiro/desconhecido viram `ignore` com o motivo do mapa (§1.5). O id do evento é `<conta>:<id da mensagem>` (a v1 só garante unicidade dentro da conta); o `id` **dentro** do payload fica o da Unipile, porque é com ele que o banco reconhece o eco de um Envio nosso.
- `webhook-auth.ts` (+ teste): `Unipile-Auth` igual ao segredo da conexão (comparação em tempo constante) e a chave `?k=` = HMAC-SHA256(segredo, `conexao:<pedido>`), conferida contra o `name` do aviso. Conferência **antes** de interpretar o evento; falha dá 401.
- `account-directory.ts` (+ teste): "a conta é da conexão ativa?", pela lista de contas da própria conexão (a ponte). Lista em memória por 60 s; conta que não aparece força uma releitura, no máximo uma a cada 10 s; só lista completa prova que a conta é de fora. Lista incompleta ou falha na Unipile = `unknown` e o evento segue como seguia (nunca descarta sem prova).
- `webhooks-v1.ts` (+ teste): os 4 webhooks do protótipo e o plano (criar / já existe / sem cabeçalho / de outro endereço).
- `bridge-v1.ts` + `bridge.ts` (+ `bridge-aviso.test.ts`): o `notify_url` do link de conexão v1 agora leva `?k=` (o canais-16 deixou isso para este ticket). `ActiveBridgeConnection` ganhou `webhookSecret` (a `ActiveConnection` já o tinha).
- `events.ts`: só `connection.provider` passou a aceitar `null` (o aviso da v1 não diz o provedor) e um comentário.
- `index.ts`: exporta `events-v1`.

`supabase/functions/unipile-account-status/`:

- `handler.ts`: `Deps.version` (padrão `v2`: nada muda) e `Deps.accounts` (opcional; ausente = sem a checagem). v1: autentica pelo contrato da v1, parseia com `parseV1WebhookEvent`, e o resto do fluxo é o mesmo. A chave `?k=` só vale para `connection`: qualquer outro evento com ela dá 401. Conta que não é da conexão ativa: 200 e nenhuma RPC, nas duas versões. Aviso de conexão da v1: o provedor vem da lista de contas (`completeV1Connection`); sem como descobri-lo, 503 e **nenhuma RPC** (um provedor errado falharia a tentativa de vez); provedor que a Althius não conecta, 200 ignorando.
- `index.ts`: passa `version`, o segredo e o diretório de contas montado a partir da ponte da conexão ativa.

`scripts/unipile-webhooks-v1.ts` (novo): registra os 4 webhooks v1 (`message_received`; `mail_received`; estado da conta; `new_relation`) com o cabeçalho `Unipile-Auth`. Sem `--aplicar` só mostra. Não apaga nada: avisa dos de outro endereço e dos do mesmo endereço sem cabeçalho. Chave, endereço e segredo vêm do ambiente; só o status HTTP aparece em erro, nunca o corpo nem o segredo. Se a listagem não devolve os `headers`, o webhook da fonte conta como já existente (não duplica o aviso). Rodei o modo de simulação contra um servidor local falso: lista o `AAA` como existente e propõe os outros 3.

`scripts/wizard-unipile.sh` (arquivo compartilhado com o canais-15; avisar):

- Só chama o script novo: no ramo v1, depois do segredo, roda a simulação e pergunta antes do `--aplicar`. O texto do ramo v1 agora explica que o segredo é o valor do `Unipile-Auth`.
- **Correção do `APP_ORIGIN`** (pedida): o bloco de segredos de função não escreve mais `APP_ORIGIN=http://localhost:5173`. O valor vem de `--app-origin=<valor>` ou da variável `APP_ORIGIN`; sem nenhum dos dois, a linha **não vai** no bloco (não sobrescreve o que já está no projeto) e o wizard avisa. Em produção: `bash scripts/wizard-unipile.sh --app-origin=https://app.althius.com.br,http://localhost:5173`. Argumento desconhecido aborta. Verificado com `bash -n` e com um argumento inválido; o wizard inteiro continua interativo e não foi rodado de ponta a ponta.

## Loop

Vermelho primeiro: `events-v1.test.ts`, `webhook-auth.test.ts`, `account-directory.test.ts`, `handler-v1.test.ts`, `webhooks-v1.test.ts` e `bridge-aviso.test.ts` nasceram sem o módulo (falha de tipo/import) e só então escrevi o código. Mutações: tirar a restrição da chave `?k=` ao evento de conexão deixa "a chave do endereço vale só para o evento de conexão" vermelho; neutralizar o descarte de conta de outra conexão deixa "evento de uma conta que não é da conexão ativa" vermelho. Restaurado.

Resultados:

- `deno test supabase/functions`: **931 passed, 0 failed, 2 ignored** (antes: 883). Os 2 ignorados são a guarda `sem-base-fixa`, que precisa de `--allow-read`: rodada à parte, 2 passed (o script novo não escreve endereço fixo). As suítes do 06 e do 07 passam sem mudar asserção; nenhum teste existente foi alterado.
- `deno check supabase/functions/*/index.ts` e dos scripts `unipile-conferir.ts` e `unipile-webhooks-v1.ts`: limpos.
- `deno lint` nos arquivos tocados: só `require-await` nos fakes assíncronos dos testes, o mesmo padrão dos testes existentes do webhook (o CI não roda `deno lint`).
- Frontend (não foi tocado): `tsc -b` 0; `npm run lint` só avisos antigos de `detalhe-sequencia.tsx`; `vitest` 122 arquivos, 1158 testes, todos ok.
- Nenhuma migration; nenhum pgTAP novo nem alterado (o ticket não toca o banco).

## Avisos

**Pendência herdada do canais-15 NÃO resolvida.** `ingest_unipile_email_event`, `ingest_unipile_chat_event`, `apply_unipile_sender_status` e `hold_sequences_of_lost_sender` continuam buscando a Conta remetente só por `unipile_account_id`, que agora pode repetir entre conexões. O ticket manda não mexer em migrations, banco nem operações de ingestão e de estado da conta, então não coube aqui. O que este ticket faz reduz o risco, mas não o elimina: o filtro de "conta da conexão ativa" fica no webhook (pela lista de contas da Unipile) e **a conta removida (`DELETED`) passa sem ele**, porque já não consta na lista e é exatamente o evento que pausa Sequências. Precisa de um ticket com migration (passar a conexão ativa para as quatro funções, ou filtrar por `private.active_unipile_connection_id()`), com pgTAP próprio.

**Arquivos compartilhados / fora do "Pode mexer" literal:** `scripts/wizard-unipile.sh` (canais-15), `bridge-v1.ts` e `bridge.ts` (canais-16, só o `?k=` que o handoff do 16 deixou para este ticket) e `events.ts` (canais-14, só `provider` nullable). **429 e 503** de envio ficaram como estavam; o 503 novo é só do webhook, quando o provedor do aviso de conexão não pôde ser resolvido.

## Decisões a confirmar

1. Estado v1 → vocabulário da RPC: `CREATION_SUCCESS` e `RECONNECTED` → `OK` (conectado, como na tabela do mapa); `STOPPED` e `PERMISSIONS` → `ERROR` (atenção, a RPC só conhece `CREDENTIALS`/`ERROR`/`STOPPED`); `CONNECTING` e nomes desconhecidos não fazem nada. Risco conhecido de `OK` chegar antes do aviso de conexão numa reconexão de WhatsApp (a RPC tem a mesma reação para o `account.status.running` da v2).
2. Chave `?k=` em evento que não é de conexão: **401** (o protótipo respondia 200 sem ingerir).
3. Sem saber quem é o titular (`account_info.user_id` ausente), a mensagem v1 vai **sem** `is_sender`: o banco decide pela identidade aprendida e, sem ela, deixa a mensagem sem relação em vez de pausar uma Sequência por engano.
4. Falha ao ler a lista de contas = o evento segue (nunca descarta sem prova). Se preferir recusar com 503 para a Unipile reentregar, é uma linha.

## Não confirmado (viram item do canais-12 quando houver conta v1 real)

Nenhum destes formatos foi visto com tráfego real; vêm da documentação como o protótipo a leu:

- Webhooks v1: `POST /api/v1/webhooks` (`request_url`, `name`, `source`, `events`, `format`, `enabled`, `headers`), os nomes das fontes (`messaging`, `email`, `account_status`, `users`) e dos eventos, e se `GET /api/v1/webhooks` devolve os `headers`.
- Eventos: `message_received` (`chat_id`, `message_id`, `message`, `sender.attendee_provider_id`, `attendees`, `account_info.user_id`, `timestamp`, `content_type`, `is_sender`); `mail_received` (`email_id`, `from_attendee.identifier`, `subject`, `body`, `body_plain`, e `message_id`, `thread_id`, `date`, `attachments`, `headers`); `new_relation` (`user_*`); `AccountStatus` e a lista de nomes de estado; o aviso do link `{status, account_id, name}` e que ele **não** traz provedor.
- O `type` de cada conta em `GET /api/v1/accounts` (usado para descobrir o provedor): `GOOGLE_OAUTH`, `MAIL`, `OUTLOOK`, `LINKEDIN`, `WHATSAPP`.
- Que o `Unipile-Auth` chega no cabeçalho com o valor exato cadastrado, e que o `notify_url` preserva o `?k=`.

## O que só se prova em produção

1. Que a Unipile v1 entrega mesmo no formato lido (nada foi visto com tráfego real) e que o `AAA` autentica.
2. A checagem "conta da conexão ativa" contra a lista real de contas da v1 (`GET /api/v1/accounts`, até 250), inclusive a releitura quando chega uma conta recém-criada.
3. O aviso do link de conexão com `?k=` de ponta a ponta (gerar o link pelo `sender-accounts`, conectar uma conta, a tentativa fechar).
4. O custo das chamadas à lista de contas (no máximo uma a cada 10 s por instância em caso de conta desconhecida, e uma por minuto).

## Pendente de deploy

- **`unipile-account-status`** (com `--no-verify-jwt`): o handler novo. É o que tira o 401 do `AAA`.
- **`sender-accounts`**: o `?k=` do aviso do link sai do `bridge-v1.ts`. Sem republicar, o link v1 sai sem a chave e o aviso de conexão recebe 401.
- Opcional, para pegarem o mesmo `bridge.ts` na próxima publicação: `sequence-runner`, `sequence-step-sends`, `reply-proposal-send` (sem mudança de comportamento).

## Passos do Nan

1. Depois do merge, publicar `unipile-account-status` (`--no-verify-jwt`) e `sender-accounts`.
2. Webhook `AAA` (v1, já existente): o segredo da conexão no Vault (`webhook_secret`) tem de ser **igual ao valor do cabeçalho `Unipile-Auth` do `AAA`**. No wizard v1 (`bash scripts/wizard-unipile.sh --app-origin=https://app.althius.com.br,http://localhost:5173`), no passo do webhook, cole esse valor. Se não souber qual é, o `AAA` precisa ser recriado: o script abaixo cria os 4 com o segredo escolhido.
3. Os outros 3 webhooks (o `AAA` parece ser só o de conta): o próprio wizard v1 roda a simulação e, com confirmação, `--aplicar`. À mão, no Git Bash:

   ```
   UNIPILE_API_KEY='<chave>' UNIPILE_API_URL='https://api68.unipile.com:19840' UNIPILE_API_VERSION=v1 UNIPILE_WEBHOOK_SECRET='<o segredo da conexão>' \
     deno run --allow-env --allow-net scripts/unipile-webhooks-v1.ts \
     --url=https://ycbdilsmydvzezhlymty.supabase.co/functions/v1/unipile-account-status
   ```

   Confira a saída e repita com `--aplicar`. Webhooks antigos só são avisados; apague no painel da Unipile se sobrarem.
4. Mensagem de teste na conta v1 para ver o evento chegar e ser traduzido (log da função: `outcome` e `type`, sem conteúdo). Registre nos Comments do canais-12 o que a v1 devolveu de diferente.
5. Se ainda não foram aplicadas no remoto, as migrations do canais-15 e do 16 (a conexão ativa v1 precisa delas). O `APP_ORIGIN` em produção deve ser `https://app.althius.com.br,http://localhost:5173`.

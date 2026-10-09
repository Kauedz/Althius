# Mapa da integração Unipile: protótipo → Althius

Só leitura e planejamento. Nenhum código, migration, segredo ou deploy foi tocado. O protótipo (`Kauedz/althius-revenue-os`,
clonado em `../althius-revenue-os`, commit `3092c18`) não foi alterado. Base do Althius: `main` em `aa9440a`.

O que eu **não** fiz: rodar os testes do protótipo ou chamar a Unipile. Onde o texto diz "conferido em conta real", é o que
os comentários e as mensagens de commit do protótipo afirmam, não algo que eu verifiquei.

## 0. Resumo e o que precisa de decisão

1. A integração do protótipo cabe em ~870 linhas de TypeScript (config, envio, link de conexão, webhook, sincronia) mais três
   scripts. A parte reaproveitável de verdade é o **conhecimento dos dois contratos (v1 e v2)** e as regras de erro; o
   encaixe no banco não se porta (as tabelas do Althius são outras).
2. O Althius hoje é **v2 apenas, com uma conta Unipile global**: `UNIPILE_API_KEY` e `UNIPILE_WEBHOOK_SECRET` em segredo de
   Edge Function, e `https://api.unipile.com` escrito no código em 4 arquivos. Isso é decisão registrada
   ([ADR-0015](../../docs/adr/0015-conta-unipile-descartavel-durante-a-pre-producao.md), `canais-cadencia-backend/spec.md:40`
   "Não misturar contratos das duas versões", `ORDEM-BUILD-FUNCIONAL.md:87` "A Unipile é uma só").
3. Os requisitos novos (chave/DSN/account_id por conta, cinco contas, trocar fácil, Zod) **contrariam essas três frases**.
   Antes de implementar é preciso emendar a ADR-0015 e a spec, com ADR nova.
4. **Nenhum dos 13 tickets de canais cobre config por conta, cliente único, adaptador v1, Zod ou webhook por conta.**
   Proponho 5 tickets novos (canais-14 a canais-18, §5). O canais-07 não cobre nada disso, mas **depende** deles para a
   validação real (§5.3).

### Decisões que preciso de você antes de abrir os tickets

| # | Pergunta | Por que importa | Minha recomendação |
| --- | --- | --- | --- |
| D1 | As 5 contas Unipile são v1, v2 ou misturadas? | O protótipo valida em conta **v1** (`api68.unipile.com:19840`). A ADR-0015 diz que conta criada no dashboard atual é v2-nativa e **não aceita** a v1. Sem a resposta não dá para saber se o adaptador v1 é necessário ou só nostalgia. | Se alguma for v1, escrever os dois adaptadores atrás de uma interface. Se todas forem v2, não portar a v1. |
| D2 | As 5 contas são **rodízio** (uma ativa por vez, ADR-0071 do protótipo) ou **simultâneas** (cada Conta remetente presa a uma conta Unipile)? | Muda o modelo de dados. | Preso por Conta remetente (`sender_accounts.unipile_connection_id`). Cobre os dois casos; o rodízio vira só "mudar a conta ativa". |
| D3 | "Conversas e mensagens ficam salvas no Supabase" significa o que existe hoje (envios e respostas ligados às Sequências, privados do titular) ou uma **caixa de conversas completa** (os dois sentidos, qualquer mensagem de Contato do CRM)? | A spec de canais diz "não implementa caixa de entrada compartilhada". A caixa completa é o produto do protótipo (ADR 0068/0070), não o do Althius. | Ficar com o modelo atual e acrescentar só o que falta para sobreviver à troca de conta (§3, G7). Caixa completa é outra spec. |
| D4 | Instagram entra? | O protótipo tem; o Althius e o glossário só têm E-mail, LinkedIn e WhatsApp. Nenhum ticket cobre. | Fora, até haver spec. |
| D5 | Zod pode virar dependência (`npm:zod` nas Edge Functions e no frontend)? | Zod não existe em lugar nenhum do Althius hoje. | Sim, versão fixada, só no módulo novo `_shared/unipile/`. |

## 1. Mapa do protótipo

### 1.1 Arquivos (só o que é Unipile)

| Papel | Arquivo | Linhas | O que faz |
| --- | --- | --- | --- |
| Config e versão | `src/server/unipile/config.ts` | 48 | `ConfigUnipile {apiKey, url, versao?}`, `versaoDaApi`, `baseDaApi`, `lerConfig(env)`, tipo `ObterConfig` (relido a cada uso) |
| Cliente de envio | `src/server/cadencia/envio.ts` | 93 | `mensageiroViaApi(obterConfig)` → `Mensageiro.enviar` (e-mail, WhatsApp, LinkedIn, Instagram; v1 e v2) |
| Link de conexão | `src/server/webhooks/hospedado.ts` | 68 | `criarLinkHospedado` (v1 e v2) |
| Rota do link | `src/server/webhooks/conexoes.ts` | 69 | `iniciarConexao`: confere o login no banco (`messaging_connect_start`), cria o link; na v1 monta o `notify_url` com chave HMAC |
| Receptor de webhook (puro) | `src/server/webhooks/unipile.ts` | 293 | assinatura v2, autenticação v1, `interpretar`/`interpretarV1` → `EventoUnipile`, `processar` → porta `Banco` |
| Servidor HTTP do webhook | `src/server/webhooks/servidor.ts` | 164 | responde 200 antes de processar, 3 tentativas com espera 500 ms ×2ⁿ |
| Sincronia por polling | `src/server/conexoes/sincronizar.ts` | 133 | `ponteViaApi.listarContas` (v1 e v2) + `sincronizarContas` |
| Cofre de chaves | `src/server/cofre/{cofre,consumidores,cifra,ambiente}.ts` | ~130 | `configDoCofre` lê `unipile` e `unipile_webhook`; AES-256-GCM com `COFRE_CHAVE_MESTRA` |
| Scripts | `scripts/unipile/conferir.mjs`, `configurar-webhooks.mjs`, `scripts/docker/trocar-chave-unipile.mjs` | 62 / 48 / 55 | conferir (lê contas e chats; `--link`, `--enviar`), registrar os 4 webhooks da v1, trocar a chave no `.env` |
| Resposta pela Caixa | `src/server/cadencia/respostas.ts` | 63 | mesmo mensageiro, `pegar`/`concluir` |
| Teste real | `src/server/ponta-a-ponta.unipile.test.ts` | — | pulado por padrão; envia 1 mensagem real de WhatsApp |
| ADRs | `0017`, `0044`, `0049`, `0069` §9, `0070`, `0071` | — | decisões; 0070 é "a Unipile é só a ponte" |

### 1.2 Cliente HTTP, auth e API key

- **Não existe um cliente HTTP único.** Há `chamar` dentro de `mensageiroViaApi` (`envio.ts:39-62`), `fetch` direto em
  `hospedado.ts:40,58`, `sincronizar.ts:100` e nos scripts. O padrão repetido é: cabeçalho `X-API-KEY: <chave>`,
  `Accept: application/json`, JSON (v2 e e-mail v1) ou `FormData` (chats v1), sem timeout nem retry.
- **Chave e endereço vêm de `ObterConfig`, lido a cada chamada** (`config.ts:22`), nunca guardados no serviço. Origem: `.env`
  (`UNIPILE_API_KEY`, `UNIPILE_API_URL`, `UNIPILE_API_VERSION`) ou cofre (`consumidores.ts:6-18`), com o cofre valendo mais e o
  `.env` como reserva.
- **Só uma chave por vez.** `configDoCofre` pega `const [chave] = await cofre.ler('unipile')`, a primeira. As 5 contas do
  ADR-0071 funcionam como rodízio manual (trocar a chave no cofre). **O protótipo não liga uma conta Unipile a uma Conta
  remetente**, então ele não resolve o requisito de cinco contas simultâneas.
- **Versão:** `UNIPILE_API_VERSION` (`v1`/`v2`) ou deduzida do endereço: termina em `/api/v1` ou casa `apiNN.unipile.com(:porta)` → v1;
  senão v2 (`config.ts:28-34`). Endereço v2 padrão `https://api.unipile.com`.
- **Segredo do webhook** é um segundo valor (`UNIPILE_WEBHOOK_SECRET` ou cofre `unipile_webhook`), lido a cada aviso
  (`principal.ts:27`, `servidor.ts:150`). Também é um só.

### 1.3 Endpoints usados, v1 e v2 lado a lado

Base v2 `https://api.unipile.com` com prefixo `/v2`. Base v1 é o DSN de cada cliente (ex.: `https://api68.unipile.com:19840`)
com prefixo `/api/v1`. Em ambas, `X-API-KEY`.

| Função | v2 | v1 | Onde |
| --- | --- | --- | --- |
| Link de conexão | `POST /v2/auth/link` `{expires_on, redirect_uri, state, providers[]\|account_id}` → `{link}` ou `{data:{link}}` | `POST /api/v1/hosted/accounts/link` `{type:'create'\|'reconnect', providers[MAIÚSCULAS]\|reconnect_account, api_url, expiresOn, success_redirect_url, notify_url, name}` → `{url}` | `hospedado.ts:32-69` |
| Pedido volta como | `state` no evento `account.add`/`account.reconnect` | `name` no aviso do `notify_url` (`status: CREATION_SUCCESS\|RECONNECTED`) | `unipile.ts:97-100`, `:175-179` |
| Listar contas | `GET /v2/accounts/?limit=100` → `{data[], has_more}`; campos `id, provider, status(running\|errored\|disconnected), created_at` | `GET /api/v1/accounts?limit=250` → `{items[], cursor}`; campos `id, type(LINKEDIN…), created_at, sources[].status(OK, CREDENTIALS, ERROR, STOPPED, PERMISSIONS)` | `sincronizar.ts:96-116` |
| Enviar e-mail | `POST /v2/{conta}/emails/send` `{to:[{email}], subject, plain_text, custom_headers:[{name,value}]}` → `{id, message_id}` | `POST /api/v1/emails` JSON `{account_id, to:[{identifier}], subject, body(HTML), custom_headers}` + cabeçalho `Idempotency-Key` em **UUID** | `envio.ts:72-81` |
| Abrir chat (WhatsApp) | `POST /v2/{conta}/chats/send` `{users_ids:["<dígitos>@s.whatsapp.net"], text}` (campo `users_ids` vs `user_ids` não confirmado) | `POST /api/v1/chats` **multipart** `{account_id, attendees_ids, text}` | `envio.ts:89-90` |
| Responder dentro do chat (LinkedIn, Instagram) | `POST /v2/{conta}/chats/{chat}/messages/send` `{text}` | `POST /api/v1/chats/{chat}/messages` **multipart** `{account_id, text}` | `envio.ts:84-88` |
| Listar chats (conferência) | `GET /v2/{conta}/chats?limit=3` | `GET /api/v1/chats?account_id=&limit=3` | `conferir.mjs:59` |
| Registrar webhook | pelo painel (o segredo é gerado pela Unipile) | `GET/POST /api/v1/webhooks` `{request_url, name, source, events[], format:'json', enabled, headers:[{key,value}]}` com `Unipile-Auth: <segredo>` | `configurar-webhooks.mjs:22-45` |
| Fontes de webhook v1 | — | `messaging`→`message_received`; `email`→`mail_received`; `account_status`→`creation_success, reconnected, sync_success, stopped, ok, error, credentials, permissions, deleted`; `users`→`new_relation` | `configurar-webhooks.mjs:22-27` |

Nenhum endpoint de anexo, convite do LinkedIn, resolução de perfil ou desconexão (`DELETE /accounts/{id}`) existe no
protótipo. O Althius já os tem na v2 e **está à frente** nesses pontos.

### 1.4 Diferenças v1 × v2 que mexem no código

| Tema | v2 | v1 |
| --- | --- | --- |
| Endereço | único (`api.unipile.com`) | **DSN por cliente** (host e porta) |
| Caminho | `/v2/{conta}/…` (conta no caminho) | `/api/v1/…` (conta no corpo: `account_id`) |
| Corpo | JSON em tudo | JSON só no e-mail; **multipart** nos chats |
| E-mail | `plain_text`, `to[].email` | `body` HTML, `to[].identifier`, `Idempotency-Key` UUID |
| Auth do webhook | assinatura `unipile-signature: t=<s>,v0=<hex>` = HMAC-SHA256(`<t>.<corpo bruto>`), janela de 5 min, segredo **gerado pela Unipile** | cabeçalho `Unipile-Auth` = segredo **que o cliente escolhe**; no aviso do link (que não aceita cabeçalho) uma chave `?k=` = HMAC(`conexao:<pedido>`) válida só para o evento de conexão |
| Envelope do evento | `{id, type, account_id, payload}` | sem `type`; cada fonte tem formato próprio (`event` ou `AccountStatus`) |
| Nomes | `message.new`, `email.new`, `relation.new`, `account.*` | `message_received`, `mail_received`, `new_relation`, `AccountStatus.message` |
| Mensagem própria | `payload.is_sender` | `account_info.user_id == sender.attendee_provider_id` |
| Remetente | `sender_id`, `sender_public_identifier`, `sender_profile_url` | `sender.attendee_provider_id`, `attendee_public_identifier`, `attendee_profile_url` |
| Anúncios do LinkedIn | — | `content_type: sponsored\|linkedin_offer` (ignorados) |
| Estado da conta | 1 campo `status` | lista `sources[].status` (qualquer problema = atenção) |
| Paginação | `has_more` | `cursor` |
| Nome do provedor Outlook | `outlook` | `OUTLOOK` (`MAIL`/`IMAP`, `GOOGLE_OAUTH`…) |

### 1.5 Webhooks: como o protótipo recebe

1. `POST /webhooks/unipile` lê o corpo **bruto** (limite 1 MB → 413), confere autenticação **antes** de parsear
   (`servidor.ts:149-159`): primeiro assinatura v2, senão `Unipile-Auth`/`?k=` v1; falhou = 401.
2. Responde **200 na hora** e processa depois, com 3 tentativas e espera crescente (`servidor.ts:46-58`, `:141-146`).
3. `interpretar` (nunca estoura) transforma o evento em uma união discriminada `EventoUnipile`:
   `mensagem | status | relacao | conexao | ignorar{motivo}`. Os motivos de descarte são o vocabulário de erro de
   entrada: `payload_invalido, payload_incompleto, mensagem_propria, grupo (is_group ou >2 participantes), evento_sem_texto
   (is_event/deleted), canal_nao_suportado, anuncio_do_canal, conexao_sem_pedido, status_sem_efeito, email_devolvido_nao_tratado,
   evento_desconhecido`.
4. `processar` chama a porta `Banco` (4 métodos). O log nunca leva remetente nem texto.
5. Mapeamento de estado (o banco só guarda 3): `connected | attention | disconnected`. v2: `account.initial_sync.completed`
   e `account.status.running`→connected; `.disconnected`/`.errored`→attention; `account.remove`→disconnected. v1: `OK, SYNC_SUCCESS,
   CREATION_SUCCESS, RECONNECTED`→connected; `CREDENTIALS, ERROR, STOPPED, PERMISSIONS`→attention; `DELETED`→disconnected;
   `CONNECTING`→nada (`unipile.ts:76-82`, `:166-169`).
6. Id da mensagem é prefixado com a conta (`${conta}:${id}`) porque o id da Unipile só é único dentro da conta.

### 1.6 Tratamento de erro (regra que vale portar)

- **Sem chave = canal desligado, nunca envio simulado** (`envio.ts:42`; ADR 0069 §8 removeu um cliente antigo que simulava sucesso).
- **4xx = recusa definitiva** (nada saiu), **exceto 408 e 429**; **5xx, 408, 429, erro de rede = incerto** e **nunca se reenvia
  sozinho** (`envio.ts:61`). Incerto fica em "enviando" para uma pessoa conferir (`motor.ts`, `respostas.ts:59-60`).
- Enviou mas o registro no banco falhou = **não reenviar**, alerta (`motor.ts:78-82`).
- Resposta sem `message_id`/`id` não é erro: o `ResultadoEnvio` aceita ids nulos (`envio.ts:58`). (No Althius a mesma situação vira
  **incerta**, `UnipileUnreadableResponse`; a regra do Althius é a mais segura e fica.)
- Erros do banco: `23505` na ingestão = replay (`banco.ts:15`).
- **Não há** classificação do motivo da recusa (crédito, limite, perfil inexistente...) além do status HTTP. O Althius tem
  (`classifyProviderError`, `send-chat-step-adapters.ts:77-93`, regex "não confirmado").

### 1.7 Sincronia, cofre e scripts

- **`sincronizarContas`** (`sincronizar.ts:34-68`) roda no mesmo ciclo do envio, sem depender de webhook: (1) um pedido de
  conexão aberto acha a conta recém-criada do mesmo provedor e só liga se houver **exatamente uma** candidata criada depois do
  pedido (tolerância 60 s); (2) o estado das contas acompanha a Unipile (caiu→attention, voltou→connected, sumiu→disconnected,
  **só se a listagem veio completa**). Cobre aviso perdido e sistema sem URL pública.
- **Cofre** (ADR 0049): `internal.cofre_segredos` com texto cifrado AES-256-GCM, chave mestra no servidor, cache de 30 s, só os
  4 últimos caracteres voltam à tela. **Não portar a cifra**: o Althius já usa **Supabase Vault**
  (`vault.create_secret` em `20261001160000_acessos_as_integracoes.sql:126`, leitura em `:142`).
- **`conferir.mjs`**: só lê por padrão (lista contas e 3 chats de cada); `--link <provedor>` gera link; `--enviar` manda uma
  mensagem de teste. Útil como ferramenta de diagnóstico por conta; vale portar.
- **`configurar-webhooks.mjs`**: cria os 4 webhooks da v1 (`--aplicar` para valer; avisa dos antigos, não apaga).
- **`trocar-chave-unipile.mjs`**: grava no `.env` e recria contêiner Docker. **Não se aplica** ao Althius (Supabase).

### 1.8 O que o protótipo diz ter confirmado em conta real

Fonte: comentários de cabeçalho e mensagens de commit do protótipo; **não verifiquei**.

| Item | Estado alegado |
| --- | --- |
| v2: link de conexão de e-mail, assinatura do webhook, eventos `account.*`, `email.new`, envio de e-mail | **Conferido** (comentário em `hospedado.ts:6-8`, `unipile.ts:5-9`, `envio.ts:5-6`) |
| v2: WhatsApp (`chats/send`, `users_ids`), LinkedIn/Instagram (`messages/send`), `message.new`, `relation.new`, nome `instagram` | **Não confirmado** (mesmo texto) |
| v1: listar contas e chats, ler mensagens, **enviar no LinkedIn**; e2e com WhatsApp | Commits `da0dfa7` e `e149e6d` dizem "testado com chave real na v1" / "rodado com sucesso na conta v1". Os cabeçalhos do código ainda dizem "sem teste em conta real". Tratar como alegado. |
| v1: formato dos **webhooks** | **Só pela documentação**, nunca visto com tráfego real (ADR 0070, "Limites conhecidos"); a mensagem recebida só entra por webhook |

Consequência: **o protótipo não confirma nenhum campo v2 de WhatsApp ou LinkedIn do Althius.** Os nomes que o Althius usa em
`private.chat_message_fields` (`id, chat_id, sender_id, is_sender, text/body`) coincidem com os do protótipo v2, mas os dois
vieram da mesma leitura de documentação: coincidência não é prova.

### 1.9 O que NÃO portar

Contêineres Docker e `.env`; a cifra do cofre (usar Vault); `messaging_accounts`, `conversations`, `messages`,
`unipile_ingest_message`, `inbox_replies` e a Caixa (modelo de dados e produto diferentes); créditos; PostgREST via
`bancoViaApi` (o Althius usa `supabase-js`/RPC); catálogo de Integrações (`integracoes/perfis.ts`); Apify, Hermes.
Também **não portar `whatsappId`** (`envio.ts:24-28`): ele presume Brasil (10 ou 11 dígitos ganham `55`) e o próprio comentário
admite o erro para números dos EUA. O Althius normaliza o telefone no Contato
(`20260929170000_varios_emails_e_telefones_por_contato.sql`) e fixa o Destino na ativação (ADR-0014).

## 2. O que já existe no Althius

### 2.1 Código

| Peça | Arquivo | Notas |
| --- | --- | --- |
| Conectar/reconectar/desconectar | `supabase/functions/sender-accounts/index.ts` (180) | `POST /v2/auth/link`, `DELETE /v2/accounts/{id}`; base `:4`, chave `:23` |
| Webhook único | `supabase/functions/unipile-account-status/{index,handler}.ts` (87 + 374) | HMAC v2; `account.*`, `email.new(.bounce)`, `message.new`, `relation.new`; base `index.ts:6`, chave `:62`, segredo `:82` |
| Envio de e-mail | `_shared/send-step.ts`, `send-step-adapters.ts` (96) | base `:13`; `unipileMailVia(apiKey)` |
| Envio de chat | `_shared/send-chat-step.ts` (428), `send-chat-step-adapters.ts` (223) | base `:20`; `unipileChatVia(apiKey)`: `startChat`, `sendChatMessage`, `sendInvitation`, `getLinkedInProfile`, `listChatMessages` |
| Ingestão | `_shared/ingest-email-event.ts`, `ingest-chat-event.ts` | adaptadores finos; **a decisão e a leitura dos campos estão em SQL** (`ingest_unipile_chat_event`, `private.chat_message_fields`) |
| Executor | `sequence-runner/index.ts`, `sequence-step-sends/index.ts`, `reply-proposal-send/index.ts` | cada um lê `UNIPILE_API_KEY` (`:23`, `:13`, `:14`) |
| Anexos | `_shared/anexos-do-envio.ts` | base64 no JSON, v2 |
| Wizards | `scripts/wizard-unipile.sh` (v2, `:206`), `wizard-canais-04.sh` (`:207`), `wizard-canais-05.sh`, `projeto-althius-frontend/scripts/testar-conexao-unipile.mjs` | registram o Webhook Endpoint e gravam 3 segredos |

### 2.2 Banco

| Peça | Tabela / migration | Notas |
| --- | --- | --- |
| Conta remetente | `private.sender_accounts` (`20260925131500`, `…0927114500`) | `unipile_account_id text unique`; **não guarda qual conta Unipile (chave/DSN) a controla** |
| Tentativa de conexão | `private.sender_connection_attempts` | volta pelo `state` |
| Eventos | `private.unipile_email_events`, `unipile_chat_events` | dedupe por `event_id`; **sem conteúdo** |
| Envio do passo (saída) | `private.sequence_step_sends` | tem `subject`, `body` (`20260927013000:43`), `provider_chat_id`, `provider_message_id`, `provider_user_id` |
| Respostas (entrada) | `private.received_emails`, `private.received_chat_messages` | só o que se liga a um Envio nosso; conversa pessoal é descartada de propósito |
| Reconciliação | `conversations_to_reconcile`, `chats_to_reconcile` | confere as conversas dos nossos envios; **não lista contas** |
| Segredos | Vault (`20261001160000`) para chaves de integração | padrão disponível |

### 2.3 O que o Althius faz quando a conta Unipile troca

ADR-0015: todas as `sender_accounts` viram `reconnect_required`. Mas `complete_sender_connection_attempt` só aceita reconexão se
`unipile_account_id` for **o mesmo** (`identity_mismatch`, `20260927114500:106`). Na conta nova o id é outro, então a pessoa
faz **conexão nova** (`on conflict (unipile_account_id) do nothing`): nasce **outra** linha em `sender_accounts` e a antiga fica
parada. Envios e respostas antigos ficam presos à linha antiga. É exatamente o problema que o protótipo resolveu nas
migrations 143 e 146 (a conexão nova reaproveita o registro nosso e só troca o id externo).

## 3. Gap: o que falta no Althius

| # | Falta | Protótipo tem? | Observação |
| --- | --- | --- | --- |
| G1 | **Config por conta Unipile** (nome, DSN/base, versão, chave, segredo do webhook, ativa) e vínculo `sender_accounts → conta Unipile` | Parcial: config global relida a cada uso; uma chave só | **Maior gap; o protótipo não resolve**, é desenho novo. Chave e segredo no Vault, nunca no código nem no frontend |
| G2 | **Cliente HTTP único** (cabeçalhos, timeout, classificação 4xx/5xx/408/429, base por conta) | Parcial (`chamar` em `envio.ts`) | Hoje há 4 cópias de `fetch` e 4 bases fixas |
| G3 | **Contrato TypeScript + Zod** (config, pedidos, respostas, eventos de webhook) | Só tipos TS, sem validação em tempo de execução | Zod não existe no repo. Hoje a leitura é `firstString`/`readChatSent` frouxa |
| G4 | **Adaptador v1** (envio, link, listagem) atrás da mesma interface do v2 | Sim (`envio.ts`, `hospedado.ts`, `sincronizar.ts`) | Só se D1 disser que há conta v1. Contraria a spec hoje |
| G5 | **Webhook por conta Unipile**: segredo por conta, roteamento, autenticação v1 (`Unipile-Auth`, `?k=`) | v1 sim; por conta, não | Cada conta Unipile tem endpoint e segredo próprios. Preciso identificar a conta antes de conferir a assinatura (id na URL, não confiável, só escolhe o segredo; quem prova é o HMAC) |
| G6 | **Normalização do evento v1 → canônico** no limite (TS + Zod), antes da RPC | `interpretarV1` | A RPC lê campos v2 em SQL; a v1 precisa chegar traduzida |
| G7 | **Histórico que sobrevive à troca de conta**: a conexão nova reaproveita a `sender_accounts` e só troca o id externo; conversas/mensagens presas ao registro nosso | Sim (migrations 143 e 146) | Hoje a troca cria linha nova e orfa o histórico. Se D3 pedir caixa completa, falta também o modelo de conversa/mensagem nos dois sentidos |
| G8 | **Sincronia de contas por polling** (achar conta recém-criada, estado, sumiu) | Sim (`sincronizar.ts`) | Cobre webhook perdido e ambiente sem URL pública. Hoje só a reconciliação por conversa existe |
| G9 | **Ferramenta de diagnóstico por conta** (`conferir`: listar contas e chats, só leitura) | Sim (`conferir.mjs`) | Hoje só `testar-conexao-unipile.mjs`, que conecta e-mail |
| G10 | **Wizard/tela para cadastrar, trocar e testar uma conta Unipile** sem deploy | Cofre + tela de superadmin | Hoje trocar = `wizard-unipile.sh` + segredos de função + redeploy mental |
| G11 | Instagram | Sim | Fora de escopo (D4) |
| G12 | Ignorar anúncios do LinkedIn (`sponsored`, `linkedin_offer`) | Sim, só v1 | Pequeno; entra no G6 |

O que o Althius tem e o protótipo **não** (não portar nada, só não regredir): convite e resolução de perfil do LinkedIn,
anexos, idempotência por cabeçalho `X-Althius-Envio`, reconciliação por conversa, aprovação de resposta, regras de
privacidade por titular, pgTAP.

## 4. Como o desenho atende aos seus requisitos

1. **A Unipile é só a ponte.** Uma interface `UnipileBridge` (enviar e-mail, abrir chat, responder, convidar, resolver perfil,
   listar chats/contas, criar link, desconectar), com adaptador v2 (e v1 se D1 mandar). Quem usa só vê a interface. Nenhum
   dado do Althius referencia id da Unipile como chave de negócio: os ids externos são colunas trocáveis.
2. **Conversas e mensagens no Supabase.** Já é o caso para o que está ligado a Sequências (G7 trata da troca de conta; D3 decide
   se vai além). O conteúdo nunca é lido de volta da Unipile para existir.
3. **Chave, DSN e account_id configuráveis por conta, nada fixo.** Registro `private.unipile_connections` (nome, `base_url`,
   `api_version`, `api_key` e `webhook_secret` como nomes de segredo no Vault, `active`, `last_checked_at`) e
   `sender_accounts.unipile_connection_id`. O `account_id` já é `sender_accounts.unipile_account_id`. Trocar chave = atualizar o
   segredo; trocar de conta = apontar a Conta remetente (ou a ativa, se D2 for rodízio) para outra conexão. Ninguém lê
   `Deno.env('UNIPILE_*')` nem escreve `api.unipile.com`. As variáveis atuais ficam como reserva de uma conexão "padrão" até o
   Nan migrar.
4. **Contrato em TypeScript + Zod.** `supabase/functions/_shared/unipile/` com `config.ts` (schema da conexão),
   `v2.ts`/`v1.ts` (schemas de resposta por endpoint e de evento), `events.ts` (união canônica de eventos, equivalente ao
   `EventoUnipile` do protótipo) e `errors.ts` (4xx definitivo, 408/429/5xx incerto, resposta ilegível = incerto, motivo
   classificado). Campos "não confirmado" ficam **explícitos** no schema (`optional()` + comentário com a data a conferir),
   em vez de espalhados em `firstString`.
5. **Segredos.** Chaves entram pelo wizard (`/wizard`), nunca pelo chat. Nada de chave no frontend nem em log.

## 5. Cobertura por ticket

### 5.1 Tickets de canais existentes (`.scratch/canais-cadencia-backend/issues/`)

| Ticket | Status | Cobre (da Unipile) | Cobre algo desta lista? |
| --- | --- | --- | --- |
| 01 Acesso real | closed | identidade e responsabilidade | Não |
| 02 Documento com destinatários | closed | dados | Não |
| 03 Conectar canais pessoais | closed | link v2, `account.add`, estados, desconexão | **Só o v2 e uma conta global.** G1, G4, G5, G8 ficam fora e contrariam o fechamento (ADR-0015) |
| 04 E-mail | closed | envio v2, `email.new`, eco, bounce | Não (e é a parte conferida em conta real) |
| 05 Em segundo plano | closed | Executor | Não |
| 06 WhatsApp | ready-for-human | envio e `message.new` v2 | Só o v2. Validação real pendente |
| **07 LinkedIn** | ready-for-human | convite, mensagem, perfil, `relation.new` v2 | **Só o v2** (§5.3) |
| 08 Propostas | blocked | IA sem credencial de envio | Não |
| 09 Aprovar e enviar | ready-for-agent | envio da resposta | Só chama o envio existente |
| 10 Anexos | ready-for-human | base64 v2 | Não (protótipo não tem anexo) |
| 11 Reconexão | ready-for-human | queda e reconciliação | **Parcial de G8**: reconcilia conversas, não lista contas |
| 12 Validação real | ready-for-human | duas identidades, três canais | Depende de tudo; não implementa nada |
| 13 InMail | ready-for-human | tirar InMail da tela e recusar no envio | Não. O código está na branch `ralph/frente-canais`, **sem push** (segundo o ticket); na `main` a tela ainda oferece InMail |
| `prospeccao-funcional` C1, C3 | closed | telas | Não |
| `crm-real-e-stack` 16 | superseded | aponta para canais-03 | Não reabrir |

**Conclusão: G1, G2, G3, G4, G5, G6, G9, G10 não têm ticket. G7 e G8 têm cobertura parcial (canais-11 e a fatia de histórico
dos 04/06/07), mas não a parte que importa aqui.**

### 5.2 Tickets novos propostos (não criados; você autoriza e eu escrevo)

| Ticket | O que entrega | Bloqueado por | Cobre | Migration | Passos do Nan |
| --- | --- | --- | --- | --- | --- |
| **canais-14** Contrato Unipile em TS + Zod | `_shared/unipile/` (schemas de conexão, pedidos, respostas, eventos; erros tipados), testes Deno com as respostas de exemplo de cada versão. Sem mudar comportamento: os adaptadores atuais passam a validar por ele | D5 | G3 | não | não |
| **canais-15** Contas Unipile configuráveis | `private.unipile_connections`, `sender_accounts.unipile_connection_id` (aditivo, preenchido com a conexão "padrão"), RPCs de cadastro/troca/teste (só superadmin ou Nan), segredos no Vault, wizard para cadastrar uma conta; **ADR que emenda a 0015** e atualização do `ORDEM-BUILD-FUNCIONAL.md:87`; a conexão nova reaproveita a `sender_accounts` (G7) | 14, D1, D2 | G1, G7, G10 | **sim**, aditiva | **sim**: aplicar migration, wizard, deploy |
| **canais-16** Cliente e adaptadores | Cliente HTTP único + `UnipileBridge`; adaptador v2 (portando o que há) e, se D1, v1 (porta de `envio.ts`/`hospedado.ts`/`sincronizar.ts`); as 4 bases fixas e as leituras de `UNIPILE_API_KEY` somem; script `unipile:conferir` por conta | 14, 15 | G2, G4, G9 | não | deploy das funções |
| **canais-17** Webhook por conta e sincronia | `unipile-account-status` resolve a conexão pelo id na URL, confere o HMAC com o segredo dela; autenticação v1; `interpretarV1` portado e normalizado para o evento canônico; `sincronizarContas` portado | 15, 16 | G5, G6, G8, G12 | talvez (função de estado) | cadastrar o endpoint por conta, deploy |
| **canais-18** Histórico além da troca de conta (**só se D3 pedir caixa completa**) | Modelo de conversa e mensagem nos dois sentidos, privado ao titular | 15, spec nova | G7 parcial | sim | sim |

Cada migration segue `docs/agents/migrations.md` (aditiva, timestamp maior que a última da `main`, uma por ticket, pgTAP
próprio, nenhum teste antigo alterado). A única função existente que o canais-15 redefine é
`complete_sender_connection_attempt`, a partir da definição mais recente da `main` (`20260927114500`); em `sender_accounts` só entra
coluna nova nula.

### 5.3 Atenção especial: canais-07 (LinkedIn)

**O que o canais-07 cobre hoje.** Convite com nota (`POST /v2/{conta}/users/me/relation-requests`), mensagem a conexão
(`startChat`), resolução de perfil (`GET /v2/{conta}/users/{id}`), leitura de `network_distance`, `relation.new` como "não resposta",
pausa na resposta real. Código em `send-chat-step.ts:184-190,313-357`, `send-chat-step-adapters.ts:150-223`, migration
`20261001150000`. InMail fora por decisão do Renan; o ajuste de tirá-lo da tela e recusá-lo no envio é o canais-13, ainda
`ready-for-human` com o código só na `ralph/frente-canais`, sem push. O que falta no 07 é só **o envio real** (convite e mensagem), e os campos "não confirmado" dependem dele.

**O que o protótipo traz para o 07, e o que não traz:**

| Do protótipo | Serve ao 07? |
| --- | --- |
| Responder dentro de um chat existente do LinkedIn (v1 multipart, v2 `messages/send`) | O Althius já faz na v2 (`sendChatMessage`). Útil só como **evidência de que a v1 funciona**. |
| Evidência de envio no LinkedIn **na v1 com conta real** (commit `da0dfa7`) | **Não valida nada da v2** nem do convite/perfil, que o protótipo nem tem. Não marca checkbox do 07. |
| Leitura de remetente do LinkedIn: `sender_public_identifier`, `sender_profile_url`, `sender_id`, `sender_provider_id` (v2); `attendee_public_identifier` etc. (v1) | O Althius resolve o remetente pelo `provider_user_id` guardado no Envio (`ingest_unipile_chat_event`, ramo `linkedin`). O protótipo casa pelo **identificador público** no CRM; o Althius não. Serve de lista de campos alternativos, sem validar. |
| Ignorar `sponsored`/`linkedin_offer` (v1) | Pequeno ganho; entra no canais-17. |
| `new_relation` v1 (`user_public_identifier`, `user_profile_url`, `user_provider_id`) | O Althius já aceita o apelido `new_relation` e só registra. O payload v1 só entra com o adaptador v1. |
| Decisão "convite e InMail não entram" (ADR 0069 §5) | **Diverge** do Althius (convite e mensagem dentro, InMail fora). **A fonte de verdade é o Althius; não portar a restrição.** |

**Riscos específicos do 07 que este plano cria ou revela:**

1. **Conta v1 × código v2.** Se a conta de LinkedIn que o Nan tem for v1 (como a do protótipo), o 07 **não pode ser validado
   ao vivo** com o código atual, e a ADR-0015 diz que conta v2 não aceita v1. A resposta de D1 decide se o 07 é executável.
2. **Passos do Nan duplicados.** Os passos do 07 (conectar LinkedIn, recadastrar o webhook com `message.new`, ligar o canal,
   enviar) usam a chave e o segredo globais. O canais-15 muda onde ficam. Se o Nan fizer a rodada real do 06/07 **antes** do 15,
   refaz o cadastro do webhook e dos segredos depois.
3. **`unipileChatVia(UNIPILE_API_KEY)`** (`sequence-runner/index.ts:112`) e a base fixa
   (`send-chat-step-adapters.ts:20`) passam a vir de uma conexão resolvida pela Conta remetente. Os 52 testes Deno do 06/07 vão
   precisar de ajuste de fábrica, não de lógica. Eles ficam como rede de segurança do canais-16.
4. **`classifyProviderError`** (critério 3 do 07) usa regex sobre texto de erro "não confirmado". O protótipo só classifica por
   status HTTP, então **não ajuda**. Vira schema de erro no canais-14, com as mensagens reais registradas no primeiro envio.
5. **Normalização em SQL.** `private.chat_message_fields` lê só nomes v2. A v1 exige traduzir no limite (canais-17), não
   alterar a função SQL, que é compartilhada com o 06 (regra "Pode mexer / Não mexa": a função só se redefine a partir da
   definição mais recente da `main`).
6. **Frente.** O `ORDEM-BUILD-FUNCIONAL.md` e dezenas de tickets de Conexões e Agentes proíbem mexer em `sender-accounts`,
   `unipile-account-status`, segredos `UNIPILE_*` e no Webhook Endpoint. Quem mexe é a frente de canais (Kauê, segundo o `ORDEM-BUILD-FUNCIONAL.md`); os
   tickets novos entram no mesmo dono e não reabrem nenhum ticket `closed`.

**Ordem que recomendo:** 14 → 15 → 16 → (rodada real do 06 e do 07 já na config nova) → 17 → 11 (conferência real) → 12.
Alternativa se você quiser a rodada real **antes**: só com uma conta v2 e aceitando refazer os passos do Nan depois do 15.

## 6. Riscos e limites deste mapa

- Li o protótipo e o Althius; **não executei nada** nem chamei a Unipile. O que o protótipo "confirmou" é alegação dele.
- A contagem de arquivos com base fixa (4) vem de `grep`; confira antes do canais-16.
- ADR-0013 (Supabase auto-hospedado em VPS) e o `AGENTS.md` (projeto `ycbdilsmydvzezhlymty` na nuvem) descrevem o ambiente de
  formas diferentes. Não afeta este mapa, mas afeta onde o Vault e os deploys rodam.
- Mudança de segredo, de configuração de Auth e qualquer escrita destrutiva no banco pedem seu aval antes (AGENTS.md); os tickets
  acima trazem "Passos do Nan" onde há ação humana, com wizard em vez de chave no chat.

# Handoff: três bugs de produção da v1 (e-mail, WhatsApp, número próprio)

Branch `kaue/fix-v1-email-whatsapp`, base `main` (cea5675). Área de canais e Sequências. **Arquivos compartilhados tocados:** `projeto-althius-frontend/package.json` (um script `unipile:numero-proprio`, ao lado do `unipile:conferir`) e `projeto-althius-frontend/src/fonte/motivos-do-envio.ts` (uma linha de motivo). `private.release_chat_step_send` **não** foi tocada.

Nada foi aplicado no remoto nem publicado. Antes de escrever, li o remoto só para leitura (o envio `2198de38…`, a Conta remetente `6207fed4…` e os eventos de chat): o envio tem só `provider_email_id` `d-xgsvRATSOxw2SkcnJR3A`; `own_provider_id` é NULL nas contas de WhatsApp e LinkedIn.

## Bug A: a resposta de e-mail da v1 não ligava ao envio

**Por que as chaves não servem.** O envio guarda o `tracking_id`; a resposta traz `in_reply_to.id` = `hfqVeXPLUp-cEc9OtgjAlQ` (o id do e-mail enviado NA CAIXA, outro) e `in_reply_to.message_id` = `<CAAPQ0BpN2yc…@mail.gmail.com>`. O envio não tem Message-ID nem conversa, e o eco não chega. Nenhum dos ids que o envio guarda aparece na resposta.

**O caminho escolhido (e por quê).** Liguei pelo que a Althius já controla e eu consigo provar: o remetente da resposta é o **Destino** de um envio da Conta, o **assunto** é o do envio (sem `Re:`/`Enc:`), foi escrito **depois do envio**, e o aviso é uma resposta (`in_reply_to` presente). Escolhi isso e não as duas alternativas:
- *Buscar o e-mail enviado na v1 (por `tracking_id`/`provider_id`) e gravar o Message-ID:* é o caminho certo a longo prazo, mas o endpoint de leitura da v1 não está confirmado (`getEmail` é `unsupported` na v1) e eu não tenho como chamá-lo aqui; já acertamos errado o formato uma vez (`fix-envio-email-v1`). Fica como melhoria, quando houver prova.
- *Gravar o `provider_id` (id do Gmail) e casar por ele:* o aviso da resposta não traz nenhum id do provedor do e-mail respondido; só o `in_reply_to.id` da caixa, que não bate com nada que o envio guardou.

**Mudança (migration `20261010095136_correcoes_da_v1_email_e_whatsapp.sql`).** `ingest_unipile_email_event` ganha o passo **4b**, depois do passo 4 de sempre (conversa, In-Reply-To/References, e os ids do `fix-resposta-email-v1`), só quando o e-mail traz `in_reply_to` e o passo 4 não ligou nada. Quando liga por 4b, o envio **aprende** o Message-ID (`in_reply_to.message_id`) e a conversa (`thread_id`), e o resto da conversa passa a ligar pelos caminhos normais. Função auxiliar `private.email_subject_key`. Definição base: a de `20261010011333`.

**v2 não muda:** o passo 4b só roda com `in_reply_to` (a v2 não manda; nenhum fixture v2 tem). Os 51 testes de `ingestao_de_email_da_unipile.sql` seguem iguais.

**Risco assumido:** qualquer resposta de um Contato que a sequência escreveu, com o mesmo assunto e dentro da mesma Conta remetente, liga ao envio mais recente aceito para esse endereço e pausa a Sequência. É a leitura segura (pausa, não envia). Um Contato que mude o assunto fica sem relação, como hoje.

**Mudança num teste existente (v1, não v2):** `supabase/tests/resposta_de_email_v1.sql`, caso B ("a reply to an e-mail the sequence did not send"). Ele usava mesmo remetente e mesmo assunto com `in_reply_to` desconhecido, que é exatamente o caso real que agora liga. O caso passou a usar outro assunto (continua `unrelated`); o novo comportamento tem teste próprio em `resposta_de_email_v1_pelo_remetente.sql`.

**A resposta que já ficou sem relação** (envio `2198de38`, 06:35:56) continua `unrelated`: o evento já foi gravado. A correção vale para as próximas; se quiser recuperar essa, é uma reavaliação manual do evento, fora deste escopo.

## Bug B: WhatsApp não ligava a resposta (`own_provider_id` nulo)

Na v1, o aviso de WhatsApp não diz de quem é a mensagem (sem `is_sender`, e sem `account_info.user_id` ele não sabe o titular), então com `own_provider_id` nulo o banco devolve `unrelated`. O LinkedIn funciona porque o aviso traz `account_info`.

**Correção em três partes:**
1. **Banco:** `learn_sender_own_provider_id(conta, número)` (grava se mudou; valida `<dígitos>@s.whatsapp.net` ou `@lid`; só `service_role`) e `sender_own_provider_id(conta)` (lê; só `service_role`).
2. **Número da conta:** a lista de contas da v1 (`GET /api/v1/accounts`) passa a ler `connection_params.im` e devolve `ownProviderId` só para WhatsApp (`im.id` se já vier no formato, senão `phone_number` só com dígitos + `@s.whatsapp.net`). `account-directory` repassa. **Não confirmado:** o formato real de `connection_params.im` na v1. Um formato diferente é descartado sem derrubar a lista.
3. **Webhook (`unipile-account-status`):** antes de ingerir uma mensagem de chat, e depois de concluir uma conexão, ensina o número ao banco (uma vez por instância; se o banco recusar, a mensagem é ingerida do mesmo jeito e o log diz `own_id_not_saved`).

**Backfill.** SQL não sabe o número; ele só vem da Unipile. Duas vias: (a) o webhook ensina na primeira mensagem de cada conta (já cobre as conectadas, sozinho); (b) `scripts/unipile-numero-proprio.ts` (`npm run unipile:numero-proprio` no frontend) lista as contas da conexão ativa e, **com `--aplicar`**, grava o número nas de WhatsApp (sem `--aplicar` só mostra; o número é mascarado). Precisa de `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`; a chave da Unipile vem do Vault.

**Limite:** se o WhatsApp usar `@lid` no remetente, o número não se deriva do telefone; o `lid` só entra se a v1 o devolver em `connection_params.im.id`.

**Log temporário** `temp_v1_chat_raw` (marcado `TEMPORÁRIO`): corpo do aviso `message_received` da v1 só das mensagens que vão ser ingeridas, com o texto da mensagem trocado pelo tamanho. Sem segredos (o `Unipile-Auth` não faz parte do corpo). Serve para ver quem é o remetente e se vêm `is_sender`/`account_info`. **Remover depois** (bloco em `handler.ts`, `isMessageReceived`/`withoutChatText` e o teste).

## Bug C: passo de WhatsApp para o próprio número

`send-chat-step.ts`: antes de falar com a Unipile, se o Destino (só dígitos) é o número da própria Conta remetente (`ChatSendDb.ownProviderId`, lido por `sender_own_provider_id`), o passo fica `blocked` com o motivo `destination_is_sender_account`; vale para conversa nova e já aberta. `motivos-do-envio.ts` traduz: "o número do Contato é o da própria Conta remetente de WhatsApp; troque o telefone do Contato ou a Conta remetente e ative os envios de novo".

**Depende do Bug B:** sem o número da conta (ou com a leitura falhando) o envio segue como sempre (falha aberta, para uma falha de leitura não travar todos os envios). Por isso o backfill/aprendizado vem junto.

## Testes

- Vermelhos antes, por bug: pgTAP `resposta_de_email_v1_pelo_remetente.sql` (A, 5 asserções), `whatsapp_v1_identidade_propria.sql` (B/C, falhava na função inexistente); Deno `bridge.test.ts`, `account-directory.test.ts`, `handler-v1.test.ts`, `send-chat-step-proprio-numero.test.ts`, `send-chat-step-adapters.test.ts`; vitest `motivos-do-envio-proprio-numero.test.ts`.
- Depois: pgTAP **suíte inteira ok** num Postgres 16 descartável (A 13/13, B/C 20/20); `deno test supabase/functions` 992 passaram; `deno check` limpo; guard `sem-base-fixa` ok; vitest dos motivos ok; `oxlint` sem erros (só avisos antigos).
- **v1 e v2 coexistem:** nos arquivos de teste existentes só foram **acrescentados** testes (0 linhas removidas), à exceção do caso B de `resposta_de_email_v1.sql` explicado acima, que é um teste da v1. Nenhuma asserção da v2 mudou.

## Pendente de publicação (nada aplicado nem publicado)

- **Migration** `20261010095136_correcoes_da_v1_email_e_whatsapp.sql` (primeiro).
- **Funções:** `unipile-account-status` (`--no-verify-jwt`; passo 4b via banco, aprendizado do número, log temporário) e `sequence-runner` (recusa do próprio número). `sender-accounts` e `sequence-step-sends` não mudaram de comportamento (carregam o módulo, mas não precisam ser republicadas).
- Depois de publicar: rodar `npm run unipile:numero-proprio` (simulação) e depois com `--aplicar` no frontend, ou deixar o webhook ensinar na primeira mensagem de cada conta.

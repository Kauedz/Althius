# 02: O bot ouve o Slack e responde sem chamar Agente

Spec: [../spec.md](../spec.md) (seções "Recebimento de eventos", "Do evento à decisão" itens 1, 2, 4 sem abrir fio, 5 e 6; US 14–18, 31–35, 43–46). Decisões: Q9, Q10, Q14, Q16, Q18.

**What to build:** o Slack entrega eventos a uma Edge Function nova e o bot responde no thread da mensagem com as respostas curtas que não chamam Agente: "não reconhecido" (e-mail sem Participação ativa, convidado do Slack, Slack Connect, Participação removida), "mencione um Agente: @Scopus ou o nome completo" (canal ou DM sem @Agente), "esse Agente não atende no Slack" (Agente fora da lista de canais da Personalização), "um Agente por fio" (mais de um Agente) e "só leio texto por enquanto" (só arquivo, áudio ou canvas). Nenhuma dessas respostas cria Execução, Conversa ou consumo de Crédito. Quando o Slack desinstala o app ou revoga o token, a Althius marca o Canal como retirado.

Neste ticket, uma mensagem válida com exatamente um Agente ainda não abre fio (isso é o ticket 03): o handler chega até a decisão "abrir fio" e para ali, coberto por teste.

**Decisões confirmadas pelo Nan (14/10/2026):** mais de um Agente na mensagem de abertura é recusado; Agente mencionado fora da lista de canais recebe "não atende no Slack" em vez de ser tratado como sem Agente; no DM, mensagem sem @Agente recebe o aviso, sem Agente padrão.

**GATE:** uma migration só, aditiva, com pgTAP (reserva de `event_id`, no padrão de `claim_stripe_event`); sem deploy e sem aplicar no remoto; a pessoa não reconhecida nunca vira Conta, convite nem visitante e nada dela é registrado; pt-BR, sem emojis.

**Blocked by:** 01 (Instalar e retirar o Canal Slack).

**Status:** ready-for-human (código no `main` pelo PR #220; falta o Nan confirmar ou aplicar as migrations 20261027100000, 20261028100000 e 20261029100000 e publicar as funções)

## Pode mexer

- migration nova (reserva de `event_id`; RPCs só para o service role que resolvem a instalação ativa por `team_id`, a Conta de usuário por e-mail verificado com Participação ativa e os Agentes com "slack" nos canais) e o pgTAP dela
- Edge Function nova de eventos do Slack (sem JWT), no padrão `createHandler(deps)` com banco, cliente do Slack, relógio e segredos injetados, e os testes Deno dela
- o cliente da API do Slack em `_shared/` criado no 01 (ler usuário, postar no thread)
- `_shared/mencoes.ts` só para reaproveitar `reconhecerMencoes` (sem mudar o comportamento existente)

## Não mexa

- `agent-conversation`, `_hermes-worker`, `_shared/orquestracao.ts`, as RPCs de Conversa e de Execução
- a Integração Slack pelo MCP, `integration-*`
- frontend
- testes existentes

## Critérios

- [x] Assinatura HMAC-SHA256 sobre `v0:{timestamp}:{corpo}` comparada em tempo constante, janela de 5 minutos; assinatura inválida ou velha é recusada
- [x] Desafio de verificação de URL respondido
- [x] Confirma com 200 em menos de 3 segundos e processa depois
- [x] O mesmo `event_id` reenviado é confirmado sem efeito (nada postado duas vezes)
- [x] Ignorados: mensagens de bots (inclusive do @Althius), edições, remoções e outros subtipos
- [x] Sem instalação ativa para o `team_id`, o evento é ignorado
- [x] Convidado (restrito ou ultra-restrito), Slack Connect, e-mail sem Participação ativa e Participação removida recebem "não reconhecido"
- [x] Os avisos e recusas acima saem sempre no thread da mensagem, nunca soltos, sem Execução nem Crédito
- [x] `app_uninstalled` e `tokens_revoked` marcam a instalação como retirada
- [x] Confirmado na documentação oficial do Slack o escopo e o evento que entregam as respostas de thread em canal sem menção ao bot, com a fonte registrada nos Comments deste ticket
- [ ] lint, `deno test`, `deno check` e pgTAP do zero verdes (Deno verde; pgTAP não rodado localmente, ver Comments)

## Passos do Nan

- No app @Althius em api.slack.com: ligar a API de eventos com a URL da função nova e assinar os eventos de menção ao app, mensagem no DM com o app, mensagens dos canais em que o bot está, `app_uninstalled` e `tokens_revoked`
- Gravar o segredo de assinatura do app do Canal
- Publicar a função nova sem verificação de JWT
- Aplicar a migration conforme `docs/agents/migrations.md`
- No Slack de teste: mencionar @Althius sem Agente, com um Agente fora da lista, com dois Agentes, com um arquivo só, e com uma conta sem Participação; conferir cada resposta no thread

## Comments

**2026-10-15, agente: fontes do Slack conferidas na documentação oficial.**

- Respostas de thread em canal sem menção ao bot: chegam como evento `message` comum, com `thread_ts` diferente do `ts` ("examine message events' `thread_ts` value. When present, it's a reply"; o subtipo `message_replied` não vem pela API de eventos). Fonte: https://docs.slack.dev/reference/events/message/message_replied
- Canal público em que o bot está: evento `message.channels`, escopo `channels:history`. A própria página diz que, para receber só o que é dirigido ao app, o certo seria `app_mention`, ou seja, `message.channels` entrega também o que não menciona o bot. Fonte: https://docs.slack.dev/reference/events/message.channels
- DM com o app: evento `message.im`, escopo `im:history`. Fonte: https://docs.slack.dev/reference/events/message.im
- Canal privado: seria `message.groups` com `groups:history`, que o app não pede (o 01 já registrou esta decisão para o Nan). A menção ao bot (`app_mention`) chega de canais privados de qualquer forma; só a continuação sem @ no ticket 04 depende disso.
- Assinatura: `X-Slack-Signature` = `v0=` + hex do HMAC-SHA256 de `v0:{X-Slack-Request-Timestamp}:{corpo}`, comparação em tempo constante, recusa acima de 5 minutos. Fonte: https://docs.slack.dev/authentication/verifying-requests-from-slack
- Desafio de URL: `{"type":"url_verification","challenge":…}`, responder 200 com o `challenge`. Fonte: https://docs.slack.dev/reference/events/url_verification
- Confirmar em até 3 segundos; o Slack reenvia até 3 vezes (`x-slack-retry-num`), e o `event_id` é único entre todos os workspaces. Fonte: https://docs.slack.dev/apis/events-api
- E-mail do usuário: `users.info` com `users:read` e `users:read.email`; quem vem de outro workspace por canal compartilhado traz `is_stranger`. Fonte: https://docs.slack.dev/reference/methods/users.info

**2026-10-15, agente:** implementado (commit na `main` local, ainda não publicado).

- Migration `20261024100000_eventos_do_canal_slack.sql` (aditiva) com o pgTAP `supabase/tests/eventos_do_canal_slack.sql` (24 asserções): `claim_slack_channel_event`, `slack_channel_active_installation`, `slack_channel_account_by_email`, `slack_channel_agents` e `withdraw_slack_channel_by_slack`, só para o service role.
- Edge Function `slack-channel-events` (sem JWT, segredo `SLACK_CHANNEL_SIGNING_SECRET`), no padrão `createHandler(deps)`. `_shared/slack-api.ts` ganhou a assinatura, `users.info` e `chat.postMessage`. `supabase/config.toml` ganhou a função (fora do "Pode mexer", necessário para publicar sem JWT, como no 01).
- Com exatamente um Agente que atende no Slack, a função chega à decisão `abrir_fio` (no log, com Conta, Agente, canal e `thread_ts`) e para ali.

Verificação: `deno test supabase/functions` com 1506 passando, `deno check` e `deno lint` limpos. **O pgTAP não rodou nesta máquina** (sem Postgres local); precisa passar no CI ou por `scripts/pgtap-no-remoto.sh` antes de aplicar.

Escolhas a confirmar com o Nan:
- Um Agente do Slack e outro fora da lista na mesma mensagem recebem "um Agente por fio" (a regra de mais de um Agente vem antes).
- `thread_broadcast` (resposta de thread também enviada ao canal) é tratado como "outro subtipo" e ignorado.
- A reserva do `event_id` guarda só o id, o `team_id` e o tipo, e é apagada depois de 30 dias.
- `supabase/functions/README.md` ainda não descreve as funções do Canal Slack (nem as do 01).

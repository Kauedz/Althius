# Handoff: envio de e-mail pela v1 ficava incerto e sem ids

Branch `kaue/fix-envio-email-v1`, base `main` (5a182fb). Correção de produção, só em `_shared/unipile/`. Sem migration, sem arquivo compartilhado fora da área de canais.

## O defeito

`v1.ts` exigia `id` na resposta de `POST /api/v1/emails`. A v1 responde `{"object":"EmailSent","tracking_id":"...","provider_id":"..."}`, então a leitura falhava (`UnipileUnreadableResponse`) e `send-step.ts` (`enviarEmailComPrazo`) gravava `unreadable_response` / `uncertain`, sem `provider_email_id`. O envio real `f66db843-10d3-44a8-8951-f2fe4c1a8dca` está assim no banco (`status uncertain`, `last_error unreadable_response`, ids nulos), embora o e-mail tenha saído.

## A correção

`v1.sendEmail.response` agora lê `tracking_id` e `provider_id` e devolve `{ id, message_id }`, o mesmo formato que a v2 devolve e que o núcleo do envio grava:

- `id` = `tracking_id` (o id do e-mail na Unipile: `UJp_CFd5UVe3XTbXf_vK4A` no envio real). Sem ele, `provider_id` (`1a1234990c2a7b02`).
- `message_id` = `null`. A v1 não devolve o Message-ID do cabeçalho.
- Sem nenhum dos dois ids, continua ilegível/incerto.

O núcleo (`send-step.ts`, `bridge-v1.ts`) não mudou.

## Qual id a v1 usa nos eventos: não confirmado

Não consegui confirmar, e deixei marcado "não confirmado" no `v1.ts`:

- Nenhum evento `mail_received` da v1 chegou ao banco ainda (os eventos que existem são da v2; lá o `email.id` é o id hex do provedor, no formato de `1a1234990c2a7b02`).
- A tradução do evento v1 (`events-v1.ts`) grava `email.id = email_id` do evento. Pela documentação da v1, `email_id` é o id da Unipile, que é o que o envio chama de `tracking_id`; por isso escolhi `tracking_id`.
- Se o `email_id` do evento vier com o id do provedor (`provider_id`, hex), a troca é uma linha em `v1.ts` (inverter a ordem do `??`) e o teste correspondente.

Como a ligação funciona (`ingest_unipile_email_event`): o eco do envio casa por cabeçalho `X-Althius-Envio` (se o evento v1 trouxer `headers`), por `provider_email_id` ou por `provider_message_id`; a resposta casa pela conversa (`thread_id` gravado no eco) ou por `In-Reply-To`/`References` contra `provider_message_id`. Como `message_id` fica nulo, na v1 a resposta só liga ao envio pelo eco (cabeçalho ou id), não por `In-Reply-To`.

**Para conferir com tráfego real:** depois do próximo envio v1, ver o evento que a conta gera na caixa enviada e comparar `unipile_email_events.provider_email_id` com `sequence_step_sends.provider_email_id` do envio. Igual: ok. Diferente: inverter o `??`.

## Atenção: envio incerto na v1 não se resolve sozinho

`getEmail`, `listThreadEmails` e `listEmailSenders` são `unsupported` na v1 (`bridge-v1.ts`), então a conferência da conversa antes do próximo e-mail (`checkConversation`) falha com `thread_check_failed` e o Executor barra os passos "Re:" daquela conversa. Um envio que fique `uncertain` na v1 depende do eco chegar por webhook. **Não implementei esses métodos** (fora do pedido); precisam de ticket próprio, com conta v1 real para conferir os endereços.

O envio `f66db843…` já gravado como `uncertain` continua assim: a correção vale para os próximos. Se o eco dele chegar pelo webhook (cabeçalho `X-Althius-Envio`), a ingestão o marca como enviado; senão, é conferência manual (reconciliação).

## Testes

- Vermelhos antes: `contract.test.ts` (fixture real do envio v1), `bridge.test.ts` (resposta real da v1, e o núcleo `enviarEmailComPrazo` devolvendo `sent` com o id, que antes dava `uncertain`/`unreadable_response`).
- `deno test supabase/functions`: 977 passaram, 0 falharam. `deno check` limpo. Guard `sem-base-fixa` ok. `deno lint` limpo nos arquivos alterados (a main tem avisos antigos em outros testes).
- Os fixtures do envio de e-mail da v1 em `bridge.test.ts` e `connection.test.ts` passaram para o formato real.

## Pendente de publicação (nada foi aplicado nem publicado)

Funções que importam `_shared/unipile/v1.ts` e precisam ser republicadas para a correção valer em produção: `sequence-runner` (envio do Executor), `sequence-step-sends` (envio manual), `reply-proposal-send`, `sender-accounts` e `unipile-account-status` (as duas últimas só carregam o módulo, não enviam e-mail; republicar por consistência é opcional). O mínimo para o envio: `sequence-runner`, `sequence-step-sends` e `reply-proposal-send`.

Migration: nenhuma.

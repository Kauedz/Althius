# Handoff: canais-cadencia-backend 14, contrato da Unipile em TypeScript e Zod

Branch: `kaue/canais-14-contrato-unipile`. Ticket: `.scratch/canais-cadencia-backend/issues/14-contrato-unipile-em-ts-e-zod.md`. Spec e ADR-0024 lidas.

Gate: o único Blocked by é a ADR-0024 aceita (PR #157), que está na `main` (`f6670ce`). Sem dependência de outro ticket.

## O que entrou

`supabase/functions/_shared/unipile/` (novo):

- `zod.ts`: único arquivo do repositório que importa o Zod, `npm:zod@3.25.76`. Não existe arquivo de dependências do Deno
  (nem `deno.json`) no repositório; criar um mudaria como as funções resolvem imports, então a versão fica fixada aqui.
- `config.ts`: schema da conexão (`base_url` https, `api_version` v1/v2, nome do segredo da chave, nome do segredo do webhook).
  `.strict()`: a chave não é campo, e a mensagem do erro lista só nomes de campo.
- `errors.ts`: `UnipileRequestError` e `UnipileUnreadableResponse` (movidos de `send-step.ts`, que os reexporta), `UnipileConfigMissingError`,
  `classifyHttpFailure` (4xx exceto 408/429 = recusa definitiva; o resto = incerto), `failureKind`, `AUTO_RESEND_ALLOWED` (tudo `false`,
  no tipo) e `classifyProviderError` (movido de `send-chat-step-adapters.ts`, que o reexporta).
- `common.ts`: `looseId` (o antigo `firstString`, dentro do schema), `readResponse` (schema ou `UnipileUnreadableResponse` com os caminhos, nunca os valores).
- `v2.ts` e `v1.ts`: pedido e resposta das nove operações (link de conexão, listar contas, desconectar, e-mail, abrir chat, responder, convidar, resolver perfil, listar mensagens).
- `events.ts`: união canônica (`message | email | relation | account_status | connection | ignore`), os 11 motivos de descarte do mapa (§1.5) e `parseV2WebhookEvent`.
- `index.ts`: barril, mais `UNIPILE_OPERATIONS`.

Adaptadores que passam a ler pelos schemas, sem mudar asserção de teste: `send-step-adapters.ts` (resposta do envio de e-mail),
`send-chat-step-adapters.ts` (ids do envio, convite, perfil, lista de mensagens, tipo da recusa) e `unipile-account-status/handler.ts`
(o parse do evento v2 e a tradução do estado da conta saíram do handler; ele só decide a resposta HTTP).
`send-step.ts`: só trocou as duas classes de erro por reexportação (necessário para o `instanceof` valer com a classe nova).

## Loop

Vermelho primeiro: escrevi os testes de `_shared/unipile/` antes do código (`deno test` falhou por falta do módulo), depois implementei.
Os testes dos adaptadores e do handler não mudaram de asserção.

- Antes: `deno test supabase/functions` 787 passed.
- Depois: 837 passed, 0 failed (50 novos: config, erros, 9 operações x 2 versões, eventos, adaptadores).
- `deno check supabase/functions/*/index.ts` limpo. `deno lint` limpo nos arquivos tocados.
- Frontend não foi tocado (fora do escopo do ticket); lint e typecheck dele não rodaram.

## Para decisão humana

1. **429 e 503.** O ticket manda tratar 429 como incerto (e a spec do mapa diz o mesmo), mas `send-chat-step.ts` (`isDefinitelyNotProcessed`)
   trata 429 e 503 como "não foi processada" e repete depois do Retry-After, e há teste cobrindo isso. Como a regra do ticket é "nada muda no
   comportamento", só o tipo (`kind`) segue o ticket; a decisão do núcleo de envio ficou como estava. Se o 429 deve virar mesmo incerto no
   envio de chat, é mudança de regra de envio (fora do `Pode mexer`) e pede ticket próprio.
2. **v1 inteira é "não confirmada".** O mapa do protótipo só cobre link, listar contas, e-mail, abrir chat, responder e listar chats.
   Desconectar, convidar, resolver perfil e listar mensagens na v1 não existem no protótipo; o formato é o da documentação como lembrada
   e está marcado no código. Conferir no primeiro envio real com uma conta v1.
3. `listChatMessages` (v2) agora devolve erro tipado se a resposta não é lista nem objeto (antes virava lista vazia). Objeto vazio continua lista vazia.

## Deploy e arquivo compartilhado

- Sem migration. Sem `package.json` nem lockfile alterados.
- Pendente deploy pelo Nan (as quatro funções que importam os arquivos tocados): `sequence-step-sends`, `sequence-runner`,
  `reply-proposal-send`, `unipile-account-status`. A primeira publicação resolve `npm:zod@3.25.76` no bundle do Supabase; se o deploy
  reclamar do pacote, é por aqui.
- Os canais-15 a 17 usam estes schemas: 15/16 para a configuração e o cliente único, 17 para traduzir a v1 para a união canônica.

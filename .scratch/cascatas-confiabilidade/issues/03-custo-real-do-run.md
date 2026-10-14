# 03: Custo real do run

**What to build:** O custo gravado no passo e somado na execução é o `usageTotalUsd` do run (`GET /v2/actor-runs/{id}`), ou o mesmo número em `stats` (`usageTotalUsd`, `usageUsd`) ou `usageUsd` no topo. A leitura se repete, para qualquer modelo de preço, enquanto `esperaDoCustoMs` for maior que zero, até o total ficar positivo e igual em duas leituras. Se o total não chega, vale a leitura que já existia (o maior entre o total e a soma dos eventos). Um zero lido continua zero: a estimativa do passo não entra no lugar. `esperaDoCustoMs: 0` não dispara releitura. O rodízio `APIFY_TOKEN_1`..`APIFY_TOKEN_5` e o legado `APIFY_TOKEN` ficam como estão. A foto de Contato continua só no legado.

**GATE:** nenhum bloqueio. Não editar `src/**/sinais/**`, a RPC de Sinais de mercado, `proposta_recusada` nem `catalogo.ts`. Sem deploy. Sem aplicar migração. Sem segredo. Não criar nem alterar `APIFY_TOKEN_*`.

**Blocked by:** nenhum.

**Status:** ready-for-human

## Pode mexer

- `fonte-apify.ts` (leitura do custo) e `falso-apify.ts` (o run falso devolve `stats` e pode omitir o total no topo).
- `fonte-apify.test.ts`.
- Este ticket.

## Não mexa

- A ordem das contas em `apify-ambiente.ts`.
- `contact-photo-lookup`.
- Catálogo e telas de Sinais.
- Segredos, Auth, deploy e o projeto remoto.

## Critérios

- [x] Leituras `[0, 0, 1.25, 2.7, 2.7]`, com eventos que somariam 1,25, gravam 2,7. O GET começa em `/v2/actor-runs/`.
- [x] Sem total no topo, `stats.usageTotalUsd` 0,42 vale. A segunda chamada segue para a conta seguinte (índice 0, depois 1).
- [x] O teste antigo de custo por evento, com a primeira leitura já estável, continua em 0,004.

## Passos do Nan

Nenhuma migração neste ticket. O código entra no mesmo deploy do ticket 04: `signal-cascade` e `signal-runner`, sem `--no-verify-jwt`. Não cadastrar nem rotacionar segredo.

## Comments

- O índice da leitura no falso é o mesmo da implementação anterior: a segunda GET ainda usa o primeiro valor da lista. O teste novo começa em zero para não parar cedo.

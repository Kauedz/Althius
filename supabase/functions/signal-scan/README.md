# signal-scan

Roda um actor do registro (`private.signal_actors`) pela conta do Apify da Althius, com teto de custo, e devolve os itens brutos. Transformar os itens em Sinais é do Monitoramento (`sinais-reais` 02).

- **Quem chama:** só o servidor, com `Authorization: Bearer <chave de serviço>` (a do ambiente da função, ou a `service_role` legada do painel e do CLI: a função sai com `verify_jwt = true`, o gateway confere a assinatura, e `autorizacao.ts` aceita o JWT com o papel `service_role`). O navegador não chama.
- **Segredos:** `APIFY_TOKEN` (já existe) e, opcionalmente, `APIFY_TOKEN_2` a `APIFY_TOKEN_5`: uma conta do Apify cada. Quando os créditos de uma acabam (o Apify recusa com 402 ou 403, não conferido), a próxima assume. A conta esgotada é pulada até a função reiniciar.
- **Corpo:** `{ workspaceId, actorId, input, maxItems?, maxTotalChargeUsd?, allowTesting? }`.
- **Resposta:** `{ runId, actorVersion, items }`.
- **Recusas:** `404 actor_not_registered`, `403 actor_out`, `403 actor_testing` (sem `allowTesting: true`), `504 timeout`, `502 apify_http_<status>`.
- **Teto:** o menor entre `max_cost_usd` do registro e o `maxTotalChargeUsd` pedido.
- **Custo:** gravado em `private.action_costs` por `record_signal_scan_cost` (só medida; falha ao gravar não derruba a resposta).

## Não conferido

Os parâmetros da chamada (`timeout`, `limit`, `maxItems`, `maxTotalChargeUsd`) e o campo `usageTotalUsd` de `GET /v2/actor-runs/{id}` seguem o que `contact-photo-lookup` já usa. Não foram conferidos contra a documentação do Apify (bloqueada no ambiente de desenvolvimento). Se o campo vier diferente, o custo fica em branco no relatório.

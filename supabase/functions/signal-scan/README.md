# signal-scan

Roda um actor do registro (`private.signal_actors`) pela conta do Apify da Althius, com teto de custo, e devolve os itens brutos. Transformar os itens em Sinais é do Monitoramento (`sinais-reais` 02).

- **Quem chama:** só o servidor, com `Authorization: Bearer <chave de serviço>` (a do ambiente da função, ou a `service_role` legada do painel e do CLI: a função sai com `verify_jwt = true`, o gateway confere a assinatura, e `autorizacao.ts` aceita o JWT com o papel `service_role`). O navegador não chama.
- **Segredos:** `APIFY_TOKEN_1` a `APIFY_TOKEN_5` e, se existir, o legado `APIFY_TOKEN` (índice 0). Segredo vazio é pulado. Em 402, limite de uso ou 429, a conta entra em espera (30 min ou 2 min) e a chamada segue na seguinte. O log guarda o índice, nunca o valor. A foto de Contato (`contact-photo-lookup`) não usa este rodízio: continua no legado `APIFY_TOKEN`.
- **Corpo:** `{ workspaceId, actorId, input, maxItems?, maxTotalChargeUsd?, allowTesting? }`.
- **Resposta:** `{ runId, actorVersion, items }`.
- **Recusas:** `404 actor_not_registered`, `403 actor_out`, `403 actor_testing` (sem `allowTesting: true`), `504 timeout`, `502 apify_http_<status>`.
- **Teto:** o menor entre `max_cost_usd` do registro e o `maxTotalChargeUsd` pedido.
- **Custo:** gravado em `private.action_costs` por `record_signal_scan_cost` (só medida; falha ao gravar não derruba a resposta).

## Não conferido

Os parâmetros da chamada (`timeout`, `limit`, `maxItems`, `maxTotalChargeUsd`) seguem o que `contact-photo-lookup` já usa; a documentação do Apify segue bloqueada no ambiente de desenvolvimento. Na execução real de 30/09/2026 (vagas do LinkedIn), a chamada funcionou, mas o endpoint síncrono não devolveu o cabeçalho `x-apify-run-id`: o id agora vem da última execução do actor na mesma conta (`GET /v2/acts/{actor}/runs/last`, aceita só se começou até 10 s antes da chamada) e o custo é lido em `usageTotalUsd` dessa execução. Se duas execuções do mesmo actor começarem na mesma conta ao mesmo tempo, o custo de uma pode ir para a outra: é só medida.

# 04: Propostas de resposta pelo Hermes

**What to build:** `reply-proposal-runner` com provedor `hermes`: enfileira na fila de IA (`purpose = 'resposta'`), o
`_hermes-worker` responde com a instrução de rascunho e a função grava a Proposta. Sem chave de API.

**Blocked by:** nenhum.

**Status:** ready-for-human

## Critérios

- [x] `_shared/modelo-hermes.ts` (Modelo pela fila, prazo de 120 s, falha passageira): Deno.
- [x] `modeloParaTrabalho` no handler; `REPLY_PROPOSAL_PROVIDER=hermes` ou `AGENT_PROVIDER=hermes` no index: Deno.
- [x] Migração `20261103110000_propostas_de_resposta_pelo_hermes.sql` (purpose, enfileirar pela Proposta reservada, claim devolve purpose): pgTAP escrito.
- [x] O worker usa a instrução de rascunho para `purpose = 'resposta'`: Deno; README atualizado.
- [ ] Ligado em produção (passos do Nan abaixo).

## Passos do Nan

1. Aplicar `20261103110000` (depois da `20261103100000`) e fazer o deploy do `reply-proposal-runner`.
2. Atualizar o worker para esta branch e reiniciar: `npx -y deno@2 run --node-modules-dir=none --allow-net --allow-env --allow-read --env-file=supabase/functions/_hermes-worker/.env supabase/functions/_hermes-worker/main.ts`, sem `HERMES_SINAIS_IA=off`.
3. Definir o segredo `REPLY_PROPOSAL_PROVIDER=hermes` (decisão do Renan; nada foi alterado em produção).
4. Validar: responder um e-mail de Sequência; o log do worker mostra `hermes_worker_sinais` com `outcome: respondido`, e o Hermes recebe o run `althius-resposta-ia-<id>`; a Proposta aparece em Aprovações com o modelo `hermes`.

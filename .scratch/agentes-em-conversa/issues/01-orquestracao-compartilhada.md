# 01: Orquestração compartilhada entre a ponte e o Hermes

**What to build:** a lógica de quem fala, em que ordem e por quantas rodadas sai do `runner.ts` e do `worker.ts` e vai para um módulo só (`supabase/functions/_shared/orquestracao.ts`), usado pela ponte `agent-conversation` e pelo worker do Hermes.

**Blocked by:** None (can start immediately).

**Status:** closed

## Pode mexer

- `supabase/functions/_shared/orquestracao.ts` (novo) e os testes dele.
- `supabase/functions/agent-conversation/runner.ts` e `supabase/functions/_hermes-worker/worker.ts`, só para usar o módulo novo, sem mudar o comportamento.

## Não mexa

- No contrato com o banco (`start_agent_run`, `claim_agent_run`, `append_agent_run_event`, `finish_agent_run`).
- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [x] Os testes atuais da ponte e do worker continuam passando sem alteração.
- [x] O módulo recebe o modelo por injeção e não sabe qual motor está rodando.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Publicar a ponte: `npx supabase functions deploy agent-conversation --project-ref ycbdilsmydvzezhlymty`.
2. Reiniciar o worker do Hermes no computador (ou na VPS) com o comando do README do worker.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

## Comments

- Feito na PR https://github.com/Kauedz/Althius/pull/92

- 2026-10-07 (reconciliação contra a `main` 59e53a6):
  - Os testes da ponte e do worker passam sem alteração: `runner.test.ts` não muda desde 07ed97e e `worker.test.ts` desde a973fdd, os dois anteriores ao PR #92; verdes 10 e 8, entre eles "a Coordenação chama o Agente escolhido, que consulta as Contas-alvo, e junta a resposta" e "a Coordenação: o Hermes recebe o contexto e a resposta volta com as etapas dos Agentes".
  - O modelo entra por injeção: `supabase/functions/_shared/orquestracao.ts` não tem `import` (`:1-5`), interface `Executor` em `:275-279`; quem fala e em que ordem em `:141-145,291-364`; a ponte injeta em `agent-conversation/runner.ts:354-362` e o worker em `_hermes-worker/worker.ts:310-360`. Teste "na Coordenação, os mencionados sempre trabalham; a escolha entra até o limite, sem repetir".
  - Testes rodados: `deno test --allow-all supabase/functions/_shared/orquestracao.test.ts supabase/functions/_shared/orquestracao-rodadas.test.ts supabase/functions/_shared/orquestracao-playbook.test.ts supabase/functions/agent-conversation/ supabase/functions/_hermes-worker/` → 99 passed, 0 failed. O CI roda as pastas com `_` (log do CI 37707955273).
  - Fora dos critérios: a ponte e o worker ainda têm prompts e laço de ferramenta duplicados (`runner.ts:84-112,203-351`, `worker.ts:135-204,338-348`).

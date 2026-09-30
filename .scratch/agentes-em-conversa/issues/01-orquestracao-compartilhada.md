# 01: Orquestração compartilhada entre a ponte e o Hermes

**What to build:** a lógica de quem fala, em que ordem e por quantas rodadas sai do `runner.ts` e do `worker.ts` e vai para um módulo só (`supabase/functions/_shared/orquestracao.ts`), usado pela ponte `agent-conversation` e pelo worker do Hermes.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

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

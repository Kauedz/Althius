# 03: Contexto do Playbook nos Agentes

**What to build:** cada Agente recebe, na chamada, a seção Empresa e as seções do Playbook da Especialidade dele, via `playbook_for_specialty`; sem Playbook, o Agente diz o que falta e pergunta.

**Blocked by:** 02: Cada Agente com a própria vez; `playbook-do-workspace` 01.

**Status:** closed

## Pode mexer

- `_shared/orquestracao.ts` e as fontes de dados do worker e da ponte (`claim` + leitura do Playbook).

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [x] O Scopus responde sobre o ICP com o que está no Playbook, citando a seção.
- [x] Sem seção Empresa, o Agente pergunta o que a empresa vende antes de propor ICP.
- [x] O contexto não inclui dado pessoal de Contatos.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Publicar a ponte e reiniciar o worker, como no ticket 01.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

## Comments

- Feito na PR https://github.com/Kauedz/Althius/pull/94

- 2026-10-07 (reconciliação contra a `main` 59e53a6):
  - O Scopus usa o Playbook e cita a seção: `supabase/functions/_shared/orquestracao.ts:393-447`; ligação na ponte (`agent-conversation/index.ts:127-128`) e no worker (`_hermes-worker/main.ts:47-48`); função `agent_run_playbook` (`20260930104500_playbook_na_execucao_dos_agentes.sql:6-25`). Testes "o contexto traz as seções escritas, com o nome, e manda citar a seção", "a ponte: o Agente recebe o Playbook da Especialidade dele, e sem Empresa é mandado perguntar" e "por Agente: o Hermes recebe o Playbook da Especialidade de cada Agente nas instruções dele"; pgTAP "o Scopus recebe a Empresa e o ICP do Workspace da Execução".
  - Sem Empresa, pergunta o que a empresa vende: `orquestracao.ts:407-413`; testes "sem a seção Empresa, o Agente é mandado perguntar o que a empresa vende antes de propor ICP" e "uma seção vazia não conta como escrita…".
  - Sem dado pessoal de Contatos: teste "o contexto nunca traz dado de Contatos: só o que o Playbook tem"; pgTAP "e o Sul nunca lê o Playbook do Norte".
  - Testes rodados: `deno test --allow-all supabase/functions/_shared/orquestracao-playbook.test.ts` → 9 passed (dentro dos 99 da rodada); pgTAP `playbook_na_execucao_dos_agentes.sql` (11) ok no CI 37707955273. A resposta real do modelo só se vê depois do deploy (Passos do Nan).
  - Ressalva: no modo `HERMES_UMA_CHAMADA=true`, `corpoDoRun` (`_hermes-worker/worker.ts:74-109`) não leva o Playbook; entra no ticket sugerido no agentes-em-conversa 02 para remover esse modo.

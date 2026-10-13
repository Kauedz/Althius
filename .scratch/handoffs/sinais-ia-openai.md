# Handoff: passos de IA dos Sinais pela OpenAI (sem Anthropic)

Branch `claude/laughing-einstein-2y1gvz` (reiniciada da `main` 92e8c7c depois do merge do PR #189). Evidências em `.scratch/sinais-ia-openai/evidencias/`.

## O que mudou

- `_shared/cascata-de-sinais/llm-seletor.ts`: `SIGNALS_LLM_PROVIDER` = `hermes` | `openai` | `regra`. Padrão `regra` (devolve `undefined`: os passos usam a palavra-chave). Valor desconhecido ou `openai` sem `OPENAI_API_KEY`/`OPENAI_MODEL` cai em `regra`, avisando no log só o nome do que falta. `anthropic` não é opção.
- `llm-openai.ts` (plano B): chat da OpenAI em modo JSON, custo = tokens × `SIGNALS_LLM_PRICE_*`, prazo `SIGNALS_LLM_TIMEOUT_MS`.
- `llm-hermes.ts` + migração `20261014120000_fila_de_ia_dos_sinais.sql`: o passo enfileira o pedido em `private.signal_llm_requests`; o worker do Hermes (`_hermes-worker/sinais-ia.ts`) o reserva, responde pelo Hermes e grava; a função lê até o prazo.
- O motor põe o `workspaceId` do pedido em cada chamada ao modelo (o passo não precisa saber).
- Removidos: `llm-anthropic.ts` e seu teste; `ANTHROPIC_API_KEY` não é mais lida por `signal-runner` nem `signal-cascade`.
- `MARCA_INTERNA` (`_shared/marca.ts`) agora também barra openai, anthropic, claude, gpt-n e codex em texto lido pelo usuário/Hermes; `guarda-de-marca.test.ts` cobre o modelo falhando de quatro jeitos (OpenAI 401, rede, Hermes falho, sem worker).

## Custo

O custo do modelo já entrava por passo: o passo chama `ctx.custo.adicionar`, o motor grava em `signal_cascade_run_steps.cost_usd` (passos de regra) e soma ao custo real que a liquidação de créditos usa. Agora há teste para a falha do modelo (custo 0, passo na regra).

## Fora do escopo (registrado)

`agent-conversation` e `reply-proposal-runner` usam `anthropic` como padrão quando `AGENT_PROVIDER` / `REPLY_PROPOSAL_PROVIDER` não estão definidos (`agent-conversation/index.ts:32`, `reply-proposal-runner/index.ts:33`, que ainda lê `ANTHROPIC_API_KEY`). Já existe ticket de adaptador para as Propostas. Não mexi neles.

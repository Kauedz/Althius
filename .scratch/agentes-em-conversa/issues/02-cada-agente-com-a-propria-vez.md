# 02: Cada Agente com a própria vez, em rodadas

**What to build:** a Coordenação escolhe os Agentes e cada um vira uma chamada separada ao modelo, lendo tudo o que já foi dito na Conversa; até 3 rodadas por pedido, parando antes quando um Agente precisa de informação do usuário ou de Aprovação. O texto de cada etapa é o trabalho do Agente, nunca "fui acionado".

**Blocked by:** 01: Orquestração compartilhada.

**Status:** ready-for-agent (falta o consumo de tokens no worker do Hermes e no adaptador Groq)

## Pode mexer

- `_shared/orquestracao.ts` e os testes.
- Os eventos já existentes (`chamada`, `feito`, `resposta`, `falha`); se precisar de um tipo novo de evento, uma migration aditiva que só acrescenta o valor ao `check`.

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [x] No máximo 3 rodadas; cada Agente vê as falas anteriores da rodada e das rodadas anteriores.
- [x] Um Agente que precisa de informação encerra a rodada com a pergunta ao usuário.
- [x] Teste que recusa etapa sem conteúdo ("fui acionado", "conversaram sobre") como falha `model_empty`.
- [x] O consumo de cada chamada (tokens) fica no evento, para os créditos.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Publicar a ponte e reiniciar o worker, como no ticket 01.
2. Testar no app: "Scopus e Ethos, montem o ICP e as Personas da minha empresa" e conferir as falas.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

## Comments

- Feito na PR https://github.com/Kauedz/Althius/pull/93
- Etapa 5b (2026-10-01): com as ferramentas, o próximo Agente vê também o que o anterior FEZ (um mural com cada passo de ferramenta entra no contexto dele), na ponte e no worker do Hermes. Detalhes e Passos do Nan no CRM-14; o código do worker mudou, então reiniciar o worker do Hermes depois de atualizar.

- 2026-10-07 (reconciliação contra a `main` 59e53a6):
  - Até 3 rodadas, cada Agente vê as falas anteriores: `supabase/functions/_shared/orquestracao.ts:203,291-318`, `agent-conversation/runner.ts:193-197,358-359`, `_hermes-worker/worker.ts:324-330`; testes "cada Agente fala na sua vez e vê o que os anteriores disseram" e "no máximo 3 rodadas, mesmo que o Agente peça para continuar sempre".
  - Pergunta ao usuário encerra a rodada: `orquestracao.ts:231-237,312,353-358`; testes "um Agente que precisa de informação encerra a Conversa com a pergunta ao usuário" e "por Agente: uma pergunta ao usuário encerra a Conversa sem síntese".
  - Etapa sem conteúdo dá `model_empty`: `orquestracao.ts:249-258,308`; testes "etapa sem conteúdo (\"fui acionado\") é falha model_empty, não resposta" e "a ponte: \"fui acionado\" no lugar do trabalho fecha como falha model_empty".
  - Parcial: o consumo de cada chamada fica no evento no módulo (`orquestracao.ts:152-163`) e na ponte com a Messages API (`runner.ts:128-132,212,217`; teste "o consumo de cada chamada fica no evento, e o da Coordenação na resposta"), mas não no worker do Hermes (`worker.ts:294-306` devolve só texto; `trabalhar` devolve `{ texto }` em `:335,341`) nem no adaptador Groq (`agent-conversation/model-groq.ts:142-147` descarta o `usage`). Com esses motores, `record_agent_run_cost` soma zero tokens.
  - Testes rodados: `deno test --allow-all supabase/functions/_shared/orquestracao*.test.ts supabase/functions/agent-conversation/ supabase/functions/_hermes-worker/` → 99 passed, 0 failed.
  - Falta (agente): (1) o worker do Hermes passar o uso de cada `passo` a `escolher`, `trabalhar` e `sintetizar`, se `GET /v1/runs/{id}` devolver o uso; se não devolver, registrar a lacuna como decisão de créditos; (2) `agent-conversation/model-groq.ts` mapear `prompt_tokens` e `completion_tokens` para `usage.input_tokens` e `usage.output_tokens`; (3) um teste novo de cada.
  - Ticket novo sugerido, porque mexe em teste existente (`worker.test.ts`): remover o modo `HERMES_UMA_CHAMADA=true` (`worker.ts:246-291`), que grava `chamada` e `feito` sem `textoDeEtapaValido`, sem Playbook, sem tokens e sem créditos. Junto, a síntese que diz "Nenhuma Integração externa está conectada" mesmo com ferramentas ligadas (`runner.ts:341`, `worker.ts:139-142,195,199-204`).

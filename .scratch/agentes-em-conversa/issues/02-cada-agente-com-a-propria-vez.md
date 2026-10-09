# 02: Cada Agente com a própria vez, em rodadas

**What to build:** a Coordenação escolhe os Agentes e cada um vira uma chamada separada ao modelo, lendo tudo o que já foi dito na Conversa; até 3 rodadas por pedido, parando antes quando um Agente precisa de informação do usuário ou de Aprovação. O texto de cada etapa é o trabalho do Agente, nunca "fui acionado".

**Blocked by:** 01: Orquestração compartilhada.

**Status:** ready-for-human (o código está pronto, unificado na `ralph/unificado-2026-10-09`; faltam os Passos do Nan: publicar as funções, reiniciar o worker e conferir no app. A decisão dos tokens de cache do Hermes foi tomada em 2026-10-09, nos Comments)

## Pode mexer

- `_shared/orquestracao.ts` e os testes.
- `_hermes-worker/worker.ts` e `agent-conversation/model-groq.ts`, só para o consumo de tokens (pedido de 2026-10-08).
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

1. Publicar a ponte e reiniciar o worker, como no ticket 01, depois que esta branch entrar na `main` (o adaptador do
   Groq e o worker do Hermes mudaram em 2026-10-08). Na pasta do repositório, na branch `main`:
   ```powershell
   git pull
   npx supabase functions deploy agent-conversation --project-ref ycbdilsmydvzezhlymty
   npx supabase functions deploy reply-proposal-runner --project-ref ycbdilsmydvzezhlymty
   ```
   O `reply-proposal-runner` usa o mesmo adaptador do Groq: publicado, o custo das Propostas de resposta com o Groq
   também passa a ter tokens.
   No PowerShell do worker, `Ctrl+C` e, na raiz do repositório:
   ```powershell
   npx -y deno@2 run --node-modules-dir=none --allow-net --allow-env --allow-read --env-file=supabase/functions/_hermes-worker/.env supabase/functions/_hermes-worker/main.ts
   ```
2. Testar no app: "Scopus e Ethos, montem o ICP e as Personas da minha empresa" e conferir as falas.
3. Conferir o consumo: no Supabase, SQL Editor, rode a consulta abaixo (só lê). A Execução do passo 2 aparece com
   `input_units` e `output_units` preenchidos; antes desta mudança, com o Hermes ou o Groq, vinham vazios.
   ```sql
   select occurred_at, provider, model_or_actor, input_units, output_units
   from private.action_costs
   where action_type = 'agent_run'
   order by occurred_at desc
   limit 5;
   ```
   Se vierem vazios com o Hermes, o Hermes instalado ainda não devolve o `usage` no `GET /v1/runs/{id}`. Atualize-o
   (comando da documentação oficial, https://hermes-agent.nousresearch.com/docs/getting-started/updating):
   ```powershell
   hermes update
   ```
   Depois feche o PowerShell do `hermes gateway`, abra outro com `hermes gateway` e repita os passos 2 e 3.
4. Conferir o Groq (opcional, se o app estiver no Hermes): troque o motor, repita os passos 2 e 3 (a linha nova vem com
   `provider` = `groq`) e volte ao Hermes:
   ```powershell
   npx supabase secrets set AGENT_PROVIDER=groq --project-ref ycbdilsmydvzezhlymty
   npx supabase secrets set AGENT_PROVIDER=hermes --project-ref ycbdilsmydvzezhlymty
   ```

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

- 2026-10-08 (branch `ralph/agentes-02-tokens`): o consumo de tokens agora fica no evento com o Hermes e com o Groq.
  - Hermes: a documentação da API de runs (https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server) mostra `usage` (`input_tokens`, `output_tokens`, `total_tokens`, `cache_read_tokens`, `cache_write_tokens`) no `GET /v1/runs/{id}` de um run concluído. O cliente HTTP lê `input_tokens` e `output_tokens` (`_hermes-worker/worker.ts:479-483`); cada `passo` devolve texto e uso no formato do `Executor` (`:298-310`); `escolher`, `trabalhar` e `sintetizar` o passam ao módulo (`:319-361`), e no laço de ferramentas o uso do Agente na rodada soma todas as chamadas (`:340-346`). Sem `usage` (Hermes mais antigo), o evento fica sem `uso`, como antes.
  - Groq: `agent-conversation/model-groq.ts:149-153` traduz `prompt_tokens` e `completion_tokens` para `usage.input_tokens` e `usage.output_tokens`, que o executor já lê (`usoDe`). O `reply-proposal-runner` usa o mesmo adaptador e a mesma `usoDe` (`reply-proposal-runner/handler.ts:210`): publicado, o custo das Propostas de resposta com o Groq também passa a ter tokens (por isso o deploy dele nos Passos do Nan).
  - Testes novos: "o consumo de cada chamada ao Hermes fica no evento, o do Agente e o da Coordenação" (`_hermes-worker/worker-consumo.test.ts`, pelo cliente HTTP com o corpo da documentação, com escolha, um pedido de ferramenta e a síntese) e "o consumo que o Groq informa chega ao executor, para os créditos" (`agent-conversation/model-groq-consumo.test.ts`). Os dois falharam antes da mudança; nenhum teste existente mudou.
  - Decisão a confirmar (créditos): conto só `input_tokens` e `output_tokens`, como a ponte faz com a Messages API; `cache_read_tokens` e `cache_write_tokens` do Hermes ficam de fora.
  - Fica como estava: o modo `HERMES_UMA_CHAMADA=true` continua sem tokens, porque a sugestão acima é removê-lo num ticket novo (o ticket ainda não existe em `.scratch/`).
  - Revisão (padrões e spec): `passo` passou a devolver `{ texto, uso }` como o `Executor`; os Passos do Nan ganharam o deploy do `reply-proposal-runner`, o `hermes update` num bloco pronto e a conferência do Groq. Ficou de fora, por mexer na ponte (`runner.ts`): juntar num helper a leitura "dois números, senão nada" que a `usoDe` da ponte e o cliente HTTP do Hermes repetem.
  - Rodados: `deno test supabase/functions` 749 passed, 0 failed; `deno check` das Edge Functions, do `main.ts` do worker e dos testes; `deno lint` nas duas pastas; `npm run lint` (0 erros) e `tsc -b` no frontend; `npx vitest run --maxWorkers=2` 113 arquivos e 1113 testes passed, 0 failed.

- 2026-10-09 (decisão do Renan, PR unificado `ralph/unificado-2026-10-09`): os tokens de cache do Hermes (`cache_read_tokens` e `cache_write_tokens`) ficam fora da contagem. Conta-se só `input_tokens` e `output_tokens`, como o código já faz; nada muda no código.

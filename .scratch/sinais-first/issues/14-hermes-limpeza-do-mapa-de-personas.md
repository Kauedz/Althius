# 14: Hermes — limpeza do mapa de personas

**Status:** needs-hermes

**Hermes:** sim — `supabase/functions/_shared/orquestracao.ts` perde as quatro entradas de descrição de Especialidade (`scopus:`, `ethos:`, `rhetor:`, `oraculum:`), consumidas por `agent-conversation` e pelo worker do Hermes (`_hermes-worker`); a mudança só tem efeito depois de publicar `agent-conversation` de novo e reiniciar o worker.

**GATE:** Segue a [ADR-0033](../../../docs/adr/0033-sinais-first.md) (Aceita) e a [spec](../spec.md). Nenhuma migration nesta ticket. Sem aplicar no remoto, sem deploy, sem segredo — a publicação da Edge Function e o reinício do worker ficam para os Passos do Nan, depois do "Sim, aplica e publica" do Kauê.

**Blocked by:** 10 (Esconder os quatro Agentes da interface)

**Decisões:** D9 (limpeza do mapa de personas do motor como parte da retirada) e D1 (as quatro Especialidades saem do produto) da ADR-0033. Não muda nada do [ADR-0018](../../../docs/adr/0018-motor-dos-agentes-na-edge-function.md): o contrato do motor com o banco continua o mesmo.

## O que construir

- `supabase/functions/_shared/orquestracao.ts` remove as quatro entradas de persona (`scopus`, `ethos`, `rhetor`, `oraculum`) do mapa que hoje descreve cada Especialidade para o motor de IA usado em `agent-conversation` e no worker do Hermes. Como a interface já não oferece mais criar/usar esses Agentes (ticket 10), esse mapa fica sem consumidor de produto; removê-lo evita que o motor continue "sabendo" descrever Especialidades que não existem mais para o Cliente.
- Se `agent-conversation`/o worker do Hermes tiverem algum outro consumidor dessas quatro entradas (ex.: a tela só-leitura do ticket 10, que ainda lê Conversas antigas), a leitura histórica das Conversas já registradas continua funcionando: este ticket remove a persona usada para **gerar** resposta nova dessas Especialidades, não o texto já salvo nas Conversas antigas, que é só dado, lido como está.
- Teste automatizado (Deno) cobrindo que `agent-conversation` segue funcionando para qualquer Agente que não seja um dos 4 (ex.: se existir algum fluxo interno que ainda crie um Agente de outro tipo), e que uma tentativa de usar a persona de uma das 4 Especialidades removidas não derruba a função, só deixa de ter uma persona nomeada (comportamento de fallback a definir no próprio ticket, isolado e fácil de trocar).

## Pode mexer

- `supabase/functions/_shared/orquestracao.ts` e seus testes (`orquestracao.test.ts`).
- `supabase/functions/agent-conversation/` e `supabase/functions/_hermes-worker/`, só na parte que consome o mapa de personas, com os testes correspondentes.

## Não mexa

- As linhas de `private.agents`, `agent_conversations`, `agent_memory_facts` dos 4 Agentes: continuam existindo, só leitura (ticket 10).
- O contrato de `SIGNALS_LLM_PROVIDER`/`AGENT_PROVIDER` e o resto do motor (ADR-0018): sem mudança.
- `private.specialty_catalog`, `private.protect_default_agent`, `private.seed_default_agents`: não mudam aqui.
- Arquivos do Kauê listados na spec.
- `projeto-althius-frontend/src/paginas/conexoes.tsx`, conectores e canais: área do Renan.

## Critérios

- [ ] O mapa de personas de `orquestracao.ts` não tem mais as quatro entradas de Especialidade.
- [ ] `agent-conversation` e o worker do Hermes continuam funcionando para qualquer outro uso do motor, sem erro novo.
- [ ] Conversas já registradas dos 4 Agentes continuam legíveis na tela só-leitura do ticket 10 (o texto salvo não depende do mapa de personas para ser lido).
- [ ] Deno test cobrindo `orquestracao.ts` sem as quatro entradas e o comportamento de fallback; `deno check` limpo.
- [ ] CI verde nos três jobs.

## Passos do Nan

Depois do "Sim, aplica e publica" do Kauê e do CI verde: o Grok Bot publica `agent-conversation` e reinicia o worker do Hermes, conferindo que uma Conversa de teste com um Agente comum (não uma das 4 Especialidades retiradas) continua respondendo normalmente.

## Comments

- 26/10/2026: na escrita deste ticket, os PRs #280 a #286 (frente canais-althius) estão abertos e mexem em `supabase/functions/_shared/orquestracao.ts`, `_hermes-worker/worker.ts` e `agent-conversation/runner.ts`, sem tocar no mapa de personas. Começar este ticket depois que eles entrarem na `main` (ou rebasear sobre eles) para não gerar conflito no mesmo arquivo.

Status: ready-for-human
GATE: ready-for-agent
Blocked by: nenhum

# Sequência pela IA de qualquer Conta

## Problema

As ferramentas de Sequência ainda se apresentam como exclusivas do Rhetor e a tela só permite pedir uma Sequência para Conta Quente. Isso impede gerar uma abordagem para qualquer Conta-alvo enriquecida, mesmo quando a permissão de Propor existe no passo de Sequência.

## Solução

Oferecer as ferramentas pela permissão de Propor no passo de Sequência (com fallback para as Especialidades que podem executar ferramentas, se a permissão não estiver disponível no runtime), descrevendo o uso de Sinal quando houver e, caso contrário, Conta enriquecida, ICP, Comitê e Playbook. Renomear a experiência da tela para “Gerar Sequência” em qualquer Conta-alvo em modo real. A Sequência continua nascendo somente após Aprovação e só envia depois de “Ativar envios”.

## Pode mexer

- `supabase/functions/_shared/ferramentas-dos-agentes.ts` e os testes existentes junto a ele.
- `projeto-althius-frontend/src/paginas/pedir-sequencia-ao-rhetor.tsx`, seu novo nome/export `gerar-sequencia.tsx` e imports/testes relacionados.
- `projeto-althius-frontend/e2e/tests/09-pedir-sequencia.spec.ts`.
- Migration e pgTAP somente se a inspeção provar que uma RPC ainda exige Quente/Sinal/Especialidade.

## Não mexa

- `projeto-althius-frontend/src/paginas/conexoes.tsx`, conectores/canais, Hermes e arquivos de Kauê sem aprovação explícita.
- Fluxo de Aprovação, “Ativar envios”, `sequence-runner`, `detalhe-sequencia*`, `supabase-sequencias*` e `motivos-do-envio.ts`.

## Critérios de aceite

- [x] Ferramentas de Sequência são oferecidas a agente não-Rhetor com permissão de Propor (fallback para as quatro Especialidades capazes de ferramentas; a guarda DB permanece final).
- [x] Descrições não exigem Sinal e orientam usar Conta enriquecida, ICP, Comitê e Playbook quando não houver Sinal.
- [x] Justificativa explica por que a Sequência é adequada à Conta; aprovação obrigatória permanece intacta.
- [x] `GerarSequência`/arquivo `gerar-sequencia.tsx` e label “Gerar Sequência” aparecem para qualquer Conta-alvo real permitida, não em Demonstração.
- [x] Texto de solicitação diferencia Conta Quente (Sinal + Cadência) de Conta não Quente (Conta enriquecida, ICP, Comitê e Cadência do Playbook).
- [x] Navegação continua em `/conversa` via `conversas.coordenar`.
- [x] E2E verifica labels/visibilidade sem criar Sequência.
- [x] Testes Vitest cobrem Conta não Quente real, Demonstração e os dois textos.
- [x] Testes Deno cobrem agente não-Rhetor e descrições sem requisito de Sinal.
- [ ] CI e os três `db reset` ficam para confirmação da CI.

## Comments

2026-10-28 — Implementado o fluxo para qualquer Conta-alvo. As RPCs da migration `20261217200000_sequencia_sem_exigir_o_rhetor.sql` já usam `agent_can_propose_sequence` e não exigem Quente/Sinal, portanto não foi criada migration nova. Como o runtime ainda não recebe `agent_step_permissions`, as três ferramentas ficam disponíveis para `scopus`, `ethos`, `rhetor` e `oraculum`; a guarda do banco recusa quem não tiver Propor/Executar. Renomeados componente/teste para `gerar-sequencia`, atualizado o texto Quente/não Quente, label e smoke E2E sem escrita. Testes direcionados Vitest (7) e Deno (11) passaram; typecheck e lint passaram com warnings existentes. A suíte Vitest completa ficou em execução sem conclusão neste ambiente e o `deno check` foi bloqueado pelo DNS ao tentar baixar `@anthropic-ai/sdk`. Imports de `_shared/ferramentas-dos-agentes.ts`: `supabase/functions/_shared/busca-de-sinais.ts`, `supabase/functions/agent-conversation/index.ts`, `supabase/functions/agent-conversation/runner.ts`, `supabase/functions/_hermes-worker/main.ts` e `supabase/functions/_hermes-worker/worker.ts`; publicar `agent-conversation` requer OK explícito do Kauê. Ainda falta CI confirmar suítes completas e os três `db reset`; não há migration para aplicar. Publicar `agent-conversation` requer autorização do Kauê.


2026-10-28 13h15 BRT (revisão do supervisor) — Corrigida a frase quebrada da descrição de `propor_sequencia` ("Use quando pedirem uma Sequência ou uma Cadência para uma Conta-alvo, com ou sem Sinal"), troquei "fit" por "encaixe com o ICP e o Comitê" e atualizei os quatro testes Deno que ainda exigiam "só o Rhetor" (`_hermes-worker/worker-sequencia.test.ts`, `_shared/ferramentas-dos-agentes-template.test.ts`, `_shared/ferramentas-dos-agentes-template-proprio.test.ts`, `agent-conversation/runner-sequencia.test.ts`). `deno test supabase/functions`: 1886 ok, 0 falhas; `deno check` de todas as index.ts ok. Publicação: `agent-conversation` (precisa de OK explícito do Kauê) e o worker do Hermes na VPS (`_hermes-worker`), que também importa `_shared/ferramentas-dos-agentes.ts`. Sem migration. A Permissão de Propor em Sequência hoje só existe para agentes Rhetor (migration 20261217200000): os outros recebem a ferramenta, mas o banco recusa até a Permissão ser concedida.

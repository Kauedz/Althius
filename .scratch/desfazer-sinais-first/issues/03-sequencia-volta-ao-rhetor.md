# 03: Sequência volta a ser do Rhetor

**Status:** needs-hermes

**Hermes:** sim (muda `_shared/ferramentas-dos-agentes.ts`, lido pelo worker do Hermes e por `agent-conversation`)

**Kauê:** precisa de aprovação do Kauê: as 4 RPCs redefinidas aqui são consumidas pelo `sequence-runner` e pelo fluxo da cadência.

**Blocked by:** 02 (Gerar Sequência abre a Conversa do Rhetor, que precisa estar gravável)

**Decisões:** ADR-0034, decisão 5.

## O que construir

- **Migration nova** que redefine `agent_read_sequence_contacts`, `agent_propose_sequence`, `agent_suggest_althius_sequence_template` e `agent_suggest_own_sequence_template` a partir da definição atual (`20261217200000_sequencia_sem_exigir_o_rhetor.sql` ou posterior), trocando a checagem `private.agent_can_propose_sequence()` por `specialty = 'rhetor'` como nas versões de `20261105100000`, `20261107120000` e `20261108120000`. Mantém o que veio depois (Sequência em Conta sem Sinal, do #317). Não remove `private.agent_step_permissions` nem o gatilho `agents_grant_rhetor_sequence_step`.
- `_shared/ferramentas-dos-agentes.ts`: `propor_sequencia`, `sugerir_template_de_sequencia` e `sugerir_template_proprio` voltam a `especialidades: ['rhetor']`. Ficam as descrições "sem Sinal" do #317.
- `gerar-sequencia.tsx`: o botão volta a abrir uma Conversa nova com o Rhetor (`novaDoAgente` + `/agentes/:rhetorId/conversa`), como em `git show 6ac91304^1:projeto-althius-frontend/src/paginas/pedir-sequencia-ao-rhetor.tsx`, sem voltar a exigir Conta `quente` (o #317 tirou isso, fica tirado).

## Pode mexer

- Uma migration nova e o pgTAP dela (`supabase/tests/sequencia_volta_ao_rhetor.sql`).
- `supabase/tests/sequencia_sem_exigir_o_rhetor.sql`: só os casos que afirmam que um não-Rhetor propõe Sequência.
- `supabase/functions/_shared/ferramentas-dos-agentes.ts` e os testes `ferramentas-dos-agentes-sequencia.test.ts`, `_hermes-worker/worker-sequencia.test.ts` (o caso "o Ethos também recebe propor_sequencia" se inverte).
- `projeto-althius-frontend/src/paginas/gerar-sequencia.tsx`, `gerar-sequencia.test.tsx`.
- `e2e/tests/09-pedir-sequencia.spec.ts`: só a afirmação de que não existe botão do Rhetor e de que o pedido vai coordenado.

## Não mexa

- `sequence-runner`, `send-chat-step*`, `reply-proposal-*`, `unipile-*`, `detalhe-sequencia*`, `supabase-sequencias*`, `motivos-do-envio.ts` (Kauê).
- `_hermes-worker/cadencia-ponta-a-ponta.test.ts`: tem de passar sem mudança.
- `private.agent_step_permissions` e seus dados.

## Critérios

- [ ] Um Agente que não é Rhetor recebe erro ao propor Sequência; o Rhetor propõe. (pgTAP.)
- [ ] Só o Rhetor recebe as 3 ferramentas de Sequência. (Deno.)
- [ ] Gerar Sequência abre a Conversa do Rhetor com o pedido, em Conta com ou sem Sinal. (Vitest e smoke 09.)
- [ ] `_hermes-worker/cadencia-ponta-a-ponta.test.ts` verde, sem mudança.

## Passos do Nan

1. Depois do merge e da migration aplicada, publicar de novo `agent-conversation` e reiniciar o worker do Hermes. A IA que executar o ticket entrega os comandos prontos para o PowerShell.

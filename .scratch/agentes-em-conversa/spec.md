# Spec: Agentes em conversa

**Status:** ready-for-agent

**Frente:** Agentes. Guia geral: [`docs/visao-geral-da-plataforma.md`](../../docs/visao-geral-da-plataforma.md).
Decisões: sabatina de 29/09/2026, [ADR-0004](../../docs/adr/0004-coordenacao-sem-quinto-agente.md),
[ADR-0018](../../docs/adr/0018-motor-dos-agentes-na-edge-function.md). Motor: [`motor-hermes`](../motor-hermes/spec.md).
Contrato com o banco: CRM-14 (`start_agent_run`, `claim_agent_run`, `append_agent_run_event`, `finish_agent_run`).

## Problem Statement

As Conversas do CRM-14 funcionam de ponta a ponta (ponte `agent-conversation` e worker do Hermes), mas uma única
chamada ao modelo finge o trabalho de todos os Agentes: devolve um JSON com "etapas" e uma resposta. Os Agentes não
leem o que o outro disse, não sabem nada da empresa e respondem de forma genérica. A lógica de quem fala está
duplicada em `agent-conversation/runner.ts` e `_hermes-worker/worker.ts`. E a pessoa só tem uma Conversa por lugar,
sem nome.

## Solution

Os Agentes passam a conversar de verdade: a Coordenação (sem nome) escolhe quem trabalha, e **cada Agente tem a
própria vez**, numa chamada separada ao modelo, lendo tudo o que já foi dito e o Playbook da Especialidade dele. Até
3 rodadas por pedido; para antes quando um Agente precisa de informação do usuário ou de Aprovação. A lógica fica num
módulo compartilhado, igual para qualquer motor. A pessoa cria Conversas com nome, reabre e continua; qualquer Agente
entra por @menção ou pela Coordenação. Quando a Conversa chega a algo que muda o Playbook, o Agente propõe a mudança,
que só vale com Aprovação de Administrador.

## User Stories

1. Como participante, quero ver cada Agente trabalhar na sua vez, para entender quem fez o quê.
2. Como participante, quero que o Ethos leia o que o Scopus disse antes de responder, para as respostas se somarem.
3. Como participante, quero que os Agentes usem o Playbook da minha empresa, para respostas específicas.
4. Como participante, quero que o Agente pergunte quando falta informação, em vez de inventar.
5. Como participante, quero criar Conversas com nome e voltar a elas, para organizar os assuntos.
6. Como participante, quero chamar um Agente por @menção no meio de uma Conversa.
7. Como Administrador, quero aprovar a mudança no Playbook que um Agente propõe.
8. Como participante, quero ver a falha como falha, com o motivo, nunca uma resposta inventada.

## Implementation Decisions

- **Módulo compartilhado** `supabase/functions/_shared/orquestracao.ts`: recebe a Reserva (`claim_agent_run`), uma
  função "chamar o modelo" e o banco (`append`, `finish`); decide a ordem dos Agentes, as rodadas e quando parar. A
  ponte e o worker só injetam o modelo. Nenhuma mudança no contrato do banco nem na tela para isso (ticket 01).
- **Vez de cada Agente:** a Coordenação decide a lista (na dúvida sobre dados do Workspace, o Scopus); cada Agente é
  uma chamada com as instruções da Especialidade, o histórico da Conversa e as etapas anteriores deste pedido. Cada
  etapa grava `chamada` e depois `feito` com o texto real; a resposta final (`resposta`) é da Coordenação, resumindo.
- **Rodadas:** máximo 3 por pedido; o prazo continua o do CRM-14 (10 minutos), e o worker para o Hermes em 8.
- **Proibido fingir:** texto de etapa vazio ou do tipo "fui acionado" é falha (`model_empty`), nunca resposta.
- **Contexto:** `playbook_for_specialty` (spec `playbook-do-workspace`, ticket 01), com a seção Empresa sempre; sem
  Playbook, o Agente diz o que falta.
- **Conversas nomeadas:** um campo de nome na Conversa, lista e renomear por funções novas (migration aditiva), sem
  redefinir `start_agent_run` além de aceitar o nome opcional a partir da definição mais recente da `main`.
- **Proposta de mudança** vira Revisão (CRM-09) e Aprovação (CRM-15); nada muda no Playbook sem o Administrador.
- **Custo:** cada chamada de Agente é uma Execução que gasta crédito (`creditos-e-planos` 04), depois que aquela spec
  existir; até lá, só grava os tokens (`creditos-e-planos` 01).

## Testing Decisions

- Deno: o módulo compartilhado com o modelo falso (ordem, rodadas, parar ao perguntar, falha sem texto inventado); os
  testes atuais da ponte e do worker continuam passando sem mudança.
- pgTAP: nome da Conversa, lista e renomear só por participante ativo do Workspace; outro Workspace nunca lê.
- Frontend: lista de Conversas, criar, renomear e reabrir, com o banco em memória.

## Out of Scope

- Os Agentes executarem ações externas (envios, CRM): é das Conexões e das Permissões.
- A inteligência coletiva entre Workspaces (`motor-hermes` 04–06).
- Transcrições e vendas (fase 2).

## Further Notes

- Tickets em `issues/`. 01 e 04 podem começar já; 02 depende de 01; 03 depende de 02 e do Playbook 01; 05 depende de
  03, CRM-09 e CRM-15.
- O teste de 29/09 com o Hermes mostrou respostas genéricas: é o critério de aceite do ticket 03 fazer o
  Scopus responder o ICP a partir do Playbook.

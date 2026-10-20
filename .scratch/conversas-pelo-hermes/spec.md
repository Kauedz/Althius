# Conversas com os Agentes pelo Hermes, ligadas e honestas

Status: ready-for-agent (tickets 02 e 03); o 01 é do Nan

Origem: [AUDITORIA-TOTAL-2026-10-17.md](../AUDITORIA-TOTAL-2026-10-17.md), vertical B. Fila: [FILA-EXECUCAO-2026-10-17.md](../FILA-EXECUCAO-2026-10-17.md).
Leia antes: [ADR-0018](../../docs/adr/0018-motor-dos-agentes-na-edge-function.md) (Hermes como motor), [motor-hermes](../motor-hermes/spec.md), [agentes-em-conversa](../agentes-em-conversa/spec.md).
Decisão do Renan: toda IA passa pelo Hermes (`AGENT_PROVIDER=hermes`); o worker roda hoje na máquina do Nan.

## Problem Statement

No Workspace operacional, a página de Agentes diz "INDISPONÍVEL: Conversas e Coordenação…" enquanto cada card de Agente
diz "Disponível". O participante não sabe se pode falar com os Agentes. E, mesmo quando as Conversas ligarem, se o
worker do Hermes estiver desligado (ele roda num laptop), o pedido fica guardado até estourar o prazo, sem explicação.

## Solution

- O Nan confere em produção por que a capability das Conversas responde falso e a liga com o Hermes.
- A capability passa a dizer a verdade com o Hermes: as Conversas só aparecem como disponíveis quando o motor deu sinal
  de vida há pouco; senão a tela diz que o motor dos Agentes está fora do ar, sem citar o Hermes (ADR-0004).
- O selo do card do Agente deixa de dizer "Disponível" quando as Conversas estão indisponíveis.
- O worker passa a rodar 24/7 fora do laptop (motor-hermes/02, do Nan).

## User Stories

1. Como participante, quero ver uma única resposta sobre se posso conversar com os Agentes, para não ler "Disponível" e "INDISPONÍVEL" na mesma tela.
2. Como participante, quero mandar um pedido ao Scopus e ver a resposta chegar, porque o motor está ligado.
3. Como participante, quero que, com o motor fora do ar, a tela diga isso antes de eu escrever, em vez de o pedido morrer em 10 minutos.
4. Como participante, quero que o motivo da indisponibilidade não cite fornecedor nem detalhe técnico.
5. Como Administrador, quero que o estado de trabalho do Agente (ocioso, trabalhando, detectou) continue visível, mas sem prometer conversa.
6. Como Nan, quero um comando para conferir a capability em produção, para saber se o problema é segredo, deploy ou worker.
7. Como Renan, quero que o motor dos Agentes rode 24/7 numa VPS, para a Althius não depender do laptop do Nan.

## Implementation Decisions

- O worker do Hermes registra um sinal de vida a cada ciclo de busca (RPC só `service_role`, uma linha por motor, com a hora).
- Com `AGENT_PROVIDER=hermes`, a capability responde `available: true` só se o último sinal de vida tem menos de 2 minutos; senão `available: false` com `motivo: 'motor_fora_do_ar'`. Sem Hermes, segue a regra de hoje (`executar !== null`), com `motivo: 'sem_modelo'` quando falso.
- O frontend lê o motivo e escolhe o texto do aviso; o módulo continua decidido uma vez na abertura do Workspace (sem polling nesta fatia).
- O selo do Agente usa o estado de runtime, mas com Conversas indisponíveis o rótulo do estado `ocioso` vira "Sem conversas no momento".

## Testing Decisions

- Deno: handler da capability com relógio injetado (sinal recente, velho, ausente, sem Hermes) — prior art `agent-conversation/*.test.ts`.
- Deno: o worker chama o sinal de vida a cada ciclo — prior art `_hermes-worker/worker.test.ts`.
- pgTAP: a RPC do sinal de vida recusa `authenticated`.
- Vitest: página de Agentes com Conversas indisponíveis não mostra "Disponível" — prior art `paginas/agentes*.test.tsx`.

## Out of Scope

- Perfil Hermes por Workspace e isolamento (motor-hermes/02, orquestracao/05).
- Reconsultar a capability enquanto a página está aberta.
- Mudar o roteamento de IA (já decidido: Hermes).

## Further Notes

Reaproveitados: [motor-hermes/02](../motor-hermes/issues/02-ligar-o-hermes-no-contrato-do-banco.md) (worker na VPS, Nan), [crm-real-e-stack/14](../crm-real-e-stack/issues/14-executar-conversas-e-coordenacao.md) (Passos do Nan), [agentes-em-conversa/02](../agentes-em-conversa/issues/02-cada-agente-com-a-propria-vez.md) e [05](../agentes-em-conversa/issues/05-agente-propoe-mudar-o-playbook.md), [slack-canal/06](../slack-canal/issues/06-conversa-do-slack-na-althius.md), PR #223. O [crm-real-e-stack/25](../crm-real-e-stack/issues/25-avaliar-hermes-como-motor-dos-agentes.md) (needs-info) parece resolvido pela decisão do Renan.

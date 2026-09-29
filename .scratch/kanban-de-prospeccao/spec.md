# Spec: Kanban de prospecção

**Status:** ready-for-agent (01–04); 05–06 dependem do Acesso ao HubSpot

**Frente:** Contas. Guia geral: [`docs/visao-geral-da-plataforma.md`](../../docs/visao-geral-da-plataforma.md).
Decisão: [ADR-0020](../../docs/adr/0020-kanban-de-prospeccao-e-envio-ao-crm.md), sabatina de 29/09/2026.

## Problem Statement

O funil da Althius (TAM → Quente → Fit → abordagem → resposta → reunião → CRM) não aparece em lugar nenhum. A pessoa
não vê em que ponto cada Conta está, e nada passa para o CRM do cliente, onde o Closer trabalha.

## Solution

Cada Conta-alvo tem um **Estágio de prospecção** fixo: Descoberta, Quente, Fit, Em abordagem, Respondeu, Reunião, No CRM,
e Descartada. Os eventos movem o cartão sozinhos (Sinal, Aderência, Envio, resposta, reunião, envio ao CRM); a pessoa
também move à mão. Depois de Em abordagem, a Conta nunca volta para trás. Os critérios de passagem do Playbook aparecem
no cartão e avisam, sem bloquear. **Enviar ao CRM** leva a empresa, os Contatos e uma nota com os Sinais e a abordagem,
com Aprovação quando a Permissão é Propor; depois disso, o CRM manda e a Althius só lê o estágio do negócio.

## User Stories

1. Como participante, quero ver as minhas Contas em colunas do funil.
2. Como participante, quero que o cartão ande sozinho quando chega um Sinal, uma resposta ou uma reunião.
3. Como participante, quero mover um cartão à mão e ver o histórico de quem moveu.
4. Como participante, quero ver no cartão o que falta pelo Playbook (ex.: 3 perfis mapeados).
5. Como participante, quero enviar a Conta ao CRM com tudo o que a Althius sabe.
6. Como Administrador, quero aprovar o envio ao CRM quando a Permissão pede.
7. Como participante, quero ver no cartão o estágio do negócio no CRM, depois do envio.

## Implementation Decisions

- **Estágios fixos** (enum no banco) e histórico de mudanças (quem ou qual evento, quando), numa migration aditiva.
  Contas existentes e importadas começam em Descoberta. Nenhuma redefinição de `save_target_account`.
- **Movimentos automáticos** por funções chamadas pelos eventos das outras specs; regra única: nunca volta depois de Em
  abordagem, exceto para Descartada. Sinais vencidos antes da abordagem voltam a Descoberta.
- **Tela:** vista "Kanban" em Contas, lendo a Fonte de Contas; a tabela atual continua.
- **Critérios:** lidos da seção SLA e metas do Playbook; avisam, não bloqueiam.
- **Enviar ao CRM:** HubSpot primeiro (`conexoes-funcionais` 03), sob a Permissão (Propor → Aprovação, CRM-15). Depois do
  envio, só leitura (ADR-0020, ADR-0016).

## Testing Decisions

- pgTAP: estágio só do Workspace; histórico gravado; nunca volta depois de Em abordagem; movimento manual só por quem pode.
- Deno: envio ao CRM com o HubSpot falso, idempotente.
- Frontend: colunas, arrastar, pendências no cartão, com o banco em memória.

## Out of Scope

- Kanban de vendas e Oportunidades (fase 2).
- Escrever no CRM depois do envio.

## Further Notes

- Tickets em `issues/`. 01 começa já; 02 e 03 dependem de 01; 04 depende de 03 e do Playbook 01; 05 depende de 01, do
  Acesso ao HubSpot e do CRM-15; 06 depende de 05.

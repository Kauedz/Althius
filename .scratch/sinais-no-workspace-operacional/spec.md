# Sinais ligados no Workspace operacional

Status: ready-for-human (o caminho crítico é do Nan: A3 e crm-real-e-stack/11)

Origem: [AUDITORIA-TOTAL-2026-10-17.md](../AUDITORIA-TOTAL-2026-10-17.md), vertical D. Fila: [FILA-EXECUCAO-2026-10-17.md](../FILA-EXECUCAO-2026-10-17.md).

## Problem Statement

No Workspace operacional o módulo Sinais só liga se algum Sinal (actor do registro ou tipo do catálogo interno) estiver
`available`. Os actors nascem `testing` e o Monitoramento só processa `available`, então em produção o módulo
provavelmente está indisponível e nenhum Sinal externo é gerado. Não há conferência registrada do que está `available`
hoje no banco de produção.

## Solution

- O Nan confere em produção o estado do registro de actors e do catálogo interno e registra aqui.
- O Nan promove os actors validados (A3) e liga a coleta pelo Apify (crm-real-e-stack/11).
- Os testes de frontend dos Sinais no Workspace operacional cobrem a regra do módulo ([suite-verde/02](../suite-verde/issues/02-testes-dos-sinais-no-workspace-operacional.md)).

## User Stories

1. Como participante, quero ver os Sinais internos (Interações, proposta recusada) mesmo antes dos Sinais externos, se o catálogo os marcar disponíveis.
2. Como participante, quero ver Sinais externos das Contas-alvo depois que os actors validados forem promovidos.
3. Como Nan, quero um roteiro curto para saber o que está `available` em produção.
4. Como Renan, quero saber, com dado de produção, por que o módulo Sinais aparece indisponível.

## Implementation Decisions

- A regra do módulo não muda: `list_signal_actors` + `list_signal_catalog`, algum `available` liga.
- A promoção a `available` é por migration (A3), nunca pela tela.

## Testing Decisions

- pgTAP de `registro_de_actors.sql` muda junto com a A3 (hoje espera 12 em `testing`).
- Frontend: [suite-verde/02](../suite-verde/issues/02-testes-dos-sinais-no-workspace-operacional.md).

## Out of Scope

- Coletores novos, cascatas e Sinais jurídicos (specs próprias).

## Further Notes

Reaproveitados (Nan): [prospeccao-funcional/A3](../prospeccao-funcional/issues/A3-actors-validados-disponiveis.md), [crm-real-e-stack/11](../crm-real-e-stack/issues/11-coletar-sinais-externos-com-apify.md). Outros abertos: [cascatas-confiabilidade 01–05](../cascatas-confiabilidade/issues/), [auditoria-de-sinais-2026-10-13 01–02](../auditoria-de-sinais-2026-10-13/issues/).

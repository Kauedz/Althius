# 03: Tela da criação em lote de Sequências

**What to build:** Na lista de Contas (ou no lote importado), selecionar várias Contas-alvo, escolher a Cadência
(passos de `modelo-de-cadencia.ts`) e chamar `create_sequences_in_batch`; mostrar o desfecho de cada Conta em pt-BR
(created, sequence_in_progress, not_responsible, no_eligible_contact, not_found).

**Blocked by:** 02 (RPC na branch `cadencia/descadastro-e-variaveis`).

**Status:** ready-for-human

## Critérios

- [x] Seleção múltipla na lista de Contas e no lote importado, sem mudar rota nem menu.
- [x] Escolha da Cadência e prévia do primeiro passo para uma Conta.
- [x] Resultado por Conta com os motivos traduzidos.
- [x] Vitest.

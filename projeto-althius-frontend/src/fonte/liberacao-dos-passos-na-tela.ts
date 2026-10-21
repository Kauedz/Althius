/**
 * Liga na tela os controles de liberação do passo ("Após a ativação", "Após o envio de outro passo",
 * "Liberação manual" e o seletor de predecessor).
 *
 * Desligado até o ticket 02 (`.scratch/sequencias-multicontato/issues/02-execucao-independente.md`):
 * o Executor ainda envia em série pela ordem da lista e ignora `liberacao`/`predecessorId`. Mostrar
 * "Liberação manual" antes disso prometeria um passo segurado que sairia sozinho.
 *
 * O banco e as fontes já gravam e validam esses campos (ticket 01); só a tela fica como hoje.
 * Ligar junto com o ticket 02, no mesmo PR que muda o Executor.
 */
export const LIBERACAO_DOS_PASSOS_NA_TELA = false as boolean

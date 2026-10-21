// Os padrões de toda Sequência nova, nos dois ambientes: a janela de envio e a regra de pausa. Ficam fora dos dados da
// Demonstração para o Workspace operacional não puxar as Sequências de exemplo para o pacote principal.

import type { JanelaHorario } from './sequencias-tipos'

export const REGRA_DE_PAUSE_PADRAO =
  'Qualquer resposta nesta Conta-alvo (positiva ou negativa) pausa a sequência inteira para análise humana.'

export const JANELA_PADRAO: JanelaHorario = {
  de: '09:00',
  ate: '17:00',
}

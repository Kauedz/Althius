// A fila de Aprovações: o prazo de cada pendente, o motivo da vencida e os filtros por tipo e por Agente.

import type { AprovacaoDaFila, FonteDeAgentes, TipoDeAprovacao } from './tipos'

const HORA = 60 * 60 * 1000

/** "vence em 6 h", "vence em 3 dias", "vence em menos de 1 h"; nada se não é pendente ou não tem prazo. */
export function prazoDaAprovacao(aprovacao: AprovacaoDaFila, agora: Date = new Date()): string | null {
  if (aprovacao.estado !== 'pendente' || !aprovacao.venceEm) return null
  const falta = new Date(aprovacao.venceEm).getTime() - agora.getTime()
  if (Number.isNaN(falta)) return null
  if (falta <= 0) return 'vence agora'
  if (falta < HORA) return 'vence em menos de 1 h'
  const horas = Math.floor(falta / HORA)
  if (horas < 48) return `vence em ${horas} h`
  return `vence em ${Math.floor(horas / 24)} dias`
}

/** O motivo de uma Aprovação vencida: ninguém decidiu dentro do prazo. */
export const MOTIVO_DA_VENCIDA = 'Venceu sem decisão dentro do prazo de 7 dias. Nada foi feito; o Agente pode propor de novo.'

export const ROTULO_DO_TIPO: Record<TipoDeAprovacao, string> = {
  envio: 'Envio',
  integracao: 'Integração',
  revisao: 'Revisão do Playbook',
  sequencia: 'Sequência',
}

export interface FiltroDaFila {
  tipo: TipoDeAprovacao | 'todos'
  agenteId: string | 'todos'
}

/** O tipo de uma Aprovação; sem o campo, a revisão pela forma e o resto como envio. */
export function tipoDaAprovacao(aprovacao: AprovacaoDaFila): TipoDeAprovacao {
  if (aprovacao.tipo) return aprovacao.tipo
  return aprovacao.revisao ? 'revisao' : 'envio'
}

export function filtrarFila(aprovacoes: AprovacaoDaFila[], filtro: FiltroDaFila): AprovacaoDaFila[] {
  return aprovacoes.filter(
    (a) =>
      (filtro.tipo === 'todos' || tipoDaAprovacao(a) === filtro.tipo) &&
      (filtro.agenteId === 'todos' || a.agenteId === filtro.agenteId),
  )
}

/** A fila inteira, com a Sequência proposta pelo Rhetor; a Fonte que não a tem devolve só as Aprovações. */
export function lerFilaDeAprovacoes(fonte: FonteDeAgentes): Promise<AprovacaoDaFila[]> {
  return fonte.filaDeAprovacoes ? fonte.filaDeAprovacoes() : fonte.aprovacoes()
}

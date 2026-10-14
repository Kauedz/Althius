// De quem é a vez na Conversa com um Agente (PR-11): o anfitrião responde primeiro, depois cada Agente mencionado no
// pedido e cada um que outro Agente chamou com "@Nome" na fala, na ordem, até alguém que ainda não falou.
import { reconhecerMencoes } from '@/fonte/mencoes'
import type { Agente, AgenteId } from '@/fonte/tipos'
import type { ItemDaConversa } from './contexto'

export function quemEstaRespondendo(
  itens: ItemDaConversa[],
  anfitriao: Agente,
  agentes: Agente[],
): Agente {
  const inicio = itens.map((item) => item.tipo).lastIndexOf('usuario')
  if (inicio === -1) return anfitriao
  const pedido = itens[inicio]
  const fila: Agente[] = [anfitriao, ...reconhecerMencoes(pedido.tipo === 'usuario' ? pedido.texto : '', agentes)]
  const falaram = new Set<AgenteId>()
  for (const item of itens.slice(inicio + 1)) {
    if (item.tipo !== 'texto') continue
    falaram.add(item.agenteId)
    fila.push(...reconhecerMencoes(item.texto, agentes).filter((a) => a.id !== item.agenteId))
  }
  return fila.find((a) => !falaram.has(a.id)) ?? anfitriao
}

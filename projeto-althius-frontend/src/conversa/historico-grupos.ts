// O histórico de Conversas agrupado por data (Hoje, Últimos 7 dias, Mais antigas) e filtrado pela busca.

import { nomeDaConversa, type ResumoDeConversa } from '@/fonte/tipos'

export type NomeDoGrupo = 'Hoje' | 'Últimos 7 dias' | 'Mais antigas'

export interface GrupoDeConversas {
  nome: NomeDoGrupo
  conversas: ResumoDeConversa[]
}

const ORDEM: NomeDoGrupo[] = ['Hoje', 'Últimos 7 dias', 'Mais antigas']

function grupoDe(atualizadaEm: string, agora: Date): NomeDoGrupo {
  const data = new Date(atualizadaEm)
  const inicioDeHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
  if (data >= inicioDeHoje) return 'Hoje'
  const seteDias = new Date(inicioDeHoje)
  seteDias.setDate(seteDias.getDate() - 7)
  return data >= seteDias ? 'Últimos 7 dias' : 'Mais antigas'
}

/** Sem acento e em minúsculas, para a busca achar "Previsão" digitando "previsao". */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/** As Conversas que batem com a busca (pelo nome ou pelo primeiro pedido), nos grupos de data, sem grupo vazio. */
export function agruparConversas(conversas: ResumoDeConversa[], busca: string, agora = new Date()): GrupoDeConversas[] {
  const termo = normalizar(busca.trim())
  const grupos = new Map<NomeDoGrupo, ResumoDeConversa[]>()
  for (const conversa of conversas) {
    if (termo && !normalizar(`${nomeDaConversa(conversa)} ${conversa.primeiroPedido}`).includes(termo)) continue
    const nome = grupoDe(conversa.atualizadaEm, agora)
    grupos.set(nome, [...(grupos.get(nome) ?? []), conversa])
  }
  return ORDEM.flatMap((nome) => {
    const lista = grupos.get(nome)
    return lista ? [{ nome, conversas: lista }] : []
  })
}

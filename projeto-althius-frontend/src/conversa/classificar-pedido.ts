import { CATALOGO_VISIVEL, correspondeBuscaDoCatalogo, type CardDoCatalogo } from '@/paginas/sinais/catalogo-visivel'

/** Limiar provisório; regra 15 da spec mantém esta decisão isolada para ajuste posterior. */
export const LIMIAR_DE_MODELO = 1

export type ClassificacaoDoPedido =
  | { caminho: 'modelo'; modelos: CardDoCatalogo[] }
  | { caminho: 'plano_novo' }
  | { caminho: 'geral' }

function normalizar(texto: string): string {
  return texto.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/** Busca compartilhada com a vitrine: normaliza acentos e procura no nome, frase, família e nichos. */
export function buscarModelosDoCatalogo(texto: string): CardDoCatalogo[] {
  const termos = normalizar(texto).split(/[^a-z0-9]+/).filter((termo) => termo.length > 2)
  return CATALOGO_VISIVEL
    .map((card) => {
      const alvo = normalizar(`${card.nome} ${card.frase} ${card.familiaId} ${card.nichos.join(' ')}`)
      const pontuacao = termos.filter((termo) => correspondeBuscaDoCatalogo(alvo, termo)).length
      return { card, pontuacao }
    })
    .filter(({ pontuacao }) => pontuacao >= LIMIAR_DE_MODELO)
    .toSorted((a, b) => b.pontuacao - a.pontuacao)
    .slice(0, 3)
    .map(({ card }) => card)
}

const INTERROGATIVOS = /^(o que|como|qual|quais|por que|quanto|quando é|explique|me explica)\b/i
const INTENCAO_DE_MONITORAMENTO = /monitor|acompanh|avis|alert|quero saber quando|rastrear|vigiar|sinal|sempre que|toda vez que/i

export function classificarPedido(texto: string): ClassificacaoDoPedido {
  const pedido = texto.trim()
  const geral = (pedido.endsWith('?') || INTERROGATIVOS.test(pedido)) && !INTENCAO_DE_MONITORAMENTO.test(pedido)
  if (geral) return { caminho: 'geral' }
  const modelos = buscarModelosDoCatalogo(pedido)
  return modelos.length > 0 ? { caminho: 'modelo', modelos } : { caminho: 'plano_novo' }
}

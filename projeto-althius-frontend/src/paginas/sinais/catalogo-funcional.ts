// Quais cards do catálogo o cliente vê (catalogo-so-funcionais 01). Um card é funcional quando um dos seus coletores
// está `available`; o cliente vê só esses, mais os que o Workspace já monitora. A equipe Althius vê o catálogo inteiro,
// com os não funcionais marcados como internos. A Demonstração não informa estado e mostra tudo. Não muda nenhum Sinal.

import { useAmbiente, useDadosDeSinais } from '@/fonte/contexto'
import type { Disponibilidade, Monitoramento } from '@/fonte/sinais-tipos'
import type { CardDoCatalogo } from './catalogo-visivel'

/** O estado de cada coletor (`signal_type`): 'available', 'testing' ou 'out'. */
export type EstadosDosColetores = ReadonlyMap<string, string>

type MonitoramentoDoCard = Pick<Monitoramento, 'tipoId'>

/** Um card roda de verdade quando ao menos um coletor está disponível. Card sem coletor nunca é funcional. */
export function ehFuncional(card: Pick<CardDoCatalogo, 'coletores'>, estados: EstadosDosColetores): boolean {
  return card.coletores.some((coletor) => estados.get(coletor) === 'available')
}

/** A disponibilidade do card: o melhor estado entre os coletores. */
export function disponibilidadeDoCard(card: Pick<CardDoCatalogo, 'coletores'>, estados: EstadosDosColetores): Disponibilidade {
  if (ehFuncional(card, estados)) return 'disponivel'
  return card.coletores.some((coletor) => estados.get(coletor) === 'testing') ? 'em-teste' : 'em-breve'
}

/** Se o Workspace já tem Monitoramento (em qualquer estado) que conta neste card. */
export function temMonitoramento(card: Pick<CardDoCatalogo, 'id' | 'contados'>, monitoramentos: readonly MonitoramentoDoCard[]): boolean {
  return monitoramentos.some((m) => m.tipoId === card.id || card.contados.includes(m.tipoId))
}

/** Os cards que o cliente vê: os funcionais e os que o Workspace já monitora, na ordem em que chegaram. */
export function cardsParaOCliente<C extends CardDoCatalogo>({
  cards,
  estados,
  monitoramentos,
}: {
  cards: readonly C[]
  estados: EstadosDosColetores
  monitoramentos: readonly MonitoramentoDoCard[]
}): C[] {
  return cards.filter((card) => ehFuncional(card, estados) || temMonitoramento(card, monitoramentos))
}

/** Os selos de um card que não roda de verdade: o estado e, para a equipe, "Interno". */
export interface EstadoDoCard {
  disponibilidade: Exclude<Disponibilidade, 'disponivel'>
  interno: boolean
}

export interface VisaoDoCatalogo {
  /** Esperando os estados ou a equipe, no Workspace operacional. */
  carregando: boolean
  /** A leitura dos estados falhou: a tela mostra o erro, nunca o catálogo inteiro. */
  erro: Error | null
  recarregar: () => void
  /** Os cards que esta pessoa vê. */
  visiveis<C extends CardDoCatalogo>(cards: readonly C[], monitoramentos: readonly MonitoramentoDoCard[]): C[]
  /** Se o card roda de verdade; `undefined` quando a Fonte não informa (a Demonstração). */
  disponibilidadeDe(card: Pick<CardDoCatalogo, 'coletores'>): Disponibilidade | undefined
  /** Os selos de um card que não roda; nada para um card funcional ou na Demonstração. */
  estadoDe(card: Pick<CardDoCatalogo, 'coletores'>): EstadoDoCard | undefined
}

/**
 * A visão do catálogo para quem está logado. Só o Workspace operacional filtra; a Demonstração e uma Fonte que não
 * informa estado mostram tudo, sem selo.
 */
export function useCatalogoFuncional(): VisaoDoCatalogo {
  const operacional = useAmbiente().modo === 'real'
  const leitura = useDadosDeSinais(
    (f) => (operacional && f.estadosDosColetores ? f.estadosDosColetores() : Promise.resolve(null)),
    [operacional],
  )
  const equipe = useDadosDeSinais(
    (f) => (operacional && f.souDaEquipeAlthius ? f.souDaEquipeAlthius().catch(() => false) : Promise.resolve(false)),
    [operacional],
  )
  // Fora do operacional, ou sem leitura, não há estado: o catálogo aparece inteiro.
  const estados = operacional ? (leitura.dados ?? null) : null
  const staff = equipe.dados === true

  return {
    carregando: operacional && ((leitura.carregando && leitura.dados === undefined) || (equipe.carregando && equipe.dados === undefined)),
    erro: operacional ? leitura.erro : null,
    recarregar: leitura.recarregar,
    visiveis(cards, monitoramentos) {
      if (!estados || staff) return [...cards]
      return cardsParaOCliente({ cards, estados, monitoramentos })
    },
    disponibilidadeDe(card) {
      return estados ? disponibilidadeDoCard(card, estados) : undefined
    },
    estadoDe(card) {
      if (!estados) return undefined
      const disponibilidade = disponibilidadeDoCard(card, estados)
      return disponibilidade === 'disponivel' ? undefined : { disponibilidade, interno: staff }
    },
  }
}

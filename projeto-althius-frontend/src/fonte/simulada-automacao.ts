// A Demonstração dos interruptores e tetos: tudo começa em confirmar, e as mudanças valem só na sessão.

import type { EscopoDeAutomacao, FonteDeAutomacao, ModoDeAutomacao } from './automacao-tipos'
import { catalogoDeIntegracoesDosAgentes } from './catalogo-de-conexoes'
import type { Agente } from './tipos'

const ACOES = [
  { escopo: 'acao:varredura', nome: 'Varredura de Sinais' },
  { escopo: 'acao:enriquecimento', nome: 'Enriquecimento' },
  { escopo: 'acao:agentes', nome: 'Execuções de Agentes' },
]

export function criarFonteDeAutomacaoSimulada({ agentes }: { agentes: () => Promise<Agente[]> }): FonteDeAutomacao {
  const ouvintes = new Set<() => void>()
  const ajustes = new Map<string, { modo: ModoDeAutomacao; teto: number | null }>()

  function comAjuste(base: Pick<EscopoDeAutomacao, 'escopo' | 'tipo' | 'nome'>): EscopoDeAutomacao {
    const ajuste = ajustes.get(base.escopo)
    const modo = ajuste?.modo ?? 'confirmar'
    const teto = ajuste?.teto ?? null
    return { ...base, modo, teto, gastoNoMes: 0, bloqueio: modo === 'confirmar' ? 'confirmar' : teto ? null : 'sem_teto' }
  }

  return {
    observar(ouvinte) {
      ouvintes.add(ouvinte)
      return () => ouvintes.delete(ouvinte)
    },
    async escopos() {
      const lista = await agentes()
      return [
        ...ACOES.map((a) => comAjuste({ ...a, tipo: 'acao' })),
        ...lista.map((a) => comAjuste({ escopo: `agente:${a.id}`, tipo: 'agente', nome: a.nome })),
        ...catalogoDeIntegracoesDosAgentes.map((i) => comAjuste({ escopo: `integracao:${i.id}`, tipo: 'integracao', nome: i.nome })),
      ]
    },
    async salvar(escopo, modo, teto) {
      if (teto !== null && !(teto > 0)) throw new Error('O teto precisa ser maior que zero.')
      if (modo === 'automatico' && teto === null) throw new Error('O automático precisa de um teto mensal aprovado.')
      ajustes.set(escopo, { modo, teto })
      ouvintes.forEach((ouvinte) => ouvinte())
    },
  }
}

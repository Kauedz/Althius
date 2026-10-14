// A Demonstração dos interruptores e tetos: tudo começa em confirmar, e as mudanças valem só na sessão.

import type { EscopoDeAutomacao, FonteDeAutomacao, ModoDeAutomacao, ResumoDoLimite } from './automacao-tipos'
import { catalogoDeIntegracoesDosAgentes } from './catalogo-de-conexoes'
import type { Agente } from './tipos'

const ACOES = [
  { escopo: 'acao:varredura', nome: 'Varredura de Sinais' },
  { escopo: 'acao:enriquecimento', nome: 'Enriquecimento' },
  { escopo: 'acao:agentes', nome: 'Execuções de Agentes' },
]

export function criarFonteDeAutomacaoSimulada({
  agentes,
  ilimitado = false,
}: {
  agentes: () => Promise<Agente[]>
  ilimitado?: boolean
}): FonteDeAutomacao {
  const ouvintes = new Set<() => void>()
  const ajustes = new Map<string, { modo: ModoDeAutomacao; teto: number | null }>()
  const limite = { valor: ilimitado ? null : 100, tetoDaFaixa: ilimitado ? null : 100, uso: 0 }

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
      if (modo === 'automatico' && teto === null && !ilimitado) throw new Error('O automático precisa de um teto mensal aprovado.')
      ajustes.set(escopo, { modo, teto })
      ouvintes.forEach((ouvinte) => ouvinte())
    },
    async resumoDoLimite(): Promise<ResumoDoLimite> {
      return {
        ilimitado,
        limite: limite.valor,
        tetoDaFaixa: limite.tetoDaFaixa,
        uso: limite.uso,
        inativo: false,
      }
    },
    async salvarLimite(valor) {
      if (ilimitado) throw new Error('Este Workspace não tem limite mensal.')
      if (!(valor > 0)) throw new Error('O limite precisa ser maior que zero.')
      if (limite.tetoDaFaixa !== null && valor > limite.tetoDaFaixa) {
        throw new Error('O limite não pode passar dos créditos da faixa.')
      }
      limite.valor = valor
      ouvintes.forEach((ouvinte) => ouvinte())
    },
  }
}

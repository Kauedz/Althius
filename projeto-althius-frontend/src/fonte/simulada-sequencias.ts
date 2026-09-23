import { JANELA_PADRAO, REGRA_DE_PAUSE_PADRAO, criarSequenciasIniciais } from './dados-sequencias-demo'
import type {
  AtualizacaoDocumento,
  FonteDeSequencias,
  MetricasDemoSequencia,
  NovaSequencia,
  Sequencia,
} from './sequencias-tipos'

export interface OpcoesFonteDeSequenciasSimulada {
  atrasoMs?: number
  hoje?: Date
  falha?: boolean
  vazia?: boolean
}

export interface FonteDeSequenciasSimulada extends FonteDeSequencias {
  definirFalha(falha: boolean): void
  definirVazia(vazia: boolean): void
}

/**
 * Cria a implementação simulada da FonteDeSequencias (ADR 0003).
 * Suporta opções para testes (atraso, data de hoje fixa, falha e lista vazia).
 */
export function criarFonteDeSequenciasSimulada(
  opcoes: OpcoesFonteDeSequenciasSimulada = {},
): FonteDeSequenciasSimulada {
  let { atrasoMs = 0, hoje = new Date(), falha = false, vazia = false } = opcoes
  const ouvintes = new Set<() => void>()

  let dados: Sequencia[] = vazia ? [] : criarSequenciasIniciais(hoje)

  function notificar(): void {
    for (const ouvinte of ouvintes) {
      ouvinte()
    }
  }

  async function aguardar(): Promise<void> {
    if (atrasoMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, atrasoMs))
    }
    if (falha) {
      throw new Error('Falha ao carregar dados de sequências')
    }
  }

  return {
    hoje() {
      return hoje
    },

    definirFalha(novaFalha: boolean) {
      falha = novaFalha
      notificar()
    },

    definirVazia(novaVazia: boolean) {
      vazia = novaVazia
      dados = vazia ? [] : criarSequenciasIniciais(hoje)
      notificar()
    },

    observar(ouvinte: () => void) {
      ouvintes.add(ouvinte)
      return () => {
        ouvintes.delete(ouvinte)
      }
    },

    async sequencias(): Promise<Sequencia[]> {
      await aguardar()
      return dados.map((s) => ({ ...s, steps: [...s.steps], participantesIds: [...s.participantesIds] }))
    },

    async sequencia(id: string): Promise<Sequencia> {
      await aguardar()
      const encontrada = dados.find((s) => s.id === id)
      if (!encontrada) {
        throw new Error(`Sequência "${id}" não encontrada`)
      }
      return { ...encontrada, steps: [...encontrada.steps], participantesIds: [...encontrada.participantesIds] }
    },

    async sequenciaPorConta(contaId: string): Promise<Sequencia | null> {
      await aguardar()
      const encontrada = dados.find((s) => s.contaId === contaId)
      if (!encontrada) {
        return null
      }
      return { ...encontrada, steps: [...encontrada.steps], participantesIds: [...encontrada.participantesIds] }
    },

    async criarSequencia(nova: NovaSequencia): Promise<Sequencia> {
      await aguardar()
      const jaExiste = dados.some((s) => s.contaId === nova.contaId)
      if (jaExiste) {
        throw new Error(`Conta-alvo "${nova.contaId}" já possui uma sequência`)
      }

      const participantes = nova.participantesIds ? [...nova.participantesIds] : []
      const criada: Sequencia = {
        id: `sequencia-${nova.contaId}`,
        contaId: nova.contaId,
        status: nova.status ?? 'ativa',
        participantesIds: participantes,
        janelaPadrao: nova.janelaPadrao ?? JANELA_PADRAO,
        regraDePause: nova.regraDePause ?? REGRA_DE_PAUSE_PADRAO,
        steps: nova.steps ? [...nova.steps] : [],
        passoAtual: 0,
        totalParticipantes: participantes.length,
        criadaEm: hoje.toISOString(),
      }

      dados = [criada, ...dados]
      notificar()
      return { ...criada, steps: [...criada.steps], participantesIds: [...criada.participantesIds] }
    },

    async atualizarDocumento(id: string, atualizacao: AtualizacaoDocumento): Promise<Sequencia> {
      await aguardar()
      const indice = dados.findIndex((s) => s.id === id)
      if (indice === -1) {
        throw new Error(`Sequência "${id}" não encontrada para atualização`)
      }

      const atual = dados[indice]
      const novosParticipantes = atualizacao.participantesIds
        ? [...atualizacao.participantesIds]
        : atual.participantesIds

      const atualizada: Sequencia = {
        ...atual,
        ...(atualizacao.steps && { steps: [...atualizacao.steps] }),
        ...(atualizacao.janelaPadrao && { janelaPadrao: atualizacao.janelaPadrao }),
        ...(atualizacao.regraDePause && { regraDePause: atualizacao.regraDePause }),
        ...(atualizacao.status && { status: atualizacao.status }),
        ...(atualizacao.motivoPause !== undefined && { motivoPause: atualizacao.motivoPause }),
        participantesIds: novosParticipantes,
        totalParticipantes: novosParticipantes.length,
        atualizadaEm: hoje.toISOString(),
      }

      dados = dados.map((item, idx) => (idx === indice ? atualizada : item))
      notificar()
      return { ...atualizada, steps: [...atualizada.steps], participantesIds: [...atualizada.participantesIds] }
    },

    async confirmarParticipantes(id: string, participantesIds: string[]): Promise<Sequencia> {
      return this.atualizarDocumento(id, { participantesIds })
    },

    async metricasDeDemo(id: string): Promise<MetricasDemoSequencia | null> {
      await aguardar()
      const encontrada = dados.find((s) => s.id === id)
      if (!encontrada) {
        return null
      }

      const respostas = encontrada.steps.filter((s) => s.metricas?.respondeu).length
      return {
        sequenciaId: encontrada.id,
        status: encontrada.status,
        coberturaContatos: encontrada.totalParticipantes,
        stepsConcluidos: encontrada.passoAtual,
        totalSteps: encontrada.steps.length,
        respostas,
        reunioes: encontrada.status === 'reuniao' ? 1 : 0,
      }
    },
  }
}

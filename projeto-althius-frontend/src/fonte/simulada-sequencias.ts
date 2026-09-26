import { JANELA_PADRAO, REGRA_DE_PAUSE_PADRAO, criarSequenciasIniciais } from './dados-sequencias-demo'
import {
  ehCanalSuportado,
  type AtualizacaoDocumento,
  type FonteDeSequencias,
  type MetricasDemoSequencia,
  type NovaSequencia,
  type ResumoPublicoSequencia,
  type Sequencia,
  type StepSequencia,
} from './sequencias-tipos'

function validarStepsAlteradosOuNovos(novosSteps?: StepSequencia[], stepsAntigos?: StepSequencia[]): void {
  if (!novosSteps) return
  for (const step of novosSteps) {
    const antigo = stepsAntigos?.find((s) => s.id === step.id)
    const foiAlterado =
      !antigo ||
      antigo.canal !== step.canal ||
      antigo.corpo !== step.corpo ||
      antigo.titulo !== step.titulo ||
      antigo.assunto !== step.assunto
    if (foiAlterado && !ehCanalSuportado(step.canal)) {
      throw new Error(`Canal "${step.canal}" fora do escopo. Apenas E-mail, LinkedIn e WhatsApp são permitidos.`)
    }
  }
}

export interface OpcoesFonteDeSequenciasSimulada {
  atrasoMs?: number
  hoje?: Date
  falha?: boolean
  vazia?: boolean
  armazenamento?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
}

export interface FonteDeSequenciasSimulada extends FonteDeSequencias {
  definirFalha(falha: boolean): void
  definirVazia(vazia: boolean): void
}

/**
 * Cria a implementação simulada da FonteDeSequencias (ADR 0003).
 * Suporta opções para testes (atraso, data de hoje fixa, falha, persistência e lista vazia).
 */
export function criarFonteDeSequenciasSimulada(
  opcoes: OpcoesFonteDeSequenciasSimulada = {},
): FonteDeSequenciasSimulada {
  const CHAVE_STORAGE = 'althius:sequencias:v1'
  let { atrasoMs = 0, hoje = new Date(), falha = false, vazia = false, armazenamento } = opcoes
  const ouvintes = new Set<() => void>()

  let dados: Sequencia[] = vazia ? [] : criarSequenciasIniciais(hoje)

  if (armazenamento && !vazia) {
    try {
      const bruto = armazenamento.getItem(CHAVE_STORAGE)
      if (bruto) {
        dados = JSON.parse(bruto)
      }
    } catch {
      // Ignora erro de leitura do armazenamento
    }
  }

  function salvar(): void {
    if (!armazenamento) return
    try {
      armazenamento.setItem(CHAVE_STORAGE, JSON.stringify(dados))
    } catch {
      // Ignora erro de gravacao
    }
  }

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
      salvar()
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
      validarStepsAlteradosOuNovos(nova.steps, [])
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
      salvar()
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
      validarStepsAlteradosOuNovos(atualizacao.steps, atual.steps)
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
      salvar()
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

    // A Demonstração não tem Envios nem respostas reais: nada sai deste protótipo.
    async envios() {
      await aguardar()
      return []
    },
    async confirmarPasso() {
      throw new Error('Na Demonstração nenhum passo é enviado de verdade.')
    },
    async enviarPasso() {
      throw new Error('Na Demonstração nenhum passo é enviado de verdade.')
    },
    async respostasRecebidas() {
      await aguardar()
      return []
    },
    async urlDoAnexo() {
      throw new Error('Na Demonstração não há anexos recebidos.')
    },

    async resumoPublico(id: string): Promise<ResumoPublicoSequencia | null> {
      await aguardar()
      const encontrada = dados.find((s) => s.id === id)
      if (!encontrada) {
        return null
      }
      return {
        id: encontrada.id,
        contaId: encontrada.contaId,
        status: encontrada.status,
        totalParticipantes: encontrada.totalParticipantes,
        totalSteps: encontrada.steps.length,
        passoAtual: encontrada.passoAtual,
        motivoPause: encontrada.motivoPause,
        atualizadaEm: encontrada.atualizadaEm,
      }
    },
  }
}

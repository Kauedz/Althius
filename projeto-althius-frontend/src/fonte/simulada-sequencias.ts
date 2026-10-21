import { SINAIS_MOCK } from '@/paginas/sinais/dados-mock'
import { JANELA_PADRAO, REGRA_DE_PAUSE_PADRAO, criarSequenciasIniciais } from './dados-sequencias-demo'
import { TEMPLATES_DA_ALTHIUS, sugerirTemplateDaAlthius } from './templates-althius'
import { previaParametrizada, sugerirTemplateProprio, templateProntoParaSalvar, type TemplateProprio } from './templates-proprios'
import { validarDependenciasDosPassos } from './dependencias-dos-passos'
import {
  ehCanalSuportado,
  type AtualizacaoDocumento,
  type FonteDeSequencias,
  type MetricasDemoSequencia,
  type NovaSequencia,
  type ResumoPublicoSequencia,
  type Sequencia,
  type StepSequencia,
  type TaxaDosEnvios,
  type TaxaPorAbordagem,
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
  validarDependenciasDosPassos(novosSteps)
}

/** O Resultado dos Envios de exemplo da Demonstração, por canal e segmento. */
const TAXAS_DA_DEMONSTRACAO: TaxaDosEnvios[] = [
  { canal: 'email', segmento: 'Infraestrutura de dados', enviados: 48, respostas: 12, positivas: 7, reunioes: 4, oportunidades: 2 },
  { canal: 'email', segmento: 'Software de design', enviados: 20, respostas: 3, positivas: 1, reunioes: 1, oportunidades: 0 },
  { canal: 'linkedin', segmento: 'Infraestrutura de dados', enviados: 15, respostas: 5, positivas: 2, reunioes: 1, oportunidades: 0 },
]

/** O Resultado dos Envios de exemplo por abordagem (título do passo). */
const TAXAS_POR_ABORDAGEM_DA_DEMONSTRACAO: TaxaPorAbordagem[] = [
  { abordagem: 'Abertura pelo Sinal', canal: 'email', enviados: 40, respostas: 11, positivas: 6, reunioes: 4, oportunidades: 2 },
  { abordagem: 'Conexão no LinkedIn', canal: 'linkedin', enviados: 15, respostas: 5, positivas: 2, reunioes: 1, oportunidades: 0 },
  { abordagem: 'Follow-up executivo', canal: 'email', enviados: 28, respostas: 4, positivas: 2, reunioes: 1, oportunidades: 0 },
]

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
  let templatesProprios: TemplateProprio[] = []
  const donoDemo = 'vendedor-demo'

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

    async taxasPorAbordagem(): Promise<TaxaPorAbordagem[]> {
      await aguardar()
      return dados.length === 0 ? [] : TAXAS_POR_ABORDAGEM_DA_DEMONSTRACAO.map((taxa) => ({ ...taxa }))
    },

    async taxasDosEnvios(): Promise<TaxaDosEnvios[]> {
      await aguardar()
      return dados.length === 0 ? [] : TAXAS_DA_DEMONSTRACAO.map((taxa) => ({ ...taxa }))
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

    async autorizacao() {
      return null
    },

    async ativarEnvios() {
      throw new Error('Na Demonstração nenhum passo é enviado.')
    },

    async resolverIncerto() {
      throw new Error('Na Demonstração nenhum passo é enviado.')
    },

    async templatesDaAlthius() {
      await aguardar()
      return TEMPLATES_DA_ALTHIUS.map((template) => ({
        ...template,
        passos: template.passos.map((passo) => ({ ...passo })),
      }))
    },

    async sugerirTemplateDaAlthius(contaId: string) {
      await aguardar()
      const sinal = SINAIS_MOCK.find((item) => item.contaId === contaId)
      const conta = contaId
      return sugerirTemplateDaAlthius({
        templates: TEMPLATES_DA_ALTHIUS,
        conta,
        sinal: sinal ? { frase: sinal.frase, data: sinal.data } : null,
      })
    },

    async templatesProprios() {
      await aguardar()
      return templatesProprios.map((template) => ({
        ...template,
        passos: template.passos.map((passo) => ({ ...passo })),
      }))
    },

    async previaDeTemplateProprio(entrada) {
      await aguardar()
      return previaParametrizada(entrada)
    },

    async salvarTemplateProprio(entrada) {
      await aguardar()
      if (!templateProntoParaSalvar(entrada)) {
        throw new Error('Salve só a prévia já parametrizada, sem dados reais.')
      }
      const salvo: TemplateProprio = {
        id: `proprio-${templatesProprios.length + 1}`,
        donoId: donoDemo,
        nome: entrada.nome,
        resumo: entrada.resumo,
        passos: entrada.passos.map((passo) => ({ ...passo })),
      }
      templatesProprios = [salvo, ...templatesProprios]
      notificar()
      return {
        ...salvo,
        passos: salvo.passos.map((passo) => ({ ...passo })),
      }
    },

    async atualizarTemplateProprio(id, entrada) {
      await aguardar()
      if (!templateProntoParaSalvar(entrada)) {
        throw new Error('Salve só a prévia já parametrizada, sem dados reais.')
      }
      const atual = templatesProprios.find((template) => template.id === id && template.donoId === donoDemo)
      if (!atual) throw new Error('Só quem criou o template pode alterá-lo.')
      atual.nome = entrada.nome
      atual.resumo = entrada.resumo
      atual.passos = entrada.passos.map((passo) => ({ ...passo }))
      notificar()
      return { ...atual, passos: atual.passos.map((passo) => ({ ...passo })) }
    },

    async sugerirTemplateProprio(contaId: string) {
      await aguardar()
      const sinal = SINAIS_MOCK.find((item) => item.contaId === contaId)
      return sugerirTemplateProprio({
        templates: templatesProprios,
        leitorId: donoDemo,
        conta: contaId,
        sinal: sinal ? { frase: sinal.frase } : null,
      })
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

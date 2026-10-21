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
  type RespostaPendenteDeRetencao,
  type ResultadoDaDecisaoDeRetencao,
  type ResumoPublicoSequencia,
  type RevisaoDeRetencao,
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
  /** Registra uma resposta correlacionada e retém a Conta, sem IA. Duplicata do mesmo evento não reabre. */
  registrarRespostaCorrelacionada(pedido: {
    sequenciaId: string
    eventoId: string
    contatoId?: string
    de?: string
    assunto?: string
    trecho?: string
  }): Promise<RevisaoDeRetencao>
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
  const retencoes = new Map<string, {
    versao: number
    aberta: boolean
    estado: 'preventiva' | 'pausa_decidida'
    abertaEm: string
    respostas: Array<RespostaPendenteDeRetencao & { eventoId: string; criadaEm: string }>
    decisoes: RevisaoDeRetencao['decisoes']
  }>()

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

  function revisaoDe(id: string, podeLerConteudo: boolean): RevisaoDeRetencao {
    const hold = retencoes.get(id)
    if (!hold || !hold.aberta) {
      return {
        aberta: false,
        estado: 'nenhuma',
        versao: hold?.versao ?? 0,
        pendentes: [],
        decisoes: podeLerConteudo ? (hold?.decisoes ?? []) : [],
        podeLerConteudo,
        podeDecidir: podeLerConteudo,
      }
    }
    const pendentes = hold.respostas.filter((r) => r.criadaEm >= hold.abertaEm)
    return {
      aberta: true,
      estado: hold.estado,
      versao: hold.versao,
      pendentes: pendentes.map((r) => podeLerConteudo
        ? { id: r.id, contatoId: r.contatoId, recebidaEm: r.recebidaEm, assunto: r.assunto, trecho: r.trecho, de: r.de, canal: r.canal }
        : { id: r.id, recebidaEm: r.recebidaEm }),
      decisoes: podeLerConteudo ? hold.decisoes : [],
      podeLerConteudo,
      podeDecidir: podeLerConteudo,
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
      if (atualizacao.status === 'ativa' && atual.status !== 'ativa' && retencoes.get(id)?.aberta) {
        throw new Error('Há respostas pendentes nesta Conta. Revise o conjunto atual antes de continuar.')
      }
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
    async revisaoDeRetencao(sequenciaId) {
      await aguardar()
      const encontrada = dados.find((s) => s.id === sequenciaId)
      return revisaoDe(sequenciaId, encontrada?.responsavel !== false)
    },
    async decidirRetencao(pedido): Promise<ResultadoDaDecisaoDeRetencao> {
      await aguardar()
      const indice = dados.findIndex((s) => s.id === pedido.sequenciaId)
      const hold = retencoes.get(pedido.sequenciaId)
      if (indice === -1 || !hold?.aberta) return { outcome: 'not_open', versao: hold?.versao ?? 0 }
      const pendentes = hold.respostas.filter((r) => r.criadaEm >= hold.abertaEm).map((r) => r.id)
      const mesmoConjunto = pendentes.length === pedido.respostasRevisadas.length
        && pendentes.every((id) => pedido.respostasRevisadas.includes(id))
      if (hold.versao !== pedido.versao || !mesmoConjunto) {
        return { outcome: 'stale', versao: hold.versao }
      }
      const agora = hoje.toISOString()
      if (pedido.decisao === 'pause') {
        hold.estado = 'pausa_decidida'
        hold.decisoes = [{ decisao: 'pause', versao: hold.versao, criadaEm: agora }, ...hold.decisoes]
        const atual = dados[indice]
        if (atual.motivoPause !== 'Descadastro') {
          dados[indice] = { ...atual, status: 'pausada', motivoPause: 'Pausa decidida após resposta', atualizadaEm: agora }
        }
        notificar()
        return { outcome: 'paused', versao: hold.versao }
      }
      hold.aberta = false
      hold.decisoes = [{ decisao: 'continue', versao: hold.versao, criadaEm: agora }, ...hold.decisoes]
      const atual = dados[indice]
      const motivoDeResposta = atual.motivoPause === 'Contato respondeu' || atual.motivoPause === 'Pausa decidida após resposta'
      if (!atual.pausadaPelaConta && !atual.pausadaPelaContaRemetente) {
        dados[indice] = {
          ...atual,
          status: 'ativa',
          motivoPause: motivoDeResposta ? undefined : atual.motivoPause,
          atualizadaEm: agora,
        }
      }
      notificar()
      return {
        outcome: atual.pausadaPelaConta || atual.pausadaPelaContaRemetente ? 'reviewed_other_hold' : 'continued',
        versao: hold.versao,
      }
    },
    async registrarRespostaCorrelacionada(pedido) {
      await aguardar()
      const indice = dados.findIndex((s) => s.id === pedido.sequenciaId)
      if (indice === -1) throw new Error(`Sequência "${pedido.sequenciaId}" não encontrada`)
      const agora = hoje.toISOString()
      const hold = retencoes.get(pedido.sequenciaId) ?? {
        versao: 0,
        aberta: false,
        estado: 'preventiva' as const,
        abertaEm: agora,
        respostas: [],
        decisoes: [],
      }
      if (!hold.respostas.some((r) => r.eventoId === pedido.eventoId)) {
        if (hold.aberta) {
          hold.versao += 1
          hold.estado = 'preventiva'
        } else {
          hold.versao += 1
          hold.aberta = true
          hold.estado = 'preventiva'
          hold.abertaEm = agora
        }
        hold.respostas.push({
          id: `resposta-${pedido.eventoId}`,
          eventoId: pedido.eventoId,
          contatoId: pedido.contatoId,
          de: pedido.de,
          assunto: pedido.assunto,
          trecho: pedido.trecho,
          canal: 'email',
          recebidaEm: agora,
          criadaEm: agora,
        })
        const atual = dados[indice]
        if (atual.motivoPause !== 'Descadastro' && !atual.pausadaPelaConta) {
          dados[indice] = {
            ...atual,
            status: 'pausada',
            motivoPause: atual.motivoPause === 'Pausa decidida após resposta' ? 'Contato respondeu' : (atual.motivoPause ?? 'Contato respondeu'),
            atualizadaEm: agora,
          }
        }
        retencoes.set(pedido.sequenciaId, hold)
        notificar()
      }
      return revisaoDe(pedido.sequenciaId, true)
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

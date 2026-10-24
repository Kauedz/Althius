import { TIPOS, TIPO_PERSONALIZADO } from '@/paginas/sinais/catalogo'
import { CATALOGO_VISIVEL } from '@/paginas/sinais/catalogo-visivel'
import { MONITORAMENTOS_INICIAIS, SINAIS_MOCK, publicoInicial } from '@/paginas/sinais/dados-mock'
import { foiDisparado, parseDataDisparo } from '@/fonte/regras-sinais'
import type { FonteDeContas } from './contas-tipos'
import type { PedidoDePlano, PlanoDoSinal, PlanoMontado, PlanoParaSalvar } from './plano-do-sinal'
import { ErroDaRodada, type AchadoDaRodada, type HistoricoDeRodadas, type PedidoDeRodada, type PreviaDaRodada } from './rodadas-do-sinal'
import { TIPO_DO_SINAL_REAL } from './sinais-reais-mapa'
import { ErroDaAgenda, normalizarAgenda, proximasRodadas, validarAgenda, type AgendaDoSinal } from './agenda-do-sinal'
import { ErroDoLimite, estimativaLocal, type EstimativaDoSinal } from './preco-por-rodada'
import type {
  CardSobPedido,
  CascataDoCatalogo,
  EstadoDoMonitoramento,
  SinalDeMercado,
  FonteDeSinais,
  Monitoramento,
  NovoMonitoramento,
  NovoPedidoDeSinal,
  ParametrosSimulacaoDisparo,
  PedidoDeSinal,
  SinalEncontrado,
  TipoDeSinal,
} from './sinais-tipos'

export interface OpcoesFonteDeSinaisSimulada {
  atrasoMs?: number
  hoje?: Date
  falha?: boolean
  vazia?: boolean
  fonteDeContas?: FonteDeContas
}

export interface FonteDeSinaisSimulada extends FonteDeSinais {
  definirHoje(hoje: Date): void
  definirFalha(falha: boolean): void
  definirVazia(vazia: boolean): void
  vincularFonteDeContas(fonte: FonteDeContas): void
}

function clonarMonitoramento(m: Monitoramento): Monitoramento {
  return {
    ...m,
    publico: {
      ...m.publico,
      listas: [...m.publico.listas],
      perfil: m.publico.perfil
        ? {
            ...m.publico.perfil,
            estados: m.publico.perfil.estados ? [...m.publico.perfil.estados] : undefined,
            ufs: m.publico.perfil.ufs ? [...m.publico.perfil.ufs] : undefined,
            cidades: m.publico.perfil.cidades ? [...m.publico.perfil.cidades] : undefined,
            cnaes: m.publico.perfil.cnaes ? [...m.publico.perfil.cnaes] : undefined,
          }
        : undefined,
    },
    criterios: { ...m.criterios },
    criteriosLivres: m.criteriosLivres ? [...m.criteriosLivres] : undefined,
    agenda: m.agenda ? { horarios: [...m.agenda.horarios], dias: [...m.agenda.dias] } : undefined,
    limitePorDia: m.limitePorDia,
  }
}

/**
 * Cria a implementação simulada da FonteDeSinais (ADR 0003 e Ticket 03/04).
 * Suporta opções para testes (atraso, data de hoje fixa, falha e lista vazia).
 */
export function criarFonteDeSinaisSimulada(
  opcoes: OpcoesFonteDeSinaisSimulada = {},
): FonteDeSinaisSimulada {
  let { atrasoMs = 0, hoje = new Date(), falha = false, vazia = false, fonteDeContas } = opcoes
  let fonteDeContasVinculada: FonteDeContas | undefined = fonteDeContas
  const ouvintes = new Set<() => void>()

  let monitoramentos: Monitoramento[] = vazia
    ? []
    : MONITORAMENTOS_INICIAIS.map(clonarMonitoramento)

  let sinais: SinalEncontrado[] = vazia ? [] : [...SINAIS_MOCK]
  let pedidos: PedidoDeSinal[] = []
  // O Rodar agora da Demonstração: o pedido fica "na fila" (nada roda de verdade) e as Rodadas são as fixas.
  let pedidosDeRodada: (PedidoDeRodada & { monitoramentoId: string })[] = []

  function notificar(): void {
    for (const ouvinte of ouvintes) {
      ouvinte()
    }
  }

  async function aguardar(): Promise<void> {
    if (falha) {
      throw new Error('Falha ao carregar dados de sinais')
    }
    if (atrasoMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, atrasoMs))
    }
  }

  if (fonteDeContasVinculada) {
    fonteDeContasVinculada.observar(() => {
      notificar()
    })
  }

  return {
    hoje() {
      return fonteDeContasVinculada ? fonteDeContasVinculada.hoje() : hoje
    },

    definirHoje(novaData: Date) {
      hoje = novaData
      notificar()
    },

    definirFalha(novaFalha: boolean) {
      falha = novaFalha
      notificar()
    },

    definirVazia(novaVazia: boolean) {
      vazia = novaVazia
      monitoramentos = vazia ? [] : MONITORAMENTOS_INICIAIS.map(clonarMonitoramento)
      sinais = vazia ? [] : [...SINAIS_MOCK]
      notificar()
    },

    vincularFonteDeContas(fonte: FonteDeContas) {
      fonteDeContasVinculada = fonte
      fonte.observar(() => {
        notificar()
      })
    },

    observar(ouvinte: () => void) {
      ouvintes.add(ouvinte)
      return () => {
        ouvintes.delete(ouvinte)
      }
    },

    async tipos(): Promise<TipoDeSinal[]> {
      await aguardar()
      return [...TIPOS]
    },

    // A Demonstração mostra o catálogo simulado inteiro: os Sinais por mercado só existem no Workspace operacional.
    async cascatas(): Promise<CascataDoCatalogo[]> {
      await aguardar()
      return []
    },

    async sinaisDeMercado(): Promise<SinalDeMercado[]> {
      await aguardar()
      return []
    },

    async tipo(id: string): Promise<TipoDeSinal> {
      await aguardar()
      if (id === TIPO_PERSONALIZADO.id) {
        return TIPO_PERSONALIZADO
      }
      const encontrado = TIPOS.find((t) => t.id === id)
      if (!encontrado) {
        throw new Error(`Tipo de sinal "${id}" não encontrado`)
      }
      return encontrado
    },

    async monitoramentos(): Promise<Monitoramento[]> {
      await aguardar()
      return monitoramentos.map(clonarMonitoramento)
    },

    async monitoramentosDoTipo(tipoId: string): Promise<Monitoramento[]> {
      await aguardar()
      return monitoramentos
        .filter((m) => m.tipoId === tipoId)
        .map(clonarMonitoramento)
    },

    async monitoramento(id: string): Promise<Monitoramento> {
      await aguardar()
      const encontrado = monitoramentos.find((m) => m.id === id)
      if (!encontrado) {
        throw new Error(`Monitoramento "${id}" não encontrado`)
      }
      return clonarMonitoramento(encontrado)
    },

    async salvarMonitoramento(
      novoOuExistente: Monitoramento | NovoMonitoramento,
    ): Promise<Monitoramento> {
      await aguardar()
      const ehNovo = !novoOuExistente.id || novoOuExistente.id.startsWith('novo-')
      const id = ehNovo
        ? `mon-${Date.now()}-${Math.floor(Math.random() * 1000)}`
        : novoOuExistente.id!

      const salvo: Monitoramento = {
        id,
        tipoId: novoOuExistente.tipoId,
        nome: novoOuExistente.nome,
        estado: novoOuExistente.estado ?? 'rascunho',
        publico: novoOuExistente.publico ?? publicoInicial(true),
        criterios: novoOuExistente.criterios ?? {},
        descricao: novoOuExistente.descricao,
        fonte: novoOuExistente.fonte,
        origem: novoOuExistente.origem,
        criteriosLivres: novoOuExistente.criteriosLivres,
        // A Agenda e o limite por dia têm a sua própria gravação: salvar o formulário não os muda.
        agenda: monitoramentos.find((m) => m.id === id)?.agenda,
        limitePorDia: monitoramentos.find((m) => m.id === id)?.limitePorDia,
      }

      const index = monitoramentos.findIndex((m) => m.id === id)
      if (index >= 0) {
        monitoramentos[index] = salvo
      } else {
        monitoramentos.push(salvo)
      }
      notificar()
      return clonarMonitoramento(salvo)
    },

    async mudarEstado(
      id: string,
      estado: EstadoDoMonitoramento,
    ): Promise<Monitoramento> {
      await aguardar()
      const m = monitoramentos.find((item) => item.id === id)
      if (!m) {
        throw new Error(`Monitoramento "${id}" não encontrado`)
      }
      m.estado = estado
      notificar()
      return clonarMonitoramento(m)
    },

    async excluirMonitoramento(id: string): Promise<void> {
      await aguardar()
      monitoramentos = monitoramentos.filter((m) => m.id !== id)
      notificar()
    },

    async sinaisEncontrados(): Promise<SinalEncontrado[]> {
      await aguardar()
      if (vazia) return []
      const refHoje = fonteDeContasVinculada ? fonteDeContasVinculada.hoje() : hoje

      let lista = [...sinais]
      if (fonteDeContasVinculada) {
        try {
          const sinaisDaFonte = await fonteDeContasVinculada.sinais()
          for (const s of sinaisDaFonte) {
            if (s.monitoramentoId) {
              const jaExiste = lista.some(
                (item) => item.id === s.id || (s.acontecimentoId && item.acontecimentoId === s.acontecimentoId),
              )
              if (!jaExiste) {
                lista.push({
                  id: s.id,
                  contaId: s.contaId,
                  acontecimentoId: s.acontecimentoId,
                  tipoId: s.tipoId ?? 'abertura-de-vagas',
                  monitoramentoId: s.monitoramentoId,
                  frase: s.frase ?? s.titulo ?? s.descricao ?? '',
                  data: s.dataDisparo ?? s.data,
                  fonte: s.fonte ?? 'Simulação',
                  evidencia: s.evidencia ?? '',
                  reencontrado: s.reencontrado
                    ? {
                        data: s.reencontrado.data,
                        monitoramentoId: s.reencontrado.monitoramentoId ?? s.monitoramentoId,
                      }
                    : undefined,
                })
              }
            }
          }
        } catch {
          // Em caso de falha na fonte de contas, preserva lista local
        }
      }

      const disparados = lista.filter((s) => foiDisparado(s.data, refHoje))
      return disparados.sort((a, b) => parseDataDisparo(b.data).getTime() - parseDataDisparo(a.data).getTime())
    },

    async simularDisparo(parametros: ParametrosSimulacaoDisparo): Promise<SinalEncontrado> {
      await aguardar()
      const m = monitoramentos.find((item) => item.id === parametros.monitoramentoId)
      if (!m) {
        throw new Error(`Monitoramento "${parametros.monitoramentoId}" não encontrado`)
      }
      if (m.estado !== 'ativo') {
        throw new Error(
          `Não é possível produzir disparos para o Monitoramento "${m.nome}", pois ele está ${m.estado}. Apenas Monitoramentos Ativos produzem disparos.`,
        )
      }

      // Escolhe contaId se não fornecido
      let contaId = parametros.contaId
      if (!contaId) {
        if (m.publico.modo === 'descoberta') {
          // Descoberta: sempre contas recomendadas (que possuem Fit)
          contaId = 'stripe'
        } else if (m.publico.modo === 'listas') {
          // Listas: pode ser importada com qualquer aderência (ex: rappi = não fit, bbva-mexico = sem avaliação)
          contaId = m.publico.listas.includes('fintechs-brasil') ? 'rappi' : 'bbva-mexico'
        } else {
          contaId = 'openai'
        }
      }

      const refHoje = fonteDeContasVinculada ? fonteDeContasVinculada.hoje() : hoje
      const rawData = parametros.data ?? refHoje
      const dataIso = rawData instanceof Date ? rawData.toISOString().slice(0, 10) : String(rawData)
      const acontecimentoId =
        parametros.acontecimentoId ?? parametros.id ?? `acont-${m.tipoId}-${contaId}`

      // Verifica reencontro / duplicata existente
      const existente = sinais.find(
        (s) =>
          s.contaId === contaId &&
          (s.id === acontecimentoId || s.acontecimentoId === acontecimentoId),
      )

      if (existente) {
        // Reencontro: mantém data original e não renova validade
        existente.reencontrado = {
          data: dataIso,
          monitoramentoId: m.id,
        }
        if (fonteDeContasVinculada) {
          await fonteDeContasVinculada.adicionarSinal({
            id: existente.id,
            contaId,
            acontecimentoId,
            tipoId: m.tipoId,
            monitoramentoId: m.id,
            frase: existente.frase,
            data: dataIso,
            dataDisparo: dataIso,
            fonte: parametros.fonte ?? existente.fonte,
            evidencia: parametros.evidencia ?? existente.evidencia,
          })
        }
        notificar()
        return { ...existente }
      }

      const id = parametros.id ?? `sinal-${Date.now()}-${Math.floor(Math.random() * 1000)}`
      const frase = parametros.frase ?? `Disparo simulado de ${m.nome}`
      const fonte =
        parametros.fonte ??
        (m.fonte ? (m.fonte.includes('simulad') ? m.fonte : `${m.fonte} (simulada)`) : 'Página de carreiras (simulada)')
      const evidencia =
        parametros.evidencia ??
        `Evidência observada em ${dataIso} (simulada). Não constitui garantia de compra.`

      const novoSinal: SinalEncontrado = {
        id,
        contaId,
        acontecimentoId,
        tipoId: m.tipoId,
        monitoramentoId: m.id,
        frase,
        data: dataIso,
        fonte,
        evidencia,
      }

      sinais = [novoSinal, ...sinais]

      if (fonteDeContasVinculada) {
        await fonteDeContasVinculada.adicionarSinal({
          id,
          contaId,
          acontecimentoId,
          tipoId: m.tipoId,
          monitoramentoId: m.id,
          frase,
          descricao: frase,
          data: dataIso,
          dataDisparo: dataIso,
          fonte,
          evidencia,
        })
      }

      notificar()
      return { ...novoSinal }
    },

    async pedidosDeSinal(): Promise<PedidoDeSinal[]> {
      await aguardar()
      return pedidos.map((pedido) => ({ ...pedido, contato: { ...pedido.contato } }))
    },

    async pedirSinal(pedido: NovoPedidoDeSinal): Promise<PedidoDeSinal> {
      await aguardar()
      const evento = pedido.evento.trim()
      const empresasOuNicho = pedido.empresasOuNicho.trim()
      if (!evento || !empresasOuNicho) throw new Error('Conte o evento e as empresas ou o nicho.')
      const fontes = pedido.fontesConhecidas?.trim()
      const novo: PedidoDeSinal = {
        id: `pedido-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        evento,
        empresasOuNicho,
        ...(fontes ? { fontesConhecidas: fontes } : {}),
        urgencia: pedido.urgencia,
        contato: {
          nome: pedido.contato.nome.trim(),
          email: pedido.contato.email.trim(),
          ...(pedido.contato.whatsapp?.trim() ? { whatsapp: pedido.contato.whatsapp.trim() } : {}),
        },
        status: 'novo',
        criadoEm: new Date().toISOString(),
      }
      pedidos = [novo, ...pedidos]
      notificar()
      return { ...novo, contato: { ...novo.contato } }
    },

    catalogoDoWorkspace(): Promise<CardSobPedido[]> {
      return Promise.resolve([])
    },

    // A Demonstração mostra o catálogo inteiro, simulado: todo coletor conta como disponível.
    estadosDosColetores(): Promise<ReadonlyMap<string, string>> {
      return Promise.resolve(new Map(CATALOGO_VISIVEL.flatMap((card) => card.coletores.map((coletor) => [coletor, 'available'] as const))))
    },

    souDaEquipeAlthius(): Promise<boolean> {
      return Promise.resolve(false)
    },

    // A Rodada da Demonstração é fixa: a prévia, o histórico e os achados são sempre os mesmos, e nada é cobrado nem roda.
    async previaDaRodada(): Promise<PreviaDaRodada> {
      await aguardar()
      return { ...PREVIA_DA_DEMONSTRACAO }
    },

    async rodarAgora(monitoramentoId: string): Promise<void> {
      await aguardar()
      if (pedidosDeRodada.some((p) => p.monitoramentoId === monitoramentoId)) throw new ErroDaRodada('ja_na_fila')
      pedidosDeRodada = [...pedidosDeRodada, {
        id: `pedido-demo-${pedidosDeRodada.length + 1}`,
        monitoramentoId,
        estado: 'pendente',
        pedidoEm: hoje.toISOString(),
        ateCreditos: PREVIA_DA_DEMONSTRACAO.ateCreditos,
        rodadaId: null,
      }]
      notificar()
    },

    async rodadas(monitoramentoId: string): Promise<HistoricoDeRodadas> {
      await aguardar()
      return {
        rodadas: vazia ? [] : [{ ...RODADA_DA_DEMONSTRACAO }],
        pedidos: pedidosDeRodada.filter((p) => p.monitoramentoId === monitoramentoId).map(({ monitoramentoId: _, ...p }) => p),
      }
    },

    async achadosDaRodada(rodadaId: string): Promise<AchadoDaRodada[]> {
      await aguardar()
      return rodadaId === RODADA_DA_DEMONSTRACAO.id ? ACHADOS_DA_DEMONSTRACAO.map((a) => ({ ...a })) : []
    },

    // A Agenda da Demonstração fica em memória e não roda nada: o cálculo dos próximos horários é o mesmo do servidor.
    async salvarAgenda(monitoramentoId: string, agenda: AgendaDoSinal): Promise<Monitoramento> {
      await aguardar()
      const m = monitoramentos.find((item) => item.id === monitoramentoId)
      if (!m) throw new Error(`Monitoramento "${monitoramentoId}" não encontrado`)
      const codigo = validarAgenda(agenda, m.publico.listas.length)
      if (codigo) throw new ErroDaAgenda(codigo)
      m.agenda = normalizarAgenda(agenda)
      notificar()
      return clonarMonitoramento(m)
    },

    async proximasRodadas(agenda: AgendaDoSinal, contas: number, n: number): Promise<string[]> {
      await aguardar()
      const codigo = validarAgenda(agenda, contas)
      if (codigo) throw new ErroDaAgenda(codigo)
      const referencia = fonteDeContasVinculada ? fonteDeContasVinculada.hoje() : hoje
      return proximasRodadas(agenda, referencia, Math.min(Math.max(n, 1), 20)).map((d) => d.toISOString())
    },

    // A estimativa da Demonstração usa o preço fixo da prévia de exemplo (2 créditos por Conta) e as Contas do Monitoramento; o
    // saldo é o de exemplo. A conta é a do servidor (`estimativaLocal`).
    async estimarAgenda(monitoramentoId: string, agenda?: AgendaDoSinal): Promise<EstimativaDoSinal> {
      await aguardar()
      const m = monitoramentos.find((item) => item.id === monitoramentoId)
      if (!m) throw new Error(`Monitoramento "${monitoramentoId}" não encontrado`)
      const proposta = agenda ?? m.agenda
      if (agenda) {
        const codigo = validarAgenda(agenda, m.publico.listas.length)
        if (codigo) throw new ErroDaAgenda(codigo)
      }
      return estimativaLocal({
        porRodada: m.publico.listas.length * PREVIA_DA_DEMONSTRACAO.creditosPorConta,
        ...(proposta ? { agenda: proposta } : {}),
        saldo: PREVIA_DA_DEMONSTRACAO.saldo,
      })
    },

    async salvarLimitePorDia(monitoramentoId: string, limite: number): Promise<Monitoramento> {
      await aguardar()
      const m = monitoramentos.find((item) => item.id === monitoramentoId)
      if (!m) throw new Error(`Monitoramento "${monitoramentoId}" não encontrado`)
      const { limiteSugeridoPorDia: sugerido } = estimativaLocal({
        porRodada: m.publico.listas.length * PREVIA_DA_DEMONSTRACAO.creditosPorConta,
        ...(m.agenda ? { agenda: m.agenda } : {}),
        saldo: PREVIA_DA_DEMONSTRACAO.saldo,
      })
      if (sugerido === 0) throw new ErroDoLimite('sem_estimativa')
      if (!Number.isInteger(limite) || limite < 1) throw new ErroDoLimite('limite_invalido')
      if (limite > sugerido) throw new ErroDoLimite('acima_do_sugerido', sugerido)
      m.limitePorDia = limite
      notificar()
      return clonarMonitoramento(m)
    },

    // O Plano da Demonstração é fixo: a IA não roda aqui, e o Briefing não muda o que volta (só as Contas escolhidas).
    async montarPlano(pedido: PedidoDePlano): Promise<PlanoMontado> {
      await aguardar()
      return { plano: planoFixoDaDemonstracao(pedido.contaIds), avisos: [] }
    },

    async salvarPlano(plano: PlanoParaSalvar): Promise<Monitoramento> {
      await aguardar()
      const existente = plano.id ? monitoramentos.find((m) => m.id === plano.id) : undefined
      const sinal = plano.plano.sinais[0]
      const salvo: Monitoramento = {
        id: existente?.id ?? `mon-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        tipoId: TIPO_DO_SINAL_REAL[sinal.tipo] ?? 'abertura-de-vagas',
        nome: plano.nome,
        estado: existente?.estado ?? 'rascunho',
        publico: {
          modo: 'listas',
          listas: plano.plano.escopo.tipo === 'contas' ? [...plano.plano.escopo.contaIds] : [],
          usaRecomendado: false,
        },
        criterios: { ...sinal.criterios },
        briefing: plano.briefing,
        plano: plano.plano,
        versaoDoPlano: (existente?.versaoDoPlano ?? 0) + 1,
      }
      const index = monitoramentos.findIndex((m) => m.id === salvo.id)
      if (index >= 0) monitoramentos[index] = salvo
      else monitoramentos.push(salvo)
      notificar()
      return clonarMonitoramento(salvo)
    },
  }
}

/** O Plano que a Demonstração devolve para qualquer Briefing: Abertura de vagas de RevOps nas Contas escolhidas. */
function planoFixoDaDemonstracao(contaIds: string[]): PlanoDoSinal {
  return {
    versao: 1,
    origem: 'briefing',
    escopo: { tipo: 'contas', contaIds: [...contaIds] },
    sinais: [{
      tipo: 'vaga_linkedin',
      criterios: { funcoes: ['RevOps e GTM'], senioridade: 'Qualquer', localizacao: ['Brasil'], periodo: 'Últimos 30 dias' },
    }],
    explicacao: 'Vamos acompanhar “Abertura de vagas” nas Contas escolhidas: a empresa abre vagas de RevOps e GTM. Revise e ajuste antes de salvar.',
    maxEmpresasPorRodada: 50,
  }
}


const PREVIA_DA_DEMONSTRACAO: PreviaDaRodada = {
  contas: 12, contasSemDado: 0, creditosPorConta: 2, ateCreditos: 24, saldo: 180, ilimitado: false, bloqueio: null,
}

const RODADA_DA_DEMONSTRACAO = {
  id: 'rodada-demo-1',
  origem: 'manual' as const,
  estado: 'concluida' as const,
  iniciadaEm: '2026-10-20T13:00:00.000Z',
  terminouEm: '2026-10-20T13:04:00.000Z',
  contasNoEscopo: 12,
  contasVerificadas: 12,
  contasSemDado: 0,
  sinaisNovos: 2,
  sinaisRepetidos: 0,
  creditos: 24,
  motivoDaParada: 'concluida' as const,
  versaoDoPlano: 1,
  observacao: null,
}

const ACHADOS_DA_DEMONSTRACAO: AchadoDaRodada[] = [
  {
    id: 'achado-demo-1',
    contaId: 'nubank',
    contaNome: 'Nubank',
    tipo: 'vaga_linkedin',
    frase: 'Abriu vaga: Head de RevOps',
    data: '2026-10-18T10:00:00.000Z',
    fonte: 'LinkedIn',
    evidencia: 'https://exemplo.com.br/vagas/head-de-revops',
    situacao: 'novo',
    porQue: 'Combina com o Plano: Abertura de vagas (função: RevOps e GTM; em Brasil; período: Últimos 30 dias)',
  },
  {
    id: 'achado-demo-2',
    contaId: 'stripe',
    contaNome: 'Stripe',
    tipo: 'vaga_linkedin',
    frase: 'Abriu vaga: Analista de GTM',
    data: '2026-10-19T09:00:00.000Z',
    fonte: 'LinkedIn',
    evidencia: 'https://exemplo.com.br/vagas/analista-de-gtm',
    situacao: 'novo',
    porQue: 'Combina com o Plano: Abertura de vagas (função: RevOps e GTM; em Brasil; período: Últimos 30 dias)',
  },
]

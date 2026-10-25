// Sinais e Monitoramentos do Workspace operacional (sinais-reais, ticket 02): os Monitoramentos e os Sinais vêm do banco,
// o catálogo de tipos é o da tela, com a disponibilidade de cada um lida do registro de actors (os externos) e do catálogo
// do banco (os internos, que saem das Interações, CRM-10). Um tipo sem Sinal real, ou cujo actor ainda está em teste,
// recusa o Monitoramento em palavras do produto. Disparo simulado só existe na Demonstração.
import type { SupabaseClient } from '@supabase/supabase-js'
import { TIPOS } from '@/paginas/sinais/catalogo'
import { CATALOGO_VISIVEL, cardQueConta } from '@/paginas/sinais/catalogo-visivel'
import { SINAL_DO_TIPO, TIPO_DO_SINAL_REAL } from './sinais-reais-mapa'
import {
  ErroDaAgenda,
  FUSO_DA_AGENDA,
  MENSAGEM_DA_FALHA_DA_AGENDA,
  codigoDoErroDaAgenda,
  type AgendaDoSinal,
} from './agenda-do-sinal'
import { corpoDoErroDaFuncao } from './falha-da-edge-function'
import {
  BLOQUEIOS_DA_ATIVACAO,
  ErroDoLimite,
  ErroDaAutomacao,
  MENSAGEM_DA_FALHA_DA_AUTOMACAO,
  MENSAGEM_DA_FALHA_DO_LIMITE,
  codigoDoErroDaAutomacao,
  codigoDoErroDoLimite,
  type EstimativaDoSinal,
} from './preco-por-rodada'
import { ErroDoPlano, MENSAGEM_DA_FALHA_DO_PLANO, type PedidoDePlano, type PlanoDoSinal, type PlanoMontado, type PlanoParaSalvar } from './plano-do-sinal'
import {
  BLOQUEIOS_DA_RODADA,
  ErroDaRodada,
  MENSAGEM_DA_FALHA_DA_RODADA,
  type AchadoDaRodada,
  type BloqueioDaRodada,
  type HistoricoDeRodadas,
  type MotivoDaParada,
  type PreviaDaRodada,
} from './rodadas-do-sinal'
import { viewerEhDaEquipeAlthius } from './supabase-equipe'
import type { ContaAlvo, Sinal } from './contas-tipos'
import type {
  CardSobPedido,
  CascataDoCatalogo,
  Disponibilidade,
  EstadoDoMonitoramento,
  FonteDeSinais,
  Monitoramento,
  NovoMonitoramento,
  NovoPedidoDeSinal,
  PedidoDeSinal,
  SinalDeCandidata,
  SinalDeMercado,
  SinalEncontrado,
  TipoDeSinal,
  UrgenciaDoPedido,
  StatusDoPedido,
} from './sinais-tipos'

interface RegistroDoMonitor {
  id: string
  signal_type: string
  name: string
  state: EstadoDoMonitoramento
  audience: { accountIds?: string[]; escopo?: string } | null
  criteria: Record<string, unknown> | null
  last_error: string | null
  brief?: string | null
  plan?: PlanoDoSinal | null
  plan_version?: number | null
  schedule?: { horarios?: unknown; dias?: unknown } | null
  daily_credit_cap?: number | null
  consecutive_skips?: number | null
  paused_reason?: string | null
  last_run?: {
    state: 'rodando' | 'concluida' | 'falhou'
    startedAt: string
    finishedAt: string | null
    accountsChecked: number
    signalsNew: number
    signalsRepeated: number
  } | null
}

interface RegistroDaPrevia {
  contas: number | string
  contas_sem_dado: number | string
  creditos_por_conta: number | string
  ate_creditos: number | string
  saldo: number | string
  ilimitado: boolean
  bloqueio: string | null
  liberado_em: string | null
}

interface RegistroDaEstimativa {
  por_rodada: number | string
  rodadas_por_semana: number | string
  por_dia: number | string
  por_mes_aprox: number | string
  saldo: number | string
  dias_de_saldo: number | string | null
  aviso_repeticao: boolean
  teto_diario_sugerido: number | string
  bloqueio_ativacao: string | null
  ilimitado: boolean
}

interface RegistroDoHistorico {
  rodadas?: {
    id: string
    origem: 'agenda' | 'manual'
    estado: 'rodando' | 'concluida' | 'falhou'
    iniciadaEm: string
    terminouEm?: string | null
    horarioMarcado?: string | null
    contasNoEscopo?: number | null
    contasVerificadas: number
    contasSemDado: number
    sinaisNovos: number
    sinaisRepetidos: number
    creditos: number
    motivoDaParada?: MotivoDaParada | null
    versaoDoPlano?: number | null
    observacao?: string | null
  }[]
  solicitacoes?: { id: string; estado: 'pendente' | 'rodando'; pedidaEm: string; ateCreditos: number; rodadaId?: string | null }[]
}

interface RegistroDoAchado {
  signal_id: string
  target_account_id: string
  account_name: string
  signal_type: string
  phrase: string
  fired_at: string
  source: string | null
  evidence: string | null
  kind: string
  why: string
}

interface RegistroDoSinal {
  id: string
  target_account_id: string
  monitor_id: string | null
  signal_type: string
  event_key: string
  phrase: string
  fired_at: string
  source: string | null
  evidence: string | null
  seen_again_at: string | null
  seen_again_monitor_id: string | null
}

interface RegistroDaCascata {
  signal_type: string
  icp: string
  name: string
  state: string
  scope: string
  sem_fonte_motivo: string | null
}

const ESTADO_DA_CASCATA: Readonly<Record<string, CascataDoCatalogo['estado']>> = {
  available: 'disponivel',
  testing: 'em-teste',
  sem_fonte: 'sem-fonte',
}

/** O bloqueio que o banco recusou (`signal run blocked: <código>`), ou nada. */
function bloqueioDoErro(error: { message: string }): BloqueioDaRodada | null {
  const achado = /signal run blocked: ([a-z_]+)/.exec(error.message)?.[1]
  return BLOQUEIOS_DA_RODADA.find((b) => b === achado) ?? null
}

const MENSAGEM_DA_FALHA_DA_ESTIMATIVA = 'Não foi possível calcular a estimativa agora.'

function converterErro(error: { message: string; code?: string }): Error {
  const bloqueio = bloqueioDoErro(error)
  if (bloqueio) return new ErroDaRodada(bloqueio)
  const agenda = codigoDoErroDaAgenda(error.message)
  if (agenda) return new ErroDaAgenda(agenda)
  const limite = codigoDoErroDoLimite(error.message)
  if (limite) return new ErroDoLimite(limite)
  const automacao = codigoDoErroDaAutomacao(error.message)
  if (automacao) return new ErroDaAutomacao(automacao)
  if (error.message.includes('signal type is not available')) {
    return new Error('Este Sinal ainda está em teste e não roda de verdade.')
  }
  if (error.message.includes('an active monitor needs at least one target account')) {
    return new Error('Escolha ao menos uma Conta-alvo para ativar o Monitoramento.')
  }
  if (error.message.includes('a market monitor needs at least one role and a country')) {
    return new Error('No mercado endereçável, escolha ao menos um cargo e o país para ativar.')
  }
  if (error.message.includes('market monitor limits exceeded')) {
    return new Error('Confira os critérios: nicho e cargos Custom têm até 60 caracteres, até 10 cargos Custom, sem repetir.')
  }
  if (error.message.includes('the market scope needs an active contract')) {
    return new Error('O mercado endereçável precisa de contrato ativo. Fale com a equipe Althius.')
  }
  if (error.message.includes('the market scope is only for job openings')) {
    return new Error('O mercado endereçável existe só em Abertura de vagas.')
  }
  if (error.message.includes('only the creator or an administrator')) {
    return new Error('Só quem criou o Monitoramento, ou um Administrador, pode mudá-lo.')
  }
  if (error.message.includes('invalid signal plan')) {
    return new Error('O plano tem Contas, critérios ou limites inválidos. Confira e tente de novo.')
  }
  if (error.message.includes('the target account is archived') || error.message.includes('the target account was deleted')) {
    return new Error('Uma das Contas escolhidas está arquivada ou foi apagada. Tire-a do plano e tente de novo.')
  }
  if (error.message.includes('invalid monitor')) {
    return new Error('O Monitoramento tem um nome, um público ou critérios inválidos.')
  }
  return new Error('Não foi possível concluir. Tente de novo.')
}

/**
 * Por que a Edge Function `signal-plan` não devolveu o Plano, em palavras do produto: o limite do dia e a falta de Sinais
 * disponíveis têm código próprio; o resto é uma falha recuperável. Nunca repete texto técnico da função.
 */
async function erroDoPlano(error: unknown): Promise<ErroDoPlano> {
  const corpo = await corpoDoErroDaFuncao(error)
  const mensagem = typeof corpo?.error === 'string' ? corpo.error : MENSAGEM_DA_FALHA_DO_PLANO
  if (corpo?.codigo === 'limite_diario') return new ErroDoPlano('limite_diario', mensagem)
  if (corpo?.codigo === 'sem_tipos') return new ErroDoPlano('sem_tipos', mensagem)
  return new ErroDoPlano('falha', MENSAGEM_DA_FALHA_DO_PLANO)
}

/**
 * O estado de cada Sinal real ('available', 'testing' ou 'out'): o registro de actors para os externos e o catálogo do
 * banco para os internos. O que não puder ser lido fica de fora, e o tipo aparece "em breve".
 */
async function estadosDosSinaisReais(cliente: SupabaseClient): Promise<Map<string, string>> {
  const [actors, catalogo] = await Promise.all([cliente.rpc('list_signal_actors'), cliente.rpc('list_signal_catalog')])
  const linhas = [actors, catalogo].flatMap(({ data, error }) => (error ? [] : ((data ?? []) as { signal_type: string; state: string }[])))
  return new Map(linhas.map((l) => [l.signal_type, l.state]))
}

/**
 * O estado de cada coletor, para decidir quais cards o cliente vê. Diferente de `estadosDosSinaisReais`, uma leitura que
 * falha não vira "em breve" em silêncio: se qualquer uma das duas falhar, rejeita, e a tela mostra o erro em vez de
 * esconder os cards daquela leitura.
 */
async function estadosDosColetores(cliente: SupabaseClient): Promise<Map<string, string>> {
  const [actors, catalogo] = await Promise.all([cliente.rpc('list_signal_actors'), cliente.rpc('list_signal_catalog')])
  if (actors.error || catalogo.error) throw new Error('Não foi possível carregar os sinais.')
  const linhas = [actors, catalogo].flatMap(({ data, error }) => (error ? [] : ((data ?? []) as { signal_type: string; state: string }[])))
  return new Map(linhas.map((l) => [l.signal_type, l.state]))
}

/**
 * Se o módulo Sinais já roda de verdade: algum actor do registro passou no teste (sinais-reais 03) ou há um Sinal
 * interno disponível (CRM-10). Até lá, ou se nada puder ser lido, o módulo fica indisponível no Workspace operacional.
 */
export async function sinaisDisponiveis(cliente: SupabaseClient): Promise<boolean> {
  try {
    return [...(await estadosDosSinaisReais(cliente)).values()].includes('available')
  } catch {
    return false
  }
}

/** O foguinho de uma Conta como a Fonte de Contas o mostra: quantos Sinais válidos, se está Quente e o último Sinal. */
export type FoguinhoDaConta = Pick<ContaAlvo, 'quente' | 'totalSinaisValidos' | 'ultimoSinal'>

/**
 * O foguinho de cada Conta com Sinal, ou nulo quando a leitura falha: as Contas aparecem sem ele em vez de a lista falhar.
 * A Conta sem nenhum Sinal não está no mapa.
 */
export async function lerSinaisDasContas(cliente: SupabaseClient, workspaceId: string): Promise<Map<string, FoguinhoDaConta> | null> {
  const { data, error } = await cliente.rpc('list_account_signals', { p_workspace_id: workspaceId })
  if (error) return null
  const linhas = (data ?? []) as {
    target_account_id: string
    valid_signals: number
    hot: boolean
    last_phrase: string | null
    last_fired_at: string | null
  }[]
  return new Map(linhas.map((l) => [
    l.target_account_id,
    {
      quente: l.hot === true,
      totalSinaisValidos: l.valid_signals,
      ...(l.last_phrase && l.last_fired_at
        ? { ultimoSinal: { id: `ultimo:${l.target_account_id}`, contaId: l.target_account_id, frase: l.last_phrase, data: l.last_fired_at } }
        : {}),
    },
  ]))
}

/**
 * Os Sinais de uma Conta, do mais novo ao mais antigo, para o detalhe da Conta. A Conta sem Sinal devolve a lista vazia;
 * uma leitura que falha é uma falha, e não "nenhum Sinal".
 */
export async function lerSinaisDaConta(cliente: SupabaseClient, workspaceId: string, contaId: string): Promise<Sinal[]> {
  const { data, error } = await cliente.rpc('list_signals', { p_workspace_id: workspaceId, p_target_account_id: contaId })
  if (error) throw new Error('Não foi possível carregar os Sinais da Conta.')
  return ((data ?? []) as RegistroDoSinal[]).map((s) => {
    const tipoId = tipoDaTela(s.signal_type, new Set())
    const reencontradoPor = s.seen_again_monitor_id ?? s.monitor_id
    return {
      id: s.id,
      contaId: s.target_account_id,
      acontecimentoId: s.event_key,
      ...(tipoId ? { tipoId } : {}),
      ...(s.monitor_id ? { monitoramentoId: s.monitor_id } : {}),
      frase: s.phrase,
      data: s.fired_at,
      ...(s.source ? { fonte: s.source } : {}),
      ...(s.evidence ? { evidencia: s.evidence } : {}),
      ...(s.seen_again_at
        ? { reencontrado: { data: s.seen_again_at, ...(reencontradoPor ? { monitoramentoId: reencontradoPor } : {}) } }
        : {}),
    }
  })
}

/** O id da tela para um `signal_type`: o card visível, o tipo conhecido, ou a cascata. */
function tipoDaTela(signalType: string, tiposDeCascata: ReadonlySet<string>): string | null {
  // A cascata gravada como Monitoramento continua com o próprio tipo. O card que a reúne é só a vitrine.
  if (tiposDeCascata.has(signalType)) return signalType
  const direto = TIPO_DO_SINAL_REAL[signalType]
  if (direto) {
    const card = cardQueConta(direto)
    if (card && card.id !== direto) return card.id
    return direto
  }
  return CATALOGO_VISIVEL.find((card) => card.coletores.includes(signalType))?.id ?? null
}

/** A Agenda guardada no banco como a tela a lê; o que não tem a forma esperada vale como "sem Agenda". */
function agendaDoRegistro(schedule: RegistroDoMonitor['schedule']): AgendaDoSinal | null {
  if (!schedule || !Array.isArray(schedule.horarios) || !Array.isArray(schedule.dias)) return null
  if (!schedule.horarios.every((h) => typeof h === 'string') || !schedule.dias.every((d) => typeof d === 'number')) return null
  return { horarios: [...schedule.horarios as string[]], dias: [...schedule.dias as number[]] }
}

function mapearMonitor(linha: RegistroDoMonitor, tiposDeCascata: ReadonlySet<string>): Monitoramento | null {
  const tipoId = tipoDaTela(linha.signal_type, tiposDeCascata)
  if (!tipoId) return null
  const agenda = agendaDoRegistro(linha.schedule)
  return {
    id: linha.id,
    tipoId,
    nome: linha.name,
    estado: linha.state,
    publico: {
      modo: 'listas',
      listas: linha.audience?.accountIds ?? [],
      usaRecomendado: false,
      ...(linha.audience?.escopo === 'mercado' ? { escopo: 'mercado' as const } : {}),
    },
    criterios: linha.criteria ?? {},
    // O Briefing só aparece com o Plano: depois de o editor mudar o que roda, o Plano antigo deixa de valer.
    ...(linha.plan ? { plano: linha.plan, versaoDoPlano: linha.plan_version ?? 1, ...(linha.brief ? { briefing: linha.brief } : {}) } : {}),
    ...(agenda ? { agenda } : {}),
    ...(typeof linha.daily_credit_cap === 'number' ? { limitePorDia: linha.daily_credit_cap } : {}),
    ...(linha.state === 'pausado' && linha.paused_reason === 'sem_creditos' ? { pausadoPor: 'sem_creditos' as const } : {}),
    ...(typeof linha.consecutive_skips === 'number' && linha.consecutive_skips > 0 ? { rodadasPuladas: linha.consecutive_skips } : {}),
    ...(linha.last_error ? { ultimaFalha: linha.last_error } : {}),
    ...(linha.last_run
      ? {
          ultimaRodada: {
            estado: linha.last_run.state,
            data: linha.last_run.finishedAt ?? linha.last_run.startedAt,
            contasAvaliadas: linha.last_run.accountsChecked,
            sinaisNovos: linha.last_run.signalsNew,
            sinaisReencontrados: linha.last_run.signalsRepeated,
          },
        }
      : {}),
  }
}

export function criarFonteDeSinaisSupabase(cliente: SupabaseClient, workspaceId: () => string): FonteDeSinais {
  const ouvintes = new Set<() => void>()
  const notificar = () => ouvintes.forEach((ouvinte) => ouvinte())

  async function tiposDeCascata(): Promise<Set<string>> {
    const { data, error } = await cliente.rpc('list_cascade_catalog')
    if (error) return new Set()
    return new Set(((data ?? []) as RegistroDaCascata[]).map((c) => c.signal_type))
  }

  async function monitoramentos(): Promise<Monitoramento[]> {
    const [{ data, error }, tipos] = await Promise.all([
      cliente.rpc('list_signal_monitors', { p_workspace_id: workspaceId() }),
      tiposDeCascata(),
    ])
    if (error) throw new Error('Não foi possível carregar os Monitoramentos.')
    return ((data ?? []) as RegistroDoMonitor[]).map((linha) => mapearMonitor(linha, tipos)).filter((m): m is Monitoramento => m !== null)
  }

  async function monitoramento(id: string): Promise<Monitoramento> {
    const encontrado = (await monitoramentos()).find((m) => m.id === id)
    if (!encontrado) throw new Error('Monitoramento não encontrado.')
    return encontrado
  }

  async function chamar(nome: string, parametros: Record<string, unknown>) {
    const { data, error } = await cliente.rpc(nome, parametros)
    if (error) throw converterErro(error)
    notificar()
    return data
  }

  return {
    observar(ouvinte) {
      ouvintes.add(ouvinte)
      return () => ouvintes.delete(ouvinte)
    },
    hoje: () => new Date(),

    async tipos(): Promise<TipoDeSinal[]> {
      // A disponibilidade é um enfeite do catálogo: se o registro não puder ser lido, todos ficam "em breve".
      const estados = await estadosDosSinaisReais(cliente)
      return TIPOS.map((tipo) => {
        const estado = estados.get(SINAL_DO_TIPO[tipo.id] ?? '')
        const disponibilidade: Disponibilidade = estado === 'available' ? 'disponivel' : estado === 'testing' ? 'em-teste' : 'em-breve'
        return { ...tipo, disponibilidade }
      })
    },
    async cascatas(): Promise<CascataDoCatalogo[]> {
      const { data, error } = await cliente.rpc('list_cascade_catalog')
      if (error) throw new Error('Não foi possível carregar os Sinais por mercado.')
      return ((data ?? []) as RegistroDaCascata[]).flatMap((c) => {
        const estado = ESTADO_DA_CASCATA[c.state]
        if (!estado) return []
        return [{
          tipo: c.signal_type,
          icp: c.icp,
          nome: c.name,
          estado,
          escopo: c.scope === 'mercado' ? 'mercado' : 'conta',
          ...(estado === 'sem-fonte' && c.sem_fonte_motivo ? { motivo: c.sem_fonte_motivo } : {}),
        }]
      })
    },
    async sinaisDeMercado(icp): Promise<SinalDeMercado[]> {
      const { data, error } = await cliente.rpc('list_market_signals_for_workspace_icp', {
        p_workspace_id: workspaceId(),
        p_icp: icp,
      })
      if (error) throw new Error('Não foi possível carregar os Sinais de mercado.')
      const sinais = ((data ?? []) as { id: string; signal_type: string; name: string; phrase: string; fired_at: string }[]).map((s) => ({
        id: s.id,
        tipo: s.signal_type,
        nome: s.name,
        frase: s.phrase,
        data: s.fired_at,
      }))
      // O vínculo com a empresa é um extra: se a leitura dele falhar, a lista de Mercado aparece como sempre.
      const vinculos = new Map<string, { tipo: 'conta' | 'candidata'; id: string }>()
      try {
        const { data: ligacoes, error: erroDeLigacao } = await cliente.rpc('list_market_signal_companies', {
          p_workspace_id: workspaceId(),
          p_icp: icp,
        })
        if (!erroDeLigacao) {
          for (const l of (ligacoes ?? []) as { market_signal_id: string; target_account_id: string | null; discovered_account_id: string | null }[]) {
            if (l.target_account_id) vinculos.set(l.market_signal_id, { tipo: 'conta', id: l.target_account_id })
            else if (l.discovered_account_id) vinculos.set(l.market_signal_id, { tipo: 'candidata', id: l.discovered_account_id })
          }
        }
      } catch {
        // sem vínculo
      }
      return sinais.map((s) => (vinculos.has(s.id) ? { ...s, empresa: vinculos.get(s.id)! } : s))
    },

    async sinaisDeCandidatas(): Promise<SinalDeCandidata[]> {
      const { data, error } = await cliente.rpc('list_candidate_signals', { p_workspace_id: workspaceId() })
      if (error) throw new Error('Não foi possível carregar os Sinais das candidatas.')
      return ((data ?? []) as RegistroDoSinalDeCandidata[]).map((s) => ({
        id: s.id,
        candidataId: s.discovered_account_id,
        empresa: s.company_name,
        // Um tipo que a tela não reconhece aparece como "Sinal": a candidata não pode sumir por isso.
        tipoId: tipoDaTela(s.signal_type, new Set()) ?? s.signal_type,
        frase: s.phrase,
        data: s.fired_at,
        fonte: s.source ?? '',
      }))
    },
    async tipo(id) {
      const encontrado = (await this.tipos()).find((t) => t.id === id)
      if (!encontrado) throw new Error(`Tipo de Sinal "${id}" não encontrado`)
      return encontrado
    },

    monitoramentos,
    async monitoramentosDoTipo(tipoId) {
      return (await monitoramentos()).filter((m) => m.tipoId === tipoId)
    },
    monitoramento,

    async salvarMonitoramento(m: Monitoramento | NovoMonitoramento) {
      let sinal = SINAL_DO_TIPO[m.tipoId]
      if (!sinal) {
        // Catálogo ausente e cascata fora de `available` caem na mesma frase: o tipo não vira Monitoramento.
        let disponivel = false
        try {
          disponivel = (await this.cascatas()).some((c) => c.tipo === m.tipoId && c.estado === 'disponivel')
        } catch {
          disponivel = false
        }
        if (!disponivel) throw new Error('Este Sinal ainda não está disponível.')
        sinal = m.tipoId
      }
      const id = (await chamar('save_signal_monitor', {
        p_workspace_id: workspaceId(),
        p_id: m.id ?? null,
        p_signal_type: sinal,
        p_name: m.nome,
        p_state: m.estado ?? 'rascunho',
        // No mercado endereçável não há Conta-alvo escolhida; no modo Contas-alvo, o público é o de sempre.
        p_audience: m.publico?.escopo === 'mercado' ? { escopo: 'mercado', accountIds: [] } : { accountIds: m.publico?.listas ?? [] },
        p_criteria: m.criterios ?? {},
        p_every_hours: 24,
      })) as string
      return monitoramento(id)
    },
    async mudarEstado(id, estado) {
      await chamar('set_signal_monitor_state', { p_id: id, p_state: estado })
      return monitoramento(id)
    },
    async excluirMonitoramento(id) {
      await chamar('delete_signal_monitor', { p_id: id })
    },

    async sinaisEncontrados(): Promise<SinalEncontrado[]> {
      const { data, error } = await cliente.rpc('list_signals', { p_workspace_id: workspaceId() })
      if (error) throw new Error('Não foi possível carregar os Sinais.')
      return ((data ?? []) as RegistroDoSinal[]).flatMap((s) => {
        const tipoId = tipoDaTela(s.signal_type, new Set())
        if (!tipoId) return []
        return [{
          id: s.id,
          contaId: s.target_account_id,
          acontecimentoId: s.event_key,
          tipoId,
          monitoramentoId: s.monitor_id ?? '',
          frase: s.phrase,
          data: s.fired_at,
          fonte: s.source ?? '',
          evidencia: s.evidence ?? '',
          ...(s.seen_again_at
            ? { reencontrado: { data: s.seen_again_at, monitoramentoId: s.seen_again_monitor_id ?? s.monitor_id ?? '' } }
            : {}),
        }]
      })
    },

    simularDisparo: () => Promise.reject(new Error('O disparo simulado existe só na Demonstração.')),

    async pedidosDeSinal(): Promise<PedidoDeSinal[]> {
      const { data, error } = await cliente.rpc('list_signal_requests', { p_workspace_id: workspaceId() })
      if (error) throw new Error('Não foi possível carregar os pedidos de Sinal.')
      return ((data ?? []) as RegistroDoPedido[]).map(mapearPedido)
    },

    async pedirSinal(pedido: NovoPedidoDeSinal): Promise<PedidoDeSinal> {
      const id = (await chamar('request_signal', {
        p_workspace_id: workspaceId(),
        p_evento: pedido.evento,
        p_empresas_ou_nicho: pedido.empresasOuNicho,
        p_fontes_conhecidas: pedido.fontesConhecidas ?? null,
        p_urgencia: pedido.urgencia,
        p_contato: pedido.contato,
      })) as string
      try {
        const aviso = await cliente.functions.invoke('signal-request-notify', {
          body: { workspaceId: workspaceId(), requestId: id },
        })
        // O pedido já está gravado mesmo se o aviso à equipe não sair.
        void aviso.error
      } catch {
        // O pedido já está gravado. O aviso à equipe pode sair depois.
      }
      const salvos = await this.pedidosDeSinal().catch(() => [])
      const salvo = salvos.find((item) => item.id === id)
      if (salvo) return salvo
      return {
        id,
        evento: pedido.evento.trim(),
        empresasOuNicho: pedido.empresasOuNicho.trim(),
        ...(pedido.fontesConhecidas?.trim() ? { fontesConhecidas: pedido.fontesConhecidas.trim() } : {}),
        urgencia: pedido.urgencia,
        contato: pedido.contato,
        status: 'novo',
        criadoEm: new Date().toISOString(),
      }
    },

    estadosDosColetores: () => estadosDosColetores(cliente),

    async montarPlano(pedido: PedidoDePlano): Promise<PlanoMontado> {
      const { data, error } = await cliente.functions.invoke('signal-plan', {
        body: { workspaceId: workspaceId(), briefing: pedido.briefing, escopo: { tipo: 'contas', contaIds: pedido.contaIds } },
      })
      if (error) throw await erroDoPlano(error)
      const resposta = data as { plano?: PlanoDoSinal; avisos?: unknown } | null
      if (!resposta?.plano || !Array.isArray(resposta.plano.sinais) || resposta.plano.sinais.length === 0) {
        throw new ErroDoPlano('falha', MENSAGEM_DA_FALHA_DO_PLANO)
      }
      return { plano: resposta.plano, avisos: Array.isArray(resposta.avisos) ? resposta.avisos.filter((a): a is string => typeof a === 'string') : [] }
    },

    async salvarPlano(plano: PlanoParaSalvar): Promise<Monitoramento> {
      const id = (await chamar('save_signal_plan', {
        p_workspace_id: workspaceId(),
        p_monitor_id: plano.id ?? null,
        p_name: plano.nome,
        p_brief: plano.briefing,
        p_plan: plano.plano,
      })) as string
      return monitoramento(id)
    },

    async previaDaRodada(monitoramentoId): Promise<PreviaDaRodada> {
      const { data, error } = await cliente.rpc('quote_signal_run', { p_workspace_id: workspaceId(), p_monitor_id: monitoramentoId })
      if (error) throw converterErro(error)
      const [linha] = (Array.isArray(data) ? data : [data]) as (RegistroDaPrevia | null)[]
      if (!linha) throw new Error(MENSAGEM_DA_FALHA_DA_RODADA)
      const bloqueio = BLOQUEIOS_DA_RODADA.find((b) => b === linha.bloqueio) ?? null
      return {
        contas: Number(linha.contas),
        contasSemDado: Number(linha.contas_sem_dado),
        creditosPorConta: Number(linha.creditos_por_conta),
        ateCreditos: Number(linha.ate_creditos),
        saldo: Number(linha.saldo),
        ilimitado: linha.ilimitado === true,
        bloqueio,
        ...(linha.liberado_em ? { liberadoEm: linha.liberado_em } : {}),
      }
    },

    async salvarAgenda(monitoramentoId, agenda): Promise<Monitoramento> {
      await chamar('save_signal_schedule', {
        p_workspace_id: workspaceId(),
        p_monitor_id: monitoramentoId,
        p_schedule: { horarios: agenda.horarios, dias: agenda.dias, fuso: FUSO_DA_AGENDA },
      })
      return monitoramento(monitoramentoId)
    },

    async proximasRodadas(agenda, contas, n): Promise<string[]> {
      const { data, error } = await cliente.rpc('preview_signal_schedule', {
        p_schedule: { horarios: agenda.horarios, dias: agenda.dias, fuso: FUSO_DA_AGENDA },
        p_n: n,
        p_accounts: contas,
      })
      if (error) {
        const convertido = converterErro(error)
        throw convertido instanceof ErroDaAgenda ? convertido : new Error(MENSAGEM_DA_FALHA_DA_AGENDA)
      }
      return ((data ?? []) as string[]).map((instante) => new Date(instante).toISOString())
    },

    async estimarAgenda(monitoramentoId, agenda): Promise<EstimativaDoSinal> {
      const { data, error } = await cliente.rpc('quote_signal_schedule', {
        p_workspace_id: workspaceId(),
        p_monitor_id: monitoramentoId,
        p_schedule: agenda ? { horarios: agenda.horarios, dias: agenda.dias, fuso: FUSO_DA_AGENDA } : null,
      })
      if (error) {
        const convertido = converterErro(error)
        throw convertido instanceof ErroDaAgenda ? convertido : new Error(MENSAGEM_DA_FALHA_DA_ESTIMATIVA)
      }
      const [linha] = (Array.isArray(data) ? data : [data]) as (RegistroDaEstimativa | null)[]
      if (!linha) throw new Error(MENSAGEM_DA_FALHA_DA_ESTIMATIVA)
      return {
        porRodada: Number(linha.por_rodada),
        rodadasPorSemana: Number(linha.rodadas_por_semana),
        porDia: Number(linha.por_dia),
        porMesAprox: Number(linha.por_mes_aprox),
        saldo: Number(linha.saldo),
        ilimitado: linha.ilimitado === true,
        diasDeSaldo: linha.dias_de_saldo === null || linha.dias_de_saldo === undefined ? null : Number(linha.dias_de_saldo),
        avisoDeRepeticao: linha.aviso_repeticao === true,
        limiteSugeridoPorDia: Number(linha.teto_diario_sugerido),
        bloqueio: BLOQUEIOS_DA_ATIVACAO.find((b) => b === linha.bloqueio_ativacao) ?? null,
      }
    },

    async salvarLimitePorDia(monitoramentoId, limite): Promise<Monitoramento> {
      const { error } = await cliente.rpc('save_signal_daily_cap', {
        p_workspace_id: workspaceId(),
        p_monitor_id: monitoramentoId,
        p_cap: limite,
      })
      if (error) {
        const convertido = converterErro(error)
        throw convertido instanceof ErroDoLimite ? convertido : new Error(MENSAGEM_DA_FALHA_DO_LIMITE)
      }
      notificar()
      return monitoramento(monitoramentoId)
    },

    async limiteMensalSugerido(monitoramentoId, agenda): Promise<number> {
      const { data, error } = await cliente.rpc('suggest_signal_monthly_cap', {
        p_workspace_id: workspaceId(),
        p_monitor_id: monitoramentoId,
        p_schedule: agenda ? { horarios: agenda.horarios, dias: agenda.dias, fuso: FUSO_DA_AGENDA } : null,
      })
      if (error) {
        const convertido = converterErro(error)
        throw convertido instanceof ErroDaAgenda ? convertido : new Error(MENSAGEM_DA_FALHA_DA_AUTOMACAO)
      }
      const valor = Number(data)
      if (!Number.isInteger(valor) || valor < 1) throw new Error(MENSAGEM_DA_FALHA_DA_AUTOMACAO)
      return valor
    },

    async liberarAutomacao(monitoramentoId, limiteMensal): Promise<void> {
      const { error } = await cliente.rpc('enable_signal_automation', {
        p_workspace_id: workspaceId(),
        p_monitor_id: monitoramentoId,
        p_monthly_limit: limiteMensal,
      })
      if (error) {
        const convertido = converterErro(error)
        throw convertido instanceof ErroDaAutomacao ? convertido : new Error(MENSAGEM_DA_FALHA_DA_AUTOMACAO)
      }
      notificar()
    },

    async rodarAgora(monitoramentoId): Promise<void> {
      await chamar('request_signal_run_now', { p_workspace_id: workspaceId(), p_monitor_id: monitoramentoId })
    },

    async rodadas(monitoramentoId): Promise<HistoricoDeRodadas> {
      const { data, error } = await cliente.rpc('list_signal_runs', { p_workspace_id: workspaceId(), p_monitor_id: monitoramentoId })
      if (error) throw new Error('Não foi possível carregar as rodadas.')
      const historico = (data ?? { rodadas: [], solicitacoes: [] }) as RegistroDoHistorico
      return {
        rodadas: (historico.rodadas ?? []).map((r) => ({
          id: r.id,
          origem: r.origem,
          estado: r.estado,
          iniciadaEm: r.iniciadaEm,
          terminouEm: r.terminouEm ?? null,
          horarioMarcado: r.horarioMarcado ?? null,
          contasNoEscopo: r.contasNoEscopo ?? null,
          contasVerificadas: r.contasVerificadas,
          contasSemDado: r.contasSemDado,
          sinaisNovos: r.sinaisNovos,
          sinaisRepetidos: r.sinaisRepetidos,
          creditos: r.creditos,
          motivoDaParada: r.motivoDaParada ?? null,
          versaoDoPlano: r.versaoDoPlano ?? null,
          observacao: r.observacao ?? null,
        })),
        pedidos: (historico.solicitacoes ?? []).map((p) => ({
          id: p.id,
          estado: p.estado,
          pedidoEm: p.pedidaEm,
          ateCreditos: p.ateCreditos,
          rodadaId: p.rodadaId ?? null,
        })),
      }
    },

    async achadosDaRodada(rodadaId): Promise<AchadoDaRodada[]> {
      const { data, error } = await cliente.rpc('list_signal_run_findings', { p_workspace_id: workspaceId(), p_run_id: rodadaId })
      if (error) throw new Error('Não foi possível carregar os Sinais da rodada.')
      return ((data ?? []) as RegistroDoAchado[]).map((a) => ({
        id: a.signal_id,
        contaId: a.target_account_id,
        contaNome: a.account_name,
        tipo: a.signal_type,
        frase: a.phrase,
        data: a.fired_at,
        fonte: a.source,
        evidencia: a.evidence,
        situacao: a.kind === 'novo' ? 'novo' : 'visto_de_novo',
        porQue: a.why,
      }))
    },

    souDaEquipeAlthius: () => viewerEhDaEquipeAlthius(cliente),

    async catalogoDoWorkspace(): Promise<CardSobPedido[]> {
      try {
        const { data, error } = await cliente.rpc('list_visible_signal_catalog', { p_workspace_id: workspaceId() })
        if (error || !data) return []
        return ((data ?? []) as RegistroDoCatalogo[])
          .filter((linha) => linha.workspace_id)
          .map((linha) => ({
            id: linha.id,
            nome: linha.name,
            frase: linha.phrase,
            familiaId: linha.family,
            fonte: linha.source_label,
            custoRotulo: linha.estimated_cost_label,
            creditosPorConta: linha.credits_per_account,
            nichos: linha.niche_slugs ?? [],
            coletores: linha.collector_types ?? [],
          }))
      } catch {
        return []
      }
    },
  }
}

interface RegistroDoPedido {
  id: string
  evento: string
  empresas_ou_nicho: string
  fontes_conhecidas: string | null
  urgencia: UrgenciaDoPedido
  contato: { nome?: string; email?: string; whatsapp?: string }
  status: StatusDoPedido
  created_at: string
}

function mapearPedido(linha: RegistroDoPedido): PedidoDeSinal {
  return {
    id: linha.id,
    evento: linha.evento,
    empresasOuNicho: linha.empresas_ou_nicho,
    ...(linha.fontes_conhecidas ? { fontesConhecidas: linha.fontes_conhecidas } : {}),
    urgencia: linha.urgencia,
    contato: {
      nome: linha.contato?.nome ?? '',
      email: linha.contato?.email ?? '',
      ...(linha.contato?.whatsapp ? { whatsapp: linha.contato.whatsapp } : {}),
    },
    status: linha.status,
    criadoEm: linha.created_at,
  }
}

interface RegistroDoSinalDeCandidata {
  id: string
  discovered_account_id: string
  company_name: string
  signal_type: string
  phrase: string
  fired_at: string
  source: string | null
}

interface RegistroDoCatalogo {
  id: string
  name: string
  phrase: string
  family: string
  source_label: string
  estimated_cost_label: string
  credits_per_account: number
  niche_slugs: string[] | null
  collector_types: string[] | null
  workspace_id: string | null
}

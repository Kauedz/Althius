// Sinais e Monitoramentos do Workspace operacional (sinais-reais, ticket 02): os Monitoramentos e os Sinais vêm do banco,
// o catálogo de tipos é o da tela, com a disponibilidade de cada um lida do registro de actors (os externos) e do catálogo
// do banco (os internos, que saem das Interações, CRM-10). Um tipo sem Sinal real, ou cujo actor ainda está em teste,
// recusa o Monitoramento em palavras do produto. Disparo simulado só existe na Demonstração.
import type { SupabaseClient } from '@supabase/supabase-js'
import { TIPOS } from '@/paginas/sinais/catalogo'
import { CATALOGO_VISIVEL, cardQueConta } from '@/paginas/sinais/catalogo-visivel'
import { SINAL_DO_TIPO, TIPO_DO_SINAL_REAL } from './sinais-reais-mapa'
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
  audience: { accountIds?: string[] } | null
  criteria: Record<string, unknown> | null
  last_error: string | null
  last_run?: {
    state: 'rodando' | 'concluida' | 'falhou'
    startedAt: string
    finishedAt: string | null
    accountsChecked: number
    signalsNew: number
    signalsRepeated: number
  } | null
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

function converterErro(error: { message: string; code?: string }): Error {
  if (error.message.includes('signal type is not available')) {
    return new Error('Este Sinal ainda está em teste e não roda de verdade.')
  }
  if (error.message.includes('an active monitor needs at least one target account')) {
    return new Error('Escolha ao menos uma Conta-alvo para ativar o Monitoramento.')
  }
  if (error.message.includes('only the creator or an administrator')) {
    return new Error('Só quem criou o Monitoramento, ou um Administrador, pode mudá-lo.')
  }
  if (error.message.includes('invalid monitor')) {
    return new Error('O Monitoramento tem um nome, um público ou critérios inválidos.')
  }
  return new Error('Não foi possível concluir. Tente de novo.')
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

function mapearMonitor(linha: RegistroDoMonitor, tiposDeCascata: ReadonlySet<string>): Monitoramento | null {
  const tipoId = tipoDaTela(linha.signal_type, tiposDeCascata)
  if (!tipoId) return null
  return {
    id: linha.id,
    tipoId,
    nome: linha.name,
    estado: linha.state,
    publico: { modo: 'listas', listas: linha.audience?.accountIds ?? [], usaRecomendado: false },
    criterios: linha.criteria ?? {},
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
        p_audience: { accountIds: m.publico?.listas ?? [] },
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

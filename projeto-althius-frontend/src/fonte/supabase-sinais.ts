// Sinais e Monitoramentos do Workspace operacional (sinais-reais, ticket 02): os Monitoramentos e os Sinais vêm do banco,
// o catálogo de tipos é o da tela, com a disponibilidade de cada um lida do registro de actors. Um tipo sem Sinal real, ou
// cujo actor ainda está em teste, recusa o Monitoramento em palavras do produto. Disparo simulado só existe na
// Demonstração.
import type { SupabaseClient } from '@supabase/supabase-js'
import { TIPOS } from '@/paginas/sinais/catalogo'
import { SINAL_REAL_DO_TIPO, TIPO_DO_SINAL_REAL } from './sinais-reais-mapa'
import type {
  Disponibilidade,
  EstadoDoMonitoramento,
  FonteDeSinais,
  Monitoramento,
  NovoMonitoramento,
  SinalEncontrado,
  TipoDeSinal,
} from './sinais-tipos'

interface RegistroDoMonitor {
  id: string
  signal_type: string
  name: string
  state: EstadoDoMonitoramento
  audience: { accountIds?: string[] } | null
  criteria: Record<string, unknown> | null
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

function mapearMonitor(linha: RegistroDoMonitor): Monitoramento | null {
  const tipoId = TIPO_DO_SINAL_REAL[linha.signal_type]
  if (!tipoId) return null
  return {
    id: linha.id,
    tipoId,
    nome: linha.name,
    estado: linha.state,
    publico: { modo: 'listas', listas: linha.audience?.accountIds ?? [], usaRecomendado: false },
    criterios: linha.criteria ?? {},
  }
}

export function criarFonteDeSinaisSupabase(cliente: SupabaseClient, workspaceId: () => string): FonteDeSinais {
  const ouvintes = new Set<() => void>()
  const notificar = () => ouvintes.forEach((ouvinte) => ouvinte())

  async function monitoramentos(): Promise<Monitoramento[]> {
    const { data, error } = await cliente.rpc('list_signal_monitors', { p_workspace_id: workspaceId() })
    if (error) throw new Error('Não foi possível carregar os Monitoramentos.')
    return ((data ?? []) as RegistroDoMonitor[]).map(mapearMonitor).filter((m): m is Monitoramento => m !== null)
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
      const { data } = await cliente.rpc('list_signal_actors')
      const estados = new Map(((data ?? []) as { signal_type: string; state: string }[]).map((l) => [l.signal_type, l.state]))
      return TIPOS.map((tipo) => {
        const estado = estados.get(SINAL_REAL_DO_TIPO[tipo.id] ?? '')
        const disponibilidade: Disponibilidade = estado === 'available' ? 'disponivel' : estado === 'testing' ? 'em-teste' : 'em-breve'
        return { ...tipo, disponibilidade }
      })
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
      const sinal = SINAL_REAL_DO_TIPO[m.tipoId]
      if (!sinal) throw new Error('Este Sinal ainda não está disponível.')
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
        const tipoId = TIPO_DO_SINAL_REAL[s.signal_type]
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
          ...(s.seen_again_at ? { reencontrado: { data: s.seen_again_at, monitoramentoId: s.monitor_id ?? '' } } : {}),
        }]
      })
    },

    simularDisparo: () => Promise.reject(new Error('O disparo simulado existe só na Demonstração.')),
  }
}

import { explicarAderencia, type ExplicacaoDeAderencia } from './aderencia-explicada'
import type { AjusteAprendido, CodigoDoDescarte, DimensaoAprendida } from './aprendizado-da-descoberta'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ContaDescoberta,
  CotacaoDaDescoberta,
  EstadoContaDescoberta,
  FonteDeDescobertas,
  NivelDeEncaixe,
  OrigemDaDescoberta,
  ResultadoDoAceite,
  SinalDaCandidata,
  SinalDoMotivo,
  SituacaoDoComite,
  CriteriosDaBusca,
  DesfechoDaBusca,
  PreparacaoDaBusca,
  UltimaBuscaDeContas,
} from './descobertas-tipos'
import { ErroDaBuscaDeContas } from './descobertas-tipos'

/** A recusa da Edge Function com a mensagem e o código que ela devolveu no corpo, quando há. */
async function erroDaFuncao(error: { message: string; context?: { json(): Promise<unknown> } }): Promise<ErroDaBuscaDeContas> {
  let mensagem = error.message
  let codigo: string | undefined
  if (error.context) {
    try {
      const corpo = (await error.context.json()) as { error?: unknown; code?: unknown } | null
      if (typeof corpo?.error === 'string') mensagem = corpo.error
      if (typeof corpo?.code === 'string') codigo = corpo.code
    } catch { /* mantém a mensagem genérica */ }
  }
  return new ErroDaBuscaDeContas(mensagem, codigo)
}

/**
 * O desfecho de uma busca pelo estado gravado: sem empresa não é falha, e falha não é mercado vazio. Uma busca que
 * fechou com parte da fonte falhando e nenhuma empresa conta como falha da fonte: não dá para dizer que o recorte é vazio.
 */
function desfechoDa(linha: { state: string; found: number | null; last_error: string | null }): DesfechoDaBusca {
  if (linha.state === 'em_andamento') return 'em_andamento'
  if (linha.state === 'falhou') return 'falha_da_fonte'
  if (Number(linha.found ?? 0) > 0) return 'com_resultados'
  return linha.last_error ? 'falha_da_fonte' : 'sem_resultados'
}

export function criarFonteDeDescobertasSupabase(
  cliente: SupabaseClient,
  obterWorkspaceId: () => string,
): FonteDeDescobertas {
  const ouvintes = new Set<() => void>()
  const notificar = () => ouvintes.forEach((o) => o())

  return {
    async cotarBusca(maxResults = 50): Promise<CotacaoDaDescoberta> {
      const workspaceId = obterWorkspaceId()
      const { data, error } = await cliente.rpc('quote_account_discovery', {
        p_workspace_id: workspaceId,
        p_max_results: maxResults,
      })
      if (error) throw new Error(error.message)
      const linha = Array.isArray(data) ? data[0] : data
      if (!linha) {
        return {
          creditos: 5,
          saldoDisponivel: 0,
          emAndamento: false,
          estadoDoActor: 'none',
          podeTestar: false,
        }
      }
      return {
        creditos: Number(linha.credits ?? 5),
        saldoDisponivel: Number(linha.available ?? 0),
        emAndamento: Boolean(linha.in_progress),
        estadoDoActor: linha.actor_state as 'available' | 'testing' | 'none',
        podeTestar: Boolean(linha.can_test),
      }
    },

    async buscarContas(args): Promise<void> {
      const workspaceId = obterWorkspaceId()
      const maxResults = args.maxResults ?? 50
      const requestKey = `busca-manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

      const { error } = await cliente.functions.invoke('account-discovery', {
        body: {
          action: 'search',
          workspaceId,
          requestKey,
          maxResults,
          criteria: args.criterios,
          icpVersion: args.icpVersion,
          allowTesting: args.allowTesting ?? false,
        },
      })
      if (error) {
        let mensagem = error.message
        if (error.context) {
          try {
            const corpo = await error.context.json()
            if (typeof corpo?.error === 'string') mensagem = corpo.error
          } catch { /* mantém a mensagem genérica */ }
        }
        throw new Error(mensagem)
      }
      notificar()
    },

    async prepararBusca(): Promise<PreparacaoDaBusca> {
      const { data, error } = await cliente.functions.invoke('account-discovery', {
        body: { action: 'prepare', workspaceId: obterWorkspaceId() },
      })
      if (error) throw await erroDaFuncao(error)
      return data as PreparacaoDaBusca
    },

    async buscarPorPerfis(args): Promise<void> {
      const { error } = await cliente.functions.invoke('account-discovery', {
        body: {
          action: 'search',
          workspaceId: obterWorkspaceId(),
          requestKey: `busca-contexto-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          maxResults: args.maxResults ?? 50,
          perfis: args.perfis,
          contextoVersao: args.contextoVersao,
          allowTesting: args.allowTesting ?? false,
        },
      })
      if (error) throw await erroDaFuncao(error)
      notificar()
    },

    async ultimaBusca(): Promise<UltimaBuscaDeContas | null> {
      const { data, error } = await cliente.rpc('list_discovery_runs', { p_workspace_id: obterWorkspaceId(), p_kind: 'contas', p_limit: 5 })
      if (error) throw new Error(error.message)
      // Um pedido de Agente ainda sem confirmação, ou cancelado, não é uma busca que rodou.
      const linha = ((data ?? []) as { state: string; found: number | null; added: number | null; last_error: string | null; criteria: unknown }[])
        .find((l) => ['em_andamento', 'concluida', 'falhou'].includes(l.state))
      if (!linha) return null
      const registro = (linha.criteria ?? {}) as { origem?: unknown; contexto?: { versao?: unknown }; perfis?: unknown }
      const doContexto = registro.origem === 'contexto_da_empresa'
      return {
        desfecho: desfechoDa(linha),
        encontradas: Number(linha.found ?? 0),
        novas: Number(linha.added ?? 0),
        ...(linha.last_error ? { mensagem: linha.last_error } : {}),
        contextoVersao: doContexto && typeof registro.contexto?.versao === 'number' ? registro.contexto.versao : null,
        perfis: doContexto && Array.isArray(registro.perfis)
          ? registro.perfis.flatMap((p) => (typeof (p as { nome?: unknown })?.nome === 'string' ? [(p as { nome: string }).nome] : []))
          : [],
      }
    },

    async criteriosDaBusca() {
      const workspaceId = obterWorkspaceId()
      const { data, error } = await cliente.functions.invoke('account-discovery', {
        body: { action: 'criteria', workspaceId },
      })
      if (error) {
        let mensagem = error.message
        if (error.context) {
          try { const corpo = await error.context.json(); if (typeof corpo?.error === 'string') mensagem = corpo.error } catch { /* mantém */ }
        }
        throw new Error(mensagem)
      }
      return { temIcp: Boolean(data?.temIcp), icpVersion: data?.icpVersion ?? null, icpResumo: data?.icpResumo ?? '', criterios: data?.criteria as CriteriosDaBusca }
    },

    async listarDescobertas(estado = 'nova'): Promise<ContaDescoberta[]> {
      const workspaceId = obterWorkspaceId()
      const { data, error } = await cliente.rpc('list_discovered_accounts', {
        p_workspace_id: workspaceId,
        p_state: estado,
        p_limit: 200,
      })
      if (error) throw new Error(error.message)
      const linhas = (data ?? []) as any[]
      return linhas.map((d): ContaDescoberta => ({
        id: d.id,
        runId: d.run_id,
        state: d.state as EstadoContaDescoberta,
        nome: d.name,
        website: d.website ?? undefined,
        dominio: d.domain ?? undefined,
        cnpj: d.cnpj ?? undefined,
        linkedinUrl: d.linkedin_url ?? undefined,
        localizacao: d.location ?? undefined,
        uf: d.uf ?? undefined,
        setor: d.sector ?? undefined,
        tamanho: d.size_label ?? undefined,
        funcionarios: d.employee_count ?? undefined,
        descricao: d.description ?? undefined,
        tags: Array.isArray(d.tags) ? d.tags : [],
        fitLevel: (d.fit_level ?? 'baixo') as NivelDeEncaixe,
        motivos: textosDosMotivos(d.reasons),
        sinais: Array.isArray(d.signals) ? (d.signals as SinalDaCandidata[]) : [],
        origem: (['busca', 'sinal', 'sincronizacao'].includes(d.origin) ? d.origin : 'busca') as OrigemDaDescoberta,
        motivosDeSinal: Array.isArray(d.signal_reasons)
          ? (d.signal_reasons as any[]).map((m): SinalDoMotivo => ({
            id: m.id,
            tipo: m.tipo,
            frase: m.frase,
            ...(m.fonte ? { fonte: m.fonte } : {}),
            data: m.data,
            valido: Boolean(m.valido),
            mercado: Boolean(m.mercado),
          }))
          : [],
        ...(d.reopened_by_signal_at ? { voltouPorSinalEm: d.reopened_by_signal_at } : {}),
        ...(d.reopened_discard_reason ? { motivoDoDescarteAnterior: d.reopened_discard_reason } : {}),
        targetAccountId: d.target_account_id ?? undefined,
        decididoPor: d.decided_by ?? undefined,
        decididoEm: d.decided_at ?? undefined,
        motivoDescarte: d.discard_reason ?? undefined,
        criadaEm: d.created_at,
      }))
    },

    async aceitarDescoberta(id: string, url?: string): Promise<ResultadoDoAceite> {
      const { data, error } = await cliente.rpc('accept_discovered_account', {
        p_id: id,
        p_url: url ? url.trim() : null,
      })
      if (error) throw new Error(error.message)
      const linha = Array.isArray(data) ? data[0] : data
      notificar()
      const comites: SituacaoDoComite[] = ['liberado', 'sem_saldo', 'limite_do_mes', 'sem_contrato']
      return {
        targetAccountId: linha.target_account_id,
        created: Boolean(linha.created),
        sinaisMigrados: Number(linha.signals_moved ?? 0),
        comite: comites.includes(linha.committee) ? linha.committee : 'sem_saldo',
      }
    },

    async descartarDescoberta(id: string, motivo?: string, codigo?: CodigoDoDescarte): Promise<void> {
      const { error } = codigo
        ? await cliente.rpc('discard_discovered_account_with_code', {
            p_id: id,
            p_reason_code: codigo,
            p_reason: motivo ? motivo.trim() : null,
          })
        : await cliente.rpc('discard_discovered_account', {
            p_id: id,
            p_reason: motivo ? motivo.trim() : null,
          })
      if (error) throw new Error(error.message)
      notificar()
    },

    async aprendizado(): Promise<AjusteAprendido[]> {
      const { data, error } = await cliente.rpc('list_discovery_learning', { p_workspace_id: obterWorkspaceId() })
      if (error) throw new Error(error.message)
      return ((data ?? []) as { dimension: DimensaoAprendida; value: string; adjustment: number; evidence_count: number; updated_at: string }[]).map((l) => ({
        dimensao: l.dimension,
        valor: l.value,
        ajuste: Number(l.adjustment),
        decisoes: l.evidence_count,
        atualizadoEm: l.updated_at,
      }))
    },

    async desfazerAprendizado(ajuste?: Pick<AjusteAprendido, 'dimensao' | 'valor'>): Promise<void> {
      const { error } = await cliente.rpc('reset_discovery_learning', {
        p_workspace_id: obterWorkspaceId(),
        p_dimension: ajuste?.dimensao ?? null,
        p_value: ajuste?.valor ?? null,
      })
      if (error) throw new Error(error.message)
      notificar()
    },

    explicarAderencia(id: string): Promise<ExplicacaoDeAderencia> {
      return explicarAderencia(cliente, id)
    },

    async restaurarDescoberta(id: string): Promise<void> {
      const { error } = await cliente.rpc('restore_discovered_account', {
        p_id: id,
      })
      if (error) throw new Error(error.message)
      notificar()
    },

    observar(ouvinte: () => void): () => void {
      ouvintes.add(ouvinte)
      return () => ouvintes.delete(ouvinte)
    },
  }
}

/**
 * Os motivos do encaixe, como texto para a tela. A busca (account-discovery) grava cada motivo como
 * `{ criterio, atende, texto }`; linhas antigas e a Demonstração trazem só o texto. Qualquer outra forma é descartada,
 * porque um objeto desenhado direto no React derruba a tela inteira.
 */
export function textosDosMotivos(motivos: unknown): string[] {
  if (!Array.isArray(motivos)) return []
  return motivos.flatMap((m): string[] => {
    if (typeof m === 'string') return m.trim() ? [m] : []
    if (m && typeof m === 'object' && typeof (m as { texto?: unknown }).texto === 'string') {
      const texto = (m as { texto: string }).texto
      return texto.trim() ? [texto] : []
    }
    return []
  })
}

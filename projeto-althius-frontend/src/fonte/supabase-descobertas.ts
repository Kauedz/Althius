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
} from './descobertas-tipos'

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

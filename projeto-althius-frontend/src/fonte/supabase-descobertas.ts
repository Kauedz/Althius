import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ContaDescoberta,
  CotacaoDaDescoberta,
  EstadoContaDescoberta,
  FonteDeDescobertas,
  NivelDeEncaixe,
  SinalDaCandidata,
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

    async buscarContas(args = {}): Promise<void> {
      const workspaceId = obterWorkspaceId()
      const maxResults = args.maxResults ?? 50
      const requestKey = `busca-manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

      const { error } = await cliente.functions.invoke('account-discovery', {
        body: {
          action: 'search',
          workspaceId,
          requestKey,
          maxResults,
          allowTesting: args.allowTesting ?? false,
        },
      })
      if (error) throw new Error(error.message)
      notificar()
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
        motivos: Array.isArray(d.reasons) ? d.reasons : [],
        sinais: Array.isArray(d.signals) ? (d.signals as SinalDaCandidata[]) : [],
        targetAccountId: d.target_account_id ?? undefined,
        decididoPor: d.decidido_by ?? undefined,
        decididoEm: d.decidido_at ?? undefined,
        motivoDescarte: d.discard_reason ?? undefined,
        criadaEm: d.created_at,
      }))
    },

    async aceitarDescoberta(id: string, url?: string): Promise<{ targetAccountId: string; created: boolean }> {
      const { data, error } = await cliente.rpc('accept_discovered_account', {
        p_id: id,
        p_url: url ? url.trim() : null,
      })
      if (error) throw new Error(error.message)
      const linha = Array.isArray(data) ? data[0] : data
      notificar()
      return {
        targetAccountId: linha.target_account_id,
        created: Boolean(linha.created),
      }
    },

    async descartarDescoberta(id: string, motivo?: string): Promise<void> {
      const { error } = await cliente.rpc('discard_discovered_account', {
        p_id: id,
        p_reason: motivo ? motivo.trim() : null,
      })
      if (error) throw new Error(error.message)
      notificar()
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

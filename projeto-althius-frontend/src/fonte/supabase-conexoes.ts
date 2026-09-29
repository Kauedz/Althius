import type { SupabaseClient } from '@supabase/supabase-js'
import { catalogoDeCanais } from './catalogo-de-conexoes'
import type {
  CanalDeConexao,
  EstadoDeIntegracao,
  FonteDeConexoes,
  IntegracaoDeConexao,
} from './conexoes-tipos'
import type { CanalId, CategoriaDeIntegracao, IntegracaoFutura, IntegracaoId, PreviaDeCanal } from './tipos'

interface LinhaDeIntegracao {
  id: string
  name: string
  category: string
  description: string
  writes: boolean
  status: string
  enabled_at: string | null
  enabled_by: string | null
  app_portal: string | null
}

/**
 * A Fonte de Conexões do Workspace operacional: lê o catálogo e as habilitações do Supabase.
 * Os Canais aparecem "Em breve"; HubSpot e Notion são habilitáveis; as demais ficam "Em breve".
 */
export function criarFonteDeConexoesSupabase(
  cliente: SupabaseClient,
  obterWorkspaceId: () => string,
): FonteDeConexoes {
  const ouvintes = new Set<() => void>()

  function avisar() {
    ouvintes.forEach((ouvinte) => ouvinte())
  }

  return {
    observar(ouvinte) {
      ouvintes.add(ouvinte)
      return () => {
        ouvintes.delete(ouvinte)
      }
    },

    async canais(): Promise<CanalDeConexao[]> {
      return catalogoDeCanais.map((canal) => ({
        id: canal.id,
        nome: canal.nome,
        descricao: canal.descricao,
        estado: 'em_breve',
        conectado: false,
      }))
    },

    async integracoes(): Promise<IntegracaoDeConexao[]> {
      const workspaceId = obterWorkspaceId()
      const { data, error } = await cliente.rpc('list_workspace_integrations', {
        p_workspace_id: workspaceId,
      })
      if (error) {
        throw new Error(error.message)
      }

      const linhas = (data ?? []) as LinhaDeIntegracao[]
      return linhas.map((linha) => ({
        id: linha.id as IntegracaoId,
        nome: linha.name,
        categoria: linha.category as CategoriaDeIntegracao,
        descricao: linha.description,
        escreve: linha.writes,
        estado: linha.status as EstadoDeIntegracao,
        habilitada: linha.status === 'habilitada',
        habilitadaEm: linha.enabled_at ?? undefined,
        habilitadaPor: linha.enabled_by ?? undefined,
        appPortal: linha.app_portal ?? undefined,
      }))
    },

    async integracoesFuturas(): Promise<IntegracaoFutura[]> {
      return []
    },

    async habilitarIntegracao(id: IntegracaoId): Promise<void> {
      const workspaceId = obterWorkspaceId()
      const { error } = await cliente.rpc('enable_workspace_integration', {
        p_workspace_id: workspaceId,
        p_integration_id: id,
      })
      if (error) {
        if (error.message.includes('only administrators can enable integrations')) {
          throw new Error('Só um Administrador habilita Integrações no Workspace.')
        }
        if (error.message.includes('integration is not available for enablement')) {
          throw new Error('Esta Integração ainda não está disponível para habilitação.')
        }
        throw new Error(error.message)
      }
      avisar()
    },

    async conectar(_conexao: CanalId | IntegracaoId): Promise<void> {
      throw new Error('Acesso à Integração ainda não está disponível neste Workspace.')
    },

    async previaDeCanal(_canalId: CanalId): Promise<PreviaDeCanal> {
      throw new Error('Canais ainda não estão disponíveis neste Workspace.')
    },
  }
}

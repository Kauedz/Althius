import type { SupabaseClient } from '@supabase/supabase-js'
import { catalogoDeCanais } from './catalogo-de-conexoes'
import type {
  AcessoDaIntegracao,
  CaminhoDeConexao,
  CanalDeConexao,
  EstadoDeIntegracao,
  EstadoDoAcesso,
  FerramentaDaIntegracao,
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

interface LinhaDeAcesso {
  integration_id: string
  state: string
  kind: string | null
  account_label: string | null
  failure: string | null
  connected_count: number | null
  kinds: string[] | null
}

const CAMINHO: Record<string, CaminhoDeConexao> = { oauth_mcp: 'autorizacao', api_key: 'chave' }

/** A mensagem que a Edge Function devolveu (`{ error }`), ou uma genérica: ela já vem em português e sem segredo. */
async function mensagemDaFuncao(error: unknown, padrao: string): Promise<string> {
  const contexto = (error as { context?: { json?: () => Promise<unknown> } }).context
  try {
    const corpo = (await contexto?.json?.()) as { error?: unknown } | undefined
    if (typeof corpo?.error === 'string' && corpo.error) return corpo.error
  } catch {
    // corpo ilegível: vale a mensagem padrão
  }
  return padrao
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

    async acessos(): Promise<AcessoDaIntegracao[]> {
      const { data, error } = await cliente.rpc('integration_access_status', { p_workspace_id: obterWorkspaceId() })
      if (error) throw new Error(error.message)
      return ((data ?? []) as LinhaDeAcesso[]).map((linha) => ({
        integracaoId: linha.integration_id as IntegracaoId,
        estado: linha.state as EstadoDoAcesso,
        caminho: linha.kind ? CAMINHO[linha.kind] : undefined,
        conta: linha.account_label ?? undefined,
        falha: linha.failure ?? undefined,
        conectados: linha.connected_count ?? 0,
        caminhos: (linha.kinds ?? []).map((kind) => CAMINHO[kind]).filter((c): c is CaminhoDeConexao => Boolean(c)),
      }))
    },

    async conectarPorAutorizacao(id: IntegracaoId): Promise<string> {
      const { data, error } = await cliente.functions.invoke('integration-connect', {
        body: { action: 'iniciar', workspaceId: obterWorkspaceId(), integrationId: id },
      })
      if (error) throw new Error(await mensagemDaFuncao(error, 'Não foi possível abrir a autorização agora. Tente de novo em instantes.'))
      const url = (data as { url?: unknown } | null)?.url
      if (typeof url !== 'string' || !url) throw new Error('Não foi possível abrir a autorização agora. Tente de novo em instantes.')
      return url
    },

    async conectarPorChave(id: IntegracaoId, chave: string): Promise<void> {
      const { error } = await cliente.functions.invoke('integration-connect', {
        body: { action: 'chave', workspaceId: obterWorkspaceId(), integrationId: id, chave },
      })
      if (error) throw new Error(await mensagemDaFuncao(error, 'Não foi possível validar a chave agora. Tente de novo em instantes.'))
      avisar()
    },

    async desconectarAcesso(id: IntegracaoId): Promise<void> {
      const { error } = await cliente.rpc('disconnect_integration_access', {
        p_workspace_id: obterWorkspaceId(),
        p_integration_id: id,
      })
      if (error) throw new Error('Não foi possível desconectar agora. Tente de novo em instantes.')
      avisar()
    },

    async ferramentas(id: IntegracaoId): Promise<FerramentaDaIntegracao[]> {
      const { data, error } = await cliente.functions.invoke('integration-tools', {
        body: { action: 'listar', workspaceId: obterWorkspaceId(), integrationId: id },
      })
      if (error) throw new Error(await mensagemDaFuncao(error, 'Não foi possível ler as ferramentas agora. Tente de novo em instantes.'))
      const lista = (data as { ferramentas?: unknown } | null)?.ferramentas
      return Array.isArray(lista) ? (lista as FerramentaDaIntegracao[]) : []
    },

    async previaDeCanal(_canalId: CanalId): Promise<PreviaDeCanal> {
      throw new Error('Canais ainda não estão disponíveis neste Workspace.')
    },
  }
}

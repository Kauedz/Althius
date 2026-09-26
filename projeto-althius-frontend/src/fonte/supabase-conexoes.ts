// A tela Conexões do Workspace operacional, no Supabase (Conexões funcionais, ticket 02). Lê o catálogo e as
// Integrações habilitadas pelo RLS da Participação ativa e habilita só pela RPC, que confere o papel no servidor.
// O Acesso à Integração chega no ticket 03: até lá, nenhuma Conexão oferece Acesso.

import type { SupabaseClient } from '@supabase/supabase-js'
import { ErroDeModuloIndisponivel } from './ambiente'
import type { ConexaoDoCatalogo, FonteDeConexoes, TipoDeConexao } from './conexoes-tipos'
import type { CategoriaDeIntegracao, Papel } from './tipos'

interface RegistroDoCatalogo {
  id: string
  kind: TipoDeConexao
  name: string
  category: CategoriaDeIntegracao | null
  description: string
  available: boolean
  position: number
}

function converterErro(error: { message: string; code?: string }): Error {
  if (error.code === '42501') return new Error('Só um Administrador pode habilitar uma Integração.')
  if (error.message.includes('connection not available')) return new Error('Esta Integração ainda não está disponível.')
  return new Error(error.message)
}

export function criarFonteDeConexoesSupabase(
  cliente: SupabaseClient,
  obterWorkspaceId: () => string,
  obterPapel: () => Papel,
): FonteDeConexoes {
  const ouvintes = new Set<() => void>()
  function workspace(): string {
    const id = obterWorkspaceId()
    if (!id) throw new Error('Nenhum Workspace ativo foi selecionado.')
    return id
  }

  return {
    observar(ouvinte) {
      ouvintes.add(ouvinte)
      return () => ouvintes.delete(ouvinte)
    },

    async catalogo() {
      const [catalogo, habilitadas] = await Promise.all([
        cliente.from('connection_catalog').select('id, kind, name, category, description, available, position'),
        cliente.from('workspace_integrations').select('integration_id').eq('workspace_id', workspace()),
      ])
      if (catalogo.error) throw converterErro(catalogo.error)
      if (habilitadas.error) throw converterErro(habilitadas.error)
      const ids = new Set(((habilitadas.data ?? []) as { integration_id: string }[]).map((h) => h.integration_id))
      return ((catalogo.data ?? []) as RegistroDoCatalogo[])
        .sort((a, b) => a.position - b.position)
        .map<ConexaoDoCatalogo>((linha) => ({
          id: linha.id,
          tipo: linha.kind,
          nome: linha.name,
          descricao: linha.description,
          ...(linha.category ? { categoria: linha.category } : {}),
          disponivel: linha.available,
          habilitada: ids.has(linha.id),
        }))
    },

    podeHabilitar: async () => obterPapel() === 'administrador',

    async habilitar(id) {
      const { error } = await cliente.rpc('enable_integration', { p_workspace_id: workspace(), p_integration_id: id })
      if (error) throw converterErro(error)
      for (const ouvinte of ouvintes) ouvinte()
    },

    conectar: () => Promise.reject(new ErroDeModuloIndisponivel('conexoes')),
  }
}

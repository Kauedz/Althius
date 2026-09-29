// As funções de Conexões do banco (migration catalogo_e_habilitacao_de_integracoes) em memória para os testes.

export interface BancoDeConexoes {
  habilitadas: { workspaceId: string; integrationId: string; enabledBy: string; enabledAt: string }[]
}

export function criarBancoDeConexoes(): BancoDeConexoes {
  return {
    habilitadas: [],
  }
}

export function rpcsDeConexoes(banco: BancoDeConexoes) {
  const CATALOGO = [
    { id: 'hubspot', name: 'HubSpot', category: 'CRM', description: 'Contas, contatos, negócios e sequências.', writes: true, disponivel: true },
    { id: 'clay', name: 'Clay', category: 'Enriquecimento', description: 'Dados firmográficos e de tecnologia.', writes: false, disponivel: false },
    { id: 'apollo', name: 'Apollo', category: 'Enriquecimento', description: 'Contatos e sinais de compra.', writes: false, disponivel: false },
    { id: 'lusha', name: 'Lusha', category: 'Enriquecimento', description: 'Cargos e contatos do Comitê de compra.', writes: false, disponivel: false },
    { id: 'notion', name: 'Notion', category: 'Conhecimento', description: 'Páginas usadas como base de conhecimento e pautas.', writes: true, disponivel: true },
    { id: 'meta-ads', name: 'Meta Ads', category: 'Mídia paga', description: 'Campanhas no Facebook e no Instagram.', writes: true, disponivel: false },
    { id: 'google-ads', name: 'Google Ads', category: 'Mídia paga', description: 'Campanhas de busca e display.', writes: true, disponivel: false },
  ]

  return {
    list_workspace_integrations(parametros: Record<string, unknown> = {}) {
      const p_workspace_id = parametros.p_workspace_id as string
      return CATALOGO.map((item) => {
        const habilitada = banco.habilitadas.find((h) => h.workspaceId === p_workspace_id && h.integrationId === item.id)
        let status = 'em_breve'
        if (item.disponivel) {
          status = habilitada ? 'habilitada' : 'nao_habilitada'
        }
        return {
          id: item.id,
          name: item.name,
          category: item.category,
          description: item.description,
          writes: item.writes,
          status,
          enabled_at: habilitada?.enabledAt ?? null,
          enabled_by: habilitada?.enabledBy ?? null,
          app_portal: null,
        }
      })
    },

    enable_workspace_integration(parametros: Record<string, unknown> = {}) {
      const p_workspace_id = parametros.p_workspace_id as string
      const p_integration_id = parametros.p_integration_id as string
      const valido = CATALOGO.find((c) => c.id === p_integration_id)
      if (!valido) {
        throw new Error('integration not found')
      }
      if (!valido.disponivel) {
        throw new Error('integration is not available for enablement')
      }
      if (!banco.habilitadas.some((h) => h.workspaceId === p_workspace_id && h.integrationId === p_integration_id)) {
        banco.habilitadas.push({
          workspaceId: p_workspace_id,
          integrationId: p_integration_id,
          enabledBy: 'usuario-atual',
          enabledAt: new Date().toISOString(),
        })
      }
      return null
    },
  }
}

// Day0 operacional: o banco decide o ramo, retoma os campos salvos e guarda a conclusão.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EstadoDeOnboarding, FonteDeOnboarding } from './onboarding-tipos'
import { criarFonteDeOnboardingIndisponivel } from './indisponivel'
import { normalizarDominio } from './dominio-do-site'

type Registro = Pick<EstadoDeOnboarding, 'ramo' | 'etapa' | 'papel' | 'comoConheceu' | 'empresa' | 'dominio' | 'logoDoSite' | 'concluido'>

export function criarFonteDeOnboardingSupabase(cliente: SupabaseClient, workspaceId: string): FonteDeOnboarding {
  const ouvintes = new Set<() => void>()
  async function consultar(acao?: string, valor?: string): Promise<EstadoDeOnboarding> {
    const { data, error } = await cliente.rpc(acao ? 'save_my_day0' : 'get_my_day0', {
      p_workspace_id: workspaceId,
      ...(acao ? { p_action: acao, p_value: valor ?? null } : {}),
    })
    if (error || !data) throw new Error('Não foi possível carregar ou salvar o Day0. Verifique sua conexão e tente novamente.')
    const registro = data as Registro
    const estado: EstadoDeOnboarding = {
      ...registro,
      workspace: null, // A identidade da Casca continua sendo a do Workspace provisionado pela equipe.
      leitura: { situacao: 'inativa', resultado: null },
      checklist: { miniIcp: '', oQueVende: '', porQueCompram: '', personas: [], produto: 'pendente', persona: 'pendente', sinal: 'pendente' },
      convitePulado: false,
      retornoAoChecklist: false,
      day0Concluido: registro.concluido,
    }
    if (acao) ouvintes.forEach((ouvinte) => ouvinte())
    return estado
  }
  return {
    ...criarFonteDeOnboardingIndisponivel(),
    observar(ouvinte) {
      ouvintes.add(ouvinte)
      return () => ouvintes.delete(ouvinte)
    },
    ler: () => consultar(),
    iniciar: () => consultar(),
    retomar: () => consultar(),
    dispensarRetorno: () => consultar(),
    definirPapel: (papel) => consultar('papel', papel),
    definirCliente: (nome) => consultar('empresa', nome.trim()),
    definirDominio: (dominio) => {
      const host = normalizarDominio(dominio)
      if (!host) return Promise.reject(new Error('Informe um domínio válido.'))
      return consultar('dominio', host)
    },
    definirComoConheceu: (origem) => consultar('hdyhau', origem),
    concluirOnboarding: () => consultar('concluir'),
    // Leitura do site e resolução do logo ficam fora desta fatia. Nenhum resultado é inventado.
    buscarLogo: async () => null,
    lerSite: async () => null,
  }
}

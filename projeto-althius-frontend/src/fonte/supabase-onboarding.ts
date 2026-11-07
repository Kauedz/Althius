// Day0 operacional: o banco decide o ramo, retoma os campos salvos e guarda a conclusão. O site informado aqui é o
// do Contexto da empresa: a tela pede a geração dele pela Fonte do contexto (contexto-da-empresa 03). O mini-ICP do
// Day0 não é mais perguntado.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EstadoDeOnboarding, FonteDeOnboarding } from './onboarding-tipos'
import { criarFonteDeOnboardingIndisponivel } from './indisponivel'
import { normalizarDominio } from './dominio-do-site'

type Registro = Pick<EstadoDeOnboarding, 'ramo' | 'etapa' | 'papel' | 'comoConheceu' | 'empresa' | 'dominio' | 'logoDoSite' | 'concluido'> & {
  sitePulado?: boolean
}

export function criarFonteDeOnboardingSupabase(cliente: SupabaseClient, workspaceId: string): FonteDeOnboarding {
  const ouvintes = new Set<() => void>()
  const publicar = () => ouvintes.forEach((ouvinte) => ouvinte())

  function montar(registro: Registro): EstadoDeOnboarding {
    return {
      ...registro,
      sitePulado: registro.sitePulado === true,
      workspace: null, // A identidade da Casca continua sendo a do Workspace provisionado pela equipe.
      checklist: { contexto: 'pendente', sinal: 'pendente' },
      convitePulado: false,
      retornoAoChecklist: false,
      day0Concluido: registro.concluido,
    }
  }

  async function consultar(acao?: string, valor?: string): Promise<EstadoDeOnboarding> {
    const { data, error } = await cliente.rpc(acao ? 'save_my_day0' : 'get_my_day0', {
      p_workspace_id: workspaceId,
      ...(acao ? { p_action: acao, p_value: valor ?? null } : {}),
    })
    if (error || !data) throw new Error('Não foi possível carregar ou salvar o Day0. Verifique sua conexão e tente novamente.')
    const estado = montar(data as Registro)
    if (acao) publicar()
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
    definirDominio: async (dominio) => {
      const host = normalizarDominio(dominio)
      if (!host) throw new Error('Informe um domínio válido.')
      return consultar('dominio', host)
    },
    pularSite: () => consultar('pular_site'),
    definirComoConheceu: (origem) => consultar('hdyhau', origem),
    concluirOnboarding: () => consultar('concluir'),
    // A resolução do logo fica fora desta fatia. Nenhum resultado é inventado.
    buscarLogo: async () => null,
  }
}

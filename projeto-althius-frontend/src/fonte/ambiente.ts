// O ambiente em que o app roda: a Demonstração, com dados de exemplo, ou um Workspace operacional. Vocabulário do
// CONTEXT.md. A composição da aplicação escolhe um e injeta as fontes dele; as telas só consomem os contratos.

import type { FonteDeConexoes } from './conexoes-tipos'
import type { FonteDeContasRemetentes } from './contas-remetentes-tipos'
import type { FonteDeAutomacao } from './automacao-tipos'
import type { FonteDoPlaybook } from './playbook-tipos'
import type { FonteDeSinais } from './sinais-tipos'
import type { FonteDeDescobertas } from './descobertas-tipos'
import type { FonteDeAgentes, FonteDeContas, FonteDeOnboarding, FonteDeSequencias, Papel } from './tipos'

export type ModoDoAmbiente = 'demonstracao' | 'real'

/**
 * Os módulos que um Workspace operacional liga ao backend um de cada vez. Sequências já é real. `agentes` é a
 * configuração dos Agentes (Personalização, Permissões, Memória, Habilidades e Rotinas); `conversas` é executá-los,
 * numa Conversa direta ou na Coordenação, e depende de um provedor de modelo.
 */
export type ModuloDoWorkspace =
  | 'agentes'
  | 'conversas'
  | 'contas'
  | 'contatos'
  | 'sinais'
  | 'aprovacoes'
  | 'conexoes'
  | 'configuracoes'
  | 'participantes'
  | 'onboarding'
  | 'anexos'

/** Como a tela anuncia um módulo que o Workspace operacional ainda não conectou. */
export const MODULO_INDISPONIVEL: Record<ModuloDoWorkspace, string> = {
  agentes: 'Agentes ainda não estão disponíveis neste Workspace.',
  conversas: 'Conversas e Coordenação com os Agentes ainda não estão disponíveis neste Workspace.',
  contas: 'Contas e Contatos ainda não estão disponíveis neste Workspace.',
  contatos: 'Contatos ainda não estão disponíveis neste Workspace.',
  sinais: 'Sinais ainda não estão disponíveis neste Workspace.',
  aprovacoes: 'Aprovações ainda não estão disponíveis neste Workspace.',
  conexoes: 'Conexões ainda não estão disponíveis neste Workspace.',
  configuracoes: 'Esta seção de Configurações ainda não está disponível neste Workspace.',
  participantes: 'Participantes e convites ainda não estão disponíveis neste Workspace.',
  onboarding: 'O onboarding ainda não está disponível neste Workspace.',
  anexos: 'Anexos ainda não estão disponíveis neste Workspace.',
}

/** Uma ação num módulo sem backend: nada foi feito, e a tela diz isso em vez de mostrar sucesso. */
export class ErroDeModuloIndisponivel extends Error {
  readonly modulo: ModuloDoWorkspace

  constructor(modulo: ModuloDoWorkspace) {
    super(MODULO_INDISPONIVEL[modulo])
    this.name = 'ErroDeModuloIndisponivel'
    this.modulo = modulo
  }
}

/**
 * As fontes de um ambiente, escolhidas juntas pela sessão e pelo Workspace. Cada ambiente tem instâncias próprias:
 * nada do que uma guarda (dados, observadores, arquivos locais) passa para outra.
 */
export interface Ambiente {
  modo: ModoDoAmbiente
  fonte: FonteDeAgentes
  fonteDeContas: FonteDeContas
  fonteDeSequencias: FonteDeSequencias
  fonteDeOnboarding: FonteDeOnboarding
  fonteDeSinais: FonteDeSinais
  /** As Conexões reais ou simuladas (Canais e Integrações). */
  fonteDeConexoes: FonteDeConexoes
  /** As Contas remetentes do titular. Na Demonstração, nenhuma é conectada. */
  fonteDeContasRemetentes: FonteDeContasRemetentes
  /** O Playbook do Workspace. Sem ela, a tela do Playbook diz que ainda não está disponível. */
  fonteDoPlaybook?: FonteDoPlaybook
  /** O automático e os tetos (creditos-e-planos 03). Sem ela, a seção aparece indisponível. */
  fonteDeAutomacao?: FonteDeAutomacao
  /** As Descobertas de contas pelo ICP (enriquecimento-em-cascata). */
  fonteDeDescobertas?: FonteDeDescobertas
  /** Os módulos sem backend neste ambiente, que as telas mostram como indisponíveis. Na Demonstração, nenhum. */
  indisponiveis: ReadonlySet<ModuloDoWorkspace>
}

/** A Conta de usuário autenticada no Supabase Auth. */
export interface ContaDeUsuarioDaSessao {
  id: string
  email: string
}

/** A Participação ativa com que a sessão abriu o Workspace operacional. */
export interface ParticipacaoNoWorkspace {
  workspaceId: string
  nomeDoWorkspace: string
  papel: Papel
}

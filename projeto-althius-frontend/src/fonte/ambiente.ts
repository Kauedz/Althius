// O ambiente em que o app roda: a Demonstração, com dados de exemplo, ou um Workspace operacional. Vocabulário do
// CONTEXT.md. A composição da aplicação escolhe um e injeta as fontes dele; as telas só consomem os contratos.

import type { FonteDeSinais } from './sinais-tipos'
import type { FonteDeAgentes, FonteDeContas, FonteDeOnboarding, FonteDeSequencias, Papel } from './tipos'

export type ModoDoAmbiente = 'demonstracao' | 'real'

/** Os módulos que um Workspace operacional liga ao backend um de cada vez. Sequências já é real. */
export type ModuloDoWorkspace = 'agentes' | 'contas' | 'sinais' | 'aprovacoes' | 'conexoes' | 'configuracoes' | 'onboarding' | 'anexos'

/** Como a tela anuncia um módulo que o Workspace operacional ainda não conectou. */
export const MODULO_INDISPONIVEL: Record<ModuloDoWorkspace, string> = {
  agentes: 'Agentes e Conversas ainda não estão disponíveis neste Workspace.',
  contas: 'Contas e Contatos ainda não estão disponíveis neste Workspace.',
  sinais: 'Sinais ainda não estão disponíveis neste Workspace.',
  aprovacoes: 'Aprovações ainda não estão disponíveis neste Workspace.',
  conexoes: 'Conexões ainda não estão disponíveis neste Workspace.',
  configuracoes: 'Esta seção de Configurações ainda não está disponível neste Workspace.',
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
  papel: Papel
}

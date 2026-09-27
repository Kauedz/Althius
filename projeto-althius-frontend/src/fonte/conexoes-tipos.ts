// A fronteira de dados da tela Conexões (ADR-0017). A Demonstração e o Workspace operacional entregam o mesmo
// catálogo; a tela não sabe qual recebeu.

import type { CategoriaDeIntegracao, FonteObservavel } from './tipos'

export type TipoDeConexao = 'canal' | 'integracao'

/** Um Canal ou uma Integração do catálogo, com o estado no Workspace e o Acesso de quem está na sessão. */
export interface ConexaoDoCatalogo {
  id: string
  tipo: TipoDeConexao
  nome: string
  descricao: string
  /** A categoria de uma Integração; um Canal não tem. */
  categoria?: CategoriaDeIntegracao
  /** Sem backend para ela ainda: a tela mostra "Em breve". */
  disponivel: boolean
  /** Habilitada no Workspace por um Administrador. */
  habilitada: boolean
  /**
   * A conexão de quem está na sessão: o Acesso à Integração, ou o Canal conectado na Demonstração. Sem valor, a
   * Conexão ainda não oferece conectar.
   */
  acesso?: { conectado: boolean }
  /** Um Canal com prévia de conversa, na Demonstração. */
  temPrevia?: boolean
}

export interface FonteDeConexoes extends FonteObservavel {
  /** Canais e Integrações na ordem do catálogo. */
  catalogo(): Promise<ConexaoDoCatalogo[]>
  /** Quem está na sessão pode habilitar Integrações no Workspace: só um Administrador. */
  podeHabilitar(): Promise<boolean>
  /** Habilita uma Integração disponível no Workspace. Recusa quem não é Administrador. */
  habilitar(id: string): Promise<void>
  /** Conecta o Acesso de quem está na sessão. Recusa uma Conexão que ainda não oferece Acesso. */
  conectar(id: string): Promise<void>
}

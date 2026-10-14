// As Contas remetentes do titular: as identidades de E-mail, WhatsApp e LinkedIn que ele conecta pela autenticação
// hospedada da Unipile para as Sequências saírem em seu nome. Vocabulário do CONTEXT.md. Só o titular as vê.

import type { CanalSuportado } from './sequencias-tipos'
import type { FonteObservavel } from './tipos'

/** O Canal de abordagem de uma Conta remetente: os mesmos em que um passo de Sequência sai. */
export type CanalDaContaRemetente = CanalSuportado

/**
 * Em que ponto a Conta remetente está, como o backend a registrou a partir do webhook da Unipile. O retorno da
 * autenticação hospedada não muda o estado: só o backend o faz.
 */
export type EstadoDaContaRemetente = 'conectando' | 'sincronizando' | 'pronta' | 'requer-reconexao' | 'desconectada'

export interface ContaRemetente {
  id: string
  canal: CanalDaContaRemetente
  /** O provedor da identidade, como a Unipile o informa (GOOGLE, OUTLOOK, IMAP, WHATSAPP, LINKEDIN). */
  provedor: string
  estado: EstadoDaContaRemetente
  /**
   * A conta caiu e voltou: as respostas do período fora do ar ainda precisam ser conferidas. Enquanto sincroniza com
   * esta marca, a conta está nessa conferência, e não numa sincronização comum.
   */
  conferindoPeriodoForaDoAr: boolean
  /** Quando o backend registrou o estado atual (ISO 8601). */
  estadoDesde: string
}

/**
 * A cota de entrada de um remetente pronto: quantas Contas novas ele já ocupa hoje, o teto do dia e quantas esperam
 * o próximo dia útil. `tetoHoje` nulo é sem limite, e a tela não desenha a linha.
 */
export interface CotaDeEntrada {
  id: string
  canal: CanalDaContaRemetente
  usadasHoje: number
  tetoHoje: number | null
  naFilaParaAmanha: number
  emAquecimento: boolean
}

/** As Contas remetentes do titular no Workspace atual. */
export interface FonteDeContasRemetentes extends FonteObservavel {
  /** As Contas remetentes da Conta de usuário da sessão, nunca as de outro participante. */
  minhas(): Promise<ContaRemetente[]>
  /**
   * A cota de cada remetente pronto do titular. Se o backend ainda não tem a fila, devolve vazio: a tela segue sem o
   * contador.
   */
  cotasDeEntrada(): Promise<CotaDeEntrada[]>
  /**
   * Pede ao backend um link novo de autenticação hospedada para conectar uma identidade deste Canal. Devolve o
   * endereço a abrir; a conexão só existe quando o backend a confirmar.
   */
  conectar(canal: CanalDaContaRemetente): Promise<string>
  /** Como `conectar`, para reautenticar a mesma identidade de uma Conta remetente que caiu. */
  reconectar(conta: Pick<ContaRemetente, 'id' | 'canal'>): Promise<string>
  /** Desconecta a Conta remetente no provedor e no backend. */
  desconectar(id: string): Promise<void>
}

// As Conversas nomeadas da Coordenação (agentes-em-conversa, ticket 04): a lista, o nome e reabrir uma Conversa.

/** Uma Conversa coordenada salva, para a lista. Sem nome, a tela mostra o primeiro pedido. */
export interface ResumoDeConversa {
  id: string
  /** O nome que a pessoa deu, ou nulo enquanto vale o primeiro pedido. */
  titulo: string | null
  primeiroPedido: string
  /** ISO 8601. */
  atualizadaEm: string
  /** O último pedido ainda está rodando. */
  emAndamento: boolean
  /** A Conversa nasceu num thread do Slack, com este Agente, e continua lá. Ausente, ela é da Althius. */
  doSlack?: { agenteId: string }
  /** A Conversa nasceu no WhatsApp e só pode ser lida pelo app. */
  doWhatsapp?: true
}

/** O nome que a tela mostra: o que a pessoa deu ou, sem ele, o primeiro pedido. */
export function nomeDaConversa(conversa: Pick<ResumoDeConversa, 'titulo' | 'primeiroPedido'>): string {
  return conversa.titulo ?? tituloAutomatico(conversa.primeiroPedido)
}

/** Sem nome dado, o título é o começo do primeiro pedido, com até 60 caracteres. */
export function tituloAutomatico(pedido: string): string {
  const limpo = pedido.trim()
  return limpo.length <= 60 ? limpo : `${limpo.slice(0, 59).trimEnd()}…`
}

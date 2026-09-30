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
}

/** O nome que a tela mostra: o que a pessoa deu ou, sem ele, o primeiro pedido. */
export function nomeDaConversa(conversa: Pick<ResumoDeConversa, 'titulo' | 'primeiroPedido'>): string {
  return conversa.titulo ?? conversa.primeiroPedido
}

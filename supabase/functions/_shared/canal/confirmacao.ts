/** Formata a proposta confirmável. A cotação precede toda ação que consome Créditos. */
export function resumoDaConfirmacao(resumo: string, creditos?: number): string {
  const custo = creditos === undefined ? '' : `\nCusto: ${creditos} ${creditos === 1 ? 'Crédito' : 'Créditos'}.`
  return `${resumo.trim()}${custo} Responda SIM para confirmar ou NAO para recusar.`
}

export function confirmarTexto(texto: string): 'aprovar' | 'recusar' | null {
  const normalizado = texto.trim().toLocaleLowerCase('pt-BR')
  if (normalizado === 'sim') return 'aprovar'
  if (normalizado === 'nao' || normalizado === 'não') return 'recusar'
  return null
}

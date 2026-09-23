// Reconhecimento de Menções (@Agente), o mesmo na Conversa com um Agente e no composer da Coordenação.

/** Compara nomes sem diferenciar maiúsculas, o "·" dos Agentes criados nem espaços repetidos. */
export function normalizarNome(texto: string): string {
  return texto.toLocaleLowerCase('pt-BR').replace(/·/g, ' ').replace(/\s+/g, ' ')
}

/**
 * Os Agentes mencionados com @Nome no texto, na ordem em que aparecem, sem repetir. O nome mais
 * longo vence: "@Scopus · Enterprise LATAM" é o Agente criado, e "@Scopus", o Agente padrão.
 */
export function reconhecerMencoes<A extends { nome: string }>(texto: string, agentes: A[]): A[] {
  const doMaisLongo = [...agentes].sort((a, b) => b.nome.length - a.nome.length)
  const mencionados: A[] = []
  for (const trecho of texto.split('@').slice(1)) {
    const depois = normalizarNome(trecho)
    const agente = doMaisLongo.find((a) => {
      const nome = normalizarNome(a.nome)
      return depois.startsWith(nome) && !/[\p{L}\p{N}]/u.test(depois.charAt(nome.length))
    })
    if (agente && !mencionados.includes(agente)) mencionados.push(agente)
  }
  return mencionados
}

/**
 * Para o autocompletar: os Agentes cujo nome começa pelo que foi digitado depois do último @.
 * Um nome completo seguido de espaço é uma Menção pronta, e não abre mais sugestões.
 */
export function sugerirMencoes<A extends { nome: string }>(texto: string, agentes: A[]): A[] {
  const arroba = texto.lastIndexOf('@')
  if (arroba === -1) return []
  const digitado = normalizarNome(texto.slice(arroba + 1))
  const completo = /\s$/.test(digitado) && agentes.some((a) => normalizarNome(a.nome) === digitado.trim())
  if (completo) return []
  return agentes.filter((a) => normalizarNome(a.nome).startsWith(digitado))
}

/** Troca o que foi digitado depois do último @ pela Menção completa do Agente escolhido. */
export function completarMencao(texto: string, nome: string): string {
  return `${texto.slice(0, texto.lastIndexOf('@'))}@${nome} `
}

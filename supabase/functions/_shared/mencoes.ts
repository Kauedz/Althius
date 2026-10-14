// Reconhecimento de Menções (@Agente) no servidor, com a mesma regra do app (`projeto-althius-frontend/src/fonte/
// mencoes.ts`): um Agente que responde pode chamar outro escrevendo "@Nome" no texto (PR-11, mencoes-multiagente).

/** Compara nomes sem diferenciar maiúsculas, o "·" dos Agentes criados nem espaços repetidos. */
export function normalizarNome(texto: string): string {
  return texto.toLocaleLowerCase('pt-BR').replace(/·/g, ' ').replace(/\s+/g, ' ')
}

/**
 * Os Agentes mencionados com @Nome no texto, na ordem em que aparecem, sem repetir. O nome mais longo vence:
 * "@Scopus · Enterprise LATAM" é o Agente criado, e "@Scopus", o Agente padrão.
 */
export function reconhecerMencoes<A extends { name: string }>(texto: string, agentes: A[]): A[] {
  const doMaisLongo = [...agentes].sort((a, b) => b.name.length - a.name.length)
  const mencionados: A[] = []
  for (const trecho of texto.split('@').slice(1)) {
    const depois = normalizarNome(trecho)
    const agente = doMaisLongo.find((a) => {
      const nome = normalizarNome(a.name)
      return depois.startsWith(nome) && !/[\p{L}\p{N}]/u.test(depois.charAt(nome.length))
    })
    if (agente && !mencionados.includes(agente)) mencionados.push(agente)
  }
  return mencionados
}

// Redação de segredos: o erro real de uma fonte é guardado para quem investiga, mas nunca com um token, um cabeçalho
// Authorization nem um valor que pareça chave. O mesmo vale para o que vai para o log.

const PADROES = [
  /apify_api_[A-Za-z0-9]{6,}/g,
  /bearer\s+[A-Za-z0-9._~+/=-]{12,}/gi,
  /sk-[A-Za-z0-9_-]{8,}/g,
]

export const LIMITE_DO_ERRO_REAL = 1800

/** O texto sem os tokens dados nem nada que pareça chave, cortado no tamanho que a coluna aceita. */
export function redigir(texto: unknown, tokens: string[] = [], limite = LIMITE_DO_ERRO_REAL): string {
  let t = typeof texto === 'string' ? texto : texto === undefined || texto === null ? '' : JSON.stringify(texto)
  for (const token of tokens) if (token) t = t.split(token).join('[token]')
  for (const p of PADROES) t = t.replace(p, '[token]')
  t = t.replace(/\s+/g, ' ').trim()
  return t.length <= limite ? t : `${t.slice(0, limite - 1)}…`
}

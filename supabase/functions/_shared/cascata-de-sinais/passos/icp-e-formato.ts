// Como o ICP E escreve valores, datas e nomes nas frases e nas evidências dos Sinais (pt-BR, curtos, com o número do fato).

/** "R$ 10,7 mi", "R$ 1,2 bi", "R$ 350 mil", "R$ 800"; com `exato`, o valor inteiro com separador de milhar ("R$ 1.734.625"). */
export function reais(n: number, exato = false): string {
  if (exato) return `R$ ${Math.round(n).toLocaleString('pt-BR')}`
  const curto = (v: number, sufixo: string) => `R$ ${v.toFixed(1).replace('.', ',').replace(/,0$/, '')} ${sufixo}`
  if (n >= 1e9) return curto(n / 1e9, 'bi')
  if (n >= 1e6) return curto(n / 1e6, 'mi')
  if (n >= 1e3) return `R$ ${Math.round(n / 1e3)} mil`
  return `R$ ${Math.round(n)}`
}

/** "2026-08-31T12:00:00.000Z" (ou "2026-08-31") em "31/08/2026". */
export function dataBr(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

const MINUSCULAS = new Set(['e', 'de', 'da', 'do', 'das', 'dos', 'em', 'para', 'a', 'o'])

/** "BNDES MÁQUINAS E SERVIÇOS" em "BNDES Máquinas e Serviços": caixa de título, mantendo a sigla BNDES. */
export function legivel(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim().toLowerCase().split(' ').filter(Boolean)
    .map((p, i) => (p === 'bndes' ? 'BNDES' : i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(' ')
}

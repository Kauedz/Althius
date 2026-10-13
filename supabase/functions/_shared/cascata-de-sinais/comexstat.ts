// A API aberta do Comex Stat (MDIC, api-comexstat.mdic.gov.br): estatística de comércio exterior agregada por produto (NCM),
// estado, país e unidade da Receita (porto/aeroporto), sem empresa. Formato conferido contra a API em 13/10/2026:
//   POST /general  { flow: "import"|"export", monthDetail, period: { from: "AAAA-MM", to: "AAAA-MM" },
//                    filters: [{ filter: "chapter"|"ncm"|"state"|"country"|"urf"..., values: [...] }],
//                    details: ["ncm"|"urf"|"country"|"state"...], metrics: ["metricFOB", "metricKG", "metricStatistic"] }
//   -> { data: { list: [{ year, monthNumber?, <detalhe>, metricFOB, metricKG }] } }   (valores como texto)
//   GET /general/dates/updated -> { data: { updated, year, monthNumber } }  (o último mês com dado)
// O limite da API é uma requisição a cada 10 segundos (429 com "tente novamente em 10 segundos"): este cliente espaça as suas.
import { lerJson } from './fonte-publica.ts'

const BASE = 'https://api-comexstat.mdic.gov.br'

export interface PedidoGeral {
  fluxo: 'import' | 'export'
  porMes: boolean
  de: string
  ate: string
  filtros: { filter: string; values: (string | number)[] }[]
  detalhes: string[]
  metricas?: string[]
}

export type LinhaDoComexStat = Record<string, string>

export interface ClienteComexStat {
  /** O último mês com dado publicado. */
  ultimoMes(): Promise<{ ano: number; mes: number }>
  geral(pedido: PedidoGeral): Promise<LinhaDoComexStat[]>
}

export function clienteComexStat(
  { fetchFn = fetch, dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)), esperaMs = 10_000 }: {
    fetchFn?: typeof fetch
    dormir?: (ms: number) => Promise<void>
    esperaMs?: number
  } = {},
): ClienteComexStat {
  let primeira = true
  async function espacar() {
    if (!primeira) await dormir(esperaMs)
    primeira = false
  }
  const corpoDe = (d: unknown): LinhaDoComexStat[] => {
    const lista = ((d as { data?: { list?: unknown } } | null)?.data?.list)
    return Array.isArray(lista) ? lista as LinhaDoComexStat[] : []
  }
  return {
    async ultimoMes() {
      await espacar()
      const d = await lerJson(`${BASE}/general/dates/updated`, { fetchFn, dormir, esperaMs }) as { data?: { year?: string; monthNumber?: string } }
      const ano = Number(d?.data?.year)
      const mes = Number(d?.data?.monthNumber)
      if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12) throw new Error('O Comex Stat não informou o último mês.')
      return { ano, mes }
    },
    async geral(p) {
      await espacar()
      const d = await lerJson(`${BASE}/general`, {
        fetchFn, dormir, esperaMs,
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            flow: p.fluxo,
            monthDetail: p.porMes,
            period: { from: p.de, to: p.ate },
            filters: p.filtros,
            details: p.detalhes,
            metrics: p.metricas ?? ['metricFOB', 'metricKG'],
          }),
        },
      })
      return corpoDe(d)
    },
  }
}

/** "AAAA-MM" de um ano e mês, somando (ou subtraindo) meses. */
export function mesMais(ano: number, mes: number, delta: number): string {
  const total = ano * 12 + (mes - 1) + delta
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

/** O último dia do mês, em ISO 8601 (UTC). */
export function fimDoMes(ano: number, mes: number): string {
  return new Date(Date.UTC(ano, mes, 0, 12)).toISOString()
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
export const nomeDoMes = (ano: number, mes: number) => `${MESES[mes - 1]}/${ano}`

/** US$ em texto curto: "US$ 1,2 mi", "US$ 3,4 bi", "US$ 850 mil". */
export function dolares(v: number): string {
  const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: n < 10 ? 1 : 0 })
  if (v >= 1e9) return `US$ ${fmt(v / 1e9)} bi`
  if (v >= 1e6) return `US$ ${fmt(v / 1e6)} mi`
  if (v >= 1e3) return `US$ ${Math.round(v / 1e3).toLocaleString('pt-BR')} mil`
  return `US$ ${Math.round(v)}`
}

/** O NCM de 8 dígitos com pontos: 84799999 → 8479.99.99. */
export function ncmComPontos(coNcm: string): string {
  return /^\d{8}$/.test(coNcm) ? `${coNcm.slice(0, 4)}.${coNcm.slice(4, 6)}.${coNcm.slice(6)}` : coNcm
}

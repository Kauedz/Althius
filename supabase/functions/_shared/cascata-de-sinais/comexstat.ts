// A API aberta do Comex Stat (MDIC, api-comexstat.mdic.gov.br): estatística de comércio exterior agregada por produto (NCM),
// estado, país e unidade da Receita (porto/aeroporto), sem empresa. Formato conferido contra a API em 13/10/2026:
//   POST /general  { flow: "import"|"export", monthDetail, period: { from: "AAAA-MM", to: "AAAA-MM" },
//                    filters: [{ filter: "chapter"|"ncm"|"state"|"country"|"urf"..., values: [...] }],
//                    details: ["ncm"|"urf"|"country"|"state"...], metrics: ["metricFOB", "metricKG", "metricStatistic"] }
//   -> { data: { list: [{ year, monthNumber?, <detalhe>, metricFOB, metricKG }] } }   (valores como texto)
//   GET /general/dates/updated -> { data: { updated, year, monthNumber } }  (o último mês com dado)
// O limite da API é uma requisição a cada 10 segundos (429): este cliente espera 12 s entre consultas bem-sucedidas e,
// no 429, espera 10 s, depois 20 s e depois 40 s, sem passar do prazo da função. Se o limite continuar, adia a execução.
// O dado muda uma vez por mês: a cópia do mês de referência dispensa a rede.
import { ErroDeFontePublica, FonteAdiada } from './fonte-publica.ts'

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

const ESPERA_MS = 12_000
const ESPERAS_NO_429_MS = [10_000, 20_000, 40_000]
const REPETICOES_NO_ERRO = 3
/** Folga para a função ainda conseguir fechar a execução depois da espera. */
const FOLGA_DA_ESPERA_MS = 5_000

/** Cópia mensal já guardada. A chave é da consulta; o mês é o de referência (calendário, em `ultimoMes`). */
export interface CacheDaConsulta {
  ler(chave: string, mes: string | null): Promise<unknown | null>
  gravar(chave: string, mes: string, payload: unknown): Promise<void>
}

/** "AAAA-MM" do calendário UTC. */
export function mesCalendario(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function mesPublicadoDe(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}`
}

function lerAnoMes(d: unknown): { ano: number; mes: number } | null {
  const data = (d as { data?: { year?: string; monthNumber?: string } } | null)?.data
  const ano = Number(data?.year)
  const mes = Number(data?.monthNumber)
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12) return null
  return { ano, mes }
}

/** A chave estável da consulta geral: a ordem dos campos não depende de quem montou o pedido. */
export function chaveDoGeral(p: PedidoGeral): string {
  return JSON.stringify({
    fluxo: p.fluxo,
    porMes: p.porMes,
    de: p.de,
    ate: p.ate,
    filtros: p.filtros,
    detalhes: p.detalhes,
    metricas: p.metricas ?? ['metricFOB', 'metricKG'],
  })
}

export function clienteComexStat(
  {
    fetchFn = fetch,
    dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
    esperaMs = ESPERA_MS,
    relogio = () => Date.now(),
    mesDaCopia = () => mesCalendario(relogio()),
    cache,
    prazoFinal,
  }: {
    fetchFn?: typeof fetch
    dormir?: (ms: number) => Promise<void>
    esperaMs?: number
    /** Relógio do prazo (anda enquanto a função espera). */
    relogio?: () => number
    /** "AAAA-MM" da cópia do último mês publicado. O padrão é o mês do relógio. */
    mesDaCopia?: () => string
    cache?: CacheDaConsulta
    /** Hora limite da função, em ms. Uma espera que não caberia nela adia a consulta. */
    prazoFinal?: number
  } = {},
): ClienteComexStat {
  let primeira = true
  let mesPublicado: string | null = null

  const cabe = (espera: number) => prazoFinal === undefined || relogio() + espera + FOLGA_DA_ESPERA_MS <= prazoFinal

  async function esperar(ms: number, adiar: boolean) {
    if (!cabe(ms)) {
      if (adiar) throw new FonteAdiada()
      throw new ErroDeFontePublica(null, 'A fonte pública não respondeu.')
    }
    await dormir(ms)
  }

  async function copiar(chave: string, mes: string | null): Promise<unknown | null> {
    if (!cache) return null
    try {
      const valor = await cache.ler(chave, mes)
      return valor ?? null
    } catch {
      return null
    }
  }

  async function guardar(chave: string, mes: string, payload: unknown) {
    if (!cache) return
    try {
      await cache.gravar(chave, mes, payload)
    } catch {
      // A resposta já está em mãos; a cópia é só para a próxima execução.
    }
  }

  async function pedir(url: string, init?: RequestInit): Promise<unknown> {
    if (!primeira) await esperar(esperaMs, true)
    primeira = false
    let no429 = 0
    let noErro = 0
    for (;;) {
      let resposta: Response
      try {
        resposta = await fetchFn(url, init)
      } catch {
        if (noErro >= REPETICOES_NO_ERRO) throw new ErroDeFontePublica(null, 'A fonte pública não respondeu.')
        noErro++
        await esperar(esperaMs, false)
        continue
      }
      if (resposta.ok) {
        try {
          return await resposta.json()
        } catch {
          throw new ErroDeFontePublica(resposta.status, 'A fonte pública devolveu um corpo ilegível.')
        }
      }
      await resposta.body?.cancel()
      if (resposta.status === 429) {
        if (no429 >= ESPERAS_NO_429_MS.length) throw new FonteAdiada()
        const espera = ESPERAS_NO_429_MS[no429]
        no429++
        await esperar(espera, true)
        continue
      }
      if (resposta.status >= 500) {
        if (noErro >= REPETICOES_NO_ERRO) {
          throw new ErroDeFontePublica(resposta.status, `A fonte pública respondeu HTTP ${resposta.status}.`)
        }
        noErro++
        await esperar(esperaMs, false)
        continue
      }
      throw new ErroDeFontePublica(resposta.status, `A fonte pública respondeu HTTP ${resposta.status}.`)
    }
  }

  const corpoDe = (d: unknown): LinhaDoComexStat[] => {
    const lista = ((d as { data?: { list?: unknown } } | null)?.data?.list)
    return Array.isArray(lista) ? lista as LinhaDoComexStat[] : []
  }
  const corpoDoGeral = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }
  return {
    async ultimoMes() {
      const mesRef = mesDaCopia()
      const copiado = await copiar('dates/updated', mesRef)
      const d = copiado ?? await pedir(`${BASE}/general/dates/updated`)
      const lido = lerAnoMes(d)
      if (!lido) throw new Error('O Comex Stat não informou o último mês.')
      mesPublicado = mesPublicadoDe(lido.ano, lido.mes)
      if (copiado === null) await guardar('dates/updated', mesRef, d)
      return lido
    },
    async geral(p) {
      const mesRef = mesPublicado ?? p.ate
      const chave = chaveDoGeral(p)
      const copiado = await copiar(chave, mesRef)
      if (copiado !== null) return corpoDe(copiado)
      const metricas = p.metricas ?? ['metricFOB', 'metricKG']
      const d = await pedir(`${BASE}/general`, {
        ...corpoDoGeral,
        body: JSON.stringify({
          flow: p.fluxo,
          monthDetail: p.porMes,
          period: { from: p.de, to: p.ate },
          filters: p.filtros,
          details: p.detalhes,
          metrics: metricas,
        }),
      })
      await guardar(chave, mesRef, d)
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

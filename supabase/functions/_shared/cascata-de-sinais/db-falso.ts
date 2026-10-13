// O banco da cascata em memória, para os testes do motor: registra o que o motor abriu, fechou e gravou. Imita o que
// importa do banco real: a mesma chave devolve a mesma execução, e o mesmo acontecimento é gravado uma vez só.
import type { CascataDef, ContaDoWorkspace, DbDaCascata, ResultadoDaAbertura, SinalConfirmado, SinalDeMercado } from './tipos.ts'

export interface PassoRegistrado {
  id: string
  ordem: number
  tentativa: number
  handler: string
  kind: string
  actorId: string | null
  itensEntrada: number
  fim?: Parameters<DbDaCascata['fecharPasso']>[0]
}

export function dbFalso(
  definicao: CascataDef | null,
  opcoes: {
    contas?: ContaDoWorkspace[]
    abertura?: Partial<ResultadoDaAbertura>
    usdPorCredito?: number
    falhaAoGravar?: (s: SinalConfirmado) => boolean
    /** Fotografias que já existiam, por chave (a mais recente por último). */
    fotografias?: Record<string, { takenAt: string; data: Record<string, unknown> }[]>
  } = {},
) {
  const passos: PassoRegistrado[] = []
  const sinais: { contaId: string; monitorId: string | null; sinal: SinalConfirmado; novo: boolean }[] = []
  const aberturas: Parameters<DbDaCascata['abrir']>[0][] = []
  const fechamentos: Parameters<DbDaCascata['fechar']>[0][] = []
  const conhecidos = new Set<string>()
  const mercado: SinalDeMercado[] = []
  const fotografias = new Map<string, { takenAt: string; data: Record<string, unknown> }[]>(Object.entries(opcoes.fotografias ?? {}).map(([k, v]) => [k, v]))
  const gravadas: { chave: string; data: Record<string, unknown>; takenAt?: string }[] = []
  const amostras: { runId: string; amostra: { cnpj: string | null; nome: string }[] }[] = []
  const copias: { fonte: string; chave: string; mes: string; payload: unknown; fetchedAt: number }[] = []
  const DIAS_40 = 40 * 24 * 60 * 60 * 1000
  let proximoPasso = 1
  const db: DbDaCascata = {
    definicao: () => Promise.resolve(definicao),
    configuracao: () => Promise.resolve({ usdPorCredito: opcoes.usdPorCredito ?? 0.3, limiteDiario: 50 }),
    contas: (_ws, ids) => Promise.resolve((opcoes.contas ?? []).filter((c) => !ids || ids.includes(c.id))),
    abrir: (args) => {
      aberturas.push(args)
      return Promise.resolve({ outcome: 'go', runId: 'run-db-1', estCredits: 3, capUsd: definicao?.capUsd ?? 0.5, ...opcoes.abertura })
    },
    fechar: (args) => {
      fechamentos.push(args)
      if (args.estado === 'adiado') return Promise.resolve({ creditosCobrados: 0 })
      const creditos = args.custoUsd === null ? 0 : Math.floor(args.custoUsd * (definicao?.multiplier ?? 3) / (opcoes.usdPorCredito ?? 0.3))
      return Promise.resolve({ creditosCobrados: args.novos > 0 ? Math.max(creditos, 1) : creditos })
    },
    gravarAmostraValidacao: (a) => {
      amostras.push(a)
      return Promise.resolve()
    },
    abrirPasso: (a) => {
      const id = `passo-${proximoPasso++}`
      passos.push({ id, ordem: a.ordem, tentativa: a.tentativa, handler: a.handler, kind: a.kind, actorId: a.actorId, itensEntrada: a.itensEntrada })
      return Promise.resolve(id)
    },
    fecharPasso: (a) => {
      const p = passos.find((x) => x.id === a.passoId)
      if (p) p.fim = a
      return Promise.resolve()
    },
    gravarSinalDeMercado: ({ signalType, sinal }) => {
      const chave = `mercado|${signalType}|${sinal.eventKey}`
      const novo = !conhecidos.has(chave)
      conhecidos.add(chave)
      mercado.push(sinal)
      return Promise.resolve(novo)
    },
    lerSnapshots: ({ chaves, antesDe }) => {
      const mapa = new Map<string, { takenAt: string; data: Record<string, unknown> }>()
      for (const c of chaves) {
        const lista = (fotografias.get(c) ?? []).filter((f) => !antesDe || Date.parse(f.takenAt) < Date.parse(antesDe))
        const ultima = lista.at(-1)
        if (ultima) mapa.set(c, ultima)
      }
      return Promise.resolve(mapa)
    },
    gravarSnapshots: ({ itens }) => {
      gravadas.push(...itens)
      return Promise.resolve()
    },
    lerCache: ({ fonte, chave, mes }) => {
      const daChave = copias.filter((c) => c.fonte === fonte && c.chave === chave)
      if (mes) return Promise.resolve(daChave.findLast((c) => c.mes === mes)?.payload ?? null)
      const limite = Date.now() - DIAS_40
      return Promise.resolve(daChave.findLast((c) => c.fetchedAt >= limite)?.payload ?? null)
    },
    gravarCache: ({ fonte, chave, mes, payload }) => {
      const i = copias.findIndex((c) => c.fonte === fonte && c.chave === chave && c.mes === mes)
      const copia = { fonte, chave, mes, payload, fetchedAt: Date.now() }
      if (i >= 0) copias[i] = copia
      else copias.push(copia)
      return Promise.resolve()
    },
    gravarSinal: ({ contaId, monitorId, signalType, sinal }) => {
      if (opcoes.falhaAoGravar?.(sinal)) return Promise.reject(new Error('o banco recusou o Sinal'))
      const chave = `${contaId}|${signalType}|${sinal.eventKey}`
      const novo = !conhecidos.has(chave)
      conhecidos.add(chave)
      sinais.push({ contaId, monitorId, sinal, novo })
      return Promise.resolve(novo)
    },
  }
  return { db, passos, sinais, aberturas, fechamentos, mercado, gravadas, amostras }
}

/** Uma cascata sintética para os testes do motor. */
export function cascataDeTeste(extra: Partial<CascataDef> = {}): CascataDef {
  return {
    id: 'cascata-teste',
    signalType: 'teste_em_cascata',
    icp: 'A',
    name: 'Teste em cascata',
    version: 1,
    state: 'available',
    semFonteMotivo: null,
    scope: 'conta',
    multiplier: 3,
    capUsd: 0.5,
    capCredits: null,
    cadenceHours: 24,
    maxAccounts: 100,
    steps: [
      { ordem: 1, kind: 'actor', handler: 'gerar', actorId: 'time~um', fallbacks: [], inputTemplate: {}, priceModel: 'PAY_PER_EVENT', estFixedUsd: 0.001, estPerItemUsd: 0.002, estItems: 10, maxItems: 10 },
      { ordem: 2, kind: 'regra', handler: 'dedupe', actorId: null, fallbacks: [], inputTemplate: {}, priceModel: 'NONE', estFixedUsd: 0, estPerItemUsd: 0, estItems: 0, maxItems: null },
      { ordem: 3, kind: 'actor', handler: 'enriquecer', actorId: 'time~dois', fallbacks: [], inputTemplate: {}, priceModel: 'PAY_PER_EVENT', estFixedUsd: 0.001, estPerItemUsd: 0.004, estItems: 5, maxItems: 10 },
      { ordem: 4, kind: 'regra', handler: 'sinalizar', actorId: null, fallbacks: [], inputTemplate: {}, priceModel: 'NONE', estFixedUsd: 0, estPerItemUsd: 0, estItems: 0, maxItems: null },
    ],
    ...extra,
  }
}

// ICP A, fora o A1 (vaga de comex): dois Sinais de MERCADO pela API aberta do Comex Stat (MDIC) e dois sem fonte.
//   ncm_nova_na_pauta (A3)  uma NCM dos capítulos acompanhados que importou nos últimos meses e não importou nos 12 anteriores
//   volume_por_porto  (A4)  o porto ou aeroporto cujo volume importado do mês subiu sobre a média dos 3 meses anteriores
//   novo_importador   (A2)  sem fonte: o MDIC não publica a lista de importadoras por CNPJ (sigilo fiscal; decisão da
//                           CGU/CMRI 467/2024); o Comex Stat é agregado, sem empresa
//   habilitacao_radar (A5)  sem fonte: a consulta é individual, por CNPJ, e exige verificação humana
// Sem empresa e sem custo de fonte: o Sinal vai para o feed do Workspace, não para uma Conta.
import { dolares, fimDoMes, type LinhaDoComexStat, mesMais, ncmComPontos, nomeDoMes, clienteComexStat } from '../comexstat.ts'
import type { ContextoDoPasso, FontePublica, ImplDoPasso, Item, RegistroDePassos } from '../tipos.ts'
import { listaDoPasso, objeto, texto } from './comum.ts'

const FONTE = 'Comex Stat (MDIC)'
const MAX_SINAIS_POR_RODADA = 15
const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function capitulos(ctx: ContextoDoPasso): number[] {
  const lista = listaDoPasso(ctx, 'capitulos', 'capitulos').map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 99)
  return lista.length ? lista : [84, 85]
}

function limiar(ctx: ContextoDoPasso, chave: string, padrao: number): number {
  const v = Number(ctx.criterios[chave] ?? ctx.def.inputTemplate[chave])
  return Number.isFinite(v) && v >= 0 ? v : padrao
}

type Opcoes = { dormir?: (ms: number) => Promise<void>; esperaMs?: number }

/** "0817800 - PORTO DE SANTOS" → { cod: "0817800", nome: "Porto de Santos" }. */
function portoDaUrf(urf: string): { cod: string; nome: string } {
  const [cod, ...resto] = urf.split(' - ')
  const nome = (resto.join(' - ') || urf).toLowerCase().split(' ')
    .map((p, i) => (i > 0 && ['de', 'do', 'da', 'dos', 'das', 'e'].includes(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(' ')
  return { cod: cod.trim(), nome }
}

export function passosDoIcp_a_resto(fetchFn: typeof fetch = fetch, opcoes: Opcoes = {}): RegistroDePassos {
  const comex = () => clienteComexStat({ fetchFn, ...opcoes })

  // A3, passo 1: as importações por NCM dos capítulos nos últimos N meses e nos 12 meses anteriores a eles.
  const comexstatNcmJanelas: FontePublica = {
    async buscar(_entrada, ctx) {
      const meses = Math.min(Math.max(Math.round(limiar(ctx, 'meses', 3)), 1), 6)
      const filtros = [{ filter: 'chapter', values: capitulos(ctx) }]
      const c = comex()
      const { ano, mes } = await c.ultimoMes()
      const recenteDe = mesMais(ano, mes, -(meses - 1))
      const recenteAte = mesMais(ano, mes, 0)
      const recente = await c.geral({ fluxo: 'import', porMes: false, de: recenteDe, ate: recenteAte, filtros, detalhes: ['ncm'] })
      if (recente.length === 0) return []
      const baseDe = mesMais(ano, mes, -(meses - 1) - 12)
      const baseAte = mesMais(ano, mes, -meses)
      const base = await c.geral({ fluxo: 'import', porMes: false, de: baseDe, ate: baseAte, filtros, detalhes: ['ncm'] })
      const somar = (linhas: LinhaDoComexStat[], janela: 'recente' | 'base', de: string, ate: string): Item[] => {
        const por = new Map<string, { nome: string; fob: number; kg: number }>()
        for (const l of linhas) {
          const co = texto(l.coNcm)
          if (!co) continue
          const a = por.get(co) ?? { nome: texto(l.ncm), fob: 0, kg: 0 }
          a.fob += num(l.metricFOB)
          a.kg += num(l.metricKG)
          por.set(co, a)
        }
        return [...por].map(([coNcm, v]) => ({ tipo: 'ncm_janela', janela, coNcm, nome: v.nome, fob: v.fob, kg: v.kg, de, ate, ano, mes }))
      }
      return [...somar(recente, 'recente', recenteDe, recenteAte), ...somar(base, 'base', baseDe, baseAte)]
    },
  }

  // A3, passo 2: a NCM com FOB relevante na janela recente e nenhum na base é "nova na pauta".
  const ncmsNovasNaPauta: ImplDoPasso = {
    executar(entrada, ctx) {
      const piso = limiar(ctx, 'limiarFobUsd', 100_000)
      const base = new Set(entrada.filter((i) => i.janela === 'base' && num(i.fob) > 0).map((i) => texto(i.coNcm)))
      return entrada
        .filter((i) => i.tipo === 'ncm_janela' && i.janela === 'recente' && num(i.fob) >= piso && !base.has(texto(i.coNcm)))
        .sort((a, b) => num(b.fob) - num(a.fob))
        .slice(0, MAX_SINAIS_POR_RODADA)
        .map((i): Item => {
          const [ano, mes] = [num(i.ano), num(i.mes)]
          const [deA, deM] = texto(i.de).split('-').map(Number)
          const janela = `${nomeDoMes(deA, deM)} a ${nomeDoMes(ano, mes)}`
          return {
            eventKey: `ncm|${texto(i.coNcm)}|${mesMais(ano, mes, 0)}`,
            phrase: `NCM ${ncmComPontos(texto(i.coNcm))} entrou na pauta de importação: ${dolares(num(i.fob))} de FOB em ${janela}, sem importação nos 12 meses anteriores`,
            firedAt: fimDoMes(ano, mes),
            source: FONTE,
            evidence: `${texto(i.nome)}. Importado em ${janela}: ${dolares(num(i.fob))} de FOB e ${Math.round(num(i.kg)).toLocaleString('pt-BR')} kg líquidos; nenhuma importação desta NCM nos 12 meses anteriores a essa janela.`,
            payload: { coNcm: texto(i.coNcm), fobUsd: num(i.fob), kg: num(i.kg), janela: { de: texto(i.de), ate: texto(i.ate) } },
          }
        })
    },
  }

  // A4, passo 1: as importações por porto e aeroporto (URF) nos 4 últimos meses.
  const comexstatUrfMensal: FontePublica = {
    async buscar(_entrada, ctx) {
      const c = comex()
      const { ano, mes } = await c.ultimoMes()
      const linhas = await c.geral({
        fluxo: 'import', porMes: true, de: mesMais(ano, mes, -3), ate: mesMais(ano, mes, 0),
        filtros: [{ filter: 'chapter', values: capitulos(ctx) }], detalhes: ['urf'],
      })
      return linhas.map((l): Item => ({
        tipo: 'urf_mes', urf: texto(l.urf), ano: num(l.year), mes: num(l.monthNumber), fob: num(l.metricFOB), kg: num(l.metricKG), ultimoAno: ano, ultimoMes: mes,
      }))
    },
  }

  // A4, passo 2: o mês mais novo contra a média dos 3 anteriores, por porto.
  const volumePorPorto: ImplDoPasso = {
    executar(entrada, ctx) {
      const minimoDeAlta = limiar(ctx, 'variacaoMinima', 0.25)
      const pisoFob = limiar(ctx, 'fobMinimoUsd', 50_000_000)
      const porPorto = new Map<string, { fobDoMes: Map<number, number>; ano: number; mes: number }>()
      for (const i of entrada) {
        if (i.tipo !== 'urf_mes' || !texto(i.urf)) continue
        const p = porPorto.get(texto(i.urf)) ?? { fobDoMes: new Map<number, number>(), ano: num(i.ultimoAno), mes: num(i.ultimoMes) }
        p.fobDoMes.set(num(i.ano) * 12 + num(i.mes), (p.fobDoMes.get(num(i.ano) * 12 + num(i.mes)) ?? 0) + num(i.fob))
        porPorto.set(texto(i.urf), p)
      }
      const sinais: Item[] = []
      for (const [urf, p] of porPorto) {
        const alvo = p.ano * 12 + p.mes
        const atual = p.fobDoMes.get(alvo) ?? 0
        const anteriores = [1, 2, 3].map((d) => p.fobDoMes.get(alvo - d) ?? 0).filter((v) => v > 0)
        if (atual < pisoFob || anteriores.length < 3) continue
        const media = anteriores.reduce((s, v) => s + v, 0) / anteriores.length
        const variacao = Math.round((atual / media - 1) * 1000) / 1000
        if (variacao < minimoDeAlta) continue
        const { cod, nome } = portoDaUrf(urf)
        sinais.push({
          eventKey: `porto|${cod}|${mesMais(p.ano, p.mes, 0)}`,
          phrase: `Importações pelo ${nome} subiram ${Math.round(variacao * 100)}% em ${nomeDoMes(p.ano, p.mes)} sobre a média dos 3 meses anteriores (${dolares(atual)} de FOB)`,
          firedAt: fimDoMes(p.ano, p.mes),
          source: FONTE,
          evidence: `${nome}: ${dolares(atual)} de FOB em ${nomeDoMes(p.ano, p.mes)}, contra média de ${dolares(media)} nos 3 meses anteriores (capítulos acompanhados).`,
          payload: { urf, codigo: cod, fobUsd: atual, mediaAnteriorUsd: Math.round(media), variacao },
        })
      }
      return sinais.sort((a, b) => num(objeto(b.payload).variacao) - num(objeto(a.payload).variacao)).slice(0, 10)
    },
  }

  return {
    passos: { ncms_novas_na_pauta: ncmsNovasNaPauta, volume_por_porto: volumePorPorto },
    fontes: { comexstat_ncm_janelas: comexstatNcmJanelas, comexstat_urf_mensal: comexstatUrfMensal },
  }
}

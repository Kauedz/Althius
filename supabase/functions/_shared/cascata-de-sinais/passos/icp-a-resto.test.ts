// ICP A, fora o A1: NCM nova na pauta (A3) e aumento de volume por porto (A4) — Sinais de MERCADO pela API aberta do Comex
// Stat (sem empresa, sem custo de fonte, no feed do Workspace) — e os Sinais sem fonte (novo importador por CNPJ e Radar).
// O Comex Stat é falso (nunca a rede); os formatos de resposta são os da API conferida em 13/10/2026.
import { assert, assertEquals } from 'jsr:@std/assert@1'
import { dbFalso } from '../db-falso.ts'
import { rodarCascata } from '../motor.ts'
import type { CascataDef, ClienteDaFonte, PassoDef } from '../tipos.ts'
import { MARCA_INTERNA } from '../../marca.ts'
import { passosDoIcp_a_resto } from './icp-a-resto.ts'

const AGORA = Date.parse('2026-10-13T12:00:00Z')
const semFonte: ClienteDaFonte = { rodar: () => Promise.reject(new Error('não devia chamar o Apify')) }

const passo = (ordem: number, kind: 'regra' | 'fonte_publica', handler: string): PassoDef => ({
  ordem, kind, handler, actorId: null, fallbacks: [], inputTemplate: {}, priceModel: kind === 'fonte_publica' ? 'FREE' : 'NONE',
  estFixedUsd: 0, estPerItemUsd: 0, estItems: 0, maxItems: null,
})

const cascata = (signalType: string, steps: PassoDef[]): CascataDef => ({
  id: `c-${signalType}`, signalType, icp: 'A', name: signalType, version: 1, state: 'available', semFonteMotivo: null, scope: 'mercado',
  multiplier: 3, capUsd: 0.05, capCredits: null, cadenceHours: 720, maxAccounts: 200, steps,
})

/** Um Comex Stat falso: guarda cada requisição e responde pelo que foi pedido. */
function comexFalso(responder: (corpo: Record<string, unknown>) => unknown[]) {
  const pedidos: Record<string, unknown>[] = []
  const fetchFn = ((url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    if (u.endsWith('/general/dates/updated')) {
      return Promise.resolve(new Response(JSON.stringify({ data: { updated: '2026-10-06', year: '2026', monthNumber: '09' }, success: true })))
    }
    const corpo = JSON.parse(String(init?.body))
    pedidos.push(corpo)
    return Promise.resolve(new Response(JSON.stringify({ data: { list: responder(corpo) }, success: true })))
  }) as typeof fetch
  return { fetchFn, pedidos }
}

const rodar = (def: CascataDef, fetchFn: typeof fetch, criterios: Record<string, unknown> = {}) => {
  const banco = dbFalso(def, { contas: [] })
  const registro = passosDoIcp_a_resto(fetchFn, { dormir: () => Promise.resolve(), esperaMs: 0 })
  return rodarCascata({ db: banco.db, fonte: semFonte, registro, agora: () => AGORA, log: () => {} }, {
    workspaceId: 'ws-1', userId: 'u1', signalType: def.signalType, origem: 'conversa', chave: 'k1', criterios,
  }).then((r) => ({ r, banco }))
}

const DEF_A3 = cascata('ncm_nova_na_pauta', [passo(1, 'fonte_publica', 'comexstat_ncm_janelas'), passo(2, 'regra', 'ncms_novas_na_pauta')])
const DEF_A4 = cascata('volume_por_porto', [passo(1, 'fonte_publica', 'comexstat_urf_mensal'), passo(2, 'regra', 'volume_por_porto')])

const ncm = (coNcm: string, fob: number, nome = `Produto ${coNcm}`) => ({ coNcm, year: '2026', ncm: nome, metricFOB: String(fob), metricKG: '1000' })

Deno.test('A3: a NCM com importação nos últimos 3 meses e nenhuma nos 12 anteriores vira Sinal de mercado', async () => {
  const c = comexFalso((p) => {
    const de = (p.period as { from: string }).from
    return de === '2026-07'
      ? [ncm('84799999', 1_200_000, 'Máquinas novas'), ncm('84713012', 9_000_000), ncm('85011010', 30_000), ncm('85171300', 5_000_000)]
      : [ncm('84713012', 8_000_000), ncm('85171300', 0)]
  })
  const { r, banco } = await rodar(DEF_A3, c.fetchFn)
  assertEquals(r.desfecho, 'concluida')
  // 84799999 é nova (US$ 1,2 mi, sem base); 85011010 fica abaixo do piso; 84713012 já existia; 85171300 tem base zero.
  assertEquals(r.mercado.map((m) => m.eventKey).sort(), ['ncm|84799999|2026-09', 'ncm|85171300|2026-09'])
  const nova = r.mercado.find((m) => m.eventKey === 'ncm|84799999|2026-09')!
  assertEquals(nova.phrase, 'NCM 8479.99.99 entrou na pauta de importação: US$ 1,2 mi de FOB em jul/2026 a set/2026, sem importação nos 12 meses anteriores')
  assertEquals(nova.firedAt, '2026-09-30T12:00:00.000Z')
  assertEquals(nova.source, 'Comex Stat (MDIC)')
  assert(nova.evidence.includes('Máquinas novas'))
  assertEquals((nova.payload as { fobUsd: number }).fobUsd, 1_200_000)
  // As duas janelas: 3 meses recentes e os 12 anteriores, só importação e só os capítulos pedidos.
  assertEquals(c.pedidos.map((p) => (p.period as { from: string; to: string })), [{ from: '2026-07', to: '2026-09' }, { from: '2025-07', to: '2026-06' }])
  assertEquals(c.pedidos[0], {
    flow: 'import', monthDetail: false, period: { from: '2026-07', to: '2026-09' }, filters: [{ filter: 'chapter', values: [84, 85] }],
    details: ['ncm'], metrics: ['metricFOB', 'metricKG'],
  })
  assertEquals(banco.sinais.length, 0, 'Sinal de mercado não vai para uma Conta')
  assertEquals(banco.mercado.length, 2)
  assert(!MARCA_INTERNA.test(JSON.stringify(r)))
})

Deno.test('A3: os capítulos e o piso do pedido valem mais que o padrão; sem nada novo, a execução termina sem Sinal', async () => {
  const c = comexFalso(() => [ncm('84713012', 9_000_000)])
  const { r } = await rodar(DEF_A3, c.fetchFn, { capitulos: ['87'], limiarFobUsd: 5_000_000 })
  assertEquals([r.desfecho, r.mercado.length], ['concluida', 0])
  assertEquals((c.pedidos[0].filters as { values: number[] }[])[0].values, [87])
})

Deno.test('A3: a janela recente vazia encerra a cascata sem consultar a base', async () => {
  const c = comexFalso(() => [])
  const { r } = await rodar(DEF_A3, c.fetchFn)
  assertEquals(r.desfecho, 'concluida')
  assertEquals(c.pedidos.length <= 2, true)
})

const urf = (nome: string, mes: string, fob: number) => ({ year: '2026', monthNumber: mes, urf: nome, metricFOB: String(fob), metricKG: '1000' })

Deno.test('A4: o porto que subiu 25% ou mais sobre a média dos 3 meses anteriores, com volume relevante, vira Sinal de mercado', async () => {
  const SANTOS = '0817800 - PORTO DE SANTOS'
  const ITAJAI = '0927800 - ITAJAI'
  const PEQUENO = '0100100 - PORTO DE ARATU'
  const c = comexFalso(() => [
    urf(SANTOS, '06', 900e6), urf(SANTOS, '07', 1000e6), urf(SANTOS, '08', 1100e6), urf(SANTOS, '09', 1400e6),
    urf(ITAJAI, '06', 250e6), urf(ITAJAI, '07', 250e6), urf(ITAJAI, '08', 250e6), urf(ITAJAI, '09', 260e6),
    urf(PEQUENO, '06', 1e6), urf(PEQUENO, '07', 1e6), urf(PEQUENO, '08', 1e6), urf(PEQUENO, '09', 5e6),
  ])
  const { r } = await rodar(DEF_A4, c.fetchFn)
  assertEquals(r.desfecho, 'concluida')
  assertEquals(r.mercado.map((m) => m.eventKey), ['porto|0817800|2026-09'])
  const m = r.mercado[0]
  // média dos 3 anteriores = 1.000 mi; 1.400 mi é +40%.
  assertEquals(m.phrase, 'Importações pelo Porto de Santos subiram 40% em set/2026 sobre a média dos 3 meses anteriores (US$ 1,4 bi de FOB)')
  assertEquals(m.firedAt, '2026-09-30T12:00:00.000Z')
  assertEquals((m.payload as { variacao: number; mediaAnteriorUsd: number }).variacao, 0.4)
  assertEquals((c.pedidos[0].period as { from: string; to: string }), { from: '2026-06', to: '2026-09' })
  assertEquals([c.pedidos[0].monthDetail, c.pedidos[0].details], [true, ['urf']])
})

Deno.test('A4: o porto sem os 3 meses anteriores não gera Sinal (sem base, sem comparação)', async () => {
  const c = comexFalso(() => [urf('0817800 - PORTO DE SANTOS', '09', 5000e6)])
  const { r } = await rodar(DEF_A4, c.fetchFn)
  assertEquals(r.mercado.length, 0)
})

Deno.test('a Comex Stat fora do ar falha a cascata com mensagem neutra e cobra nada', async () => {
  const fetchFn = (() => Promise.resolve(new Response('erro interno', { status: 500 }))) as typeof fetch
  const { r, banco } = await rodar(DEF_A3, fetchFn)
  assertEquals(r.desfecho, 'falhou')
  assertEquals(r.mensagem, 'A fonte pública está indisponível agora.')
  assertEquals(banco.fechamentos[0].custoUsd, 0)
})

Deno.test('as cascatas sem fonte do ICP A não reservam crédito e explicam o motivo sem citar fornecedor', async () => {
  const motivo = 'O MDIC não publica a lista de importadoras por CNPJ (sigilo fiscal); só há estatística agregada por produto, estado e país.'
  const def: CascataDef = { ...cascata('novo_importador', []), state: 'sem_fonte', semFonteMotivo: motivo, scope: 'conta' }
  const { r, banco } = await rodar(def, (() => Promise.reject(new Error('rede'))) as typeof fetch)
  assertEquals([r.desfecho, r.mensagem, banco.aberturas.length], ['sem_fonte', motivo, 0])
  assert(!MARCA_INTERNA.test(r.mensagem))
})

// ICP G (corretoras de benefícios): as cascatas como a migração as registra, de ponta a ponta contra o Apify falso (nunca a
// rede). Duas cascatas de Conta com fotografia mensal (empresa cruzando faixa de funcionários; nova filial) e três Sinais
// sem fonte. Os passos de código rodam com as definições LIDAS DA MIGRAÇÃO: o que o banco registra é o que o teste executa.
// LGPD: o teste prova que nada além da contagem de funcionários e da lista de filiais (CNPJ de empresa) é guardado.
import { assert, assertEquals } from 'jsr:@std/assert@1'
import { apifyFalso, type ComportamentoDoRun } from '../falso-apify.ts'
import { dbFalso } from '../db-falso.ts'
import { clienteAssincronoDoApify } from '../fonte-apify.ts'
import { rodarCascata } from '../motor.ts'
import { registroDePassos } from './index.ts'
import type { CascataDef, ContaDoWorkspace } from '../tipos.ts'
import { MARCA_INTERNA } from '../../marca.ts'

const AGORA = Date.parse('2026-10-13T12:00:00Z')
const TOKEN = 'apify_api_SEGREDO_DO_ICP_G_0123456789'
const DIA = 86_400_000
const antes = (dias: number) => new Date(AGORA - dias * DIA).toISOString()
const dataAntes = (dias: number) => antes(dias).slice(0, 10)

// ---------------------------------------------------------------------------------------------------------------------
// As definições vêm da migração.

interface Seed {
  signalType: string
  icp: string
  name: string
  state?: string
  semFonteMotivo?: string
  scope?: string
  capUsd?: number
  cadenceHours?: number
  maxAccounts?: number
  notes?: string
  steps?: {
    ordem: number
    kind: 'actor' | 'fonte_publica' | 'regra'
    handler: string
    actorId?: string
    fallbacks?: CascataDef['steps'][number]['fallbacks']
    inputTemplate?: Record<string, unknown>
    priceModel?: string
    knownPrice?: Record<string, unknown>
    estFixedUsd?: number
    estPerItemUsd?: number
    estItems?: number
    maxItems?: number
  }[]
}

// Os testes leem a migração: precisam de --allow-read (o passo próprio do CI); no `deno test` sem permissão, são ignorados.
const ARQUIVO_DA_MIGRACAO = new URL('../../../../migrations/20261013210000_cascatas_icp_g.sql', import.meta.url)
const podeLer = (await Deno.permissions.query({ name: 'read', path: ARQUIVO_DA_MIGRACAO })).state === 'granted'
const teste = (name: string, fn: () => void | Promise<void>) => Deno.test({ name, ignore: !podeLer, fn })
const MIGRACAO = podeLer ? Deno.readTextFileSync(ARQUIVO_DA_MIGRACAO) : ''
const SEEDS: Seed[] = [...MIGRACAO.matchAll(/\$j\$([\s\S]*?)\$j\$/g)].map((m) => JSON.parse(m[1]))

function defDaMigracao(signalType: string): CascataDef {
  const s = SEEDS.find((x) => x.signalType === signalType)
  if (!s) throw new Error(`a migração não registra ${signalType}`)
  return {
    id: `c-${s.signalType}`, signalType: s.signalType, icp: s.icp, name: s.name, version: 1,
    state: (s.state ?? 'testing') as CascataDef['state'], semFonteMotivo: s.semFonteMotivo ?? null,
    scope: (s.scope ?? 'conta') as CascataDef['scope'], multiplier: 3, capUsd: s.capUsd ?? 0.5, capCredits: null,
    cadenceHours: s.cadenceHours ?? 24, maxAccounts: s.maxAccounts ?? 200,
    steps: (s.steps ?? []).map((p) => ({
      ordem: p.ordem, kind: p.kind, handler: p.handler, actorId: p.actorId ?? null, fallbacks: p.fallbacks ?? [],
      inputTemplate: p.inputTemplate ?? {}, priceModel: p.priceModel ?? 'NONE', estFixedUsd: p.estFixedUsd ?? 0,
      estPerItemUsd: p.estPerItemUsd ?? 0, estItems: p.estItems ?? 0, maxItems: p.maxItems ?? null,
    })),
  }
}

type Fotografias = Record<string, { takenAt: string; data: Record<string, unknown> }[]>

function cenario(
  signalType: string,
  porActor: Record<string, ComportamentoDoRun>,
  opcoes: { contas: ContaDoWorkspace[]; fotografias?: Fotografias },
) {
  const fake = apifyFalso((_token, actorId) => porActor[actorId] ?? { itens: [], usageTotalUsd: 0 })
  const logs: unknown[] = []
  const fonte = clienteAssincronoDoApify({ tokens: [TOKEN], fetchFn: fake.fetchFn, dormir: () => Promise.resolve(), esperaDoCustoMs: 0, log: (c) => logs.push(c) })
  const fetchPublico = (() => Promise.reject(new Error('o ICP G não usa fonte pública'))) as typeof fetch
  const banco = dbFalso(defDaMigracao(signalType), { contas: opcoes.contas, fotografias: opcoes.fotografias })
  const rodar = (extra: Record<string, unknown> = {}) =>
    rodarCascata({ db: banco.db, fonte, registro: registroDePassos(fetchPublico), agora: () => AGORA, log: (c) => logs.push(c) }, {
      workspaceId: 'ws-1', userId: 'user-1', signalType, origem: 'conversa', chave: 'k1', ...extra,
    })
  const chamadas = () => fake.requisicoes.filter((q) => q.metodo === 'POST')
  return { fake, banco, rodar, logs, chamadas }
}

const ALFA: ContaDoWorkspace = {
  id: 'conta-alfa', name: 'Alfa Indústria S.A.', domain: 'alfa.test', linkedinUrl: 'https://www.linkedin.com/company/alfa-industria', cnpj: '11.222.333/0001-81',
}
const BETA: ContaDoWorkspace = {
  id: 'conta-beta', name: 'Beta Serviços Ltda', domain: 'beta.test', linkedinUrl: 'https://www.linkedin.com/company/beta-servicos/?trk=public', cnpj: '22333444000155',
}
const BETA_FILIAL: ContaDoWorkspace = {
  id: 'conta-beta-2', name: 'Beta Serviços Contábeis', domain: null, linkedinUrl: null, cnpj: '22.333.444/0002-36',
}
const GAMA: ContaDoWorkspace = { id: 'conta-gama', name: 'Gama Logística', domain: null, linkedinUrl: 'https://www.linkedin.com/company/gama-logistica', cnpj: null }
const DELTA: ContaDoWorkspace = { id: 'conta-delta', name: 'Delta Comércio', domain: 'delta.test', linkedinUrl: null, cnpj: '44555666000177' }

// ---------------------------------------------------------------------------------------------------------------------
// A migração.

teste('a migração registra os cinco Sinais do ICP G: dois em teste com cascata e três sem fonte', () => {
  assertEquals(
    SEEDS.map((s) => `${s.signalType}:${s.state ?? 'testing'}:${s.scope ?? 'conta'}`).sort(),
    [
      'caged_por_empresa:sem_fonte:conta',
      'cruzando_faixa_de_headcount:testing:conta',
      'frota_crescendo:sem_fonte:conta',
      'nova_filial_icp_g:testing:conta',
      'renovacao_de_apolice:sem_fonte:conta',
    ],
  )
  assert(SEEDS.every((s) => s.icp === 'G'))
  for (const s of SEEDS.filter((x) => x.state === 'sem_fonte')) {
    assertEquals(s.steps ?? [], [], `${s.signalType}: Sinal sem fonte não tem passos`)
    assert((s.semFonteMotivo ?? '').length > 40, `${s.signalType}: o motivo precisa explicar`)
  }
})

teste('todo passo do ICP G tem o handler registrado (com prefixo g_), plano Free, e o pior caso cabe no teto', () => {
  const registro = registroDePassos()
  for (const s of SEEDS.filter((x) => x.state !== 'sem_fonte')) {
    const def = defDaMigracao(s.signalType)
    let pior = 0
    for (const p of def.steps) {
      assert(p.handler.startsWith('g_'), `${p.handler}: handler do ICP G leva o prefixo g_`)
      assert(p.kind === 'fonte_publica' ? registro.fontes[p.handler] : registro.passos[p.handler], `${p.handler} não está no registro`)
      if (p.kind === 'actor') {
        assert(p.priceModel === 'PAY_PER_EVENT', `${p.handler}: só preço por evento (nada de aluguel mensal)`)
        assert(p.maxItems !== null, `${p.handler}: todo passo de actor tem teto de itens`)
        pior += p.estFixedUsd + p.estPerItemUsd * (p.maxItems ?? 0)
      }
    }
    assert(pior <= def.capUsd, `${s.signalType}: pior caso US$ ${pior} passa do teto US$ ${def.capUsd}`)
  }
})

teste('nenhum texto do ICP G que o usuário ou o Hermes lê cita fornecedor de coleta', () => {
  for (const s of SEEDS) {
    assert(!MARCA_INTERNA.test(JSON.stringify([s.name, s.notes ?? '', s.semFonteMotivo ?? ''])), s.signalType)
  }
})

teste('os três Sinais sem fonte não reservam crédito e dizem o motivo em palavras do produto', async () => {
  for (const tipo of ['renovacao_de_apolice', 'frota_crescendo', 'caged_por_empresa']) {
    const def = defDaMigracao(tipo)
    assertEquals(def.state, 'sem_fonte')
    const c = cenario(tipo, {}, { contas: [ALFA] })
    const r = await c.rodar()
    assertEquals([r.desfecho, r.mensagem, c.banco.aberturas.length, c.chamadas().length], ['sem_fonte', def.semFonteMotivo, 0, 0], tipo)
    assert(!MARCA_INTERNA.test(r.mensagem))
  }
  assert(defDaMigracao('caged_por_empresa').semFonteMotivo!.includes('CNPJ'))
  assert(defDaMigracao('frota_crescendo').semFonteMotivo!.includes('RENAVAM'))
  assert(defDaMigracao('frota_crescendo').semFonteMotivo!.includes('RNTRC'))
})

// ---------------------------------------------------------------------------------------------------------------------
// Cruzando faixa de headcount.

const TIPO_H = 'cruzando_faixa_de_headcount'
const ACTOR_H = 'harvestapi~linkedin-company'

/** O resultado do actor da página da empresa, com campos que NUNCA podem ser guardados (descrição, contato, saúde...). */
const pagina = (slug: string, funcionarios: number | null, extra: Record<string, unknown> = {}) => ({
  id: '165158', universalName: slug, linkedinUrl: `https://www.linkedin.com/company/${slug}`, name: slug, website: `https://${slug}.test/?utm=1`,
  ...(funcionarios === null ? {} : { employeeCount: funcionarios, employeeCountRange: { start: 51 } }),
  description: 'Empresa com plano de saúde para colaboradores, exames admissionais e atestados de saúde ocupacional.',
  specialties: ['plano de saúde', 'saúde ocupacional'], phone: { number: '11999990000' }, followerCount: 1234,
  locations: [{ city: 'São Paulo', line1: 'Rua das Flores, 10', headquarter: true }], ...extra,
})

const foto = (dias: number, funcionarios: number, faixa: number) => ({ takenAt: antes(dias), data: { funcionarios, faixa } })

teste('headcount, 1ª rodada: só grava a base (sem Sinal), enriquece só quem tem página e cobra só o que consultou', async () => {
  const c = cenario(TIPO_H, { [ACTOR_H]: { itens: [pagina('alfa-industria', 41), pagina('beta-servicos', 95), pagina('gama-logistica', 90)], usageTotalUsd: 0.012 } }, {
    contas: [ALFA, BETA, GAMA, DELTA],
  })
  const r = await c.rodar()
  assertEquals([r.desfecho, r.sinais.length, r.novos], ['concluida', 0, 0])
  // Só as Contas com a página do LinkedIn (a Delta não tem), a URL sem parâmetros de rastreio.
  assertEquals(c.chamadas().map((q) => q.caminho.split('/')[3]), [ACTOR_H])
  assertEquals(c.chamadas()[0].corpo, {
    companies: ['https://www.linkedin.com/company/alfa-industria', 'https://www.linkedin.com/company/beta-servicos', 'https://www.linkedin.com/company/gama-logistica'],
  })
  // A base: a contagem e a faixa em que a empresa já estava.
  assertEquals(c.banco.gravadas.map((g) => [g.chave, g.data]), [
    ['conta-alfa', { funcionarios: 41, faixa: 0 }],
    ['conta-beta', { funcionarios: 95, faixa: 50 }],
    ['conta-gama', { funcionarios: 90, faixa: 50 }],
  ])
  assert(c.banco.gravadas.every((g) => g.takenAt === new Date(AGORA).toISOString()))
  assertEquals(c.banco.passos.map((p) => [p.ordem, p.handler, p.fim?.estado]), [
    [1, 'g_contas_para_headcount', 'succeeded'],
    [2, 'g_headcount_linkedin', 'succeeded'],
    [3, 'g_cruzou_faixa_de_funcionarios', 'empty'],
  ])
  assertEquals(r.custoUsd, 0.012)
})

teste('headcount, 2ª rodada: cruzar 50/100/200 vira Sinal da Conta, pela faixa mais alta cruzada, com a contagem antes e depois', async () => {
  const c = cenario(TIPO_H, { [ACTOR_H]: { itens: [pagina('alfa-industria', 63), pagina('beta-servicos', 99), pagina('gama-logistica', 230)], usageTotalUsd: 0.012 } }, {
    contas: [ALFA, BETA, GAMA],
    fotografias: { 'conta-alfa': [foto(40, 41, 0)], 'conta-beta': [foto(35, 95, 50)], 'conta-gama': [foto(50, 90, 50)] },
  })
  const r = await c.rodar()
  assertEquals(r.desfecho, 'concluida')
  assertEquals(r.sinais.map((s) => [s.contaId, s.eventKey, s.phrase]).sort(), [
    ['conta-alfa', 'alfa industria|headcount|50', 'Passou de 50 funcionários: 63 na página da empresa no LinkedIn (eram 41)'],
    // 90 -> 230 cruza 100 e 200: um Sinal só, pela faixa mais alta.
    ['conta-gama', 'gama logistica|headcount|200', 'Passou de 200 funcionários: 230 na página da empresa no LinkedIn (eram 90)'],
  ])
  const alfa = r.sinais.find((s) => s.contaId === 'conta-alfa')!
  assertEquals(alfa.firedAt, new Date(AGORA).toISOString())
  assertEquals(alfa.source, 'LinkedIn (página da empresa)')
  assert(alfa.evidence.includes('41') && alfa.evidence.includes('63') && alfa.evidence.includes('50'), alfa.evidence)
  assert(alfa.evidence.includes('03/09/2026'), `a data da fotografia anterior (40 dias antes) entra na evidência: ${alfa.evidence}`)
  // A fotografia nova substitui a base para a rodada seguinte.
  assertEquals(c.banco.gravadas.map((g) => [g.chave, g.data]).sort(), [
    ['conta-alfa', { funcionarios: 63, faixa: 50 }],
    ['conta-beta', { funcionarios: 99, faixa: 50 }],
    ['conta-gama', { funcionarios: 230, faixa: 200 }],
  ])
  assert(!MARCA_INTERNA.test(JSON.stringify(r)))
  assert(!JSON.stringify(r).includes(TOKEN))
})

teste('headcount: a mesma rodada de novo não grava o Sinal outra vez (eventKey por faixa)', async () => {
  const c = cenario(TIPO_H, { [ACTOR_H]: { itens: [pagina('alfa-industria', 63)], usageTotalUsd: 0.004 } }, {
    contas: [ALFA], fotografias: { 'conta-alfa': [foto(40, 41, 0)] },
  })
  const a = await c.rodar({ chave: 'a' })
  const b = await c.rodar({ chave: 'b' })
  assertEquals([a.novos, a.repetidos, b.novos, b.repetidos], [1, 0, 0, 1])
})

teste('headcount: voltar a cruzar a mesma faixa depois de oscilar gera o mesmo eventKey (a chave não depende do mês nem da contagem)', async () => {
  const sobe = cenario(TIPO_H, { [ACTOR_H]: { itens: [pagina('alfa-industria', 104)], usageTotalUsd: 0.004 } }, { contas: [ALFA], fotografias: { 'conta-alfa': [foto(40, 98, 50)] } })
  const primeira = await sobe.rodar({ chave: 'a' })
  assertEquals(primeira.sinais.map((s) => s.eventKey), ['alfa industria|headcount|100'])
  // Depois de cair para 97 e voltar a 103, a fotografia anterior é a de 97: cruza 100 de novo, com o mesmo eventKey.
  const volta = cenario(TIPO_H, { [ACTOR_H]: { itens: [pagina('alfa-industria', 103)], usageTotalUsd: 0.004 } }, { contas: [ALFA], fotografias: { 'conta-alfa': [foto(40, 97, 50)] } })
  const segunda = await volta.rodar({ chave: 'b' })
  assertEquals(segunda.sinais.map((s) => s.eventKey), ['alfa industria|headcount|100'])
})

teste('headcount: os limiares são configuráveis no modelo de entrada e no pedido; encolher nunca gera Sinal', async () => {
  const itens = [pagina('alfa-industria', 63), pagina('gama-logistica', 90)]
  const fotos: Fotografias = { 'conta-alfa': [foto(40, 41, 0)], 'conta-gama': [foto(40, 230, 200)] }
  // Pelo pedido: cruzar 60 (a Alfa 41 -> 63) e não 50.
  const a = await cenario(TIPO_H, { [ACTOR_H]: { itens, usageTotalUsd: 0.008 } }, { contas: [ALFA, GAMA], fotografias: fotos }).rodar({ criterios: { faixas: [60] } })
  assertEquals(a.sinais.map((s) => s.eventKey), ['alfa industria|headcount|60'])
  // Padrão: a Alfa cruza 50; a Gama encolheu de 230 para 90 e isso não é Sinal.
  const b = await cenario(TIPO_H, { [ACTOR_H]: { itens, usageTotalUsd: 0.008 } }, { contas: [ALFA, GAMA], fotografias: fotos }).rodar()
  assertEquals(b.sinais.map((s) => s.eventKey), ['alfa industria|headcount|50'])
  // Limiar de texto, lixo e duplicata são lidos com tolerância.
  const c = await cenario(TIPO_H, { [ACTOR_H]: { itens, usageTotalUsd: 0.008 } }, { contas: [ALFA, GAMA], fotografias: fotos }).rodar({ criterios: { faixas: '60, abc, 60, -3' } })
  assertEquals(c.sinais.map((s) => s.eventKey), ['alfa industria|headcount|60'])
})

teste('headcount: a validação compara na hora com a base recente e só emite se a faixa cruzou', async () => {
  const igual = cenario(TIPO_H, { [ACTOR_H]: { itens: [pagina('alfa-industria', 41)], usageTotalUsd: 0.004 } }, {
    contas: [ALFA], fotografias: { 'conta-alfa': [foto(5, 41, 0)] },
  })
  const semMudanca = await igual.rodar({ criterios: { segundaPassagem: true } })
  assertEquals([semMudanca.sinais.length, igual.chamadas().length], [0, 1])

  const cruza = cenario(TIPO_H, { [ACTOR_H]: { itens: [pagina('alfa-industria', 63)], usageTotalUsd: 0.004 } }, {
    contas: [ALFA], fotografias: { 'conta-alfa': [foto(5, 41, 0)] },
  })
  const r = await cruza.rodar({ criterios: { segundaPassagem: true } })
  assertEquals(r.sinais.map((s) => s.eventKey), ['alfa industria|headcount|50'])
})

teste('headcount: a Conta fotografada há menos de 20 dias não é consultada de novo (nada é cobrado)', async () => {
  const c = cenario(TIPO_H, { [ACTOR_H]: { itens: [pagina('alfa-industria', 63)], usageTotalUsd: 0.004 } }, {
    contas: [ALFA], fotografias: { 'conta-alfa': [foto(5, 41, 0)] },
  })
  const r = await c.rodar()
  assertEquals([r.desfecho, r.sinais.length, c.chamadas().length, c.banco.gravadas.length], ['concluida', 0, 0, 0])
  assertEquals(r.custoUsd, 0)
})

teste('headcount: no máximo 100 Contas por rodada, as sem fotografia primeiro e depois as mais antigas', async () => {
  const contas: ContaDoWorkspace[] = Array.from({ length: 130 }, (_, i) => ({
    id: `c${String(i).padStart(3, '0')}`, name: `Empresa ${i}`, domain: null, linkedinUrl: `https://www.linkedin.com/company/empresa-${i}`, cnpj: null,
  }))
  // c000..c009 têm fotografia velha (60 dias); as outras 120 não têm nenhuma.
  const fotografias: Fotografias = Object.fromEntries(contas.slice(0, 10).map((x, i) => [x.id, [foto(60 + i, 40, 0)]]))
  const c = cenario(TIPO_H, { [ACTOR_H]: { itens: [], usageTotalUsd: 0 } }, { contas, fotografias })
  await c.rodar()
  const enviadas = (c.chamadas()[0].corpo as { companies: string[] }).companies
  assertEquals(enviadas.length, 100)
  assertEquals(enviadas[0], 'https://www.linkedin.com/company/empresa-10')
  assertEquals(enviadas[99], 'https://www.linkedin.com/company/empresa-109')
  // O pior caso (100 empresas a US$ 0,004) cabe no teto da cascata.
  assert(0.00005 + 0.004 * 100 <= defDaMigracao(TIPO_H).capUsd)
})

teste('headcount (LGPD): só a contagem de funcionários e a faixa são guardadas; nada de saúde, descrição ou contato', async () => {
  const c = cenario(TIPO_H, { [ACTOR_H]: { itens: [pagina('alfa-industria', 63), pagina('beta-servicos', 99)], usageTotalUsd: 0.008 } }, {
    contas: [ALFA, BETA], fotografias: { 'conta-alfa': [foto(40, 41, 0)] },
  })
  const r = await c.rodar()
  assertEquals(r.novos, 1)
  for (const g of c.banco.gravadas) assertEquals(Object.keys(g.data).sort(), ['faixa', 'funcionarios'], 'a fotografia tem só a contagem e a faixa')
  const persistido = JSON.stringify([c.banco.gravadas, r.sinais, r.mercado, c.banco.sinais.map((s) => s.sinal)])
  for (const proibido of ['saúde', 'saude', 'plano', 'exames', 'atestados', 'specialties', 'description', 'phone', '11999990000', 'Rua das Flores', 'followerCount']) {
    assert(!persistido.toLowerCase().includes(proibido.toLowerCase()), `"${proibido}" não pode ser guardado`)
  }
})

teste('headcount: página sem contagem de funcionários ou que o actor não achou não gera fotografia nem Sinal', async () => {
  const c = cenario(TIPO_H, { [ACTOR_H]: { itens: [pagina('alfa-industria', null), pagina('beta-servicos', 0)], usageTotalUsd: 0.008 } }, {
    contas: [ALFA, BETA, GAMA], fotografias: { 'conta-alfa': [foto(40, 41, 0)] },
  })
  const r = await c.rodar()
  assertEquals([r.sinais.length, c.banco.gravadas.length], [0, 0])
})

teste('headcount: a fonte fora do ar falha com mensagem neutra e não grava fotografia', async () => {
  const c = cenario(TIPO_H, { [ACTOR_H]: { estados: ['FAILED'], mensagem: 'LinkedIn blocked', usageTotalUsd: 0 } }, { contas: [ALFA] })
  const r = await c.rodar()
  assertEquals([r.desfecho, r.mensagem, c.banco.gravadas.length], ['falhou', 'A fonte pública está indisponível agora.', 0])
  assert(!MARCA_INTERNA.test(r.mensagem))
})

teste('headcount: sem nenhuma Conta com página do LinkedIn a cascata termina sem chamar a fonte', async () => {
  const c = cenario(TIPO_H, {}, { contas: [DELTA] })
  const r = await c.rodar()
  assertEquals([r.desfecho, c.chamadas().length, r.custoUsd], ['concluida', 0, 0])
})

// ---------------------------------------------------------------------------------------------------------------------
// Nova filial.

const TIPO_F = 'nova_filial_icp_g'
const ACTOR_F = 'johnatan029~branch-network'

const filial = (cnpj: string, uf: string, dataInicio: string, situacao = 'ATIVA') => ({
  cnpj, cnpjFormatado: `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`, uf, municipioCodigo: '7107',
  cnaePrincipal: '4761003', situacaoCodigo: situacao === 'ATIVA' ? '02' : '08', situacao, dataInicio,
})

/** O BRANCH_MAP do actor, com campos que NUNCA podem ser guardados (sócios, nomes). */
const mapa = (raiz: string, filiais: ReturnType<typeof filial>[], extra: Record<string, unknown> = {}) => ({
  recordType: 'BRANCH_MAP', raiz, entradaOriginal: raiz, cnpjMatrizCalculado: `${raiz}000181`, raizAtestadaPeloIndice: filiais.length > 0,
  totalFiliais: filiais.length, filiaisAtivas: filiais.filter((f) => f.situacao === 'ATIVA').length, porUf: { SP: filiais.length },
  porSituacao: { ATIVA: filiais.length }, filiais, versaoDosDados: { snapshotMonth: '2026-10', referenceMonth: '2026-09' },
  staleness: { indexMonth: '2026-09', expectedMonth: '2026-09', stale: false }, observedAt: antes(0),
  socios: [{ nome: 'Fulano de Tal', documento: '***123456**' }], ...extra,
})
const RESUMO = { recordType: 'RUN_SUMMARY', recordsWritten: 3, unitsRequested: 3, warnings: [] }

const fotoF = (dias: number, ordens: string[], total = ordens.length) => ({ takenAt: antes(dias), data: { total, ordens } })

teste('filial, 1ª rodada: só grava a base (lista de ordens), um mapa por raiz, e a Conta sem CNPJ fica de fora', async () => {
  const c = cenario(TIPO_F, {
    [ACTOR_F]: {
      itens: [
        mapa('11222333', [filial('11222333000262', 'SP', '2020-01-10'), filial('11222333000343', 'RJ', dataAntes(900))]),
        mapa('22333444', []),
        mapa('44555666', [filial('44555666000258', 'MG', '2023-05-02')]),
        RESUMO,
      ],
      usageTotalUsd: 0.03,
    },
  }, { contas: [ALFA, BETA, BETA_FILIAL, GAMA, DELTA] })
  const r = await c.rodar()
  assertEquals([r.desfecho, r.sinais.length, r.novos], ['concluida', 0, 0])
  // Uma raiz por empresa (Beta e a filial contábil dela dividem a raiz): 3 mapas, cobrados uma vez cada.
  assertEquals(c.chamadas()[0].corpo, { cnpjs: ['11222333', '22333444', '44555666'], maxResults: 3 })
  assertEquals(c.banco.gravadas.map((g) => [g.chave, g.data]), [
    ['conta-alfa', { total: 2, ordens: ['0002', '0003'] }],
    ['conta-beta', { total: 0, ordens: [] }],
    ['conta-beta-2', { total: 0, ordens: [] }],
    ['conta-delta', { total: 1, ordens: ['0002'] }],
  ])
  assertEquals(c.banco.passos.map((p) => [p.ordem, p.handler, p.fim?.estado]), [
    [1, 'g_contas_para_filiais', 'succeeded'],
    [2, 'g_mapa_de_filiais', 'succeeded'],
    [3, 'g_nova_filial', 'empty'],
  ])
})

teste('filial, 2ª rodada: a filial ativa e recente que não estava na base vira Sinal, com o CNPJ da filial na chave', async () => {
  const c = cenario(TIPO_F, {
    [ACTOR_F]: {
      itens: [
        mapa('11222333', [
          filial('11222333000262', 'SP', '2020-01-10'),
          filial('11222333000343', 'RJ', '2021-03-10'),
          filial('11222333000424', 'SC', dataAntes(20)),
          filial('11222333000505', 'PR', dataAntes(15), 'BAIXADA'),
          filial('11222333000696', 'BA', dataAntes(800)),
        ]),
        mapa('22333444', [filial('22333444000236', 'SP', '2019-01-01')]),
        RESUMO,
      ],
      usageTotalUsd: 0.02,
    },
  }, {
    contas: [ALFA, BETA],
    fotografias: { 'conta-alfa': [fotoF(40, ['0002', '0003'])], 'conta-beta': [fotoF(40, ['0002'])] },
  })
  const r = await c.rodar()
  assertEquals(r.desfecho, 'concluida')
  assertEquals(r.sinais.length, 1, 'só a filial ativa e aberta há pouco: a baixada e a de 2 anos atrás (índice atrasado) não contam')
  const s = r.sinais[0]
  assertEquals([s.contaId, s.eventKey], ['conta-alfa', 'alfa industria|filial|11222333000424'])
  assertEquals(s.phrase, 'Abriu nova filial em SC (CNPJ 11.222.333/0004-24)')
  assertEquals(s.firedAt, `${dataAntes(20)}T12:00:00.000Z`)
  assertEquals(s.source, 'Receita Federal (CNPJ aberto)')
  assert(s.evidence.includes('2 filiais') && s.evidence.includes('5 filiais'), s.evidence)
  // A base nova guarda também as filiais baixada e antiga, para não serem tratadas como novas depois.
  const alfa = c.banco.gravadas.find((g) => g.chave === 'conta-alfa')!
  assertEquals(alfa.data, { total: 5, ordens: ['0002', '0003', '0004', '0005', '0006'] })
  assert(!MARCA_INTERNA.test(JSON.stringify(r)))
  assert(!JSON.stringify(r).includes(TOKEN))
})

teste('filial: a mesma rodada de novo não grava o Sinal outra vez', async () => {
  const c = cenario(TIPO_F, { [ACTOR_F]: { itens: [mapa('11222333', [filial('11222333000262', 'SP', dataAntes(10))]), RESUMO], usageTotalUsd: 0.01 } }, {
    contas: [ALFA], fotografias: { 'conta-alfa': [fotoF(40, [])] },
  })
  const a = await c.rodar({ chave: 'a' })
  const b = await c.rodar({ chave: 'b' })
  assertEquals([a.novos, a.repetidos, b.novos, b.repetidos], [1, 0, 0, 1])
})

teste('filial: a primeira filial de uma empresa que tinha só a matriz é Sinal (a base vazia vale como base)', async () => {
  const c = cenario(TIPO_F, { [ACTOR_F]: { itens: [mapa('44555666', [filial('44555666000258', 'MG', dataAntes(12))]), RESUMO], usageTotalUsd: 0.01 } }, {
    contas: [DELTA], fotografias: { 'conta-delta': [fotoF(35, [], 0)] },
  })
  const r = await c.rodar()
  assertEquals(r.sinais.map((s) => s.phrase), ['Abriu nova filial em MG (CNPJ 44.555.666/0002-58)'])
})

teste('filial: raiz que o actor não entregou (fonte indisponível) não vira "zero filiais": sem fotografia e sem Sinal', async () => {
  const c = cenario(TIPO_F, { [ACTOR_F]: { itens: [mapa('11222333', [filial('11222333000262', 'SP', dataAntes(10))]), RESUMO], usageTotalUsd: 0.01 } }, {
    contas: [ALFA, DELTA], fotografias: { 'conta-alfa': [fotoF(40, [])], 'conta-delta': [fotoF(40, ['0002'])] },
  })
  const r = await c.rodar()
  assertEquals(r.sinais.map((s) => s.contaId), ['conta-alfa'])
  assertEquals(c.banco.gravadas.map((g) => g.chave), ['conta-alfa'])
})

teste('filial: a validação compara na hora e só emite a filial que não estava na base', async () => {
  const igual = cenario(TIPO_F, { [ACTOR_F]: { itens: [mapa('11222333', [filial('11222333000262', 'SP', dataAntes(10))]), RESUMO], usageTotalUsd: 0.01 } }, {
    contas: [ALFA], fotografias: { 'conta-alfa': [fotoF(10, ['0002'])] },
  })
  const sem = await igual.rodar({ criterios: { segundaPassagem: true } })
  assertEquals([sem.sinais.length, igual.chamadas().length], [0, 1])

  const nova = cenario(TIPO_F, { [ACTOR_F]: { itens: [mapa('11222333', [filial('11222333000262', 'SP', dataAntes(10))]), RESUMO], usageTotalUsd: 0.01 } }, {
    contas: [ALFA], fotografias: { 'conta-alfa': [fotoF(10, [])] },
  })
  const r = await nova.rodar({ criterios: { segundaPassagem: true } })
  assertEquals(r.sinais.length, 1)
  assert(r.sinais[0].phrase.includes('nova filial'), r.sinais[0].phrase)
})

teste('filial: a Conta fotografada há menos de 25 dias não é consultada (o mapa é mensal) e não custa nada', async () => {
  const c = cenario(TIPO_F, { [ACTOR_F]: { itens: [], usageTotalUsd: 0 } }, { contas: [ALFA], fotografias: { 'conta-alfa': [fotoF(10, ['0002'])] } })
  const r = await c.rodar()
  assertEquals([r.desfecho, c.chamadas().length, r.custoUsd], ['concluida', 0, 0])
})

teste('filial: no máximo 40 mapas por rodada (US$ 0,40), as Contas sem fotografia primeiro', async () => {
  const contas: ContaDoWorkspace[] = Array.from({ length: 70 }, (_, i) => ({
    id: `c${String(i).padStart(3, '0')}`, name: `Empresa ${i}`, domain: null, linkedinUrl: null, cnpj: `${String(10000000 + i)}000100`,
  }))
  const fotografias: Fotografias = { c000: [fotoF(90, [])], c001: [fotoF(80, [])] }
  const c = cenario(TIPO_F, { [ACTOR_F]: { itens: [], usageTotalUsd: 0 } }, { contas, fotografias })
  await c.rodar()
  const corpo = c.chamadas()[0].corpo as { cnpjs: string[]; maxResults: number }
  assertEquals([corpo.cnpjs.length, corpo.maxResults, corpo.cnpjs[0]], [40, 40, '10000002'])
})

teste('filial (LGPD): só a contagem e as ordens das filiais são guardadas; sócios e nomes nunca', async () => {
  const c = cenario(TIPO_F, { [ACTOR_F]: { itens: [mapa('11222333', [filial('11222333000262', 'SP', dataAntes(10))], { qsa: [{ nome: 'Beltrana' }] }), RESUMO], usageTotalUsd: 0.01 } }, {
    contas: [ALFA], fotografias: { 'conta-alfa': [fotoF(40, [])] },
  })
  const r = await c.rodar()
  assertEquals(r.novos, 1)
  for (const g of c.banco.gravadas) assertEquals(Object.keys(g.data).sort(), ['ordens', 'total'])
  const persistido = JSON.stringify([c.banco.gravadas, r.sinais, c.banco.sinais.map((s) => s.sinal)])
  for (const proibido of ['Fulano', 'Beltrana', 'socios', 'qsa', '***123456**', 'documento']) {
    assert(!persistido.includes(proibido), `"${proibido}" não pode ser guardado`)
  }
})

teste('filial: rede enorme demais para a fotografia (mais de 2.500 filiais) é pulada sem erro e sem fotografia', async () => {
  const muitas = Array.from({ length: 2600 }, (_, i) => filial(`11222333${String(i + 2).padStart(4, '0')}00`, 'SP', '2020-01-10'))
  const c = cenario(TIPO_F, { [ACTOR_F]: { itens: [mapa('11222333', muitas), RESUMO], usageTotalUsd: 0.01 } }, {
    contas: [ALFA], fotografias: { 'conta-alfa': [fotoF(40, ['0002'])] },
  })
  const r = await c.rodar()
  assertEquals([r.desfecho, r.sinais.length, c.banco.gravadas.length], ['concluida', 0, 0])
})

teste('filial: no máximo 10 Sinais por Conta na rodada (os de início mais recente), e a evidência diz quantas são', async () => {
  const novas = Array.from({ length: 12 }, (_, i) => filial(`11222333${String(i + 2).padStart(4, '0')}00`, 'SP', dataAntes(i + 1)))
  const c = cenario(TIPO_F, { [ACTOR_F]: { itens: [mapa('11222333', novas), RESUMO], usageTotalUsd: 0.01 } }, {
    contas: [ALFA], fotografias: { 'conta-alfa': [fotoF(40, [])] },
  })
  const r = await c.rodar()
  assertEquals(r.sinais.length, 10)
  assert(r.sinais.every((s) => s.evidence.includes('12 filiais novas')), r.sinais[0].evidence)
})

teste('filial: a fonte fora do ar falha com mensagem neutra e não grava fotografia', async () => {
  const c = cenario(TIPO_F, { [ACTOR_F]: { estados: ['FAILED'], mensagem: 'index unavailable', usageTotalUsd: 0 } }, { contas: [ALFA] })
  const r = await c.rodar()
  assertEquals([r.desfecho, r.mensagem, c.banco.gravadas.length], ['falhou', 'A fonte pública está indisponível agora.', 0])
  assert(!MARCA_INTERNA.test(r.mensagem))
})

teste('filial: sem nenhuma Conta com CNPJ a cascata termina sem chamar a fonte', async () => {
  const c = cenario(TIPO_F, {}, { contas: [GAMA] })
  const r = await c.rodar()
  assertEquals([r.desfecho, c.chamadas().length, r.custoUsd], ['concluida', 0, 0])
})

// ICP C (jurídico empresarial): processos públicos por CNPJ (C1), mudança regulatória no DOU (C2), recuperação judicial
// noticiada (C3), impacto da reforma tributária por CNAE (C4) e o Sinal sem fonte (Jusbrasil/DataJud por CNPJ).
// O Apify, o modelo de linguagem e as fontes públicas são falsos (nunca a rede). Os formatos de entrada e saída dos
// actors são os do esquema publicado, lido na API pública em 13/10/2026.
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import { apifyFalso, type ComportamentoDoRun } from '../falso-apify.ts'
import { dbFalso } from '../db-falso.ts'
import { clienteAssincronoDoApify } from '../fonte-apify.ts'
import { rodarCascata } from '../motor.ts'
import { registroDePassos } from './index.ts'
import { passosDoIcp_c } from './icp-c.ts'
import { IMPACTO_DA_REFORMA, classificarPorPalavras, divisaoDoCnae } from './icp-c-cnae.ts'
import { MARCA_INTERNA } from '../../marca.ts'
import type { CascataDef, ContaDoWorkspace, ContextoDoPasso, Llm, PassoDef } from '../tipos.ts'

const AGORA = Date.parse('2026-10-13T12:00:00Z')
const TOKEN = 'apify_api_SEGREDO_DE_TESTE_0123456789'
const dias = (n: number) => new Date(AGORA - n * 86_400_000).toISOString()

const passo = (p: Partial<PassoDef> & Pick<PassoDef, 'ordem' | 'kind' | 'handler'>): PassoDef => ({
  actorId: null, fallbacks: [], inputTemplate: {}, priceModel: p.kind === 'actor' ? 'PAY_PER_EVENT' : 'NONE',
  estFixedUsd: 0, estPerItemUsd: 0, estItems: 0, maxItems: null, ...p,
})

// As cascatas como a migração as registra (o teste da migração confere os handlers).
const LAWSUITS = 'brasildados~cnpj-lawsuits-check'
function defC1(extra: Partial<CascataDef> = {}): CascataDef {
  return {
    id: 'c1', signalType: 'processos_publicos', icp: 'C', name: 'Processos públicos', version: 1, state: 'testing', semFonteMotivo: null,
    scope: 'conta', multiplier: 3, capUsd: 1.0, capCredits: null, cadenceHours: 720, maxAccounts: 100,
    steps: [
      passo({ ordem: 1, kind: 'regra', handler: 'jur_cnpjs_para_processos', inputTemplate: { maxCnpjs: 10 } }),
      passo({ ordem: 2, kind: 'actor', handler: 'jur_processos_por_cnpj', actorId: LAWSUITS, estPerItemUsd: 0.1, estItems: 10, maxItems: 10 }),
      passo({ ordem: 3, kind: 'regra', handler: 'jur_saltos_de_processos', inputTemplate: { limiarNovos: 3, janelaDias: 90 } }),
    ],
    ...extra,
  }
}
const JENKO = 'jenko_systems~diario-oficial-uniao-dou'
const DOU_MONITOR = 'brasildados~dou-monitor'
const TERMOS_DOU = ['IBS', 'CBS', 'reforma tributária', 'agência reguladora']
function defC2(extra: Partial<CascataDef> = {}): CascataDef {
  return {
    id: 'c2', signalType: 'mudanca_regulatoria', icp: 'C', name: 'Mudança regulatória', version: 1, state: 'testing', semFonteMotivo: null,
    scope: 'mercado', multiplier: 3, capUsd: 0.5, capCredits: null, cadenceHours: 168, maxAccounts: 1,
    steps: [
      passo({
        ordem: 1, kind: 'actor', handler: 'jur_dou_publicacoes', actorId: JENKO,
        fallbacks: [{ kind: 'actor', actorId: DOU_MONITOR, priceModel: 'PAY_PER_EVENT', estFixedUsd: 0.1, estPerItemUsd: 0.01 }],
        inputTemplate: { termos: TERMOS_DOU, secao: 'do1', janelaDias: 7 }, estFixedUsd: 0.05, estPerItemUsd: 0.0001, estItems: 30, maxItems: 50,
      }),
      passo({ ordem: 2, kind: 'regra', handler: 'jur_classificar_mudanca' }),
    ],
    ...extra,
  }
}
const NEWS = 'data_xplorer~google-news-scraper-fast'
function defC3(extra: Partial<CascataDef> = {}): CascataDef {
  return {
    id: 'c3', signalType: 'recuperacao_judicial', icp: 'C', name: 'Recuperação judicial', version: 1, state: 'testing', semFonteMotivo: null,
    scope: 'conta', multiplier: 3, capUsd: 0.7, capCredits: null, cadenceHours: 24, maxAccounts: 100,
    steps: [
      passo({
        ordem: 1, kind: 'actor', handler: 'jur_noticias_recuperacao', actorId: NEWS,
        inputTemplate: { consulta: '"recuperação judicial" OR "pedido de falência"', janelaDias: 7 }, estPerItemUsd: 0.004, estItems: 30, maxItems: 40,
      }),
      passo({ ordem: 2, kind: 'regra', handler: 'jur_empresas_em_recuperacao', inputTemplate: { janelaDias: 7 } }),
      passo({ ordem: 3, kind: 'regra', handler: 'casar_fatos_com_contas' }),
      passo({ ordem: 4, kind: 'actor', handler: 'jur_confirmar_recuperacao', actorId: LAWSUITS, estPerItemUsd: 0.1, estItems: 2, maxItems: 5 }),
    ],
    ...extra,
  }
}
const CNPJ_SCRAPER = 'epicscrapers~brazil-cnpj-scraper'
function defC4(extra: Partial<CascataDef> = {}): CascataDef {
  return {
    id: 'c4', signalType: 'impacto_reforma_cnae', icp: 'C', name: 'Impacto da reforma tributária no CNAE', version: 1, state: 'testing',
    semFonteMotivo: null, scope: 'mercado', multiplier: 3, capUsd: 0.05, capCredits: null, cadenceHours: 168, maxAccounts: 1,
    steps: [
      passo({ ordem: 1, kind: 'regra', handler: 'jur_setor_da_reforma' }),
      passo({ ordem: 2, kind: 'actor', handler: 'jur_empresas_por_cnae', actorId: CNPJ_SCRAPER, estFixedUsd: 0.00005, estPerItemUsd: 0.0009, estItems: 20, maxItems: 20 }),
      passo({ ordem: 3, kind: 'regra', handler: 'jur_sinal_impacto_reforma' }),
    ],
    ...extra,
  }
}

const ALFA: ContaDoWorkspace = { id: 'conta-alfa', name: 'Alfa Indústria S.A.', domain: 'alfa.test', linkedinUrl: null, cnpj: '11.222.333/0001-81' }
const BETA: ContaDoWorkspace = { id: 'conta-beta', name: 'Beta Comércio Ltda', domain: null, linkedinUrl: null, cnpj: '22333444000155' }
const GAMA: ContaDoWorkspace = { id: 'conta-gama', name: 'Gama Transportes', domain: null, linkedinUrl: null, cnpj: null }

function cenario(def: CascataDef, porActor: Record<string, ComportamentoDoRun>, opcoes: { contas?: ContaDoWorkspace[]; llm?: Llm; fotografias?: Parameters<typeof dbFalso>[1] extends infer O ? (O extends { fotografias?: infer F } ? F : never) : never } = {}) {
  const fake = apifyFalso((_t, actorId) => porActor[actorId] ?? { itens: [], usageTotalUsd: 0 })
  const fonte = clienteAssincronoDoApify({ tokens: [TOKEN], fetchFn: fake.fetchFn, dormir: () => Promise.resolve(), esperaDoCustoMs: 0, log: () => {} })
  const banco = dbFalso(def, { contas: opcoes.contas ?? [], fotografias: opcoes.fotografias })
  const rodar = (extra: Record<string, unknown> = {}) =>
    rodarCascata({ db: banco.db, fonte, registro: registroDePassos(), llm: opcoes.llm, agora: () => AGORA, log: () => {} }, {
      workspaceId: 'ws-1', userId: 'u1', signalType: def.signalType, origem: 'conversa', chave: 'k1', permitirTeste: true, ...extra,
    })
  const posts = () => fake.requisicoes.filter((q) => q.metodo === 'POST')
  return { fake, banco, rodar, posts }
}

const ctxDePasso = (extra: Partial<ContextoDoPasso> = {}): ContextoDoPasso => ({
  workspaceId: 'ws-1', snapshots: { ler: () => Promise.resolve(new Map()), gravar: () => Promise.resolve() }, custo: { adicionar: () => {} },
  pedido: { workspaceId: 'ws-1', userId: null, signalType: 'x', origem: 'conversa', chave: 'k' }, contas: [], criterios: {}, agora: AGORA,
  def: passo({ ordem: 1, kind: 'regra', handler: 'x' }), memoria: new Map(), ...extra,
})

// ---------------------------------------------------------------------------------------------------------------------
// C1 · Processos públicos

const linhaProcessos = (cnpj: string, total: number, trab: number, trib: number, extra: Record<string, unknown> = {}) => ({
  cnpj, cnpjFormatado: cnpj, consultadoEm: dias(0), encontrado: true, erro: null, totalProcessos: total,
  distribuicao: {
    porTipoTribunal: { CIVEL: total - trab - trib, TRABALHISTA: trab, TRIBUTARIA: trib },
    porNomeTribunal: { TRT2: trab, TJSP: total - trab }, porTipo: { 'EXECUCAO FISCAL': trib },
  },
  ...extra,
})
const FOTO = (cnpj: string, total: number, trab: number, trib: number, diasAtras: number) => ({
  [cnpj]: [{ takenAt: dias(diasAtras), data: { total, trabalhista: trab, tributario: trib } }],
})

Deno.test('C1: a primeira rodada só grava a base (contas sem CNPJ são puladas, só o CNPJ vai ao actor)', async () => {
  const c = cenario(defC1(), {
    [LAWSUITS]: { itens: [linhaProcessos('11222333000181', 40, 5, 4), linhaProcessos('22333444000155', 10, 1, 0)], usageTotalUsd: 0.2 },
  }, { contas: [ALFA, BETA, GAMA] })
  const r = await c.rodar()
  assertEquals([r.desfecho, r.novos, r.sinais.length], ['concluida', 0, 0])
  assertEquals(c.posts().length, 1)
  assertEquals(c.posts()[0].caminho.split('/')[3], LAWSUITS)
  assertEquals(c.posts()[0].corpo, { cnpjs: ['11222333000181', '22333444000155'] })
  assertEquals(c.banco.gravadas.map((g) => [g.chave, g.data]).sort(), [
    ['11222333000181', { total: 40, trabalhista: 5, tributario: 4 }],
    ['22333444000155', { total: 10, trabalhista: 1, tributario: 0 }],
  ])
  assertEquals(r.custoUsd, 0.2)
})

Deno.test('C1: salto de 3 ou mais processos trabalhistas e tributários contra a fotografia vira Sinal da Conta', async () => {
  const c = cenario(defC1(), {
    [LAWSUITS]: { itens: [linhaProcessos('11222333000181', 47, 8, 6), linhaProcessos('22333444000155', 12, 2, 1)], usageTotalUsd: 0.2 },
  }, { contas: [ALFA, BETA], fotografias: { ...FOTO('11222333000181', 40, 5, 4, 30), ...FOTO('22333444000155', 10, 1, 0, 30) } })
  const r = await c.rodar()
  assertEquals([r.desfecho, r.novos], ['concluida', 1])
  const s = r.sinais[0]
  assertEquals(s.contaId, 'conta-alfa')
  assertEquals(s.eventKey, 'processos|11222333000181|2026-10')
  assertEquals(s.phrase, 'Processos trabalhistas e tributários subiram de 9 para 14 (+5) em 30 dias')
  assertEquals(s.firedAt, '2026-10-13T12:00:00.000Z')
  assertStringIncludes(s.evidence, '8 trabalhistas (+3)')
  assertStringIncludes(s.evidence, '6 tributários (+2)')
  assertStringIncludes(s.evidence, '47 no total')
  assertStringIncludes(s.evidence, 'sem partes nem advogados')
  assert(!MARCA_INTERNA.test(JSON.stringify(r)))
  // A Beta subiu só 2 (+1 e +1): abaixo do limiar. As duas fotografias são atualizadas.
  assertEquals(c.banco.gravadas.length, 2)
  assertEquals(c.banco.gravadas.find((g) => g.chave === '22333444000155')?.data, { total: 12, trabalhista: 2, tributario: 1 })
})

Deno.test('C1: o mesmo salto, repetido contra a mesma base, não grava o Sinal de novo', async () => {
  const mk = () => cenario(defC1(), { [LAWSUITS]: { itens: [linhaProcessos('11222333000181', 47, 8, 6)], usageTotalUsd: 0.1 } },
    { contas: [ALFA], fotografias: FOTO('11222333000181', 40, 5, 4, 30) })
  const c = mk()
  const a = await c.rodar({ chave: 'a' })
  // O banco falso não guarda as fotografias gravadas: a segunda rodada vê a mesma base.
  const b = await c.rodar({ chave: 'b' })
  assertEquals([a.novos, a.repetidos, b.novos, b.repetidos], [1, 0, 0, 1])
})

Deno.test('C1: salto abaixo do limiar, base velha demais e CNPJ sem resposta não geram Sinal', async () => {
  const c = cenario(defC1(), {
    [LAWSUITS]: { itens: [linhaProcessos('11222333000181', 41, 6, 4), linhaProcessos('22333444000155', 30, 9, 9)], usageTotalUsd: 0.2 },
  }, { contas: [ALFA, BETA], fotografias: { ...FOTO('11222333000181', 40, 5, 4, 30), ...FOTO('22333444000155', 10, 1, 0, 200) } })
  const r = await c.rodar()
  assertEquals(r.novos, 0)
  // A base velha (200 dias) não é "em 90 dias": só renova a fotografia.
  assertEquals(c.banco.gravadas.find((g) => g.chave === '22333444000155')?.data, { total: 30, trabalhista: 9, tributario: 9 })
  // CNPJ que a fonte não respondeu (sem linha): nada gravado para ele.
  const c2 = cenario(defC1(), { [LAWSUITS]: { itens: [linhaProcessos('11222333000181', 41, 6, 4)], usageTotalUsd: 0.1 } }, { contas: [ALFA, BETA] })
  await c2.rodar()
  assertEquals(c2.banco.gravadas.map((g) => g.chave), ['11222333000181'])
})

Deno.test('C1: dado pessoal nunca passa — partes, advogados, CPF e processos individuais são descartados', async () => {
  const suja = linhaProcessos('11222333000181', 47, 8, 6, {
    partes: [{ tipoPessoa: 'pessoa', nome: 'Fulano de Tal', documento: '***123456**', tipo: 'LAWYER' }],
    advogados: ['Dra. Beltrana Souza OAB/SP 123456'],
    processos: [{ numero: '5022299-07.2021.4.03.6182', partes: [{ nome: 'Ciclano Pereira', documento: '123.456.789-09' }] }],
    socios: [{ nome: 'Sócio Secreto' }],
  })
  const c = cenario(defC1(), { [LAWSUITS]: { itens: [suja], usageTotalUsd: 0.1 } },
    { contas: [ALFA], fotografias: FOTO('11222333000181', 40, 5, 4, 30) })
  const r = await c.rodar()
  assertEquals(r.novos, 1)
  const tudo = JSON.stringify([r.sinais, c.banco.gravadas, c.banco.sinais])
  for (const segredo of ['Fulano', 'Beltrana', 'Ciclano', '123.456.789-09', '***123456**', 'Sócio Secreto', 'OAB', '5022299']) {
    assert(!tudo.includes(segredo), `vazou: ${segredo}`)
  }
  assertEquals(Object.keys(c.banco.gravadas[0].data).sort(), ['total', 'trabalhista', 'tributario'])
})

Deno.test('C1: Conta sem CNPJ, com CPF no lugar ou razão social de empresário individual (nome + CPF) é pulada e contada', async () => {
  const ei: ContaDoWorkspace = { id: 'ei', name: 'JOSE DA SILVA 12345678901', domain: null, linkedinUrl: null, cnpj: '33444555000166' }
  const cpf: ContaDoWorkspace = { id: 'cpf', name: 'Pessoa', domain: null, linkedinUrl: null, cnpj: '123.456.789-09' }
  const ctx = ctxDePasso({ contas: [ALFA, GAMA, ei, cpf] })
  const impl = passosDoIcp_c().passos.jur_cnpjs_para_processos
  const saida = await impl.executar!([], { ...ctx, def: passo({ ordem: 1, kind: 'regra', handler: 'x', inputTemplate: { maxCnpjs: 10 } }) })
  assertEquals(saida.map((i) => i.cnpj), ['11222333000181'])
  assertEquals(ctx.memoria.get('puladasSemCnpj'), 3)
})

Deno.test('C1: no máximo 10 CNPJs por rodada, os sem fotografia primeiro e depois os mais antigos; o pior caso cabe no teto', async () => {
  const contas: ContaDoWorkspace[] = Array.from({ length: 25 }, (_, i) => ({
    id: `c${i}`, name: `Empresa ${String(i).padStart(2, '0')} Ltda`, domain: null, linkedinUrl: null, cnpj: `${String(10000000 + i)}000199`,
  }))
  const fotos = { [`${10000000}000199`]: [{ takenAt: dias(10), data: { total: 1, trabalhista: 0, tributario: 0 } }], [`${10000001}000199`]: [{ takenAt: dias(60), data: { total: 1, trabalhista: 0, tributario: 0 } }] }
  const c = cenario(defC1(), { [LAWSUITS]: { itens: [], usageTotalUsd: 0 } }, { contas, fotografias: fotos })
  await c.rodar()
  const enviados = (c.posts()[0].corpo as { cnpjs: string[] }).cnpjs
  assertEquals(enviados.length, 10)
  assert(!enviados.includes('10000000000199') && !enviados.includes('10000001000199'), 'as já fotografadas ficam para depois')
  assertEquals(c.posts()[0].consulta.get('maxItems'), '10')
  assert(Number(c.posts()[0].consulta.get('maxTotalChargeUsd')) <= 1.0)
  const def = defC1()
  assert(def.steps[1].maxItems! * def.steps[1].estPerItemUsd <= def.capUsd + 1e-9, 'o pior caso cabe no teto')
})

Deno.test('C1: com teto menor que o passo, o motor aborta antes de gastar', async () => {
  const c = cenario(defC1({ capUsd: 0.05 }), { [LAWSUITS]: { itens: [linhaProcessos('11222333000181', 1, 0, 0)], usageTotalUsd: 0.1 } }, { contas: [ALFA] })
  const r = await c.rodar()
  assertEquals([r.desfecho, c.posts().length, r.custoUsd], ['abortada', 0, 0])
})

Deno.test('C1: a contagem trabalhista e tributária usa o tipo de tribunal e, na falta dele, o nome do tribunal e a execução fiscal', async () => {
  const semTipo = { cnpj: '11222333000181', encontrado: true, totalProcessos: 30, consultadoEm: dias(0), distribuicao: { porNomeTribunal: { TRT2: 4, TRT15: 3, TST: 1, TJSP: 22 }, porTipoProcedimentoCnj: { 'EXECUÇÃO FISCAL': 5 } } }
  const c = cenario(defC1(), { [LAWSUITS]: { itens: [semTipo], usageTotalUsd: 0.1 } }, { contas: [ALFA] })
  await c.rodar()
  assertEquals(c.banco.gravadas[0].data, { total: 30, trabalhista: 8, tributario: 5 })
})

// ---------------------------------------------------------------------------------------------------------------------
// C2 · Mudança regulatória (mercado)

const pubDou = (extra: Record<string, unknown>) => ({
  url_title: 'portaria-1', secao: 'do1', tipo: 'Portaria', titulo: 'PORTARIA Nº 1, DE 5 DE OUTUBRO DE 2026', orgao: 'Agência Nacional de Energia Elétrica',
  orgao_path: 'Ministério de Minas e Energia/Agência Nacional de Energia Elétrica', ementa: 'Altera as regras do mercado livre de energia elétrica da agência reguladora. Processo do CPF 123.456.789-09.',
  data: '08/10/2026', url: 'https://www.in.gov.br/en/web/dou/-/portaria-1', termo_encontrado: 'agência reguladora', ...extra,
})
const PUBS = [
  pubDou({}),
  pubDou({ url_title: 'lc-1', url: 'https://www.in.gov.br/en/web/dou/-/lc-1', tipo: 'Instrução Normativa', orgao: 'Receita Federal do Brasil', titulo: 'INSTRUÇÃO NORMATIVA Nº 9', ementa: 'Dispõe sobre a CBS e o IBS na reforma tributária.', termo_encontrado: 'CBS' }),
  pubDou({ url_title: 'nomeacao-1', url: 'https://www.in.gov.br/en/web/dou/-/nomeacao-1', tipo: 'Portaria', titulo: 'PORTARIA DE PESSOAL', ementa: 'Nomeia Fulano de Tal para o cargo de diretor da agência reguladora.' }),
  pubDou({ url_title: 'sem-setor', url: 'https://www.in.gov.br/en/web/dou/-/sem-setor', orgao: 'Prefeitura Municipal de Rio Verde', tipo: 'Aviso', titulo: 'AVISO', ementa: 'Pregão eletrônico para compra de material de escritório.' }),
]

Deno.test('C2: a publicação normativa do DOU vira Sinal de mercado com os setores (CNAE) afetados, pela regra de palavras-chave', async () => {
  const c = cenario(defC2(), { [JENKO]: { itens: PUBS, usageTotalUsd: 0.054 } })
  const r = await c.rodar()
  assertEquals([r.desfecho, r.novos, r.mercado.length, c.banco.sinais.length], ['concluida', 2, 2, 0])
  assertEquals(c.posts()[0].caminho.split('/')[3], JENKO)
  assertEquals(c.posts()[0].corpo, { mode: 'monitorar', termos: TERMOS_DOU, secao: 'do1', dias: 7, max_resultados: 50, texto_completo: false })
  const energia = r.mercado.find((m) => m.eventKey === 'dou|portaria-1')!
  assertStringIncludes(energia.phrase, 'Portaria')
  assertStringIncludes(energia.phrase, 'energia elétrica')
  assertEquals(energia.firedAt, '2026-10-08T12:00:00.000Z')
  assertEquals(energia.source, 'Diário Oficial da União')
  assertEquals((energia.payload as { divisoesCnae: string[] }).divisoesCnae, ['35'])
  assertEquals((energia.payload as { classificadoPor: string }).classificadoPor, 'regra')
  assertStringIncludes(energia.evidence, 'palavras-chave')
  const reforma = r.mercado.find((m) => m.eventKey === 'dou|lc-1')!
  assertEquals((reforma.payload as { divisoesCnae: unknown }).divisoesCnae, 'todas')
  // Ato de pessoal e aviso de prefeitura ficam de fora; nome de pessoa nunca chega ao Sinal.
  assert(!JSON.stringify(r.mercado).includes('Fulano'))
  assert(!JSON.stringify(r.mercado).includes('123.456.789-09'), 'CPF no texto do DOU não segue adiante')
  assert(!MARCA_INTERNA.test(JSON.stringify(r)))
  // Repetir a rodada não grava de novo.
  const b = await c.rodar({ chave: 'k2' })
  assertEquals([b.novos, b.repetidos], [0, 2])
})

Deno.test('C2: com o modelo de linguagem, ele classifica (divisões validadas), o custo soma e o ato de pessoal nem é enviado', async () => {
  const prompts: string[] = []
  const llm: Llm = {
    json: ({ usuario }) => {
      prompts.push(usuario)
      return Promise.resolve({
        json: { itens: [{ i: 0, relevante: true, divisoesCnae: ['35', '99999', 'xx', '06'], setor: 'Energia' }, { i: 1, relevante: false, divisoesCnae: [], setor: '' }] },
        custoUsd: 0.0004,
      })
    },
  }
  const c = cenario(defC2(), { [JENKO]: { itens: PUBS, usageTotalUsd: 0.054 } }, { llm })
  const r = await c.rodar()
  assertEquals(r.mercado.length, 1)
  assertEquals((r.mercado[0].payload as { divisoesCnae: string[]; classificadoPor: string }).divisoesCnae, ['35', '06'])
  assertEquals((r.mercado[0].payload as { classificadoPor: string }).classificadoPor, 'modelo')
  assertEquals(r.custoUsd, 0.0544)
  assert(!prompts.join('\n').includes('Fulano'), 'o ato de pessoal não vai ao modelo')
})

Deno.test('C2: se o modelo falha, a regra de palavras-chave assume e a evidência diz', async () => {
  const llm: Llm = { json: () => Promise.reject(new Error('fora do ar')) }
  const c = cenario(defC2(), { [JENKO]: { itens: PUBS, usageTotalUsd: 0.054 } }, { llm })
  const r = await c.rodar()
  assertEquals(r.mercado.length, 2)
  assertStringIncludes(r.mercado[0].evidence, 'palavras-chave')
})

function defC2Monitor(): CascataDef {
  const d = defC2({ capUsd: 0.8 })
  d.steps[0] = {
    ...d.steps[0],
    actorId: DOU_MONITOR,
    estFixedUsd: 0.1,
    estPerItemUsd: 0.01,
    estItems: 10,
    maxItems: 20,
    fallbacks: [{ kind: 'actor', actorId: JENKO, priceModel: 'PAY_PER_EVENT', estFixedUsd: 0.2, estPerItemUsd: 0.0001 }],
    inputTemplate: { termos: TERMOS_DOU, secao: 'do1', janelaDias: 7 },
  }
  d.steps[1] = { ...d.steps[1], inputTemplate: { janelaDias: 7 } }
  return d
}

Deno.test('C2: o monitor é o principal; ato de abril não dispara a busca longa', async () => {
  const anvisaAbril = {
    data: '08/04/2026', secao: 'do1', tipo: 'Resolução', titulo: 'Resolução da ANVISA', orgao: 'Agência Nacional de Vigilância Sanitária',
    ementa: 'Dispõe sobre registro de medicamento.', url: 'https://www.in.gov.br/web/dou/-/anvisa-abril', termo_encontrado: 'anvisa',
  }
  const certo = pubDou({
    data: '12/10/2026', url: 'https://www.in.gov.br/web/dou/-/lc-1', url_title: 'lc-1', tipo: 'Instrução Normativa',
    orgao: 'Receita Federal do Brasil', titulo: 'INSTRUÇÃO NORMATIVA Nº 9', ementa: 'Dispõe sobre a CBS e o IBS na reforma tributária.',
    termo_encontrado: 'CBS',
  })
  const c = cenario(defC2Monitor(), {
    [DOU_MONITOR]: { itens: [anvisaAbril], usageTotalUsd: 0.12 },
    [JENKO]: { itens: [certo], usageTotalUsd: 0.2 },
  })
  const r = await c.rodar()
  assertEquals(c.posts().map((p) => p.caminho.split('/')[3]), [DOU_MONITOR])
  assertEquals(c.posts()[0].corpo, { q: TERMOS_DOU, s: 'DO1' })
  assertEquals(r.desfecho, 'concluida')
  assertEquals(r.mercado, [])
  assert(!JSON.stringify(r).includes('medicamento'))
  assert(!MARCA_INTERNA.test(JSON.stringify(r)))
})

Deno.test('C2: data dd/mm/aaaa dos últimos 3 dias cabe na janela de 7 e vira Sinal, sem a busca longa', async () => {
  const certo = pubDou({
    data: '11/10/2026', url: 'https://www.in.gov.br/web/dou/-/lc-1', url_title: 'lc-1', tipo: 'Instrução Normativa',
    orgao: 'Receita Federal do Brasil', titulo: 'INSTRUÇÃO NORMATIVA Nº 9', ementa: 'Dispõe sobre a CBS e o IBS na reforma tributária.',
    termo_encontrado: 'CBS',
  })
  const c = cenario(defC2Monitor(), {
    [DOU_MONITOR]: { itens: [certo], usageTotalUsd: 0.12 },
    [JENKO]: { itens: [pubDou({ data: '01/01/2020', titulo: 'não devia', url: 'https://www.in.gov.br/web/dou/-/reserva' })], usageTotalUsd: 0.2 },
  })
  const r = await c.rodar()
  assertEquals(c.posts().map((p) => p.caminho.split('/')[3]), [DOU_MONITOR])
  assertEquals(r.mercado.map((m) => m.eventKey), ['dou|lc-1'])
  assertEquals(r.mercado[0].firedAt, '2026-10-11T12:00:00.000Z')
  assert(!MARCA_INTERNA.test(JSON.stringify(r)))
})

Deno.test('C2: palavra solta não vira Sinal; só a publicação com a frase exata do termo', async () => {
  const solta = pubDou({
    data: '12/10/2026', url: 'https://www.in.gov.br/web/dou/-/solta', url_title: 'solta',
    titulo: 'Resolução sobre a reforma do marco', orgao: 'Agência Nacional de Energia Elétrica',
    ementa: 'Altera regra de energia elétrica. Não cita o tributo novo.', termo_encontrado: 'reforma',
  })
  const c = cenario(defC2Monitor(), {
    [DOU_MONITOR]: { itens: [solta], usageTotalUsd: 0.11 },
    [JENKO]: { itens: [], usageTotalUsd: 0.05 },
  })
  const r = await c.rodar()
  assertEquals(c.posts().map((p) => p.caminho.split('/')[3]), [DOU_MONITOR])
  assertEquals(r.mercado.length, 0)
})

Deno.test('C2: o actor principal falha e o alternativo (monitor do DOU) assume com a entrada e a saída dele', async () => {
  const c = cenario(defC2(), {
    [JENKO]: { estados: ['FAILED'], mensagem: 'boom', usageTotalUsd: 0 },
    [DOU_MONITOR]: {
      itens: [{ secao: 'DO1', data: '09/10/2026', titulo: 'Resolução ANATEL', tipo: 'Resolução', resumo: 'Regulamento de telecomunicações da agência reguladora.', url: 'https://www.in.gov.br/web/dou/-/resolucao-77', termoBuscado: 'agência reguladora', orgao: 'Agência Nacional de Telecomunicações' }],
      usageTotalUsd: 0.11,
    },
  })
  const r = await c.rodar()
  assertEquals([r.desfecho, r.mercado.length], ['concluida', 1])
  const alt = c.posts().find((p) => p.caminho.includes('dou-monitor'))!
  assertEquals(alt.corpo, { q: TERMOS_DOU, s: 'DO1' })
  assertEquals((r.mercado[0].payload as { divisoesCnae: string[] }).divisoesCnae, ['60', '61'])
  assertEquals(c.banco.passos.filter((p) => p.ordem === 1).map((p) => [p.tentativa, p.fim?.estado]), [[1, 'failed'], [2, 'succeeded']])
})

Deno.test('C2: a regra por palavras-chave (tabela interna) reconhece setor por agência e a reforma tributária', () => {
  assertEquals(classificarPorPalavras('Resolução da ANEEL sobre o mercado livre de energia').setores.map((s) => s.divisoes), [['35']])
  assertEquals(classificarPorPalavras('Dispõe sobre o IBS').reforma, true)
  assertEquals(classificarPorPalavras('Ana Souza foi nomeada').setores.length, 0)
  assertEquals(classificarPorPalavras('Compra de material de escritório'), { reforma: false, setores: [] })
})

// ---------------------------------------------------------------------------------------------------------------------
// C3 · Recuperação judicial

const noticia = (title: string, extra: Record<string, unknown> = {}) => ({
  title, source: 'Valor Econômico', url: `https://news.google.com/rss/articles/${encodeURIComponent(title).slice(0, 12)}`, publishedAt: dias(2), ...extra,
})
const NOTICIAS = [
  noticia('Alfa Indústria pede recuperação judicial - Valor Econômico'),
  noticia('Justiça nega pedido de falência da Beta Comércio - Folha'),
  noticia('Delta Construtora Ltda entra com pedido de recuperação judicial - Estadão', { publishedAt: dias(1) }),
  noticia('Produtor rural João da Silva pede recuperação judicial - Globo Rural'),
  noticia('João Pereira pede recuperação judicial - Folha'),
  noticia('Gama Transportes tem falência decretada pela Justiça - Valor Econômico'),
  noticia('Empresa antiga pede recuperação judicial', { publishedAt: dias(30) }),
]
const linhaConfirmacao = (cnpj: string, rj: boolean) => ({
  cnpj, encontrado: true, erro: null, totalProcessos: 20, consultadoEm: dias(0),
  distribuicao: { porTipoProcedimentoCnj: rj ? { 'RECUPERACAO JUDICIAL': 1, 'EXECUCAO FISCAL': 4 } : { 'EXECUCAO FISCAL': 4 } },
})

Deno.test('C3: a notícia de recuperação judicial de uma Conta vira Sinal, confirmado nos processos do CNPJ; o resto só é contado', async () => {
  const c = cenario(defC3(), {
    [NEWS]: { itens: NOTICIAS, usageTotalUsd: 0.028 },
    [LAWSUITS]: { itens: [linhaConfirmacao('11222333000181', true)], usageTotalUsd: 0.1 },
  }, { contas: [ALFA, BETA, GAMA] })
  const r = await c.rodar()
  assertEquals(r.desfecho, 'concluida')
  assertEquals(r.sinais.map((s) => [s.contaId, s.eventKey]).sort(), [['conta-alfa', 'alfa industria|recuperacao_judicial|2026'], ['conta-gama', 'gama transportes|falencia|2026']])
  const alfa = r.sinais.find((s) => s.contaId === 'conta-alfa')!
  assertStringIncludes(alfa.phrase, 'recuperação judicial')
  assertStringIncludes(alfa.evidence, 'Confirmado nos processos públicos do CNPJ')
  const gama = r.sinais.find((s) => s.contaId === 'conta-gama')!
  assert(!gama.evidence.includes('Confirmado'), 'Conta sem CNPJ: sem confirmação')
  // Entrada do actor de notícias e da confirmação (só a Conta com CNPJ).
  assertEquals(c.posts()[0].corpo, {
    keywords: ['"recuperação judicial" OR "pedido de falência"'], timeframe: '7d', region_language: 'BR:pt-419', maxArticles: 40,
    extractImages: false, extractDescriptions: false, decodeUrls: false,
  })
  assertEquals(c.posts()[1].corpo, { cnpjs: ['11222333000181'] })
  // Delta Construtora é empresa com marcador, mas não é Conta: contada. Pessoa física, negativa e antiga: fora.
  assertEquals([r.semConta, r.semContaNomes], [1, ['Delta Construtora Ltda']])
  const tudo = JSON.stringify(r)
  assert(!tudo.includes('João') && !tudo.includes('produtor'), 'pessoa física nunca chega ao resultado')
  assert(!MARCA_INTERNA.test(tudo))
})

Deno.test('C3: sem Conta com CNPJ a confirmação é pulada (não custa); sem confirmação nos processos, o Sinal fica e a evidência diz', async () => {
  const sem = cenario(defC3(), { [NEWS]: { itens: [NOTICIAS[5]], usageTotalUsd: 0.004 } }, { contas: [GAMA] })
  const a = await sem.rodar()
  assertEquals([a.novos, sem.posts().length, sem.banco.passos.find((p) => p.ordem === 4)?.fim?.estado], [1, 1, 'skipped'])

  const padrao = cenario(defC3(), {
    [NEWS]: { itens: [NOTICIAS[0]], usageTotalUsd: 0.004 }, [LAWSUITS]: { itens: [linhaConfirmacao('11222333000181', false)], usageTotalUsd: 0.1 },
  }, { contas: [ALFA] })
  const p = await padrao.rodar()
  assertEquals(p.novos, 1)
  assertStringIncludes(p.sinais[0].evidence, 'não apareceu')
})

Deno.test('C3: a extração por regra tira o nome da manchete e descarta negativas, pessoa física e fora da janela', async () => {
  const impl = passosDoIcp_c().passos.jur_empresas_em_recuperacao
  const itens = NOTICIAS.map((n) => ({ tipo: 'noticia', titulo: n.title, fonte: n.source, url: n.url, publicadaEm: n.publishedAt }))
  const saida = await impl.executar!(itens, ctxDePasso({ contas: [ALFA, GAMA], def: passo({ ordem: 2, kind: 'regra', handler: 'x', inputTemplate: { janelaDias: 7 } }) }))
  const nomes = saida.map((i) => (i.empresa as { nome: string }).nome).sort()
  assertEquals(nomes, ['Alfa Indústria', 'Delta Construtora Ltda', 'Gama Transportes'])
  const gama = saida.find((i) => (i.empresa as { nome: string }).nome === 'Gama Transportes')!
  assertEquals((gama.fatos as { chave: string }[])[0].chave, 'falencia|2026')
})

Deno.test('C3: com o modelo de linguagem, só vale o que ele diz ser pessoa jurídica com entrada em recuperação ou falência', async () => {
  const llm: Llm = {
    json: () => Promise.resolve({
      json: { itens: [
        { i: 0, empresa: 'Alfa Indústria S.A.', fato: 'recuperacao_judicial', pessoaJuridica: true },
        { i: 1, empresa: 'Beta Comércio', fato: 'nenhum', pessoaJuridica: true },
        { i: 3, empresa: 'João da Silva', fato: 'recuperacao_judicial', pessoaJuridica: false },
      ] },
      custoUsd: 0.0003,
    }),
  }
  const c = cenario(defC3(), { [NEWS]: { itens: NOTICIAS, usageTotalUsd: 0.028 } }, { contas: [ALFA], llm })
  const r = await c.rodar()
  assertEquals(r.sinais.map((s) => s.contaId), ['conta-alfa'])
  assertEquals(r.custoUsd, 0.0283)
  assert(!JSON.stringify(r).includes('João'))
})

// ---------------------------------------------------------------------------------------------------------------------
// C4 · Impacto da reforma no CNAE (mercado)

const empresaCnae = (extra: Record<string, unknown>) => ({
  cnpj: '12345678000190', razao_social: 'TRANSPORTES RAPIDO LTDA', nome_fantasia: 'Rapido', situacao_cadastral: 'ATIVA', cnae_principal_codigo: '4930201',
  cnae_principal_descricao: 'Transporte rodoviário de carga', natureza_juridica_codigo: '2062', uf: 'SP', porte: 'DEMAIS', mei: false,
  qsa: [{ nome_socio: 'Sócio Secreto' }], email: 'contato@rapido.test', telefone1: '11999999999', ...extra,
})

Deno.test('C4: escolhe o setor de maior impacto ainda não sinalizado no ano e traz uma amostra de empresas sem dado pessoal', async () => {
  const c = cenario(defC4(), {
    [CNPJ_SCRAPER]: {
      itens: [
        empresaCnae({}),
        empresaCnae({ cnpj: '99999999000100', razao_social: 'JOSE DA SILVA 12345678901', natureza_juridica_codigo: '2135', mei: true }),
        empresaCnae({ cnpj: '88888888000100', razao_social: 'BAIXADA LTDA', situacao_cadastral: 'BAIXADA' }),
      ],
      usageTotalUsd: 0.003,
    },
  })
  const r = await c.rodar()
  assertEquals([r.desfecho, r.novos, r.mercado.length], ['concluida', 1, 1])
  const corpo = c.posts()[0].corpo as { cnae: string; uf: string; maxItems: number }
  const primeiro = IMPACTO_DA_REFORMA.find((i) => i.cnaeRepresentativo === corpo.cnae)!
  assertEquals([corpo.uf, corpo.maxItems, primeiro.impacto], ['', 20, 'alto'])
  const m = r.mercado[0]
  assertEquals(m.eventKey, `reforma|${primeiro.divisao}|2026`)
  assertStringIncludes(m.phrase, primeiro.setor)
  assertStringIncludes(m.phrase, 'impacto alto')
  assertEquals((m.payload as { amostra: { razaoSocial: string }[] }).amostra.map((a) => a.razaoSocial), ['TRANSPORTES RAPIDO LTDA'])
  const tudo = JSON.stringify(r)
  for (const x of ['Sócio Secreto', 'rapido.test', '11999999999', 'JOSE DA SILVA']) assert(!tudo.includes(x), `vazou: ${x}`)
  assert(!MARCA_INTERNA.test(tudo))
  // A fotografia marca o setor como feito neste ano.
  assertEquals(c.banco.gravadas.map((g) => g.chave), [`cnae:${primeiro.divisao}`])
})

Deno.test('C4: o setor já sinalizado no ano é pulado na rodada seguinte, e o pedido pode escolher o CNAE', async () => {
  const segundo = IMPACTO_DA_REFORMA.filter((i) => i.impacto === 'alto')[1]
  const primeiroAlto = IMPACTO_DA_REFORMA.filter((i) => i.impacto === 'alto')[0]
  const c = cenario(defC4(), { [CNPJ_SCRAPER]: { itens: [empresaCnae({})], usageTotalUsd: 0.002 } },
    { fotografias: { [`cnae:${primeiroAlto.divisao}`]: [{ takenAt: dias(7), data: { ano: 2026 } }] } })
  await c.rodar()
  assertEquals((c.posts()[0].corpo as { cnae: string }).cnae, segundo.cnaeRepresentativo)
  const d = cenario(defC4(), { [CNPJ_SCRAPER]: { itens: [empresaCnae({})], usageTotalUsd: 0.002 } })
  const r = await d.rodar({ criterios: { cnae: '4711302' } })
  assertEquals((d.posts()[0].corpo as { cnae: string }).cnae, '4711302')
  assertEquals(r.mercado[0].eventKey, 'reforma|47|2026')
})

Deno.test('C4: a tabela interna de impacto é consistente', () => {
  const vistas = new Set<string>()
  for (const i of IMPACTO_DA_REFORMA) {
    assert(!vistas.has(i.divisao), `divisão repetida ${i.divisao}`)
    vistas.add(i.divisao)
    assertEquals(i.cnaeRepresentativo.length, 7)
    assertEquals(divisaoDoCnae(i.cnaeRepresentativo), i.divisao)
    assert(['alto', 'medio', 'baixo'].includes(i.impacto))
    assert(i.motivo.length > 10 && !MARCA_INTERNA.test(JSON.stringify(i)))
  }
  assert(IMPACTO_DA_REFORMA.filter((i) => i.impacto === 'alto').length >= 3)
  assertEquals(divisaoDoCnae('49.30-2-01'), '49')
})

// ---------------------------------------------------------------------------------------------------------------------
// Sem fonte, migração e registro

Deno.test('Jusbrasil/DataJud por CNPJ: sem fonte, com o motivo, sem reservar crédito nem citar fornecedor', async () => {
  const motivo = 'x'
  const def: CascataDef = { ...defC1(), signalType: 'processos_jusbrasil_datajud', state: 'sem_fonte', semFonteMotivo: motivo, steps: [] }
  const c = cenario(def, {}, { contas: [ALFA] })
  const r = await c.rodar()
  assertEquals([r.desfecho, r.mensagem, c.banco.aberturas.length], ['sem_fonte', motivo, 0])
})

// Lê a migração: precisa de --allow-read (o passo próprio do CI); sem a permissão, é ignorado.
const ARQUIVO_DA_MIGRACAO = new URL('../../../../migrations/20261013170000_cascatas_icp_c.sql', import.meta.url)
const podeLer = (await Deno.permissions.query({ name: 'read', path: ARQUIVO_DA_MIGRACAO })).state === 'granted'

Deno.test({ name: 'a migração do ICP C só aponta para handlers que o código implementa, e as cascatas nascem em teste', ignore: !podeLer, async fn() {
  const sql = await Deno.readTextFile(ARQUIVO_DA_MIGRACAO)
  const handlers = [...sql.matchAll(/"handler":\s*"([a-z0-9_]+)"/g)].map((m) => m[1])
  assert(handlers.length >= 10)
  const registro = registroDePassos()
  for (const h of handlers) assert(registro.passos[h], `handler sem implementação: ${h}`)
  assert(!/"state":\s*"available"/.test(sql))
} })

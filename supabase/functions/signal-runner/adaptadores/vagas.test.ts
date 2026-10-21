// Os adaptadores de vaga (sinais-reais 03) com resultados de exemplo no formato do README de cada actor. Empresas,
// pessoas e vagas são fictícias: nenhum dado pessoal real.
import { assert, assertEquals } from 'jsr:@std/assert@1'
import type { ContaParaVarrer } from '../handler.ts'
import { vagaIndeed } from './vaga-indeed.ts'
import { vagaLinkedin } from './vaga-linkedin.ts'

const AGORA = Date.parse('2026-09-30T12:00:00Z')
const CONTA: ContaParaVarrer = {
  id: 'conta-1',
  name: 'Acme Logística S.A.',
  domain: 'acmelog.com.br',
  linkedinUrl: 'https://www.linkedin.com/company/acme-logistica/',
}
const CRITERIOS = {
  funcoes: ['Engenharia de dados'],
  senioridade: 'Qualquer',
  localizacao: ['Brasil'],
  periodo: 'Últimos 30 dias',
  palavras: '',
}

// Um item como o do README do curious_coder/linkedin-jobs-scraper.
const itemDoLinkedin = (extra: Record<string, unknown> = {}) => ({
  id: '4100000001',
  link: 'https://br.linkedin.com/jobs/view/engenheiro-de-dados-at-acme-4100000001?refId=abc&trackingId=def',
  title: 'Engenheiro(a) de Dados Sr.',
  companyName: 'Acme Logística',
  companyLinkedinUrl: 'https://br.linkedin.com/company/acme-logistica?trk=public_jobs',
  location: 'São Paulo, SP',
  postedAt: '2026-09-25',
  descriptionText: 'Vamos migrar o data warehouse para um lakehouse.',
  jobPosterName: 'Pessoa Fictícia',
  seniorityLevel: 'Mid-Senior level',
  ...extra,
})

// Um item como o do README do valig/indeed-jobs-scraper.
const itemDoIndeed = (extra: Record<string, unknown> = {}) => ({
  key: 'a1b2c3d4e5f60718',
  url: 'https://br.indeed.com/viewjob?jk=a1b2c3d4e5f60718',
  title: 'Engenheira de Dados Sênior',
  datePublished: '2026-09-26T05:00:00.000Z',
  location: { countryName: 'Brazil', countryCode: 'BR', city: 'Campinas' },
  employer: { name: 'ACME LOGISTICA LTDA', corporateWebsite: 'https://www.acmelog.com.br', ceoName: 'Pessoa Fictícia' },
  attributes: { UB7SC: 'Senior level' },
  description: { text: 'Pipeline de dados em nuvem.' },
  ...extra,
})

Deno.test('LinkedIn: busca o nome da Conta com cada função, no país e no período escolhidos', () => {
  const { input, maxItems } = vagaLinkedin.entrada(CONTA, { ...CRITERIOS, funcoes: ['Engenharia de dados', 'RevOps e GTM'] }, AGORA)
  const urls = (input.urls as string[]).map((u) => new URL(u))
  assertEquals(urls.map((u) => u.searchParams.get('keywords')), [
    'Acme Logística S.A. engenheiro de dados',
    'Acme Logística S.A. revops',
  ])
  assertEquals(urls[0].searchParams.get('location'), 'Brazil')
  assertEquals(urls[0].searchParams.get('f_TPR'), `r${30 * 86400}`)
  assertEquals(input.scrapeCompany, false)
  assertEquals(input.limitPerSource, 25)
  assertEquals(maxItems, 50)
})

Deno.test('LinkedIn: sem função escolhida, busca só o nome da Conta', () => {
  const { input } = vagaLinkedin.entrada(CONTA, { periodo: 'Últimos 7 dias' }, AGORA)
  const [url] = (input.urls as string[]).map((u) => new URL(u))
  assertEquals(url.searchParams.get('keywords'), 'Acme Logística S.A.')
  assertEquals(url.searchParams.get('f_TPR'), `r${7 * 86400}`)
})

Deno.test('LinkedIn: a vaga da Conta vira Sinal com data, fonte e evidência, sem o nome de quem publicou', () => {
  const [s, ...resto] = vagaLinkedin.sinais([itemDoLinkedin()], CONTA, CRITERIOS, AGORA)
  assertEquals(resto, [])
  assertEquals(s.eventKey, 'vaga|acme logistica|engenheiro de dados senior|2026')
  assertEquals(s.phrase, 'Abriu vaga de Engenheiro(a) de Dados Sr. em São Paulo, SP')
  assertEquals(s.firedAt, '2026-09-25T00:00:00.000Z')
  assertEquals(s.source, 'LinkedIn Vagas')
  assert(s.evidence!.includes('https://www.linkedin.com/jobs/view/4100000001'))
  assert(s.evidence!.includes('publicada em 25/09/2026'))
  assert(!s.evidence!.includes('Pessoa Fictícia'))
})

Deno.test('LinkedIn: vaga de outra empresa, de outra função, antiga ou sem as palavras não vira Sinal', () => {
  const outraEmpresa = itemDoLinkedin({ companyName: 'Acme Logística', companyLinkedinUrl: 'https://www.linkedin.com/company/acme-outra' })
  const outraFuncao = itemDoLinkedin({ title: 'Analista Financeiro' })
  const antiga = itemDoLinkedin({ postedAt: '2026-07-01' })
  assertEquals(vagaLinkedin.sinais([outraEmpresa, outraFuncao, antiga, 'erro', null], CONTA, CRITERIOS, AGORA), [])
  assertEquals(vagaLinkedin.sinais([itemDoLinkedin()], CONTA, { ...CRITERIOS, palavras: 'kubernetes, spark' }, AGORA), [])
  assertEquals(vagaLinkedin.sinais([itemDoLinkedin()], CONTA, { ...CRITERIOS, palavras: 'kubernetes, lakehouse' }, AGORA).length, 1)
})

Deno.test('LinkedIn: sem a página no LinkedIn, a Conta é reconhecida pelo nome sem a forma jurídica', () => {
  const semPagina = { ...CONTA, linkedinUrl: null }
  assertEquals(vagaLinkedin.sinais([itemDoLinkedin()], semPagina, CRITERIOS, AGORA).length, 1)
  assertEquals(vagaLinkedin.sinais([itemDoLinkedin({ companyName: 'Acme Logística Express' })], semPagina, CRITERIOS, AGORA), [])
})

Deno.test('LinkedIn: senioridade de liderança aceita o cargo ou o nível do LinkedIn', () => {
  const lideranca = { ...CRITERIOS, senioridade: 'Liderança' }
  assertEquals(vagaLinkedin.sinais([itemDoLinkedin()], CONTA, lideranca, AGORA), [])
  assertEquals(vagaLinkedin.sinais([itemDoLinkedin({ title: 'Head de Engenharia de Dados' })], CONTA, lideranca, AGORA).length, 1)
  assertEquals(vagaLinkedin.sinais([itemDoLinkedin({ seniorityLevel: 'Director' })], CONTA, lideranca, AGORA).length, 1)
})

Deno.test('LinkedIn: a mesma vaga repetida no resultado conta uma vez', () => {
  const repetida = itemDoLinkedin({ id: '4100000002', postedAt: '2026-09-27' })
  const sinais = vagaLinkedin.sinais([itemDoLinkedin(), repetida], CONTA, CRITERIOS, AGORA)
  assertEquals(sinais.length, 1)
  assertEquals(sinais[0].firedAt, '2026-09-25T00:00:00.000Z')
})

Deno.test('LinkedIn: textos longos cabem nos limites do banco', () => {
  const [s] = vagaLinkedin.sinais([itemDoLinkedin({ title: `Engenheiro de Dados ${'x'.repeat(400)}`, descriptionText: 'd'.repeat(5000) })], CONTA, CRITERIOS, AGORA)
  assert(s.phrase.length <= 300 && s.eventKey.length <= 300 && s.evidence!.length <= 2000)
})

Deno.test('Indeed: busca o nome da Conta no país, com o menor período do Indeed que cobre o do Monitoramento', () => {
  assertEquals(vagaIndeed.entrada(CONTA, { ...CRITERIOS, periodo: 'Últimos 7 dias' }, AGORA), {
    input: { country: 'br', title: 'Acme Logística S.A.', limit: 100, datePosted: '7' },
    maxItems: 100,
  })
  assertEquals(vagaIndeed.entrada(CONTA, { localizacao: ['México'], periodo: 'Últimos 30 dias' }, AGORA).input, {
    country: 'mx',
    title: 'Acme Logística S.A.',
    limit: 100,
  })
})

Deno.test('Indeed: a vaga do empregador da Conta vira Sinal com a mesma chave do LinkedIn', () => {
  const [s] = vagaIndeed.sinais([itemDoIndeed()], CONTA, CRITERIOS, AGORA)
  const [doLinkedin] = vagaLinkedin.sinais([itemDoLinkedin({ title: 'Engenheira de Dados Sênior' })], CONTA, CRITERIOS, AGORA)
  assertEquals(s.eventKey, doLinkedin.eventKey)
  assertEquals(s.phrase, 'Abriu vaga de Engenheira de Dados Sênior em Campinas')
  assertEquals(s.firedAt, '2026-09-26T05:00:00.000Z')
  assertEquals(s.source, 'Indeed')
  assert(s.evidence!.includes('https://br.indeed.com/viewjob?jk=a1b2c3d4e5f60718'))
  assert(!s.evidence!.includes('Pessoa Fictícia'))
})

Deno.test('Indeed: a busca por nome traz outras empresas, que não viram Sinal', () => {
  const outra = itemDoIndeed({ employer: { name: 'Acme Seguros', corporateWebsite: 'https://acmeseguros.com.br' } })
  assertEquals(vagaIndeed.sinais([outra], CONTA, CRITERIOS, AGORA), [])
  const peloSite = itemDoIndeed({ employer: { name: 'Acme Group', corporateWebsite: 'https://carreiras.acmelog.com.br' } })
  assertEquals(vagaIndeed.sinais([peloSite], CONTA, CRITERIOS, AGORA).length, 1)
})

Deno.test('Indeed: senioridade lida no cargo ou nos atributos da vaga', () => {
  const pleno = { ...CRITERIOS, senioridade: 'Pleno e sênior' }
  assertEquals(vagaIndeed.sinais([itemDoIndeed()], CONTA, pleno, AGORA).length, 1)
  assertEquals(vagaIndeed.sinais([itemDoIndeed({ title: 'Engenheira de Dados', attributes: {} })], CONTA, pleno, AGORA), [])
})

Deno.test('LinkedIn e Indeed: a mesma vaga datada em meses diferentes pelas duas fontes tem a mesma chave; no ano seguinte, outra', () => {
  // Visto na execução real de 30/09/2026: o LinkedIn datou em setembro vagas que o Indeed datou em julho.
  const titulo = 'Engenheira de Dados Sênior'
  const [doLinkedin] = vagaLinkedin.sinais([itemDoLinkedin({ title: titulo, postedAt: '2026-09-24' })], CONTA, CRITERIOS, AGORA)
  const [doIndeed] = vagaIndeed.sinais([itemDoIndeed({ title: titulo, datePublished: '2026-07-28T05:00:00.000Z' })], CONTA, {
    ...CRITERIOS,
    periodo: 'Últimos 90 dias',
  }, AGORA)
  assertEquals(doLinkedin.eventKey, doIndeed.eventKey)
  const noAnoSeguinte = Date.parse('2027-02-10T12:00:00Z')
  const [reaberta] = vagaLinkedin.sinais([itemDoLinkedin({ title: titulo, postedAt: '2027-02-01' })], CONTA, CRITERIOS, noAnoSeguinte)
  assertEquals(reaberta.eventKey === doLinkedin.eventKey, false)
})


// Critérios Custom (nicho e cargos escritos pelo usuário).
import type { ContextoDoAdaptador } from '../handler.ts'
import { termosDaBusca } from './vaga-linkedin.ts'
import { funcoesDoMonitoramento, lerRespostaDoNicho, nichoCustom, termosDoNicho, vagasDoNicho, type Vaga } from './vagas.ts'

const CUSTOM = { ...CRITERIOS, funcoes: [], nicho: 'custom', nichoCustom: 'Óleo e gás' }

function contextoComModelo(json: unknown, falha = false) {
  const pedidos: { sistema: string; usuario: string }[] = []
  const custos: number[] = []
  const ctx = {
    workspaceId: 'ws-1',
    headcount: { base: () => Promise.resolve(null), gravar: () => Promise.resolve() },
    vagasAbertas: () => Promise.resolve(0),
    llm: {
      json: (a: { sistema: string; usuario: string }) => {
        pedidos.push(a)
        return falha ? Promise.reject(new Error('fora do ar')) : Promise.resolve({ json, custoUsd: 0.001 })
      },
    },
    custo: { adicionar: (usd: number) => { custos.push(usd) } },
  } as ContextoDoAdaptador
  return { ctx, pedidos, custos }
}

Deno.test('Custom: cargo escrito entra exatamente na busca e no filtro, sem repetir', () => {
  const criterios = { ...CRITERIOS, funcoes: ['SDR', 'sdr', ' BDR ', 'LDR'] }
  assertEquals(funcoesDoMonitoramento(criterios), ['SDR', 'BDR', 'LDR'])
  const { input } = vagaLinkedin.entrada(CONTA, criterios, AGORA)
  const urls = (input.urls as string[]).map((u) => new URL(u).searchParams.get('keywords'))
  assertEquals(urls, ['Acme Logística S.A. SDR', 'Acme Logística S.A. BDR', 'Acme Logística S.A. LDR'])
  const sinais = vagaLinkedin.sinais(
    [itemDoLinkedin({ title: 'SDR Pleno' }), itemDoLinkedin({ id: '4100000002', title: 'Analista de Marketing' })],
    CONTA,
    criterios,
    AGORA,
  )
  assertEquals(sinais.map((s) => s.phrase), ['Abriu vaga de SDR Pleno em São Paulo, SP'])
})

Deno.test('Custom: no máximo 10 cargos escritos; as opções prontas não contam', () => {
  const escritos = Array.from({ length: 12 }, (_, i) => `Cargo ${i + 1}`)
  const funcoes = funcoesDoMonitoramento({ funcoes: ['Engenharia de dados', ...escritos] })
  assertEquals(funcoes.length, 11)
  assertEquals(funcoes[0], 'Engenharia de dados')
})

Deno.test('Custom: mais cargos que buscas viram OR, sem perder nenhum', () => {
  assertEquals(termosDaBusca('Acme', ['SDR', 'BDR', 'LDR', 'AE', 'CSM'], 4), [
    'Acme (SDR OR CSM)',
    'Acme BDR',
    'Acme LDR',
    'Acme AE',
  ])
  const { input } = vagaLinkedin.entrada(CONTA, { ...CRITERIOS, funcoes: ['SDR', 'BDR', 'LDR', 'AE', 'CSM', 'SE'] }, AGORA)
  assertEquals((input.urls as string[]).length, 4)
})

Deno.test('Custom: nicho só vale com a opção Custom e é cortado em 60 letras', () => {
  assertEquals(nichoCustom({ nicho: 'custom', nichoCustom: '  Naval ' }), 'Naval')
  assertEquals(nichoCustom({ nicho: 'comex-e-importacao', nichoCustom: 'Naval' }), '')
  assertEquals(nichoCustom({ nicho: 'custom', nichoCustom: 'x'.repeat(80) }).length, 60)
  assertEquals(termosDoNicho('Óleo e gás'), ['oleo e gas', 'oleo', 'gas'])
})

Deno.test('Custom: sem modelo, a vaga só vira Sinal quando cita o nicho', () => {
  const itens = [
    itemDoLinkedin({ title: 'Engenheiro de Dados', descriptionText: 'Projetos de exploração de óleo e gás offshore.' }),
    itemDoLinkedin({ id: '4100000002', title: 'Engenheiro de Dados Pleno', descriptionText: 'Varejo e e-commerce.' }),
  ]
  const sinais = vagaLinkedin.sinais(itens, CONTA, { ...CUSTOM, funcoes: ['Engenharia de dados'] }, AGORA)
  assertEquals(sinais.length, 1)
  assert(sinais[0].evidence?.includes('óleo e gás'))
  const indeed = vagaIndeed.sinais([itemDoIndeed()], CONTA, CUSTOM, AGORA)
  assertEquals(indeed.length, 0)
})

Deno.test('Custom: com o modelo (Hermes), ele decide quais vagas são do nicho e o custo é somado', async () => {
  const { ctx, pedidos, custos } = contextoComModelo({ vagas: [{ id: '0', do_nicho: false }, { id: '1', do_nicho: true }] })
  const itens = [
    itemDoLinkedin({ title: 'SDR', descriptionText: 'Óleo e gás' }),
    itemDoLinkedin({ id: '4100000002', title: 'BDR', descriptionText: 'Estaleiro e plataformas offshore.' }),
  ]
  const sinais = await vagaLinkedin.sinaisComContexto!(itens, CONTA, { ...CUSTOM, funcoes: ['SDR', 'BDR'] }, AGORA, ctx)
  assertEquals(sinais.map((s) => s.phrase), ['Abriu vaga de BDR em São Paulo, SP'])
  assertEquals(pedidos.length, 1)
  assert(pedidos[0].usuario.startsWith('{"nicho":"Óleo e gás"}'))
  assertEquals(custos, [0.001])
})

Deno.test('Custom: se o modelo falha, vale a regra; sem nicho Custom, o modelo nem é chamado', async () => {
  const vagas: Vaga[] = [
    { titulo: 'SDR', local: '', descricao: 'Construção naval', nivel: '', link: '', publicadaEm: null },
    { titulo: 'BDR', local: '', descricao: 'Software', nivel: '', link: '', publicadaEm: null },
  ]
  const falho = contextoComModelo(null, true)
  assertEquals((await vagasDoNicho(vagas, { nicho: 'custom', nichoCustom: 'Naval' }, falho.ctx)).map((v) => v.titulo), ['SDR'])
  const semNicho = contextoComModelo({})
  assertEquals((await vagasDoNicho(vagas, { nicho: 'comex-e-importacao' }, semNicho.ctx)).length, 2)
  assertEquals(semNicho.pedidos.length, 0)
  assertEquals(lerRespostaDoNicho({ vagas: [{ id: '0', do_nicho: 'sim' }, { id: '1', do_nicho: true }] }), new Map([['1', true]]))
})

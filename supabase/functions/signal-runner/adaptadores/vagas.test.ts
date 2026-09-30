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
  assertEquals(s.eventKey, 'vaga|acme logistica|engenheiro de dados senior|2026-09')
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

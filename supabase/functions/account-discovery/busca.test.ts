// O plano da busca, os normalizadores de cada Actor e o encaixe no ICP, com resultados no formato do README de cada Actor.
// Empresas e CNPJs fictícios.
import { assert, assertEquals } from 'jsr:@std/assert@1'
import { criteriosVazios, normalizarCriterios } from './criterios.ts'
import { candidatasDaReceita, candidatasDoLinkedin, nomeLegivel } from './normalizar.ts'
import { consultaDoLinkedin, montarPlano } from './plano.ts'
import { avaliar, type CandidataBruta } from './pontuacao.ts'

const AGORA = Date.parse('2026-10-01T12:00:00Z')

// Um item como o do README do harvestapi/linkedin-company-search (modo completo).
const empresaDoLinkedin = (extra: Record<string, unknown> = {}) => ({
  id: '1043',
  universalName: 'nova-software',
  linkedinUrl: 'https://www.linkedin.com/company/nova-software/',
  name: 'Nova Software',
  tagline: 'Dados e nuvem para o varejo',
  website: 'http://www.nova.test',
  phone: null,
  employeeCount: 120,
  employeeCountRange: { start: 51, end: 200 },
  description: 'Plataforma de analytics rodando em AWS.',
  locations: [
    { country: 'BR', city: 'Curitiba', headquarter: false, parsed: { text: 'Curitiba, Brasil', countryCode: 'BR', state: 'Paraná', city: 'Curitiba' } },
    { country: 'BR', city: 'São Paulo', headquarter: true, parsed: { text: 'São Paulo, Brasil', countryCode: 'BR', state: 'São Paulo', city: 'São Paulo' } },
  ],
  specialities: ['Analytics', 'Cloud', 'Dados'],
  industries: [{ id: '4', name: 'Software Development' }, { id: '96', name: 'IT Services' }],
  ...extra,
})

// Um item como o do README do johnatan029/cnpj-empresas-brasil-scraper (modo discovery).
const empresaDaReceita = (extra: Record<string, unknown> = {}) => ({
  cnpj: '11222333000181',
  razaoSocial: 'BETA SOLUCOES EM SOFTWARE LTDA',
  nomeFantasia: 'BETA SOLUCOES',
  situacaoCadastral: 'ATIVA',
  cnaePrincipal: '6201501',
  cnaeDescricao: 'Desenvolvimento de programas de computador sob encomenda',
  naturezaJuridica: 'Sociedade Empresária Limitada',
  porte: 'ME',
  dataAbertura: '2026-03-15',
  endereco: { municipio: 'CAMPINAS', uf: 'SP', cep: '13000000' },
  source: 'minhareceita',
  ...extra,
})

Deno.test('nomeLegivel: nome todo em maiúsculas vira nome próprio; nome misto fica como está', () => {
  assertEquals(nomeLegivel('MAGAZINE LUIZA S/A'), 'Magazine Luiza S/A')
  assertEquals(nomeLegivel('BETA SOLUCOES EM SOFTWARE LTDA'), 'Beta Solucoes em Software Ltda')
  assertEquals(nomeLegivel('Casa do Código'), 'Casa do Código')
})

Deno.test('LinkedIn: o item vira candidata com site, porte, setor, sede e especialidades', () => {
  const [c] = candidatasDoLinkedin([empresaDoLinkedin()], 'run-1')
  assertEquals(c.name, 'Nova Software')
  assertEquals(c.website, 'https://www.nova.test'.replace('www.', ''))
  assertEquals(c.linkedinUrl, 'https://www.linkedin.com/company/nova-software/')
  assertEquals(c.sizeLabel, '51-200')
  assertEquals(c.employeeCount, 120)
  assertEquals(c.sector, 'Software Development, IT Services')
  assertEquals(c.uf, 'SP')
  assertEquals(c.city, 'São Paulo')
  assertEquals(c.country, 'BR')
  assertEquals(c.tags, ['Analytics', 'Cloud', 'Dados'])
  assertEquals(c.sourceRef, 'nova-software')
  assertEquals(c.sourceRunId, 'run-1')
  assertEquals(c.outrosLocais, ['Curitiba, Brasil', 'São Paulo, Brasil'])
  assert(c.description?.startsWith('Dados e nuvem para o varejo'))
})

Deno.test('LinkedIn: o site que é rede social ou página de links não identifica a empresa', () => {
  for (const site of ['https://www.facebook.com/nova', 'https://linktr.ee/nova', 'https://wa.me/5511999990000', 'https://br.linkedin.com/company/nova']) {
    assertEquals(candidatasDoLinkedin([empresaDoLinkedin({ website: site })])[0].website, undefined, site)
  }
  assertEquals(candidatasDoLinkedin([empresaDoLinkedin({ website: 'nova.com.br' })])[0].website, 'https://nova.com.br')
})

Deno.test('LinkedIn: faixa aberta, item sem nome e itens que não são objetos', () => {
  const [c] = candidatasDoLinkedin([empresaDoLinkedin({ employeeCountRange: { start: 10001, end: null }, locations: [] })])
  assertEquals(c.sizeLabel, '10001+')
  assertEquals(c.uf, undefined)
  assertEquals(candidatasDoLinkedin([{ name: '' }, null, 'x', { error: 'rate limited' }]), [])
})

Deno.test('Receita: o item vira candidata com CNPJ, atividade, porte legal e sem site', () => {
  const [c] = candidatasDaReceita([empresaDaReceita()], AGORA, 'run-2')
  assertEquals(c.name, 'Beta Solucoes')
  assertEquals(c.cnpj, '11222333000181')
  assertEquals(c.website, undefined)
  assertEquals(c.sector, 'Desenvolvimento de programas de computador sob encomenda')
  assertEquals(c.sizeLabel, 'ME')
  assertEquals(c.uf, 'SP')
  assertEquals(c.city, 'Campinas')
  assertEquals(c.location, 'Campinas, SP')
  assertEquals(c.sourceRef, '11222333000181')
})

Deno.test('Receita: empresa aberta há menos de um ano traz o indício de Sinal; a antiga, não', () => {
  const [recente] = candidatasDaReceita([empresaDaReceita()], AGORA)
  assertEquals(recente.signals, [{ texto: 'Empresa aberta em mar/2026.', fonte: 'Receita Federal', data: '2026-03-15T00:00:00.000Z' }])
  assertEquals(candidatasDaReceita([empresaDaReceita({ dataAbertura: '15/03/2019' })], AGORA)[0].signals, [])
  assertEquals(candidatasDaReceita([empresaDaReceita({ dataAbertura: '2027-01-01' })], AGORA)[0].signals, [])
})

Deno.test('Receita: empresa que não está ativa, sem CNPJ ou sem nome fica de fora', () => {
  assertEquals(candidatasDaReceita([empresaDaReceita({ situacaoCadastral: 'BAIXADA' })], AGORA), [])
  assertEquals(candidatasDaReceita([empresaDaReceita({ cnpj: '' })], AGORA), [])
  assertEquals(candidatasDaReceita([empresaDaReceita({ razaoSocial: '', nomeFantasia: '' })], AGORA), [])
  assertEquals(candidatasDaReceita([empresaDaReceita({ nomeFantasia: null })], AGORA)[0].name, 'Beta Solucoes em Software Ltda')
})

Deno.test('plano do LinkedIn: consulta com OR, locais, porte e um limite de páginas', () => {
  const criterios = normalizarCriterios({
    setores: ['Software', 'Meios de pagamento'],
    palavrasChave: ['analytics'],
    regioes: ['SP', 'Curitiba'],
    portes: ['51-200', '201-500', 'EPP'],
  })
  assertEquals(consultaDoLinkedin(criterios), 'analytics OR Software OR "Meios de pagamento"')
  const plano = montarPlano(criterios, 80)
  assertEquals(plano.actorId, 'harvestapi~linkedin-company-search')
  assertEquals(plano.chamadas.length, 1)
  assertEquals(plano.chamadas[0].input, {
    scraperMode: 'full',
    searchQuery: 'analytics OR Software OR "Meios de pagamento"',
    locations: ['São Paulo, Brazil', 'Curitiba, Brazil'],
    companySize: ['51-200', '201-500'],
    maxItems: 80,
    takePages: 2,
  })
  assertEquals(plano.chamadas[0].maxItems, 80)
})

Deno.test('plano do LinkedIn: a consulta cabe nos 300 caracteres do Actor', () => {
  const termos = Array.from({ length: 20 }, (_, i) => `termo número ${i} bem comprido`)
  const consulta = consultaDoLinkedin(normalizarCriterios({ setores: termos }))
  assert(consulta.length <= 300)
  assert(consulta.startsWith('"termo número 0 bem comprido" OR '))
})

Deno.test('plano da Receita: uma execução por CNAE e estado, repartindo o limite', () => {
  const criterios = normalizarCriterios({ fonte: 'receita', cnaes: ['6201-5/01', '6202300'], regioes: ['SP', 'Minas Gerais', 'Brasil'] })
  const plano = montarPlano(criterios, 60)
  assertEquals(plano.actorId, 'johnatan029~cnpj-empresas-brasil-scraper')
  assertEquals(plano.chamadas.length, 4)
  assertEquals(plano.chamadas[0].input, { mode: 'discovery', cnae: '6201501', uf: 'SP', situacao: 'ATIVA', maxResults: 15 })
  assertEquals(plano.chamadas[3].input, { mode: 'discovery', cnae: '6202300', uf: 'MG', situacao: 'ATIVA', maxResults: 15 })
})

Deno.test('plano da Receita: sem estado a busca vale o país, e no máximo seis execuções', () => {
  const sem = montarPlano(normalizarCriterios({ fonte: 'receita', cnaes: ['6201501'] }), 50)
  assertEquals(sem.chamadas[0].input, { mode: 'discovery', cnae: '6201501', situacao: 'ATIVA', maxResults: 50 })
  const muitos = montarPlano(
    normalizarCriterios({ fonte: 'receita', cnaes: ['6201501', '6202300', '6203100'], regioes: ['SP', 'RJ', 'MG', 'PR'] }),
    60,
  )
  assertEquals(muitos.chamadas.length, 6)
  assertEquals(muitos.chamadas[0].maxItems, 10)
})

Deno.test('plano: sem filtros que bastem, lança', () => {
  let erro: unknown
  try {
    montarPlano({ ...criteriosVazios(), fonte: 'receita' }, 50)
  } catch (e) {
    erro = e
  }
  assert(erro instanceof Error)
})

const candidata = (extra: Partial<CandidataBruta> = {}): CandidataBruta => ({
  name: 'Nova Software',
  sector: 'Software Development',
  sizeLabel: '51-200',
  employeeCount: 120,
  uf: 'SP',
  city: 'São Paulo',
  country: 'BR',
  location: 'São Paulo, Brasil',
  description: 'Plataforma de analytics rodando em AWS.',
  tags: ['Analytics', 'Cloud'],
  sourceActor: 'harvestapi~linkedin-company-search',
  signals: [],
  ...extra,
})

Deno.test('encaixe: todos os critérios batem, nível alto e um motivo por critério', () => {
  const a = avaliar(
    candidata(),
    normalizarCriterios({ setores: ['software'], portes: ['51-200'], regioes: ['SP'], tecnologias: ['AWS'] }),
  )
  assertEquals(a.level, 'alto')
  assertEquals(a.score, 100)
  assertEquals(a.excluida, false)
  assertEquals(a.reasons.map((m) => [m.criterio, m.atende]), [['setor', true], ['regiao', true], ['porte', true], ['tecnologia', true]])
  assertEquals(a.reasons[0].texto, 'Setor: combina com "software".')
  assertEquals(a.reasons[1].texto, 'Região: sede em SP.')
})

Deno.test('encaixe: o que não bate pesa contra, pelo peso de cada critério', () => {
  const a = avaliar(
    candidata({ uf: 'RJ', city: 'Rio de Janeiro', location: 'Rio de Janeiro, Brasil' }),
    normalizarCriterios({ setores: ['software'], portes: ['51-200'], regioes: ['SP'] }),
  )
  // setor 35 + porte 25 de 85 = 70.
  assertEquals(a.score, 71)
  assertEquals(a.level, 'medio')
  assertEquals(a.reasons.find((m) => m.criterio === 'regiao')?.texto, 'Região: fica fora de SP.')
  const baixo = avaliar(candidata({ sector: 'Varejo', description: 'Lojas de roupa.', tags: [] }), normalizarCriterios({ setores: ['software'], regioes: ['MG'] }))
  assertEquals(baixo.level, 'baixo')
  assertEquals(baixo.score, 0)
})

Deno.test('encaixe: a fonte que não informou fica "sem dado" e não pesa nem a favor nem contra', () => {
  const a = avaliar(
    candidata({ employeeCount: undefined, sizeLabel: undefined }),
    normalizarCriterios({ setores: ['software'], portes: ['51-200'] }),
  )
  assertEquals(a.score, 100)
  assertEquals(a.reasons.find((m) => m.criterio === 'porte'), {
    criterio: 'porte',
    atende: null,
    texto: 'Porte: a fonte não informou o número de funcionários.',
  })
  const nada = avaliar(candidata({ sector: undefined, description: undefined, tags: [], uf: undefined, city: undefined, country: undefined, location: undefined }),
    normalizarCriterios({ setores: ['software'], regioes: ['SP'] }))
  assertEquals(nada.level, 'sem_dado')
  assertEquals(nada.score, 0)
})

Deno.test('encaixe: sem critério escolhido não há o que avaliar', () => {
  const a = avaliar(candidata(), criteriosVazios())
  assertEquals(a.level, 'sem_dado')
  assertEquals(a.reasons, [])
})

Deno.test('encaixe: porte pelo número de funcionários, pela faixa e pelo porte legal da Receita', () => {
  const faixa = normalizarCriterios({ portes: ['201-500'] })
  assertEquals(avaliar(candidata({ employeeCount: 120 }), faixa).reasons[0].atende, false)
  assertEquals(avaliar(candidata({ employeeCount: 300 }), faixa).reasons[0].atende, true)
  assertEquals(avaliar(candidata({ employeeCount: undefined, sizeLabel: '201-500' }), faixa).reasons[0].atende, true)
  assertEquals(avaliar(candidata({ employeeCount: undefined, sizeLabel: '10001+' }), normalizarCriterios({ portes: ['10001+'] })).reasons[0].atende, true)
  const legal = normalizarCriterios({ portes: ['ME', 'EPP'] })
  assertEquals(avaliar(candidata({ employeeCount: undefined, sizeLabel: 'ME' }), legal).reasons[0].atende, true)
  assertEquals(avaliar(candidata({ employeeCount: undefined, sizeLabel: 'DEMAIS' }), legal).reasons[0].atende, false)
  // Critério em número de funcionários e fonte só com o porte legal: sem como comparar.
  assertEquals(avaliar(candidata({ employeeCount: undefined, sizeLabel: 'ME' }), faixa).reasons[0].atende, null)
})

Deno.test('encaixe: a região vale pela sede, por uma unidade, por "Brasil" e por cidade', () => {
  const sp = normalizarCriterios({ regioes: ['São Paulo'] })
  assertEquals(avaliar(candidata(), sp).reasons[0].atende, true)
  const curitiba = candidata({ outrosLocais: ['Curitiba, Brasil'] })
  const pr = avaliar(curitiba, normalizarCriterios({ regioes: ['Paraná'] }))
  assertEquals(pr.reasons[0], { criterio: 'regiao', atende: true, texto: 'Região: tem unidade em Paraná.' })
  assertEquals(avaliar(candidata(), normalizarCriterios({ regioes: ['Brasil'] })).reasons[0].atende, true)
  assertEquals(avaliar(candidata({ country: 'PT', uf: undefined, city: 'Lisboa', location: 'Lisboa, Portugal' }), normalizarCriterios({ regioes: ['Brasil'] })).reasons[0].atende, false)
  assertEquals(avaliar(candidata(), normalizarCriterios({ regioes: ['São Paulo'] })).reasons[0].atende, true)
  assertEquals(avaliar(candidata({ uf: undefined, location: 'Campinas, SP' }), normalizarCriterios({ regioes: ['Campinas'] })).reasons[0].atende, true)
})

Deno.test('encaixe: um termo de "excluir" tira a empresa da busca', () => {
  const a = avaliar(candidata({ description: 'Software para o governo e prefeituras.' }), normalizarCriterios({ setores: ['software'], excluir: ['governo'] }))
  assertEquals(a.excluida, true)
  assertEquals(a.reasons[0].texto, 'Tem o termo que o ICP exclui: "governo".')
})

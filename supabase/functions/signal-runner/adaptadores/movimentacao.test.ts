// Os adaptadores de movimentação de pessoas (sinais-reais 04) com resultados de exemplo no formato do README de cada
// actor da HarvestAPI. Empresas, pessoas, perfis e posts são fictícios: nenhum dado pessoal real.
import { assert, assertEquals, assertThrows } from 'jsr:@std/assert@1'
import { type ContaParaVarrer, SemDadoParaVarrer } from '../handler.ts'
import { anuncioDeMovimentacao, cargosNoTexto, descartesDeMovimentacao } from './anuncio-de-movimentacao.ts'
import { cargoAtende, cargoNormalizado, comecouNoPeriodo, ehLideranca, inicioDoCargo } from './cargos.ts'
import { entradasESaidas } from './entradas-e-saidas.ts'
import { mudancaDeEmprego } from './mudanca-de-emprego.ts'
import { novaLideranca } from './nova-lideranca.ts'

const AGORA = Date.parse('2026-09-30T12:00:00Z')
const CONTA: ContaParaVarrer = {
  id: 'conta-1',
  name: 'Acme Logística S.A.',
  domain: 'acmelog.com.br',
  linkedinUrl: 'https://www.linkedin.com/company/acme-logistica/',
  contatos: [
    { id: 'contato-1', linkedinUrl: 'https://www.linkedin.com/in/maria-exemplo/' },
    { id: 'contato-2', linkedinUrl: 'https://br.linkedin.com/in/joao-ficticio?trk=abc' },
  ],
}
const CRITERIOS = {
  cargos: [] as string[],
  movimento: [] as string[],
  pessoas: 'Qualquer pessoa no cargo',
  localizacao: ['Brasil'],
  periodo: 'Últimos 30 dias',
}

const ACME = {
  companyName: 'Acme Logística',
  companyLinkedinUrl: 'https://www.linkedin.com/company/acme-logistica/',
  companyId: '1001',
  companyUniversalName: 'acme-logistica',
}
const BETA = {
  companyName: 'Beta Tecnologia',
  companyLinkedinUrl: 'https://www.linkedin.com/company/beta-tecnologia/',
  companyId: '2002',
  companyUniversalName: 'beta-tecnologia',
}
const desde = (mes: string, ano: number) => ({ month: mes, year: ano, text: `${mes} ${ano}` })
const ATE_HOJE = { text: 'Present' }

// Um perfil como o do README do harvestapi/linkedin-profile-scraper (e o Full das buscas da HarvestAPI).
const perfil = (experiencia: Record<string, unknown>[], extra: Record<string, unknown> = {}) => ({
  id: 'ACoAAFicticio0001',
  publicIdentifier: 'maria-exemplo',
  linkedinUrl: 'https://www.linkedin.com/in/maria-exemplo',
  firstName: 'Maria',
  lastName: 'Exemplo',
  headline: 'Dados e analytics',
  photo: 'https://media.licdn.com/dms/image/foto-ficticia.jpg',
  location: { linkedinText: 'Campinas, São Paulo, Brasil', countryCode: 'BR' },
  currentPosition: [{ companyName: 'Acme Logística' }],
  experience: experiencia,
  query: { publicIdentifier: 'maria-exemplo' },
  status: 200,
  ...extra,
})
const PROMOVIDA = [
  { position: 'Diretora de Dados', ...ACME, startDate: desde('Sep', 2026), endDate: ATE_HOJE, location: 'Campinas' },
  { position: 'Gerente de Dados', ...ACME, startDate: desde('Mar', 2023), endDate: desde('Aug', 2026) },
  { position: 'Analista de Dados', ...BETA, startDate: desde('Jan', 2020), endDate: desde('Feb', 2023) },
]
const CHEGOU = [
  { position: 'Diretora de Dados', ...ACME, startDate: desde('Sep', 2026), endDate: ATE_HOJE },
  { position: 'Gerente de Dados', ...BETA, startDate: desde('Mar', 2023), endDate: desde('Aug', 2026) },
]
const SAIU = [
  { position: 'CTO', ...BETA, startDate: desde('Sep', 2026), endDate: ATE_HOJE },
  { position: 'Diretora de Dados', ...ACME, startDate: desde('Mar', 2023), endDate: desde('Aug', 2026) },
]

Deno.test('cargos: liderança em português e inglês, com marca de gênero, e o que não é liderança', () => {
  assertEquals(cargoNormalizado('Diretor(a) de Tecnologia'), 'diretor de tecnologia')
  assertEquals(cargoNormalizado('Sócia-Diretora'), 'socio diretor')
  for (const t of ['Diretora Financeira', 'Gerente de Compras', 'Head of Data', 'Sócio(a)', 'Superintendente', 'VP de Engenharia', 'CEO', 'Chief Revenue Officer']) {
    assert(ehLideranca(t), t)
  }
  for (const t of ['Analista de Dados', 'Product Manager', 'Tech Lead', 'Assistente da Diretoria', 'Assistant to the CEO', 'HR Business Partner', 'Ex-CEO']) {
    assert(!ehLideranca(t), t)
  }
  assert(cargoAtende('Diretor(a) de Tecnologia', { cargos: ['CTO'] }))
  assert(cargoAtende('Chief Data & Analytics Officer', { cargos: ['CDO'] }))
  assert(cargoAtende('Head de Engenharia de Dados', { cargos: ['Head de Dados'] }))
  assert(cargoAtende('Diretora Financeira', { cargos: ['CFO'] }))
  assert(cargoAtende('Gerente de Suprimentos', { cargos: ['Procurement'] }))
  assert(!cargoAtende('Comprador Sênior', { cargos: ['Procurement'] }))
  assert(!cargoAtende('Diretora de Dados', { cargos: ['CFO'] }))
  assert(cargoAtende('Diretora de Dados', {}))
})

Deno.test('cargos: o início do cargo tem só o mês e vale quando o mês cruza o período', () => {
  assertEquals(inicioDoCargo({ month: 'Sep', year: 2026, text: 'Sep 2026' }), '2026-09-01T00:00:00.000Z')
  assertEquals(inicioDoCargo({ month: 9, year: 2026, day: null }), '2026-09-01T00:00:00.000Z')
  assertEquals(inicioDoCargo({ text: 'Set 2026' }), '2026-09-01T00:00:00.000Z')
  assertEquals(inicioDoCargo({ year: 2026, text: '2026' }), null)
  assertEquals(inicioDoCargo(null), null)
  assert(comecouNoPeriodo('2026-09-01T00:00:00.000Z', AGORA, 7))
  assert(!comecouNoPeriodo('2026-08-01T00:00:00.000Z', AGORA, 7))
  assert(comecouNoPeriodo('2026-08-01T00:00:00.000Z', AGORA, 30))
  assert(!comecouNoPeriodo('2026-10-01T00:00:00.000Z', AGORA, 30))
})

Deno.test('Mudança de emprego: lê o LinkedIn dos Contatos da Conta, sem e-mail, sem repetir', () => {
  const repetido = { ...CONTA, contatos: [...CONTA.contatos!, { id: 'contato-3', linkedinUrl: 'https://www.linkedin.com/in/Maria-Exemplo' }] }
  assertEquals(mudancaDeEmprego.entrada(repetido, CRITERIOS, AGORA), {
    input: {
      profileScraperMode: 'Profile details no email ($4 per 1k)',
      queries: ['https://www.linkedin.com/in/maria-exemplo', 'https://www.linkedin.com/in/joao-ficticio'],
    },
    maxItems: 2,
  })
  const muitos = { ...CONTA, contatos: Array.from({ length: 40 }, (_, i) => ({ id: `c${i}`, linkedinUrl: `https://www.linkedin.com/in/pessoa-${i}` })) }
  assertEquals(mudancaDeEmprego.entrada(muitos, CRITERIOS, AGORA).maxItems, 25)
})

Deno.test('Mudança de emprego: Conta sem Contato com LinkedIn fica de fora', () => {
  for (const contatos of [undefined, [], [{ id: 'c', linkedinUrl: 'https://www.linkedin.com/company/acme-logistica' }]]) {
    assertThrows(() => mudancaDeEmprego.entrada({ ...CONTA, contatos }, CRITERIOS, AGORA), SemDadoParaVarrer, 'Contas sem Contato com LinkedIn ficaram de fora')
  }
})

Deno.test('Mudança de emprego: promoção na Conta vira Sinal com o cargo novo, a data e o perfil, sem foto nem local', () => {
  const [s, ...resto] = mudancaDeEmprego.sinais([perfil(PROMOVIDA)], CONTA, CRITERIOS, AGORA)
  assertEquals(resto, [])
  assertEquals(s.eventKey, 'mov|maria-exemplo|acme logistica|diretor de dados|2026-09')
  assertEquals(s.phrase, 'Promoção: Maria Exemplo agora é Diretora de Dados')
  assertEquals(s.firedAt, '2026-09-01T00:00:00.000Z')
  assertEquals(s.source, 'LinkedIn')
  assert(s.evidence!.includes('https://www.linkedin.com/in/maria-exemplo'))
  assert(s.evidence!.includes('desde set/2026'))
  assert(s.evidence!.includes('Antes: Gerente de Dados em Acme Logística'))
  assert(!s.evidence!.includes('media.licdn.com') && !s.evidence!.includes('Campinas'))
})

Deno.test('Mudança de emprego: chegada à Conta e saída para outra empresa', () => {
  const [chegada] = mudancaDeEmprego.sinais([perfil(CHEGOU)], CONTA, CRITERIOS, AGORA)
  assertEquals(chegada.phrase, 'Chegada: Maria Exemplo entrou como Diretora de Dados')
  const [saida] = mudancaDeEmprego.sinais([perfil(SAIU)], CONTA, CRITERIOS, AGORA)
  assertEquals(saida.phrase, 'Mudança de empresa: Maria Exemplo saiu de Acme Logística S.A. e agora é CTO em Beta Tecnologia')
  assertEquals(saida.eventKey, 'mov|maria-exemplo|beta tecnologia|cto|2026-09')
})

Deno.test('Mudança de emprego: fora do período, de outra empresa, sem mudar de cargo ou ainda na Conta não vira Sinal', () => {
  const antiga = PROMOVIDA.map((e, i) => (i === 0 ? { ...e, startDate: desde('Jun', 2026) } : e))
  const outra = [
    { position: 'CTO', ...BETA, startDate: desde('Sep', 2026), endDate: ATE_HOJE },
    { position: 'Gerente', companyName: 'Gama Varejo', startDate: desde('Jan', 2020), endDate: desde('Aug', 2026) },
  ]
  const mesmoCargo = [PROMOVIDA[0], { ...PROMOVIDA[1], position: 'Diretora de Dados' }]
  const aindaNaConta = [SAIU[0], { ...SAIU[1], endDate: ATE_HOJE }]
  const semData = [{ ...PROMOVIDA[0], startDate: { year: 2026, text: '2026' } }, PROMOVIDA[1]]
  const itens = [perfil(antiga), perfil(outra), perfil(mesmoCargo), perfil(aindaNaConta), perfil(semData), perfil([]), 'erro', null]
  assertEquals(mudancaDeEmprego.sinais(itens, CONTA, CRITERIOS, AGORA), [])
  assertEquals(mudancaDeEmprego.sinais([perfil(PROMOVIDA)], CONTA, { ...CRITERIOS, periodo: 'Últimos 7 dias' }, AGORA).length, 1)
})

Deno.test('Mudança de emprego: respeita o movimento e os cargos escolhidos', () => {
  const itens = [perfil(PROMOVIDA), perfil(CHEGOU, { publicIdentifier: 'joao-ficticio', linkedinUrl: 'https://www.linkedin.com/in/joao-ficticio' })]
  assertEquals(mudancaDeEmprego.sinais(itens, CONTA, { ...CRITERIOS, movimento: ['Chegada'] }, AGORA).map((s) => s.phrase), [
    'Chegada: Maria Exemplo entrou como Diretora de Dados',
  ])
  assertEquals(mudancaDeEmprego.sinais(itens, CONTA, { ...CRITERIOS, cargos: ['CFO'] }, AGORA), [])
  assertEquals(mudancaDeEmprego.sinais(itens, CONTA, { ...CRITERIOS, cargos: ['CDO'] }, AGORA).length, 2)
})

Deno.test('Mudança de emprego: textos longos cabem nos limites do banco', () => {
  const longa = [{ ...PROMOVIDA[0], position: `Diretora de Dados ${'x'.repeat(400)}` }, PROMOVIDA[1]]
  const [s] = mudancaDeEmprego.sinais([perfil(longa, { firstName: 'M'.repeat(500) })], CONTA, CRITERIOS, AGORA)
  assert(s.phrase.length <= 300 && s.eventKey.length <= 300 && s.evidence!.length <= 2000)
})

// Um perfil Full como o do README do harvestapi/linkedin-profile-search: a posição atual vem pelo número da empresa.
const lider = (experiencia: Record<string, unknown>[], extra: Record<string, unknown> = {}) =>
  perfil(experiencia, {
    currentPosition: [{
      companyId: '1001',
      companyLinkedinUrl: 'https://www.linkedin.com/company/1001/',
      companyName: 'Acme Logística',
      dateRange: { start: { month: 9, year: 2026, day: null }, end: null },
    }],
    ...extra,
  })

Deno.test('Nova liderança: busca quem mudou de emprego na página da Conta, nos cargos e no país, uma página só', () => {
  assertEquals(novaLideranca.entrada(CONTA, { ...CRITERIOS, cargos: ['CDO', 'Head de Dados'], localizacao: ['Brasil', 'México'] }, AGORA), {
    input: {
      profileScraperMode: 'Full',
      currentCompanies: ['https://www.linkedin.com/company/acme-logistica/'],
      recentlyChangedJobs: true,
      currentJobTitles: ['CDO', 'Chief Data Officer', 'Diretor de Dados', 'Head de Dados', 'Head of Data'],
      locations: ['Brazil', 'Mexico'],
      maxItems: 25,
      takePages: 1,
    },
    maxItems: 25,
  })
  assert((novaLideranca.entrada(CONTA, CRITERIOS, AGORA).input.currentJobTitles as string[]).includes('Diretor'))
})

Deno.test('Nova liderança: sem página no LinkedIn, ou só Contatos sem Contato, a Conta fica de fora', () => {
  assertThrows(() => novaLideranca.entrada({ ...CONTA, linkedinUrl: null }, CRITERIOS, AGORA), SemDadoParaVarrer, 'Contas sem a página da empresa no LinkedIn ficaram de fora')
  assertThrows(
    () => novaLideranca.entrada({ ...CONTA, contatos: [] }, { ...CRITERIOS, pessoas: 'Contatos das Contas-alvo' }, AGORA),
    SemDadoParaVarrer,
    'Contas sem Contato com LinkedIn ficaram de fora',
  )
})

Deno.test('Nova liderança: chegada e promoção de liderança na Conta viram Sinal', () => {
  const [chegada] = novaLideranca.sinais([lider(CHEGOU)], CONTA, CRITERIOS, AGORA)
  assertEquals(chegada.eventKey, 'lideranca|acme-logistica|maria-exemplo|diretor de dados|2026-09')
  assertEquals(chegada.phrase, 'Nova liderança: Maria Exemplo chegou como Diretora de Dados')
  assertEquals(chegada.firedAt, '2026-09-01T00:00:00.000Z')
  assert(chegada.evidence!.includes('Antes: Gerente de Dados em Beta Tecnologia'))
  const [promocao] = novaLideranca.sinais([lider(PROMOVIDA)], CONTA, CRITERIOS, AGORA)
  assertEquals(promocao.phrase, 'Nova liderança: Maria Exemplo foi promovido(a) a Diretora de Dados')
  assertEquals(novaLideranca.sinais([lider(PROMOVIDA)], CONTA, { ...CRITERIOS, movimento: ['Chegada'] }, AGORA), [])
})

Deno.test('Nova liderança: cargo que não é liderança, fora dos cargos, antigo ou em outra empresa não vira Sinal', () => {
  const analista = [{ ...CHEGOU[0], position: 'Analista de Dados' }, CHEGOU[1]]
  const antiga = [{ ...CHEGOU[0], startDate: desde('Jun', 2026) }, CHEGOU[1]]
  const outra = [{ ...CHEGOU[0], ...BETA }]
  const itens = [lider(analista), lider(antiga), perfil(outra, { currentPosition: [{ ...BETA, dateRange: { start: { month: 9, year: 2026 } } }] })]
  assertEquals(novaLideranca.sinais(itens, CONTA, CRITERIOS, AGORA), [])
  assertEquals(novaLideranca.sinais([lider(CHEGOU)], CONTA, { ...CRITERIOS, cargos: ['CFO'] }, AGORA), [])
  const cto = [{ ...CHEGOU[0], position: 'Diretor(a) de Tecnologia' }, CHEGOU[1]]
  assertEquals(novaLideranca.sinais([lider(cto)], CONTA, { ...CRITERIOS, cargos: ['CTO'] }, AGORA).length, 1)
})

Deno.test('Nova liderança: sem a experiência, vale a posição atual que a busca na página da Conta trouxe', () => {
  const soAtual = lider([], { currentPosition: [{ companyLinkedinUrl: 'https://www.linkedin.com/company/1001/', companyName: 'Acme', position: 'CFO', dateRange: { start: { month: 9, year: 2026 } } }] })
  const [s] = novaLideranca.sinais([soAtual], CONTA, CRITERIOS, AGORA)
  assertEquals(s.phrase, 'Nova liderança: Maria Exemplo chegou como CFO')
})

Deno.test('Nova liderança: "Contatos das Contas-alvo" só aceita quem é Contato da Conta', () => {
  const soContatos = { ...CRITERIOS, pessoas: 'Contatos das Contas-alvo' }
  const estranho = lider(CHEGOU, { publicIdentifier: 'pessoa-nova', linkedinUrl: 'https://www.linkedin.com/in/pessoa-nova' })
  assertEquals(novaLideranca.sinais([lider(CHEGOU), estranho], CONTA, soContatos, AGORA).map((s) => s.eventKey), [
    'lideranca|acme-logistica|maria-exemplo|diretor de dados|2026-09',
  ])
  assertEquals(novaLideranca.sinais([estranho], CONTA, CRITERIOS, AGORA).length, 1)
})

// Um perfil curto como o do harvestapi/linkedin-company-employees no modo Short (nome, perfil, posições atuais).
const funcionario = (atual: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  id: 'ACoAAFicticio0002',
  publicIdentifier: 'joao-ficticio',
  linkedinUrl: 'https://www.linkedin.com/in/joao-ficticio',
  firstName: 'João',
  lastName: 'Fictício',
  position: 'Head de Dados na Acme',
  location: { linkedinText: 'São Paulo, Brasil' },
  currentPosition: [{
    companyId: '1001',
    companyLinkedinUrl: 'https://www.linkedin.com/company/acme-logistica/',
    companyName: 'Acme Logística',
    position: 'Head de Dados',
    dateRange: { start: { month: 9, year: 2026, day: null }, end: null },
    ...atual,
  }],
  ...extra,
})

Deno.test('Entradas: busca quem tem menos de 1 ano na página da Conta, nos cargos e no país, no modo Short', () => {
  assertEquals(entradasESaidas.entrada(CONTA, { ...CRITERIOS, cargos: ['CFO'] }, AGORA), {
    input: {
      profileScraperMode: 'Short ($4 per 1k)',
      companies: ['https://www.linkedin.com/company/acme-logistica/'],
      yearsAtCurrentCompanyIds: ['1'],
      recentlyChangedJobs: true,
      jobTitles: ['CFO', 'Chief Financial Officer', 'Diretor Financeiro'],
      locations: ['Brazil'],
      maxItems: 25,
      takePages: 1,
    },
    maxItems: 25,
  })
  assertThrows(() => entradasESaidas.entrada({ ...CONTA, linkedinUrl: 'https://acmelog.com.br' }, CRITERIOS, AGORA), SemDadoParaVarrer)
})

Deno.test('Entradas: a chegada de liderança no período vira Sinal', () => {
  const [s, ...resto] = entradasESaidas.sinais([funcionario()], CONTA, CRITERIOS, AGORA)
  assertEquals(resto, [])
  assertEquals(s.eventKey, 'entrada|acme-logistica|joao-ficticio|2026-09')
  assertEquals(s.phrase, 'Entrada: João Fictício chegou como Head de Dados')
  assertEquals(s.firedAt, '2026-09-01T00:00:00.000Z')
  assert(s.evidence!.includes('https://www.linkedin.com/in/joao-ficticio') && !s.evidence!.includes('São Paulo'))
  // Sem título na posição atual, vale o `position` do perfil curto.
  assertEquals(entradasESaidas.sinais([funcionario({ position: undefined })], CONTA, CRITERIOS, AGORA)[0].phrase, 'Entrada: João Fictício chegou como Head de Dados na Acme')
})

Deno.test('Entradas: sem data, antiga, fora da liderança, de outra empresa, promoção ou outro movimento não vira Sinal', () => {
  const itens = [
    funcionario({ dateRange: { start: { year: 2026 } } }),
    funcionario({ dateRange: { start: { month: 5, year: 2026 } } }),
    funcionario({ position: 'Analista de Dados' }),
    funcionario({ ...BETA }),
    funcionario({}, { experience: [{ position: 'Head de Dados', ...ACME, startDate: desde('Sep', 2026), endDate: ATE_HOJE }, { position: 'Gerente de Dados', ...ACME, startDate: desde('Jan', 2026), endDate: desde('Aug', 2026) }] }),
  ]
  assertEquals(entradasESaidas.sinais(itens, CONTA, CRITERIOS, AGORA), [])
  assertEquals(entradasESaidas.sinais([funcionario()], CONTA, { ...CRITERIOS, movimento: ['Promoção'] }, AGORA), [])
  assertEquals(entradasESaidas.sinais([funcionario()], CONTA, { ...CRITERIOS, cargos: ['CTO'] }, AGORA), [])
  assertEquals(entradasESaidas.sinais([funcionario()], CONTA, { ...CRITERIOS, cargos: ['Head de Dados'], movimento: ['Chegada'] }, AGORA).length, 1)
})

// Um post como o do README do harvestapi/linkedin-post-search.
const post = (conteudo: string, extra: Record<string, unknown> = {}) => ({
  type: 'post',
  id: '7380000000000000001',
  linkedinUrl: 'https://www.linkedin.com/posts/maria-exemplo_novocargo-activity-7380000000000000001-AbCd?utm_source=share',
  content: conteudo,
  author: {
    universalName: null,
    publicIdentifier: 'maria-exemplo',
    type: 'profile',
    name: 'Maria Exemplo',
    linkedinUrl: 'https://www.linkedin.com/in/maria-exemplo?miniProfileUrn=urn%3Ali%3Afsd_profile%3AFicticio',
    info: 'Dados na Acme Logística',
    avatar: { url: 'https://media.licdn.com/dms/image/avatar-ficticio.jpg' },
  },
  postedAt: { timestamp: Date.parse('2026-09-25T10:00:00Z'), date: '2026-09-25T10:00:00.000Z', postedAgoShort: '5d' },
  engagement: { likes: 10, comments: 2, shares: 0 },
  ...extra,
})
const CHEGADA = 'Tenho o prazer de compartilhar que estou começando em um novo cargo como Diretora de Dados na Acme Logística! Obrigada a todos.'

Deno.test('Anúncio: busca posts recentes de quem trabalha na Conta, pelos termos de movimentação, sem reações', () => {
  assertEquals(anuncioDeMovimentacao.entrada(CONTA, CRITERIOS, AGORA), {
    input: {
      searchQueries: [
        '"novo cargo" OR "fui promovido" OR "fui promovida" OR "novo desafio"',
        '"tenho o prazer de anunciar" OR "damos as boas-vindas" OR "assume como"',
      ],
      authorsCompanies: ['https://www.linkedin.com/company/acme-logistica/'],
      sortBy: 'date',
      postedLimit: 'month',
      maxPosts: 20,
      profileScraperMode: 'short',
      scrapeReactions: false,
      scrapeComments: false,
    },
    maxItems: 40,
  })
  assertEquals(anuncioDeMovimentacao.entrada(CONTA, { periodo: 'Últimos 7 dias' }, AGORA).input.postedLimit, 'week')
  assertEquals(anuncioDeMovimentacao.entrada(CONTA, { periodo: 'Últimos 90 dias' }, AGORA).input.postedLimit, '3months')
  assertThrows(() => anuncioDeMovimentacao.entrada({ ...CONTA, linkedinUrl: null }, CRITERIOS, AGORA), SemDadoParaVarrer)
})

Deno.test('Anúncio: o cargo anunciado sai do texto, cortado antes da Conta', () => {
  assertEquals(cargosNoTexto(CHEGADA, CONTA.name), ['Diretora de Dados'])
  assertEquals(cargosNoTexto('Damos as boas-vindas a Fulana, nossa nova Head de Engenharia de Dados!', CONTA.name), ['Head de Engenharia de Dados'])
  assertEquals(cargosNoTexto('Beltrano assume como CFO da Acme Logística.', CONTA.name), ['CFO'])
  assertEquals(cargosNoTexto('Fui promovida a Gerente de Compras e Suprimentos.', CONTA.name), ['Gerente de Compras e Suprimentos'])
})

Deno.test('Anúncio: post de chegada na Conta vira Sinal com trecho curto e link do post', () => {
  const [s, ...resto] = anuncioDeMovimentacao.sinais([post(CHEGADA)], CONTA, CRITERIOS, AGORA)
  assertEquals(resto, [])
  assertEquals(s.eventKey, 'post|7380000000000000001')
  assertEquals(s.phrase, 'Anúncio de chegada: Diretora de Dados (Maria Exemplo)')
  assertEquals(s.firedAt, '2026-09-25T10:00:00.000Z')
  assertEquals(s.source, 'LinkedIn Posts')
  assert(s.evidence!.includes('https://www.linkedin.com/posts/maria-exemplo_novocargo-activity-7380000000000000001-AbCd'))
  assert(!s.evidence!.includes('utm_source') && !s.evidence!.includes('avatar'))
})

Deno.test('Anúncio: promoção, saída e boas-vindas da página da Conta', () => {
  const promocao = post('Fui promovida a Gerente de Compras! Seguimos juntos, Acme Logística.')
  const saida = post('Depois de 6 anos como Diretora de Dados, deixo a Acme Logística para um novo desafio.', { id: '7380000000000000002' })
  const daPagina = post('Damos as boas-vindas a Fulana Exemplo, nossa nova Diretora de Tecnologia!', {
    id: '7380000000000000003',
    author: { type: 'company', name: 'Acme Logística', universalName: 'acme-logistica', linkedinUrl: 'https://www.linkedin.com/company/acme-logistica/' },
  })
  assertEquals(anuncioDeMovimentacao.sinais([promocao, saida, daPagina], CONTA, CRITERIOS, AGORA).map((s) => s.phrase), [
    'Anúncio de promoção: Gerente de Compras (Maria Exemplo)',
    'Anúncio de saída: Diretora de Dados (Maria Exemplo)',
    'Anúncio de chegada: Diretora de Tecnologia',
  ])
  assertEquals(anuncioDeMovimentacao.sinais([promocao, saida, daPagina], CONTA, { ...CRITERIOS, movimento: ['Promoção'] }, AGORA).length, 1)
  assertEquals(anuncioDeMovimentacao.sinais([promocao, saida, daPagina], CONTA, { ...CRITERIOS, cargos: ['CTO'] }, AGORA).length, 1)
})

Deno.test('Anúncio: post antigo, de outra empresa, sem liderança, de vaga ou de quem não é Contato não vira Sinal', () => {
  const antigo = post(CHEGADA, { postedAt: { timestamp: Date.parse('2026-07-01T10:00:00Z') } })
  const outra = post('Começando em um novo cargo como Diretora de Dados na Beta Tecnologia!', { author: { type: 'profile', name: 'Maria Exemplo', info: 'Beta Tecnologia' } })
  const analista = post('Novo desafio: começo hoje como Analista de Dados na Acme Logística.')
  const vaga = post('Novo desafio! Estamos contratando: vaga como Gerente de Dados na Acme Logística.')
  const reacao = { ...post(CHEGADA), type: 'reaction' }
  assertEquals(anuncioDeMovimentacao.sinais([antigo, outra, analista, vaga, reacao, 'erro'], CONTA, CRITERIOS, AGORA), [])
  const deOutraPessoa = post(CHEGADA, { author: { ...post('').author, linkedinUrl: 'https://www.linkedin.com/in/pessoa-nova', publicIdentifier: 'pessoa-nova' } })
  assertEquals(anuncioDeMovimentacao.sinais([deOutraPessoa], CONTA, { ...CRITERIOS, pessoas: 'Contatos das Contas-alvo' }, AGORA), [])
  assertEquals(anuncioDeMovimentacao.sinais([post(CHEGADA)], CONTA, { ...CRITERIOS, pessoas: 'Contatos das Contas-alvo' }, AGORA).length, 1)
})

Deno.test('Anúncio: o trecho do post tem no máximo 300 caracteres e tudo cabe nos limites do banco', () => {
  const [s] = anuncioDeMovimentacao.sinais([post(`${CHEGADA} ${'texto longo '.repeat(500)}`, { id: '9'.repeat(400) })], CONTA, CRITERIOS, AGORA)
  const trecho = s.evidence!.match(/^"(.*)" https:/)![1]
  assert(trecho.length <= 300)
  assert(s.phrase.length <= 300 && s.eventKey.length <= 300 && s.evidence!.length <= 2000)
})

Deno.test('Anúncio: a contagem por etapa diz onde cada post parou, só em números', () => {
  const antigo = post(CHEGADA, { postedAt: { timestamp: Date.parse('2026-07-01T10:00:00Z') } })
  const outra = post('Começando em um novo cargo como Diretora de Dados na Beta Tecnologia!', { author: { type: 'profile', name: 'Maria Exemplo', info: 'Beta Tecnologia' } })
  const semTermo = post('Dia de evento da Acme Logística com o time inteiro.')
  const analista = post('Novo desafio: começo hoje como Analista de Dados na Acme Logística.')
  const vaga = post('Novo desafio! Estamos contratando: vaga como Gerente de Dados na Acme Logística.')
  const reacao = { ...post(CHEGADA), type: 'reaction' }
  const semData = post(CHEGADA, { postedAt: null })
  const itens = [post(CHEGADA), antigo, outra, semTermo, analista, vaga, reacao, semData, 'erro']
  const contagem = descartesDeMovimentacao(itens, CONTA, CRITERIOS, AGORA)
  assertEquals(contagem, {
    'não é post': 1,
    'sem texto, id ou data': 1,
    'fora do período': 1,
    'não fala da Conta': 1,
    'pessoa não atende': 0,
    'sem termo de movimentação (ou é vaga)': 2,
    'movimento não aceito': 0,
    'sem cargo de liderança depois do conector': 1,
    'virou Sinal': 1,
  })
  assertEquals(contagem['virou Sinal'], anuncioDeMovimentacao.sinais(itens, CONTA, CRITERIOS, AGORA).length)
  assertEquals(Object.values(contagem).reduce((a, b) => a + b, 0), itens.length - 1)
  assertEquals(JSON.stringify(contagem).includes('Maria'), false)
})

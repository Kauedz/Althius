// A1 (vaga de analista de comex) de ponta a ponta: o motor, os cinco passos reais e o cliente do Apify contra um Apify
// falso (nunca a rede). A vaga vira Sinal da Conta do Workspace, com o rastro de cada passo.
import { assert, assertEquals } from 'jsr:@std/assert@1'
import { apifyFalso, type ComportamentoDoRun } from './falso-apify.ts'
import { dbFalso } from './db-falso.ts'
import { clienteAssincronoDoApify } from './fonte-apify.ts'
import { cascataVagaComex } from './fixtures.ts'
import { rodarCascata } from './motor.ts'
import { registroDePassos } from './passos/index.ts'
import type { ContaDoWorkspace } from './tipos.ts'
import { MARCA_INTERNA } from '../marca.ts'

const AGORA = Date.parse('2026-10-13T12:00:00Z')
const TOKEN_1 = 'apify_api_PRIMEIRO_SEGREDO_0123456789'
const TOKEN_2 = 'apify_api_SEGUNDO_SEGREDO_0123456789'
const dias = (n: number) => new Date(AGORA - n * 86_400_000).toISOString()

const ALFA: ContaDoWorkspace = {
  id: 'conta-alfa', name: 'Alfa Importadora S.A.', domain: 'alfa.test', linkedinUrl: 'https://www.linkedin.com/company/alfa-importadora', cnpj: '11.222.333/0001-81',
}
const BETA: ContaDoWorkspace = { id: 'conta-beta', name: 'Beta Trading', domain: 'beta.test', linkedinUrl: null, cnpj: null }

const vaga = (extra: Record<string, unknown>) => ({
  id: '3700000001', title: 'Analista de Comércio Exterior', companyName: 'Alfa Importadora', location: 'São Paulo, SP',
  companyLinkedinUrl: 'https://www.linkedin.com/company/alfa-importadora?trk=public_jobs', postedAt: dias(2).slice(0, 10),
  descriptionText: 'Rotina de importação e desembaraço.', seniorityLevel: 'Associate', ...extra,
})

const VAGAS = [
  vaga({}),
  vaga({ id: '3700000002', title: 'Analista de Importação Jr', postedAt: dias(3).slice(0, 10) }),
  vaga({ id: '3700000003', title: 'Analista de Marketing' }),
  vaga({ id: '3700000004', title: 'Despachante Aduaneiro', companyName: 'Beta Trading', companyLinkedinUrl: 'https://www.linkedin.com/company/beta-trading?trk=x', postedAt: dias(1).slice(0, 10) }),
  vaga({ id: '3700000005', title: 'Analista Comex', companyName: 'Gama Logística', companyLinkedinUrl: 'https://www.linkedin.com/company/gama-logistica', postedAt: dias(1).slice(0, 10) }),
  vaga({ id: '3700000006', title: 'Analista de Comex Sênior', postedAt: dias(20).slice(0, 10) }),
]

function cenario(porActor: Record<string, ComportamentoDoRun>, opcoes: { contas?: ContaDoWorkspace[]; brasilapi?: Response } = {}) {
  const fake = apifyFalso((_token, actorId) => porActor[actorId] ?? { itens: [], usageTotalUsd: 0 })
  const logs: unknown[] = []
  const fonte = clienteAssincronoDoApify({ tokens: [TOKEN_1, TOKEN_2], fetchFn: fake.fetchFn, dormir: () => Promise.resolve(), esperaDoCustoMs: 0, log: (c) => logs.push(c) })
  const brasilapi: string[] = []
  const fetchPublico = ((entrada: string | URL | Request) => {
    brasilapi.push(String(entrada))
    return Promise.resolve(opcoes.brasilapi ?? new Response('{}', { status: 404 }))
  }) as typeof fetch
  const banco = dbFalso(cascataVagaComex(), { contas: opcoes.contas ?? [ALFA, BETA] })
  const rodar = (extra: Record<string, unknown> = {}) =>
    rodarCascata({ db: banco.db, fonte, registro: registroDePassos(fetchPublico), agora: () => AGORA, log: (c) => logs.push(c) }, {
      workspaceId: 'ws-1', userId: 'user-1', signalType: 'vaga_comex', origem: 'conversa', chave: 'k1', ...extra,
    })
  return { fake, banco, rodar, logs, brasilapi }
}

const COMPANY = [{ name: 'Beta Trading', universalName: 'beta-trading', linkedinUrl: 'https://www.linkedin.com/company/beta-trading', website: 'https://beta.test/?utm=1', employeeCount: 80 },
  { name: 'Gama Logística', universalName: 'gama-logistica', linkedinUrl: 'https://www.linkedin.com/company/gama-logistica', website: 'https://gama.test', employeeCount: 300 }]
const CNPJ = [{ cnpj: '11222333000181', razaoSocial: 'ALFA IMPORTADORA S/A', porte: 'DEMAIS', cnaePrincipal: '4690099', cnaeDescricao: 'Comércio atacadista de mercadorias em geral', endereco: { uf: 'SP' }, situacaoCadastral: 'ATIVA', socios: [{ nome: 'Fulano de Tal' }] }]

Deno.test('A1: a vaga de comex de uma Conta vira Sinal, passando por vagas, confirmação, empresa, casamento e Receita', async () => {
  const c = cenario({
    'curious_coder~linkedin-jobs-scraper': { itens: VAGAS, usageTotalUsd: 0.0122, build: '1.7.18' },
    'harvestapi~linkedin-company': { itens: COMPANY, usageTotalUsd: 0.008 },
    'johnatan029~cnpj-empresas-brasil-scraper': { itens: CNPJ, usageTotalUsd: 0.0016 },
  })
  const r = await c.rodar()

  assertEquals(r.desfecho, 'concluida')
  assertEquals(r.novos, 3)
  assertEquals(r.sinais.map((s) => [s.contaId, s.phrase]).sort(), [
    ['conta-alfa', 'Abriu vaga de Analista de Comércio Exterior em São Paulo, SP'],
    ['conta-alfa', 'Abriu vaga de Analista de Importação Jr em São Paulo, SP'],
    ['conta-beta', 'Abriu vaga de Despachante Aduaneiro em São Paulo, SP'],
  ].sort())
  assertEquals(r.semConta, 1, 'a Gama não é Conta do Workspace')

  // Passo 1: as buscas do LinkedIn pelo esquema publicado, com a janela de 7 dias.
  const posts = c.fake.requisicoes.filter((q) => q.metodo === 'POST')
  assertEquals(posts.map((q) => q.caminho.split('/')[3]), ['curious_coder~linkedin-jobs-scraper', 'harvestapi~linkedin-company', 'johnatan029~cnpj-empresas-brasil-scraper'])
  const entrada1 = posts[0].corpo as { urls: string[]; scrapeCompany: boolean }
  assertEquals(entrada1.scrapeCompany, false)
  assert(entrada1.urls.length === 4 && entrada1.urls.every((u) => u.includes('f_TPR=r604800') && u.includes('location=Brazil')), JSON.stringify(entrada1.urls))
  // Passo 3: só as empresas que ainda não são Conta pela página do LinkedIn (a Alfa já casa).
  assertEquals((posts[1].corpo as { companies: string[] }).companies, [
    'https://www.linkedin.com/company/beta-trading',
    'https://www.linkedin.com/company/gama-logistica',
  ])
  // Passo 5: só o CNPJ da Conta que o tem.
  assertEquals(posts[2].corpo, { mode: 'lookup', cnpjs: ['11222333000181'] })

  // A Receita entra na evidência, sem nome de sócio.
  const alfa = r.sinais.filter((s) => s.contaId === 'conta-alfa')
  assert(alfa.every((s) => s.evidence.includes('Receita Federal: porte DEMAIS; CNAE 4690099')), alfa[0].evidence)
  assert(!JSON.stringify(r.sinais).includes('Fulano'), 'nome de sócio nunca chega ao Sinal')
  assert(!r.sinais.some((s) => s.contaId === 'conta-beta' && s.evidence.includes('Receita')))

  // O rastro: run id do POST, conta usada e custo real por passo.
  assertEquals(c.banco.passos.map((p) => [p.ordem, p.handler, p.fim?.estado, p.fim?.apifyRunId ?? null, p.fim?.custoUsd]), [
    [1, 'linkedin_vagas', 'succeeded', 'run-1', 0.0122],
    [2, 'confirmar_vaga_comex', 'succeeded', null, 0],
    [3, 'linkedin_empresa', 'succeeded', 'run-2', 0.008],
    [4, 'casar_com_contas', 'succeeded', null, 0],
    [5, 'cnpj_da_conta', 'succeeded', 'run-3', 0.0016],
  ])
  assertEquals(r.custoUsd, 0.0218)
  assert(!MARCA_INTERNA.test(r.mensagem))
  assert(!JSON.stringify(r).includes(TOKEN_1))
})

Deno.test('A1: vaga com mais de 7 dias e título sem termo de comex não viram Sinal', async () => {
  const c = cenario({
    'curious_coder~linkedin-jobs-scraper': { itens: [vaga({ id: '1', title: 'Analista de Marketing' }), vaga({ id: '2', title: 'Analista de Comex', postedAt: dias(9).slice(0, 10) })], usageTotalUsd: 0.004 },
  })
  const r = await c.rodar()
  assertEquals([r.desfecho, r.novos], ['concluida', 0])
  assertEquals(c.fake.requisicoes.filter((q) => q.metodo === 'POST').length, 1, 'nada confirmado: o resto não roda')
  assertEquals(c.banco.fechamentos[0].custoUsd, 0.004)
})

Deno.test('A1: a mesma vaga, rodada de novo com outra chave, não cria o Sinal duas vezes', async () => {
  const c = cenario({
    'curious_coder~linkedin-jobs-scraper': { itens: [VAGAS[0]], usageTotalUsd: 0.002 },
    'johnatan029~cnpj-empresas-brasil-scraper': { itens: CNPJ, usageTotalUsd: 0.0016 },
  })
  const a = await c.rodar({ chave: 'a' })
  const b = await c.rodar({ chave: 'b' })
  assertEquals([a.novos, a.repetidos, b.novos, b.repetidos], [1, 0, 0, 1])
})

Deno.test('A1: o actor de vagas sem crédito na primeira conta roda pela segunda', async () => {
  const fake = apifyFalso((token, actorId) =>
    actorId.startsWith('curious_coder~') && token === TOKEN_1
      ? { inicio: { status: 402, corpo: { error: { type: 'x402-payment-required', message: 'Insufficient credit' } } } }
      : actorId.startsWith('curious_coder~')
      ? { itens: [VAGAS[0]], usageTotalUsd: 0.002 }
      : { itens: CNPJ, usageTotalUsd: 0.0016 }
  )
  const fonte = clienteAssincronoDoApify({ tokens: [TOKEN_1, TOKEN_2], fetchFn: fake.fetchFn, dormir: () => Promise.resolve(), esperaDoCustoMs: 0, log: () => {} })
  const banco = dbFalso(cascataVagaComex(), { contas: [ALFA] })
  const r = await rodarCascata({ db: banco.db, fonte, registro: registroDePassos(), agora: () => AGORA, log: () => {} }, {
    workspaceId: 'ws-1', userId: null, signalType: 'vaga_comex', origem: 'monitor', monitorId: 'mon-1', chave: 'monitor:mon-1:slot',
  })
  assertEquals(r.novos, 1)
  assertEquals(banco.passos[0].fim?.tokenIndex, 1, 'o rastro guarda o índice da conta usada, nunca o token')
  assertEquals(banco.sinais[0].monitorId, 'mon-1')
})

Deno.test('A1: todas as contas sem crédito — falha amigável, nada gravado', async () => {
  const c = cenario({ 'curious_coder~linkedin-jobs-scraper': { inicio: { status: 402, corpo: { error: { type: 'x402-payment-required', message: 'Insufficient credit' } } } } })
  const r = await c.rodar()
  assertEquals([r.desfecho, r.mensagem], ['falhou', 'Sem saldo na fonte de dados; avisamos a equipe.'])
  assertEquals(c.banco.sinais.length, 0)
  assertEquals(c.banco.fechamentos[0].estado, 'failed')
  assertEquals(c.banco.passos.at(-1)?.fim?.statusHttp, 402)
  // Nenhuma outra fonte foi tentada: as alternativas do passo 1 usam as mesmas contas.
  assertEquals(c.fake.requisicoes.filter((q) => q.metodo === 'POST').length, 2, 'uma tentativa por conta, só no actor principal')
})

Deno.test('A1: o actor de vagas falha por outro motivo e o alternativo (valig) assume com a entrada dele', async () => {
  const c = cenario({
    'curious_coder~linkedin-jobs-scraper': { estados: ['FAILED'], mensagem: 'LinkedIn blocked', usageTotalUsd: 0 },
    'valig~linkedin-jobs-scraper': {
      itens: [{ id: '9', title: 'Analista de Comércio Exterior', companyName: 'Alfa Importadora', companyUrl: 'https://www.linkedin.com/company/alfa-importadora', location: 'Campinas, SP', url: 'https://www.linkedin.com/jobs/view/9?x=1', postedDate: dias(1).slice(0, 10), description: 'desembaraço', experienceLevel: 'Mid-Senior level' }],
      usageTotalUsd: 0.0005,
    },
    'johnatan029~cnpj-empresas-brasil-scraper': { itens: CNPJ, usageTotalUsd: 0.0016 },
  }, { contas: [ALFA] })
  const r = await c.rodar()
  assertEquals([r.desfecho, r.novos], ['concluida', 1])
  const valig = c.fake.requisicoes.find((q) => q.caminho.includes('valig~'))!
  const entrada = valig.corpo as { keywords: string; datePosted: string; location: string; limit: number; titleInclude: string[] }
  assertEquals([entrada.keywords, entrada.datePosted, entrada.location, entrada.limit], ['analista de comércio exterior', 'r604800', 'Brazil', 100])
  assertEquals(c.banco.passos.filter((p) => p.ordem === 1).map((p) => [p.tentativa, p.fim?.estado]), [[1, 'failed'], [2, 'succeeded']])
  assertEquals(c.banco.passos.find((p) => p.ordem === 1 && p.tentativa === 1)?.fim?.erroReal, 'FAILED: LinkedIn blocked')
})

Deno.test('A1: o CNPJ cai para a BrasilAPI quando o actor da Receita falha', async () => {
  const c = cenario({
    'curious_coder~linkedin-jobs-scraper': { itens: [VAGAS[0]], usageTotalUsd: 0.002 },
    'johnatan029~cnpj-empresas-brasil-scraper': { estados: ['FAILED'], mensagem: 'boom', usageTotalUsd: 0 },
  }, {
    contas: [ALFA],
    brasilapi: new Response(JSON.stringify({ razao_social: 'ALFA IMPORTADORA S/A', porte: 'DEMAIS', cnae_fiscal: 4690099, cnae_fiscal_descricao: 'Comércio atacadista', uf: 'SP', descricao_situacao_cadastral: 'ATIVA', qsa: [{ nome_socio: 'Beltrano' }] }), { status: 200 }),
  })
  const r = await c.rodar()
  assertEquals(r.novos, 1)
  assertEquals(c.brasilapi, ['https://brasilapi.com.br/api/cnpj/v1/11222333000181'])
  assert(r.sinais[0].evidence.includes('Receita Federal: porte DEMAIS; CNAE 4690099'), r.sinais[0].evidence)
  assert(!JSON.stringify(r).includes('Beltrano'), 'o quadro societário nunca é lido')
  assertEquals(c.banco.passos.filter((p) => p.ordem === 5).map((p) => [p.tentativa, p.fim?.estado]), [[1, 'failed'], [2, 'succeeded']])
})

Deno.test('A1: sem Conta com CNPJ, o passo da Receita é pulado e não custa nada', async () => {
  const c = cenario({
    'curious_coder~linkedin-jobs-scraper': { itens: [VAGAS[3]], usageTotalUsd: 0.002 },
    'harvestapi~linkedin-company': { itens: [COMPANY[0]], usageTotalUsd: 0.004 },
  }, { contas: [BETA] })
  const r = await c.rodar()
  assertEquals([r.novos, r.desfecho], [1, 'concluida'])
  assertEquals(c.banco.passos.find((p) => p.ordem === 5)?.fim?.estado, 'skipped')
  assertEquals(c.fake.requisicoes.filter((q) => q.metodo === 'POST').length, 2)
})

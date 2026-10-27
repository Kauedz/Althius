// A descoberta no mercado endereçável de ponta a ponta, pelo motor e pelos passos do servidor, com o Apify e o banco falsos:
// a busca pelos cargos e pelo nicho no estado, a confirmação pelos cargos do Monitoramento (não por termos fixos de nicho),
// o filtro do nicho, a vaga repetida uma vez, o enriquecimento só de quem não é Conta e não tem site, a empresa que é
// Conta recebe o Sinal, as outras vão ao banco como candidatas (a sem site, marcada) e o teto de créditos da rodada.
import { assert, assertEquals } from 'jsr:@std/assert@1'
import { dbFalso } from './db-falso.ts'
import { cascataVagaMercado } from './fixtures.ts'
import { rodarCascata } from './motor.ts'
import { registroDePassos } from './passos/index.ts'
import { estadoDoMonitoramento, termosDoMercado, vagaDoEstado } from './passos/vagas-mercado.ts'
import type { ClienteDaFonte, ContaDoWorkspace, Llm, PedidoDeCascata } from './tipos.ts'

const AGORA = Date.parse('2026-10-21T12:00:00Z')
const ALFA: ContaDoWorkspace = { id: 'conta-alfa', name: 'Alfa Petróleo', domain: 'alfapetroleo.test', linkedinUrl: 'https://www.linkedin.com/company/alfa-petroleo' }
const CRITERIOS = {
  nicho: 'custom', nichoCustom: 'Óleo e gás', funcoes: ['SDR', 'BDR'], localizacao: ['Brasil'], estado: 'Rio de Janeiro',
  periodo: 'Últimos 30 dias',
}

const vaga = (titulo: string, empresa: string, extra: Record<string, unknown> = {}) => ({
  id: String(Math.abs([...`${titulo}${empresa}`].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7))),
  title: titulo,
  companyName: empresa,
  location: 'Rio de Janeiro, RJ',
  descriptionText: 'Empresa de óleo e gás procura quem prospecte clientes offshore.',
  postedAt: '2026-10-15',
  ...extra,
})

const VAGAS = [
  vaga('SDR', 'Petro Sul', { companyLinkedinUrl: 'https://www.linkedin.com/company/petro-sul' }),
  // A mesma vaga vinda da segunda busca: conta uma vez.
  vaga('SDR', 'Petro Sul', { companyLinkedinUrl: 'https://www.linkedin.com/company/petro-sul' }),
  vaga('BDR Pleno', 'Oceano Offshore', { companyLinkedinUrl: 'https://www.linkedin.com/company/oceano-offshore' }),
  vaga('SDR', 'Alfa Petróleo', { companyLinkedinUrl: 'https://www.linkedin.com/company/alfa-petroleo', companyWebsite: 'https://alfapetroleo.test' }),
  vaga('Sales Development Representative (SDR)', 'Sem Página Ltda'),
  // Fora: cargo que não é do Monitoramento, outro estado, fora do nicho, fora do período.
  vaga('Analista financeiro', 'Gama Energia', { companyLinkedinUrl: 'https://www.linkedin.com/company/gama' }),
  vaga('BDR', 'Delta Gás', { location: 'São Paulo, SP', companyLinkedinUrl: 'https://www.linkedin.com/company/delta' }),
  vaga('SDR', 'Naval Software', { descriptionText: 'Software de gestão para escritórios.', companyLinkedinUrl: 'https://www.linkedin.com/company/naval' }),
  vaga('SDR', 'Antiga Óleo', { postedAt: '2026-07-01', companyLinkedinUrl: 'https://www.linkedin.com/company/antiga' }),
]

const EMPRESAS = [
  { linkedinUrl: 'https://www.linkedin.com/company/petro-sul', universalName: 'petro-sul', name: 'Petro Sul', website: 'https://petrosul.test', employeeCount: 120 },
]

function fonteFalsa(vagas: unknown[] = VAGAS, empresas: unknown[] = EMPRESAS) {
  const chamadas: { actorId: string; input: Record<string, unknown>; maxTotalChargeUsd: number }[] = []
  const fonte: ClienteDaFonte = {
    rodar: (args) => {
      chamadas.push({ actorId: args.actorId, input: args.input as Record<string, unknown>, maxTotalChargeUsd: args.maxTotalChargeUsd })
      const items = args.actorId.startsWith('harvestapi~') ? empresas : vagas
      return Promise.resolve({ apifyRunId: `run-${chamadas.length}`, build: '1', tokenIndex: 0, custoUsd: args.actorId.startsWith('harvestapi~') ? 0.012 : 0.2, items })
    },
  }
  return { fonte, chamadas }
}

const pedido = (extra: Partial<PedidoDeCascata> = {}): PedidoDeCascata => ({
  workspaceId: 'ws-1', userId: 'user-1', signalType: 'vaga_mercado', registrarComo: 'vaga_linkedin', origem: 'monitor', monitorId: 'mon-mercado',
  chave: 'monitor:mon-mercado:slot:mercado', criterios: CRITERIOS, tetoCreditos: 4, descoberta: true, ...extra,
})

Deno.test('a busca usa os cargos e o nicho como palavras-chave, no estado e no país do Monitoramento', async () => {
  const banco = dbFalso(cascataVagaMercado(), { contas: [ALFA], abertura: { estCredits: 4 } })
  const { fonte, chamadas } = fonteFalsa()
  await rodarCascata({ db: banco.db, fonte, registro: registroDePassos(), agora: () => AGORA, log: () => {} }, pedido())
  const urls = (chamadas[0].input.urls as string[]).map((u) => new URL(u).searchParams)
  assertEquals(urls.map((u) => u.get('keywords')), ['Óleo e gás SDR', 'Óleo e gás BDR'])
  assertEquals(urls.map((u) => u.get('location')), ['Rio de Janeiro, Brazil', 'Rio de Janeiro, Brazil'])
  assertEquals(urls[0].get('f_TPR'), `r${30 * 86_400}`)
  // O teto de créditos da rodada vai ao banco, que reserva o preço fixo; nenhuma Conta entra na conta.
  assertEquals([banco.aberturas[0].tetoCreditos, banco.aberturas[0].contas], [4, 0])
})

Deno.test('a busca distribui os cargos entre dois recortes sem exceder MAX_BUSCAS', () => {
  const termos = termosDoMercado({
    nichos: ['logistica-e-transporte'], nichosCustom: ['Seguros'], funcoes: ['SDR', 'BDR'],
  })
  assertEquals(termos, [
    'Logística e transporte SDR', 'Seguros SDR', 'Logística e transporte BDR', 'Seguros BDR',
  ])
  assertEquals(termosDoMercado({ nichos: ['logistica-e-transporte'], nichosCustom: ['Seguros'], funcoes: ['SDR'] }, 1), [
    'Logística e transporte SDR',
  ])
})

Deno.test('a descoberta confirma pelos cargos e pelo nicho, enriquece só quem não é Conta e entrega Conta e candidatas', async () => {
  const banco = dbFalso(cascataVagaMercado(), { contas: [ALFA], abertura: { estCredits: 4 } })
  const { fonte, chamadas } = fonteFalsa()
  const r = await rodarCascata({ db: banco.db, fonte, registro: registroDePassos(), agora: () => AGORA, log: () => {} }, pedido())
  assertEquals(r.desfecho, 'concluida')

  // O enriquecimento: as empresas novas sem site (pela página, ou pelo nome sem página); a Conta Alfa não gasta.
  const enriquecimento = chamadas.find((c) => c.actorId === 'harvestapi~linkedin-company')!
  assertEquals(enriquecimento.input.companies, ['https://www.linkedin.com/company/petro-sul', 'https://www.linkedin.com/company/oceano-offshore'])
  assertEquals(enriquecimento.input.searches, ['Sem Página Ltda'])

  // A empresa que é Conta recebe o Sinal da Conta, no tipo do Monitoramento.
  assertEquals(banco.sinais.map((s) => [s.contaId, s.sinal.phrase]), [['conta-alfa', 'Abriu vaga de SDR em Rio de Janeiro, RJ']])

  // As outras vão ao banco como Sinal de empresa (candidata): a vaga repetida uma vez; a sem site, marcada.
  const empresas = banco.empresas.map((e) => [e.sinal.empresa.nome, e.sinal.empresa.site ?? '', e.sinal.empresa.semSite === true, e.signalType])
  assertEquals(empresas, [
    ['Petro Sul', 'https://petrosul.test', false, 'vaga_linkedin'],
    ['Oceano Offshore', '', true, 'vaga_linkedin'],
  ])
  assertEquals(banco.empresas.map((e) => e.sinal.eventKey), ['vaga|petro sul|sdr|2026', 'vaga|oceano offshore|bdr pleno|2026'])
  // Sem site e sem a página do LinkedIn, o banco não deduplicaria: fica só na contagem das empresas sem Conta.
  assertEquals(r.semConta, 3)
  assertEquals(r.candidatas, 2)
  assertEquals(banco.fechamentos[0].estado, 'succeeded')
  assertEquals(r.creditosCobrados, 4)
})

Deno.test('com o modelo dos Sinais ligado, ele decide o nicho das vagas', async () => {
  const banco = dbFalso(cascataVagaMercado(), { contas: [ALFA], abertura: { estCredits: 4 } })
  const { fonte } = fonteFalsa()
  const pedidos: string[] = []
  // O modelo só diz que a primeira vaga é do nicho.
  const llm: Llm = {
    json: (a) => {
      pedidos.push(a.usuario)
      return Promise.resolve({ json: { vagas: a.usuario.split('\n').slice(1).map((_, i) => ({ id: String(i), do_nicho: i === 0 })) }, custoUsd: 0.001 })
    },
  }
  await rodarCascata({ db: banco.db, fonte, registro: registroDePassos(), llm, agora: () => AGORA, log: () => {} }, pedido())
  assertEquals(pedidos.length, 1)
  assert(pedidos[0].startsWith(JSON.stringify({ nichos: ['Óleo e gás'] })))
  assertEquals(banco.empresas.map((e) => e.sinal.empresa.nome), ['Petro Sul'])
  assertEquals(banco.sinais.length, 0)
})

Deno.test('sem nenhuma Conta no Workspace, a descoberta roda mesmo assim; sem o modo descoberta, não', async () => {
  const banco = dbFalso(cascataVagaMercado(), { contas: [], abertura: { estCredits: 4 } })
  const { fonte } = fonteFalsa()
  const r = await rodarCascata({ db: banco.db, fonte, registro: registroDePassos(), agora: () => AGORA, log: () => {} }, pedido())
  assertEquals(r.desfecho, 'concluida')
  assertEquals(banco.empresas.map((e) => e.sinal.empresa.nome), ['Petro Sul', 'Oceano Offshore', 'Alfa Petróleo'])

  const semDescoberta = dbFalso(cascataVagaMercado(), { contas: [] })
  const r2 = await rodarCascata({ db: semDescoberta.db, fonte, registro: registroDePassos(), agora: () => AGORA, log: () => {} },
    pedido({ descoberta: undefined }))
  assertEquals(r2.desfecho, 'sem_contas')
  assertEquals(semDescoberta.aberturas.length, 0)
})

Deno.test('o teto da rodada: o passo que passaria do teto não começa e nada é cobrado nem gravado', async () => {
  // O banco devolve o teto em dólar que cabe nos 4 créditos; aqui, só o bastante para a busca.
  const banco = dbFalso(cascataVagaMercado(), { contas: [ALFA], abertura: { estCredits: 4, capUsd: 0.205 } })
  const { fonte, chamadas } = fonteFalsa()
  const r = await rodarCascata({ db: banco.db, fonte, registro: registroDePassos(), agora: () => AGORA, log: () => {} }, pedido())
  assertEquals(r.desfecho, 'abortada')
  assertEquals(chamadas.map((c) => c.actorId), ['curious_coder~linkedin-jobs-scraper'])
  assert(chamadas[0].maxTotalChargeUsd <= 0.205)
  assertEquals(banco.passos.find((p) => p.handler === 'linkedin_empresa_mercado')?.fim?.estado, 'aborted_cap')
  assertEquals([banco.sinais.length, banco.empresas.length], [0, 0])
  assertEquals(r.creditosCobrados, 0)
})

Deno.test('sem cargo, a busca não roda e nada é gasto na fonte', async () => {
  const banco = dbFalso(cascataVagaMercado(), { contas: [ALFA], abertura: { estCredits: 4 } })
  const { fonte, chamadas } = fonteFalsa()
  await rodarCascata({ db: banco.db, fonte, registro: registroDePassos(), agora: () => AGORA, log: () => {} },
    pedido({ criterios: { ...CRITERIOS, funcoes: [] } }))
  assertEquals(chamadas.length, 0)
  assertEquals(banco.passos[0].fim?.estado, 'skipped')
})

Deno.test('o nicho pronto entra pelo nome, os muitos cargos se juntam com OR e o estado só vale com o Brasil', () => {
  assertEquals(termosDoMercado({ nicho: 'agro-b2b', funcoes: ['SDR'] }), ['Agro B2B SDR'])
  assertEquals(termosDoMercado({ nicho: 'qualquer', funcoes: ['SDR'] }), ['SDR'])
  assertEquals(termosDoMercado({ funcoes: ['A', 'B', 'C', 'D', 'E'] }, 2), ['(A OR C OR E)', '(B OR D)'])
  assertEquals(termosDoMercado({ funcoes: [] }), [])
  assertEquals(estadoDoMonitoramento({ localizacao: ['Brasil'], estado: 'São Paulo' }), 'São Paulo')
  assertEquals(estadoDoMonitoramento({ localizacao: ['México'], estado: 'São Paulo' }), '')
  assertEquals(estadoDoMonitoramento({ localizacao: ['Brasil'], estado: 'Guanabara' }), '')
  assert(vagaDoEstado('Niterói, RJ', 'Rio de Janeiro'))
  assert(vagaDoEstado('Macaé, Rio de Janeiro, Brazil', 'Rio de Janeiro'))
  assert(vagaDoEstado('', 'Rio de Janeiro'), 'sem local, a busca já filtrou')
  assert(!vagaDoEstado('São Paulo, SP', 'Rio de Janeiro'))
})

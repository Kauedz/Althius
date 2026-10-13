// ICP D (energia e mercado livre): CNAE eletrointensivo, Grupo A ainda cativo, nova planta ou filial, meta ESG publicada e
// o vencimento de contrato de energia (sem fonte). Ponta a ponta: o motor, os passos reais e o cliente da fonte contra um
// Apify falso e um `fetch` falso (nunca a rede). Os formatos de entrada dos actors são os esquemas publicados em 13/10/2026;
// o formato de saída é o da documentação de cada um (nenhuma execução real foi feita).
import { assert, assertEquals } from 'jsr:@std/assert@1'
import { apifyFalso, type ComportamentoDoRun } from '../falso-apify.ts'
import { dbFalso } from '../db-falso.ts'
import { clienteAssincronoDoApify } from '../fonte-apify.ts'
import { rodarCascata } from '../motor.ts'
import { registroDePassos } from './index.ts'
import type { CascataDef, ContaDoWorkspace } from '../tipos.ts'
import { MARCA_INTERNA } from '../../marca.ts'
import { CNAES_ELETROINTENSIVOS, cnaeDoRodizio, cnaeEletrointensivo, cnaeLimpo } from './icp-d-cnae.ts'
import {
  cascataCnaeEletrointensivo,
  cascataGrupoACativo,
  cascataMetaEsg,
  cascataNovaPlantaFilial,
  cascataVencimentoContratoEnergia,
  URL_CCEE_AGENTES,
} from './icp-d-fixtures.ts'
import { passosDoIcp_d } from './icp-d.ts'

const AGORA = Date.parse('2026-10-13T12:00:00Z')
const TOKEN = 'apify_api_SEGREDO_DO_TESTE_0123456789'

function cenario(
  def: CascataDef,
  porActor: Record<string, ComportamentoDoRun>,
  opcoes: { contas: ContaDoWorkspace[]; fetchPublico?: typeof fetch; fotografias?: Record<string, { takenAt: string; data: Record<string, unknown> }[]> },
) {
  const fake = apifyFalso((_t, actorId) => porActor[actorId] ?? { itens: [], usageTotalUsd: 0 })
  const fonte = clienteAssincronoDoApify({ tokens: [TOKEN], fetchFn: fake.fetchFn, dormir: () => Promise.resolve(), esperaDoCustoMs: 0, log: () => {} })
  const banco = dbFalso(def, { contas: opcoes.contas, fotografias: opcoes.fotografias })
  const rede: string[] = []
  const fetchPublico = opcoes.fetchPublico ?? ((u: string | URL | Request) => {
    rede.push(String(u))
    return Promise.reject(new Error('não devia usar a rede'))
  }) as typeof fetch
  const rodar = (extra: Record<string, unknown> = {}) =>
    rodarCascata({ db: banco.db, fonte, registro: registroDePassos(fetchPublico), agora: () => AGORA, log: () => {} }, {
      workspaceId: 'ws-1', userId: 'u1', signalType: def.signalType, origem: 'conversa', chave: 'k1', ...extra,
    })
  const posts = () => fake.requisicoes.filter((q) => q.metodo === 'POST')
  return { fake, banco, rodar, posts, rede }
}

const semMarca = (valor: unknown) => assert(!MARCA_INTERNA.test(JSON.stringify(valor)), 'a marca do fornecedor vazou')

// ---------------------------------------------------------------------------------------------------------------------
// A tabela interna de CNAEs.

Deno.test('a tabela de CNAEs eletrointensivos: subclasses de 7 dígitos sem repetição, marcada como critério interno', () => {
  assert(CNAES_ELETROINTENSIVOS.length >= 20)
  assert(CNAES_ELETROINTENSIVOS.every((c) => /^\d{7}$/.test(c.codigo) && c.descricao && c.setor))
  assertEquals(new Set(CNAES_ELETROINTENSIVOS.map((c) => c.codigo)).size, CNAES_ELETROINTENSIVOS.length)
  assertEquals(cnaeLimpo('23.20-6-00'), '2320600')
  assertEquals(cnaeLimpo('2320-6/00'), '2320600')
  assertEquals(cnaeLimpo('23206'), '')
  assertEquals(cnaeEletrointensivo('2320-6/00')?.descricao, 'Fabricação de cimento')
  assertEquals(cnaeEletrointensivo('4711302'), undefined)
})

Deno.test('o rodízio semanal escolhe sempre o mesmo CNAE na mesma semana e anda um por semana', () => {
  const seg = Date.parse('2026-10-12T08:00:00Z')
  const a = cnaeDoRodizio(seg)
  assertEquals(cnaeDoRodizio(seg + 5 * 86_400_000).codigo, a.codigo)
  const i = CNAES_ELETROINTENSIVOS.findIndex((c) => c.codigo === a.codigo)
  assertEquals(cnaeDoRodizio(seg + 7 * 86_400_000).codigo, CNAES_ELETROINTENSIVOS[(i + 1) % CNAES_ELETROINTENSIVOS.length].codigo)
})

// ---------------------------------------------------------------------------------------------------------------------
// D1. CNAE eletrointensivo.

const ALFA: ContaDoWorkspace = { id: 'conta-alfa', name: 'Alfa Cimentos S.A.', domain: 'alfa.test', linkedinUrl: null, cnpj: '11.222.333/0001-81' }
const NORTE: ContaDoWorkspace = {
  id: 'conta-norte', name: 'Norte Cimentos', domain: 'norte.test', linkedinUrl: 'https://www.linkedin.com/company/norte-cimentos', cnpj: null,
}

const empresaReceita = (extra: Record<string, unknown>) => ({
  cnpj: '11222333000181', razao_social: 'ALFA CIMENTOS S/A', nome_fantasia: 'ALFA', matriz_filial: 'MATRIZ', situacao_cadastral: 'ATIVA',
  cnae_principal_codigo: '2320600', cnae_principal_descricao: 'Fabricação de cimento', porte: 'DEMAIS', uf: 'SP', municipio: 'SAO PAULO',
  email: 'contato@alfa.test', telefone1: '1130000000', qsa: ['FULANO DE TAL — Diretor — id: ***550179** — entry: 2023-05-17'], qsa_count: 1, ...extra,
})

Deno.test('D1: a empresa de CNAE eletrointensivo que é Conta vira Sinal, com o reforço da página só para quem precisa', async () => {
  const c = cenario(cascataCnaeEletrointensivo(), {
    'epicscrapers~brazil-cnpj-scraper': {
      usageTotalUsd: 0.0451,
      itens: [
        empresaReceita({}),
        empresaReceita({ cnpj: '33444555000199', razao_social: 'CIMENTOS DO NORTE S/A', nome_fantasia: '' }),
        empresaReceita({ cnpj: '55666777000100', razao_social: 'BAIXADA CIMENTOS', situacao_cadastral: 'BAIXADA' }),
        empresaReceita({ cnpj: '77888999000100', razao_social: 'OUTRA ATIVIDADE', cnae_principal_codigo: '4711302' }),
        empresaReceita({ cnpj: '99000111000100', razao_social: 'GAMA CIMENTOS' }),
      ],
    },
    'harvestapi~linkedin-company': {
      usageTotalUsd: 0.008,
      itens: [{ name: 'Cimentos do Norte', universalName: 'norte-cimentos', linkedinUrl: 'https://www.linkedin.com/company/norte-cimentos', website: 'https://norte.test/', employeeCount: 120 }],
    },
  }, { contas: [ALFA, NORTE] })
  const r = await c.rodar({ criterios: { cnae: '23.20-6-00', uf: 'sp' } })

  assertEquals(r.desfecho, 'concluida')
  assertEquals(r.sinais.map((s) => [s.contaId, s.phrase]).sort(), [
    ['conta-alfa', 'Atua em setor eletrointensivo: Fabricação de cimento (CNAE 2320600)'],
    ['conta-norte', 'Atua em setor eletrointensivo: Fabricação de cimento (CNAE 2320600)'],
  ])
  // Passo 1: uma subclasse e uma UF por execução, no esquema publicado do actor.
  const posts = c.posts()
  assertEquals(posts[0].corpo, { cnae: '2320600', uf: 'SP', maxItems: 100, pageSize: 100 })
  // Passo 2: a Alfa já casa pelo CNPJ; só quem não casou e pode casar pela página (Conta sem CNPJ, com LinkedIn) é buscado.
  assertEquals(posts[1].corpo, { searches: ['CIMENTOS DO NORTE S/A', 'GAMA CIMENTOS'] })
  assertEquals(r.sinais[0].source, 'Receita Federal (CNAE)')
  assert(r.sinais[0].evidence.includes('Critério interno'), r.sinais[0].evidence)
  assert(r.sinais.every((s) => s.evidence.includes('CNAE principal 2320600') && s.evidence.includes('porte DEMAIS')))
  // Dado de pessoa e contato nunca chegam ao Sinal.
  const tudo = JSON.stringify(r)
  assert(!tudo.includes('FULANO') && !tudo.includes('550179') && !tudo.includes('contato@alfa.test') && !tudo.includes('1130000000'))
  semMarca(r)
  assertEquals(c.banco.passos.map((p) => [p.ordem, p.handler, p.fim?.estado]), [
    [1, 'cnpj_por_cnae', 'succeeded'], [2, 'linkedin_empresa_por_cnae', 'succeeded'], [3, 'fatos_cnae_eletrointensivo', 'succeeded'], [4, 'casar_fatos_com_contas', 'succeeded'],
  ])
})

Deno.test('D1: sem Conta que precise da página, o passo do LinkedIn não roda nem custa; sem pedido, o rodízio escolhe o CNAE', async () => {
  const c = cenario(cascataCnaeEletrointensivo(), { 'epicscrapers~brazil-cnpj-scraper': { itens: [empresaReceita({ cnae_principal_codigo: cnaeDoRodizio(AGORA).codigo })], usageTotalUsd: 0.001 } }, { contas: [ALFA] })
  const r = await c.rodar()
  assertEquals([r.desfecho, r.novos], ['concluida', 1])
  assertEquals(c.posts().length, 1)
  assertEquals((c.posts()[0].corpo as { cnae: string; uf: string }).cnae, cnaeDoRodizio(AGORA).codigo)
  assertEquals((c.posts()[0].corpo as { uf: string }).uf, '')
  assertEquals(c.banco.passos.find((p) => p.ordem === 2)?.fim?.estado, 'skipped')
})

Deno.test('D1: só a atividade principal vale; o mesmo fato em outra rodada não grava duas vezes', async () => {
  const c = cenario(cascataCnaeEletrointensivo(), {
    'epicscrapers~brazil-cnpj-scraper': { itens: [empresaReceita({ cnae_principal_codigo: '4711302' })], usageTotalUsd: 0.001 },
  }, { contas: [ALFA] })
  const vazio = await c.rodar({ criterios: { cnae: '2320600' } })
  assertEquals([vazio.desfecho, vazio.novos, vazio.sinais.length], ['concluida', 0, 0])

  const d = cenario(cascataCnaeEletrointensivo(), { 'epicscrapers~brazil-cnpj-scraper': { itens: [empresaReceita({})], usageTotalUsd: 0.001 } }, { contas: [ALFA] })
  const a = await d.rodar({ chave: 'a', criterios: { cnae: '2320600' } })
  const b = await d.rodar({ chave: 'b', criterios: { cnae: '2320600' } })
  assertEquals([a.novos, a.repetidos, b.novos, b.repetidos], [1, 0, 0, 1])
  assertEquals(a.sinais[0].eventKey, 'alfa cimentos|cnae_eletrointensivo|2320600')
})

Deno.test('D1: CNAE pedido fora da tabela não roda nem custa', async () => {
  const c = cenario(cascataCnaeEletrointensivo(), {}, { contas: [ALFA] })
  const r = await c.rodar({ criterios: { cnae: '4711302' } })
  assertEquals([r.desfecho, r.novos, c.posts().length], ['concluida', 0, 0])
  assertEquals(c.banco.passos[0].fim?.estado, 'skipped')
})

// ---------------------------------------------------------------------------------------------------------------------
// D2. Grupo A ainda cativo (inferência).

/** A CCEE falsa: os meses disponíveis e a lista de consumidores livres e especiais do mês mais novo. */
function cceeFalsa(cnpjs: string[], opcoes: { total?: number; status?: number } = {}) {
  const urls: URL[] = []
  const fetchFn = ((u: string | URL | Request) => {
    const url = new URL(String(u))
    urls.push(url)
    if (opcoes.status) return Promise.resolve(new Response('<html>Acesso bloqueado</html>', { status: opcoes.status }))
    if (url.searchParams.get('distinct') === 'true') {
      return Promise.resolve(new Response(JSON.stringify({ success: true, result: { records: [{ MES_REFERENCIA: '202609' }, { MES_REFERENCIA: '202610' }], total: 2 } })))
    }
    const offset = Number(url.searchParams.get('offset') ?? 0)
    const limit = Number(url.searchParams.get('limit'))
    return Promise.resolve(new Response(JSON.stringify({
      success: true, result: { records: cnpjs.slice(offset, offset + limit).map((CNPJ) => ({ CNPJ })), total: opcoes.total ?? cnpjs.length },
    })))
  }) as typeof fetch
  return { fetchFn, urls }
}

Deno.test('D2: a empresa de CNAE e porte do Grupo A que não está na lista da CCEE vira "provável cativo", dito como inferência', async () => {
  const ccee = cceeFalsa(['11222333000255'])
  const c = cenario(cascataGrupoACativo(), {
    'epicscrapers~brazil-cnpj-scraper': {
      usageTotalUsd: 0.0045,
      itens: [
        empresaReceita({}), // a Alfa: outro CNPJ da mesma raiz está na CCEE
        empresaReceita({ cnpj: '33444555000199', razao_social: 'BETA VIDROS LTDA', nome_fantasia: 'BETA' }),
        empresaReceita({ cnpj: '44555666000100', razao_social: 'GAMA PEQUENA LTDA', nome_fantasia: 'GAMA', porte: 'MICRO EMPRESA' }),
        empresaReceita({ cnpj: '66777888000100', razao_social: 'DELTA CIMENTOS' }),
      ],
    },
  }, {
    contas: [ALFA, { id: 'conta-beta', name: 'Beta Vidros', domain: 'beta.test', linkedinUrl: null, cnpj: '33.444.555/0001-99' }, { id: 'conta-gama', name: 'Gama Pequena', domain: null, linkedinUrl: null, cnpj: null }],
    fetchPublico: ccee.fetchFn,
  })
  const r = await c.rodar({ criterios: { cnae: '2320600' } })

  assertEquals(r.desfecho, 'concluida')
  assertEquals(r.sinais.map((s) => [s.contaId, s.eventKey]), [['conta-beta', 'beta vidros|grupo_a_cativo|2026']])
  const s = r.sinais[0]
  assert(s.phrase.includes('Provável') && s.phrase.includes('inferido, não confirmado'), s.phrase)
  assert(s.evidence.startsWith('Inferido, não confirmado.'), s.evidence)
  assert(s.evidence.includes('202610') && s.evidence.includes('porte DEMAIS'), s.evidence)
  assertEquals(s.source, 'Receita Federal e lista de agentes da CCEE (dados abertos)')
  // Só o actor da Receita custa; a CCEE é aberta. A URL é a do modelo; o mês mais novo e as classes de consumidor vão em `filters`.
  assertEquals(c.posts().length, 1)
  const base = new URL(URL_CCEE_AGENTES)
  assertEquals(ccee.urls.length, 2)
  assertEquals(ccee.urls[0].searchParams.get('resource_id'), base.searchParams.get('resource_id'))
  assertEquals(ccee.urls[0].searchParams.get('fields'), 'MES_REFERENCIA')
  const filtros = JSON.parse(ccee.urls[1].searchParams.get('filters')!)
  assertEquals(filtros, { CLASSE_AGENTE: ['Consumidor Livre', 'Consumidor Especial'], MES_REFERENCIA: '202610' })
  assertEquals(ccee.urls[1].searchParams.get('fields'), 'CNPJ')
  semMarca(r)
})

Deno.test('D2: a URL da lista da CCEE vem do modelo do passo (configurável) e a lista é lida em páginas', async () => {
  const lista = Array.from({ length: 5 }, (_, i) => `1000000000${String(i).padStart(4, '0')}`)
  const ccee = cceeFalsa(lista)
  const def = cascataGrupoACativo()
  def.steps[1].inputTemplate = { ...def.steps[1].inputTemplate, url: 'https://dados.exemplo.test/ccee/datastore_search?resource_id=outro', tamanhoDaPagina: 2, maxPaginas: 3 }
  const c = cenario(def, { 'epicscrapers~brazil-cnpj-scraper': { itens: [empresaReceita({})], usageTotalUsd: 0.001 } }, { contas: [ALFA], fetchPublico: ccee.fetchFn })
  const r = await c.rodar({ criterios: { cnae: '2320600' } })
  assertEquals(r.sinais.length, 1)
  assertEquals(ccee.urls.every((u) => u.host === 'dados.exemplo.test' && u.searchParams.get('resource_id') === 'outro'), true)
  assertEquals(ccee.urls.slice(1).map((u) => u.searchParams.get('offset')), ['0', '2', '4'])
})

Deno.test('D2: se a CCEE não responde ou a lista não cabe, nenhum "provável cativo" é afirmado', async () => {
  const bloqueada = cenario(cascataGrupoACativo(), { 'epicscrapers~brazil-cnpj-scraper': { itens: [empresaReceita({})], usageTotalUsd: 0.001 } }, {
    contas: [ALFA], fetchPublico: cceeFalsa([], { status: 403 }).fetchFn,
  })
  const a = await bloqueada.rodar({ criterios: { cnae: '2320600' } })
  assertEquals([a.desfecho, a.sinais.length, a.novos], ['falhou', 0, 0])
  semMarca(a)

  // A lista tem 100 CNPJs e o modelo só deixa ler 2 páginas de 10: incompleta, então não vale como exclusão.
  const def = cascataGrupoACativo()
  def.steps[1].inputTemplate = { ...def.steps[1].inputTemplate, tamanhoDaPagina: 10, maxPaginas: 2 }
  const cheia = cenario(def, { 'epicscrapers~brazil-cnpj-scraper': { itens: [empresaReceita({})], usageTotalUsd: 0.001 } }, {
    contas: [ALFA], fetchPublico: cceeFalsa(Array.from({ length: 100 }, (_, i) => `2000000000${String(i).padStart(4, '0')}`)).fetchFn,
  })
  const b = await cheia.rodar({ criterios: { cnae: '2320600' } })
  assertEquals([b.desfecho, b.sinais.length], ['falhou', 0])
})

Deno.test('D2: sem empresa que seja Conta, a lista da CCEE nem é lida', async () => {
  const ccee = cceeFalsa([])
  const c = cenario(cascataGrupoACativo(), { 'epicscrapers~brazil-cnpj-scraper': { itens: [empresaReceita({ razao_social: 'DESCONHECIDA SA', cnpj: '12345678000195' })], usageTotalUsd: 0.001 } }, {
    contas: [ALFA], fetchPublico: ccee.fetchFn,
  })
  const r = await c.rodar({ criterios: { cnae: '2320600' } })
  assertEquals([r.desfecho, r.novos, ccee.urls.length], ['concluida', 0, 0])
})

// ---------------------------------------------------------------------------------------------------------------------
// D3. Nova planta ou filial (fotografia mensal da rede de filiais por CNPJ).

const MATRIZ_ALFA = '11222333000181'
const mapa = (filiais: { ordem: string; uf: string; situacao?: string; inicio?: string; cnae?: string }[], extra: Record<string, unknown> = {}) => ({
  recordType: 'BRANCH_MAP', raiz: '11222333', entradaOriginal: MATRIZ_ALFA, cnpjMatrizCalculado: MATRIZ_ALFA, raizAtestadaPeloIndice: true,
  totalFiliais: filiais.length, filiaisAtivas: filiais.filter((f) => (f.situacao ?? 'ATIVA') === 'ATIVA').length,
  filiais: filiais.map((f) => ({
    cnpj: `11222333${f.ordem}00`, cnpjFormatado: '', uf: f.uf, municipioCodigo: '7107', cnaePrincipal: f.cnae ?? '2320600', situacaoCodigo: '02',
    situacao: f.situacao ?? 'ATIVA', dataInicio: f.inicio ?? '2020-01-01',
  })),
  versaoDosDados: { snapshotMonth: '2026-10', referenceMonth: '2026-09', builtAt: '2026-10-01T00:00:00Z' },
  staleness: { indexMonth: '2026-09', expectedMonth: '2026-09', stale: false }, observedAt: '2026-10-01T00:33:52Z', ...extra,
})
const resumo = { recordType: 'RUN_SUMMARY', raizesPedidas: 1 }
const cnpjFilial = (ordem: string) => `11222333${ordem}`

// 14 posições: 8 da raiz + 4 da ordem + 2 do DV. O fake usa DV "00" para simplificar.
const ORDEM_2 = '0002'
const ORDEM_3 = '0003'

Deno.test('D3: a primeira rodada só grava a fotografia (falta base) e a segunda mostra a filial nova, com o reforço das notícias', async () => {
  const fotos: Record<string, { takenAt: string; data: Record<string, unknown> }[]> = {}
  const c1 = cenario(cascataNovaPlantaFilial(), { 'johnatan029~branch-network': { itens: [mapa([{ ordem: ORDEM_2, uf: 'SC' }]), resumo], usageTotalUsd: 0.01 } }, { contas: [ALFA, NORTE] })
  const a = await c1.rodar()
  assertEquals([a.desfecho, a.novos, a.sinais.length], ['concluida', 0, 0])
  // Só a Conta com CNPJ vai ao mapa, pela raiz de 8 posições.
  assertEquals(c1.posts()[0].corpo, { cnpjs: ['11222333'], maxResults: 1 })
  assertEquals(c1.posts().length, 1, 'sem filial nova nem as notícias rodam')
  assertEquals(c1.banco.gravadas.length, 1)
  const foto = c1.banco.gravadas[0]
  assertEquals(foto.chave, '11222333')
  assertEquals(foto.data.ordens, [ORDEM_2])
  // A fotografia é só da empresa: ordem das filiais, contagens e mês; nada de nome nem CPF.
  assertEquals(Object.keys(foto.data).sort(), ['ativas', 'mes', 'ordens', 'total', 'truncado'])
  fotos['11222333'] = [{ takenAt: foto.takenAt ?? '2026-09-13T00:00:00Z', data: foto.data }]

  const c2 = cenario(cascataNovaPlantaFilial(), {
    'johnatan029~branch-network': {
      usageTotalUsd: 0.01,
      itens: [mapa([{ ordem: ORDEM_2, uf: 'SC' }, { ordem: ORDEM_3, uf: 'PR', inicio: '2026-09-14', cnae: '2320600' }, { ordem: '0004', uf: 'RS', situacao: 'BAIXADA', inicio: '2026-09-20' }]), resumo],
    },
    'data_xplorer~google-news-scraper-fast': {
      usageTotalUsd: 0.012,
      itens: [
        { title: 'Alfa Cimentos inaugura nova fábrica no Paraná, com CEO João Silva', source: 'Jornal Exemplo', publishedAt: '2026-10-02', url: 'https://noticias.test/alfa-parana' },
        { title: 'Outra empresa abre filial', source: 'Outro Jornal', publishedAt: '2026-10-03', url: 'https://noticias.test/outra' },
      ],
    },
  }, { contas: [ALFA, NORTE], fotografias: fotos })
  const b = await c2.rodar()
  assertEquals([b.desfecho, b.novos], ['concluida', 1])
  const s = b.sinais[0]
  assertEquals(s.contaId, 'conta-alfa')
  assertEquals(s.eventKey, `alfa cimentos|filial|${cnpjFilial(ORDEM_3)}00`)
  assertEquals(s.phrase, 'Abriu nova filial em PR (início em 14/09/2026)')
  assert(s.evidence.includes('passou de 1 para 3 filiais (2 ativas)'), s.evidence)
  assert(s.evidence.includes('Reforço: 1 notícia') && s.evidence.includes('Jornal Exemplo') && s.evidence.includes('https://noticias.test/alfa-parana'), s.evidence)
  assert(!JSON.stringify(b).includes('João Silva'), 'o título da notícia (pode ter nome de pessoa) não é copiado')
  // O reforço: uma busca com o nome das empresas que ganharam filial, no esquema publicado do actor.
  assertEquals(c2.posts()[1].corpo, {
    keyword: '("Alfa Cimentos S.A.") (filial OR "nova unidade" OR "nova planta" OR "nova fábrica" OR "centro de distribuição")',
    maxArticles: 10, timeframe: '1m', region_language: 'BR:pt-419',
  })
  // A fotografia nova só entra no fim (depois do Sinal gravado): 3 filiais, 2 ativas.
  assertEquals(c2.banco.gravadas.map((g) => [g.chave, g.data.ordens, g.data.total, g.data.ativas]), [['11222333', [ORDEM_2, ORDEM_3, '0004'], 3, 2]])
  semMarca(b)
})

Deno.test('D3: sem notícia, o Sinal sai do mesmo jeito (o reforço não filtra); repetir a rodada não grava de novo', async () => {
  const antes = { takenAt: '2026-09-13T00:00:00Z', data: { mes: '2026-08', ordens: [ORDEM_2], total: 1, ativas: 1, truncado: false } }
  const def = cascataNovaPlantaFilial()
  const fotografias = { '11222333': [antes] }
  const itens = [mapa([{ ordem: ORDEM_2, uf: 'SC' }, { ordem: ORDEM_3, uf: 'PR' }]), resumo]
  const c = cenario(def, { 'johnatan029~branch-network': { itens, usageTotalUsd: 0.01 } }, { contas: [ALFA], fotografias })
  const a = await c.rodar({ chave: 'a' })
  assertEquals([a.novos, a.sinais.length], [1, 1])
  assert(!a.sinais[0].evidence.includes('Reforço'))
  // Mesma foto de antes (o fake não guarda o que gravou): o motor repete e o banco reconhece o acontecimento.
  const b = await c.rodar({ chave: 'b' })
  assertEquals([b.novos, b.repetidos], [0, 1])
})

Deno.test('D3: se a cascata para antes do Sinal, a fotografia não avança (a filial aparece de novo na próxima rodada)', async () => {
  const antes = { takenAt: '2026-09-13T00:00:00Z', data: { mes: '2026-08', ordens: [ORDEM_2], total: 1, ativas: 1, truncado: false } }
  const fake = apifyFalso((_t, actorId) =>
    actorId.startsWith('johnatan029~')
      ? { itens: [mapa([{ ordem: ORDEM_2, uf: 'SC' }, { ordem: ORDEM_3, uf: 'PR' }])], usageTotalUsd: 0.01 }
      : { inicio: { status: 500, corpo: { error: { type: 'x', message: 'falhou' } } } }
  )
  const fonte = clienteAssincronoDoApify({ tokens: [TOKEN], fetchFn: fake.fetchFn, dormir: () => Promise.resolve(), esperaDoCustoMs: 0, log: () => {} })
  const banco = dbFalso(cascataNovaPlantaFilial(), { contas: [ALFA], fotografias: { '11222333': [antes] } })
  const r = await rodarCascata({ db: banco.db, fonte, registro: registroDePassos(), agora: () => AGORA, log: () => {} }, {
    workspaceId: 'ws-1', userId: 'u1', signalType: 'nova_planta_filial', origem: 'conversa', chave: 'k1',
  })
  assertEquals([r.desfecho, r.sinais.length], ['falhou', 0])
  assertEquals(banco.gravadas.length, 0)
})

Deno.test('D3: raiz sem filial nova só atualiza a fotografia; filial baixada não conta; fotografia truncada não afirma nada', async () => {
  const antes = { takenAt: '2026-09-13T00:00:00Z', data: { mes: '2026-08', ordens: [ORDEM_2], total: 1, ativas: 1, truncado: false } }
  const c = cenario(cascataNovaPlantaFilial(), {
    'johnatan029~branch-network': { itens: [mapa([{ ordem: ORDEM_2, uf: 'SC' }, { ordem: ORDEM_3, uf: 'PR', situacao: 'BAIXADA' }])], usageTotalUsd: 0.01 },
  }, { contas: [ALFA], fotografias: { '11222333': [antes] } })
  const r = await c.rodar()
  assertEquals([r.novos, r.sinais.length, c.banco.gravadas.length], [0, 0, 1])

  const truncada = cenario(cascataNovaPlantaFilial(), {
    'johnatan029~branch-network': { itens: [mapa([{ ordem: ORDEM_2, uf: 'SC' }, { ordem: ORDEM_3, uf: 'PR' }])], usageTotalUsd: 0.01 },
  }, { contas: [ALFA], fotografias: { '11222333': [{ ...antes, data: { ...antes.data, truncado: true } }] } })
  const t = await truncada.rodar()
  assertEquals([t.novos, t.sinais.length], [0, 0])
})

Deno.test('D3: sem Conta com CNPJ não custa nada', async () => {
  const c = cenario(cascataNovaPlantaFilial(), {}, { contas: [NORTE] })
  const r = await c.rodar()
  assertEquals([r.desfecho, c.posts().length, r.novos], ['concluida', 0, 0])
  assertEquals(c.banco.passos[0].fim?.estado, 'skipped')
})

Deno.test('D3: o pior caso do mapa cabe no teto da cascata', () => {
  const def = cascataNovaPlantaFilial()
  const pior = def.steps.reduce((s, p) => s + p.estFixedUsd + p.estPerItemUsd * Math.min(p.estItems ? (p.maxItems ?? p.estItems) : 0, p.maxItems ?? Infinity), 0)
  assert(pior <= def.capUsd, `pior caso US$ ${pior}`)
  assert(def.maxAccounts * 0.01 + 0.00005 + 10 * 0.004 <= def.capUsd)
})

// ---------------------------------------------------------------------------------------------------------------------
// D4. Meta ESG publicada.

const NORTE_ENERGIA: ContaDoWorkspace = { id: 'conta-ne', name: 'Norte Energia Industrial S.A.', domain: 'norteenergia.com.br', linkedinUrl: null, cnpj: null }
const SEM_SITE: ContaDoWorkspace = { id: 'conta-ss', name: 'Sul Papel', domain: null, linkedinUrl: null, cnpj: null }

const linha = (query: string, results: { title: string; url: string; description?: string }[]) => ({
  query, results: results.map((r, i) => ({ position: i + 1, description: '', ...r })), next_page: 2, next_start: 10,
})

Deno.test('D4: a meta ESG confirmada por palavra-chave na página do próprio site vira Sinal da Conta', async () => {
  const c = cenario(cascataMetaEsg(), {
    'scraperlink~google-search-results-serp-scraper': {
      usageTotalUsd: 0.002,
      itens: [
        linha('"Norte Energia Industrial S.A." "relatório de sustentabilidade"', [
          { title: 'Relatório de Sustentabilidade 2025', url: 'https://www.norteenergia.com.br/sustentabilidade/relatorio-2025', description: 'Nosso relatório de sustentabilidade' },
          { title: 'Relatório (PDF)', url: 'https://www.norteenergia.com.br/docs/relatorio.pdf', description: 'relatório de sustentabilidade' },
          { title: 'Norte Energia no ranking', url: 'https://ranking.test/norte-energia', description: 'relatório de sustentabilidade' },
        ]),
        linha('"Norte Energia Industrial S.A." "net zero"', [
          { title: 'Compromisso net zero', url: 'https://www.norteenergia.com.br/clima', description: 'Nossa meta net zero até 2040' },
        ]),
        linha('"Sul Papel" "relatório de sustentabilidade"', [
          { title: 'Sul Papel sustentabilidade', url: 'https://www.sulpapel.com.br/esg', description: 'relatório de sustentabilidade' },
          { title: 'Sul Papel no jornal', url: 'https://jornal.test/sul-papel', description: 'relatório de sustentabilidade' },
        ]),
      ],
    },
    'apify~website-content-crawler': {
      usageTotalUsd: 0.006,
      itens: [
        { url: 'https://www.norteenergia.com.br/clima', text: 'Assumimos a meta de net zero até 2040, validada pela SBTi. O diretor Carlos Souza disse...' },
        { url: 'https://www.norteenergia.com.br/sustentabilidade/relatorio-2025', text: 'Relatório de sustentabilidade 2025: resultados do ano.' },
        { url: 'https://www.sulpapel.com.br/esg', text: 'Nossa política ESG e o relatório de sustentabilidade.' },
      ],
    },
  }, { contas: [NORTE_ENERGIA, SEM_SITE] })
  const r = await c.rodar()

  assertEquals(r.desfecho, 'concluida')
  assertEquals(r.sinais.map((s) => [s.contaId, s.eventKey]), [['conta-ne', 'norte energia industrial|meta_esg|2026']])
  const s = r.sinais[0]
  assertEquals(s.phrase, 'Publicou meta ESG no próprio site: net zero, SBTi')
  assert(s.evidence.includes('www.norteenergia.com.br/clima') && s.evidence.includes('palavra-chave'), s.evidence)
  assert(!JSON.stringify(r).includes('Carlos Souza'), 'o texto da página não é copiado')
  assertEquals(s.source, 'Site da empresa')

  const [busca, crawler] = c.posts()
  // Uma consulta por linha: duas por Conta, com o nome entre aspas; sem a linha de resultado "mesclada".
  assertEquals(busca.corpo, {
    keyword: [
      '"Norte Energia Industrial S.A." "relatório de sustentabilidade"', '"Norte Energia Industrial S.A." "net zero"',
      '"Sul Papel" "relatório de sustentabilidade"', '"Sul Papel" "net zero"',
    ].join('\n'),
    limit: '10', include_merged: false, gl: 'BR', hl: 'pt',
  })
  // Só páginas do próprio site (domínio da Conta, ou o nome no domínio quando a Conta não tem site), sem PDF; a meta primeiro.
  const entrada = crawler.corpo as { startUrls: { url: string }[]; crawlerType: string; maxCrawlDepth: number; maxCrawlPages: number }
  assertEquals(entrada.startUrls.map((u) => u.url), [
    'https://www.norteenergia.com.br/clima', 'https://www.norteenergia.com.br/sustentabilidade/relatorio-2025', 'https://www.sulpapel.com.br/esg',
  ])
  assertEquals([entrada.crawlerType, entrada.maxCrawlDepth, entrada.maxCrawlPages], ['cheerio', 0, 3])
  semMarca(r)
})

Deno.test('D4: página sem palavra de meta não confirma; sem página do próprio site, o rastreador nem roda', async () => {
  const semMeta = cenario(cascataMetaEsg(), {
    'scraperlink~google-search-results-serp-scraper': { itens: [linha('"Norte Energia Industrial S.A." "net zero"', [{ title: 'Clima', url: 'https://www.norteenergia.com.br/clima', description: 'net zero' }])], usageTotalUsd: 0.001 },
    'apify~website-content-crawler': { itens: [{ url: 'https://www.norteenergia.com.br/clima', text: 'Falamos de sustentabilidade e do nosso relatório de sustentabilidade anual.' }], usageTotalUsd: 0.002 },
  }, { contas: [NORTE_ENERGIA] })
  const a = await semMeta.rodar()
  assertEquals([a.desfecho, a.novos, a.sinais.length], ['concluida', 0, 0])

  const foraDoSite = cenario(cascataMetaEsg(), {
    'scraperlink~google-search-results-serp-scraper': { itens: [linha('"Norte Energia Industrial S.A." "net zero"', [{ title: 'Ranking', url: 'https://ranking.test/norte', description: 'net zero' }])], usageTotalUsd: 0.001 },
  }, { contas: [NORTE_ENERGIA] })
  const b = await foraDoSite.rodar()
  assertEquals([b.novos, foraDoSite.posts().length], [0, 1])
})

Deno.test('D4: a mesma meta em outra rodada do ano não grava de novo', async () => {
  const c = cenario(cascataMetaEsg(), {
    'scraperlink~google-search-results-serp-scraper': { itens: [linha('"Norte Energia Industrial S.A." "net zero"', [{ title: 'Clima', url: 'https://www.norteenergia.com.br/clima', description: 'net zero' }])], usageTotalUsd: 0.001 },
    'apify~website-content-crawler': { itens: [{ url: 'https://www.norteenergia.com.br/clima/', text: 'Nossa meta net zero.' }], usageTotalUsd: 0.002 },
  }, { contas: [NORTE_ENERGIA] })
  const a = await c.rodar({ chave: 'a' })
  const b = await c.rodar({ chave: 'b' })
  assertEquals([a.novos, b.novos, b.repetidos], [1, 0, 1])
})

// ---------------------------------------------------------------------------------------------------------------------
// D5. Vencimento de contrato de energia: sem fonte.

Deno.test('D5: vencimento de contrato de energia é "sem fonte": resposta válida, sem reservar crédito nem chamar fonte', async () => {
  const c = cenario(cascataVencimentoContratoEnergia(), {}, { contas: [ALFA] })
  const r = await c.rodar()
  assertEquals(r.desfecho, 'sem_fonte')
  assert(r.mensagem.includes('não são publicados'), r.mensagem)
  assertEquals([c.banco.aberturas.length, c.posts().length, r.creditosCobrados], [0, 0, 0])
  semMarca(r)
})

// ---------------------------------------------------------------------------------------------------------------------
// O registro.

Deno.test('o registro do ICP D tem todos os passos e fontes que as cascatas citam', () => {
  const reg = passosDoIcp_d()
  const handlers = [
    ...cascataCnaeEletrointensivo().steps, ...cascataGrupoACativo().steps, ...cascataNovaPlantaFilial().steps, ...cascataMetaEsg().steps,
  ]
  const faltando = handlers.filter((p) => p.handler !== 'casar_fatos_com_contas' && (p.kind === 'fonte_publica' ? !reg.fontes[p.handler] : !reg.passos[p.handler]))
  assertEquals(faltando.map((p) => p.handler), [])
  // Cada passo de actor sabe montar a entrada e ler o resultado; cada regra sabe executar.
  for (const p of handlers.filter((x) => x.kind === 'actor')) assert(reg.passos[p.handler].montarEntrada && reg.passos[p.handler].normalizar, p.handler)
  for (const p of handlers.filter((x) => x.kind === 'regra' && x.handler !== 'casar_fatos_com_contas')) assert(reg.passos[p.handler].executar, p.handler)
})

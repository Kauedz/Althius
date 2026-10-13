// ICP H (agro B2B) de ponta a ponta: o motor, os passos reais e o cliente de coleta contra um falso (nunca a rede).
//   nova_cooperativa       (Conta)    cooperativa aberta na base da Receita (natureza jurídica 214-3) -> Contas do Workspace
//   liberacao_plano_safra  (mercado)  notícia de anúncio ou de liberação do Plano Safra
//   calendario_de_safra    (mercado)  tabela interna datada: divulgação dos levantamentos da CONAB e janela de insumos
//   cpr_registrada, area_no_car       sem fonte (motivo no banco)
// Os formatos de entrada e de saída das fontes são os publicados pelos autores (leitura da API pública, 13/10/2026).
import { assert, assertEquals } from 'jsr:@std/assert@1'
import { apifyFalso, type ComportamentoDoRun } from '../falso-apify.ts'
import { dbFalso } from '../db-falso.ts'
import { clienteAssincronoDoApify } from '../fonte-apify.ts'
import { rodarCascata } from '../motor.ts'
import type { CascataDef, ClienteDaFonte, ContaDoWorkspace, PassoDef } from '../tipos.ts'
import { registroDePassos } from './index.ts'
import { passosDoIcp_h } from './icp-h.ts'
import { CNAES_AGRO } from './icp-h-cnae.ts'
import { MARCA_INTERNA } from '../../marca.ts'

const AGORA = Date.parse('2026-10-13T12:00:00Z')
const TOKEN = 'apify_api_SEGREDO_DO_TESTE_0123456789'
const semFonte: ClienteDaFonte = { rodar: () => Promise.reject(new Error('não devia chamar a coleta')) }

const PRIMARIO = 'epicscrapers~brazil-cnpj-scraper'
const RESERVA = 'johnatan029~cnpj-new-companies'
const NOTICIAS = 'data_xplorer~google-news-scraper-fast'

const regra = (ordem: number, handler: string, inputTemplate: Record<string, unknown> = {}): PassoDef => ({
  ordem, kind: 'regra', handler, actorId: null, fallbacks: [], inputTemplate, priceModel: 'NONE', estFixedUsd: 0, estPerItemUsd: 0, estItems: 0, maxItems: null,
})

// Como o banco registra (supabase/migrations/20261013220000_cascatas_icp_h.sql).
const cascataCooperativa = (): CascataDef => ({
  id: 'c-nova-cooperativa', signalType: 'nova_cooperativa', icp: 'H', name: 'Nova cooperativa', version: 1, state: 'available', semFonteMotivo: null,
  scope: 'conta', multiplier: 3, capUsd: 0.5, capCredits: null, cadenceHours: 720, maxAccounts: 200,
  steps: [
    {
      ordem: 1, kind: 'actor', handler: 'cooperativas_abertas', actorId: PRIMARIO,
      fallbacks: [{ kind: 'actor', actorId: RESERVA, priceModel: 'PAY_PER_EVENT', estFixedUsd: 0.00005, estPerItemUsd: 0.004 }],
      inputTemplate: { naturezaJuridica: '2143', janelaDias: 60, somenteAgro: true, maxItensDoFallback: 100 },
      priceModel: 'PAY_PER_EVENT', estFixedUsd: 0.00005, estPerItemUsd: 0.0009, estItems: 300, maxItems: 300,
    },
    regra(2, 'casar_fatos_com_contas'),
  ],
})

const cascataPlanoSafra = (): CascataDef => ({
  id: 'c-plano-safra', signalType: 'liberacao_plano_safra', icp: 'H', name: 'Liberação do Plano Safra', version: 1, state: 'available', semFonteMotivo: null,
  scope: 'mercado', multiplier: 3, capUsd: 0.25, capCredits: null, cadenceHours: 168, maxAccounts: 200,
  steps: [
    {
      ordem: 1, kind: 'actor', handler: 'noticias_plano_safra', actorId: NOTICIAS, fallbacks: [],
      inputTemplate: { termos: ['"Plano Safra" lançamento OR anúncio', '"Plano Safra" liberação OR crédito'], janelaDias: 7, mesesDeBusca: [5, 6, 7, 8, 9] },
      priceModel: 'PAY_PER_EVENT', estFixedUsd: 0, estPerItemUsd: 0.004, estItems: 40, maxItems: 40,
    },
    regra(2, 'plano_safra_da_noticia', { janelaDias: 7 }),
  ],
})

// A tabela interna datada do calendário (a mesma da migração).
const EVENTOS = [
  { id: 'conab-graos-2025-26-12', tipo: 'divulgacao', titulo: '12º levantamento da safra de grãos 2025/26', safra: '2025/26', de: '2026-09-15', fonte: 'CONAB, calendário de divulgação', conferidoEm: '2026-10-13' },
  { id: 'conab-graos-2026-27-01', tipo: 'divulgacao', titulo: '1º levantamento da safra de grãos 2026/27', safra: '2026/27', de: '2026-10-15', fonte: 'CONAB, calendário de divulgação', conferidoEm: '2026-10-13' },
  { id: 'conab-graos-2026-27-02', tipo: 'divulgacao', titulo: '2º levantamento da safra de grãos 2026/27', safra: '2026/27', de: '2026-11-13', fonte: 'CONAB, calendário de divulgação', conferidoEm: '2026-10-13' },
  { id: 'janela-insumos-2027', tipo: 'janela', titulo: 'Janela de compra de insumos da próxima safra', safra: '2027/28', de: '2027-02-01', ate: '2027-05-31', fonte: 'Mapa de Mercado (out/2026), ICP H', conferidoEm: null },
  { id: 'janela-insumos-2026', tipo: 'janela', titulo: 'Janela de compra de insumos da próxima safra', safra: '2026/27', de: '2026-02-01', ate: '2026-05-31', fonte: 'Mapa de Mercado (out/2026), ICP H', conferidoEm: null },
]
const cascataCalendario = (): CascataDef => ({
  id: 'c-calendario', signalType: 'calendario_de_safra', icp: 'H', name: 'Calendário de safra', version: 1, state: 'available', semFonteMotivo: null,
  scope: 'mercado', multiplier: 3, capUsd: 0.05, capCredits: null, cadenceHours: 168, maxAccounts: 200,
  steps: [regra(1, 'calendario_de_safra', { eventos: EVENTOS, recenteDias: 10 })],
})

// ---------------------------------------------------------------------------------------------------------------------
// Nova cooperativa.

const ALFA: ContaDoWorkspace = { id: 'conta-alfa', name: 'Cooperativa Agropecuária Alfa', domain: null, linkedinUrl: null, cnpj: '11.222.333/0001-81' }
const DELTA: ContaDoWorkspace = { id: 'conta-delta', name: 'Cooperativa Delta Agro', domain: null, linkedinUrl: null, cnpj: null }
const OUTRA: ContaDoWorkspace = { id: 'conta-outra', name: 'Revenda Sem Relação Ltda', domain: 'revenda.test', linkedinUrl: null, cnpj: null }

const coop = (extra: Record<string, unknown>) => ({
  cnpj: '99888777000166', razao_social: 'COOPERATIVA X', matriz_filial: 'MATRIZ', situacao_cadastral: 'ATIVA', data_abertura: '2026-09-02',
  cnae_principal_codigo: '0115600', cnae_principal_descricao: 'Cultivo de soja', natureza_juridica_codigo: '2143', natureza_juridica: 'Cooperativa',
  porte: 'DEMAIS', uf: 'MT', municipio: 'SORRISO', qsa: [], ...extra,
})

const RECEITA = [
  coop({
    cnpj: '11222333000181', razao_social: 'COOPERATIVA AGROPECUARIA ALFA LTDA', qsa: ['FULANO DE TAL — Presidente — id: ***123456** — entry: 2026-09-01'],
  }),
  coop({ cnpj: '11222333000181', razao_social: 'COOPERATIVA AGROPECUARIA ALFA LTDA' }), // repetida
  coop({ cnpj: '22333444000155', razao_social: 'COOPERATIVA DE CREDITO BETA', cnae_principal_codigo: '6424704', cnae_principal_descricao: 'Cooperativas de crédito rural' }), // não é agro
  coop({ cnpj: '33444555000122', razao_social: 'COOPERATIVA GAMA DE LEITE', data_abertura: '2026-08-20', cnae_principal_codigo: '1052000', cnae_principal_descricao: 'Fabricação de laticínios', uf: 'MG', municipio: 'POUSO ALEGRE' }),
  coop({ cnpj: '44555666000133', razao_social: 'COOPERATIVA ANTIGA', data_abertura: '2026-05-10' }),
  coop({ cnpj: '55666777000144', razao_social: 'JOAO DA SILVA 12345678901', natureza_juridica_codigo: '2135', natureza_juridica: 'Empresário (Individual)' }),
  coop({ cnpj: '66777888000155', razao_social: 'COOPERATIVA BAIXADA', situacao_cadastral: 'BAIXADA' }),
  coop({ cnpj: '77888999000166', razao_social: 'COOPERATIVA FILIAL', matriz_filial: 'FILIAL' }),
  coop({ cnpj: '88999000000177', razao_social: 'COOPERATIVA DO FUTURO', data_abertura: '2026-11-02' }),
  coop({ cnpj: '10101010000100', razao_social: 'COOPERATIVA DELTA AGRO', natureza_juridica_codigo: '214-3', data_abertura: '2026-09-20', cnae_principal_codigo: '0111301', cnae_principal_descricao: 'Cultivo de arroz', uf: 'GO', municipio: 'RIO VERDE' }),
]

function cenario(def: CascataDef, porActor: Record<string, ComportamentoDoRun>, opcoes: { contas?: ContaDoWorkspace[] } = {}) {
  const fake = apifyFalso((_token, actorId) => porActor[actorId] ?? { itens: [], usageTotalUsd: 0 })
  const fonte = clienteAssincronoDoApify({ tokens: [TOKEN], fetchFn: fake.fetchFn, dormir: () => Promise.resolve(), esperaDoCustoMs: 0, log: () => {} })
  const banco = dbFalso(def, { contas: opcoes.contas ?? [ALFA, DELTA, OUTRA] })
  const rodar = (extra: Record<string, unknown> = {}, agora = AGORA) =>
    rodarCascata({ db: banco.db, fonte, registro: registroDePassos(), agora: () => agora, log: () => {} }, {
      workspaceId: 'ws-1', userId: 'user-1', signalType: def.signalType, origem: 'conversa', chave: 'k1', ...extra,
    })
  return { fake, banco, rodar, posts: () => fake.requisicoes.filter((q) => q.metodo === 'POST') }
}

Deno.test('H1: a cooperativa agro aberta na janela vira Sinal da Conta (CNPJ ou nome); o resto é descartado ou contado', async () => {
  const c = cenario(cascataCooperativa(), { [PRIMARIO]: { itens: RECEITA, usageTotalUsd: 0.0099 } })
  const r = await c.rodar()

  assertEquals(r.desfecho, 'concluida')
  assertEquals(r.novos, 2)
  assertEquals(r.sinais.map((s) => [s.contaId, s.phrase]).sort(), [
    ['conta-alfa', 'Cooperativa aberta em 02/09/2026 (Sorriso/MT)'],
    ['conta-delta', 'Cooperativa aberta em 20/09/2026 (Rio Verde/GO)'],
  ])
  // A Gama é agro, está na janela e não é Conta: só conta. A de crédito (fora do agro), a antiga, a PF, a baixada, a filial e a
  // de data futura nem entram.
  assertEquals([r.semConta, r.semContaNomes], [1, ['COOPERATIVA GAMA DE LEITE']])

  const alfa = r.sinais.find((s) => s.contaId === 'conta-alfa')!
  assertEquals(alfa.eventKey, 'cooperativa agropecuaria alfa|cooperativa|11222333000181|2026-09-02')
  assertEquals(alfa.firedAt, '2026-09-02T12:00:00.000Z')
  assertEquals(alfa.source, 'Receita Federal (dados abertos do CNPJ)')
  assert(alfa.evidence.includes('COOPERATIVA AGROPECUARIA ALFA LTDA (CNPJ 11.222.333/0001-81)'), alfa.evidence)
  assert(alfa.evidence.includes('cooperativa (natureza jurídica 214-3)') && alfa.evidence.includes('02/09/2026'), alfa.evidence)
  assert(alfa.evidence.includes('0115600') && alfa.evidence.includes('Cultivo de soja'), alfa.evidence)
  assert(alfa.evidence.includes('atualizada uma vez por mês'), 'avisa o atraso de ~30 dias da base mensal')

  // Dado pessoal: nem o sócio (QSA) nem a pessoa física passam adiante.
  const tudo = JSON.stringify(r)
  assert(!tudo.includes('FULANO') && !tudo.includes('12345678901') && !tudo.includes('JOAO'), 'nenhum nome ou CPF de pessoa física')
  assert(!MARCA_INTERNA.test(tudo) && !tudo.includes(TOKEN))

  // A entrada pelo esquema publicado: UF vazia (o padrão do autor é DF) e só a natureza jurídica de cooperativa.
  assertEquals(c.posts().map((q) => q.caminho.split('/')[3]), [PRIMARIO])
  assertEquals(c.posts()[0].corpo, { uf: '', naturezaJuridica: '2143', maxItems: 300 })
  // O teto vai ao fornecedor: até 300 itens e no máximo o teto da cascata.
  assertEquals(c.posts()[0].consulta.get('maxItems'), '300')
  assert(Number(c.posts()[0].consulta.get('maxTotalChargeUsd')) <= 0.5)
  // O rastro.
  assertEquals(c.banco.passos.map((p) => [p.ordem, p.handler, p.fim?.estado, p.fim?.custoUsd]), [
    [1, 'cooperativas_abertas', 'succeeded', 0.0099],
    [2, 'casar_fatos_com_contas', 'succeeded', 0],
  ])
  assertEquals(r.custoUsd, 0.0099)
})

Deno.test('H1: repetir a rodada não grava de novo (eventKey por empresa, fato e data de abertura)', async () => {
  const c = cenario(cascataCooperativa(), { [PRIMARIO]: { itens: RECEITA, usageTotalUsd: 0.0099 } })
  const a = await c.rodar({ chave: 'a' })
  const b = await c.rodar({ chave: 'b' })
  assertEquals([a.novos, a.repetidos, b.novos, b.repetidos], [2, 0, 0, 2])
})

Deno.test('H1: a UF e o período do pedido valem mais que o padrão; "somente agro" pode ser desligado', async () => {
  const c = cenario(cascataCooperativa(), { [PRIMARIO]: { itens: RECEITA, usageTotalUsd: 0.001 } })
  const r = await c.rodar({ criterios: { uf: 'mt', periodo: 'Últimos 45 dias', somenteAgro: false } })
  assertEquals(c.posts()[0].corpo, { uf: 'MT', naturezaJuridica: '2143', maxItems: 300 })
  // 45 dias: a Gama (20/08) sai; sem o filtro de agro, a de crédito entra (sem Conta, só conta).
  assertEquals(r.sinais.map((s) => s.contaId).sort(), ['conta-alfa', 'conta-delta'])
  assertEquals([r.semConta, r.semContaNomes], [1, ['COOPERATIVA DE CREDITO BETA']])
})

Deno.test('H1: se a base principal falha, a alternativa filtra por CNAE do agro e fica só com a natureza de cooperativa', async () => {
  const novas = [
    { recordType: 'NEW_COMPANY', cnpj: '11222333000181', cnpjFormatado: '11.222.333/0001-81', razaoSocial: 'COOPERATIVA AGROPECUARIA ALFA', dataInicio: '2026-09-10', cnaePrincipal: '0161003', uf: 'GO', municipioCodigo: '9373', porte: '05', naturezaJuridica: '2143', capitalSocial: '1000,00', matrizFilial: 'matriz', situacao: 'ATIVA' },
    { recordType: 'NEW_COMPANY', cnpj: '12121212000112', razaoSocial: 'AGRO LTDA', dataInicio: '2026-09-11', cnaePrincipal: '0111301', uf: 'GO', naturezaJuridica: '2062' },
    { recordType: 'NEW_COMPANY', cnpj: '13131313000113', razaoSocial: 'MARIA SOUZA 11122233344', dataInicio: '2026-09-12', cnaePrincipal: '0111301', uf: 'GO', naturezaJuridica: '2135' },
    { recordType: 'RUN_SUMMARY', recordsWritten: 3, report: { totalNovasNoMes: 9000 } },
  ]
  const c = cenario(cascataCooperativa(), {
    [PRIMARIO]: { estados: ['FAILED'], mensagem: 'falhou', usageTotalUsd: 0 },
    [RESERVA]: { itens: novas, usageTotalUsd: 0.012 },
  })
  const r = await c.rodar({ criterios: { uf: 'GO' } })

  assertEquals(r.desfecho, 'concluida')
  assertEquals(c.posts().map((q) => q.caminho.split('/')[3]), [PRIMARIO, RESERVA])
  assertEquals(c.posts()[1].corpo, { ufs: ['GO'], cnaes: CNAES_AGRO, portes: [], mes: '', maxResults: 100, maxRuntimeMs: 120000 })
  assertEquals(r.sinais.map((s) => [s.contaId, s.phrase]), [['conta-alfa', 'Cooperativa aberta em 10/09/2026 (GO)']])
  assertEquals(r.semConta, 0, 'a LTDA e a pessoa física não são cooperativa')
  assertEquals(c.banco.passos.map((p) => [p.ordem, p.tentativa, p.actorId, p.fim?.estado]), [
    [1, 1, PRIMARIO, 'failed'],
    [1, 2, RESERVA, 'succeeded'],
    [2, 1, null, 'succeeded'],
  ])
  assert(!JSON.stringify(r).includes('MARIA') && !JSON.stringify(r).includes('11122233344'))
})

Deno.test('H1: o pior caso de cada fonte cabe no teto da cascata e a alternativa não é barrada pela estimativa', () => {
  const def = cascataCooperativa()
  const p = def.steps[0]
  const alt = p.fallbacks[0]
  const principal = p.estFixedUsd + p.estPerItemUsd * (p.maxItems ?? 0)
  const reserva = (alt.estFixedUsd ?? 0) + (alt.estPerItemUsd ?? 0) * Number(p.inputTemplate.maxItensDoFallback)
  assert(principal <= def.capUsd, `principal ${principal}`)
  assert(reserva <= def.capUsd, `alternativa ${reserva}`)
})

Deno.test('H1: a alternativa, ao rodar de fato, estima só os itens que pede (não os 300 da principal)', async () => {
  // Sem esse ajuste a estimativa da alternativa seria 300 x US$ 0,004 = US$ 1,20 e o motor a barraria no teto de US$ 0,50.
  const c = cenario(cascataCooperativa(), {
    [PRIMARIO]: { inicio: { status: 500, corpo: { error: { type: 'x', message: 'erro' } } } },
    [RESERVA]: { itens: [], usageTotalUsd: 0 },
  })
  await c.rodar()
  assertEquals(c.banco.passos.map((p) => [p.tentativa, p.fim?.estado]), [[1, 'failed'], [2, 'empty']])
})

// ---------------------------------------------------------------------------------------------------------------------
// Plano Safra.

const AGORA_JULHO = Date.parse('2026-07-03T15:00:00Z')
let contadorDeUrl = 0
const noticia = (title: string, source: string, publishedAt: string, extra: Record<string, unknown> = {}) => ({
  // O endereço do Google Notícias é opaco (não traz o título).
  title, source, url: `https://news.google.com/rss/articles/CBMi${(++contadorDeUrl).toString(36).padStart(6, '0')}`, publishedAt, publishedTimestamp: Date.parse(publishedAt),
  metadata: { keyword: '"Plano Safra"', sourceType: 'keyword', timeframe: '7d' }, ...extra,
})

const NOTICIAS_DO_PLANO = [
  noticia('Governo anuncia Plano Safra 2026/27 com R$ 516 bilhões para o agro', 'Canal Rural', '2026-07-01T14:00:00.000Z'),
  noticia('Plano Safra 2026/27 é lançado; veja o que muda para o produtor', 'Globo Rural', '2026-07-01T18:00:00.000Z'),
  noticia('Crédito do Plano Safra 2026/27 começa a ser liberado nesta quinta', 'Agência Brasil', '2026-07-02T10:00:00.000Z'),
  noticia('Plano Safra: produtores reclamam dos juros altos', 'Folha', '2026-07-02T12:00:00.000Z'),
  noticia('Ministro Beltrano de Tal anuncia Plano Safra da Agricultura Familiar 2026/2027', 'Canal Rural', '2026-07-01T20:00:00.000Z'),
  noticia('Plano Safra 2025/26 liberou crédito recorde', 'Valor', '2026-06-20T10:00:00.000Z'),
  noticia('Safra de soja bate recorde no Mato Grosso', 'Notícias Agrícolas', '2026-07-02T09:00:00.000Z'),
]

Deno.test('H2: dentro da temporada, a notícia de anúncio e a de liberação viram Sinais de mercado, um por safra, programa e etapa', async () => {
  const c = cenario(cascataPlanoSafra(), { [NOTICIAS]: { itens: NOTICIAS_DO_PLANO, usageTotalUsd: 0.028 } })
  const r = await c.rodar({}, AGORA_JULHO)

  assertEquals(r.desfecho, 'concluida')
  assertEquals(r.sinais, [])
  assertEquals(r.mercado.map((m) => m.eventKey).sort(), [
    'plano-safra|2026/27|familiar|anuncio',
    'plano-safra|2026/27|geral|anuncio',
    'plano-safra|2026/27|geral|liberacao',
  ])
  const anuncio = r.mercado.find((m) => m.eventKey === 'plano-safra|2026/27|geral|anuncio')!
  assertEquals(anuncio.phrase, 'Plano Safra 2026/27 foi anunciado (R$ 516 bilhões)')
  assertEquals(anuncio.firedAt, '2026-07-01T14:00:00.000Z')
  assertEquals(anuncio.source, 'Canal Rural')
  assertEquals(anuncio.payload.noticias, 2)
  assertEquals(anuncio.payload.veiculos, ['Canal Rural', 'Globo Rural'])
  assertEquals(anuncio.payload.valorCitado, 'R$ 516 bilhões')
  assert(anuncio.evidence.includes('2 notícias') && anuncio.evidence.includes('palavras-chave do título'), anuncio.evidence)
  const liberacao = r.mercado.find((m) => m.eventKey === 'plano-safra|2026/27|geral|liberacao')!
  assertEquals(liberacao.phrase, 'Crédito do Plano Safra 2026/27 começou a ser liberado')
  const familiar = r.mercado.find((m) => m.eventKey.includes('familiar'))!
  assertEquals(familiar.phrase, 'Plano Safra da Agricultura Familiar 2026/27 foi anunciado')

  // Sem Conta, sem pessoa citada, sem marca.
  const tudo = JSON.stringify(r)
  assert(!tudo.includes('Beltrano') && !tudo.includes('Ministro'), 'o título não é copiado; nenhum nome de pessoa')
  assert(!MARCA_INTERNA.test(tudo))
  assertEquals(c.banco.sinais.length, 0)

  // A entrada pelo esquema publicado.
  assertEquals(c.posts()[0].corpo, {
    keywords: ['"Plano Safra" lançamento OR anúncio', '"Plano Safra" liberação OR crédito'], topics: [], topicUrls: [], maxArticles: 20,
    timeframe: '7d', region_language: 'BR:pt-419', decodeUrls: false, extractDescriptions: false, extractImages: false, proxyConfiguration: { useApifyProxy: true },
  })
  assertEquals(c.posts()[0].consulta.get('maxItems'), '40')
  assert(Number(c.posts()[0].consulta.get('maxTotalChargeUsd')) <= 0.25)
  assertEquals(r.custoUsd, 0.028)
})

Deno.test('H2: a mesma notícia em outra rodada não grava de novo; a safra sem ano no título sai da data', async () => {
  const c = cenario(cascataPlanoSafra(), {
    [NOTICIAS]: { itens: [noticia('Governo lança o Plano Safra com crédito de R$ 400 bi', 'G1', '2026-07-01T10:00:00.000Z')], usageTotalUsd: 0.004 },
  })
  const a = await c.rodar({ chave: 'a' }, AGORA_JULHO)
  const b = await c.rodar({ chave: 'b' }, AGORA_JULHO)
  assertEquals(a.mercado.map((m) => [m.eventKey, m.phrase]), [['plano-safra|2026/27|geral|anuncio', 'Plano Safra 2026/27 foi anunciado (R$ 400 bi)']])
  assertEquals([a.novos, b.novos, b.repetidos], [1, 0, 1])
})

Deno.test('H2: fora da temporada (maio a setembro) o passo é pulado, sem custo e sem chamar a coleta; o pedido pode forçar', async () => {
  const fora = cenario(cascataPlanoSafra(), { [NOTICIAS]: { itens: NOTICIAS_DO_PLANO, usageTotalUsd: 0.028 } })
  const r = await fora.rodar({}, AGORA)
  assertEquals([r.desfecho, r.mercado.length, r.custoUsd], ['concluida', 0, 0])
  assertEquals(fora.posts().length, 0)
  assertEquals(fora.banco.passos[0].fim?.estado, 'skipped')

  const forcado = cenario(cascataPlanoSafra(), { [NOTICIAS]: { itens: [], usageTotalUsd: 0 } })
  await forcado.rodar({ criterios: { foraDaTemporada: true } }, AGORA)
  assertEquals(forcado.posts().length, 1)
})

Deno.test('H2: o período do pedido muda a janela da busca e das notícias', async () => {
  const c = cenario(cascataPlanoSafra(), { [NOTICIAS]: { itens: NOTICIAS_DO_PLANO, usageTotalUsd: 0.028 } })
  const r = await c.rodar({ criterios: { periodo: 'Últimos 30 dias' } }, AGORA_JULHO)
  assertEquals((c.posts()[0].corpo as { timeframe: string }).timeframe, '30d')
  // A notícia de 20/06 (Plano Safra 2025/26, "liberou") entra com 30 dias.
  assert(r.mercado.some((m) => m.eventKey === 'plano-safra|2025/26|geral|liberacao'), JSON.stringify(r.mercado.map((m) => m.eventKey)))
})

// ---------------------------------------------------------------------------------------------------------------------
// Calendário de safra.

const rodarCalendario = (agora: string, criterios: Record<string, unknown> = {}) => {
  const banco = dbFalso(cascataCalendario(), { contas: [] })
  return rodarCascata({ db: banco.db, fonte: semFonte, registro: registroDePassos(), agora: () => Date.parse(agora), log: () => {} }, {
    workspaceId: 'ws-1', userId: 'u1', signalType: 'calendario_de_safra', origem: 'conversa', chave: 'k1', criterios,
  }).then((r) => ({ r, banco }))
}

Deno.test('H3: a divulgação da CONAB que acabou de acontecer vira Sinal de mercado; a futura e a antiga, não', async () => {
  const { r } = await rodarCalendario('2026-10-16T12:00:00Z')
  assertEquals(r.desfecho, 'concluida')
  assertEquals(r.mercado.map((m) => m.eventKey), ['calendario|conab-graos-2026-27-01'])
  const m = r.mercado[0]
  assertEquals(m.phrase, 'CONAB divulgou o 1º levantamento da safra de grãos 2026/27')
  assertEquals(m.firedAt, '2026-10-15T12:00:00.000Z')
  assertEquals(m.source, 'CONAB, calendário de divulgação')
  assert(m.evidence.includes('conferida em 13/10/2026') && m.evidence.includes('revisável'), m.evidence)
  assertEquals((m.payload as { safra: string }).safra, '2026/27')
  assert(!MARCA_INTERNA.test(JSON.stringify(r)))
  // Dois dias antes do levantamento, nada; 30 dias depois, também nada (o seguinte é só em 13/11).
  assertEquals((await rodarCalendario('2026-10-13T12:00:00Z')).r.mercado, [])
  assertEquals((await rodarCalendario('2026-11-12T12:00:00Z')).r.mercado, [])
})

Deno.test('H3: dentro da janela de compra de insumos (fev a mai) há um Sinal por ano, marcado como não conferido', async () => {
  const { r, banco } = await rodarCalendario('2027-03-10T12:00:00Z')
  assertEquals(r.mercado.map((m) => [m.eventKey, m.phrase, m.firedAt]), [
    ['calendario|janela-insumos-2027', 'Janela de compra de insumos da próxima safra aberta (de fev a mai)', '2027-02-01T12:00:00.000Z'],
  ])
  assert(r.mercado[0].evidence.includes('não conferida em fonte pública'), r.mercado[0].evidence)
  const outra = await rodarCascata({ db: banco.db, fonte: semFonte, registro: registroDePassos(), agora: () => Date.parse('2027-03-17T12:00:00Z'), log: () => {} }, {
    workspaceId: 'ws-1', userId: 'u1', signalType: 'calendario_de_safra', origem: 'monitor', chave: 'k2',
  })
  assertEquals([outra.novos, outra.repetidos], [0, 1], 'a janela aberta não repete o Sinal')
  assertEquals((await rodarCalendario('2027-06-15T12:00:00Z')).r.mercado, [], 'depois da janela, nada')
})

Deno.test('H3: sem a tabela no modelo do passo, o Sinal termina vazio em vez de inventar datas', async () => {
  const def = cascataCalendario()
  def.steps = [regra(1, 'calendario_de_safra', {})]
  const banco = dbFalso(def, { contas: [] })
  const r = await rodarCascata({ db: banco.db, fonte: semFonte, registro: registroDePassos(), agora: () => AGORA, log: () => {} }, {
    workspaceId: 'ws-1', userId: 'u1', signalType: 'calendario_de_safra', origem: 'conversa', chave: 'k1',
  })
  assertEquals([r.desfecho, r.mercado.length], ['concluida', 0])
})

// ---------------------------------------------------------------------------------------------------------------------
// Sem fonte e registro.

// Lê a migração: precisa de --allow-read (o passo próprio do CI); sem a permissão, é ignorado.
const ARQUIVO_DA_MIGRACAO = new URL('../../../../migrations/20261013220000_cascatas_icp_h.sql', import.meta.url)
const podeLer = (await Deno.permissions.query({ name: 'read', path: ARQUIVO_DA_MIGRACAO })).state === 'granted'

Deno.test({ name: 'H4: CPR registrada e área no CAR são resultado válido sem fonte: o motivo vai ao usuário, sem coleta e sem crédito', ignore: !podeLer, async fn() {
  const sql = await Deno.readTextFile(ARQUIVO_DA_MIGRACAO)
  for (const tipo of ['cpr_registrada', 'area_no_car']) {
    const bloco = sql.split('select private.seed_signal_cascade').find((b) => b.includes(`"signalType": "${tipo}"`))
    assert(bloco, `${tipo} está na migração`)
    const motivo = bloco.match(/"semFonteMotivo": "([^"]+)"/)?.[1]
    assert(motivo && motivo.length > 40, `${tipo} tem motivo`)
    assert(!MARCA_INTERNA.test(motivo), motivo)
    const def: CascataDef = {
      id: `c-${tipo}`, signalType: tipo, icp: 'H', name: tipo, version: 1, state: 'sem_fonte', semFonteMotivo: motivo, scope: 'conta',
      multiplier: 3, capUsd: 0.5, capCredits: null, cadenceHours: 24, maxAccounts: 200, steps: [],
    }
    const banco = dbFalso(def, { contas: [ALFA] })
    const r = await rodarCascata({ db: banco.db, fonte: semFonte, registro: registroDePassos(), agora: () => AGORA, log: () => {} }, {
      workspaceId: 'ws-1', userId: 'u1', signalType: tipo, origem: 'conversa', chave: 'k1',
    })
    assertEquals([r.desfecho, r.mensagem, r.creditosCobrados, banco.aberturas.length], ['sem_fonte', motivo, 0, 0])
  }
} })

Deno.test('o ICP H registra os quatro handlers dos seus passos', () => {
  const r = passosDoIcp_h()
  assertEquals(Object.keys(r.passos).sort(), ['calendario_de_safra', 'cooperativas_abertas', 'noticias_plano_safra', 'plano_safra_da_noticia'])
  assertEquals(Object.keys(r.fontes), [])
  assert(CNAES_AGRO.length > 5 && CNAES_AGRO.every((c) => /^\d{2,7}$/.test(c)))
})

// Os adaptadores de anúncio (sinais-reais 05) com resultados de exemplo no formato do README de cada actor. Empresas,
// anúncios e páginas são fictícios: nenhum dado pessoal real.
import { assert, assertEquals, assertThrows } from 'jsr:@std/assert@1'
import { type ContaParaVarrer, SemDadoParaVarrer } from '../handler.ts'
import { anuncioLinkedin } from './anuncio-linkedin.ts'
import { anuncioMeta } from './anuncio-meta.ts'
import { nomeParaBusca } from './anuncios.ts'

const AGORA = Date.parse('2026-09-30T12:00:00Z')
const CONTA: ContaParaVarrer = {
  id: 'conta-1',
  name: 'Acme Logística S.A.',
  domain: 'acmelog.com.br',
  linkedinUrl: 'https://www.linkedin.com/company/acme-logistica/',
}
const SEM_DADOS: ContaParaVarrer = { ...CONTA, domain: null, linkedinUrl: null }
const CRITERIOS = { localizacao: ['Brasil'], periodo: 'Últimos 30 dias', palavras: '' }
const segundos = (iso: string) => Date.parse(iso) / 1000

// Um item como os campos da tabela do README do curious_coder/facebook-ads-library-scraper.
const itemDaMeta = (extra: Record<string, unknown> = {}, snapshot: Record<string, unknown> = {}) => ({
  ad_archive_id: '1100000000000001',
  ad_id: null,
  collation_count: 1,
  collation_id: '2200000000000001',
  page_id: '300000000000001',
  page_name: 'Acme Logística',
  is_active: true,
  start_date: segundos('2026-09-12T07:00:00Z'),
  end_date: segundos('2026-09-30T07:00:00Z'),
  publisher_platform: ['FACEBOOK', 'INSTAGRAM'],
  snapshot: {
    body: { text: 'Frete grátis para todo o Brasil em pedidos acima de R$ 99. {{product.name}}' },
    caption: 'acmelog.com.br',
    link_url: 'https://www.acmelog.com.br/frete?utm_source=meta',
    page_name: 'Acme Logística',
    page_profile_uri: 'https://www.facebook.com/acmelogistica/',
    title: 'Entrega em 24 horas',
    cta_text: 'Saiba mais',
    cards: [],
    ...snapshot,
  },
  url: 'https://www.facebook.com/ads/library/?q=Acme',
  ad_library_url: 'https://www.facebook.com/ads/library/?id=1100000000000001',
  ...extra,
})

// Um item como o do exemplo de saída do README do silva95gustavo/linkedin-ad-library-scraper.
const itemDoLinkedin = (extra: Record<string, unknown> = {}) => ({
  adId: '272200001',
  advertiserLogo: 'https://media.licdn.com/dms/image/logo-ficticio.png',
  advertiserName: 'Acme Logística',
  advertiserUrl: 'https://www.linkedin.com/company/1234567',
  availability: { start: '2026-09-15', end: '2026-10-15' },
  body: 'Conheça a nova malha de distribuição da Acme: entregas B2B em todo o Sudeste.',
  clickUrl: 'https://www.acmelog.com.br/b2b?trk=ad_library_ad_preview_headline_content',
  ctas: ['Learn more'],
  format: 'SINGLE_IMAGE',
  impressions: '1k-5k',
  impressionsPerCountry: [{ country: 'Brazil', impressions: '100%' }],
  paidBy: 'ACME LOGISTICA S.A.',
  headline: 'Logística B2B sem atraso',
  startUrl: 'https://www.linkedin.com/ad-library/search?accountOwner=Acme',
  targeting: { language: 'Portuguese', location: 'Brazil' },
  ...extra,
})

Deno.test('nome para a busca: sem a forma jurídica, com os acentos; sem nome, a Conta é pulada', () => {
  assertEquals(nomeParaBusca(CONTA), 'Acme Logística')
  assertEquals(nomeParaBusca({ ...CONTA, name: 'Banco do Brasil' }), 'Banco do Brasil')
  assertThrows(() => anuncioMeta.entrada({ ...CONTA, name: ' ' }, CRITERIOS, AGORA), SemDadoParaVarrer)
})

Deno.test('Meta: busca o nome da Conta nos anúncios ativos de cada país, a partir do início do período', () => {
  const { input, maxItems } = anuncioMeta.entrada(CONTA, { ...CRITERIOS, localizacao: ['Brasil', 'México'], periodo: 'Últimos 14 dias' }, AGORA)
  const urls = (input.urls as { url: string }[]).map((u) => new URL(u.url))
  assertEquals(urls.map((u) => u.searchParams.get('country')), ['BR', 'MX'])
  const [br] = urls
  assertEquals(br.origin + br.pathname, 'https://www.facebook.com/ads/library/')
  assertEquals(br.searchParams.get('q'), 'Acme Logística')
  assertEquals(br.searchParams.get('active_status'), 'active')
  assertEquals(br.searchParams.get('search_type'), 'keyword_unordered')
  assertEquals(br.searchParams.get('ad_type'), 'all')
  const desde = Date.parse(br.searchParams.get('start_date[min]')!)
  assertEquals(new Date(desde).toISOString().slice(0, 10), new Date(AGORA - 14 * 86400_000).toISOString().slice(0, 10))
  assertEquals(input.limitPerSource, 15)
  assertEquals(input.count, 30)
  assertEquals(input.scrapeAdDetails, false)
  assertEquals(maxItems, 30)
})

Deno.test('Meta: vários anúncios da Conta no mesmo mês viram um Sinal, com a quantidade, trechos e o link', () => {
  const itens = [
    itemDaMeta(),
    itemDaMeta({ ad_archive_id: '1100000000000002', start_date: segundos('2026-09-20T07:00:00Z') }, { body: { text: 'Rastreie seu pedido pelo WhatsApp.' } }),
    itemDaMeta({ ad_archive_id: '1100000000000003', start_date: segundos('2026-09-25T07:00:00Z') }),
    itemDaMeta({ ad_archive_id: '1100000000000004', start_date: segundos('2026-09-14T07:00:00Z') }),
    itemDaMeta(), // o mesmo anúncio repetido no resultado
  ]
  const [s, ...resto] = anuncioMeta.sinais(itens, CONTA, CRITERIOS, AGORA)
  assertEquals(resto, [])
  assertEquals(s.eventKey, 'anuncio_meta|300000000000001|2026-09')
  assertEquals(s.phrase, 'Começou a anunciar na Meta: 4 anúncios ativos desde 12/09/2026')
  assertEquals(s.firedAt, '2026-09-12T07:00:00.000Z')
  assertEquals(s.source, 'Biblioteca de anúncios da Meta')
  assert(s.evidence!.includes('4 anúncios ativos de Acme Logística na Meta; o primeiro começou em 12/09/2026'))
  assert(s.evidence!.includes('“Frete grátis para todo o Brasil em pedidos acima de R$ 99. — Entrega em 24 horas”'))
  assert(s.evidence!.includes('Rastreie seu pedido'))
  assert(!s.evidence!.includes('{{'))
  assert(s.evidence!.includes('https://www.facebook.com/ads/library/?id=1100000000000001'))
})

Deno.test('Meta: anúncio de outra página com nome parecido não vira Sinal; o domínio do link ou o nome reconhecem a Conta', () => {
  const outra = itemDaMeta(
    { page_id: '399999999999999', page_name: 'Acme Logística Express' },
    { caption: 'acmeexpress.com', link_url: 'https://acmeexpress.com/promo' },
  )
  const revendedor = itemDaMeta({ page_id: '388888888888888', page_name: 'Loja do Zé' }, { caption: 'lojadoze.com.br', link_url: 'https://lojadoze.com.br' })
  assertEquals(anuncioMeta.sinais([outra, revendedor], CONTA, CRITERIOS, AGORA), [])
  const peloDominio = itemDaMeta({ page_id: '377777777777777', page_name: 'Acme Ofertas' }, { link_url: 'https://loja.acmelog.com.br/x', caption: '' })
  assertEquals(anuncioMeta.sinais([peloDominio], CONTA, CRITERIOS, AGORA).length, 1)
  const semLink = itemDaMeta({}, { link_url: null, caption: 'Saiba mais' })
  assertEquals(anuncioMeta.sinais([semLink], SEM_DADOS, CRITERIOS, AGORA).length, 1)
  assertEquals(anuncioMeta.sinais([outra], SEM_DADOS, CRITERIOS, AGORA), [])
})

Deno.test('Meta: anúncio antigo, inativo, sem data ou sem as palavras não vira Sinal', () => {
  const antigo = itemDaMeta({ start_date: segundos('2026-07-01T07:00:00Z') })
  const inativo = itemDaMeta({ is_active: false })
  const semData = itemDaMeta({ start_date: null })
  assertEquals(anuncioMeta.sinais([antigo, inativo, semData], CONTA, CRITERIOS, AGORA), [])
  assertEquals(anuncioMeta.sinais([itemDaMeta()], CONTA, { ...CRITERIOS, periodo: 'Últimos 7 dias' }, AGORA), [])
  assertEquals(anuncioMeta.sinais([itemDaMeta()], CONTA, { ...CRITERIOS, palavras: 'seguro, crédito' }, AGORA), [])
  assertEquals(anuncioMeta.sinais([itemDaMeta()], CONTA, { ...CRITERIOS, palavras: 'seguro, frete grátis' }, AGORA).length, 1)
})

Deno.test('Meta: anúncios que começaram em dois meses viram dois Sinais', () => {
  const agosto = itemDaMeta({ ad_archive_id: '1100000000000009', start_date: segundos('2026-08-28T07:00:00Z') })
  const sinais = anuncioMeta.sinais([itemDaMeta(), agosto], CONTA, { ...CRITERIOS, periodo: 'Últimos 90 dias' }, AGORA)
  assertEquals(sinais.map((s) => s.eventKey), ['anuncio_meta|300000000000001|2026-08', 'anuncio_meta|300000000000001|2026-09'])
  assertEquals(sinais[0].phrase, 'Começou a anunciar na Meta: 1 anúncio ativo desde 28/08/2026')
})

Deno.test('Meta: itens de erro e sem identificação ficam de fora; textos longos cabem nos limites do banco', () => {
  const erros = [{ error: 'Página não encontrada', url: 'https://www.facebook.com/ads/library/' }, 'erro', null, 42, itemDaMeta({ ad_archive_id: '' })]
  assertEquals(anuncioMeta.sinais(erros, CONTA, CRITERIOS, AGORA), [])
  const longo = itemDaMeta({ page_name: `Acme Logística ${'x'.repeat(400)}` }, { body: { text: 't'.repeat(5000) } })
  const [s] = anuncioMeta.sinais([longo], CONTA, CRITERIOS, AGORA)
  assert(s.phrase.length <= 300 && s.eventKey.length <= 300 && s.evidence!.length <= 2000)
  assert(s.evidence!.includes('“' + 't'.repeat(198)))
  assert(!s.evidence!.includes('t'.repeat(201)))
})

Deno.test('LinkedIn: busca o anunciante pelo nome da Conta em cada país, nos últimos 30 dias, com os detalhes', () => {
  const { input, maxItems } = anuncioLinkedin.entrada(CONTA, { ...CRITERIOS, localizacao: ['Brasil', 'Chile'], periodo: 'Últimos 7 dias' }, AGORA)
  const urls = (input.startUrls as { url: string }[]).map((u) => new URL(u.url))
  assertEquals(urls.map((u) => u.searchParams.get('countries')), ['BR', 'CL'])
  const [br] = urls
  assertEquals(br.origin + br.pathname, 'https://www.linkedin.com/ad-library/search')
  assertEquals(br.searchParams.get('accountOwner'), 'Acme Logística')
  assertEquals(br.searchParams.get('dateOption'), 'last-30-days')
  assertEquals(input.resultsLimit, 10)
  assertEquals(input.skipDetails, false)
  assertEquals(maxItems, 20)
})

Deno.test('LinkedIn: acima de 30 dias, a busca fica nos últimos 30 (o intervalo de datas voltou vazio na execução real)', () => {
  const { input } = anuncioLinkedin.entrada(CONTA, { periodo: 'Últimos 90 dias' }, AGORA)
  const [url] = (input.startUrls as { url: string }[]).map((u) => new URL(u.url))
  assertEquals(url.searchParams.get('countries'), 'BR')
  assertEquals(url.searchParams.get('dateOption'), 'last-30-days')
  assertEquals(url.searchParams.get('startdate'), null)
  assertEquals(url.searchParams.get('enddate'), null)
  assertEquals(input.resultsLimit, 20)
  // Sem a data de início, a frase diz o período que a busca cobriu, não o do formulário.
  const semData = itemDoLinkedin({ availability: undefined })
  const [s] = anuncioLinkedin.sinais([semData], CONTA, { ...CRITERIOS, periodo: 'Últimos 90 dias' }, AGORA)
  assertEquals(s.phrase, 'Anunciando no LinkedIn: 1 anúncio nos últimos 30 dias')
})

Deno.test('LinkedIn: vários anúncios da Conta no mesmo mês viram um Sinal, sem "ativos" e sem quem pagou', () => {
  const itens = [
    itemDoLinkedin(),
    itemDoLinkedin({ adId: '272200002', availability: { start: '2026-09-18' }, body: 'Vagas de motorista em Campinas.' }),
    itemDoLinkedin({ adId: '272200003', availability: { start: '2026-09-22', end: '2026-09-29' } }),
  ]
  const [s, ...resto] = anuncioLinkedin.sinais(itens, CONTA, CRITERIOS, AGORA)
  assertEquals(resto, [])
  assertEquals(s.eventKey, 'anuncio_linkedin|1234567|2026-09')
  assertEquals(s.phrase, 'Começou a anunciar no LinkedIn: 3 anúncios desde 15/09/2026')
  assertEquals(s.firedAt, '2026-09-15T00:00:00.000Z')
  assertEquals(s.source, 'Biblioteca de anúncios do LinkedIn')
  assert(s.evidence!.includes('“Logística B2B sem atraso — Conheça a nova malha'))
  assert(s.evidence!.includes('https://www.linkedin.com/ad-library/detail/272200001'))
  assert(!s.evidence!.includes('ACME LOGISTICA S.A.'))
})

Deno.test('LinkedIn: anunciante de nome parecido não vira Sinal; a página, o domínio ou o nome reconhecem a Conta', () => {
  const outra = itemDoLinkedin({ advertiserName: 'Acme Log Soluções', advertiserUrl: 'https://www.linkedin.com/company/7654321', clickUrl: 'https://acmelogsolucoes.com' })
  assertEquals(anuncioLinkedin.sinais([outra], CONTA, CRITERIOS, AGORA), [])
  // Mesma forma de página, páginas diferentes: não é, mesmo com o nome igual.
  const outraPagina = itemDoLinkedin({ advertiserUrl: 'https://www.linkedin.com/company/acme-logistica-mx' })
  assertEquals(anuncioLinkedin.sinais([outraPagina], CONTA, CRITERIOS, AGORA), [])
  const mesmaPagina = itemDoLinkedin({ advertiserName: 'Acme', advertiserUrl: 'https://br.linkedin.com/company/acme-logistica', clickUrl: '' })
  assertEquals(anuncioLinkedin.sinais([mesmaPagina], CONTA, CRITERIOS, AGORA)[0].eventKey, 'anuncio_linkedin|acme-logistica|2026-09')
  const peloNome = itemDoLinkedin({ clickUrl: 'https://lnkd.in/abc' })
  assertEquals(anuncioLinkedin.sinais([peloNome], SEM_DADOS, CRITERIOS, AGORA).length, 1)
  assertEquals(anuncioLinkedin.sinais([itemDoLinkedin({ advertiserName: 'Acme Logística Express' })], SEM_DADOS, CRITERIOS, AGORA), [])
})

Deno.test('LinkedIn: anúncio antigo ou sem as palavras não vira Sinal', () => {
  const antigo = itemDoLinkedin({ availability: { start: '2026-06-01', end: '2026-09-29' } })
  assertEquals(anuncioLinkedin.sinais([antigo], CONTA, CRITERIOS, AGORA), [])
  assertEquals(anuncioLinkedin.sinais([itemDoLinkedin()], CONTA, { ...CRITERIOS, palavras: 'varejo' }, AGORA), [])
  assertEquals(anuncioLinkedin.sinais([itemDoLinkedin()], CONTA, { ...CRITERIOS, palavras: 'varejo, B2B' }, AGORA).length, 1)
})

Deno.test('LinkedIn: dois meses de início viram dois Sinais; itens de erro ficam de fora; textos cabem nos limites', () => {
  const agosto = itemDoLinkedin({ adId: '272200009', availability: { start: '2026-08-20' } })
  const sinais = anuncioLinkedin.sinais([itemDoLinkedin(), agosto, { error: 'blocked' }, 'erro', null], CONTA, { periodo: 'Últimos 90 dias' }, AGORA)
  assertEquals(sinais.map((s) => s.eventKey), ['anuncio_linkedin|1234567|2026-08', 'anuncio_linkedin|1234567|2026-09'])
  const longo = itemDoLinkedin({ advertiserName: `Acme Logística ${'x'.repeat(400)}`, body: 'b'.repeat(5000) })
  const [s] = anuncioLinkedin.sinais([longo], CONTA, CRITERIOS, AGORA)
  assert(s.phrase.length <= 300 && s.eventKey.length <= 300 && s.evidence!.length <= 2000)
  assert(!s.evidence!.includes('b'.repeat(201)))
})

// Execução real de 01/10/2026 (Microsoft, Estados Unidos, 30 dias): 20 anúncios sem `availability` nem data nenhuma na saída.
Deno.test('LinkedIn: sem a data de início na saída, os anúncios do período viram um Sinal "anunciando" do mês da varredura', () => {
  const semData = (adId: string, extra: Record<string, unknown> = {}) => itemDoLinkedin({ adId, availability: undefined, adLibraryUrl: `https://www.linkedin.com/ad-library/detail/${adId}`, ...extra })
  const [s, ...resto] = anuncioLinkedin.sinais([semData('1'), semData('2'), semData('3', { advertiserName: 'Outra Empresa', advertiserUrl: 'https://www.linkedin.com/company/999', clickUrl: 'https://outra.com' })], CONTA, CRITERIOS, AGORA)
  assertEquals(resto, [])
  assertEquals(s.eventKey, 'anuncio_linkedin|1234567|2026-09')
  assertEquals(s.phrase, 'Anunciando no LinkedIn: 2 anúncios nos últimos 30 dias')
  assertEquals(s.firedAt, new Date(AGORA).toISOString())
  assertEquals(s.source, 'Biblioteca de anúncios do LinkedIn')
  assert(s.evidence!.includes('a biblioteca não informa a data de início'))
  assert(s.evidence!.includes('https://www.linkedin.com/ad-library/detail/1'))
  // Com palavras no formulário, o filtro de texto continua valendo para o anúncio sem data.
  assertEquals(anuncioLinkedin.sinais([semData('1')], CONTA, { ...CRITERIOS, palavras: 'varejo' }, AGORA), [])
})

Deno.test('Meta: a regra de data segue igual, anúncio sem data de início continua de fora', () => {
  assertEquals(anuncioMeta.sinais([itemDaMeta({ start_date: undefined, start_date_formatted: undefined })], CONTA, CRITERIOS, AGORA), [])
})

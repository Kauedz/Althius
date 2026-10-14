// O adaptador do Google (PR-7) com resultados de exemplo no formato do README do solidcode/ads-transparency-scraper.
// Empresas, anunciantes e anúncios são fictícios: nenhum dado pessoal real.
import { assertEquals, assertThrows } from 'jsr:@std/assert@1'
import { type ContaParaVarrer, SemDadoParaVarrer } from '../handler.ts'
import { anuncioGoogle, MAX_ITENS } from './anuncio-google.ts'

const AGORA = Date.parse('2026-10-14T12:00:00Z')
const CONTA: ContaParaVarrer = { id: 'conta-1', name: 'Acme Logística S.A.', domain: 'https://www.acmelog.com.br/', linkedinUrl: null }
const SEM_SITE: ContaParaVarrer = { ...CONTA, domain: null }
const CRITERIOS = { localizacao: ['Brasil'], periodo: 'Últimos 30 dias', palavras: '' }

let seq = 0
const item = (firstShown: string, adFormat = 'text', extra: Record<string, unknown> = {}) => ({
  advertiserId: 'AR00000000000000000001',
  advertiserName: 'Acme Logística Ltda',
  creativeId: `CR0000000000000000000${++seq}`,
  adFormat,
  firstShown,
  lastShown: '2026-10-13',
  approxDaysShown: 10,
  adUrl: `https://adstransparency.google.com/advertiser/AR00000000000000000001/creative/CR0000000000000000000${seq}`,
  previewUrl: 'https://displayads-formats.googleusercontent.com/ads/preview/content.js?exemplo',
  ...extra,
})

Deno.test('entrada: busca pelo domínio da Conta no país da Localização, com o limite de anúncios', () => {
  assertEquals(anuncioGoogle.entrada(CONTA, CRITERIOS, AGORA), {
    input: { searchQuery: 'acmelog.com.br', region: 'BR', maxResults: MAX_ITENS },
    maxItems: MAX_ITENS,
  })
  assertEquals(anuncioGoogle.entrada(CONTA, { localizacao: ['Chile'] }, AGORA).input.region, 'CL')
})

Deno.test('entrada: sem site, busca pelo nome sem a forma jurídica; sem nome nem site, a Conta é pulada', () => {
  assertEquals(anuncioGoogle.entrada(SEM_SITE, CRITERIOS, AGORA).input.searchQuery, 'Acme Logística')
  assertThrows(() => anuncioGoogle.entrada({ ...SEM_SITE, name: '' }, CRITERIOS, AGORA), SemDadoParaVarrer)
})

Deno.test('primeiro anúncio visto no período vira um Sinal só, com a data do mais antigo', () => {
  const sinais = anuncioGoogle.sinais(
    [item('2026-10-02', 'text'), item('2026-09-28', 'video'), item('2026-10-05', 'image'), { error: 'falhou' }],
    CONTA, CRITERIOS, AGORA,
  )
  assertEquals(sinais.length, 1)
  assertEquals(sinais[0].eventKey, 'anuncio_google|AR00000000000000000001|primeiro')
  assertEquals(sinais[0].phrase, 'Começou a anunciar no Google: 3 anúncios desde 28/09/2026')
  assertEquals(sinais[0].firedAt, '2026-09-28T00:00:00.000Z')
  assertEquals(sinais[0].source, 'Central de Transparência de Anúncios do Google')
  assertEquals(sinais[0].evidence?.includes('Formatos: YouTube, Pesquisa, Display.'), true)
  assertEquals(sinais[0].evidence?.includes('https://adstransparency.google.com/advertiser/'), true)
})

Deno.test('quem já anunciava: só o formato novo no período vira Sinal', () => {
  const sinais = anuncioGoogle.sinais(
    [item('2026-03-01', 'text'), item('2026-10-01', 'text'), item('2026-10-03', 'video'), item('2026-10-08', 'video'), item('2026-05-01', 'image')],
    CONTA, CRITERIOS, AGORA,
  )
  assertEquals(sinais.map((s) => [s.eventKey, s.phrase]), [
    ['anuncio_google|AR00000000000000000001|formato:youtube', 'Novo formato de anúncio no Google: YouTube desde 03/10/2026'],
  ])
})

Deno.test('anúncios antigos sem formato novo não viram Sinal; item sem data ou sem id é ignorado', () => {
  assertEquals(anuncioGoogle.sinais([item('2026-01-10', 'text'), item('2026-10-10', 'text')], CONTA, CRITERIOS, AGORA), [])
  assertEquals(anuncioGoogle.sinais([item('', 'text'), { ...item('2026-10-10'), creativeId: '' }], CONTA, CRITERIOS, AGORA), [])
})

Deno.test('o período do Monitoramento conta: 7 dias deixa de fora o anúncio de 20 dias atrás', () => {
  assertEquals(anuncioGoogle.sinais([item('2026-09-24')], CONTA, { periodo: 'Últimos 7 dias' }, AGORA), [])
  assertEquals(anuncioGoogle.sinais([item('2026-09-24')], CONTA, CRITERIOS, AGORA).length, 1)
})

Deno.test('na busca por nome, só conta o anunciante com o nome da Conta', () => {
  const outro = item('2026-10-01', 'text', { advertiserId: 'AR00000000000000000009', advertiserName: 'Acme Seguros' })
  const sinais = anuncioGoogle.sinais([outro, item('2026-10-02')], SEM_SITE, CRITERIOS, AGORA)
  assertEquals(sinais.map((s) => s.eventKey), ['anuncio_google|AR00000000000000000001|primeiro'])
  // Na busca pelo domínio, os anunciantes que levam ao site contam, um Sinal por anunciante.
  assertEquals(anuncioGoogle.sinais([outro, item('2026-10-02')], CONTA, CRITERIOS, AGORA).length, 2)
})

Deno.test('o mesmo anúncio repetido conta uma vez', () => {
  const a = item('2026-10-02')
  const sinais = anuncioGoogle.sinais([a, a], CONTA, CRITERIOS, AGORA)
  assertEquals(sinais[0].phrase, 'Começou a anunciar no Google: 1 anúncio desde 02/10/2026')
})

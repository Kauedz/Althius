// O adaptador de avaliações no Google Maps (sinais-reais 06) com resultados de exemplo no formato do README do
// compass/google-maps-reviews-scraper. Lugares, pessoas e avaliações são fictícios: nenhum dado pessoal real.
import { assert, assertEquals, assertThrows } from 'jsr:@std/assert@1'
import { type ContaParaVarrer, SemDadoParaVarrer } from '../handler.ts'
import { avaliacoesGoogleMaps, nomeParaBusca } from './avaliacoes-google-maps.ts'

const AGORA = Date.parse('2026-09-30T12:00:00Z')
const CONTA: ContaParaVarrer = {
  id: 'conta-1',
  name: 'Acme Logística S.A.',
  domain: 'acmelog.com.br',
  linkedinUrl: 'https://www.linkedin.com/company/acme-logistica/',
}
const CRITERIOS = { nota: 'Até 2 estrelas', periodo: 'Últimos 30 dias' }
const PLACE_ID = 'ChIJAcmeAcmeAcmeAcmeAcmeAc0'

// Uma avaliação como a do README, com os campos de quem avaliou preenchidos (como vêm quando `personalData` fica ligado).
let sequencia = 0
const avaliacao = (dia: string, stars: number, text: string, extra: Record<string, unknown> = {}) => {
  sequencia++
  return {
    searchString: 'Acme Logística',
    reviewerId: `99000000000000000${sequencia}`,
    reviewerUrl: `https://www.google.com/maps/contrib/99000000000000000${sequencia}?hl=pt-BR`,
    name: `Pessoa Fictícia ${sequencia}`,
    reviewerNumberOfReviews: 7,
    isLocalGuide: false,
    reviewerPhotoUrl: `https://lh3.googleusercontent.com/a-/FOTO-FICTICIA-${sequencia}=s120`,
    text,
    textTranslated: null,
    publishAt: 'há uma semana',
    publishedAtDate: `${dia}T14:00:00.000Z`,
    likesCount: 0,
    reviewId: `Ci9REVIEW-FICTICIO-${sequencia}`,
    reviewUrl: `https://www.google.com/maps/reviews/data=!4m8!14m7!1m6!2m5!1sREVIEW-FICTICIO-${sequencia}?hl=pt-BR`,
    reviewOrigin: 'Google',
    stars,
    rating: null,
    responseFromOwnerDate: null,
    responseFromOwnerText: null,
    reviewImageUrls: [`https://lh3.googleusercontent.com/geougc-cs/IMAGEM-FICTICIA-${sequencia}`],
    reviewContext: {},
    reviewDetailedRating: {},
    visitedIn: null,
    originalLanguage: 'pt',
    translatedLanguage: null,
    isAdvertisement: false,
    placeId: PLACE_ID,
    location: { lat: -23.55, lng: -46.63 },
    address: 'Av. Fictícia, 100 - São Paulo - SP',
    city: 'São Paulo',
    countryCode: 'BR',
    categoryName: 'Empresa de logística',
    categories: ['Empresa de logística'],
    title: 'Acme Logística',
    totalScore: 4.5,
    permanentlyClosed: false,
    temporarilyClosed: false,
    reviewsCount: 1234,
    url: `https://www.google.com/maps/search/?api=1&query=Acme%20Log%C3%ADstica&query_place_id=${PLACE_ID}`,
    price: null,
    cid: '1111111111111111111',
    fid: '0x94ce59aaaaaaaaaa:0x1111111111111111',
    scrapedAt: '2026-09-30T11:00:00.000Z',
    language: 'pt-BR',
    ...extra,
  }
}

const reclamacoesDeAtendimento = () => [
  avaliacao('2026-09-05', 1, 'Péssimo atendimento, ninguém resolve nada.'),
  avaliacao('2026-09-12', 2, 'O atendente foi grosseiro no telefone.'),
  avaliacao('2026-09-20', 1, 'Atendimento horrível, esperei e desisti.'),
  avaliacao('2026-09-26', 2, 'Falta de respeito com o cliente, atendimento lento.'),
]

Deno.test('entrada: busca o nome da Conta no Maps, mais novas primeiro, só o período, em pt-BR e sem dado pessoal', () => {
  const { input, maxItems } = avaliacoesGoogleMaps.entrada(CONTA, CRITERIOS, AGORA)
  const [inicial, ...resto] = input.startUrls as { url: string }[]
  assertEquals(resto, [])
  const url = new URL(inicial.url)
  assertEquals(`${url.origin}${url.pathname}`, 'https://www.google.com/maps/search/')
  assertEquals(url.searchParams.get('api'), '1')
  assertEquals(url.searchParams.get('query'), 'Acme Logística')
  assertEquals(input.personalData, false)
  assertEquals(input.reviewsSort, 'newest')
  assertEquals(input.reviewsStartDate, '30 days')
  assertEquals(input.language, 'pt-BR')
  assertEquals(input.reviewsOrigin, 'google')
  assertEquals(input.maxReviews, 50)
  assertEquals(maxItems, 100)
  assertEquals(avaliacoesGoogleMaps.entrada(CONTA, { ...CRITERIOS, periodo: 'Últimos 7 dias' }, AGORA).input.reviewsStartDate, '7 days')
  assertEquals(avaliacoesGoogleMaps.entrada(CONTA, {}, AGORA).input.reviewsStartDate, '30 days')
})

Deno.test('entrada: a forma jurídica sai do nome da busca; sem nome, a Conta é pulada', () => {
  assertEquals(nomeParaBusca('Banco do Brasil S/A'), 'Banco do Brasil')
  assertEquals(nomeParaBusca('Acme & Cia. Ltda'), 'Acme')
  assertEquals(nomeParaBusca('Coca-Cola'), 'Coca-Cola')
  assertEquals(nomeParaBusca('Acme Home'), 'Acme Home')
  assertThrows(() => avaliacoesGoogleMaps.entrada({ ...CONTA, name: '  ' }, CRITERIOS, AGORA), SemDadoParaVarrer)
})

Deno.test('reclamações repetidas: 3 ou mais negativas sobre o mesmo assunto viram um Sinal do assunto no mês', () => {
  const itens = [...reclamacoesDeAtendimento(), avaliacao('2026-09-10', 5, 'Ótimo lugar'), avaliacao('2026-09-11', 5, '')]
  const sinais = avaliacoesGoogleMaps.sinais(itens, CONTA, CRITERIOS, AGORA)
  const s = sinais.find((x) => x.eventKey.includes('|assunto|atendimento|'))!
  assertEquals(s.eventKey, `maps|${PLACE_ID}|assunto|atendimento|2026-09`)
  assertEquals(s.phrase, 'Reclamações repetidas sobre atendimento no Google Maps: 4 em 30 dias')
  // A data é a da avaliação que completou o mínimo de 3, em ordem de data.
  assertEquals(s.firedAt, '2026-09-20T14:00:00.000Z')
  assertEquals(s.source, 'Google Maps')
  assert(s.evidence!.startsWith('4 avaliações de até 2 estrelas sobre atendimento em 30 dias.'))
  assert(s.evidence!.includes('Acme Logística (https://www.google.com/maps/search/?api=1&query=Acme%20Log%C3%ADstica'))
  assert(s.evidence!.includes('6 avaliações no período, média 2,7; nota geral 4,5 em 1.234 avaliações'))
  // Os dois trechos mais recentes do grupo, e só eles.
  assert(s.evidence!.includes('"Falta de respeito com o cliente, atendimento lento."; "Atendimento horrível, esperei e desisti."'))
  assert(!s.evidence!.includes('Péssimo atendimento'))
})

Deno.test('reclamações repetidas: abaixo do mínimo, nenhum Sinal', () => {
  const [a, b] = reclamacoesDeAtendimento()
  assertEquals(avaliacoesGoogleMaps.sinais([a, b, avaliacao('2026-09-15', 5, 'Tudo certo')], CONTA, CRITERIOS, AGORA), [])
  assertEquals(avaliacoesGoogleMaps.sinais([], CONTA, CRITERIOS, AGORA), [])
})

Deno.test('queda de nota: 5 ou mais avaliações no período com média 1 estrela abaixo da nota geral', () => {
  const itens = [
    avaliacao('2026-09-03', 4, 'Bom'),
    avaliacao('2026-09-08', 3, 'Mediano'),
    avaliacao('2026-09-14', 4, 'Ok'),
    avaliacao('2026-09-18', 3, 'Poderia ser melhor'),
    avaliacao('2026-09-22', 2, 'Piorou muito'),
    avaliacao('2026-09-27', 4, 'Razoável'),
  ]
  const sinais = avaliacoesGoogleMaps.sinais(itens, CONTA, CRITERIOS, AGORA)
  const s = sinais.find((x) => x.eventKey.includes('|queda|'))!
  assertEquals(s.eventKey, `maps|${PLACE_ID}|queda|2026-09`)
  assertEquals(s.phrase, 'Nota em queda no Google Maps: média 3,3 em 30 dias, contra 4,5')
  // Até a 5ª a média era 3,2 (1,3 abaixo): foi ela que completou.
  assertEquals(s.firedAt, '2026-09-22T14:00:00.000Z')
  assert(s.evidence!.includes('6 avaliações no período, média 3,3; nota geral 4,5 em 1.234 avaliações'))
  assert(s.evidence!.includes('"Piorou muito"'))
  // Média 3,7 (0,8 abaixo) não é queda; 4 avaliações também não.
  const leve = itens.map((i) => (i.stars === 2 ? { ...i, stars: 4 } : i))
  assertEquals(avaliacoesGoogleMaps.sinais(leve, CONTA, CRITERIOS, AGORA).filter((x) => x.eventKey.includes('|queda|')), [])
  assertEquals(avaliacoesGoogleMaps.sinais(itens.slice(0, 4).map((i) => ({ ...i, stars: 1 })), CONTA, CRITERIOS, AGORA), [])
  // Sem nota geral, sem queda.
  const semNota = itens.map((i) => ({ ...i, totalScore: null }))
  assertEquals(avaliacoesGoogleMaps.sinais(semNota, CONTA, CRITERIOS, AGORA).filter((x) => x.eventKey.includes('|queda|')), [])
})

Deno.test('muitas negativas: 5 ou mais no período e a maioria dele, mesmo sem assunto em comum', () => {
  const negativas = ['Não gostei', 'Decepcionante', 'Nunca mais', 'Horrível', 'Não recomendo'].map((t, i) =>
    avaliacao(`2026-09-${String(10 + i).padStart(2, '0')}`, 1, t)
  )
  const boas = [avaliacao('2026-09-01', 5, 'Bom'), avaliacao('2026-09-02', 5, 'Bom')]
  const sinais = avaliacoesGoogleMaps.sinais([...boas, ...negativas], CONTA, CRITERIOS, AGORA)
  const s = sinais.find((x) => x.eventKey.includes('|negativas|'))!
  assertEquals(s.eventKey, `maps|${PLACE_ID}|negativas|2026-09`)
  assertEquals(s.phrase, 'Muitas avaliações negativas no Google Maps: 5 de 7 em 30 dias')
  assertEquals(s.firedAt, '2026-09-14T14:00:00.000Z')
  // Nenhum assunto do dicionário nesses textos.
  assertEquals(sinais.filter((x) => x.eventKey.includes('|assunto|')), [])
  // 5 negativas entre 11 avaliações não são a maioria.
  const muitasBoas = Array.from({ length: 6 }, (_, i) => avaliacao(`2026-09-0${i + 1}`, 5, 'Bom'))
  const diluido = avaliacoesGoogleMaps.sinais([...muitasBoas, ...negativas], CONTA, CRITERIOS, AGORA)
  assertEquals(diluido.filter((x) => x.eventKey.includes('|negativas|')), [])
})

Deno.test('outro lugar com nome parecido não é a Conta; a unidade com separador é', () => {
  const comTitulo = (title: string, placeId: string) => reclamacoesDeAtendimento().map((i) => ({ ...i, title, placeId }))
  const parecidos = [
    ...comTitulo('Acme Logística Express', 'ChIJOutro00000000000000001'),
    ...comTitulo('Transportes Acme Logística', 'ChIJOutro00000000000000002'),
    ...comTitulo('Acme', 'ChIJOutro00000000000000003'),
  ]
  assertEquals(avaliacoesGoogleMaps.sinais(parecidos, CONTA, CRITERIOS, AGORA), [])
  for (const title of ['Acme Logística - Unidade Centro', 'Acme Logística | Filial Campinas', 'ACME LOGISTICA (Matriz)']) {
    const [s] = avaliacoesGoogleMaps.sinais(comTitulo(title, 'ChIJUnidade0000000000000001'), CONTA, CRITERIOS, AGORA)
    assertEquals(s?.eventKey, 'maps|ChIJUnidade0000000000000001|assunto|atendimento|2026-09', title)
    assert(s.evidence!.includes(title))
  }
})

Deno.test('o site do lugar, quando vem, decide: outro domínio não é a Conta, o mesmo é, rede social não conta', () => {
  const comSite = (title: string, website: string) =>
    avaliacoesGoogleMaps.sinais(reclamacoesDeAtendimento().map((i) => ({ ...i, title, website })), CONTA, CRITERIOS, AGORA)
  assertEquals(comSite('Acme Logística', 'https://acme-outra.com.br'), [])
  assertEquals(comSite('Acme Log CD Sul', 'https://www.acmelog.com.br/cd').length, 1)
  assertEquals(comSite('Acme Logística', 'https://instagram.com/acmelog').length, 1)
})

Deno.test('avaliações fora do período ou sem data não contam', () => {
  const antigas = reclamacoesDeAtendimento().map((i) => ({ ...i, publishedAtDate: '2026-07-15T10:00:00.000Z' }))
  assertEquals(avaliacoesGoogleMaps.sinais(antigas, CONTA, CRITERIOS, AGORA), [])
  const semData = reclamacoesDeAtendimento().map((i) => ({ ...i, publishedAtDate: null }))
  assertEquals(avaliacoesGoogleMaps.sinais(semData, CONTA, CRITERIOS, AGORA), [])
  // Em 7 dias, só a de 26/09 está no período.
  const seteDias = { ...CRITERIOS, periodo: 'Últimos 7 dias' }
  assertEquals(avaliacoesGoogleMaps.sinais(reclamacoesDeAtendimento(), CONTA, seteDias, AGORA), [])
})

Deno.test('o filtro de nota: até 2, até 3 ou qualquer nota', () => {
  const tres = [
    avaliacao('2026-09-05', 3, 'Atendimento confuso.'),
    avaliacao('2026-09-12', 3, 'Atendimento demorado.'),
    avaliacao('2026-09-20', 3, 'Atendimento mediano.'),
  ]
  assertEquals(avaliacoesGoogleMaps.sinais(tres, CONTA, CRITERIOS, AGORA), [])
  const [ate3] = avaliacoesGoogleMaps.sinais(tres, CONTA, { ...CRITERIOS, nota: 'Até 3 estrelas' }, AGORA)
  assertEquals(ate3.phrase, 'Reclamações repetidas sobre atendimento no Google Maps: 3 em 30 dias')
  assert(ate3.evidence!.startsWith('3 avaliações de até 3 estrelas sobre atendimento'))
  // Qualquer nota: o assunto repetido vira Sinal, mas a frase não chama de reclamação; e sem nota, vale até 2 estrelas.
  const elogios = tres.map((i) => ({ ...i, stars: 5 }))
  const qualquer = avaliacoesGoogleMaps.sinais(elogios, CONTA, { ...CRITERIOS, nota: 'Qualquer nota' }, AGORA)
  assertEquals(qualquer.map((s) => s.phrase), ['Avaliações repetidas sobre atendimento no Google Maps: 3 em 30 dias'])
  assertEquals(avaliacoesGoogleMaps.sinais(tres, CONTA, { periodo: 'Últimos 30 dias' }, AGORA), [])
})

Deno.test('palavras: cada uma vira um assunto extra, com a própria chave', () => {
  const itens = [
    avaliacao('2026-09-05', 1, 'O estacionamento vive lotado.'),
    avaliacao('2026-09-12', 2, 'Sem estacionamento para visitantes.'),
    avaliacao('2026-09-20', 1, 'Estacionamento caríssimo.'),
  ]
  assertEquals(avaliacoesGoogleMaps.sinais(itens, CONTA, CRITERIOS, AGORA), [])
  const sinais = avaliacoesGoogleMaps.sinais(itens, CONTA, { ...CRITERIOS, palavras: 'Estacionamento, portaria' }, AGORA)
  assertEquals(sinais.map((s) => s.eventKey), [`maps|${PLACE_ID}|assunto|estacionamento|2026-09`])
  assertEquals(sinais[0].phrase, 'Reclamações repetidas sobre Estacionamento no Google Maps: 3 em 30 dias')
})

Deno.test('nenhum dado de quem avaliou (nome, id, URL, foto) nem o link da avaliação aparece em nenhum Sinal', () => {
  const itens = [
    ...reclamacoesDeAtendimento(),
    avaliacao('2026-09-06', 1, 'Cobrança indevida na fatura.'),
    avaliacao('2026-09-07', 1, 'Cobraram taxa que não existia.'),
    avaliacao('2026-09-08', 2, 'Preço abusivo.'),
    avaliacao('2026-09-09', 1, 'Demora absurda na entrega.'),
  ]
  const sinais = avaliacoesGoogleMaps.sinais(itens, CONTA, CRITERIOS, AGORA)
  assert(sinais.length >= 3)
  const tudo = JSON.stringify(sinais)
  for (const item of itens) {
    for (const campo of ['name', 'reviewerId', 'reviewerUrl', 'reviewerPhotoUrl', 'reviewId', 'reviewUrl'] as const) {
      assert(!tudo.includes(item[campo]), `${campo} apareceu num Sinal`)
    }
    assert(!tudo.includes(item.reviewImageUrls[0]))
  }
  assert(!tudo.includes('Pessoa Fictícia') && !tudo.includes('contrib') && !tudo.includes('googleusercontent'))
})

Deno.test('itens que não são avaliação, anúncios e a mesma avaliação repetida não contam; textos cabem no banco', () => {
  const [a, b, c] = reclamacoesDeAtendimento()
  const anuncio = { ...c, reviewId: 'Ci9ANUNCIO', isAdvertisement: true }
  assertEquals(avaliacoesGoogleMaps.sinais([a, b, b, anuncio, 'erro', null, { error: 'timeout' }], CONTA, CRITERIOS, AGORA), [])
  const longas = reclamacoesDeAtendimento().map((i) => ({
    ...i,
    text: `Atendimento ${'ruim '.repeat(300)}`,
    title: `Acme Logística - ${'x'.repeat(400)}`,
  }))
  const [s] = avaliacoesGoogleMaps.sinais(longas, CONTA, CRITERIOS, AGORA)
  assert(s.phrase.length <= 300 && s.eventKey.length <= 300 && s.evidence!.length <= 2000)
  const trechos = [...s.evidence!.matchAll(/"([^"]*)"/g)].map((m) => m[1])
  assertEquals(trechos.length, 2)
  assert(trechos.every((t) => t.length <= 120))
})

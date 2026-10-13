// ICP F (logística e transporte), de ponta a ponta: o motor, os passos reais do registro e o cliente do Apify contra um Apify
// falso (nunca a rede). Quatro Sinais do Mapa de Mercado:
//   novo_cd_ou_filial              diff mensal da rede de filiais por CNPJ + reforço por notícia
//   troca_de_sede                  diff mensal do endereço da matriz por CNPJ
//   vaga_logistica                 a mesma cascata do A1 com os termos de logística
//   crescimento_comex_embarcador   sem fonte (a lista anual do MDIC por CNPJ não é mais aberta)
// Os formatos de resposta são os publicados: BRANCH_MAP do mapa de filiais (README do actor, 13/10/2026), o registro da
// consulta de CNPJ e a BrasilAPI (resposta real conferida em 13/10/2026).
import { assert, assertEquals } from 'jsr:@std/assert@1'
import { apifyFalso, type ComportamentoDoRun } from '../falso-apify.ts'
import { dbFalso } from '../db-falso.ts'
import { clienteAssincronoDoApify } from '../fonte-apify.ts'
import { rodarCascata } from '../motor.ts'
import { registroDePassos } from './index.ts'
import type { CascataDef, ContaDoWorkspace } from '../tipos.ts'
import { MARCA_INTERNA } from '../../marca.ts'
import {
  cascataCrescimentoComexEmbarcador,
  cascataNovoCdOuFilial,
  cascataTrocaDeSede,
  cascataVagaLogistica,
  MOTIVO_SEM_FONTE_COMEX_DO_EMBARCADOR,
  piorCasoUsd,
} from './icp-f-fixtures.ts'

const AGORA = Date.parse('2026-10-13T12:00:00Z')
const TOKEN = 'apify_api_TOKEN_DO_TESTE_0123456789'
const DIA = 86_400_000
const dias = (n: number) => new Date(AGORA - n * DIA).toISOString()
const dia = (n: number) => dias(n).slice(0, 10)

/** O CNPJ da matriz de uma raiz de 8 dígitos (regra do módulo 11), escrita aqui à parte do código sob teste. */
function matrizDaRaiz(raiz: string): string {
  const dv = (s: string, pesos: number[]) => {
    const resto = [...s].reduce((soma, c, i) => soma + (c.charCodeAt(0) - 48) * pesos[i], 0) % 11
    return resto < 2 ? 0 : 11 - resto
  }
  const base = `${raiz}0001`
  const d1 = dv(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const d2 = dv(`${base}${d1}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return `${base}${d1}${d2}`
}

const ALFA: ContaDoWorkspace = {
  id: 'conta-alfa', name: 'Alfa Importadora S.A.', domain: 'alfa.test', linkedinUrl: 'https://www.linkedin.com/company/alfa-importadora', cnpj: '11.222.333/0001-81',
}
const BETA: ContaDoWorkspace = { id: 'conta-beta', name: 'Beta Trading', domain: 'beta.test', linkedinUrl: null, cnpj: null }
const MATRIZ_ALFA = '11222333000181'

type Foto = { takenAt: string; data: Record<string, unknown> }
const foto = (diasAtras: number, data: Record<string, unknown>): Foto => ({ takenAt: dias(diasAtras), data })

function cenario(
  def: CascataDef,
  porActor: Record<string, ComportamentoDoRun>,
  opcoes: { contas?: ContaDoWorkspace[]; fotografias?: Record<string, Foto[]>; brasilapi?: (url: string) => Response } = {},
) {
  const fake = apifyFalso((_token, actorId) => porActor[actorId] ?? { itens: [], usageTotalUsd: 0 })
  const logs: unknown[] = []
  const fonte = clienteAssincronoDoApify({ tokens: [TOKEN], fetchFn: fake.fetchFn, dormir: () => Promise.resolve(), esperaDoCustoMs: 0, log: (c) => logs.push(c) })
  const publicas: string[] = []
  const fetchPublico = ((entrada: string | URL | Request) => {
    publicas.push(String(entrada))
    return Promise.resolve(opcoes.brasilapi ? opcoes.brasilapi(String(entrada)) : new Response('{}', { status: 404 }))
  }) as typeof fetch
  const banco = dbFalso(def, { contas: opcoes.contas ?? [ALFA, BETA], fotografias: opcoes.fotografias })
  const rodar = (extra: Record<string, unknown> = {}) =>
    rodarCascata({ db: banco.db, fonte, registro: registroDePassos(fetchPublico), agora: () => AGORA, log: (c) => logs.push(c) }, {
      workspaceId: 'ws-1', userId: 'user-1', signalType: def.signalType, origem: 'conversa', chave: 'k1', ...extra,
    })
  const posts = () => fake.requisicoes.filter((q) => q.metodo === 'POST')
  return { fake, banco, rodar, logs, publicas, posts }
}

// ---------------------------------------------------------------------------------------------------------------------
// F1 · Novo CD ou filial

const filial = (cnpj: string, uf: string, inicio: string | null, extra: Record<string, unknown> = {}) => ({
  cnpj, cnpjFormatado: '', uf, municipioCodigo: '8161', cnaePrincipal: '4691500', situacaoCodigo: '02', situacao: 'ATIVA', dataInicio: inicio, ...extra,
})
const mapa = (raiz: string, filiais: ReturnType<typeof filial>[], extra: Record<string, unknown> = {}) => ({
  recordType: 'BRANCH_MAP', raiz, entradaOriginal: raiz, cnpjMatrizCalculado: matrizDaRaiz(raiz), raizAtestadaPeloIndice: filiais.length > 0,
  totalFiliais: filiais.length, filiaisAtivas: filiais.filter((f) => f.situacao === 'ATIVA').length, porUf: {}, porSituacao: {}, filiais,
  versaoDosDados: { snapshotMonth: '2026-08', referenceMonth: '2026-07', builtAt: '2026-08-31T23:22:20.138Z' },
  staleness: { indexMonth: '2026-07', expectedMonth: '2026-07', stale: false }, observedAt: dias(0), ...extra,
})
const RESUMO = { recordType: 'RUN_SUMMARY', recordsWritten: 1, unitsRequested: 1, unitsOk: 1, unitsFailed: 0 }
const BRANCH = 'johnatan029~branch-network'
const NEWS = 'data_xplorer~google-news-scraper-fast'

Deno.test('F1: a primeira rodada só grava a base (filiais ativas pelos 14 dígitos), sem Sinal e sem consultar notícia', async () => {
  const c = cenario(cascataNovoCdOuFilial(), {
    [BRANCH]: {
      itens: [
        mapa('11222333', [
          filial('11222333000343', 'SC', dia(40)), filial('11222333000262', 'SP', dia(400)), filial('11222333000424', 'RJ', dia(30), { situacao: 'BAIXADA', situacaoCodigo: '08' }),
        ]),
        RESUMO,
      ],
      usageTotalUsd: 0.0101,
    },
  }, { contas: [ALFA, BETA] })
  const r = await c.rodar()

  assertEquals([r.desfecho, r.novos, r.sinais.length], ['concluida', 0, 0])
  // Só a Conta com CNPJ vai ao mapa de filiais, pela matriz.
  assertEquals(c.posts().length, 1, 'sem Sinal, a notícia não roda')
  assertEquals(c.posts()[0].caminho.split('/')[3], BRANCH)
  assertEquals(c.posts()[0].corpo, { cnpjs: [MATRIZ_ALFA], maxResults: 1 })
  // A fotografia: as filiais ATIVAS (a baixada fica de fora), pelo número de 14 dígitos, em ordem.
  assertEquals(c.banco.gravadas.length, 1)
  assertEquals(c.banco.gravadas[0].chave, MATRIZ_ALFA)
  assertEquals(c.banco.gravadas[0].data, { raiz: '11222333', filiais: ['11222333000262', '11222333000343'], ativas: 2, indice: '2026-07' })
  assertEquals(c.banco.passos.map((p) => [p.ordem, p.handler, p.fim?.estado]), [
    [1, 'logistica_escolher_raizes', 'succeeded'],
    [2, 'logistica_filiais_da_raiz', 'succeeded'],
    [3, 'logistica_novas_filiais', 'empty'],
  ])
  assertEquals(c.banco.fechamentos[0].custoUsd, 0.0101)
})

const MAPA_DA_SEGUNDA_RODADA = [
  mapa('11222333', [
    filial('11222333000262', 'SP', dia(500)), // já estava na base
    filial('11222333000343', 'SC', dia(40), { cnaePrincipal: '5211799' }), // nova, depósito de mercadorias para terceiros
    filial('11222333000424', 'SP', dia(55)), // nova
    filial('11222333000505', 'MG', dia(20), { situacao: 'BAIXADA', situacaoCodigo: '08' }), // nova, mas baixada
    filial('11222333000586', 'PR', dia(900)), // nova na base, mas aberta há muito: atraso do índice, não Sinal
  ]),
  RESUMO,
]
const BASE_ANTERIOR = { raiz: '11222333', filiais: ['11222333000262'], ativas: 1, indice: '2026-06' }
const NOTICIA = (extra: Record<string, unknown>) => ({
  title: 'Alfa Importadora inaugura novo centro de distribuição em Santa Catarina', source: 'Valor Econômico',
  url: 'https://news.google.com/rss/articles/CBMiXYZ', publishedAt: dias(5), description: '', metadata: { keyword: '"Alfa Importadora" "novo centro de distribuição"' }, ...extra,
})

Deno.test('F1: filiais ativas novas desde a rodada anterior viram um Sinal da Conta, e a notícia reforça a evidência', async () => {
  const c = cenario(cascataNovoCdOuFilial(), {
    [BRANCH]: { itens: MAPA_DA_SEGUNDA_RODADA, usageTotalUsd: 0.0101 },
    [NEWS]: {
      itens: [
        NOTICIA({}),
        NOTICIA({ title: 'Beta Trading abre novo centro de distribuição', source: 'Outro Jornal', url: 'https://news.google.com/rss/articles/OUTRA', metadata: { keyword: '"Beta Trading" "novo centro de distribuição"' } }),
        NOTICIA({ title: 'Alfa Importadora inaugurou centro de distribuição', source: 'Jornal Antigo', url: 'https://news.google.com/rss/articles/VELHA', publishedAt: dias(70) }),
        NOTICIA({ title: 'Alfa Importadora lança nova linha de produtos', source: 'Jornal Sem CD', url: 'https://news.google.com/rss/articles/SEMCD' }),
      ],
      usageTotalUsd: 0.016,
    },
  }, { fotografias: { [MATRIZ_ALFA]: [foto(30, BASE_ANTERIOR)] } })
  const r = await c.rodar()

  assertEquals([r.desfecho, r.novos], ['concluida', 1])
  const s = r.sinais[0]
  assertEquals(s.contaId, 'conta-alfa')
  assertEquals(s.phrase, 'Abriu 2 novas filiais, 1 de armazenagem (possível centro de distribuição) em SC, SP')
  assertEquals(s.eventKey, 'alfa importadora|filiais|2026-07|11222333000343|2')
  assertEquals(s.firedAt, new Date(AGORA).toISOString())
  assertEquals(s.source, 'Receita Federal (dados abertos)')
  assert(s.evidence.includes('11.222.333/0003-43 (SC, CNAE 5211799, início em'), s.evidence)
  assert(s.evidence.includes('11.222.333/0004-24 (SP, CNAE 4691500, início em'), s.evidence)
  assert(!s.evidence.includes('0005-05') && !s.evidence.includes('0005-86'), 'filial baixada ou aberta há muito não conta')
  assert(s.evidence.includes('A rede passou de 1 para 4 filiais ativas.'), s.evidence)
  // O reforço da notícia: a fonte, a data e o link; nunca a manchete (pode citar pessoa).
  assert(s.evidence.includes('Valor Econômico') && s.evidence.includes('https://news.google.com/rss/articles/CBMiXYZ'), s.evidence)
  assert(!s.evidence.includes('inaugura') && !s.evidence.includes('Jornal Antigo') && !s.evidence.includes('Outro Jornal') && !s.evidence.includes('Sem CD'), s.evidence)
  // A busca de notícia: só a Conta com Sinal, o termo do Mapa, últimos 30 dias, Brasil.
  assertEquals(c.posts()[1].corpo, {
    keywords: ['"Alfa Importadora" "novo centro de distribuição"'], maxArticles: 3, timeframe: '30d', region_language: 'BR:pt-419',
    decodeUrls: false, extractDescriptions: false, extractImages: false,
  })
  // A fotografia nova substitui a base.
  assertEquals(c.banco.gravadas[0].data, { raiz: '11222333', filiais: ['11222333000262', '11222333000343', '11222333000424', '11222333000586'], ativas: 4, indice: '2026-07' })
  assertEquals(c.banco.passos.map((p) => [p.ordem, p.fim?.estado, p.fim?.custoUsd]), [[1, 'succeeded', 0], [2, 'succeeded', 0.0101], [3, 'succeeded', 0], [4, 'succeeded', 0.016]])
  assertEquals(r.custoUsd, 0.0261)
  assert(!MARCA_INTERNA.test(JSON.stringify(r)))
  assert(!MARCA_INTERNA.test(JSON.stringify(c.banco.gravadas)))
})

Deno.test('F1: a mesma rodada de novo (outra chave) não cria o Sinal duas vezes', async () => {
  const c = cenario(cascataNovoCdOuFilial(), { [BRANCH]: { itens: MAPA_DA_SEGUNDA_RODADA, usageTotalUsd: 0.01 } }, {
    fotografias: { [MATRIZ_ALFA]: [foto(30, BASE_ANTERIOR)] },
  })
  const a = await c.rodar({ chave: 'a' })
  const b = await c.rodar({ chave: 'b' })
  assertEquals([a.novos, a.repetidos, b.novos, b.repetidos], [1, 0, 0, 1])
})

Deno.test('F1: a notícia que falha não derruba o Sinal: execução parcial, com o Sinal gravado', async () => {
  const c = cenario(cascataNovoCdOuFilial(), {
    [BRANCH]: { itens: MAPA_DA_SEGUNDA_RODADA, usageTotalUsd: 0.0101 },
    [NEWS]: { estados: ['FAILED'], mensagem: 'blocked', usageTotalUsd: 0 },
  }, { fotografias: { [MATRIZ_ALFA]: [foto(30, BASE_ANTERIOR)] } })
  const r = await c.rodar()
  assertEquals([r.desfecho, r.novos], ['parcial', 1])
  assertEquals(r.mensagem, 'A fonte pública está indisponível agora.')
  assert(!r.sinais[0].evidence.includes('news.google'), 'sem notícia, a evidência fica só com a Receita')
})

Deno.test('F1: a notícia sem nenhuma manchete que sirva deixa a evidência como estava', async () => {
  const c = cenario(cascataNovoCdOuFilial(), {
    [BRANCH]: { itens: MAPA_DA_SEGUNDA_RODADA, usageTotalUsd: 0.0101 },
    [NEWS]: { itens: [NOTICIA({ title: 'Alfa Importadora lança nova linha', url: 'https://news.google.com/rss/articles/SEMCD' })], usageTotalUsd: 0.004 },
  }, { fotografias: { [MATRIZ_ALFA]: [foto(30, BASE_ANTERIOR)] } })
  const r = await c.rodar()
  assertEquals([r.desfecho, r.novos], ['concluida', 1])
  assert(!r.sinais[0].evidence.includes('Notícia'), r.sinais[0].evidence)
})

Deno.test('F1: sem filial nova a fotografia se renova e nada é emitido', async () => {
  const c = cenario(cascataNovoCdOuFilial(), {
    [BRANCH]: { itens: [mapa('11222333', [filial('11222333000262', 'SP', dia(500))]), RESUMO], usageTotalUsd: 0.01 },
  }, { fotografias: { [MATRIZ_ALFA]: [foto(30, BASE_ANTERIOR)] } })
  const r = await c.rodar()
  assertEquals([r.desfecho, r.novos, c.posts().length], ['concluida', 0, 1])
  assertEquals(c.banco.gravadas.length, 1, 'a fotografia nova entra mesmo sem Sinal (é ela que mede o tempo da rotação)')
})

Deno.test('F1: rede grande demais para a fotografia guarda só a contagem e avisa quando a contagem sobe', async () => {
  const muitas = (n: number) => Array.from({ length: n }, (_, i) => filial(`1122233300${String(i + 2).padStart(4, '0')}`, 'SP', dia(500)))
  const primeira = cenario(cascataNovoCdOuFilial(), { [BRANCH]: { itens: [mapa('11222333', muitas(960))], usageTotalUsd: 0.01 } })
  await primeira.rodar()
  assertEquals(primeira.banco.gravadas[0].data, { raiz: '11222333', filiais: [], ativas: 960, indice: '2026-07', grande: true })

  const segunda = cenario(cascataNovoCdOuFilial(), { [BRANCH]: { itens: [mapa('11222333', muitas(975))], usageTotalUsd: 0.01 } }, {
    fotografias: { [MATRIZ_ALFA]: [foto(30, primeira.banco.gravadas[0].data)] },
  })
  const r = await segunda.rodar()
  assertEquals(r.novos, 1)
  assertEquals(r.sinais[0].phrase, 'A rede passou de 960 para 975 filiais ativas')
  assertEquals(r.sinais[0].eventKey, 'alfa importadora|filiais|2026-07|975')
})

Deno.test('F1: sem Conta com CNPJ não há consulta nem custo', async () => {
  const c = cenario(cascataNovoCdOuFilial(), {}, { contas: [BETA] })
  const r = await c.rodar()
  assertEquals([r.desfecho, r.novos, c.posts().length], ['concluida', 0, 0])
  assertEquals(c.banco.fechamentos[0].custoUsd, 0)
})

Deno.test('F1: cada rodada fotografa as Contas sem fotografia primeiro e depois as mais antigas, no máximo 35', async () => {
  const contas: ContaDoWorkspace[] = Array.from({ length: 45 }, (_, i) => ({
    id: `c${i}`, name: `Embarcador ${String(i).padStart(2, '0')} Ltda`, domain: null, linkedinUrl: null, cnpj: matrizDaRaiz(String(20000000 + i)),
  }))
  const chave = (i: number) => matrizDaRaiz(String(20000000 + i))
  // Sem fotografia nenhuma: as 35 primeiras (a lista vem ordenada por nome).
  const a = cenario(cascataNovoCdOuFilial(), {}, { contas })
  await a.rodar()
  assertEquals((a.posts()[0].corpo as { cnpjs: string[]; maxResults: number }).cnpjs, contas.slice(0, 35).map((_, i) => chave(i)))
  assertEquals((a.posts()[0].corpo as { maxResults: number }).maxResults, 35)

  // As 10 primeiras fotografadas há pouco, as outras 35 sem fotografia: vão as 35 sem fotografia.
  const recentes = Object.fromEntries(contas.slice(0, 10).map((_, i) => [chave(i), [foto(1, BASE_ANTERIOR)]]))
  const b = cenario(cascataNovoCdOuFilial(), {}, { contas, fotografias: recentes })
  await b.rodar()
  assertEquals((b.posts()[0].corpo as { cnpjs: string[] }).cnpjs, contas.slice(10).map((_, i) => chave(i + 10)))

  // Todas fotografadas: vão as 35 de fotografia mais antiga (a de índice maior é a mais antiga aqui).
  const todas = Object.fromEntries(contas.map((_, i) => [chave(i), [foto(i + 1, BASE_ANTERIOR)]]))
  const d = cenario(cascataNovoCdOuFilial(), {}, { contas, fotografias: todas })
  await d.rodar()
  assertEquals((d.posts()[0].corpo as { cnpjs: string[] }).cnpjs.slice().sort(), contas.slice(10).map((_, i) => chave(i + 10)).sort())
})

Deno.test('F1: duas Contas da mesma raiz fazem uma só consulta e cada uma recebe o seu Sinal', async () => {
  const irma: ContaDoWorkspace = { id: 'conta-alfa-log', name: 'Alfa Logística Ltda', domain: null, linkedinUrl: null, cnpj: '11222333000262' }
  const c = cenario(cascataNovoCdOuFilial(), { [BRANCH]: { itens: MAPA_DA_SEGUNDA_RODADA, usageTotalUsd: 0.0101 } }, {
    contas: [ALFA, irma], fotografias: { [MATRIZ_ALFA]: [foto(30, BASE_ANTERIOR)] },
  })
  const r = await c.rodar()
  assertEquals((c.posts()[0].corpo as { cnpjs: string[] }).cnpjs, [MATRIZ_ALFA])
  assertEquals(r.sinais.map((s) => s.contaId).sort(), ['conta-alfa', 'conta-alfa-log'])
})

Deno.test('F1: o mapa de filiais que falha não grava fotografia nem Sinal e a mensagem é do produto', async () => {
  const c = cenario(cascataNovoCdOuFilial(), { [BRANCH]: { estados: ['FAILED'], mensagem: 'index unavailable', usageTotalUsd: 0 } })
  const r = await c.rodar()
  assertEquals([r.desfecho, r.mensagem], ['falhou', 'A fonte pública está indisponível agora.'])
  assertEquals([c.banco.gravadas.length, c.banco.sinais.length], [0, 0])
  assertEquals(c.banco.passos.at(-1)?.fim?.erroReal, 'FAILED: index unavailable')
})

Deno.test('F1: o índice sem a raiz (resultado vazio) não apaga a base nem emite Sinal', async () => {
  const c = cenario(cascataNovoCdOuFilial(), { [BRANCH]: { itens: [RESUMO], usageTotalUsd: 0 } }, { fotografias: { [MATRIZ_ALFA]: [foto(30, BASE_ANTERIOR)] } })
  const r = await c.rodar()
  assertEquals([r.novos, c.banco.gravadas.length], [0, 0])
})

// ---------------------------------------------------------------------------------------------------------------------
// F2 · Troca de sede

const LOOKUP = 'johnatan029~cnpj-empresas-brasil-scraper'
const registro = (endereco: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  cnpj: MATRIZ_ALFA, razaoSocial: 'ALFA IMPORTADORA S/A', situacaoCadastral: 'ATIVA', porte: 'DEMAIS', cnaePrincipal: '4690099', endereco,
  socios: [{ nome: 'Fulano de Tal', qualificacao: 'Administrador' }], telefones: ['1133334444'], email: 'contato@alfa.test', ...extra,
})
const CAMPINAS = { logradouro: 'AVENIDA JOSE BONIFACIO', numero: '500', municipio: 'CAMPINAS', uf: 'SP', cep: '13015100', bairro: 'CENTRO' }

/** A fotografia que a rodada anterior teria gravado: a primeira rodada sobre o endereço dado. */
async function baseDaPrimeiraRodada(endereco: Record<string, unknown>): Promise<Record<string, unknown>> {
  const c = cenario(cascataTrocaDeSede(), { [LOOKUP]: { itens: [registro(endereco)], usageTotalUsd: 0.0016 } }, { contas: [ALFA] })
  await c.rodar()
  return c.banco.gravadas[0].data
}

Deno.test('F2: a primeira rodada só grava a base (município, UF e marcas do endereço), sem Sinal e sem dado pessoal', async () => {
  const c = cenario(cascataTrocaDeSede(), { [LOOKUP]: { itens: [registro(CAMPINAS)], usageTotalUsd: 0.0016 } }, { contas: [ALFA, BETA] })
  const r = await c.rodar()
  assertEquals([r.desfecho, r.novos, r.sinais.length], ['concluida', 0, 0])
  assertEquals(c.posts().length, 1)
  assertEquals(c.posts()[0].corpo, { mode: 'lookup', cnpjs: [MATRIZ_ALFA] })
  assertEquals(c.banco.gravadas.length, 1)
  assertEquals(c.banco.gravadas[0].chave, MATRIZ_ALFA)
  const data = c.banco.gravadas[0].data
  assertEquals([data.municipio, data.uf], ['CAMPINAS', 'SP'])
  const guardado = JSON.stringify(c.banco.gravadas)
  assert(!/bonif|500|13015100|centro|fulano|contato@|1133334444|razao|alfa/i.test(guardado), `a fotografia guarda texto de rua, sócio ou contato: ${guardado}`)
  assertEquals(c.banco.passos.map((p) => [p.ordem, p.handler, p.fim?.estado]), [
    [1, 'logistica_escolher_raizes', 'succeeded'],
    [2, 'logistica_endereco_da_matriz', 'succeeded'],
    [3, 'logistica_mudanca_de_sede', 'empty'],
  ])
})

Deno.test('F2: a sede em outro município vira Sinal, sem o endereço completo na frase nem na evidência', async () => {
  const base = await baseDaPrimeiraRodada(CAMPINAS)
  const c = cenario(cascataTrocaDeSede(), {
    [LOOKUP]: { itens: [registro({ logradouro: 'ALAMEDA ARAGUAIA', numero: '2104', municipio: 'BARUERI', uf: 'SP', cep: '06455000' })], usageTotalUsd: 0.0016 },
  }, { contas: [ALFA], fotografias: { [MATRIZ_ALFA]: [foto(30, base)] } })
  const r = await c.rodar()
  assertEquals([r.desfecho, r.novos], ['concluida', 1])
  const s = r.sinais[0]
  assertEquals(s.phrase, 'Trocou a sede de Campinas/SP para Barueri/SP')
  assert(s.eventKey.startsWith('alfa importadora|sede|SP|barueri|') && s.eventKey.endsWith('|2026-10'), s.eventKey)
  assertEquals(s.source, 'Receita Federal (dados abertos)')
  assert(s.evidence.includes('CNPJ 11.222.333/0001-81') && s.evidence.includes('Campinas/SP') && s.evidence.includes('Barueri/SP'), s.evidence)
  assert(s.evidence.includes('13/09/2026'), 'a evidência diz de quando é a consulta anterior')
  assert(!/araguaia|2104|06455000|fulano|contato@/i.test(JSON.stringify(r)), 'nem rua, nem número, nem CEP, nem sócio')
  assert(!MARCA_INTERNA.test(JSON.stringify(r)))
})

Deno.test('F2: a mudança de endereço dentro do mesmo município também é Sinal', async () => {
  const base = await baseDaPrimeiraRodada(CAMPINAS)
  const c = cenario(cascataTrocaDeSede(), { [LOOKUP]: { itens: [registro({ ...CAMPINAS, logradouro: 'RODOVIA ANHANGUERA', numero: 'KM 98' })], usageTotalUsd: 0.0016 } }, {
    contas: [ALFA], fotografias: { [MATRIZ_ALFA]: [foto(30, base)] },
  })
  const r = await c.rodar()
  assertEquals(r.sinais.map((s) => s.phrase), ['Mudou o endereço da sede, dentro de Campinas/SP'])
})

Deno.test('F2: o mesmo endereço escrito de outro jeito não é mudança; a fotografia se renova', async () => {
  const base = await baseDaPrimeiraRodada(CAMPINAS)
  const c = cenario(cascataTrocaDeSede(), {
    [LOOKUP]: { itens: [registro({ ...CAMPINAS, logradouro: 'Av. José Bonifácio', complemento: 'SALA 3' })], usageTotalUsd: 0.0016 },
  }, { contas: [ALFA], fotografias: { [MATRIZ_ALFA]: [foto(30, base)] } })
  const r = await c.rodar()
  assertEquals([r.novos, c.banco.gravadas.length], [0, 1])
})

Deno.test('F2: a Conta com o CNPJ de uma filial é consultada pela matriz da raiz', async () => {
  const filialDaAlfa: ContaDoWorkspace = { ...ALFA, cnpj: '34848473000246' }
  const c = cenario(cascataTrocaDeSede(), { [LOOKUP]: { itens: [], usageTotalUsd: 0 } }, { contas: [filialDaAlfa] })
  await c.rodar()
  assertEquals(c.posts()[0].corpo, { mode: 'lookup', cnpjs: ['34848473000165'] })
})

Deno.test('F2: a consulta cai para a BrasilAPI (formato real) quando o serviço de CNPJ falha, e o quadro societário nunca é lido', async () => {
  const base = await baseDaPrimeiraRodada(CAMPINAS)
  const brasilapi = (url: string) =>
    url.endsWith(`/${MATRIZ_ALFA}`)
      ? new Response(JSON.stringify({
        cnpj: MATRIZ_ALFA, razao_social: 'ALFA IMPORTADORA S/A', descricao_identificador_matriz_filial: 'MATRIZ', descricao_tipo_de_logradouro: 'ALAMEDA',
        logradouro: 'ARAGUAIA', numero: '2104', complemento: 'SALA 1', bairro: 'ALPHAVILLE', cep: '06455000', municipio: 'BARUERI', uf: 'SP', codigo_municipio: 3505,
        qsa: [{ nome_socio: 'BELTRANO DA SILVA', cnpj_cpf_do_socio: '***842999**' }], email: 'x@alfa.test',
      }), { status: 200 })
      : new Response('{}', { status: 404 })
  const c = cenario(cascataTrocaDeSede(), { [LOOKUP]: { estados: ['FAILED'], mensagem: 'boom', usageTotalUsd: 0 } }, {
    contas: [ALFA], fotografias: { [MATRIZ_ALFA]: [foto(30, base)] }, brasilapi,
  })
  const r = await c.rodar()
  assertEquals([r.desfecho, r.novos], ['concluida', 1])
  assertEquals(c.publicas, [`https://brasilapi.com.br/api/cnpj/v1/${MATRIZ_ALFA}`])
  assertEquals(r.sinais[0].phrase, 'Trocou a sede de Campinas/SP para Barueri/SP')
  assert(!/beltrano|842999|alphaville|x@alfa/i.test(JSON.stringify(r)) && !/beltrano|842999|alphaville/i.test(JSON.stringify(c.banco.gravadas)))
  assertEquals(c.banco.passos.filter((p) => p.ordem === 2).map((p) => [p.tentativa, p.handler, p.fim?.estado]), [
    [1, 'logistica_endereco_da_matriz', 'failed'],
    [2, 'logistica_brasilapi_matriz', 'succeeded'],
  ])
})

Deno.test('F2: a mesma troca de sede, rodada de novo no mês, conta uma vez só', async () => {
  const base = await baseDaPrimeiraRodada(CAMPINAS)
  const c = cenario(cascataTrocaDeSede(), { [LOOKUP]: { itens: [registro({ ...CAMPINAS, municipio: 'BARUERI' })], usageTotalUsd: 0.0016 } }, {
    contas: [ALFA], fotografias: { [MATRIZ_ALFA]: [foto(30, base)] },
  })
  const a = await c.rodar({ chave: 'a' })
  const b = await c.rodar({ chave: 'b' })
  assertEquals([a.novos, b.novos, b.repetidos], [1, 0, 1])
})

Deno.test('F2: endereço que a fonte não trouxe não apaga a base nem vira Sinal', async () => {
  const base = await baseDaPrimeiraRodada(CAMPINAS)
  const c = cenario(cascataTrocaDeSede(), { [LOOKUP]: { itens: [registro({})], usageTotalUsd: 0.0016 } }, { contas: [ALFA], fotografias: { [MATRIZ_ALFA]: [foto(30, base)] } })
  const r = await c.rodar()
  assertEquals([r.novos, c.banco.gravadas.length], [0, 0])
})

// ---------------------------------------------------------------------------------------------------------------------
// F3 · Vaga de logística (a cascata do A1 com os termos de F)

const vaga = (extra: Record<string, unknown>) => ({
  id: '3800000001', title: 'Analista de Logística Pleno', companyName: 'Alfa Importadora', location: 'Campinas, SP',
  companyLinkedinUrl: 'https://www.linkedin.com/company/alfa-importadora?trk=public_jobs', postedAt: dia(2),
  descriptionText: 'Rotina de roteirização e expedição.', seniorityLevel: 'Mid-Senior level', ...extra,
})
const JOBS = 'curious_coder~linkedin-jobs-scraper'
const COMPANY = 'harvestapi~linkedin-company'

Deno.test('F3: a vaga de logística de uma Conta vira Sinal; título de outra área, vaga velha e termo de comex não', async () => {
  const c = cenario(cascataVagaLogistica(), {
    [JOBS]: {
      itens: [
        vaga({}),
        vaga({ id: '3800000002', title: 'Supply Chain Analyst', postedAt: dia(3) }),
        vaga({ id: '3800000003', title: 'Coordenador de Transportes', companyName: 'Beta Trading', companyLinkedinUrl: 'https://www.linkedin.com/company/beta-trading', postedAt: dia(1) }),
        vaga({ id: '3800000004', title: 'Analista de Marketing' }),
        vaga({ id: '3800000005', title: 'Analista de Comércio Exterior' }),
        vaga({ id: '3800000006', title: 'Analista de Logística Sênior', postedAt: dia(20) }),
        vaga({ id: '3800000007', title: 'Analista de Logística', companyName: 'Gama Fretes', companyLinkedinUrl: 'https://www.linkedin.com/company/gama-fretes' }),
      ],
      usageTotalUsd: 0.0142,
    },
    [COMPANY]: {
      itens: [
        { name: 'Beta Trading', universalName: 'beta-trading', linkedinUrl: 'https://www.linkedin.com/company/beta-trading', website: 'https://beta.test', employeeCount: 80 },
        { name: 'Gama Fretes', universalName: 'gama-fretes', linkedinUrl: 'https://www.linkedin.com/company/gama-fretes', website: 'https://gama.test', employeeCount: 300 },
      ],
      usageTotalUsd: 0.008,
    },
    [LOOKUP]: {
      itens: [{ cnpj: MATRIZ_ALFA, razaoSocial: 'ALFA IMPORTADORA S/A', porte: 'DEMAIS', cnaePrincipal: '4690099', cnaeDescricao: 'Comércio atacadista', endereco: { uf: 'SP' }, situacaoCadastral: 'ATIVA', socios: [{ nome: 'Fulano de Tal' }] }],
      usageTotalUsd: 0.0016,
    },
  })
  const r = await c.rodar()
  assertEquals(r.desfecho, 'concluida')
  assertEquals(r.sinais.map((s) => [s.contaId, s.phrase]).sort(), [
    ['conta-alfa', 'Abriu vaga de Analista de Logística Pleno em Campinas, SP'],
    ['conta-alfa', 'Abriu vaga de Supply Chain Analyst em Campinas, SP'],
    ['conta-beta', 'Abriu vaga de Coordenador de Transportes em Campinas, SP'],
  ].sort())
  assertEquals(r.semConta, 1, 'a Gama não é Conta do Workspace')

  // A busca leva os três termos do ICP F, na janela de 7 dias.
  const entrada = c.posts()[0].corpo as { urls: string[] }
  const buscas = entrada.urls.map((u) => new URL(u).searchParams)
  assertEquals(buscas.map((p) => p.get('keywords')), ['analista de logística', 'supply chain', 'coordenador de transportes'])
  assert(buscas.every((p) => p.get('f_TPR') === 'r604800' && p.get('location') === 'Brazil'))
  // A Receita entra na evidência da Conta, sem nome de sócio.
  assert(r.sinais.filter((s) => s.contaId === 'conta-alfa').every((s) => s.evidence.includes('Receita Federal: porte DEMAIS; CNAE 4690099')))
  assert(!JSON.stringify(r).includes('Fulano'))
  assert(!MARCA_INTERNA.test(JSON.stringify(r)))
  assertEquals(c.banco.passos.map((p) => [p.ordem, p.handler, p.fim?.estado]), [
    [1, 'linkedin_vagas', 'succeeded'],
    [2, 'confirmar_vaga_comex', 'succeeded'],
    [3, 'linkedin_empresa', 'succeeded'],
    [4, 'casar_com_contas', 'succeeded'],
    [5, 'cnpj_da_conta', 'succeeded'],
  ])
})

Deno.test('F3: a vaga de comex não vira Sinal de logística (a confirmação lê os termos da cascata, não um tema fixo)', async () => {
  const c = cenario(cascataVagaLogistica(), { [JOBS]: { itens: [vaga({ title: 'Analista de Comex' }), vaga({ id: '2', title: 'Despachante Aduaneiro' })], usageTotalUsd: 0.004 } })
  const r = await c.rodar()
  assertEquals([r.desfecho, r.novos], ['concluida', 0])
  assertEquals(c.posts().length, 1, 'nada confirmado: o resto não roda')
})

Deno.test('F3: a mesma vaga, rodada de novo com outra chave, não cria o Sinal duas vezes', async () => {
  const c = cenario(cascataVagaLogistica(), { [JOBS]: { itens: [vaga({})], usageTotalUsd: 0.002 } }, { contas: [ALFA] })
  const a = await c.rodar({ chave: 'a' })
  const b = await c.rodar({ chave: 'b' })
  assertEquals([a.novos, b.novos, b.repetidos], [1, 0, 1])
})

// ---------------------------------------------------------------------------------------------------------------------
// F4 · Crescimento de comex do embarcador (sem fonte)

Deno.test('F4: o Sinal sem fonte não reserva crédito, não chama fonte nenhuma e explica o motivo sem citar fornecedor', async () => {
  const c = cenario(cascataCrescimentoComexEmbarcador(), {})
  const r = await c.rodar()
  assertEquals([r.desfecho, r.mensagem, c.banco.aberturas.length, c.fake.requisicoes.length], ['sem_fonte', MOTIVO_SEM_FONTE_COMEX_DO_EMBARCADOR, 0, 0])
  assert(!MARCA_INTERNA.test(r.mensagem))
})

// ---------------------------------------------------------------------------------------------------------------------
// O teto

Deno.test('o pior caso de cada cascata do ICP F cabe no teto dela', () => {
  for (const def of [cascataNovoCdOuFilial(), cascataTrocaDeSede(), cascataVagaLogistica()]) {
    assert(piorCasoUsd(def) <= def.capUsd, `${def.signalType}: pior caso US$ ${piorCasoUsd(def)} passa do teto US$ ${def.capUsd}`)
  }
  assertEquals(piorCasoUsd(cascataNovoCdOuFilial()), 0.49605)
})

Deno.test('o teto duro vale mesmo com o actor caro: o passo seguinte que estouraria o teto não começa', async () => {
  const c = cenario(cascataNovoCdOuFilial({ capUsd: 0.03 }), {
    [BRANCH]: { itens: MAPA_DA_SEGUNDA_RODADA, usageTotalUsd: 0.0101 },
  }, { fotografias: { [MATRIZ_ALFA]: [foto(30, BASE_ANTERIOR)] } })
  const r = await c.rodar()
  // O mapa custou 0,0101; a notícia (3 por Conta x 0,004 = 0,012) cabe em 0,03 - 0,0101? 0,0221 <= 0,03: cabe.
  assertEquals(c.posts().length, 2)
  const apertado = cenario(cascataNovoCdOuFilial({ capUsd: 0.02 }), { [BRANCH]: { itens: MAPA_DA_SEGUNDA_RODADA, usageTotalUsd: 0.0101 } }, {
    fotografias: { [MATRIZ_ALFA]: [foto(30, BASE_ANTERIOR)] },
  })
  const a = await apertado.rodar()
  assertEquals([a.desfecho, a.novos], ['parcial', 1])
  assertEquals(apertado.posts().length, 1, 'a notícia não rodou')
  assertEquals(apertado.banco.passos.at(-1)?.fim?.estado, 'aborted_cap')
  assertEquals(r.novos, 1)
})

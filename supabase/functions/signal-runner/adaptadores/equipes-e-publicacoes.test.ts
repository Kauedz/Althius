// Equipe crescendo e Publicações da empresa (PR-8) com resultados de exemplo no formato do README de cada actor e uma
// resposta de exemplo do modelo. Empresas, posts e números são fictícios: nenhum dado pessoal real.
import { assertEquals } from 'jsr:@std/assert@1'
import type { ContaParaVarrer, ContextoDoAdaptador, FotoDeHeadcount } from '../handler.ts'
import { crescimentoDeEquipes, equipeCrescendo, fraseDoCrescimento } from './crescimento-de-equipes.ts'
import { categoriaPelaRegra, lerResposta, MAX_POSTS, publicacaoDaEmpresa } from './publicacao-da-empresa.ts'

const AGORA = Date.parse('2026-10-14T12:00:00Z')
const CONTA: ContaParaVarrer = {
  id: 'conta-1',
  name: 'Acme Logística',
  domain: 'acmelog.com.br',
  linkedinUrl: 'https://www.linkedin.com/company/acme-logistica/',
}
const CRITERIOS = { periodo: 'Últimos 30 dias' }

function contexto(base: FotoDeHeadcount | null, vagas = 0, llm?: ContextoDoAdaptador['llm']) {
  const gravadas: FotoDeHeadcount[] = []
  const custos: number[] = []
  const ctx: ContextoDoAdaptador = {
    workspaceId: 'ws-1',
    headcount: {
      base: () => Promise.resolve(base),
      gravar: (_id, foto) => {
        gravadas.push(foto)
        return Promise.resolve()
      },
    },
    vagasAbertas: () => Promise.resolve(vagas),
    ...(llm ? { llm } : {}),
    custo: { adicionar: (usd) => custos.push(usd) },
  }
  return { ctx, gravadas, custos }
}

// Um item como o exemplo do README do harvestapi/linkedin-company.
const empresa = (employeeCount: number) => [{
  id: '1000001',
  universalName: 'acme-logistica',
  name: 'Acme Logística',
  linkedinUrl: 'https://www.linkedin.com/company/acme-logistica/',
  employeeCount,
  employeeCountRange: { start: 11, end: 50 },
  followerCount: 1200,
}]

// --- Equipe crescendo

Deno.test('regra: 10% ou mais e 5 pessoas ou mais dispara; só um dos dois, não', () => {
  assertEquals(equipeCrescendo({ antes: 40, agora: 47, dias: 90, vagas: 0 }), true)
  assertEquals(equipeCrescendo({ antes: 40, agora: 44, dias: 90, vagas: 0 }), false) // 10%, mas só +4
  assertEquals(equipeCrescendo({ antes: 400, agora: 430, dias: 90, vagas: 0 }), false) // +30, mas 7,5%
  assertEquals(equipeCrescendo({ antes: 40, agora: 40, dias: 90, vagas: 9 }), false) // sem crescer, vagas não bastam
  assertEquals(equipeCrescendo({ antes: 50, agora: 45, dias: 90, vagas: 5 }), false)
})

Deno.test('regra: crescimento menor com 3 ou mais vagas abertas dispara (as vagas reforçam)', () => {
  assertEquals(equipeCrescendo({ antes: 400, agora: 410, dias: 90, vagas: 3 }), true)
  assertEquals(equipeCrescendo({ antes: 400, agora: 410, dias: 90, vagas: 2 }), false)
})

Deno.test('frase com o motivo', () => {
  assertEquals(fraseDoCrescimento({ antes: 40, agora: 47, dias: 90, vagas: 4 }),
    'Equipe passou de 40 para 47 pessoas em 90 dias, com 4 vagas abertas')
  assertEquals(fraseDoCrescimento({ antes: 40, agora: 47, dias: 85, vagas: 0 }), 'Equipe passou de 40 para 47 pessoas em 85 dias')
})

Deno.test('entrada: a página da Conta no LinkedIn, uma empresa', () => {
  assertEquals(crescimentoDeEquipes.entrada(CONTA, CRITERIOS, AGORA), {
    input: { companies: ['https://www.linkedin.com/company/acme-logistica/'] },
    maxItems: 1,
  })
})

Deno.test('varredura: grava a foto do dia e dispara contra a base de 90 dias', async () => {
  const { ctx, gravadas } = contexto({ takenOn: '2026-07-16', headcount: 40 }, 4)
  const sinais = await crescimentoDeEquipes.sinaisComContexto!(empresa(47), CONTA, CRITERIOS, AGORA, ctx)
  assertEquals(gravadas, [{ takenOn: '2026-10-14', headcount: 47 }])
  assertEquals(sinais.length, 1)
  assertEquals(sinais[0].phrase, 'Equipe passou de 40 para 47 pessoas em 90 dias, com 4 vagas abertas')
  assertEquals(sinais[0].eventKey, 'crescimento_de_equipes|acme-logistica|2026-10')
  assertEquals(sinais[0].evidence?.includes('17,5%'), true)
})

Deno.test('varredura: sem foto anterior, só grava a base; sem contagem, nada', async () => {
  const primeira = contexto(null, 10)
  assertEquals(await crescimentoDeEquipes.sinaisComContexto!(empresa(47), CONTA, CRITERIOS, AGORA, primeira.ctx), [])
  assertEquals(primeira.gravadas.length, 1)
  const vazia = contexto({ takenOn: '2026-07-16', headcount: 40 })
  assertEquals(await crescimentoDeEquipes.sinaisComContexto!([{ name: 'Acme' }], CONTA, CRITERIOS, AGORA, vazia.ctx), [])
  assertEquals(vazia.gravadas.length, 0)
})

Deno.test('varredura: a página de outra empresa no resultado não conta; sem contexto, nenhum Sinal', async () => {
  const { ctx } = contexto({ takenOn: '2026-07-16', headcount: 40 })
  const outra = [{ ...empresa(90)[0], universalName: 'outra', linkedinUrl: 'https://www.linkedin.com/company/outra/' }]
  assertEquals(await crescimentoDeEquipes.sinaisComContexto!(outra, CONTA, CRITERIOS, AGORA, ctx), [])
  assertEquals(crescimentoDeEquipes.sinais(empresa(90), CONTA, CRITERIOS, AGORA), [])
})

// --- Publicações

let seq = 0
// Um post como o exemplo do README do harvestapi/linkedin-company-posts, publicado pela página da empresa.
const post = (content: string, date = '2026-10-05T13:00:00.000Z', autor: Record<string, unknown> = {}) => ({
  type: 'post',
  id: `73000000000000000${++seq}`,
  linkedinUrl: `https://www.linkedin.com/posts/acme-logistica_post-activity-73000000000000000${seq}-abcd`,
  content,
  author: {
    universalName: 'acme-logistica',
    type: 'company',
    name: 'Acme Logística',
    linkedinUrl: 'https://www.linkedin.com/company/acme-logistica/posts',
    ...autor,
  },
  postedAt: { timestamp: Date.parse(date), date, postedAgoShort: '9d' },
  engagement: { likes: 10, comments: 1, shares: 0 },
})

Deno.test('entrada: a página da Conta, até 10 posts no período, sem repostagens, reações nem comentários', () => {
  assertEquals(publicacaoDaEmpresa.entrada(CONTA, CRITERIOS, AGORA), {
    input: {
      targetUrls: ['https://www.linkedin.com/company/acme-logistica/'],
      maxPosts: MAX_POSTS,
      postedLimit: 'month',
      includeReposts: false,
      includeQuotePosts: false,
      scrapeReactions: false,
      scrapeComments: false,
    },
    maxItems: MAX_POSTS,
  })
  assertEquals(publicacaoDaEmpresa.entrada(CONTA, { periodo: 'Últimos 90 dias' }, AGORA).input.postedLimit, '3months')
})

Deno.test('classificação com a resposta de exemplo do modelo: irrelevante não vira Sinal, o custo é registrado', async () => {
  const itens = [
    post('Inauguramos hoje nosso novo centro em Recife, com 3 mil metros quadrados.'),
    post('Feliz dia das crianças a todas as famílias!'),
    post('Recebemos a certificação ISO 9001 na operação de armazenagem.', '2026-10-08T10:00:00.000Z'),
  ]
  const [a, b, c] = itens.map((i) => i.id)
  const pedidos: string[] = []
  const { ctx, custos } = contexto(null, 0, {
    json: ({ usuario }) => {
      pedidos.push(usuario)
      return Promise.resolve({
        json: { posts: [{ id: a, categoria: 'nova_unidade' }, { id: b, categoria: 'irrelevante' }, { id: c, categoria: 'certificacao' }] },
        custoUsd: 0.0004,
      })
    },
  })
  const sinais = await publicacaoDaEmpresa.sinaisComContexto!(itens, CONTA, CRITERIOS, AGORA, ctx)
  assertEquals(sinais.map((s) => s.phrase.split(':')[0]), [
    'Publicação da empresa sobre nova unidade',
    'Publicação da empresa sobre certificação',
  ])
  assertEquals(sinais[0].eventKey, `publicacao_da_empresa|${a}`)
  assertEquals(sinais[0].source, 'Publicações da empresa no LinkedIn')
  assertEquals(custos, [0.0004])
  assertEquals(pedidos.length, 1)
})

Deno.test('sem modelo, ou com o modelo falhando, a regra de palavra-chave classifica', async () => {
  const itens = [post('Estamos contratando analistas de logística para a operação de Campinas.'), post('Bom dia a todos!')]
  const sem = contexto(null)
  assertEquals((await publicacaoDaEmpresa.sinaisComContexto!(itens, CONTA, CRITERIOS, AGORA, sem.ctx)).map((s) => s.phrase.split(':')[0]),
    ['Publicação da empresa sobre contratação'])
  const falha = contexto(null, 0, { json: () => Promise.reject(new Error('fora do ar')) })
  assertEquals((await publicacaoDaEmpresa.sinaisComContexto!(itens, CONTA, CRITERIOS, AGORA, falha.ctx)).length, 1)
  assertEquals(falha.custos, [])
})

Deno.test('fora do período, de outro autor ou sem texto: o post não conta', async () => {
  const itens = [
    post('Inauguramos nossa nova filial em Curitiba.', '2026-08-01T10:00:00.000Z'),
    post('Inauguramos nossa nova filial em Curitiba.', '2026-10-05T10:00:00.000Z', { type: 'profile', universalName: null, linkedinUrl: 'https://www.linkedin.com/in/alguem' }),
    post('Inauguramos nossa nova filial.', '2026-10-05T10:00:00.000Z', { universalName: 'outra', linkedinUrl: 'https://www.linkedin.com/company/outra/' }),
    post(''),
    { type: 'error', message: 'falhou' },
  ]
  assertEquals(await publicacaoDaEmpresa.sinaisComContexto!(itens, CONTA, CRITERIOS, AGORA, contexto(null).ctx), [])
})

Deno.test('regra e leitura da resposta', () => {
  assertEquals(categoriaPelaRegra('Anunciamos um aporte de R$ 20 milhões para ampliar a frota.'), 'investimento')
  assertEquals(categoriaPelaRegra('Chegamos a mais três estados: expansão para o Nordeste.'), 'expansao')
  assertEquals(categoriaPelaRegra('Feliz Natal!'), 'irrelevante')
  assertEquals([...lerResposta({ posts: [{ id: '1', categoria: 'Nova unidade' }, { id: '2', categoria: 'outra' }, { categoria: 'expansao' }] })],
    [['1', 'nova_unidade']])
  assertEquals(lerResposta('texto solto').size, 0)
})

// A preparação da busca pelo Contexto da empresa (contexto-da-empresa, ticket 04): o texto livre do Perfil de cliente
// ideal vira, pela IA, critérios estruturados; o servidor confere cada um contra o texto e traduz para o que a fonte
// realmente filtra. O handler inteiro, com banco e IA falsos. Empresas fictícias.
import { assert, assertEquals } from 'jsr:@std/assert@1'
import type { Llm } from '../_shared/cascata-de-sinais/tipos.ts'
import { createHandler, type Db } from './handler.ts'

const WS = '00000000-0000-4000-8000-000000000001'

const ICP = `ICP primário
Corretoras de seguros com 50 a 500 funcionários, sede em São Paulo. Modelo B2B.

ICP secundário
Seguradoras de médio porte no Paraná, com faturamento acima de R$ 10 milhões.

Exclusões
- Órgãos públicos`

const INTERPRETACAO = {
  perfis: [
    {
      nome: 'ICP primário',
      criterios: [
        { conceito: 'setor', valor: 'Corretoras de seguros', trecho: 'Corretoras de seguros' },
        { conceito: 'funcionarios', min: 50, max: 500, trecho: '50 a 500 funcionários' },
        { conceito: 'sede', valor: 'São Paulo', trecho: 'sede em São Paulo' },
        { conceito: 'modeloDeNegocio', valor: 'B2B', trecho: 'Modelo B2B' },
      ],
    },
    {
      nome: 'ICP secundário',
      criterios: [
        { conceito: 'setor', valor: 'Seguradoras', trecho: 'Seguradoras' },
        { conceito: 'funcionarios', valor: 'médio porte', trecho: 'médio porte' },
        { conceito: 'sede', valor: 'Paraná', trecho: 'no Paraná' },
        { conceito: 'faturamento', min: 10, unidade: 'milhao', trecho: 'faturamento acima de R$ 10 milhões' },
      ],
    },
  ],
  exclusoes: [{ conceito: 'excluir', valor: 'Órgãos públicos', trecho: 'Órgãos públicos' }],
}

function llmQueResponde(saida: unknown, registro: { usuario?: string; chamadas: number } = { chamadas: 0 }): Llm {
  return {
    json: (a) => {
      registro.chamadas++
      registro.usuario = a.usuario
      return Promise.resolve({ json: saida, custoUsd: 0.001 })
    },
  }
}

function handlerCom(db: Partial<Db>, llm?: Llm) {
  const base: Db = {
    userFromJwt: () => Promise.resolve({ userId: 'u1' }),
    lerIcp: () => Promise.resolve(null),
    lerContexto: () => Promise.resolve({ versao: 7, icp: ICP }),
    actoresDeBusca: () => Promise.resolve([]),
    iniciar: () => Promise.reject(new Error('não deve iniciar')),
    gravarCandidatas: () => Promise.resolve({ added: 0, duplicates: 0, ignored: 0 }),
    gravarCusto: () => Promise.resolve(),
    encerrar: () => Promise.resolve(),
    ...db,
  }
  return createHandler({ db: base, llm, apify: {} as never, appOrigin: 'https://app.test', waitUntil: () => {} })
}

async function preparar(db: Partial<Db>, llm?: Llm) {
  const res = await handlerCom(db, llm)(
    new Request('https://fn.test/account-discovery', {
      method: 'POST',
      headers: { Authorization: 'Bearer jwt', apikey: 'chave', 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'prepare', workspaceId: WS }),
    }),
  )
  return { status: res.status, corpo: await res.json() }
}

type Perfil = {
  nome: string
  criterios: Record<string, unknown>
  aplicados: { conceito: string; valor: string; trecho: string }[]
  pendentes: { conceito: string; valor: string; trecho: string; motivo: string; explicacao: string }[]
}

Deno.test('prepare: cada perfil do texto vira um recorte próprio, ligado ao trecho e à versão do contexto', async () => {
  const registro = { chamadas: 0 } as { usuario?: string; chamadas: number }
  const { status, corpo } = await preparar({}, llmQueResponde(INTERPRETACAO, registro))
  assertEquals(status, 200)
  assertEquals(corpo.estado, 'pronta')
  assertEquals(corpo.contextoVersao, 7)
  assertEquals(corpo.fonte, 'linkedin')
  // O texto do ICP vai para a IA como dado.
  assert(registro.usuario?.includes('Corretoras de seguros com 50 a 500 funcionários'))

  const [primario, secundario] = corpo.perfis as Perfil[]
  assertEquals(primario.nome, 'ICP primário')
  assertEquals(primario.criterios.setores, ['Corretoras de seguros'])
  assertEquals(primario.criterios.regioes, ['SP'])
  // A fonte só filtra por faixas: as que cobrem 50 a 500, com o aviso de que o número exato fica para conferir.
  assertEquals(primario.criterios.portes, ['11-50', '51-200', '201-500'])
  assertEquals(primario.criterios.excluir, ['Órgãos públicos'])
  assert(primario.aplicados.some((a) => a.conceito === 'funcionarios' && a.trecho === '50 a 500 funcionários'))
  assertEquals(
    primario.pendentes.map((p) => [p.conceito, p.motivo]),
    [['funcionarios', 'faixa_aproximada'], ['modeloDeNegocio', 'sem_suporte_na_fonte']],
  )

  // As conjunções não se misturam: o secundário não herda São Paulo nem as faixas do primário.
  assertEquals(secundario.criterios.setores, ['Seguradoras'])
  assertEquals(secundario.criterios.regioes, ['PR'])
  assertEquals(secundario.criterios.portes, [])
  assertEquals(secundario.criterios.excluir, ['Órgãos públicos'])
  // "Médio porte" não vira número; faturamento não é filtro de nenhuma fonte.
  assertEquals(
    secundario.pendentes.map((p) => [p.conceito, p.motivo, p.valor]),
    [['funcionarios', 'ambiguo', 'médio porte'], ['faturamento', 'sem_suporte_na_fonte', 'acima de R$ 10 mi']],
  )
})

Deno.test('prepare: critério sem trecho no texto é descartado; número que o trecho não diz não vira faixa', async () => {
  const { corpo } = await preparar({}, llmQueResponde({
    perfis: [{
      nome: 'ICP primário',
      criterios: [
        { conceito: 'setor', valor: 'Corretoras de seguros', trecho: 'Corretoras de seguros' },
        { conceito: 'setor', valor: 'Bancos', trecho: 'Bancos digitais' },
        { conceito: 'funcionarios', min: 100, max: 999, trecho: 'médio porte' },
      ],
    }],
  }))
  const [perfil] = corpo.perfis as Perfil[]
  assertEquals(perfil.criterios.setores, ['Corretoras de seguros'])
  assertEquals(perfil.criterios.portes, [])
  assertEquals(perfil.pendentes.map((p) => [p.conceito, p.motivo]), [['funcionarios', 'ambiguo']])
})

Deno.test('prepare: unidades — "mil funcionários" vira 1000; porte cadastral, atuação e local desconhecido ficam pendentes', async () => {
  const icp = 'Indústrias com mais de 1 mil funcionários, sede em Atlântida, atuação no Nordeste, porte EPP.'
  const { corpo } = await preparar({ lerContexto: () => Promise.resolve({ versao: 2, icp }) }, llmQueResponde({
    perfis: [{
      nome: 'Indústrias',
      criterios: [
        { conceito: 'setor', valor: 'Indústria', trecho: 'Indústrias' },
        { conceito: 'funcionarios', min: 1000, trecho: 'mais de 1 mil funcionários' },
        { conceito: 'sede', valor: 'Atlântida', trecho: 'sede em Atlântida' },
        { conceito: 'atuacao', valor: 'Nordeste', trecho: 'atuação no Nordeste' },
        { conceito: 'porteCadastral', valor: 'EPP', trecho: 'porte EPP' },
      ],
    }],
  }))
  const [perfil] = corpo.perfis as Perfil[]
  assertEquals(perfil.criterios.portes, ['501-1000', '1001-5000', '5001-10000', '10001+'])
  assertEquals(perfil.criterios.regioes, [])
  assertEquals(
    perfil.pendentes.map((p) => [p.conceito, p.motivo]),
    [
      ['funcionarios', 'faixa_aproximada'],
      ['sede', 'local_desconhecido'],
      ['atuacao', 'sem_suporte_na_fonte'],
      ['porteCadastral', 'sem_suporte_na_fonte'],
    ],
  )
})

Deno.test('prepare: com CNAE em todos os perfis e sem setor, a fonte é a Receita e o porte cadastral se aplica', async () => {
  const icp = 'Desenvolvedoras de software (CNAE 6201-5/01), porte EPP, em Santa Catarina, 20 a 100 funcionários.'
  const { corpo } = await preparar({ lerContexto: () => Promise.resolve({ versao: 3, icp }) }, llmQueResponde({
    perfis: [{
      nome: 'ICP primário',
      criterios: [
        { conceito: 'cnae', valor: '6201-5/01', trecho: 'CNAE 6201-5/01' },
        { conceito: 'porteCadastral', valor: 'EPP', trecho: 'porte EPP' },
        { conceito: 'sede', valor: 'Santa Catarina', trecho: 'em Santa Catarina' },
        { conceito: 'funcionarios', min: 20, max: 100, trecho: '20 a 100 funcionários' },
      ],
    }],
  }))
  assertEquals(corpo.fonte, 'receita')
  const [perfil] = corpo.perfis as Perfil[]
  assertEquals(perfil.criterios.fonte, 'receita')
  assertEquals(perfil.criterios.cnaes, ['6201501'])
  assertEquals(perfil.criterios.portes, ['EPP'])
  assertEquals(perfil.criterios.regioes, ['SC'])
  // A Receita não informa funcionários: o critério fica pendente, sem virar outra coisa.
  assertEquals(perfil.pendentes.map((p) => [p.conceito, p.motivo]), [['funcionarios', 'sem_suporte_na_fonte']])
})

Deno.test('prepare: sem texto de ICP salvo, o estado é sem_contexto e a IA nem é chamada', async () => {
  const registro = { chamadas: 0 }
  for (const contexto of [{ versao: null, icp: '' }, { versao: 4, icp: '   ' }]) {
    const { status, corpo } = await preparar({ lerContexto: () => Promise.resolve(contexto) }, llmQueResponde(INTERPRETACAO, registro))
    assertEquals(status, 200)
    assertEquals(corpo.estado, 'sem_contexto')
    assertEquals(corpo.perfis, [])
  }
  assertEquals(registro.chamadas, 0)
})

Deno.test('prepare: sem IA, IA que falha ou saída sem perfil válido é falha de tradução, não mercado vazio', async () => {
  const falhando: Llm = { json: () => Promise.reject(new Error('fora')) }
  for (const llm of [undefined, falhando, llmQueResponde({ perfis: [] }), llmQueResponde('texto')]) {
    const { status, corpo } = await preparar({}, llm)
    assertEquals(status, 200)
    assertEquals(corpo.estado, 'falha_traducao')
    assertEquals(corpo.contextoVersao, 7)
    assertEquals(corpo.perfis, [])
    assert(typeof corpo.mensagem === 'string' && corpo.mensagem.length > 0)
  }
})

Deno.test('prepare: quem não participa do Workspace é recusado', async () => {
  const { ErroDoBanco } = await import('./handler.ts')
  const { status } = await preparar({ lerContexto: () => Promise.reject(new ErroDoBanco('42501', 'not a member')) })
  assertEquals(status, 403)
})

Deno.test('prepare: a direção do intervalo vem do texto — "até 500" não vira "500 ou mais"', async () => {
  const icp = 'Varejistas com até 500 funcionários.'
  const { corpo } = await preparar({ lerContexto: () => Promise.resolve({ versao: 1, icp }) }, llmQueResponde({
    perfis: [{ nome: 'ICP', criterios: [
      { conceito: 'setor', valor: 'Varejo', trecho: 'Varejistas' },
      { conceito: 'funcionarios', min: 500, trecho: 'até 500 funcionários' },
    ] }],
  }))
  const [perfil] = corpo.perfis as Perfil[]
  assertEquals(perfil.criterios.portes, [])
  assertEquals(perfil.pendentes.map((p) => [p.conceito, p.motivo]), [['funcionarios', 'ambiguo']])
})

Deno.test('prepare: valor que o trecho não diz é descartado; vários estados num valor viram vários; Brasil continua filtro', async () => {
  const icp = 'Distribuidoras em SP e RJ. Atendemos todo o Brasil.'
  const { corpo } = await preparar({ lerContexto: () => Promise.resolve({ versao: 1, icp }) }, llmQueResponde({
    perfis: [
      { nome: 'A', criterios: [
        { conceito: 'setor', valor: 'Distribuidoras', trecho: 'Distribuidoras' },
        { conceito: 'setor', valor: 'Bancos', trecho: 'Distribuidoras' },
        { conceito: 'sede', valor: 'SP e RJ', trecho: 'em SP e RJ' },
        { conceito: 'sede', valor: 'MG', trecho: 'em SP e RJ' },
      ] },
      { nome: 'B', criterios: [
        { conceito: 'setor', valor: 'Distribuidoras', trecho: 'Distribuidoras' },
        { conceito: 'sede', valor: 'Brasil', trecho: 'todo o Brasil' },
      ] },
    ],
  }))
  const [a, b] = corpo.perfis as Perfil[]
  assertEquals(a.criterios.setores, ['Distribuidoras'])
  assertEquals(a.criterios.regioes, ['SP', 'RJ'])
  assertEquals(b.criterios.regioes, ['Brasil'])
})

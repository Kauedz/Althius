// A busca pelos perfis do Contexto da empresa (contexto-da-empresa, ticket 04): cada perfil é um recorte próprio, com
// as suas conjunções; as empresas repetidas entre recortes viram uma só; o que a fonte não aplicou fica como motivo
// "a verificar", sem confirmar Aderência; filtros de uma versão antiga do contexto não rodam. Empresas fictícias.
import { assert, assertEquals } from 'jsr:@std/assert@1'
import type { Apify } from '../signal-scan/handler.ts'
import { createHandler, type Db, type RegistroPorPerfis } from './handler.ts'
import { ACTOR_LINKEDIN_EMPRESAS, ACTOR_RECEITA } from './normalizar.ts'

const WS = '22222222-2222-4222-8222-222222222222'
const BUSCA = '33333333-3333-4333-8333-333333333333'

const empresa = (nome: string, setor: string, estado: string, funcionarios: number) => ({
  id: nome,
  universalName: nome.toLowerCase().replace(/\s+/g, '-'),
  linkedinUrl: `https://www.linkedin.com/company/${nome.toLowerCase().replace(/\s+/g, '-')}/`,
  name: nome,
  website: `https://${nome.toLowerCase().replace(/\s+/g, '')}.test`,
  employeeCount: funcionarios,
  description: `${setor} no ${estado}.`,
  locations: [{ country: 'BR', headquarter: true, parsed: { countryCode: 'BR', state: estado, city: estado } }],
  industries: [{ name: setor }],
})

const PERFIS = [
  {
    nome: 'ICP primário',
    criterios: { fonte: 'linkedin', setores: ['Corretoras de seguros'], portes: ['51-200'], regioes: ['SP'], excluir: ['Órgãos públicos'] },
    pendentes: [{ conceito: 'modeloDeNegocio', valor: 'B2B', trecho: 'Modelo B2B', motivo: 'sem_suporte_na_fonte', explicacao: 'O LinkedIn não informa modelo de negócio.' }],
  },
  {
    nome: 'ICP secundário',
    criterios: { fonte: 'linkedin', setores: ['Seguradoras'], regioes: ['PR'] },
    pendentes: [{ conceito: 'faturamento', valor: 'acima de R$ 10 mi', trecho: 'faturamento acima de R$ 10 milhões', motivo: 'sem_suporte_na_fonte', explicacao: 'O LinkedIn não informa faturamento.' }],
  },
]

type Inicio = Parameters<Db['iniciar']>[0]
type Candidatas = Parameters<Db['gravarCandidatas']>[1]

function montar(opcoes: { versaoAtual?: number | null; itens?: (input: Record<string, unknown>) => unknown[] } = {}) {
  const inicios: Inicio[] = []
  const chamadas: { input: Record<string, unknown>; maxItems: number; maxTotalChargeUsd: number }[] = []
  const gravadas: Candidatas[] = []
  const encerramentos: Parameters<Db['encerrar']>[0][] = []
  const espera: Promise<unknown>[] = []
  const db: Db = {
    userFromJwt: () => Promise.resolve({ userId: 'user-1' }),
    lerIcp: () => Promise.resolve(null),
    lerContexto: () => Promise.resolve({ versao: opcoes.versaoAtual === undefined ? 7 : opcoes.versaoAtual, icp: 'texto' }),
    actoresDeBusca: () =>
      Promise.resolve([
        { actorId: ACTOR_LINKEDIN_EMPRESAS, state: 'available', version: 'v3', maxCostUsd: 0.6 },
        { actorId: ACTOR_RECEITA, state: 'available', version: 'v1', maxCostUsd: 1 },
      ]),
    iniciar: (a) => (inicios.push(a), Promise.resolve({ runId: BUSCA, outcome: 'go', state: 'em_andamento', actorVersion: 'v3' })),
    gravarCandidatas: (_runId, candidatas) => (gravadas.push(candidatas), Promise.resolve({ added: candidatas.length, duplicates: 0, ignored: 0 })),
    gravarCusto: () => Promise.resolve(),
    encerrar: (a) => (encerramentos.push(a), Promise.resolve()),
  }
  const itensPadrao = (input: Record<string, unknown>) =>
    String(input.searchQuery).includes('Seguradoras')
      ? [empresa('Beta Seguros', 'Seguradoras', 'Paraná', 900), empresa('Gama Corretora', 'Corretoras de seguros', 'São Paulo', 120)]
      : [empresa('Gama Corretora', 'Corretoras de seguros', 'São Paulo', 120), empresa('Delta Corretora', 'Corretoras de seguros', 'São Paulo', 80)]
  const apify: Apify = {
    run: (a) => {
      chamadas.push(a as never)
      return Promise.resolve({ runId: `apify-${chamadas.length}`, items: (opcoes.itens ?? itensPadrao)(a.input as Record<string, unknown>) })
    },
  }
  const handler = createHandler({ db, apify, appOrigin: 'https://app.test', waitUntil: (t) => espera.push(t), log: () => {} })
  async function buscar(corpo: Record<string, unknown>) {
    const res = await handler(new Request('http://x/account-discovery', {
      method: 'POST',
      headers: { Authorization: 'Bearer jwt', apikey: 'chave', 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'search', workspaceId: WS, maxResults: 50, ...corpo }),
    }))
    await Promise.all(espera)
    return { status: res.status, corpo: await res.json() }
  }
  return { buscar, inicios, chamadas, gravadas, encerramentos }
}

Deno.test('search por perfis: um recorte por perfil, sem misturar as conjunções, e a versão do contexto registrada', async () => {
  const { buscar, inicios, chamadas } = montar()
  const { status } = await buscar({ perfis: PERFIS, contextoVersao: 7 })
  assertEquals(status, 202)
  assertEquals(chamadas.length, 2)
  assertEquals(chamadas[0].input.searchQuery, '"Corretoras de seguros"')
  assertEquals(chamadas[0].input.locations, ['São Paulo, Brazil'])
  assertEquals(chamadas[0].input.companySize, ['51-200'])
  assertEquals(chamadas[1].input.searchQuery, 'Seguradoras')
  assertEquals(chamadas[1].input.locations, ['Paraná, Brazil'])
  assertEquals(chamadas[1].input.companySize, undefined)
  // O teto de custo e o limite de empresas da busca são divididos entre os recortes, não multiplicados.
  assertEquals(chamadas.map((c) => c.maxTotalChargeUsd), [0.3, 0.3])
  assertEquals(chamadas.map((c) => c.maxItems), [25, 25])

  const [inicio] = inicios
  assertEquals(inicio.actorId, ACTOR_LINKEDIN_EMPRESAS)
  assertEquals(inicio.icpVersion, null)
  const registro = inicio.criterios as RegistroPorPerfis
  assertEquals(registro.origem, 'contexto_da_empresa')
  assertEquals(registro.contexto, { versao: 7 })
  assertEquals(registro.fonte, 'linkedin')
  assertEquals(registro.perfis.map((p) => p.nome), ['ICP primário', 'ICP secundário'])
  assertEquals(registro.perfis[0].criterios.regioes, ['SP'])
  assertEquals(registro.perfis[1].pendentes[0].conceito, 'faturamento')
})

Deno.test('search por perfis: a empresa que aparece em dois recortes é gravada uma vez; pendentes viram "a verificar"', async () => {
  const { buscar, gravadas, encerramentos } = montar()
  await buscar({ perfis: PERFIS, contextoVersao: 7 })
  const [candidatas] = gravadas
  assertEquals(candidatas.map((c) => c.name).sort(), ['Beta Seguros', 'Delta Corretora', 'Gama Corretora'])
  const gama = candidatas.find((c) => c.name === 'Gama Corretora')!
  assert(gama.reasons.some((m) => m.texto.includes('ICP primário')), JSON.stringify(gama.reasons))
  const pendente = gama.reasons.find((m) => m.criterio === 'pendente')
  assertEquals(pendente?.atende, null)
  assert(pendente?.texto.includes('B2B'))
  const beta = candidatas.find((c) => c.name === 'Beta Seguros')!
  assert(beta.reasons.some((m) => m.criterio === 'pendente' && m.texto.includes('R$ 10 mi')), JSON.stringify(beta.reasons))
  assertEquals(encerramentos.map((e) => e.success), [true])
})

Deno.test('search por perfis: o pendente diz o que exige coleta na qualificação, sem prometer o dado', async () => {
  const { buscar, gravadas } = montar()
  await buscar({ perfis: PERFIS, contextoVersao: 7 })
  const beta = gravadas[0].find((c) => c.name === 'Beta Seguros')!
  const pendente = beta.reasons.find((m) => m.criterio === 'pendente')!
  assertEquals(pendente.texto, 'A verificar na qualificação: Faturamento acima de R$ 10 mi (a fonte não traz esse dado).')
})

Deno.test('search por perfis: filtros de uma versão antiga do contexto não rodam', async () => {
  const { buscar, inicios, chamadas } = montar({ versaoAtual: 8 })
  const { status, corpo } = await buscar({ perfis: PERFIS, contextoVersao: 7 })
  assertEquals(status, 409)
  assertEquals(corpo.code, 'contexto_mudou')
  assertEquals(inicios.length, 0)
  assertEquals(chamadas.length, 0)
})

Deno.test('search por perfis: perfil sem setor nem palavra-chave é recusado pelo nome, sem relaxar nada', async () => {
  const { buscar, inicios } = montar()
  const { status, corpo } = await buscar({
    perfis: [PERFIS[0], { nome: 'ICP terciário', criterios: { fonte: 'linkedin', regioes: ['RS'] }, pendentes: [] }],
    contextoVersao: 7,
  })
  assertEquals(status, 422)
  assertEquals(corpo.code, 'filtros_insuficientes')
  assert(String(corpo.error).includes('ICP terciário'))
  assertEquals(inicios.length, 0)
})

Deno.test('search por perfis: fontes diferentes na mesma busca são recusadas', async () => {
  const { buscar, inicios } = montar()
  const { status } = await buscar({
    perfis: [PERFIS[0], { nome: 'Receita', criterios: { fonte: 'receita', cnaes: ['6201501'] }, pendentes: [] }],
    contextoVersao: 7,
  })
  assertEquals(status, 422)
  assertEquals(inicios.length, 0)
})

Deno.test('search por perfis: sem empresas na fonte, a busca fecha com sucesso e zero gravadas (não é falha)', async () => {
  const { buscar, gravadas, encerramentos } = montar({ itens: () => [] })
  await buscar({ perfis: PERFIS, contextoVersao: 7 })
  assertEquals(gravadas, [[]])
  assertEquals(encerramentos.map((e) => [e.success, e.error]), [[true, null]])
})

Deno.test('search por perfis: o registro guarda de que trecho veio cada filtro aplicado', async () => {
  const { buscar, inicios } = montar()
  const aplicados = [{ conceito: 'setor', valor: 'Corretoras de seguros', trecho: 'Corretoras de seguros' }]
  await buscar({ perfis: [{ ...PERFIS[0], aplicados }, PERFIS[1]], contextoVersao: 7 })
  const registro = inicios[0].criterios as RegistroPorPerfis
  assertEquals(registro.perfis[0].aplicados, aplicados)
  assertEquals(registro.perfis[0].pendentes[0].motivo, 'sem_suporte_na_fonte')
})

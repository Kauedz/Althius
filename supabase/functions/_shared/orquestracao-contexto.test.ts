import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import {
  type ContextoDaEmpresaNaExecucao,
  contextoDaEmpresa,
  leitorDoContexto,
  MAX_CARACTERES_POR_TEXTO_DO_CONTEXTO,
  type RunDb,
} from './orquestracao.ts'

const NORTE: ContextoDaEmpresaNaExecucao = {
  version: 3,
  empresa: 'A Norte vende software para incorporadoras.',
  icp: 'Primário: incorporadoras de médio porte.\nSecundário: construtoras.',
  personas: 'Diretor de obras: aprova a compra.',
}
const VAZIO: ContextoDaEmpresaNaExecucao = { version: null, empresa: '', icp: '', personas: '' }
const CAMINHO = 'Configurações → Contexto da empresa'

Deno.test('o contexto traz os três textos vigentes, a versão e manda citar o texto usado', () => {
  const texto = contextoDaEmpresa(NORTE, 'scopus')
  assertStringIncludes(texto, 'Contexto da empresa (versão 3)')
  assertStringIncludes(texto, '### Empresa\nA Norte vende software para incorporadoras.')
  assertStringIncludes(texto, '### Perfil de cliente ideal\nPrimário: incorporadoras de médio porte.\nSecundário: construtoras.')
  assertStringIncludes(texto, '### Personas\nDiretor de obras: aprova a compra.')
  assertStringIncludes(texto, '(Contexto da empresa, Perfil de cliente ideal)')
  assertEquals(texto.includes('Playbook'), false)
})

Deno.test('cada Especialidade recebe o mesmo contexto com o foco do seu papel', () => {
  assertStringIncludes(contextoDaEmpresa(NORTE, 'scopus'), 'Scopus')
  assertStringIncludes(contextoDaEmpresa(NORTE, 'ethos'), 'Ethos')
  assertStringIncludes(contextoDaEmpresa(NORTE, 'oraculum'), 'Oraculum')
  const doRhetor = contextoDaEmpresa(NORTE, 'rhetor')
  assertStringIncludes(doRhetor, 'Rhetor')
  assertStringIncludes(doRhetor, 'Personas')
  for (const specialty of ['scopus', 'ethos', 'rhetor', 'oraculum']) {
    assertStringIncludes(contextoDaEmpresa(NORTE, specialty), NORTE.icp, specialty)
  }
})

Deno.test('o que é operacional não vem do contexto: o Agente não inventa cadência, scripts nem SLA', () => {
  const texto = contextoDaEmpresa(NORTE, 'rhetor')
  assertStringIncludes(texto, 'não define cadência, scripts, templates, SLA')
  assertStringIncludes(texto, 'nunca invente')
})

Deno.test('o Agente não altera o contexto: só um Administrador salva, em Configurações', () => {
  const texto = contextoDaEmpresa(NORTE, 'scopus')
  assertStringIncludes(texto, 'Você não altera o Contexto da empresa')
  assertStringIncludes(texto, CAMINHO)
})

Deno.test('sem contexto, o Agente pergunta o que a empresa vende e leva a pessoa às Configurações', () => {
  for (const contexto of [VAZIO, { ...VAZIO, version: 2, empresa: '  ' }]) {
    const texto = contextoDaEmpresa(contexto, 'scopus')
    assertStringIncludes(texto, 'ainda não tem Contexto da empresa')
    assertStringIncludes(texto, 'o que a empresa vende')
    assertStringIncludes(texto, 'STATUS: pergunta')
    assertStringIncludes(texto, CAMINHO)
    assertEquals(texto.includes('### Empresa'), false)
  }
})

Deno.test('com um texto faltando, o Agente sabe qual falta e não preenche com suposição', () => {
  const texto = contextoDaEmpresa({ ...NORTE, personas: ' ' }, 'ethos')
  assertStringIncludes(texto, '### Empresa')
  assertEquals(texto.includes('### Personas'), false)
  assertStringIncludes(texto, 'ainda não tem: Personas')
  assertStringIncludes(texto, CAMINHO)
})

Deno.test('um texto longo é cortado, com o aviso', () => {
  const texto = contextoDaEmpresa({ ...NORTE, empresa: 'a'.repeat(MAX_CARACTERES_POR_TEXTO_DO_CONTEXTO + 5000) }, 'scopus')
  assertStringIncludes(texto, '[…a Empresa foi cortada por ser longa]')
  assert(!texto.includes('a'.repeat(MAX_CARACTERES_POR_TEXTO_DO_CONTEXTO + 1)))
})

function bancoComContexto(resposta: ContextoDaEmpresaNaExecucao | Error | 'sem') {
  const leituras: string[] = []
  const db = {
    claim: () => Promise.resolve(null),
    append: () => Promise.resolve(1),
    finish: () => Promise.resolve(),
    searchAccounts: () => Promise.resolve([]),
    ...(resposta === 'sem' ? {} : {
      contextoDaEmpresa: (runId: string) => {
        leituras.push(runId)
        return resposta instanceof Error ? Promise.reject(resposta) : Promise.resolve(resposta)
      },
    }),
  } as RunDb
  return { db, leituras }
}

Deno.test('o leitor lê o contexto uma vez por Execução: todas as Especialidades e rodadas usam a mesma versão', async () => {
  const { db, leituras } = bancoComContexto(NORTE)
  const ler = leitorDoContexto(db, 'r1', () => {}, 'agent_run')
  const scopus = await ler('scopus')
  await ler('scopus')
  const ethos = await ler('ethos')
  assertEquals(leituras, ['r1'])
  assertStringIncludes(scopus, 'Scopus')
  assertStringIncludes(ethos, 'Ethos')
})

Deno.test('se a leitura falha, o Agente é avisado de que não pode supor nada, e a falha vai para o log', async () => {
  const { db } = bancoComContexto(new Error('banco caiu'))
  const logs: Record<string, unknown>[] = []
  const texto = await leitorDoContexto(db, 'r1', (campos) => logs.push(campos), 'hermes_worker')('scopus')
  assertStringIncludes(texto, 'não pôde ser lido agora')
  assertEquals(texto.includes('ainda não tem Contexto da empresa'), false)
  assertEquals([logs[0].type, logs[0].outcome], ['hermes_worker', 'company_context_failed'])
})

Deno.test('um banco sem a leitura do contexto roda como antes', async () => {
  const { db } = bancoComContexto('sem')
  assertEquals(await leitorDoContexto(db, 'r1', () => {}, 'agent_run')('scopus'), '')
})

Deno.test('a regra de marca vai nas instruções da escolha e das ferramentas: o Hermes não nomeia provedores', async () => {
  const { instrucoesDaEscolha } = await import('../_hermes-worker/worker.ts')
  const { REGRA_DE_MARCA } = await import('./marca.ts')
  const reserva = { workspace_name: 'Norte', agents: [] } as unknown as Parameters<typeof instrucoesDaEscolha>[0]
  assertStringIncludes(instrucoesDaEscolha(reserva), REGRA_DE_MARCA)
  assertStringIncludes(REGRA_DE_MARCA, 'nunca nomeie provedores, plataformas de raspagem, actors nem ferramentas internas')
  assertStringIncludes(REGRA_DE_MARCA, 'fonte pública')
})

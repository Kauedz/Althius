import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import {
  contextoDoPlaybook,
  leitorDoPlaybook,
  MAX_CARACTERES_DO_PLAYBOOK,
  type RunDb,
  type SecaoDoPlaybookNaExecucao,
} from './orquestracao.ts'

const empresa: SecaoDoPlaybookNaExecucao = {
  section: 'empresa',
  name: 'Empresa',
  content: { texto: 'A Norte vende software para incorporadoras.', linhas: [] },
}
const icp: SecaoDoPlaybookNaExecucao = {
  section: 'icp',
  name: 'ICP',
  content: { texto: 'Incorporadoras de médio porte.' },
}
const dores: SecaoDoPlaybookNaExecucao = {
  section: 'dor_e_percepcao',
  name: 'Dor e percepção',
  content: { texto: '', linhas: [{ dor: 'Leads sem resposta', urgencia: 'Alta', vazio: '  ' }, 'lixo', { so: '' }] },
}

Deno.test('o contexto traz as seções escritas, com o nome, e manda citar a seção', () => {
  const texto = contextoDoPlaybook([empresa, icp, dores])
  assertStringIncludes(texto, '### Empresa\nA Norte vende software para incorporadoras.')
  assertStringIncludes(texto, '### ICP\nIncorporadoras de médio porte.')
  assertStringIncludes(texto, '### Dor e percepção\n- dor: Leads sem resposta; urgencia: Alta')
  assertStringIncludes(texto, '(Playbook, seção ICP)')
  assertEquals(texto.includes('vazio'), false)
  assertEquals(texto.includes('lixo'), false)
  assertEquals(texto.includes('ainda não tem a seção Empresa'), false)
})

Deno.test('sem a seção Empresa, o Agente é mandado perguntar o que a empresa vende antes de propor ICP', () => {
  for (const secoes of [[], [icp]]) {
    const texto = contextoDoPlaybook(secoes)
    assertStringIncludes(texto, 'ainda não tem a seção Empresa')
    assertStringIncludes(texto, 'o que a empresa vende')
    assertStringIncludes(texto, 'STATUS: pergunta')
  }
  assertStringIncludes(contextoDoPlaybook([icp]), '### ICP')
})

Deno.test('uma seção vazia não conta como escrita: sem texto e sem linhas, a Empresa continua faltando', () => {
  const vazia: SecaoDoPlaybookNaExecucao = { section: 'empresa', name: 'Empresa', content: { texto: '  ', linhas: [] } }
  assertStringIncludes(contextoDoPlaybook([vazia]), 'ainda não tem a seção Empresa')
  assertEquals(contextoDoPlaybook([vazia]).includes('### Empresa'), false)
})

Deno.test('o Playbook longo é cortado, com o aviso', () => {
  const longa: SecaoDoPlaybookNaExecucao = {
    section: 'empresa',
    name: 'Empresa',
    content: { texto: 'a'.repeat(MAX_CARACTERES_DO_PLAYBOOK + 5000) },
  }
  const texto = contextoDoPlaybook([longa])
  assertStringIncludes(texto, 'o Playbook foi cortado por ser longo')
  assertEquals(texto.length < MAX_CARACTERES_DO_PLAYBOOK + 1500, true)
})

Deno.test('sem leitura do Playbook (undefined), nada é dito: o Agente trabalha como antes', () => {
  assertEquals(contextoDoPlaybook(undefined), '')
})

Deno.test('o contexto nunca traz dado de Contatos: só o que o Playbook tem', () => {
  const texto = contextoDoPlaybook([empresa, icp])
  for (const proibido of ['@', 'telefone', 'e-mail', 'linkedin.com']) {
    assertEquals(texto.toLowerCase().includes(proibido), false, proibido)
  }
})

function bancoComPlaybook(resposta: SecaoDoPlaybookNaExecucao[] | Error | 'sem') {
  const leituras: string[] = []
  const db = {
    claim: () => Promise.resolve(null),
    append: () => Promise.resolve(1),
    finish: () => Promise.resolve(),
    searchAccounts: () => Promise.resolve([]),
    ...(resposta === 'sem' ? {} : {
      playbook: (_runId: string, specialty: string) => {
        leituras.push(specialty)
        return resposta instanceof Error ? Promise.reject(resposta) : Promise.resolve(resposta)
      },
    }),
  } as RunDb
  return { db, leituras }
}

Deno.test('o leitor lê o Playbook uma vez por Especialidade, mesmo com várias rodadas', async () => {
  const { db, leituras } = bancoComPlaybook([empresa])
  const ler = leitorDoPlaybook(db, 'r1', () => {}, 'agent_run')
  await ler('scopus')
  await ler('scopus')
  await ler('ethos')
  assertEquals(leituras, ['scopus', 'ethos'])
})

Deno.test('se a leitura falha, o Agente segue sem o contexto e a falha vai para o log', async () => {
  const { db } = bancoComPlaybook(new Error('banco caiu'))
  const logs: Record<string, unknown>[] = []
  const texto = await leitorDoPlaybook(db, 'r1', (campos) => logs.push(campos), 'hermes_worker')('scopus')
  assertEquals(texto, '')
  assertEquals([logs[0].type, logs[0].outcome], ['hermes_worker', 'playbook_failed'])
})

Deno.test('um banco sem a leitura do Playbook roda como antes', async () => {
  const { db } = bancoComPlaybook('sem')
  assertEquals(await leitorDoPlaybook(db, 'r1', () => {}, 'agent_run')('scopus'), '')
})

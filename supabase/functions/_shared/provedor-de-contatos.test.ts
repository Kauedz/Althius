import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import {
  CascataProvedorDeContatos,
  type DadoRevelado,
  fornecedoresDaCascata,
  type PessoaEncontrada,
  type ProvedorDeContatos,
} from './provedor-de-contatos.ts'
import type { Apify } from '../signal-scan/handler.ts'

const empresa = { nome: 'Empresa Exemplo' }

const pessoa = (nome: string, fonte: string): PessoaEncontrada => ({ nome, fonte })

/** Um fornecedor falso que anota cada chamada e devolve as pessoas dadas, ou lança o erro dado. */
function fornecedor(nome: string, resposta: PessoaEncontrada[] | Error, chamadas: string[]): ProvedorDeContatos {
  return {
    nome,
    buscarPessoas() {
      chamadas.push(nome)
      return resposta instanceof Error ? Promise.reject(resposta) : Promise.resolve(resposta)
    },
  }
}

Deno.test('cascata: buscar pessoas para no primeiro fornecedor que acha e não chama o seguinte', async () => {
  const chamadas: string[] = []
  const cascata = new CascataProvedorDeContatos([
    fornecedor('primeiro', [], chamadas),
    fornecedor('segundo', [pessoa('Ana Souza', 'segundo')], chamadas),
    fornecedor('terceiro', [pessoa('Bruno Lima', 'terceiro')], chamadas),
  ])

  const pessoas = await cascata.buscarPessoas(empresa)

  assertEquals(pessoas, [pessoa('Ana Souza', 'segundo')])
  assertEquals(chamadas, ['primeiro', 'segundo'])
})

Deno.test('cascata: buscar pessoas sem achar em nenhum fornecedor devolve lista vazia depois de tentar todos', async () => {
  const chamadas: string[] = []
  const cascata = new CascataProvedorDeContatos([
    fornecedor('primeiro', [], chamadas),
    fornecedor('segundo', [], chamadas),
  ])

  assertEquals(await cascata.buscarPessoas(empresa), [])
  assertEquals(chamadas, ['primeiro', 'segundo'])
})

Deno.test('cascata: buscar pessoas segue para o próximo fornecedor quando um falha no meio', async () => {
  const chamadas: string[] = []
  const cascata = new CascataProvedorDeContatos([
    fornecedor('primeiro', [], chamadas),
    fornecedor('segundo', new Error('O Apify não respondeu.'), chamadas),
    fornecedor('terceiro', [pessoa('Bruno Lima', 'terceiro')], chamadas),
  ])

  assertEquals(await cascata.buscarPessoas(empresa), [pessoa('Bruno Lima', 'terceiro')])
  assertEquals(chamadas, ['primeiro', 'segundo', 'terceiro'])
})

Deno.test('cascata: buscar pessoas lança a falha quando um fornecedor falha e nenhum acha (falha não é lista vazia)', async () => {
  const chamadas: string[] = []
  const cascata = new CascataProvedorDeContatos([
    fornecedor('primeiro', new Error('A busca do comitê não devolveu uma lista de pessoas.'), chamadas),
    fornecedor('segundo', [], chamadas),
  ])

  await assertRejects(
    () => cascata.buscarPessoas(empresa),
    Error,
    'A busca do comitê não devolveu uma lista de pessoas.',
  )
  assertEquals(chamadas, ['primeiro', 'segundo'])
})

const contato = { nome: 'Ana Souza', linkedinUrl: 'https://www.linkedin.com/in/ana-souza' }

const email = (valor: string, fonte: string): DadoRevelado => ({ canal: 'email', valor, fonte })

/** Um fornecedor falso que só revela: anota cada chamada e devolve o dado dado, ou lança o erro dado. */
function revelador(nome: string, resposta: DadoRevelado | null | Error, chamadas: string[]): ProvedorDeContatos {
  return {
    nome,
    buscarPessoas: () => Promise.resolve([]),
    revelarContato() {
      chamadas.push(nome)
      return resposta instanceof Error ? Promise.reject(resposta) : Promise.resolve(resposta)
    },
  }
}

Deno.test('cascata: revelar para no primeiro fornecedor que acha e não chama o seguinte', async () => {
  const chamadas: string[] = []
  const cascata = new CascataProvedorDeContatos([
    revelador('primeiro', null, chamadas),
    revelador('segundo', email('ana@exemplo.com.br', 'segundo'), chamadas),
    revelador('terceiro', email('ana.souza@exemplo.com.br', 'terceiro'), chamadas),
  ])

  assertEquals(await cascata.revelarContato(contato, 'email'), email('ana@exemplo.com.br', 'segundo'))
  assertEquals(chamadas, ['primeiro', 'segundo'])
})

Deno.test('cascata: revelar sem achar em nenhum fornecedor devolve null depois de tentar todos', async () => {
  const chamadas: string[] = []
  const cascata = new CascataProvedorDeContatos([
    revelador('primeiro', null, chamadas),
    revelador('segundo', null, chamadas),
  ])

  assertEquals(await cascata.revelarContato(contato, 'email'), null)
  assertEquals(chamadas, ['primeiro', 'segundo'])
})

Deno.test('cascata: revelar segue para o próximo fornecedor quando um falha no meio', async () => {
  const chamadas: string[] = []
  const cascata = new CascataProvedorDeContatos([
    revelador('primeiro', null, chamadas),
    revelador('segundo', new Error('O Apify não respondeu.'), chamadas),
    revelador('terceiro', email('ana@exemplo.com.br', 'terceiro'), chamadas),
  ])

  assertEquals(await cascata.revelarContato(contato, 'email'), email('ana@exemplo.com.br', 'terceiro'))
  assertEquals(chamadas, ['primeiro', 'segundo', 'terceiro'])
})

Deno.test('cascata: revelar lança a falha quando um fornecedor falha e nenhum acha (falha não é "não encontrado")', async () => {
  const chamadas: string[] = []
  const cascata = new CascataProvedorDeContatos([
    revelador('primeiro', null, chamadas),
    revelador('segundo', new Error('A busca do e-mail não devolveu uma lista de perfis.'), chamadas),
  ])

  await assertRejects(
    () => cascata.revelarContato(contato, 'email'),
    Error,
    'A busca do e-mail não devolveu uma lista de perfis.',
  )
  assertEquals(chamadas, ['primeiro', 'segundo'])
})

const apifyQueNaoRoda: Apify = {
  run: () => Promise.reject(new Error('o teste não roda actor')),
}

Deno.test('fornecedores da cascata: a cascata padrão da Althius tem só o Apify, sem Apollo, Lusha nem Clay', () => {
  assertEquals(fornecedoresDaCascata({ apify: apifyQueNaoRoda }).map((f) => f.nome), ['apify'])
})

Deno.test('fornecedores da cascata: sem o Apify configurado, a cascata padrão fica vazia', () => {
  assertEquals(fornecedoresDaCascata({}).map((f) => f.nome), [])
})

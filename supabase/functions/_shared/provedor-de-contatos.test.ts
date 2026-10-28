import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import {
  ApifyProvedorDeContatos,
  ApolloProvedorDeContatos,
  ApolloProvedorStub,
  CascataProvedorDeContatos,
  type DadoRevelado,
  fonteDoCliente,
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

Deno.test('Apollo: busca pelo domínio e cargos no MCP do Apollo e marca a origem apollo', async () => {
  const pedidos: Array<{ ferramenta: string; argumentos: Record<string, unknown> }> = []
  const provedor = new ApolloProvedorDeContatos(async (ferramenta, argumentos) => {
    pedidos.push({ ferramenta, argumentos })
    // O MCP devolve o JSON como texto no conteúdo.
    return { erro: false, conteudo: [{ type: 'text', text: JSON.stringify({ people: [
      { first_name: 'Ana', last_name: 'Souza', title: 'Diretora Comercial', linkedin_url: 'https://linkedin.com/in/ana', city: 'São Paulo', country: 'Brazil' },
      { title: 'Sem nome' },
    ] }) }] }
  })
  const pessoas = await provedor.buscarPessoas({ nome: 'Acme', dominio: 'acme.test', cargos: ['Diretora'], limite: 3 })
  assertEquals(pedidos, [{
    ferramenta: 'apollo_people_search',
    argumentos: { per_page: 3, page: 1, q_organization_domains_list: ['acme.test'], person_titles: ['Diretora'] },
  }])
  assertEquals(pessoas.length, 1)
  assertEquals(pessoas[0].nome, 'Ana Souza')
  assertEquals(pessoas[0].localizacao, 'São Paulo, Brazil')
  assertEquals(pessoas[0].fonte, 'apollo')
  assertEquals(fonteDoCliente(pessoas[0].fonte), true)
})

Deno.test('Apollo: sem domínio, busca pelo nome da empresa', async () => {
  let argumentos: Record<string, unknown> = {}
  const provedor = new ApolloProvedorDeContatos(async (_f, a) => {
    argumentos = a
    return { estruturado: { people: [] } }
  })
  assertEquals(await provedor.buscarPessoas({ nome: 'Acme' }), [])
  assertEquals(argumentos.q_keywords, 'Acme')
  assertEquals('q_organization_domains_list' in argumentos, false)
})

Deno.test('Apollo: revela só e-mail de verdade, com origem apollo; telefone não chama o Apollo', async () => {
  const chamadas: string[] = []
  let resposta: unknown = { estruturado: { person: { email: ' ana@acme.test ' } } }
  const provedor = new ApolloProvedorDeContatos(async (ferramenta) => {
    chamadas.push(ferramenta)
    return resposta
  })
  assertEquals(await provedor.revelarContato(contato, 'telefone'), null)
  assertEquals(chamadas, [])
  assertEquals(await provedor.revelarContato(contato, 'email'), { canal: 'email', valor: 'ana@acme.test', fonte: 'apollo' })
  assertEquals(chamadas, ['apollo_people_enrichment'])
  resposta = { estruturado: { person: { email: 'email_not_unlocked@domain.com' } } }
  assertEquals(await provedor.revelarContato(contato, 'email'), null)
  resposta = { estruturado: { person: null } }
  assertEquals(await provedor.revelarContato(contato, 'email'), null)
})

Deno.test('fontes do cliente: Apollo e CRM não cobram Créditos Althius; Apify e o resto cobram', () => {
  assertEquals(fonteDoCliente('apollo'), true)
  assertEquals(fonteDoCliente('crm:hubspot'), true)
  assertEquals(fonteDoCliente('APOLLO'), true)
  assertEquals(fonteDoCliente('apify'), false)
  assertEquals(fonteDoCliente('apollonia'), false)
  assertEquals(fonteDoCliente(null), false)
})

Deno.test('cascata: Apify primeiro; Apollo e CRM só quando a fonte anterior não acha ou falha', async () => {
  const ordem: string[] = []
  const fonte = (nome: string, acha: boolean | 'falha'): ProvedorDeContatos => ({
    nome,
    buscarPessoas: () => {
      ordem.push(nome)
      if (acha === 'falha') return Promise.reject(new Error(`${nome} caiu`))
      return Promise.resolve(acha ? [{ nome: `Pessoa ${nome}`, fonte: nome }] : [])
    },
  })
  const cascata = (apify: boolean | 'falha', apollo: boolean | 'falha', crm: boolean | 'falha') =>
    new CascataProvedorDeContatos([fonte('apify', apify), fonte('apollo', apollo), fonte('crm', crm)])

  assertEquals((await cascata(true, true, true).buscarPessoas({ nome: 'Acme' }))[0].fonte, 'apify')
  assertEquals(ordem, ['apify'])
  ordem.length = 0
  assertEquals((await cascata(false, true, true).buscarPessoas({ nome: 'Acme' }))[0].fonte, 'apollo')
  assertEquals(ordem, ['apify', 'apollo'])
  ordem.length = 0
  assertEquals((await cascata(false, 'falha', true).buscarPessoas({ nome: 'Acme' }))[0].fonte, 'crm')
  ordem.length = 0
  assertEquals(await cascata(false, false, false).buscarPessoas({ nome: 'Acme' }), [])
})

Deno.test('fornecedores da cascata: Apify, depois Apollo e CRM conectados', () => {
  const apollo = new ApolloProvedorStub()
  const crm: ProvedorDeContatos = { nome: 'crm', buscarPessoas: () => Promise.resolve([]) }
  assertEquals(fornecedoresDaCascata({ apify: apifyQueNaoRoda, apollo, crm }).map((f) => f.nome), ['apify', 'apollo', 'crm'])
  assertEquals(fornecedoresDaCascata({ apollo }).map((f) => f.nome), ['apollo'])
})

// --- B3: leitura de emails[i].email na saída real do actor ---
// B3: formato real da saída do harvestapi~linkedin-profile-scraper (build 0.0.135, modo
// 'Profile details + email search ($10 per 1k)'), confirmado nos runs 4uNBrExLfebRmntCf (com e-mail)
// e JINU8l6sWgWksEUIH (`emails: null`).
function perfilReal(emails: unknown, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    firstName: 'Mariana',
    lastName: 'Souza',
    linkedinUrl: 'https://www.linkedin.com/in/marianasouza',
    // validEmailServer da empresa não é e-mail.
    companyWebsites: [{ url: 'https://techcorp.com.br', validEmailServer: true }],
    emails,
    ...extra,
  }
}

function itemDeEmail(email: unknown, status = 'risky'): Record<string, unknown> {
  return { email, status, qualityScore: 60, validEmailServer: true, catchAllDomain: false, free: false }
}

async function revelar(items: unknown[]) {
  const apify: Apify = {
    async run() {
      return { runId: 'apify-run-perfil', items }
    },
  }
  const provedor = new ApifyProvedorDeContatos({ apify })
  return await provedor.revelarContato(
    { nome: 'Mariana Souza', linkedinUrl: 'https://www.linkedin.com/in/marianasouza' },
    'email',
  )
}

Deno.test('revelarContato: `emails` null é "não encontrado" (run JINU8l6sWgWksEUIH)', async () => {
  assertEquals(await revelar([perfilReal(null)]), null)
})

Deno.test('revelarContato: perfil sem o campo `emails` é "não encontrado"', async () => {
  const perfil = perfilReal(undefined)
  delete perfil.emails
  assertEquals(await revelar([perfil]), null)
})

Deno.test('revelarContato: `emails` vazio é "não encontrado"', async () => {
  assertEquals(await revelar([perfilReal([])]), null)
})

Deno.test('revelarContato: um item devolve emails[0].email (run 4uNBrExLfebRmntCf)', async () => {
  assertEquals(await revelar([perfilReal([itemDeEmail('mariana@techcorp.com.br')])]), {
    canal: 'email',
    valor: 'mariana@techcorp.com.br',
    fonte: 'linkedin_publico',
  })
})

Deno.test('revelarContato: o e-mail volta sem espaços nas pontas', async () => {
  const revelado = await revelar([perfilReal([itemDeEmail('  mariana@techcorp.com.br ')])])
  assertEquals(revelado?.valor, 'mariana@techcorp.com.br')
})

Deno.test('revelarContato: item sem e-mail válido é ignorado', async () => {
  const revelado = await revelar([perfilReal([
    itemDeEmail(null),
    itemDeEmail(''),
    itemDeEmail('   '),
    itemDeEmail(42),
    itemDeEmail('nao-e-email'),
    { status: 'valid', qualityScore: 90 },
    null,
    'mariana@techcorp.com.br',
  ])])
  assertEquals(revelado, null)
})

Deno.test('revelarContato: vários itens devolvem o primeiro e-mail válido com status diferente de "invalid"', async () => {
  const revelado = await revelar([perfilReal([
    itemDeEmail(''),
    itemDeEmail('velho@techcorp.com.br', 'invalid'),
    itemDeEmail('mariana@techcorp.com.br', 'risky'),
    itemDeEmail('mariana.souza@techcorp.com.br', 'valid'),
  ])])
  assertEquals(revelado?.valor, 'mariana@techcorp.com.br')
})

Deno.test('revelarContato: só e-mails com status "invalid" é "não encontrado"', async () => {
  const revelado = await revelar([perfilReal([itemDeEmail('velho@techcorp.com.br', 'INVALID')])])
  assertEquals(revelado, null)
})

Deno.test('revelarContato: companyWebsites[i].validEmailServer não vira e-mail', async () => {
  assertEquals(await revelar([perfilReal(null, { email: undefined })]), null)
})

Deno.test('revelarContato: `emails` em formato inesperado é falha, não "não encontrado"', async () => {
  await assertRejects(
    () => revelar([perfilReal('mariana@techcorp.com.br')]),
    Error,
    'formato inesperado',
  )
  await assertRejects(() => revelar([perfilReal({ email: 'mariana@techcorp.com.br' })]), Error, 'formato inesperado')
})

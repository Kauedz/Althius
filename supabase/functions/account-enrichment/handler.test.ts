import { assert, assertEquals } from 'jsr:@std/assert@1'
import {
  validarCnpj,
  formatarCnpj,
  consultarBrasilApi,
  consultarApifyReceita,
  criarHandlerEnrichment,
  type DbEnrichment,
} from './handler.ts'
import {
  classificarPersona,
  extrairIdentificadorLinkedin,
  ApifyProvedorDeContatos,
  CascataProvedorDeContatos,
  ApolloProvedorStub,
} from '../_shared/provedor-de-contatos.ts'
import { clienteDoApify } from '../signal-scan/apify.ts'
import { ApifyTimeoutError, type Apify } from '../signal-scan/handler.ts'

Deno.test('validarCnpj: aceita CNPJ válido com 14 dígitos e calcula os dígitos verificadores', () => {
  // CNPJ da Ambev S.A.: 07.526.557/0001-00
  assertEquals(validarCnpj('07.526.557/0001-00'), '07526557000100')
  // CNPJ formatado ou com pontos/barras
  assertEquals(validarCnpj('07526557000100'), '07526557000100')
  // CNPJ inválido
  assertEquals(validarCnpj('07.526.557/0001-99'), null)
  // CNPJ repetido
  assertEquals(validarCnpj('11.111.111/1111-11'), null)
  // Tamanho incorreto
  assertEquals(validarCnpj('123456'), null)
})

Deno.test('formatarCnpj: formata 14 dígitos com máscara', () => {
  assertEquals(formatarCnpj('07526557000100'), '07.526.557/0001-00')
})

Deno.test('classificarPersona: identifica corretamente Decisor, Influenciador e Campeão', () => {
  assertEquals(classificarPersona('Chief Executive Officer'), 'Decisor')
  assertEquals(classificarPersona('Diretor de Operações e Logística'), 'Decisor')
  assertEquals(classificarPersona('VP de Vendas'), 'Decisor')
  assertEquals(classificarPersona('Co-founder & Head of Growth'), 'Decisor')

  assertEquals(classificarPersona('Gerente de TI'), 'Influenciador')
  assertEquals(classificarPersona('Coordenadora de Marketing'), 'Influenciador')
  assertEquals(classificarPersona('Tech Lead'), 'Influenciador')

  assertEquals(classificarPersona('Analista de Suporte Pleno'), 'Campeao')
  assertEquals(classificarPersona('Engenheiro de Software'), 'Campeao')
  assertEquals(classificarPersona('SDR / Pré-vendas'), 'Campeao')

  assertEquals(classificarPersona('Estagiário de Comunicação'), 'Outro')
})

Deno.test('extrairIdentificadorLinkedin: obtém o slug da empresa', () => {
  assertEquals(
    extrairIdentificadorLinkedin('https://www.linkedin.com/company/logiflow-brasil/'),
    'logiflow-brasil',
  )
  assertEquals(
    extrairIdentificadorLinkedin('https://linkedin.com/school/usp-oficial'),
    'usp-oficial',
  )
  assertEquals(extrairIdentificadorLinkedin(undefined), null)
})

Deno.test('consultarApifyReceita: mapeia retorno do Actor com QSA, CNAE e endereço', async () => {
  const fakeApify: Apify = {
    async run() {
      return {
        runId: 'apify-run-1',
        items: [
          {
            razaoSocial: 'LOGIFLOW BRASIL LOGISTICA INTELIGENTE S.A.',
            nomeFantasia: 'LOGIFLOW BRASIL',
            situacaoCadastral: 'ATIVA',
            dataSituacaoCadastral: '2020-05-10',
            cnaePrincipal: { codigo: '4930202', descricao: 'Transporte rodoviário de carga' },
            cnaesSecundarios: [{ codigo: '5211799', descricao: 'Depósitos de mercadorias' }],
            capitalSocial: 5000000,
            porte: 'DEMAIS',
            endereco: {
              logradouro: 'AV SETE DE SETEMBRO',
              numero: '1000',
              municipio: 'CURITIBA',
              uf: 'PR',
              cep: '80000000',
            },
            telefones: ['4130304040'],
            email: 'contato@logiflow.com.br',
            socios: [
              { nome: 'CARLOS ALBERTO SILVA', cargo: 'Presidente', qualificacao: 'Diretor' },
              { nome: 'MARIANA SANTOS', cargo: 'Diretora Financeira', qualificacao: 'Diretor' },
            ],
          },
        ],
      }
    },
  }

  const dados = await consultarApifyReceita('07526557000100', fakeApify)
  assert(dados !== null)
  assertEquals(dados.razaoSocial, 'LOGIFLOW BRASIL LOGISTICA INTELIGENTE S.A.')
  assertEquals(dados.nomeFantasia, 'LOGIFLOW BRASIL')
  assertEquals(dados.cnaePrincipal.codigo, '4930202')
  assertEquals(dados.cnaesSecundarios.length, 1)
  assertEquals(dados.socios.length, 2)
  assertEquals(dados.socios[0].nome, 'CARLOS ALBERTO SILVA')
  assertEquals(dados.fonte, 'apify')
})

Deno.test('consultarBrasilApi: mapeia retorno da BrasilAPI como fallback', async () => {
  const fakeFetch: typeof fetch = async () => {
    return new Response(
      JSON.stringify({
        cnpj: '07526557000100',
        razao_social: 'EMPRESA BRASILAPI TESTE LTDA',
        nome_fantasia: 'BRASILAPI TESTE',
        descricao_situacao_cadastral: 'ATIVA',
        cnae_fiscal: 6201501,
        cnae_fiscal_descricao: 'Desenvolvimento de programas',
        cnaes_secundarios: [],
        capital_social: 100000,
        porte: 'ME',
        logradouro: 'RUA DAS FLORES',
        numero: '123',
        municipio: 'SAO PAULO',
        uf: 'SP',
        ddd_telefone_1: '11999998888',
        qsa: [{ nome_socio: 'ROBERTO CARLOS', qualificacao_socio: 'Sócio-Administrador' }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const dados = await consultarBrasilApi('07526557000100', fakeFetch)
  assert(dados !== null)
  assertEquals(dados.razaoSocial, 'EMPRESA BRASILAPI TESTE LTDA')
  assertEquals(dados.cnaePrincipal.codigo, '6201501')
  assertEquals(dados.socios[0].nome, 'ROBERTO CARLOS')
  assertEquals(dados.fonte, 'brasilapi')
})

Deno.test('handler comite-compra: busca pessoas, classifica personas e debita 1 crédito por contato', async () => {
  let finishedCredits = -1
  const proposedRecords: string[] = []

  const db: DbEnrichment = {
    async userFromJwt() {
      return { userId: 'user-1' }
    },
    async beginCommitteeDiscovery() {
      return { runId: 'run-comite-1', reservationId: 'res-comite-1' }
    },
    async finishCommitteeDiscovery(args) {
      finishedCredits = args.contactsFound
    },
    async recordProposedContact(args) {
      proposedRecords.push(args.name)
      return { id: `prop-${proposedRecords.length}`, created: true }
    },
    async getContactForReveal() {
      return null
    },
    async beginRevealContact() {
      return { reservationId: 'res-1' }
    },
    async finishRevealContact() {
      return { success: false, debitedCredits: 0 }
    },
  }

  const mockPessoas = [
    {
      nome: 'Ana Paula Dias',
      cargo: 'Chief Technology Officer',
      headline: 'CTO @ Tech Corp',
      linkedinUrl: 'https://linkedin.com/in/anapauladias',
      persona: 'Decisor' as const,
      fonte: 'mock',
    },
    {
      nome: 'Bruno Lima',
      cargo: 'Gerente de Engenharia',
      headline: 'Engineering Manager',
      linkedinUrl: 'https://linkedin.com/in/brunolima',
      persona: 'Influenciador' as const,
      fonte: 'mock',
    },
  ]

  const handler = criarHandlerEnrichment({
    db,
    provedorContatos: new ApolloProvedorStub(mockPessoas),
  })

  const req = new Request('http://localhost/account-enrichment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-1' },
    body: JSON.stringify({
      action: 'comite-compra',
      workspaceId: 'ws-1',
      targetAccountId: 'conta-1',
      companyName: 'Tech Corp',
    }),
  })

  const res = await handler(req)
  assertEquals(res.status, 200)
  const body = await res.json()

  assertEquals(body.runId, 'run-comite-1')
  assertEquals(body.contactsFound, 2)
  assertEquals(body.contactsAdded, 2)
  assertEquals(finishedCredits, 2) // 1 crédito por contato encontrado!
  assertEquals(proposedRecords, ['Ana Paula Dias', 'Bruno Lima'])
})

Deno.test('handler revelar-contato: debita 2 créditos para e-mail e só quando acha', async () => {
  let debited = -1

  const db: DbEnrichment = {
    async userFromJwt() {
      return { userId: 'user-1' }
    },
    async beginCommitteeDiscovery() {
      return { runId: '', reservationId: '' }
    },
    async finishCommitteeDiscovery() {},
    async recordProposedContact() {
      return { id: '', created: true }
    },
    async getContactForReveal() {
      return { name: 'Mariana Souza', linkedin: 'https://linkedin.com/in/marianasouza' }
    },
    async beginRevealContact() {
      return { reservationId: 'res-reveal-email' }
    },
    async finishRevealContact(args) {
      if (args.value) {
        debited = 2
        return { success: true, debitedCredits: 2 }
      } else {
        debited = 0
        return { success: false, debitedCredits: 0 }
      }
    },
  }

  const provedorComEmail = {
    nome: 'fake',
    async buscarPessoas() {
      return []
    },
    async revelarContato() {
      return { canal: 'email' as const, valor: 'mariana@techcorp.com.br', fonte: 'fake-test' }
    },
  }

  const handler = criarHandlerEnrichment({ db, provedorContatos: provedorComEmail })

  const req = new Request('http://localhost/account-enrichment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-1' },
    body: JSON.stringify({
      action: 'revelar-contato',
      workspaceId: 'ws-1',
      contactId: 'contato-1',
      canal: 'email',
    }),
  })

  const res = await handler(req)
  assertEquals(res.status, 200)
  const body = await res.json()

  assertEquals(body.sucesso, true)
  assertEquals(body.valor, 'mariana@techcorp.com.br')
  assertEquals(body.creditosDebitados, 2)
  assertEquals(debited, 2)
})

Deno.test('handler revelar-contato: quando NÃO acha, não debita nenhum crédito (0 créditos)', async () => {
  let debited = -1

  const db: DbEnrichment = {
    async userFromJwt() {
      return { userId: 'user-1' }
    },
    async beginCommitteeDiscovery() {
      return { runId: '', reservationId: '' }
    },
    async finishCommitteeDiscovery() {},
    async recordProposedContact() {
      return { id: '', created: true }
    },
    async getContactForReveal() {
      return { name: 'Contato Sem Telefone', linkedin: 'https://linkedin.com/in/sem-tel' }
    },
    async beginRevealContact() {
      return { reservationId: 'res-reveal-tel' }
    },
    async finishRevealContact(args) {
      if (args.value) {
        debited = 5
        return { success: true, debitedCredits: 5 }
      } else {
        debited = 0
        return { success: false, debitedCredits: 0 }
      }
    },
  }

  const provedorSemResultado = {
    nome: 'fake',
    async buscarPessoas() {
      return []
    },
    async revelarContato() {
      return null
    },
  }

  const handler = criarHandlerEnrichment({ db, provedorContatos: provedorSemResultado })

  const req = new Request('http://localhost/account-enrichment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-1' },
    body: JSON.stringify({
      action: 'revelar-contato',
      workspaceId: 'ws-1',
      contactId: 'contato-2',
      canal: 'email',
    }),
  })

  const res = await handler(req)
  assertEquals(res.status, 200)
  const body = await res.json()

  assertEquals(body.sucesso, false)
  assertEquals(body.valor, null)
  assertEquals(body.creditosDebitados, 0)
  assertEquals(debited, 0) // NENHUM crédito debitado quando não encontra!
})

const CNPJ_LOGIFLOW = '07.526.557/0001-00'
const ITEM_RECEITA = {
  razaoSocial: 'LOGIFLOW BRASIL S.A.',
  situacaoCadastral: 'ATIVA',
  cnaePrincipal: { codigo: '4930202', descricao: 'Transporte rodoviário de carga' },
}

function dbDaReceita(opcoes: {
  passos: string[]
  user?: { userId: string } | null
  begin?: () => Promise<{ reservationId: string }>
}): DbEnrichment {
  return {
    async userFromJwt() {
      opcoes.passos.push('sessao')
      return opcoes.user === undefined ? { userId: 'user-1' } : opcoes.user
    },
    async beginCommitteeDiscovery() {
      return { runId: '', reservationId: '' }
    },
    async finishCommitteeDiscovery() {},
    async recordProposedContact() {
      return { id: '', created: true }
    },
    async getContactForReveal() {
      return null
    },
    async beginRevealContact() {
      return { reservationId: '' }
    },
    async finishRevealContact() {
      return { success: false, debitedCredits: 0 }
    },
    async beginCnpjReceita() {
      opcoes.passos.push('begin')
      return opcoes.begin ? opcoes.begin() : { reservationId: 'res-cnpj' }
    },
    async finishCnpjReceita(args: { found: boolean }) {
      opcoes.passos.push(`finish:${args.found}`)
      return { debitedCredits: args.found ? 1 : 0 }
    },
    async saveReceitaEnrichment() {
      opcoes.passos.push('save')
    },
    async recordDiscoveryCost(args: { runId: string; costUsd: number | null }) {
      opcoes.passos.push(`custo:${args.costUsd}:${args.runId}`)
    },
  } as DbEnrichment
}

function pedidoReceita(authorization = 'Bearer jwt-da-ana') {
  return new Request('http://localhost/account-enrichment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authorization, apikey: 'chave-anon' },
    body: JSON.stringify({
      action: 'cnpj-receita',
      workspaceId: 'ws-1',
      targetAccountId: 'conta-1',
      cnpj: CNPJ_LOGIFLOW,
    }),
  })
}

Deno.test('cnpj-receita sem sessão não chama o actor nem a BrasilAPI', async () => {
  const passos: string[] = []
  const apify: Apify = {
    async run() {
      passos.push('actor')
      return { runId: 'run-1', items: [ITEM_RECEITA] }
    },
  }
  const fetchFn: typeof fetch = async () => {
    passos.push('brasil')
    return new Response('{}', { status: 404 })
  }
  const handler = criarHandlerEnrichment({ db: dbDaReceita({ passos, user: null }), apify, fetchFn })
  const res = await handler(pedidoReceita('Bearer chave-anon'))
  assertEquals(res.status, 401)
  assertEquals(await res.json(), { error: 'unauthorized' })
  assertEquals(passos, ['sessao'])
})

Deno.test('cnpj-receita com sessão e sem saldo não chama o actor', async () => {
  const passos: string[] = []
  const apify: Apify = {
    async run() {
      passos.push('actor')
      return { runId: 'run-1', items: [ITEM_RECEITA] }
    },
  }
  const fetchFn: typeof fetch = async () => {
    passos.push('brasil')
    return new Response('{}', { status: 200 })
  }
  const handler = criarHandlerEnrichment({
    db: dbDaReceita({
      passos,
      begin: () => Promise.reject(new Error('insufficient credits')),
    }),
    apify,
    fetchFn,
  })
  const res = await handler(pedidoReceita())
  assertEquals(res.status, 402)
  assertEquals(await res.json(), { error: 'insufficient credits' })
  assertEquals(passos, ['sessao', 'begin'])
})

Deno.test('cnpj-receita com reserva, falha do actor libera a reserva e não debita', async () => {
  const passos: string[] = []
  const apify: Apify = {
    async run() {
      passos.push('actor')
      throw new Error('apify fora')
    },
  }
  const fetchFn: typeof fetch = async () => {
    passos.push('brasil')
    return new Response('nao', { status: 404 })
  }
  const handler = criarHandlerEnrichment({ db: dbDaReceita({ passos }), apify, fetchFn })
  const res = await handler(pedidoReceita())
  assertEquals(res.status, 404)
  assertEquals(await res.json(), { error: 'Dados do CNPJ não encontrados' })
  assertEquals(passos, ['sessao', 'begin', 'actor', 'brasil', 'finish:false'])
})

Deno.test('cnpj-receita com reserva liquida o crédito e grava o custo em dólar quando acha o CNPJ', async () => {
  const passos: string[] = []
  const apify: Apify = {
    async run() {
      passos.push('actor')
      return { runId: 'run-receita-1', items: [ITEM_RECEITA] }
    },
    async custoDaExecucao(runId) {
      passos.push(`mediu:${runId}`)
      return 0.00155
    },
  }
  const fetchFn: typeof fetch = async () => {
    passos.push('brasil')
    return new Response('{}', { status: 200 })
  }
  const handler = criarHandlerEnrichment({ db: dbDaReceita({ passos }), apify, fetchFn })
  const res = await handler(pedidoReceita())
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.razaoSocial, 'LOGIFLOW BRASIL S.A.')
  assertEquals(body.fonte, 'apify')
  assertEquals(passos, [
    'sessao',
    'begin',
    'actor',
    'mediu:run-receita-1',
    'save',
    'finish:true',
    'custo:0.00155:run-receita-1',
  ])
})

// Schema de entrada lido em 2026-10-08 em GET /v2/acts/harvestapi~linkedin-company-employees,
// build 0.0.163 (DvpBSFm17AcocApXs, terminou em 2026-10-07T18:08:05.771Z). Não é um chute:
// companies pede a URL inteira ("Provide full LinkedIn URLs. Example: https://www.linkedin.com/company/google");
// profileScraperMode tem o enum "Short ($4 per 1k)"; jobTitles filtra o cargo.
// O README desse build diz que o modo Short devolve nome, URL do perfil, location e as posições atuais.
// O exemplo de saída traz firstName, lastName, linkedinUrl, headline, photo, location.linkedinText,
// currentPosition[] e experience[].position. A execução real de 30/09/2026, no modo Short, traz o cargo
// em currentPositions[].title. Headline não completa cargo, nome nem LinkedIn.
const MODO_CURTO_DO_SCHEMA = 'Short ($4 per 1k)'

type FinishDoComite = { success: boolean; contactsFound: number; costUsd?: number; error?: string }
type CustoDoComite = { runId: string; items: number; costUsd: number | null; actorId: string }

function registroDoComite() {
  return {
    finish: [] as FinishDoComite[],
    custos: [] as CustoDoComite[],
    propostas: [] as string[],
  }
}

function dbDoComite(registro: {
  finish: FinishDoComite[]
  custos: CustoDoComite[]
  propostas: string[]
}): DbEnrichment {
  return {
    async userFromJwt() {
      return { userId: 'user-1' }
    },
    async beginCommitteeDiscovery() {
      return { runId: 'run-comite-1', reservationId: 'res-comite-1' }
    },
    async finishCommitteeDiscovery(args) {
      registro.finish.push({
        success: args.success,
        contactsFound: args.contactsFound,
        costUsd: args.costUsd,
        error: args.error,
      })
    },
    async recordProposedContact(args) {
      registro.propostas.push(args.name)
      return { id: `prop-${registro.propostas.length}`, created: true }
    },
    async getContactForReveal() {
      return null
    },
    async beginRevealContact() {
      return { reservationId: 'res-1' }
    },
    async finishRevealContact() {
      return { success: false, debitedCredits: 0 }
    },
    async recordDiscoveryCost(args) {
      registro.custos.push({
        runId: args.runId,
        items: args.items,
        costUsd: args.costUsd,
        actorId: args.actorId,
      })
    },
  }
}

function pedidoDeComite() {
  return new Request('http://localhost/account-enrichment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-1' },
    body: JSON.stringify({
      action: 'comite-compra',
      workspaceId: 'ws-1',
      targetAccountId: 'conta-1',
      companyName: 'Acme Logística S.A.',
      companyLinkedinUrl: 'https://www.linkedin.com/company/acme-logistica/',
      cargos: ['Diretor de Operações'],
      limite: 10,
    }),
  })
}

Deno.test('comite-compra: a entrada segue o schema do build 0.0.163 e a saída não estima cargo nem LinkedIn', async () => {
  const entrada: { atual: Record<string, unknown> | null } = { atual: null }
  const registro = registroDoComite()
  const apify: Apify = {
    async run(args) {
      entrada.atual = args.input as Record<string, unknown>
      return {
        runId: 'apify-run-entrada',
        items: [
          {
            firstName: 'Maria',
            lastName: 'Exemplo',
            headline: 'Lidero operações na Acme',
            linkedinUrl: 'https://www.linkedin.com/in/maria-exemplo',
            photo: 'https://exemplo.test/maria.jpg',
            location: { linkedinText: 'São Paulo, Brasil' },
            currentPositions: [{ title: 'Diretora de Operações', companyName: 'Acme Logística' }],
          },
          {
            firstName: 'Joao',
            lastName: 'Sem Cargo',
            headline: 'CEO de verdade',
            profileUrl: 'https://www.linkedin.com/in/nao-documentado',
            location: { linkedinText: 'Curitiba, Brasil' },
          },
          {
            firstName: 'Towhid',
            lastName: 'Rahman',
            headline: 'Pharmacology',
            linkedinUrl: 'https://www.linkedin.com/in/towhid-rahman',
            photo: 'https://exemplo.test/towhid.jpg',
            location: { linkedinText: 'Los Angeles, California, United States' },
            currentPosition: [{ companyName: 'CVS Health' }],
            experience: [{ position: 'Staff Pharmacist', companyName: 'CVS Health', endDate: { text: 'Present' } }],
          },
        ],
      }
    },
    async custoDaExecucao() {
      return 0.044
    },
  }

  const handler = criarHandlerEnrichment({ db: dbDoComite(registro), apify })
  const res = await handler(pedidoDeComite())
  assertEquals(res.status, 200)
  const body = await res.json()

  assertEquals(entrada.atual?.profileScraperMode, MODO_CURTO_DO_SCHEMA)
  assertEquals(entrada.atual?.companies, ['https://www.linkedin.com/company/acme-logistica'])
  assertEquals(entrada.atual?.jobTitles, ['Diretor de Operações'])
  assertEquals(entrada.atual?.maxItems, 10)

  const [maria, joao, towhid] = body.proposed
  assertEquals(maria.cargo, 'Diretora de Operações')
  assertEquals(maria.linkedinUrl, 'https://www.linkedin.com/in/maria-exemplo')
  assertEquals(maria.localizacao, 'São Paulo, Brasil')
  assertEquals(maria.foto, 'https://exemplo.test/maria.jpg')
  assertEquals(maria.persona, 'Decisor')
  assertEquals(joao.cargo, undefined)
  assertEquals(joao.linkedinUrl, undefined)
  assertEquals(towhid.cargo, 'Staff Pharmacist')
  assertEquals(registro.finish[0]?.costUsd, 0.044)
  assertEquals(registro.custos[0], {
    runId: 'apify-run-entrada',
    items: 3,
    costUsd: 0.044,
    actorId: 'harvestapi~linkedin-company-employees',
  })
})

Deno.test('comite-compra: exceção do actor termina em falha, libera o crédito e não vira concluída com zero', async () => {
  const registro = registroDoComite()
  const apify: Apify = {
    async run() {
      throw new Error('O actor do Apify não respondeu a tempo')
    },
  }
  const handler = criarHandlerEnrichment({ db: dbDoComite(registro), apify })
  const res = await handler(pedidoDeComite())
  const body = await res.json()

  assertEquals(res.status === 200, false)
  assertEquals(body.contactsFound, undefined)
  assertEquals(typeof body.error, 'string')
  assertEquals(registro.propostas, [])
  assertEquals(registro.finish, [{
    success: false,
    contactsFound: 0,
    costUsd: undefined,
    error: 'O actor do Apify não respondeu a tempo',
  }])
})

Deno.test('comite-compra: lista vazia fica concluída com zero e grava o custo; resposta que não é lista falha com o custo', async () => {
  const vazia = registroDoComite()
  const apifyVazio: Apify = {
    async run() {
      return { runId: 'apify-run-vazia', items: [] }
    },
    async custoDaExecucao() {
      return 0.02
    },
  }
  const handlerVazio = criarHandlerEnrichment({ db: dbDoComite(vazia), apify: apifyVazio })
  const resVazia = await handlerVazio(pedidoDeComite())
  assertEquals(resVazia.status, 200)
  assertEquals((await resVazia.json()).contactsFound, 0)
  assertEquals(vazia.finish[0], { success: true, contactsFound: 0, costUsd: 0.02, error: undefined })
  assertEquals(vazia.custos[0]?.costUsd, 0.02)
  assertEquals(vazia.custos[0]?.runId, 'apify-run-vazia')

  const ruim = registroDoComite()
  const apifyRuim: Apify = {
    async run() {
      return { runId: 'apify-run-ruim', items: { nao: 'lista' } as unknown as unknown[] }
    },
    async custoDaExecucao() {
      return 0.02
    },
  }
  const handlerRuim = criarHandlerEnrichment({ db: dbDoComite(ruim), apify: apifyRuim })
  const resRuim = await handlerRuim(pedidoDeComite())
  assertEquals(resRuim.status === 200, false)
  assertEquals(ruim.finish[0]?.success, false)
  assertEquals(ruim.finish[0]?.contactsFound, 0)
  assertEquals(ruim.finish[0]?.costUsd, 0.02)
  assertEquals(ruim.custos[0]?.costUsd, 0.02)
  assertEquals(ruim.propostas, [])
})

Deno.test('comite-compra: timeout com id de execução grava o custo e não vira concluída com zero', async () => {
  const registro = registroDoComite()
  const apify: Apify = {
    async run() {
      throw new ApifyTimeoutError('apify-run-timeout')
    },
    async custoDaExecucao(runId) {
      assertEquals(runId, 'apify-run-timeout')
      return 0.07
    },
  }
  const handler = criarHandlerEnrichment({ db: dbDoComite(registro), apify })
  const res = await handler(pedidoDeComite())
  const body = await res.json()

  assertEquals(res.status === 200, false)
  assertEquals(body.error, 'O actor do Apify não respondeu a tempo')
  assertEquals(registro.propostas, [])
  assertEquals(registro.finish, [{
    success: false,
    contactsFound: 0,
    costUsd: 0.07,
    error: 'O actor do Apify não respondeu a tempo',
  }])
  assertEquals(registro.custos[0], {
    runId: 'apify-run-timeout',
    items: 0,
    costUsd: 0.07,
    actorId: 'harvestapi~linkedin-company-employees',
  })
})

// B3: revelar e-mail. O registro guarda a ordem das chamadas ao banco e o que chega ao fim da revelação.
function registroDoRevelar() {
  return {
    passos: [] as string[],
    finish: [] as Array<{ value?: string; source?: string }>,
    custos: [] as Array<{ runId: string; items: number; costUsd: number | null; actorId: string }>,
  }
}

function dbDoRevelar(
  registro: ReturnType<typeof registroDoRevelar>,
  resultado: { success: boolean; debitedCredits: number } = { success: false, debitedCredits: 0 },
): DbEnrichment {
  return {
    async userFromJwt() {
      registro.passos.push('sessao')
      return { userId: 'user-1' }
    },
    async beginCommitteeDiscovery() {
      return { runId: '', reservationId: '' }
    },
    async finishCommitteeDiscovery() {},
    async recordProposedContact() {
      return { id: '', created: true }
    },
    async getContactForReveal() {
      registro.passos.push('contato')
      return { name: 'Mariana Souza', linkedin: 'https://www.linkedin.com/in/marianasouza' }
    },
    async beginRevealContact(args) {
      registro.passos.push(`begin:${args.channel}`)
      return { reservationId: 'res-revelar' }
    },
    async finishRevealContact(args) {
      registro.passos.push('finish')
      registro.finish.push({ value: args.value, source: args.source })
      return resultado
    },
    async recordDiscoveryCost(args) {
      registro.custos.push({ runId: args.runId, items: args.items, costUsd: args.costUsd, actorId: args.actorId })
    },
  }
}

function pedidoDeRevelar(canal: string) {
  return new Request('http://localhost/account-enrichment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-1' },
    body: JSON.stringify({ action: 'revelar-contato', workspaceId: 'ws-1', contactId: 'contato-1', canal }),
  })
}

Deno.test('revelar-contato: telefone é recusado antes de reservar crédito e de chamar o actor', async () => {
  const registro = registroDoRevelar()
  let execucoes = 0
  const apify: Apify = {
    async run() {
      execucoes++
      return { runId: 'nao-devia-rodar', items: [] }
    },
  }
  const handler = criarHandlerEnrichment({ db: dbDoRevelar(registro), apify })
  const res = await handler(pedidoDeRevelar('telefone'))
  const body = await res.json()

  assertEquals(res.status, 400)
  assertEquals(body.error, 'A revelação de telefone está indisponível.')
  assertEquals(registro.passos.some((p) => p.startsWith('begin')), false)
  assertEquals(registro.finish, [])
  assertEquals(execucoes, 0)
})

Deno.test('revelar-contato: falha do actor libera a reserva, grava o custo e não parece "não encontrado"', async () => {
  const registro = registroDoRevelar()
  const apify: Apify = {
    async run() {
      throw new ApifyTimeoutError('apify-run-revelar')
    },
    async custoDaExecucao(runId) {
      assertEquals(runId, 'apify-run-revelar')
      return 0.01
    },
  }
  const handler = criarHandlerEnrichment({ db: dbDoRevelar(registro), apify })
  const res = await handler(pedidoDeRevelar('email'))
  const body = await res.json()

  assertEquals(res.status, 502)
  assertEquals(body.error, 'A busca do e-mail falhou: O actor do Apify não respondeu a tempo')
  assertEquals(body.sucesso, undefined)
  assertEquals(registro.passos, ['sessao', 'contato', 'begin:email', 'finish'])
  assertEquals(registro.finish, [{ value: undefined, source: undefined }])
  assertEquals(registro.custos, [{
    runId: 'apify-run-revelar',
    items: 0,
    costUsd: 0.01,
    actorId: 'harvestapi~linkedin-profile-scraper',
  }])
})

Deno.test('revelar-contato: e-mail que o Contato já tem debita 0 e a resposta não o devolve como novo', async () => {
  const registro = registroDoRevelar()
  const provedorComRepetido = {
    nome: 'fake',
    async buscarPessoas() {
      return []
    },
    async revelarContato() {
      return { canal: 'email' as const, valor: 'mariana@techcorp.com.br', fonte: 'apify:harvestapi~linkedin-profile-scraper' }
    },
  }
  const handler = criarHandlerEnrichment({
    db: dbDoRevelar(registro, { success: false, debitedCredits: 0 }),
    provedorContatos: provedorComRepetido,
  })
  const res = await handler(pedidoDeRevelar('email'))
  const body = await res.json()

  assertEquals(res.status, 200)
  assertEquals(body.sucesso, false)
  assertEquals(body.valor, null)
  assertEquals(body.creditosDebitados, 0)
  assertEquals(registro.finish, [{
    value: 'mariana@techcorp.com.br',
    source: 'apify:harvestapi~linkedin-profile-scraper',
  }])
})

Deno.test('revelar-contato: a entrada segue o schema do build 0.0.135 e o actor sem item termina "não encontrado" com o custo', async () => {
  const registro = registroDoRevelar()
  const entrada: { atual: Record<string, unknown> | null; maxItems?: number } = { atual: null }
  const apify: Apify = {
    async run(args) {
      entrada.atual = args.input as Record<string, unknown>
      entrada.maxItems = args.maxItems
      return { runId: 'apify-run-vazio', items: [] }
    },
    async custoDaExecucao() {
      return 0.004
    },
  }
  const handler = criarHandlerEnrichment({ db: dbDoRevelar(registro), apify })
  const res = await handler(pedidoDeRevelar('email'))
  const body = await res.json()

  assertEquals(entrada.atual, {
    profileScraperMode: 'Profile details + email search ($10 per 1k)',
    queries: ['https://www.linkedin.com/in/marianasouza'],
  })
  assertEquals(entrada.maxItems, 1)
  assertEquals(res.status, 200)
  assertEquals(body.sucesso, false)
  assertEquals(body.creditosDebitados, 0)
  assertEquals(registro.finish, [{ value: undefined, source: undefined }])
  assertEquals(registro.custos, [{
    runId: 'apify-run-vazio',
    items: 1,
    costUsd: 0.004,
    actorId: 'harvestapi~linkedin-profile-scraper',
  }])
})

Deno.test('comite-compra: o cliente do Apify não converte um corpo que não é lista em concluída com zero', async () => {
  const registro = registroDoComite()
  const fetchFn = (async (url: string) => {
    if (url.includes('/actor-runs/')) {
      return new Response(JSON.stringify({ data: { usageTotalUsd: 0.05 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({ data: { message: 'não é lista' } }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-apify-run-id': 'apify-run-corpo' },
    })
  }) as typeof fetch
  const apify = clienteDoApify({ tokens: ['token-de-teste'], fetchFn, log: () => {} })
  const handler = criarHandlerEnrichment({ db: dbDoComite(registro), apify })
  const res = await handler(pedidoDeComite())
  const body = await res.json()

  assertEquals(res.status === 200, false)
  assertEquals(body.error, 'A busca do comitê não devolveu uma lista de pessoas.')
  assertEquals(registro.propostas, [])
  assertEquals(registro.finish[0]?.success, false)
  assertEquals(registro.finish[0]?.contactsFound, 0)
  assertEquals(registro.finish[0]?.costUsd, 0.05)
  assertEquals(registro.custos[0]?.runId, 'apify-run-corpo')
  assertEquals(registro.custos[0]?.costUsd, 0.05)
})

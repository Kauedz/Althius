import { assert, assertEquals } from 'jsr:@std/assert@1'
import {
  validarCnpj,
  formatarCnpj,
  consultarBrasilApi,
  consultarApifyReceita,
  criarHandlerEnrichment,
  TETO_DO_PEDIDO_DO_COMITE,
  type DbEnrichment,
} from './handler.ts'
import { propostaGravada } from './proposta-gravada.ts'
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
    items: 1,
    costUsd: 0.01,
    actorId: 'harvestapi~linkedin-profile-scraper',
  }])
})

Deno.test('revelar-contato: e-mail que já é de outro Contato não grava, debita 0 e não vira erro', async () => {
  const registro = registroDoRevelar()
  const provedorComDeOutro = {
    nome: 'fake',
    async buscarPessoas() {
      return []
    },
    async revelarContato() {
      return { canal: 'email' as const, valor: 'otto@acme.test', fonte: 'apify:harvestapi~linkedin-profile-scraper' }
    },
  }
  // finish_reveal_contact libera a reserva quando o e-mail é de outro Contato (pgTAP revelar_email_so_cobra_valor_novo).
  const handler = criarHandlerEnrichment({
    db: dbDoRevelar(registro, { success: false, debitedCredits: 0 }),
    provedorContatos: provedorComDeOutro,
  })
  const res = await handler(pedidoDeRevelar('email'))
  const body = await res.json()

  assertEquals(res.status, 200)
  assertEquals(body, {
    sucesso: false,
    canal: 'email',
    valor: null,
    creditosDebitados: 0,
    fonte: null,
    lgpd: body.lgpd,
  })
  assertEquals(registro.passos, ['sessao', 'contato', 'begin:email', 'finish'])
})

Deno.test('revelar-contato: perfil com `emails` do actor é achado, grava o e-mail e debita 2', async () => {
  const registro = registroDoRevelar()
  const apify: Apify = {
    async run() {
      // Formato real do build 0.0.135 (run 4uNBrExLfebRmntCf).
      return {
        runId: 'apify-run-perfil',
        items: [{
          firstName: 'Mariana',
          lastName: 'Souza',
          linkedinUrl: 'https://www.linkedin.com/in/marianasouza',
          companyWebsites: [{ url: 'https://techcorp.com.br', validEmailServer: true }],
          emails: [{
            email: 'mariana@techcorp.com.br',
            status: 'risky',
            qualityScore: 60,
            validEmailServer: true,
            catchAllDomain: false,
            free: false,
          }],
        }],
      }
    },
    async custoDaExecucao() {
      return 0.01
    },
  }
  const handler = criarHandlerEnrichment({ db: dbDoRevelar(registro, { success: true, debitedCredits: 2 }), apify })
  const res = await handler(pedidoDeRevelar('email'))
  const body = await res.json()

  assertEquals(res.status, 200)
  assertEquals(body.sucesso, true)
  assertEquals(body.valor, 'mariana@techcorp.com.br')
  assertEquals(body.creditosDebitados, 2)
  assertEquals(body.fonte, 'apify:harvestapi~linkedin-profile-scraper')
  assertEquals(registro.passos, ['sessao', 'contato', 'begin:email', 'finish'])
  assertEquals(registro.finish, [{
    value: 'mariana@techcorp.com.br',
    source: 'apify:harvestapi~linkedin-profile-scraper',
  }])
  assertEquals(registro.custos[0]?.runId, 'apify-run-perfil')
})

Deno.test('revelar-contato: perfil com `emails` null termina "não encontrado", debita 0 e grava o custo', async () => {
  const registro = registroDoRevelar()
  const apify: Apify = {
    async run() {
      // Run JINU8l6sWgWksEUIH: o perfil voltou sem e-mail.
      return {
        runId: 'apify-run-sem-email',
        items: [{ firstName: 'Mariana', lastName: 'Souza', linkedinUrl: 'https://www.linkedin.com/in/marianasouza', emails: null }],
      }
    },
    async custoDaExecucao() {
      return 0.01
    },
  }
  const handler = criarHandlerEnrichment({ db: dbDoRevelar(registro), apify })
  const res = await handler(pedidoDeRevelar('email'))
  const body = await res.json()

  assertEquals(res.status, 200)
  assertEquals(body.sucesso, false)
  assertEquals(body.valor, null)
  assertEquals(body.creditosDebitados, 0)
  assertEquals(registro.finish, [{ value: undefined, source: undefined }])
  assertEquals(registro.custos[0]?.runId, 'apify-run-sem-email')
})

Deno.test('revelar-contato: `emails` em formato inesperado é falha, libera a reserva e não parece "não encontrado"', async () => {
  const registro = registroDoRevelar()
  const apify: Apify = {
    async run() {
      return {
        runId: 'apify-run-formato',
        items: [{ firstName: 'Mariana', lastName: 'Souza', emails: 'mariana@techcorp.com.br' }],
      }
    },
    async custoDaExecucao() {
      return 0.01
    },
  }
  const handler = criarHandlerEnrichment({ db: dbDoRevelar(registro), apify })
  const res = await handler(pedidoDeRevelar('email'))
  const body = await res.json()

  assertEquals(res.status, 502)
  assertEquals(body.error, 'A busca do e-mail falhou: formato inesperado do campo emails na saída do actor')
  assertEquals(registro.finish, [{ value: undefined, source: undefined }])
  assertEquals(registro.custos[0]?.runId, 'apify-run-formato')
})

Deno.test('revelar-contato: provedor sem revelação é falha, não "não encontrado"', async () => {
  const registro = registroDoRevelar()
  const handler = criarHandlerEnrichment({
    db: dbDoRevelar(registro),
    provedorContatos: { nome: 'so-busca', async buscarPessoas() { return [] } },
  })
  const res = await handler(pedidoDeRevelar('email'))

  assertEquals(res.status, 502)
  assertEquals(registro.finish, [{ value: undefined, source: undefined }])
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

Deno.test('comitê descarta linkedin.com como domínio e termina com o run id do Apify', async () => {
  const registro = registroDoComite()
  const db = dbDoComite(registro)
  const finalizacoes: Array<Parameters<DbEnrichment['finishCommitteeDiscovery']>[0]> = []
  db.finishCommitteeDiscovery = async args => { finalizacoes.push(args) }
  const entradas: Record<string, unknown>[] = []
  const apify: Apify = { async run(args) { entradas.push(args.input as Record<string, unknown>); return { runId: 'real', items: [] } }, async custoDaExecucao() { return 0.04 } }
  const handler = criarHandlerEnrichment({ db, apify })
  const request = new Request('http://localhost/account-enrichment', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fake' }, body: JSON.stringify({ action: 'comite-compra', workspaceId: 'ws', targetAccountId: 'conta', companyName: 'TOTVS', companyDomain: 'LinkedIn.com' }) })
  assertEquals((await handler(request)).status, 200)
  assertEquals(entradas[0].companies, ['TOTVS'])
  assertEquals(finalizacoes[0].apifyRunId, 'real')
  assertEquals(finalizacoes[0].costUsd, 0.04)
  apify.run = async () => { throw new ApifyTimeoutError('falha-real') }
  assertEquals((await handler(pedidoDeComite())).status, 502)
  assertEquals(finalizacoes[1].apifyRunId, 'falha-real')
})

Deno.test('revelar passa o nome da Conta-alvo ao provedor', async () => {
  const registro = registroDoRevelar()
  const db = dbDoRevelar(registro)
  db.getContactForReveal = async () => ({ name: 'CFO', linkedin: 'https://www.linkedin.com/in/ACwAA', companyName: 'TOTVS' })
  let empresa: string | undefined
  const provedor = { nome: 'fake', async buscarPessoas() { return [] }, async revelarContato(args: { empresa?: string }) { empresa = args.empresa; return null } }
  const handler = criarHandlerEnrichment({ db, provedorContatos: provedor })
  assertEquals((await handler(pedidoDeRevelar('email'))).status, 200)
  assertEquals(empresa, 'TOTVS')
})

// Nunca cobrar de novo o que já foi descoberto (decisão do Renan, 09/10/2026). O banco em memória faz o que
// record_proposed_contact e finish_committee_discovery fazem: a proposta repetida da Conta (LinkedIn sem caixa) não é
// nova, e a busca debita só as propostas novas que ela criou. O pgTAP nao_recobrar_o_ja_descoberto prova o SQL.
function bancoDoComite(conhecidas: string[] = []) {
  const chave = (url?: string) => url?.trim().replace(/\/+$/, '').toLowerCase()
  const propostas = new Map<string, { runId: string; nova: boolean }>()
  for (const url of conhecidas) propostas.set(chave(url)!, { runId: 'busca-anterior', nova: true })
  const banco = {
    gravadas: [] as string[],
    finish: [] as Array<{ success: boolean; contactsFound: number }>,
    debitado: -1,
    db: null as unknown as DbEnrichment,
  }
  banco.db = {
    async userFromJwt() {
      return { userId: 'user-1' }
    },
    async beginCommitteeDiscovery() {
      return { runId: 'run-comite-2', reservationId: 'res-comite-2' }
    },
    async countKnownCommitteePeople() {
      return propostas.size
    },
    async recordProposedContact(args) {
      banco.gravadas.push(args.name)
      const k = chave(args.linkedinUrl)
      if (k && propostas.has(k)) return { id: `prop-${k}`, created: false }
      if (k) propostas.set(k, { runId: args.discoveryRunId!, nova: true })
      return { id: `prop-${banco.gravadas.length}`, created: true }
    },
    async finishCommitteeDiscovery(args) {
      banco.finish.push({ success: args.success, contactsFound: args.contactsFound })
      banco.debitado = [...propostas.values()].filter((p) => p.runId === args.runId && p.nova).length
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
  }
  return banco
}

function pessoa(nome: string, slug: string) {
  return { nome, linkedinUrl: `https://www.linkedin.com/in/${slug}`, persona: 'Decisor' as const, fonte: 'mock' }
}

function pedidoDeComiteComLimite(limite: number) {
  return new Request('http://localhost/account-enrichment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-1' },
    body: JSON.stringify({
      action: 'comite-compra',
      workspaceId: 'ws-1',
      targetAccountId: 'conta-1',
      companyName: 'TOTVS',
      companyLinkedinUrl: 'https://www.linkedin.com/company/totvs',
      limite,
    }),
  })
}

Deno.test('comite-compra: created=false não conta como nova nem cobra, e volta como já encontrada', async () => {
  const banco = bancoDoComite(['https://www.linkedin.com/in/Fernando-Sollak'])
  const handler = criarHandlerEnrichment({
    db: banco.db,
    provedorContatos: new ApolloProvedorStub([
      pessoa('Ana Nova', 'ana-nova'),
      pessoa('Fernando Sollak', 'fernando-sollak'),
      pessoa('Bia Nova', 'bia-nova'),
    ]),
  })
  const res = await handler(pedidoDeComiteComLimite(5))
  const body = await res.json()

  assertEquals(res.status, 200)
  assertEquals(body.contactsFound, 3)
  assertEquals(body.contactsAdded, 2)
  assertEquals(body.contactsAlreadyKnown, 1)
  assertEquals(body.proposed.map((p: { nome: string; jaEncontrada: boolean }) => `${p.nome}:${p.jaEncontrada}`), [
    'Ana Nova:false',
    'Fernando Sollak:true',
    'Bia Nova:false',
  ])
  assertEquals(banco.finish, [{ success: true, contactsFound: 3 }])
  assertEquals(banco.debitado, 2)
})

Deno.test('comite-compra: lista só com pessoas já encontradas debita 0', async () => {
  const banco = bancoDoComite(['https://www.linkedin.com/in/fernando-sollak', 'https://www.linkedin.com/in/gilsomar-maia'])
  const handler = criarHandlerEnrichment({
    db: banco.db,
    provedorContatos: new ApolloProvedorStub([pessoa('Fernando Sollak', 'Fernando-Sollak'), pessoa('Gilsomar Maia', 'gilsomar-maia')]),
  })
  const res = await handler(pedidoDeComiteComLimite(1))
  const body = await res.json()

  assertEquals(res.status, 200)
  assertEquals(body.contactsAdded, 0)
  assertEquals(body.contactsAlreadyKnown, 2)
  assertEquals(banco.debitado, 0)
})

Deno.test('comite-compra: gravação sem linha devolvida é falha, não conta e não cobra', async () => {
  assertEquals(propostaGravada([{ id: 'prop-1', created: false }]), { id: 'prop-1', created: false })
  assertEquals(propostaGravada([{ id: 'prop-2', created: true }]), { id: 'prop-2', created: true })
  for (const vazio of [[], null, undefined, [{ id: null, created: true }]]) {
    let erro = ''
    try {
      propostaGravada(vazio)
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e)
    }
    assertEquals(erro, 'record_proposed_contact não retornou dados')
  }

  const banco = bancoDoComite()
  banco.db.recordProposedContact = async () => propostaGravada([])
  const handler = criarHandlerEnrichment({
    db: banco.db,
    provedorContatos: new ApolloProvedorStub([pessoa('Ana Nova', 'ana-nova')]),
  })
  const body = await (await handler(pedidoDeComiteComLimite(1))).json()

  assertEquals(body.contactsFound, 0)
  assertEquals(body.contactsAdded, 0)
  assertEquals(banco.finish, [{ success: true, contactsFound: 0 }])
  assertEquals(banco.debitado, 0)
})

Deno.test('comite-compra: pede as já conhecidas a mais, com teto, e para no limite de novas', async () => {
  const conhecidas = ['a', 'b', 'c', 'd', 'e'].map((s) => `https://www.linkedin.com/in/${s}`)
  const banco = bancoDoComite(conhecidas)
  const pedidos: Array<number | undefined> = []
  const handler = criarHandlerEnrichment({
    db: banco.db,
    provedorContatos: {
      nome: 'fake',
      async buscarPessoas(empresa) {
        pedidos.push(empresa.limite)
        return [
          pessoa('A', 'a'), pessoa('B', 'b'), pessoa('Nova 1', 'nova-1'), pessoa('C', 'c'), pessoa('Nova 2', 'nova-2'),
          pessoa('D', 'd'),
        ]
      },
    },
  })
  const body = await (await handler(pedidoDeComiteComLimite(1))).json()

  // Limite 1 + 5 conhecidas: o actor recebe 6. A busca para na primeira nova e não grava a segunda.
  assertEquals(pedidos, [6])
  assertEquals(body.contactsAdded, 1)
  assertEquals(body.contactsAlreadyKnown, 2)
  assertEquals(banco.gravadas, ['A', 'B', 'Nova 1'])
  assertEquals(banco.debitado, 1)

  const muitas = bancoDoComite(Array.from({ length: 80 }, (_, i) => `https://www.linkedin.com/in/p-${i}`))
  const pedidosComTeto: Array<number | undefined> = []
  const comTeto = criarHandlerEnrichment({
    db: muitas.db,
    provedorContatos: { nome: 'fake', async buscarPessoas(empresa) { pedidosComTeto.push(empresa.limite); return [] } },
  })
  await comTeto(pedidoDeComiteComLimite(10))
  assertEquals(pedidosComTeto, [TETO_DO_PEDIDO_DO_COMITE])
})

function dbDoRevelarComExistente(
  registro: ReturnType<typeof registroDoRevelar>,
  existentes: Record<string, { value: string; provider?: string }>,
): DbEnrichment {
  const db = dbDoRevelar(registro)
  db.existingRevealValue = async (args) => {
    registro.passos.push(`existente:${args.workspaceId}:${args.contactId}:${args.channel}:${args.authorization}`)
    return existentes[`${args.workspaceId}/${args.contactId}`] ?? null
  }
  return db
}

Deno.test('revelar-contato: e-mail que o Contato já tem volta sem reservar, sem actor e sem crédito', async () => {
  const registro = registroDoRevelar()
  let execucoes = 0
  const apify: Apify = {
    async run() {
      execucoes++
      return { runId: 'nao-devia-rodar', items: [] }
    },
  }
  const handler = criarHandlerEnrichment({
    db: dbDoRevelarComExistente(registro, {
      'ws-1/contato-1': { value: 'gilsomar@totvs.com.br', provider: 'apify:harvestapi~linkedin-profile-scraper' },
    }),
    apify,
  })
  const res = await handler(pedidoDeRevelar('email'))
  const body = await res.json()

  assertEquals(res.status, 200)
  assertEquals(body.sucesso, true)
  assertEquals(body.jaExistia, true)
  assertEquals(body.valor, 'gilsomar@totvs.com.br')
  assertEquals(body.creditosDebitados, 0)
  assertEquals(body.fonte, 'apify:harvestapi~linkedin-profile-scraper')
  assertEquals(execucoes, 0)
  assertEquals(registro.passos, ['sessao', 'contato', 'existente:ws-1:contato-1:email:Bearer token-1'])
  assertEquals(registro.finish, [])
  assertEquals(registro.custos, [])
})

Deno.test('revelar-contato: o e-mail já revelado no Workspace é lido pelo banco com a sessão e volta sem actor', async () => {
  const registro = registroDoRevelar()
  const provedor = {
    nome: 'fake',
    async buscarPessoas() {
      return []
    },
    async revelarContato(): Promise<null> {
      throw new Error('o actor não devia rodar')
    },
  }
  // Um adicional gravado por set_contact_channels não tem provedor, e a resposta não inventa um.
  const handler = criarHandlerEnrichment({
    db: dbDoRevelarComExistente(registro, { 'ws-1/contato-1': { value: 'mariana.pessoal@acme.test' } }),
    provedorContatos: provedor,
  })
  const body = await (await handler(pedidoDeRevelar('email'))).json()

  assertEquals(body.jaExistia, true)
  assertEquals(body.valor, 'mariana.pessoal@acme.test')
  assertEquals(body.creditosDebitados, 0)
  assertEquals(body.fonte, null)
  assertEquals(registro.passos.some((p) => p.startsWith('begin')), false)
})

Deno.test('revelar-contato: o e-mail de outro Workspace não é reaproveitado; a revelação segue e cobra pelo banco', async () => {
  const registro = registroDoRevelar()
  const provedor = {
    nome: 'fake',
    async buscarPessoas() {
      return []
    },
    async revelarContato() {
      return { canal: 'email' as const, valor: 'mariana@techcorp.com.br', fonte: 'apify:harvestapi~linkedin-profile-scraper' }
    },
  }
  const db = dbDoRevelarComExistente(registro, { 'ws-2/contato-1': { value: 'mariana@outro-workspace.test' } })
  db.finishRevealContact = async (args) => {
    registro.passos.push('finish')
    registro.finish.push({ value: args.value, source: args.source })
    return { success: true, debitedCredits: 2 }
  }
  const handler = criarHandlerEnrichment({ db, provedorContatos: provedor })
  const body = await (await handler(pedidoDeRevelar('email'))).json()

  assertEquals(body.jaExistia, undefined)
  assertEquals(body.valor, 'mariana@techcorp.com.br')
  assertEquals(body.creditosDebitados, 2)
  assertEquals(registro.passos, [
    'sessao',
    'contato',
    'existente:ws-1:contato-1:email:Bearer token-1',
    'begin:email',
    'finish',
  ])
})

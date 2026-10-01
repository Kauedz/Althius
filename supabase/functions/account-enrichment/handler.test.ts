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
import type { Apify } from '../signal-scan/handler.ts'

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
      canal: 'telefone',
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

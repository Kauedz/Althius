import { assert, assertEquals } from 'jsr:@std/assert@1'
import type { PayloadDoEnvio, RefsDoCrm } from '../_shared/envio-ao-crm.ts'
import { type AcessoLido, type BancoDeAcessos, ErroDoBanco } from '../_shared/integration-access.ts'
import { type BancoDoEnvio, createHandler } from './handler.ts'

// Enviar ao CRM pela Edge Function (kanban-de-prospeccao 05): do pedido do Vendedor responsável ao CRM falso, com o banco
// em memória. A rede é um dublê que responde como a API REST de cada CRM.

const WS = '6f1c2d3e-4a5b-4c6d-8e7f-000000000001'
const CONTA = '6f1c2d3e-4a5b-4c6d-8e7f-0000000000c1'
const CHAVE = 'pat-na1-segredo-123456'

const PAYLOAD: PayloadDoEnvio = {
  empresa: { nome: 'Alfa', dominio: 'alfa.test', site: 'https://alfa.test', cnpj: '12.345.678/0001-90', segmento: 'Logística', linkedin: null },
  contatos: [
    { id: 'contato-maria', nome: 'Maria Souza', cargo: 'Diretora', email: 'maria@alfa.test', telefone: '+5511999990001', linkedin: null },
    { id: 'contato-joao', nome: 'João', cargo: null, email: 'joao@alfa.test', telefone: null, linkedin: null },
  ],
  nota: 'Enviada pela Althius.\n\nSinais ativos:\n- Abriu vaga <Gerente>',
}

interface Chamada {
  metodo: string
  url: URL
  corpo: Record<string, unknown> | null
  cabecalhos: Headers
}

type Resposta = { status?: number; corpo: unknown }

/** Uma API REST falsa: cada rota `MÉTODO /caminho` responde em sequência (a última resposta repete). */
function apiFalsa(rotas: Record<string, Resposta[]>) {
  const chamadas: Chamada[] = []
  const fetch: typeof globalThis.fetch = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(entrada))
    const metodo = init?.method ?? 'GET'
    chamadas.push({ metodo, url, corpo: init?.body ? JSON.parse(String(init.body)) : null, cabecalhos: new Headers(init?.headers) })
    const fila = rotas[`${metodo} ${url.pathname}`]
    if (!fila) return new Response('{"message":"rota desconhecida"}', { status: 404 })
    const r = fila.length > 1 ? fila.shift()! : fila[0]
    return new Response(JSON.stringify(r.corpo), { status: r.status ?? 200 })
  }) as typeof globalThis.fetch
  return { fetch, chamadas }
}

function montar(opcoes: {
  integrationId?: string
  kind?: AcessoLido['kind']
  erroAoIniciar?: ErroDoBanco
  previousRefs?: RefsDoCrm
  rotas?: Record<string, Resposta[]>
  semSessao?: boolean
} = {}) {
  const api = apiFalsa(opcoes.rotas ?? {})
  const pedidosDeInicio: Record<string, string>[] = []
  const progressos: RefsDoCrm[] = []
  const conclusoes: { handoffId: string; ok: boolean; refs: RefsDoCrm; erro: string | null }[] = []
  const banco: BancoDoEnvio = {
    iniciar(a) {
      pedidosDeInicio.push(a)
      if (opcoes.erroAoIniciar) return Promise.reject(opcoes.erroAoIniciar)
      return Promise.resolve({ handoffId: 'envio-1', accessKind: opcoes.kind ?? 'api_key', payload: PAYLOAD, previousRefs: opcoes.previousRefs ?? {} })
    },
    progresso: (_id, refs) => (progressos.push(structuredClone(refs)), Promise.resolve()),
    concluir: (a) => (conclusoes.push(a), Promise.resolve(a.ok ? 'enviado' : 'falhou')),
  }
  const acessos: BancoDeAcessos = {
    acessoParaUso: () =>
      Promise.resolve({
        accessId: 'acesso-1',
        kind: opcoes.kind ?? 'api_key',
        state: 'conectado',
        expiresAt: null,
        appPortal: null,
        accountLabel: null,
        segredo: JSON.stringify(opcoes.kind === 'oauth_mcp' ? { access_token: CHAVE } : { api_key: CHAVE }),
      }),
    renovar: () => Promise.resolve(),
    marcarReconexao: () => Promise.resolve(),
    clienteOAuth: () => Promise.resolve(null),
    salvarClienteOAuth: (a) => Promise.resolve({ clientId: a.clientId, clientSecret: a.clientSecret }),
    permissaoDoAgente: () => Promise.resolve(null),
  }
  const handler = createHandler({
    banco,
    acesso: { banco: acessos, ambiente: () => undefined, fetch: api.fetch, agora: () => new Date('2026-10-01T12:00:00Z') },
    userFromJwt: () => Promise.resolve(opcoes.semSessao ? null : { userId: 'usuario-ana' }),
    appOrigin: 'https://app.althius.test',
    log: () => {},
  })
  const enviar = (corpo: Record<string, unknown> = {}) =>
    handler(new Request('https://x/crm-handoff', {
      method: 'POST',
      body: JSON.stringify({ action: 'enviar', workspaceId: WS, targetAccountId: CONTA, integrationId: opcoes.integrationId ?? 'hubspot', ...corpo }),
      headers: { Authorization: 'Bearer jwt', apikey: 'anon', Origin: 'https://app.althius.test' },
    }))
  return { enviar, api, pedidosDeInicio, progressos, conclusoes }
}

const HUBSPOT_OK: Record<string, Resposta[]> = {
  'POST /crm/v3/objects/companies': [{ status: 201, corpo: { id: 'hs-company-1' } }],
  'POST /crm/v3/objects/contacts': [{ status: 201, corpo: { id: 'hs-contact-1' } }, { status: 201, corpo: { id: 'hs-contact-2' } }],
  'POST /crm/v3/objects/notes': [{ status: 201, corpo: { id: 'hs-note-1' } }],
}

Deno.test('sem sessão, nada começa', async () => {
  const { enviar, pedidosDeInicio } = montar({ semSessao: true })
  assertEquals((await enviar()).status, 401)
  assertEquals(pedidosDeInicio.length, 0)
})

Deno.test('pedido sem Workspace, Conta ou Integração válidos é recusado antes do banco', async () => {
  const { enviar, pedidosDeInicio } = montar()
  assertEquals((await enviar({ targetAccountId: 'x' })).status, 400)
  assertEquals((await enviar({ action: 'apagar' })).status, 400)
  assertEquals(pedidosDeInicio.length, 0)
})

Deno.test('HubSpot: cria a Company, os Contacts associados e a nota, com a chave da própria pessoa, e conclui o envio', async () => {
  const { enviar, api, pedidosDeInicio, conclusoes, progressos } = montar({ rotas: structuredClone(HUBSPOT_OK) })
  const r = await enviar()
  const texto = await r.text()
  assertEquals(r.status, 200)
  assert(!texto.includes(CHAVE))
  const corpo = JSON.parse(texto)
  assertEquals(corpo.status, 'enviado')
  assertEquals(corpo.mensagem, 'Enviada ao HubSpot: a empresa, 2 Contatos e a nota.')
  assertEquals(pedidosDeInicio[0], { workspaceId: WS, targetAccountId: CONTA, userId: 'usuario-ana', integrationId: 'hubspot' })

  assertEquals(api.chamadas.map((c) => `${c.metodo} ${c.url.pathname}`), [
    'POST /crm/v3/objects/companies',
    'POST /crm/v3/objects/contacts',
    'POST /crm/v3/objects/contacts',
    'POST /crm/v3/objects/notes',
  ])
  assert(api.chamadas.every((c) => c.cabecalhos.get('Authorization') === `Bearer ${CHAVE}`))
  assertEquals(api.chamadas[0].corpo, { properties: { name: 'Alfa', domain: 'alfa.test', website: 'https://alfa.test' } })
  assertEquals(api.chamadas[1].corpo, {
    properties: { firstname: 'Maria', lastname: 'Souza', email: 'maria@alfa.test', phone: '+5511999990001', jobtitle: 'Diretora' },
    associations: [{ to: { id: 'hs-company-1' }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 279 }] }],
  })
  const nota = api.chamadas[3].corpo as { properties: Record<string, string>; associations: { to: { id: string } }[] }
  assertEquals(nota.properties.hs_timestamp, '2026-10-01T12:00:00.000Z')
  assertEquals(nota.properties.hs_note_body, 'Enviada pela Althius.<br><br>Sinais ativos:<br>- Abriu vaga &lt;Gerente&gt;')
  assertEquals(nota.associations.map((a) => a.to.id), ['hs-company-1', 'hs-contact-1', 'hs-contact-2'])

  assertEquals(conclusoes, [{
    handoffId: 'envio-1',
    ok: true,
    refs: { empresa: 'hs-company-1', contatos: { 'contato-maria': 'hs-contact-1', 'contato-joao': 'hs-contact-2' }, existentes: [], nota: 'hs-note-1' },
    erro: null,
  }])
  assertEquals(progressos[0].empresa, 'hs-company-1')
})

Deno.test('HubSpot: um Contact que já existe pelo e-mail não é duplicado, e a nota se associa a ele', async () => {
  const rotas = structuredClone(HUBSPOT_OK)
  rotas['POST /crm/v3/objects/contacts'] = [
    { status: 409, corpo: { message: 'Contact already exists. Existing ID: 777' } },
    { status: 201, corpo: { id: 'hs-contact-2' } },
  ]
  const { enviar, api, conclusoes } = montar({ rotas })
  const r = await enviar()
  assertEquals(r.status, 200)
  assertEquals((await r.json()).mensagem, 'Enviada ao HubSpot: a empresa, 1 Contato e a nota. 1 Contato já existia no HubSpot e não foi duplicado.')
  assertEquals(conclusoes[0].refs.contatos, { 'contato-maria': '777', 'contato-joao': 'hs-contact-2' })
  const nota = api.chamadas.at(-1)!.corpo as { associations: { to: { id: string } }[] }
  assertEquals(nota.associations.map((a) => a.to.id), ['hs-company-1', '777', 'hs-contact-2'])
})

Deno.test('erro parcial: a empresa foi criada e o Contato falhou; grava a falha com o que existe e a nova tentativa não repete', async () => {
  const rotas = structuredClone(HUBSPOT_OK)
  rotas['POST /crm/v3/objects/contacts'] = [{ status: 400, corpo: { message: 'Property "phone" is invalid' } }]
  const primeira = montar({ rotas })
  const r = await primeira.enviar()
  assertEquals(r.status, 502)
  const corpo = await r.json()
  assertEquals(corpo.code, 'falhou')
  assert(corpo.error.startsWith('O HubSpot recusou o Contato Maria Souza'), corpo.error)
  assert(corpo.error.includes('A empresa já está no HubSpot; tentar de novo não a cria outra vez.'), corpo.error)
  assertEquals(primeira.conclusoes[0].ok, false)
  assertEquals(primeira.conclusoes[0].refs.empresa, 'hs-company-1')
  assertEquals(primeira.conclusoes[0].erro, corpo.error)

  const segunda = montar({ rotas: structuredClone(HUBSPOT_OK), previousRefs: { empresa: 'hs-company-1', contatos: {} } })
  assertEquals((await segunda.enviar()).status, 200)
  assertEquals(segunda.api.chamadas.filter((c) => c.url.pathname === '/crm/v3/objects/companies').length, 0)
  assertEquals(segunda.conclusoes[0].refs.empresa, 'hs-company-1')
})

Deno.test('as recusas do banco viram mensagens claras, sem tocar no CRM', async () => {
  const casos: [ErroDoBanco, number, string][] = [
    [new ErroDoBanco('42501', 'only the responsible seller can send this target account to the CRM'), 403, 'Só o Vendedor responsável pela Conta-alvo a envia ao CRM.'],
    [new ErroDoBanco('23505', 'target account already sent to the CRM'), 409, 'Esta Conta-alvo já foi enviada ao CRM (ou está sendo enviada agora). Depois do envio, o CRM é a fonte da verdade.'],
    [new ErroDoBanco('55000', 'integration access not connected'), 409, 'Conecte a sua conta do HubSpot em Conexões para enviar.'],
    [new ErroDoBanco('55000', 'integration is not a CRM'), 400, 'Esta Integração não é um CRM.'],
    [new ErroDoBanco('P0002', 'target account not found'), 404, 'Conta-alvo não encontrada.'],
  ]
  for (const [erro, status, mensagem] of casos) {
    const { enviar, api, conclusoes } = montar({ erroAoIniciar: erro })
    const r = await enviar()
    assertEquals([r.status, (await r.json()).error], [status, mensagem], erro.message)
    assertEquals(api.chamadas.length, 0)
    assertEquals(conclusoes.length, 0)
  }
})

Deno.test('com o Acesso por autorização (MCP), responde 409 com o caminho honesto e não chama ferramenta inventada', async () => {
  const { enviar, api, conclusoes } = montar({ kind: 'oauth_mcp' })
  const r = await enviar()
  assertEquals(r.status, 409)
  const corpo = await r.json()
  assert(corpo.error.startsWith('Para enviar ao HubSpot, conecte com a chave de API (Private App)'), corpo.error)
  assertEquals(api.chamadas.length, 0)
  assertEquals(conclusoes[0].ok, false)
})

Deno.test('Pipedrive: organização, pessoas com org_id e nota na organização', async () => {
  const { enviar, api, conclusoes } = montar({
    integrationId: 'pipedrive',
    rotas: {
      'POST /v1/organizations': [{ corpo: { success: true, data: { id: 41 } } }],
      'POST /v1/persons': [{ corpo: { success: true, data: { id: 51 } } }, { corpo: { success: true, data: { id: 52 } } }],
      'POST /v1/notes': [{ corpo: { success: true, data: { id: 61 } } }],
    },
  })
  assertEquals((await enviar()).status, 200)
  assertEquals(api.chamadas[0].corpo, { name: 'Alfa' })
  assertEquals(api.chamadas[1].corpo, { name: 'Maria Souza', email: 'maria@alfa.test', phone: '+5511999990001', org_id: 41 })
  assertEquals(api.chamadas[3].corpo?.org_id, 41)
  assert(api.chamadas.every((c) => c.url.searchParams.get('api_token') === CHAVE))
  assertEquals(conclusoes[0].refs, { empresa: '41', contatos: { 'contato-maria': '51', 'contato-joao': '52' }, existentes: [], nota: '61' })
})

Deno.test('RD Station CRM: empresa e contatos ligados a ela; a nota fica como pendência', async () => {
  const { enviar, api, conclusoes } = montar({
    integrationId: 'rd-station',
    rotas: {
      'POST /api/v1/organizations': [{ corpo: { _id: 'rd-org-1' } }],
      'POST /api/v1/contacts': [{ corpo: { _id: 'rd-c-1' } }, { corpo: { id: 'rd-c-2' } }],
    },
  })
  const r = await enviar()
  assertEquals(r.status, 200)
  const corpo = await r.json()
  assertEquals(corpo.mensagem, 'Enviada ao RD Station CRM: a empresa e 2 Contatos.')
  assertEquals(corpo.pendencias.length, 1)
  assertEquals(api.chamadas[1].corpo, {
    contact: { name: 'Maria Souza', title: 'Diretora', emails: [{ email: 'maria@alfa.test' }], phones: [{ phone: '+5511999990001' }], organization_id: 'rd-org-1' },
  })
  assertEquals(conclusoes[0].refs.contatos, { 'contato-maria': 'rd-c-1', 'contato-joao': 'rd-c-2' })
})

Deno.test('a chave recusada pelo CRM vira "reconecte", e a falha fica gravada', async () => {
  const { enviar, conclusoes } = montar({ rotas: { 'POST /crm/v3/objects/companies': [{ status: 401, corpo: {} }] } })
  const r = await enviar()
  assertEquals(r.status, 409)
  assertEquals((await r.json()).code, 'precisa_reconectar')
  assertEquals(conclusoes[0].ok, false)
})

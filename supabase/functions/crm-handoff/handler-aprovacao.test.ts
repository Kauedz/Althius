// Executar uma Aprovação de Enviar ao CRM pela Edge Function (Etapa 5b, CRM-15): o Administrador que acabou de aprovar
// pede `executar_aprovacao` com o JWT dele; o banco das Aprovações e o CRM são dublês.
import { assertEquals } from 'jsr:@std/assert@1'
import type { BancoDoExecutor } from '../_shared/executor-de-aprovacoes.ts'
import { type BancoDeAcessos, ErroDoBanco } from '../_shared/integration-access.ts'
import { type BancoDoEnvio, createHandler } from './handler.ts'

const APROVACAO = '6f1c2d3e-4a5b-4c6d-8e7f-0000000000a1'
const ENVIO = {
  empresa: { nome: 'Alfa', dominio: 'alfa.test', site: null, cnpj: null, segmento: null, linkedin: null },
  contatos: [],
  nota: 'Enviada pela Althius.',
}

function montar(opcoes: { estado?: string; administrador?: boolean; semExecutor?: boolean } = {}) {
  let estado = opcoes.estado ?? 'aprovada'
  const crm: string[] = []
  const pediuComo: (string | null)[] = []
  const aprovacoes: BancoDoExecutor = {
    lerAprovacao(_id, administrador) {
      pediuComo.push(administrador)
      if (!opcoes.administrador && opcoes.administrador !== undefined) {
        return Promise.reject(new ErroDoBanco('42501', 'only administrators can execute approvals'))
      }
      return Promise.resolve({
        workspaceId: 'ws-1',
        agenteId: 'agente-1',
        integrationId: 'hubspot',
        requestedBy: 'usuario-ana',
        targetAccountId: 'conta-1',
        estado,
        payload: { tipo: 'envio_ao_crm', envio: ENVIO },
      })
    },
    reservar: () => Promise.resolve(estado === 'aprovada' ? ((estado = 'executando'), 'go') : 'not_approved'),
    iniciarEnvio: () =>
      Promise.resolve({ handoffId: 'envio-1', accessKind: 'api_key', userId: 'usuario-ana', payload: ENVIO, previousRefs: {} }),
    progresso: () => Promise.resolve(),
    concluirEnvio: (a) => Promise.resolve(a.ok ? 'enviado' : 'falhou'),
    encerrar: (_id, ok) => ((estado = ok ? 'executada' : 'falhou'), Promise.resolve()),
  }
  const acessos: BancoDeAcessos = {
    acessoParaUso: () =>
      Promise.resolve({
        accessId: 'a-1',
        kind: 'api_key',
        state: 'conectado',
        expiresAt: null,
        appPortal: null,
        accountLabel: null,
        segredo: JSON.stringify({ api_key: 'pat-segredo' }),
      }),
    renovar: () => Promise.resolve(),
    marcarReconexao: () => Promise.resolve(),
    clienteOAuth: () => Promise.resolve(null),
    salvarClienteOAuth: (a) => Promise.resolve({ clientId: a.clientId, clientSecret: a.clientSecret }),
    permissaoDoAgente: () => Promise.resolve('propor'),
    aprovacaoEmExecucao: () => Promise.resolve(estado === 'executando'),
  }
  const fetch = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(entrada))
    crm.push(`${init?.method} ${url.pathname}`)
    return new Response(JSON.stringify({ id: `id-${crm.length}` }), { status: 201 })
  }) as typeof globalThis.fetch
  const banco: BancoDoEnvio = {
    iniciar: () => Promise.reject(new Error('não deveria')),
    progresso: () => Promise.resolve(),
    concluir: () => Promise.resolve('falhou'),
  }
  const handler = createHandler({
    banco,
    ...(opcoes.semExecutor ? {} : { aprovacoes }),
    acesso: { banco: acessos, ambiente: () => undefined, fetch },
    userFromJwt: () => Promise.resolve({ userId: 'usuario-ana' }),
    appOrigin: 'https://app.althius.test',
    log: () => {},
  })
  const executar = (approvalId = APROVACAO) =>
    handler(new Request('https://x/crm-handoff', {
      method: 'POST',
      body: JSON.stringify({ action: 'executar_aprovacao', approvalId }),
      headers: { Authorization: 'Bearer jwt', apikey: 'anon', Origin: 'https://app.althius.test' },
    }))
  return { executar, crm, pediuComo }
}

Deno.test('o Administrador executa a Aprovação: o envio sai uma vez, conferido como Administrador no banco', async () => {
  const m = montar({ administrador: true })
  const r = await m.executar()
  assertEquals(r.status, 200)
  assertEquals((await r.json()).status, 'enviado')
  assertEquals(m.pediuComo, ['usuario-ana'])
  assertEquals(m.crm, ['POST /crm/v3/objects/companies', 'POST /crm/v3/objects/notes'])
  const outra = await m.executar()
  assertEquals(outra.status, 409)
  assertEquals(m.crm.length, 2)
})

Deno.test('quem não é Administrador recebe 403 e nada vai ao CRM', async () => {
  const m = montar({ administrador: false })
  const r = await m.executar()
  assertEquals(r.status, 403)
  assertEquals(m.crm, [])
})

Deno.test('uma Aprovação pendente não é executada', async () => {
  const m = montar({ estado: 'pendente', administrador: true })
  const r = await m.executar()
  assertEquals(r.status, 409)
  assertEquals((await r.json()).status, 'nao_liberada')
  assertEquals(m.crm, [])
})

Deno.test('sem id de Aprovação, ou sem o executor ligado, é recusado', async () => {
  assertEquals((await montar().executar('x')).status, 400)
  assertEquals((await montar({ semExecutor: true }).executar()).status, 400)
})

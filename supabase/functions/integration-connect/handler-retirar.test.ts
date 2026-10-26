import { assert, assertEquals } from 'jsr:@std/assert@1'
import { type BancoDeDesconexao } from '../_shared/integration-access.ts'
import { createHandler, type Db } from './handler.ts'
import { criarRetiradaIntegracao } from './rpc-retirada.ts'

const WS = '6f1c2d3e-4a5b-4c6d-8e7f-000000000001'
const segredo = JSON.stringify({ access_token: 'segredo-acc', refresh_token: 'segredo-ref', client_id: 'cid', issuer: 'https://api.clay.com' })

function montar({ negar = false, naoHabilitada = false, falharRevogacao = false, semEndpoint = false } = {}) {
  const eventos = { revogacoes: [] as string[], retirada: [] as unknown[], logs: [] as Record<string, unknown>[] }
  const db = {
    userFromJwt: () => Promise.resolve({ userId: 'admin', email: null }),
    retirarIntegracao: criarRetiradaIntegracao(async (_nome, parametros) => {
      if (negar || naoHabilitada) return { data: null, error: { code: negar ? '42501' : '22023', message: negar ? 'only administrators' : 'integration not enabled' } }
      eventos.retirada.push(parametros)
      return { data: 2, error: null }
    }),
  } as unknown as Db
  const acessos = {
    acessosParaRetirada: () => Promise.resolve([
      { userId: 'ana', kind: 'oauth_mcp', state: 'conectado', segredo },
      { userId: 'bia', kind: 'oauth_mcp', state: 'conectado', segredo },
    ]),
    clienteOAuth: () => Promise.resolve({ clientId: 'cid', clientSecret: null }),
    salvarClienteOAuth: (a: { clientId: string; clientSecret: string | null }) => Promise.resolve(a),
  } as unknown as BancoDeDesconexao
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const req = new Request(input, init)
    if (req.url === 'https://api.clay.com/.well-known/oauth-protected-resource/v3/mcp') return json({ resource: 'https://api.clay.com/v3/mcp', authorization_servers: ['https://api.clay.com'] })
    if (req.url === 'https://api.clay.com/.well-known/oauth-authorization-server') return json({ issuer: 'https://api.clay.com', authorization_endpoint: 'https://app.clay.com/oauth/authorize', token_endpoint: 'https://api.clay.com/oauth/token', ...(semEndpoint ? {} : { revocation_endpoint: 'https://api.clay.com/oauth/revoke' }) })
    if (req.url.endsWith('/revoke')) { eventos.revogacoes.push(await req.text()); return json({}, falharRevogacao ? 503 : 200) }
    return json({}, 404)
  }) as typeof globalThis.fetch
  const handler = createHandler({ db, acessos, ambiente: () => undefined, appOrigin: 'https://app.althius.test', urlDeRetorno: 'https://x/callback', fetch, log: (r) => eventos.logs.push(r) })
  const pedir = () => handler(new Request('https://x/integration-connect', { method: 'POST', body: JSON.stringify({ action: 'retirar', workspaceId: WS, integrationId: 'clay' }), headers: { Authorization: 'Bearer jwt', apikey: 'anon', Origin: 'https://app.althius.test' } }))
  return { eventos, pedir }
}

Deno.test('retirar tenta revogar cada Acesso, remove a Integração e só devolve contagens sem tokens', async () => {
  const { eventos, pedir } = montar()
  const resposta = await pedir()
  const corpo = await resposta.text()
  assertEquals(resposta.status, 200)
  assertEquals(JSON.parse(corpo), { removidos: 2, resultados: { revogado: 2, nao_suportado: 0, falhou: 0, nao_se_aplica: 0 } })
  assertEquals(eventos.revogacoes.length, 4)
  assertEquals(eventos.retirada.length, 1)
  assert(!corpo.includes('segredo'))
  assert(!JSON.stringify(eventos.logs).includes('segredo'))
})

Deno.test('falha do fornecedor não impede retirar e fica contabilizada', async () => {
  const { eventos, pedir } = montar({ falharRevogacao: true })
  const resposta = await pedir()
  assertEquals(resposta.status, 200)
  assertEquals((await resposta.json()).resultados.falhou, 2)
  assertEquals(eventos.retirada.length, 1)
})

Deno.test('servidor sem endpoint de revogação não impede retirar e registra não suportado', async () => {
  const { eventos, pedir } = montar({ semEndpoint: true })
  const resposta = await pedir()
  assertEquals(resposta.status, 200)
  assertEquals((await resposta.json()).resultados.nao_suportado, 2)
  assertEquals(eventos.retirada.length, 1)
})

Deno.test('Membro não consegue retirar pela ação do backend', async () => {
  const { eventos, pedir } = montar({ negar: true })
  assertEquals((await pedir()).status, 403)
  assertEquals(eventos.retirada.length, 0)
})

Deno.test('retirada já desabilitada responde conflito quando a RPC retorna erro do Postgres', async () => {
  const { pedir } = montar({ naoHabilitada: true })
  assertEquals((await pedir()).status, 409)
})

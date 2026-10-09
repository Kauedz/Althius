import { assertEquals } from 'jsr:@std/assert@1'
import { identificarConta } from './identificacao.ts'
import { PERFIS } from './perfis.ts'
import { servidorMcpFalso } from './servidor-mcp-falso.ts'

function api(rotas: Record<string, () => Response>) {
  const urls: string[] = []
  const cabecalhos: Record<string, string | null>[] = []
  const fetchFalso = ((entrada: string | URL | Request, init?: RequestInit) => {
    const req = new Request(entrada, init)
    urls.push(req.url)
    cabecalhos.push({ authorization: req.headers.get('authorization'), 'x-api-key': req.headers.get('x-api-key') })
    const rota = rotas[req.url]
    return Promise.resolve(rota ? rota() : new Response('{}', { status: 404 }))
  }) as typeof fetch
  return { fetch: fetchFalso, urls, cabecalhos }
}

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status })

Deno.test('Pipedrive: a chave válida entrega a conta e o portal (company_id); o token vai codificado na consulta', async () => {
  const { fetch, urls } = api({
    'https://api.pipedrive.com/v1/users/me?api_token=pd%2Ftoken': () =>
      json({ success: true, data: { id: 1, name: 'Ana', email: 'ana@norte.test', company_id: 98765 } }),
  })
  const r = await identificarConta(PERFIS.pipedrive.chaveDeApi!.identificacao, 'pd/token', 'chave', { fetch })
  assertEquals(r, { ok: true, portal: '98765', conta: 'ana@norte.test' })
  assertEquals(urls.length, 1)
})

Deno.test('chave de API recusada (401/403) não é gravada; falha do app é indisponível, não recusa', async () => {
  const recusada = api({ 'https://api.pipedrive.com/v1/users/me?api_token=ruim': () => json({}, 401) })
  assertEquals(
    await identificarConta(PERFIS.pipedrive.chaveDeApi!.identificacao, 'ruim', 'chave', { fetch: recusada.fetch }),
    { ok: false, motivo: 'recusada' },
  )
  const fora = api({ 'https://api.pipedrive.com/v1/users/me?api_token=ok': () => json({}, 503) })
  assertEquals(
    await identificarConta(PERFIS.pipedrive.chaveDeApi!.identificacao, 'ok', 'chave', { fetch: fora.fetch }),
    { ok: false, motivo: 'indisponivel' },
  )
})

Deno.test('HubSpot por Private App: tenta account-info e, sem portal, cai em integrations/v1/me; a chave vai no cabeçalho', async () => {
  const { fetch, urls, cabecalhos } = api({
    'https://api.hubapi.com/account-info/v3/details': () => json({}, 404),
    'https://api.hubapi.com/integrations/v1/me': () => json({ portalId: 4444, timeZone: 'US/Eastern' }),
  })
  const r = await identificarConta(PERFIS.hubspot.chaveDeApi!.identificacao, 'pat-na-1', 'chave', { fetch })
  assertEquals(r, { ok: true, portal: '4444', conta: null })
  assertEquals(urls, ['https://api.hubapi.com/account-info/v3/details', 'https://api.hubapi.com/integrations/v1/me'])
  assertEquals(cabecalhos[1].authorization, 'Bearer pat-na-1')
})

Deno.test('RD Station: a listagem com o token valida a chave; sem campo de conta, a conta fica nula', async () => {
  const { fetch } = api({ 'https://crm.rdstation.com/api/v1/contacts?limit=1&token=rd-1': () => json({ contacts: [] }) })
  assertEquals(
    await identificarConta(PERFIS['rd-station'].chaveDeApi!.identificacao, 'rd-1', 'chave', { fetch }),
    { ok: true, portal: null, conta: null },
  )
})

Deno.test('HubSpot OAuth: o hub_id vem da consulta ao token; se a API recusa o token do MCP, cai em get_user_details', async () => {
  const direto = api({ 'https://api.hubapi.com/oauth/v1/access-tokens/tok-1': () => json({ hub_id: 1234, user: 'ana@norte.test' }) })
  assertEquals(
    await identificarConta(PERFIS.hubspot.mcp!.oauth!.identificacao, 'tok-1', 'token', { fetch: direto.fetch }),
    { ok: true, portal: '1234', conta: 'ana@norte.test' },
  )

  const recusada = api({ 'https://api.hubapi.com/oauth/v1/access-tokens/tok-2': () => json({}, 401) })
  const mcp = servidorMcpFalso({
    resultados: {
      get_user_details: { content: [{ type: 'text', text: JSON.stringify({ hubId: 5678, email: 'bruno@norte.test' }) }] },
    },
    ferramentas: [{ name: 'get_user_details', annotations: { readOnlyHint: true } }],
  })
  const viaFerramenta = await identificarConta(PERFIS.hubspot.mcp!.oauth!.identificacao, 'tok-2', 'token', {
    fetch: recusada.fetch,
    mcp: { url: 'https://mcp.hubspot.com', cabecalhos: { Authorization: 'Bearer tok-2' }, fetch: mcp.fetch },
  })
  assertEquals(viaFerramenta, { ok: true, portal: '5678', conta: 'bruno@norte.test' })
})

Deno.test('HubSpot OAuth: o portal vem do hub_id da resposta do token (OAuth v3), mesmo que a consulta recuse o token do MCP', async () => {
  const recusada = api({ 'https://api.hubapi.com/oauth/v1/access-tokens/tok-4': () => json({}, 401) })
  const r = await identificarConta(PERFIS.hubspot.mcp!.oauth!.identificacao, 'tok-4', 'token', {
    fetch: recusada.fetch,
    respostaDoToken: { access_token: 'tok-4', refresh_token: 'ref-4', hub_id: 4321, token_type: 'bearer', expires_in: 1800 },
  })
  assertEquals(r, { ok: true, portal: '4321', conta: null })

  // Com a consulta aceita, ela só completa a conta: o portal continua o da resposta do token.
  const aceita = api({ 'https://api.hubapi.com/oauth/v1/access-tokens/tok-5': () => json({ hub_id: 9999, user: 'ana@norte.test' }) })
  const completa = await identificarConta(PERFIS.hubspot.mcp!.oauth!.identificacao, 'tok-5', 'token', {
    fetch: aceita.fetch,
    respostaDoToken: { access_token: 'tok-5', hub_id: 4321 },
  })
  assertEquals(completa, { ok: true, portal: '4321', conta: 'ana@norte.test' })
})

Deno.test('HubSpot OAuth sem como identificar o portal: não_identificada (quem chama recusa, porque o HubSpot fixa portal)', async () => {
  const { fetch } = api({})
  const r = await identificarConta(PERFIS.hubspot.mcp!.oauth!.identificacao, 'tok-3', 'token', { fetch })
  assertEquals(r, { ok: false, motivo: 'nao_identificada' })
})

Deno.test('Notion: sem o e-mail do usuário (o Notion só o dá quando disponível), a conta é o nome de quem conectou', async () => {
  const mcp = servidorMcpFalso({
    resultados: {
      'notion-get-users': {
        content: [{ type: 'text', text: JSON.stringify({ results: [{ type: 'person', id: 'u-1', name: 'Ana Souza' }], has_more: false }) }],
      },
    },
    ferramentas: [{ name: 'notion-get-users', annotations: { readOnlyHint: true } }],
  })
  const r = await identificarConta(PERFIS.notion.mcp!.oauth!.identificacao, 'tok', 'token', {
    respostaDoToken: { access_token: 'tok', user_id: 'u-1', workspace_id: 'w-1', email_domain: 'norte.test' },
    mcp: { url: 'https://mcp.notion.com/mcp', cabecalhos: { Authorization: 'Bearer tok' }, fetch: mcp.fetch },
  })
  assertEquals(r, { ok: true, portal: null, conta: 'Ana Souza' })
})

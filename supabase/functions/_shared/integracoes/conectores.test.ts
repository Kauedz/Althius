import { assert, assertEquals } from 'jsr:@std/assert@1'
import { CONECTORES } from './conectores.ts'
import { caminhosDe, PERFIS, perfilDaIntegracao } from './perfis.ts'

// Os conectores do catálogo ampliado são só DADO (pesquisa-conectores-mcp-todos.md): o app aparece como URL do servidor
// MCP oficial e como o cliente OAuth se registra. O que cada um faz vem do `tools/list` do próprio servidor.

Deno.test('os conectores com servidor MCP remoto e OAuth para terceiros confirmados pela pesquisa, cada um no seu endereço', () => {
  const enderecos = Object.fromEntries(Object.entries(CONECTORES).map(([id, p]) => [id, p.mcp?.url]))
  assertEquals(enderecos, {
    slack: 'https://mcp.slack.com/mcp',
    'google-calendar': 'https://calendarmcp.googleapis.com/mcp/v1',
    'google-sheets': 'https://sheetsmcp.googleapis.com/mcp/v1',
    clay: 'https://api.clay.com/v3/mcp',
    calendly: 'https://mcp.calendly.com',
    bitrix24: 'https://mcp.bitrix24.com/mcp/',
    'tiktok-ads': 'https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer',
    make: 'https://mcp.make.com',
  })
})

Deno.test('o registro do cliente segue a pesquisa: pré-registrado no Slack e no Google, dinâmico no Calendly', () => {
  assertEquals(CONECTORES.slack.mcp!.oauth!.registro, 'preregistrado')
  assertEquals(CONECTORES['google-calendar'].mcp!.oauth!.registro, 'preregistrado')
  assertEquals(CONECTORES['google-sheets'].mcp!.oauth!.registro, 'preregistrado')
  assertEquals(CONECTORES.calendly.mcp!.oauth!.registro, 'dinamico')
  assertEquals(CONECTORES.calendly.mcp!.oauth!.escopos, ['mcp:scheduling:read'])
  assertEquals(CONECTORES.slack.mcp!.oauth!.segredos, { clientId: 'SLACK_MCP_CLIENT_ID', clientSecret: 'SLACK_MCP_CLIENT_SECRET' })
  assertEquals(CONECTORES['google-calendar'].mcp!.oauth!.segredos, {
    clientId: 'GOOGLE_CALENDAR_MCP_CLIENT_ID',
    clientSecret: 'GOOGLE_CALENDAR_MCP_CLIENT_SECRET',
  })
  // Onde a pesquisa não confirmou o registro dinâmico, o perfil diz isso.
  for (const id of ['bitrix24', 'tiktok-ads']) {
    assert(CONECTORES[id].naoConfirmado.some((p) => p.includes('registro dinâmico')), id)
  }
})

Deno.test('cada conector é só dado coerente: https, OAuth, segredos <APP>_MCP_CLIENT_*, sem chave de API nem REST', () => {
  for (const [id, perfil] of Object.entries(CONECTORES)) {
    assertEquals(perfil.id, id)
    assert(perfil.mcp?.url.startsWith('https://'), id)
    const oauth = perfil.mcp?.oauth
    assert(oauth, id)
    assert(/^[A-Z0-9_]+_MCP_CLIENT_ID$/.test(oauth.segredos.clientId), id)
    assert(/^[A-Z0-9_]+_MCP_CLIENT_SECRET$/.test(oauth.segredos.clientSecret), id)
    assertEquals(oauth.autorizacao, undefined, `${id}: os endereços vêm da descoberta, nunca inventados`)
    assertEquals(perfil.rest, undefined, id)
    assertEquals(perfil.chaveDeApi, undefined, id)
    assertEquals(caminhosDe(perfil), ['oauth_mcp'], id)
    assert(perfil.naoConfirmado.length > 0, id)
    assert(!Object.hasOwn(PERFIS, id), `${id} não repete um perfil de 20261001160000`)
    assertEquals(perfilDaIntegracao(id), perfil)
  }
})

Deno.test('quem não tem servidor remoto oficial confirmado, ou só tem por conta, fica fora: aparece "Em breve"', () => {
  for (const id of ['kommo', 'linkedin-ads', 'google-ads', 'salesforce', 'zoho-crm', 'microsoft-teams']) {
    assertEquals(perfilDaIntegracao(id), null, id)
  }
})

Deno.test('o Clay conecta pelo servidor MCP oficial com registro dinâmico, escopo mcp e portal não fixo', () => {
  const clay = perfilDaIntegracao('clay')!
  assertEquals(clay.id, 'clay')
  assertEquals(clay.portalFixo, false)
  assertEquals(clay.mcp!.url, 'https://api.clay.com/v3/mcp')
  assertEquals(clay.mcp!.oauth!.registro, 'dinamico')
  assertEquals(clay.mcp!.oauth!.segredos, { clientId: 'CLAY_MCP_CLIENT_ID', clientSecret: 'CLAY_MCP_CLIENT_SECRET' })
  assertEquals(clay.mcp!.oauth!.escopos, ['mcp'])
  assertEquals(caminhosDe(clay), ['oauth_mcp'])
  assertEquals(clay.chaveDeApi, undefined)
})

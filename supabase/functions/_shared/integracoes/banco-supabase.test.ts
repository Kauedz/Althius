import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { ErroDoBanco } from '../integration-access.ts'
import { bancoDasIntegracoes, type Rpc } from './banco-supabase.ts'

function rpcFalso(respostas: Record<string, unknown>) {
  const chamadas: { nome: string; parametros: Record<string, unknown> }[] = []
  const rpc: Rpc = (nome, parametros) => {
    chamadas.push({ nome, parametros })
    const resposta = respostas[nome]
    if (resposta instanceof Error) return Promise.resolve({ data: null, error: { code: (resposta as { code?: string }).code, message: resposta.message } })
    return Promise.resolve({ data: resposta ?? null, error: null })
  }
  return { rpc, chamadas }
}

Deno.test('o Acesso vem das colunas da RPC, com o segredo como texto; sem Acesso, nulo', async () => {
  const { rpc, chamadas } = rpcFalso({
    integration_access_for_use: [{
      access_id: 'a1',
      kind: 'oauth_mcp',
      state: 'conectado',
      expires_at: '2026-10-01T12:30:00Z',
      app_portal: '123',
      account_label: 'ana@norte.test',
      secret: '{"access_token":"x"}',
    }],
  })
  const banco = bancoDasIntegracoes(rpc)
  assertEquals(await banco.acessoParaUso({ workspaceId: 'w', userId: 'u', integrationId: 'hubspot' }), {
    accessId: 'a1',
    kind: 'oauth_mcp',
    state: 'conectado',
    expiresAt: '2026-10-01T12:30:00Z',
    appPortal: '123',
    accountLabel: 'ana@norte.test',
    segredo: '{"access_token":"x"}',
  })
  assertEquals(chamadas[0], {
    nome: 'integration_access_for_use',
    parametros: { p_workspace_id: 'w', p_user_id: 'u', p_integration_id: 'hubspot' },
  })
  assertEquals(await bancoDasIntegracoes(rpcFalso({ integration_access_for_use: [] }).rpc).acessoParaUso({ workspaceId: 'w', userId: 'u', integrationId: 'x' }), null)
})

Deno.test('o erro do banco vira ErroDoBanco com o código do Postgres', async () => {
  const erro = Object.assign(new Error('active workspace membership required'), { code: '42501' })
  const banco = bancoDasIntegracoes(rpcFalso({ integration_access_for_use: erro }).rpc)
  const lancado = await assertRejects(
    () => banco.acessoParaUso({ workspaceId: 'w', userId: 'u', integrationId: 'hubspot' }),
    ErroDoBanco,
  )
  assertEquals(lancado.codigo, '42501')
})

Deno.test('as RPCs de renovação, reconexão, Permissão, tentativa e chave levam os parâmetros certos', async () => {
  const { rpc, chamadas } = rpcFalso({
    integration_agent_permission: 'propor',
    start_integration_connect: [{ state: 'st', code_verifier: 'vv' }],
    integration_connect_attempt: [{
      status: 'ok', workspace_id: 'w', user_id: 'u', integration_id: 'hubspot', issuer: 'i', code_verifier: 'vv',
      redirect_uri: 'r', return_to: 'https://app', token_endpoint: 't', client_id: 'c', resource: null,
    }],
    complete_integration_connect: 'acesso-9',
    save_integration_api_key: 'acesso-10',
  })
  const banco = bancoDasIntegracoes(rpc)
  await banco.renovar({ accessId: 'a', accessToken: 'at', refreshToken: 'rt', expiresIn: 1800 })
  await banco.marcarReconexao('a', 'motivo')
  assertEquals(await banco.permissaoDoAgente({ workspaceId: 'w', agenteId: 'g', integrationId: 'hubspot' }), 'propor')
  assertEquals(await banco.iniciarTentativa({
    workspaceId: 'w', userId: 'u', integrationId: 'hubspot', issuer: 'i', redirectUri: 'r', tokenEndpoint: 't', clientId: 'c', resource: null, returnTo: 'https://app',
  }), { state: 'st', codeVerifier: 'vv' })
  assertEquals((await banco.tentativa('st'))?.integrationId, 'hubspot')
  assertEquals(await banco.concluir({ state: 'st', accessToken: 'a', refreshToken: null, expiresIn: null, accountLabel: null, appPortal: '1', scopes: null }), 'acesso-9')
  assertEquals(await banco.salvarChave({ workspaceId: 'w', userId: 'u', integrationId: 'pipedrive', apiKey: 'k', accountLabel: null, appPortal: '2' }), 'acesso-10')
  assertEquals(chamadas.map((c) => c.nome), [
    'rotate_integration_access', 'mark_integration_access_reconnect', 'integration_agent_permission',
    'start_integration_connect', 'integration_connect_attempt', 'complete_integration_connect', 'save_integration_api_key',
  ])
  assertEquals(chamadas[0].parametros, { p_access_id: 'a', p_access_token: 'at', p_refresh_token: 'rt', p_expires_in: 1800 })
})

Deno.test('uma Permissão desconhecida do banco vale como nenhuma', async () => {
  const banco = bancoDasIntegracoes(rpcFalso({ integration_agent_permission: 'admin' }).rpc)
  assertEquals(await banco.permissaoDoAgente({ workspaceId: 'w', agenteId: 'g', integrationId: 'hubspot' }), null)
})

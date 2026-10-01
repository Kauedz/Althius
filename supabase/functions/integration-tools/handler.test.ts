import { assert, assertEquals } from 'jsr:@std/assert@1'
import { servidorMcpFalso } from '../_shared/integracoes/servidor-mcp-falso.ts'
import { type AcessoLido, type BancoDeAcessos, ErroDoBanco, type Permissao } from '../_shared/integration-access.ts'
import { createHandler } from './handler.ts'

const WS = '6f1c2d3e-4a5b-4c6d-8e7f-000000000001'
const AGENTE = '7a1c2d3e-4a5b-4c6d-8e7f-0000000000aa'

function montar(opcoes: { acesso?: AcessoLido | null; erroDoBanco?: ErroDoBanco; permissao?: Permissao | null; semSessao?: boolean } = {}) {
  const servidor = servidorMcpFalso({ token: 'acc-111111' })
  const reconexoes: string[] = []
  const acesso: AcessoLido | null = opcoes.acesso === null ? null : {
    accessId: 'acesso-1',
    kind: 'oauth_mcp',
    state: 'conectado',
    expiresAt: null,
    appPortal: null,
    accountLabel: null,
    segredo: JSON.stringify({ access_token: 'acc-111111', refresh_token: 'ref-111111', token_endpoint: 'https://x/token', client_id: 'c', issuer: 'https://mcp.hubspot.com' }),
    ...opcoes.acesso,
  }
  const banco: BancoDeAcessos = {
    acessoParaUso: () => opcoes.erroDoBanco ? Promise.reject(opcoes.erroDoBanco) : Promise.resolve(acesso),
    renovar: () => Promise.resolve(),
    marcarReconexao: (id) => (reconexoes.push(id), Promise.resolve()),
    clienteOAuth: () => Promise.resolve(null),
    salvarClienteOAuth: (a) => Promise.resolve({ clientId: a.clientId, clientSecret: a.clientSecret }),
    permissaoDoAgente: () => Promise.resolve(opcoes.permissao === undefined ? 'executar' : opcoes.permissao),
  }
  const handler = createHandler({
    acesso: { banco, ambiente: () => undefined, fetch: servidor.fetch },
    userFromJwt: () => Promise.resolve(opcoes.semSessao ? null : { userId: 'u1', email: 'ana@norte.test' }),
    appOrigin: 'https://app.althius.test',
    log: () => {},
  })
  const pedir = (corpo: unknown) =>
    handler(new Request('https://x/integration-tools', {
      method: 'POST',
      body: JSON.stringify(corpo),
      headers: { Authorization: 'Bearer jwt', apikey: 'anon', Origin: 'https://app.althius.test' },
    }))
  return { pedir, servidor, reconexoes }
}

Deno.test('sem sessão, a função não faz nada', async () => {
  const { pedir, servidor } = montar({ semSessao: true })
  assertEquals((await pedir({ action: 'listar', workspaceId: WS, integrationId: 'hubspot' })).status, 401)
  assertEquals(servidor.chamadas.length, 0)
})

Deno.test('listar devolve nome, descrição e se escreve, sem esquema e sem token', async () => {
  const { pedir } = montar()
  const r = await pedir({ action: 'listar', workspaceId: WS, integrationId: 'hubspot' })
  assertEquals(r.status, 200)
  const texto = await r.text()
  assertEquals(JSON.parse(texto), {
    ferramentas: [
      { nome: 'buscar', descricao: 'Busca registros.', escreve: false },
      { nome: 'criar', descricao: 'Cria um registro.', escreve: true },
    ],
  })
  assert(!texto.includes('acc-111111') && !texto.includes('ref-111111'))
})

Deno.test('chamar roda só ferramentas de leitura, mesmo com um Agente que tem Executar', async () => {
  const { pedir, servidor } = montar({ permissao: 'executar' })
  const leitura = await pedir({ action: 'chamar', workspaceId: WS, integrationId: 'hubspot', ferramenta: 'buscar', argumentos: { termo: 'alfa' }, agentId: AGENTE })
  assertEquals(leitura.status, 200)
  assertEquals((await leitura.json()).conteudo, [{ type: 'text', text: 'ok:buscar' }])

  const escrita = await pedir({ action: 'chamar', workspaceId: WS, integrationId: 'hubspot', ferramenta: 'criar', argumentos: {}, agentId: AGENTE })
  assertEquals(escrita.status, 403)
  const corpo = await escrita.json()
  assertEquals([corpo.code, corpo.exigida], ['permissao_negada', 'executar'])
  assert(!servidor.chamadas.some((c) => c.rpc === 'tools/call' && (c.corpo?.params as { name: string }).name === 'criar'))
})

Deno.test('cada erro tipado vira o status e o código que a tela entende', async () => {
  const semAcesso = await montar({ acesso: null }).pedir({ action: 'listar', workspaceId: WS, integrationId: 'hubspot' })
  assertEquals([semAcesso.status, (await semAcesso.json()).motivo], [409, 'sem_acesso'])

  const inativa = await montar({ erroDoBanco: new ErroDoBanco('42501', 'x') }).pedir({ action: 'listar', workspaceId: WS, integrationId: 'hubspot' })
  assertEquals([inativa.status, (await inativa.json()).motivo], [409, 'participacao_inativa'])

  const desabilitada = await montar({ erroDoBanco: new ErroDoBanco('22023', 'integration not enabled') })
    .pedir({ action: 'listar', workspaceId: WS, integrationId: 'hubspot' })
  assertEquals([desabilitada.status, (await desabilitada.json()).code], [409, 'nao_habilitada'])

  const semPermissao = await montar({ permissao: null })
    .pedir({ action: 'chamar', workspaceId: WS, integrationId: 'hubspot', ferramenta: 'buscar', agentId: AGENTE })
  assertEquals([semPermissao.status, (await semPermissao.json()).code], [403, 'permissao_negada'])

  const desconhecida = await montar().pedir({ action: 'chamar', workspaceId: WS, integrationId: 'hubspot', ferramenta: 'apagar_tudo' })
  assertEquals([desconhecida.status, (await desconhecida.json()).code], [400, 'ferramenta_invalida'])
})

Deno.test('entradas inválidas são recusadas antes de tocar o Acesso', async () => {
  const { pedir, servidor } = montar()
  assertEquals((await pedir({ action: 'listar', workspaceId: 'x', integrationId: 'hubspot' })).status, 400)
  assertEquals((await pedir({ action: 'listar', workspaceId: WS, integrationId: '../x' })).status, 400)
  assertEquals((await pedir({ action: 'chamar', workspaceId: WS, integrationId: 'hubspot', ferramenta: 'buscar', argumentos: [1] })).status, 400)
  assertEquals((await pedir({ action: 'chamar', workspaceId: WS, integrationId: 'hubspot', ferramenta: 'buscar', agentId: 'nao-e-uuid' })).status, 400)
  assertEquals((await pedir({ action: 'apagar', workspaceId: WS, integrationId: 'hubspot' })).status, 400)
  assertEquals(servidor.chamadas.length, 0)
})

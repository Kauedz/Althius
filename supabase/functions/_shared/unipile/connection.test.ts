// A leitura da conexão Unipile ativa (canais-16): vem do banco (endereço, versão) e do Vault (chave, segredo do webhook),
// com o banco e as variáveis de função simulados. A leitura REAL só se prova depois da migration do canais-15 e da que
// acompanha este ticket, e do wizard (ver o handoff).
import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import {
  createActiveConnectionLoader,
  createUnipileRuntime,
  DEFAULT_V2_BASE_URL,
  type RpcClient,
} from './connection.ts'
import { UnipileConfigMissingError } from './errors.ts'

const ROW = {
  connection_id: '11111111-1111-1111-1111-111111111111',
  name: 'teste-7-dias-3',
  base_url: 'https://api68.unipile.com:19840',
  api_version: 'v1',
  api_key_secret_name: 'unipile_teste3_api_key',
  webhook_secret_name: 'unipile_teste3_webhook_secret',
  api_key: 'chave-do-vault',
  webhook_secret: 'segredo-do-vault',
}

function rpcReturning(result: { data: unknown; error: unknown } | (() => { data: unknown; error: unknown })) {
  const calls: string[] = []
  const rpc: RpcClient = {
    rpc(fn) {
      calls.push(fn)
      return Promise.resolve(typeof result === 'function' ? result() : result)
    },
  }
  return { rpc, calls }
}

const env = (values: Record<string, string>) => ({ get: (name: string) => values[name] })

Deno.test('conexão ativa: endereço e versão vêm do banco, a chave e o segredo do webhook, do Vault', async () => {
  const { rpc, calls } = rpcReturning({ data: [ROW], error: null })
  const connection = await createActiveConnectionLoader({ rpc, env: env({}) }).get()
  assertEquals(calls, ['get_active_unipile_connection'])
  assertEquals(connection, {
    id: ROW.connection_id,
    name: 'teste-7-dias-3',
    version: 'v1',
    baseUrl: 'https://api68.unipile.com:19840',
    apiKey: 'chave-do-vault',
    webhookSecret: 'segredo-do-vault',
    source: 'database',
  })
})

Deno.test('conexão ativa: a configuração é lida pelo schema do contrato; versão ou endereço inválidos não passam', async () => {
  for (const bad of [{ api_version: 'v3' }, { base_url: 'http://api.unipile.com' }, { api_key_secret_name: 'nome com espaço' }]) {
    const { rpc } = rpcReturning({ data: [{ ...ROW, ...bad }], error: null })
    const error = await assertRejects(() => createActiveConnectionLoader({ rpc, env: env({}) }).get(), UnipileConfigMissingError)
    // Só nomes de campo no erro, nunca o valor nem a chave.
    assertEquals(String(error.message).includes('chave-do-vault'), false)
  }
})

Deno.test('conexão ativa: sem nenhuma ativa, ou com erro do banco, o canal fica desligado (nada é enviado)', async () => {
  const none = rpcReturning({ data: [], error: null })
  await assertRejects(() => createActiveConnectionLoader({ rpc: none.rpc, env: env({ UNIPILE_API_KEY: 'k' }) }).get(), UnipileConfigMissingError)
  const broken = rpcReturning({ data: null, error: { code: '57014', message: 'timeout' } })
  await assertRejects(() => createActiveConnectionLoader({ rpc: broken.rpc, env: env({ UNIPILE_API_KEY: 'k' }) }).get(), UnipileConfigMissingError)
})

Deno.test('conexão ativa: sem a chave no Vault, a variável de hoje vale só para a conexão padrão (v2, api.unipile.com)', async () => {
  const standard = { ...ROW, name: 'padrão', base_url: DEFAULT_V2_BASE_URL, api_version: 'v2', api_key: null, webhook_secret: null }
  const fallback = await createActiveConnectionLoader({
    rpc: rpcReturning({ data: [standard], error: null }).rpc,
    env: env({ UNIPILE_API_KEY: 'chave-da-variavel', UNIPILE_WEBHOOK_SECRET: 'segredo-da-variavel' }),
  }).get()
  assertEquals([fallback.apiKey, fallback.webhookSecret, fallback.source], ['chave-da-variavel', 'segredo-da-variavel', 'environment'])

  // Outra conexão sem chave no Vault NUNCA usa a variável: a chave de uma conta não vai para o endereço de outra.
  const other = { ...ROW, api_key: null, webhook_secret: null }
  const error = await assertRejects(
    () => createActiveConnectionLoader({ rpc: rpcReturning({ data: [other], error: null }).rpc, env: env({ UNIPILE_API_KEY: 'chave-da-variavel' }) }).get(),
    UnipileConfigMissingError,
  )
  assertEquals(error.fields.includes('api_key'), true)
  // E a conexão padrão sem chave em lugar nenhum também desliga o canal.
  await assertRejects(
    () => createActiveConnectionLoader({ rpc: rpcReturning({ data: [standard], error: null }).rpc, env: env({}) }).get(),
    UnipileConfigMissingError,
  )
})

Deno.test('conexão ativa: enquanto a migration não foi aplicada (função ausente), vale a configuração de hoje', async () => {
  for (const code of ['PGRST202', '42883']) {
    const { rpc } = rpcReturning({ data: null, error: { code, message: 'function does not exist' } })
    const connection = await createActiveConnectionLoader({
      rpc,
      env: env({ UNIPILE_API_KEY: 'chave-da-variavel', UNIPILE_WEBHOOK_SECRET: 'segredo' }),
    }).get()
    assertEquals(
      [connection.version, connection.baseUrl, connection.apiKey, connection.webhookSecret, connection.source, connection.id],
      ['v2', DEFAULT_V2_BASE_URL, 'chave-da-variavel', 'segredo', 'environment', null],
    )
  }
  const { rpc } = rpcReturning({ data: null, error: { code: 'PGRST202', message: 'x' } })
  await assertRejects(() => createActiveConnectionLoader({ rpc, env: env({}) }).get(), UnipileConfigMissingError)
})

Deno.test('conexão ativa: a leitura fica em cache por um tempo, e a troca vale depois dele (ou ao invalidar)', async () => {
  let now = 1_000
  let row = ROW
  const { rpc, calls } = rpcReturning(() => ({ data: [row], error: null }))
  const loader = createActiveConnectionLoader({ rpc, env: env({}), ttlMs: 30_000, now: () => now })
  assertEquals((await loader.get()).name, 'teste-7-dias-3')
  row = { ...ROW, name: 'teste-7-dias-4', api_key: 'outra-chave' }
  now += 29_000
  assertEquals((await loader.get()).name, 'teste-7-dias-3')
  assertEquals(calls.length, 1)
  now += 2_000
  assertEquals((await loader.get()).apiKey, 'outra-chave')
  assertEquals(calls.length, 2)
  row = ROW
  loader.invalidate()
  assertEquals((await loader.get()).name, 'teste-7-dias-3')
  assertEquals(calls.length, 3)
})

Deno.test('conexão ativa: uma falha não fica em cache, e a leitura seguinte tenta de novo', async () => {
  let fail = true
  const { rpc, calls } = rpcReturning(() => fail ? { data: null, error: { code: '57014' } } : { data: [ROW], error: null })
  const loader = createActiveConnectionLoader({ rpc, env: env({}), now: () => 0 })
  await assertRejects(() => loader.get(), UnipileConfigMissingError)
  fail = false
  assertEquals((await loader.get()).name, 'teste-7-dias-3')
  assertEquals(calls.length, 2)
})

Deno.test('runtime: a ponte segue a versão da conexão ativa, e sem conexão devolve nulo em vez de enviar', async () => {
  const sent: string[] = []
  const impl = ((input: string | URL | Request) => {
    sent.push(String(input))
    // Cada versão responde ao envio no seu formato (a v1 não devolve `id`).
    const body = String(input).includes('/api/v1/')
      ? { object: 'EmailSent', tracking_id: 'em-1', provider_id: 'p-1' }
      : { id: 'em-1' }
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
  }) as typeof fetch
  const email = { to: [{ email: 'a@b.co' }], subject: 's', plain_text: 'p', custom_headers: [] }
  const signal = { signal: new AbortController().signal }

  const v1Runtime = createUnipileRuntime({ rpc: rpcReturning({ data: [ROW], error: null }).rpc, env: env({}), fetch: impl })
  const v1Bridge = await v1Runtime.bridge()
  assertEquals(v1Bridge?.version, 'v1')
  await v1Bridge!.sendEmail('acc', email, signal)
  assertEquals(sent[0], 'https://api68.unipile.com:19840/api/v1/emails')

  const standard = { ...ROW, name: 'padrão', base_url: DEFAULT_V2_BASE_URL, api_version: 'v2' }
  const v2Runtime = createUnipileRuntime({ rpc: rpcReturning({ data: [standard], error: null }).rpc, env: env({}), fetch: impl })
  const v2Bridge = await v2Runtime.bridge()
  assertEquals(v2Bridge?.version, 'v2')
  await v2Bridge!.sendEmail('acc', email, signal)
  assertEquals(sent[1], 'https://api.unipile.com/v2/acc/emails/send')

  const off = createUnipileRuntime({ rpc: rpcReturning({ data: [], error: null }).rpc, env: env({}), fetch: impl })
  assertEquals(await off.bridge(), null)
  assertEquals(await off.connection(), null)
  assertEquals(sent.length, 2)
})

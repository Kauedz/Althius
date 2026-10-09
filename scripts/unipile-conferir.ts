// Confere uma conta Unipile SEM escrever nada: lista as contas e os últimos chats de cada uma (canais-16). Serve para ver,
// numa conta de teste nova, se a chave e o endereço respondem, e quais campos a Unipile devolve de verdade.
//
//   deno run --allow-env --allow-net scripts/unipile-conferir.ts                 # a conexão ativa do banco (precisa do SUPABASE_*)
//   UNIPILE_API_KEY=… UNIPILE_API_URL=https://api68.unipile.com:19840 UNIPILE_API_VERSION=v1 \
//     deno run --allow-env --allow-net scripts/unipile-conferir.ts --env         # uma conta pelas variáveis, sem tocar no banco
//   … --link=google --retorno=https://app.althius.com.br/conexoes [--aviso=https://…]   # também gera um link de conexão
//
// A chave vem do ambiente (nunca de argumento nem do chat) e nunca é impressa.
import {
  type ConnectableProvider,
  conferir,
  createBridge,
  createActiveConnectionLoader,
  DEFAULT_V2_BASE_URL,
  type RpcClient,
} from '../supabase/functions/_shared/unipile/index.ts'

const args = new Map(Deno.args.map((arg) => {
  const [name, ...value] = arg.replace(/^--/, '').split('=')
  return [name, value.join('=') || 'true'] as const
}))

const PROVIDERS: ConnectableProvider[] = ['google', 'outlook', 'imap', 'whatsapp', 'linkedin']

function rpcViaRest(): RpcClient {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('Informe SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY, ou use --env com a conta nas variáveis.')
  return {
    async rpc(fn, body = {}) {
      const response = await fetch(`${url}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json().catch(() => null)
      return response.ok ? { data, error: null } : { data: null, error: { code: data?.code ?? String(response.status) } }
    },
  }
}

try {
  const fromEnvironment = args.has('env')
  const connection = fromEnvironment
    ? (() => {
      const apiKey = Deno.env.get('UNIPILE_API_KEY')
      if (!apiKey) throw new Error('Informe UNIPILE_API_KEY (e, para uma conta v1, UNIPILE_API_URL e UNIPILE_API_VERSION=v1).')
      const version = Deno.env.get('UNIPILE_API_VERSION') === 'v1' ? 'v1' as const : 'v2' as const
      return { name: 'variáveis do ambiente', version, baseUrl: Deno.env.get('UNIPILE_API_URL') ?? DEFAULT_V2_BASE_URL, apiKey }
    })()
    : await createActiveConnectionLoader({ rpc: rpcViaRest(), env: Deno.env }).get()

  const provider = args.get('link') as ConnectableProvider | undefined
  if (provider && !PROVIDERS.includes(provider)) throw new Error(`--link aceita: ${PROVIDERS.join(', ')}.`)
  const redirectUrl = args.get('retorno')
  if (provider && !redirectUrl) throw new Error('--link precisa de --retorno=<endereço para onde a pessoa volta>.')

  const bridge = createBridge(connection)
  const lines = await conferir(bridge, connection, {
    link: provider && redirectUrl ? { provider, redirectUrl, notifyUrl: args.get('aviso') } : undefined,
  })
  console.log(lines.join('\n'))
} catch (error) {
  // Só o tipo da falha: nunca a chave, o corpo da resposta ou a configuração.
  const status = (error as { status?: number } | null)?.status
  console.error(`Falhou: ${error instanceof Error ? error.message : 'erro'}${status ? ` (HTTP ${status})` : ''}`)
  Deno.exit(1)
}

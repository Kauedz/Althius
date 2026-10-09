// Registra na Unipile v1 os 4 webhooks que a Althius usa (mensagens, e-mail, estado da conta e relações), com o cabeçalho
// secreto Unipile-Auth (canais-17). Serve a cada conta v1 nova (as contas de teste de 7 dias que se revezam, ADR-0024).
//
// Por padrão só MOSTRA o que faria. Para criar de verdade, acrescente --aplicar. Webhooks antigos (de outro endereço, ou do
// mesmo sem o cabeçalho) não são apagados: o script avisa quais são e você os remove no painel da Unipile.
//
//   UNIPILE_API_KEY=… UNIPILE_API_URL=https://api68.unipile.com:19840 UNIPILE_WEBHOOK_SECRET=… \
//     deno run --allow-env --allow-net scripts/unipile-webhooks-v1.ts --url=https://<projeto>.supabase.co/functions/v1/unipile-account-status
//   … --aplicar
//
// A chave e o segredo vêm do ambiente (nunca de argumento nem do chat) e nunca são impressos. O segredo é o mesmo que o
// wizard grava no Vault como o segredo do webhook da conexão: o webhook confere o Unipile-Auth com ele.
import {
  describeV1Webhook,
  type ExistingV1Webhook,
  planV1Webhooks,
  v1WebhookRequest,
} from '../supabase/functions/_shared/unipile/webhooks-v1.ts'

const args = new Map(Deno.args.map((arg) => {
  const [name, ...value] = arg.replace(/^--/, '').split('=')
  return [name, value.join('=') || 'true'] as const
}))

function fail(message: string): never {
  console.error(`Falhou: ${message}`)
  Deno.exit(1)
}

const apiKey = Deno.env.get('UNIPILE_API_KEY') ?? fail('defina UNIPILE_API_KEY no ambiente.')
const baseUrl = (Deno.env.get('UNIPILE_API_URL') ?? fail('defina UNIPILE_API_URL (o endereço da conta v1, https://host:porta).'))
  .replace(/\/+$/, '')
const secret = (Deno.env.get('UNIPILE_WEBHOOK_SECRET') ?? '').trim()
const requestUrl = args.get('url') ?? ''
const apply = args.has('aplicar')

if (Deno.env.get('UNIPILE_API_VERSION') === 'v2') fail('este script é para a Unipile v1. Na v2 o wizard cadastra o endpoint pela API.')
if (!/^https:\/\/[^\s/]+\/.*unipile-account-status$/.test(requestUrl)) {
  fail('passe --url=https://<projeto>.supabase.co/functions/v1/unipile-account-status (https, terminando em unipile-account-status).')
}
if (secret.length < 16) fail('defina UNIPILE_WEBHOOK_SECRET com pelo menos 16 caracteres: o mesmo valor do segredo do webhook da conexão.')

async function call(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(`${baseUrl}/api/v1${path}`, {
    method,
    headers: { 'X-API-KEY': apiKey, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await response.json().catch(() => ({}))
  // Só o status e o método: o corpo da resposta pode ecoar o pedido (e o segredo).
  if (!response.ok) throw new Error(`HTTP ${response.status} em ${method} ${path}`)
  return data as Record<string, unknown>
}

try {
  const listed = await call('GET', '/webhooks')
  const existing = (Array.isArray(listed.items) ? listed.items : []) as ExistingV1Webhook[]
  const plan = planV1Webhooks(existing, requestUrl)
  console.log(`Unipile v1 em ${baseUrl} · ${existing.length} webhook(s) já cadastrado(s) · ${apply ? 'APLICANDO' : 'só mostrando (use --aplicar para criar)'}`)
  for (const hook of plan.existing) console.log(`= ${hook.name}: já existe para a fonte ${hook.source} neste endereço.`)
  for (const hook of plan.create) {
    console.log(`+ ${describeV1Webhook(hook)}`)
    if (!apply) continue
    const created = await call('POST', '/webhooks', v1WebhookRequest(hook, requestUrl, secret))
    console.log(`  criado (${String(created.webhook_id ?? created.id ?? 'sem id')}).`)
  }
  for (const hook of plan.unauthenticated) {
    console.log(`! ${hook.name ?? hook.id}: aponta para este endereço, mas sem o cabeçalho Unipile-Auth; os avisos dele recebem 401. Corrija ou apague no painel.`)
  }
  if (plan.others.length) {
    console.log(`! ${plan.others.length} webhook(s) apontam para outro endereço (${plan.others.map((hook) => hook.name ?? hook.id).join(', ')}). Se forem antigos, apague no painel da Unipile.`)
  }
  if (!apply && plan.create.length) console.log('Nada foi criado. Rode de novo com --aplicar.')
} catch (error) {
  console.error(`Falhou: ${error instanceof Error ? error.message : 'erro'}`)
  Deno.exit(1)
}

// Os webhooks da Unipile v1 (canais-17): quais a Althius registra e como. Na v1 não há endpoint gerado pela Unipile nem
// assinatura: cada webhook leva, nos `headers`, o `Unipile-Auth` com o segredo que o cliente escolhe (o da conexão ativa),
// e o webhook da Althius (unipile-account-status) o confere. Puro: quem chama a Unipile é scripts/unipile-webhooks-v1.ts.
//
// não confirmado: o formato do POST /api/v1/webhooks e dos nomes das fontes e eventos. Vem do protótipo
// (Kauedz/althius-revenue-os, scripts/unipile/configurar-webhooks.mjs), que o escreveu pela documentação da v1.

export interface V1WebhookDefinition {
  name: string
  source: 'messaging' | 'email' | 'account_status' | 'users'
  events: readonly string[]
}

export const V1_WEBHOOKS: readonly V1WebhookDefinition[] = [
  { name: 'althius-mensagens', source: 'messaging', events: ['message_received'] },
  { name: 'althius-email', source: 'email', events: ['mail_received'] },
  {
    name: 'althius-contas',
    source: 'account_status',
    events: ['creation_success', 'reconnected', 'sync_success', 'stopped', 'ok', 'error', 'credentials', 'permissions', 'deleted'],
  },
  { name: 'althius-relacoes', source: 'users', events: ['new_relation'] },
]

/** Um webhook que já existe na conta, como a listagem (GET /api/v1/webhooks) o devolve. Só os campos que o plano lê. */
export interface ExistingV1Webhook {
  id?: string
  name?: string
  source?: string
  request_url?: string
  headers?: Array<{ key?: string; value?: string }>
}

export interface V1WebhookPlan {
  /** O que falta criar. */
  create: V1WebhookDefinition[]
  /** Já existe para a fonte, no mesmo endereço e com o cabeçalho Unipile-Auth: não se cria de novo. */
  existing: V1WebhookDefinition[]
  /** Mesma fonte e endereço, mas sem o Unipile-Auth: os avisos dele chegam sem autenticação e recebem 401. */
  unauthenticated: ExistingV1Webhook[]
  /** Aponta para outro endereço. Só se avisa; apagar é no painel da Unipile. */
  others: ExistingV1Webhook[]
}

// não confirmado: a listagem devolve os cabeçalhos do webhook? Se o campo nem veio, não dá para saber e o webhook conta como
// já autenticado (criar outro duplicaria cada aviso); só um `headers` presente e sem o Unipile-Auth é avisado.
const hasAuthHeader = (hook: ExistingV1Webhook) =>
  hook.headers === undefined ||
  hook.headers.some((header) => String(header.key ?? '').toLowerCase() === 'unipile-auth')

export function planV1Webhooks(existing: ExistingV1Webhook[], requestUrl: string): V1WebhookPlan {
  const plan: V1WebhookPlan = { create: [], existing: [], unauthenticated: [], others: [] }
  for (const hook of existing) {
    if (hook.request_url !== requestUrl) plan.others.push(hook)
    else if (!hasAuthHeader(hook)) plan.unauthenticated.push(hook)
  }
  for (const wanted of V1_WEBHOOKS) {
    const same = existing.find((hook) => hook.source === wanted.source && hook.request_url === requestUrl && hasAuthHeader(hook))
    if (same) plan.existing.push(wanted)
    else plan.create.push(wanted)
  }
  return plan
}

/** O corpo do POST /api/v1/webhooks. O segredo (16+ caracteres) vai só no cabeçalho Unipile-Auth do webhook. */
export function v1WebhookRequest(definition: V1WebhookDefinition, requestUrl: string, secret: string) {
  if (!requestUrl.startsWith('https://')) throw new Error('O endereço do webhook precisa ser https.')
  if (secret.length < 16) throw new Error('O segredo do webhook precisa ter pelo menos 16 caracteres.')
  return {
    request_url: requestUrl,
    name: definition.name,
    source: definition.source,
    events: [...definition.events],
    format: 'json' as const,
    enabled: true,
    headers: [{ key: 'Content-Type', value: 'application/json' }, { key: 'Unipile-Auth', value: secret }],
  }
}

/** Uma linha para o terminal: nome, fonte e eventos. Nunca o segredo. */
export function describeV1Webhook(definition: V1WebhookDefinition): string {
  return `${definition.name}: ${definition.source} → ${definition.events.join(', ')}`
}

import { expect, test } from '@playwright/test'
import { ambiente } from '../support/ambiente.js'
import { conferirWorkspaceOperacional, vigiar } from '../support/vigia.js'

// RPCs que gravam (mesmo padrão do 09 e do 10); as de leitura (get_, list_, quote_) são POST mas não gravam.
const ESCRITA_POR_RPC = /\/rest\/v1\/rpc\/(accept_|discard_|create_|save_|update_|delete_|archive_|set_|decide_|cancel_|move_|send_|propose_|agent_|start_|activate_|rename_|erase_|restore_|approve_|reject_|record_|enqueue_|register_|connect_|disconnect_|enable_|disable_)/

test('Canais de envio conecta sem abrir provedor real nem escrever no banco', async ({ page }, testInfo) => {
  const conferir = vigiar(page, testInfo)
  const e = ambiente()
  const chamadas: Record<string, unknown>[] = []
  const escritas: string[] = []

  page.on('request', (request) => {
    if (!request.url().startsWith(e.supabaseUrl)) return
    const url = request.url()
    const escritaEmTabela = request.method() !== 'GET' && request.method() !== 'HEAD' && /\/rest\/v1\/(?!rpc\/)/.test(url)
    // Toda Edge Function conta, menos as leituras que o app faz ao abrir.
    const capability = /\/functions\/v1\/agent-conversation\b/.test(url) && /"action"\s*:\s*"capability"/.test(request.postData() ?? '')
    // canal-whatsapp-status só diz se o adaptador está configurado (não lê nem grava o banco).
    const leitura = capability || /\/functions\/v1\/canal-whatsapp-status\b/.test(url)
    const funcao = /\/functions\/v1\//.test(url) && request.method() !== 'OPTIONS' && !leitura
    if (ESCRITA_POR_RPC.test(url) || escritaEmTabela || funcao) escritas.push(`${request.method()} ${new URL(url).pathname}`)
  })
  await page.route(`${e.supabaseUrl}/rest/v1/rpc/list_owned_sender_accounts`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.route(`${e.supabaseUrl}/rest/v1/rpc/list_my_sender_entry_quotas`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.route((url) => url.href.startsWith(e.supabaseUrl) && url.pathname.endsWith('/functions/v1/sender-accounts'), async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204 })
    const corpo = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>
    chamadas.push(corpo)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: 'https://example.invalid/unipile-hosted' }) })
  })
  await page.addInitScript(() => {
    window.open = () => null
  })

  await page.goto('/conexoes')
  await conferirWorkspaceOperacional(page)
  const envio = page.getByRole('region', { name: 'Canais de envio' })
  await expect(envio).toBeVisible()
  await expect(envio.getByRole('listitem', { name: 'LinkedIn' })).toBeVisible()
  await expect(envio.getByRole('listitem', { name: 'E-mail' })).toBeVisible()
  await envio.getByRole('button', { name: 'Conectar LinkedIn' }).click()
  await expect(page.getByText(/autenticação.*outra aba/i)).toBeVisible()
  expect(chamadas).toEqual([expect.objectContaining({ action: 'connect', channel: 'linkedin' })])
  expect(escritas.filter((path) => !path.includes('/functions/v1/sender-accounts'))).toEqual([])
  await conferir()
})

import { expect, test } from '@playwright/test'
import { ambiente } from '../support/ambiente.js'
import { conferirWorkspaceOperacional, vigiar } from '../support/vigia.js'

// RPCs que gravam (mesmo padrão do 09) e as do fluxo de Descobertas; as de leitura (get_, list_, quote_) são POST mas não gravam.
const ESCRITA_POR_RPC = /\/rest\/v1\/rpc\/(accept_|discard_|create_|save_|update_|delete_|archive_|set_|decide_|cancel_|move_|send_|propose_|agent_|start_|activate_|rename_|erase_|restore_|approve_|reject_|record_|enqueue_|register_)/

test('aceitar Descoberta chama Comitê e Receita sem escrever além do fluxo interceptado', async ({ page }, testInfo) => {
  const conferir = vigiar(page, testInfo)
  const e = ambiente()
  const descoberta = 'e1000000-0000-0000-0000-000000000001'
  const conta = 'd1000000-0000-0000-0000-000000000001'
  const chamadas: string[] = []
  const escritas: string[] = []

  page.on('request', (request) => {
    if (!request.url().startsWith(e.supabaseUrl)) return
    const url = request.url()
    const escritaEmTabela = request.method() !== 'GET' && request.method() !== 'HEAD' && /\/rest\/v1\/(?!rpc\/)/.test(url)
    // Toda Edge Function conta como escrita, menos a leitura `capability` da agent-conversation que o app faz ao abrir.
    const capability = /\/functions\/v1\/agent-conversation\b/.test(url) && /"action"\s*:\s*"capability"/.test(request.postData() ?? '')
    const funcao = /\/functions\/v1\//.test(url) && request.method() !== 'OPTIONS' && !capability
    if (ESCRITA_POR_RPC.test(url) || escritaEmTabela || funcao) escritas.push(new URL(url).pathname)
  })
  await page.route(`${e.supabaseUrl}/rest/v1/rpc/list_discovered_accounts`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{
      id: descoberta, state: 'nova', name: 'Conta Smoke Descoberta', website: 'https://smoke-descoberta.invalid',
      domain: 'smoke-descoberta.invalid', cnpj: '00000000000191', sector: 'Software', fit_level: 'alto', reasons: [], signals: [],
      tags: [], created_at: new Date().toISOString(),
    }]) })
  })
  await page.route(`${e.supabaseUrl}/rest/v1/rpc/accept_discovered_account`, async (route) => {
    chamadas.push('accept')
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ target_account_id: conta, created: true, signals_moved: 0, committee: 'liberado' }]) })
  })
  // buscarComite lê a Conta-alvo recém-criada antes de chamar o Comitê; a Conta é falsa, então a leitura também é interceptada.
  const leituraDaConta = (url: URL) => url.href.startsWith(`${e.supabaseUrl}/rest/v1/target_accounts`) && url.searchParams.get('id') === `eq.${conta}`
  await page.route(leituraDaConta, async (route) => {
    chamadas.push('ler-conta')
    const linhaDaConta = { name: 'Conta Smoke Descoberta', linkedin_url: null, domain: 'smoke-descoberta.invalid' }
    const objeto = (route.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(objeto ? linhaDaConta : [linhaDaConta]) })
  })
  await page.route(`${e.supabaseUrl}/functions/v1/account-enrichment`, async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as { action?: string; targetAccountId?: string; cnpj?: string }
    chamadas.push(`${body.action}:${body.targetAccountId}:${body.cnpj ?? ''}`)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body.action === 'comite-compra' ? { encontradas: 1, novas: 1, jaEncontradas: 0 } : { razaoSocial: 'Smoke Receita' }) })
  })

  await page.goto('/contas/descobertas')
  await conferirWorkspaceOperacional(page)
  const linha = page.getByRole('row').filter({ hasText: 'Conta Smoke Descoberta' })
  await linha.getByRole('button', { name: /Aceitar/i }).click()
  await expect(page.getByText(/Conta Smoke Descoberta agora é uma Conta-alvo/)).toBeVisible()
  await expect(page.getByText(/Dados da Receita: ok/)).toBeVisible()
  expect(chamadas).toEqual(['accept', 'ler-conta', `comite-compra:${conta}:`, `cnpj-receita:${conta}:00000000000191`])
  expect(escritas.filter((path) => !path.includes('/rpc/accept_discovered_account') && !path.includes('/functions/v1/account-enrichment'))).toEqual([])
  await conferir()
})

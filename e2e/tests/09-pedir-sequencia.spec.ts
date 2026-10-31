// Gerar Sequência sem o Rhetor (Sinais first 11). No detalhe de uma Conta Quente, "Gerar Sequência" começa uma Conversa
// coordenada nova com o pedido e vai para /conversa, sem procurar um Agente pela Especialidade e sem abrir a Conversa só
// leitura de um Agente (/agentes/:id/conversa, ticket 10).
//
// O Workspace QA não tem Conta-alvo nem Sinal, e o smoke não pode criar dado comercial nem rodar a IA em produção. Então a
// Conta é de mentira, só no navegador: as leituras dela (`target_accounts`, `sales_responsibilities` e o foguinho de
// `list_account_signals`) são respondidas pelo teste para um id que não existe no banco; todo o resto da tela vem da
// produção (o bundle publicado, o login do QA, as outras leituras). O pedido à `agent-conversation` é interceptado e
// respondido com uma recusa, para nada ser gravado nem cobrado; o teste confere o corpo dele. Nenhuma escrita sai.
import { expect, test } from '@playwright/test'
import { ambiente } from '../support/ambiente.js'
import { tokenDoQa } from '../support/sessao.js'
import { conferirWorkspaceOperacional, vigiar } from '../support/vigia.js'

const CONTA = '0b110000-0000-4000-8000-00000000c0de'
const NOME = 'Conta Smoke 11'
const ESCRITA_POR_RPC = /\/rest\/v1\/rpc\/(create_|save_|update_|delete_|archive_|set_|decide_|cancel_|move_|send_|propose_|agent_|start_|activate_|rename_|erase_|restore_|approve_|reject_|record_|enqueue_|register_)/

// O trace fica também quando passa: é a evidência pedida pelo ticket cadencia-pela-ia 04.
test.use({ trace: 'on' })

function usuarioDoQa(): string {
  const carga = tokenDoQa().split('.')[1]
  return (JSON.parse(Buffer.from(carga, 'base64url').toString('utf8')) as { sub: string }).sub
}

test('Gerar Sequência abre uma Conversa coordenada nova, sem a Conversa só leitura de um Agente e sem escrever', async ({ page }, testInfo) => {
  const conferir = vigiar(page, testInfo)
  const e = ambiente()
  const usuario = usuarioDoQa()
  const pedidos: Record<string, unknown>[] = []
  const escritas: string[] = []
  const caminhos: string[] = []

  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) caminhos.push(new URL(frame.url()).pathname)
  })
  page.on('request', (req) => {
    const url = req.url()
    if (!url.startsWith(e.supabaseUrl)) return
    if (ESCRITA_POR_RPC.test(url) || (req.method() !== 'GET' && req.method() !== 'HEAD' && /\/rest\/v1\/(?!rpc\/)/.test(url))) {
      escritas.push(`${req.method()} ${new URL(url).pathname}`)
    }
  })

  // A Conta de mentira, só para este navegador. As RPCs de leitura que recebem o id dela respondem vazio (no banco a Conta
  // não existe); as outras seguem para a produção.
  await page.route(`${e.supabaseUrl}/rest/v1/rpc/**`, async (route) => {
    if (!(route.request().postData() ?? '').includes(CONTA)) return route.fallback()
    const custo = [{ monitors: 0, credits: 0, available: 0, in_progress: false, last_finished_at: null, last_error: null }]
    const corpo = route.request().url().endsWith('/rpc/quote_account_rescan') ? custo : []
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo) })
  })
  await page.route(`${e.supabaseUrl}/rest/v1/target_accounts?**`, async (route) => {
    const url = route.request().url()
    if (!url.includes(`id=eq.${CONTA}`)) return route.fallback()
    const linha = {
      id: CONTA, name: NOME, canonical_url: 'https://smoke-11.invalid', domain: 'smoke-11.invalid', linkedin_url: null,
      segment: null, legal_identifier: null, receita_data: null, last_interaction_at: null, archived_at: null,
    }
    const objeto = (route.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(objeto ? linha : [linha]) })
  })
  await page.route(`${e.supabaseUrl}/rest/v1/sales_responsibilities?**`, async (route) => {
    if (!route.request().url().includes(`target_account_id=eq.${CONTA}`)) return route.fallback()
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify([{ target_account_id: CONTA, owner_user_id: usuario }]) })
  })
  await page.route(`${e.supabaseUrl}/rest/v1/rpc/list_account_signals`, async (route) => {
    const resposta = await route.fetch()
    const linhas = resposta.ok() ? ((await resposta.json()) as unknown[]) : []
    await route.fulfill({ response: resposta, contentType: 'application/json', body: JSON.stringify([...linhas,
      { target_account_id: CONTA, valid_signals: 1, hot: true, last_phrase: 'Abriu vagas de vendas', last_fired_at: new Date().toISOString() }]) })
  })
  // O pedido aos Agentes não sai: a função responde uma recusa, e o teste guarda o corpo.
  await page.route(`${e.supabaseUrl}/functions/v1/agent-conversation`, async (route) => {
    const corpo = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>
    if (corpo.action === 'capability') return route.continue()
    pedidos.push(corpo)
    await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Pedido interceptado pelo smoke.' }) })
  })

  await page.goto(`/contas/${CONTA}`)
  await conferirWorkspaceOperacional(page)
  await expect(page.getByRole('heading', { level: 2, name: NOME })).toBeVisible()
  // A versão no ar: o publish não expõe o commit, mas o nome do bundle muda a cada build (cadencia-pela-ia 04).
  const bundles = await page.locator('script[src*="/assets/"]').evaluateAll((scripts) => scripts.map((script) => script.getAttribute('src') ?? ''))
  testInfo.annotations.push({ type: 'bundle', description: bundles.join(' ') })
  const botao = page.getByRole('button', { name: 'Gerar Sequência', exact: true })
  await expect(botao).toBeVisible()
  await expect(page.getByRole('button', { name: /Rhetor/ })).toHaveCount(0)
  // Ao lado fica "Criar sequência", que abre o modal na própria Conta e não navega: o clique tem que ser no outro.
  await expect(page.getByRole('button', { name: 'Criar sequência', exact: true })).toBeVisible()
  // A prova do ticket 04 fica no relatório também quando o clique não navega: a URL e os prints vêm antes da asserção.
  const antes = page.url()
  await testInfo.attach('antes-do-clique.png', { body: await page.screenshot(), contentType: 'image/png' })
  await botao.click()
  try {
    await expect(page).toHaveURL(/\/conversa$/)
  } finally {
    testInfo.annotations.push({ type: 'url', description: `${antes} -> ${page.url()}` })
    await testInfo.attach('depois-do-clique.png', { body: await page.screenshot(), contentType: 'image/png' })
  }
  await expect(page.getByRole('form', { name: 'Continuar a Conversa' })).toBeVisible()
  await expect(page.getByText(/Monte uma Sequência de e-mail para a Conta-alvo Conta Smoke 11/).first()).toBeVisible()
  await expect.poll(() => pedidos.length).toBe(1)
  const pedido = pedidos[0]
  testInfo.annotations.push({ type: 'pedido', description: JSON.stringify({ ...pedido, workspaceId: '(QA)' }) })
  expect(pedido.action).toBe('send')
  expect(pedido.agentId, 'o pedido vai à Coordenação, não a um Agente').toBeNull()
  expect(pedido.conversationId, 'a Conversa coordenada é nova').toBeNull()
  expect(pedido.workspaceId).toBe(e.workspaceId)
  expect(String(pedido.text)).toContain(`(id ${CONTA})`)
  expect(caminhos.filter((c) => c.startsWith('/agentes/')), 'nunca passa pela Conversa só leitura de um Agente').toEqual([])
  expect(escritas, 'nenhuma escrita em produção').toEqual([])
  await conferir()
})

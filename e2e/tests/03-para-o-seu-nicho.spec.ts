// Prateleira "Para o seu nicho" em /sinais: a RPC list_signal_catalog_for_my_icp responde, a prateleira mostra cards e o
// subtítulo diz que o nicho veio do ICP do Workspace (o QA tem setor preenchido). A letra interna do nicho (A–H) nunca
// aparece para o cliente.
import { expect, test } from '@playwright/test'
import { conferirWorkspaceOperacional, esperarRpc, vigiar } from '../support/vigia.js'

test('Sinais: a prateleira "Para o seu nicho" carrega pelo ICP', async ({ page }, testInfo) => {
  const conferir = vigiar(page, testInfo)
  const catalogo = esperarRpc(page, 'list_signal_catalog_for_my_icp')
  await page.goto('/sinais')
  const resposta = await catalogo
  expect(resposta.status()).toBe(200)
  await testInfo.attach('list_signal_catalog_for_my_icp.json', { body: JSON.stringify(await resposta.json(), null, 2), contentType: 'application/json' })
  expect(page.url(), 'o Day0 do QA precisa estar concluído (teste 02)').not.toContain('/onboarding')
  await conferirWorkspaceOperacional(page)

  const prateleira = page.getByRole('region', { name: 'Para o seu nicho' })
  await expect(prateleira.getByRole('heading', { name: 'Para o seu nicho', level: 2 })).toBeVisible()
  await expect(prateleira.getByText(/pelo ICP do Workspace$/)).toBeVisible()
  const cards = prateleira.getByRole('list', { name: 'Para o seu nicho' }).getByRole('heading', { level: 3 })
  await expect(cards.first()).toBeVisible()
  testInfo.annotations.push({
    type: 'info',
    description: `subtítulo: "${await prateleira.getByText(/pelo ICP do Workspace$/).textContent()}"; cards: ${await cards.count()}`,
  })
  await expect(prateleira).not.toContainText(/\b(ICP|Nicho) [A-H]\b/)
  await conferir()
})

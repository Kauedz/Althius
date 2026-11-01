// Prateleira "Para o seu nicho" em /sinais: o nicho sai dos Segmentos do ICP da Memória do Workspace, como antes do
// Sinais first (desfazer-sinais-first 04), sem chamar list_signal_catalog_for_my_icp. A prateleira mostra cards e a
// letra interna do nicho (A–H) nunca aparece para o cliente.
import { expect, test } from '@playwright/test'
import { conferirWorkspaceOperacional, vigiar } from '../support/vigia.js'

test('Sinais: a prateleira "Para o seu nicho" carrega sem ranquear pelo ICP estruturado', async ({ page }, testInfo) => {
  const conferir = vigiar(page, testInfo)
  const rankingPeloIcp: string[] = []
  page.on('request', (pedido) => {
    if (pedido.url().includes('/rpc/list_signal_catalog_for_my_icp')) rankingPeloIcp.push(pedido.url())
  })
  await page.goto('/sinais')
  expect(page.url(), 'o Day0 do QA precisa estar concluído (teste 02)').not.toContain('/onboarding')
  await conferirWorkspaceOperacional(page)

  const prateleira = page.getByRole('region', { name: 'Para o seu nicho' })
  await expect(prateleira.getByRole('heading', { name: 'Para o seu nicho', level: 2 })).toBeVisible()
  const subtitulo = prateleira.getByText(/pelos Segmentos do ICP do Workspace$|Descreva os Segmentos do ICP na Memória para afinar\.$/)
  await expect(subtitulo).toBeVisible()
  const cards = prateleira.getByRole('list', { name: 'Para o seu nicho' }).getByRole('heading', { level: 3 })
  await expect(cards.first()).toBeVisible()
  testInfo.annotations.push({ type: 'info', description: `subtítulo: "${await subtitulo.textContent()}"; cards: ${await cards.count()}` })
  await expect(prateleira).not.toContainText(/\b(ICP|Nicho) [A-H]\b/)
  expect(rankingPeloIcp).toEqual([])
  await conferir()
})

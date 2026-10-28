// Página de Sinais: abre no Workspace operacional com os Monitoramentos e o catálogo carregados.
import { expect, test } from '@playwright/test'
import { conferirWorkspaceOperacional, esperarRpc, vigiar } from '../support/vigia.js'

test('Sinais: a página abre com Monitoramentos e catálogo', async ({ page }, testInfo) => {
  const conferir = vigiar(page, testInfo)
  const monitores = esperarRpc(page, 'list_signal_monitors')
  const catalogo = esperarRpc(page, 'list_signal_catalog')
  await page.goto('/sinais')
  expect((await monitores).status()).toBe(200)
  expect((await catalogo).status()).toBe(200)
  expect(page.url(), 'o Day0 do QA precisa estar concluído (teste 02)').not.toContain('/onboarding')
  await conferirWorkspaceOperacional(page)
  await expect(page.getByRole('heading', { name: 'Sinais' }).first()).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await conferir()
})

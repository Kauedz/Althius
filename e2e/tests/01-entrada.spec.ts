// Entrada: o formulário de login abre em produção e a sessão do QA chega ao Workspace operacional (não à Demonstração).
import { expect, test } from '@playwright/test'
import { ambiente } from '../support/ambiente.js'
import { SEM_SESSAO } from '../support/sessao.js'
import { conferirWorkspaceOperacional, esperarRpc, vigiar } from '../support/vigia.js'

test.describe('sem sessão', () => {
  test.use({ storageState: SEM_SESSAO })

  test('a tela /entrar mostra o formulário de entrada', async ({ page }, testInfo) => {
    const conferir = vigiar(page, testInfo)
    await page.goto('/entrar')
    await expect(page.getByRole('heading', { name: 'Entrar', exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: /e-mail/i })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible()
    // Não envia: o login com senha tem CAPTCHA e não é papel do smoke tentar passar por ele.
    await conferir()
  })
})

test('com a sessão do QA, / abre o Workspace operacional', async ({ page }, testInfo) => {
  const conferir = vigiar(page, testInfo)
  const bootstrap = esperarRpc(page, 'bootstrap_personal_workspace')
  const contratos = esperarRpc(page, 'list_my_contracted_workspaces')
  await page.goto('/')
  expect((await bootstrap).status()).toBe(200)
  const respostaDosContratos = await contratos
  expect(respostaDosContratos.status()).toBe(200)
  const lista = (await respostaDosContratos.json()) as { workspace_id: string }[]
  expect(lista.map((w) => w.workspace_id), 'o Workspace QA tem contrato ativo').toContain(ambiente().workspaceId)
  await conferirWorkspaceOperacional(page)
  await expect(page.getByText(ambiente().email, { exact: true }).first()).toBeVisible()
  await conferir()
})

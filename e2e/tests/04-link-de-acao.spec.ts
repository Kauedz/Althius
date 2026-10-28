// Link de ação do WhatsApp (/a/<token>): com sessão, um token inválido mostra "Este link não existe ou pertence a outra
// Conta." sem erro na página. Sem sessão, a página manda para /entrar e volta ao link depois do login.
import { expect, test } from '@playwright/test'
import { SEM_SESSAO } from '../support/sessao.js'
import { esperarRpc, vigiar } from '../support/vigia.js'

test('/a/<token inválido>, com sessão, mostra o estado de link inválido', async ({ page }, testInfo) => {
  const conferir = vigiar(page, testInfo)
  const leitura = esperarRpc(page, 'get_whatsapp_action_link')
  await page.goto(`/a/qa-token-invalido-${Date.now()}`)
  const resposta = await leitura
  expect(resposta.status()).toBeLessThan(500)
  await expect(page.getByRole('heading', { name: 'Confirmar ação' })).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('Este link não existe ou pertence a outra Conta.')
  // Nenhum botão de decisão aparece para um link inválido.
  await expect(page.getByRole('button', { name: /Aprovar|Recusar/ })).toHaveCount(0)
  await conferir()
})

test.describe('sem sessão', () => {
  test.use({ storageState: SEM_SESSAO })

  test('/a/<token> pede login e guarda o destino', async ({ page }, testInfo) => {
    const conferir = vigiar(page, testInfo)
    const token = `qa-token-invalido-${Date.now()}`
    await page.goto(`/a/${token}`)
    await expect(page.getByRole('heading', { name: 'Entrar', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Esqueci a senha' })).toHaveAttribute('href', new RegExp(encodeURIComponent(`/a/${token}`)))
    await conferir()
  })
})

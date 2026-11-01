// Day0 operacional e ICP do Workspace.
// 1. Day0: as respostas (papel, empresa, domínio, como conheceu) vão para save_my_day0 e voltam por get_my_day0 depois de
//    recarregar. O QA pode estar em qualquer etapa; o teste percorre as que faltam com dados de teste e conclui o Day0.
// 2. ICP: o texto da seção ICP do Playbook é salvo e volta depois de recarregar (ADR-0034: o ICP é o do Playbook). O texto
//    começa pelo ICP de teste do QA, que o Plano do Sinal lê.
import { expect, type Page, test } from '@playwright/test'
import { ambiente } from '../support/ambiente.js'
import { ICP_DO_PLAYBOOK_DO_QA } from '../support/fixture-icp.js'
import { tokenDoQa } from '../support/sessao.js'
import { esperarRpc, vigiar } from '../support/vigia.js'

const EMPRESA = 'QA Althius (automação)'
const DOMINIO = 'althius.com.br'

async function rpc<T>(page: Page, nome: string): Promise<T> {
  const e = ambiente()
  const resposta = await page.request.post(`${e.supabaseUrl}/rest/v1/rpc/${nome}`, {
    headers: { apikey: e.publishableKey, Authorization: `Bearer ${tokenDoQa()}` },
    data: { p_workspace_id: e.workspaceId },
  })
  expect(resposta.status(), `${nome} respondeu`).toBe(200)
  return (await resposta.json()) as T
}

async function salvarEtapa(page: Page, botao: string) {
  const salvou = esperarRpc(page, 'save_my_day0')
  await page.getByRole('button', { name: botao, exact: true }).click()
  expect((await salvou).status()).toBe(200)
}

test('Day0: as respostas salvas voltam depois de recarregar', async ({ page }, testInfo) => {
  const conferir = vigiar(page, testInfo)
  await page.goto('/onboarding')
  const titulo = page.getByRole('heading', { level: 1 })

  for (let passo = 0; passo < 6; passo++) {
    await expect(titulo).toHaveText(/Qual é o seu papel\?|Qual é a sua empresa\?|Qual é o site da empresa\?|Como nos conheceu\?|Tudo pronto para começar|Day0 concluído/, { timeout: 20_000 })
    const agora = (await titulo.textContent()) ?? ''
    if (agora.includes('Day0 concluído')) break
    if (agora.includes('papel')) {
      await page.getByRole('radio', { name: 'Founder' }).click()
      await salvarEtapa(page, 'Continuar')
    } else if (agora.includes('empresa')) {
      await page.getByRole('textbox', { name: 'Empresa' }).fill(EMPRESA)
      await salvarEtapa(page, 'Continuar')
    } else if (agora.includes('site')) {
      await page.getByRole('textbox', { name: 'Domínio do site' }).fill(DOMINIO)
      await salvarEtapa(page, 'Continuar')
    } else if (agora.includes('conheceu')) {
      await page.getByRole('radiogroup', { name: 'Como nos conheceu?' }).getByRole('radio').first().click()
      await salvarEtapa(page, 'Continuar')
    } else {
      // Recarrega antes de concluir: o progresso tem que estar salvo no banco, não só na tela.
      await page.reload()
      await expect(titulo).toHaveText('Tudo pronto para começar', { timeout: 20_000 })
      await page.getByRole('button', { name: 'Concluir Day0' }).click()
      await expect(page).not.toHaveURL(/\/onboarding/, { timeout: 20_000 })
      await page.goto('/onboarding')
    }
  }

  await page.reload()
  await expect(titulo).toHaveText('Day0 concluído', { timeout: 20_000 })
  const day0 = await rpc<{ empresa: string; dominio: string; concluido: boolean; papel: string | null }>(page, 'get_my_day0')
  await testInfo.attach('get_my_day0.json', { body: JSON.stringify(day0, null, 2), contentType: 'application/json' })
  expect(day0.concluido).toBe(true)
  expect(day0.empresa).toBe(EMPRESA)
  expect(day0.dominio).toBe(DOMINIO)
  await conferir()
})

test('ICP: o texto salvo no Playbook volta depois de recarregar', async ({ page }, testInfo) => {
  const conferir = vigiar(page, testInfo)
  const texto = `${ICP_DO_PLAYBOOK_DO_QA} Salvo pela automação QA em ${new Date().toISOString()}.`
  await page.goto('/configuracoes/playbook/icp')
  const campo = page.locator('#playbook-texto')
  await expect(campo).toBeVisible({ timeout: 20_000 })
  await campo.fill(texto)
  const salvou = esperarRpc(page, 'save_playbook_section')
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  expect((await salvou).status()).toBe(200)
  await expect(page.getByText('Playbook salvo.')).toBeVisible()

  await page.reload()
  await expect(page.locator('#playbook-texto')).toHaveValue(texto, { timeout: 20_000 })

  // O ICP não é mais lido do registro estruturado: a tela do Playbook não oferece Setor, Porte nem Região.
  await expect(page.getByRole('region', { name: 'Campos do ICP' })).toHaveCount(0)
  await conferir()
})

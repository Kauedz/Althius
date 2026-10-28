// Composer cria o Sinal (Sinais first 08) e "Meus Sinais" (09). O pedido de monitoramento na / leva ao fluxo de
// /sinais/novo com o Briefing já preenchido. O teste para aí: não monta o Plano (não gasta Plano do dia), não salva,
// não ativa e não cobra nada. Só a conta QA.
import { expect, test } from '@playwright/test'
import { conferirWorkspaceOperacional, vigiar } from '../support/vigia.js'

const PEDIDO = 'Monitore a variação diária do preço do cacau em bolsas locais'

test('composer: um pedido de Sinal novo abre /sinais/novo com o Briefing preenchido, sem salvar nada', async ({ page }, testInfo) => {
  const conferir = vigiar(page, testInfo)
  const chamadasQueGravam: string[] = []
  page.on('request', (req) => {
    const url = req.url()
    if (/\/rest\/v1\/rpc\/(save_signal_plan|save_signal_monitor|begin_signal_plan_request)\b/.test(url) || /\/functions\/v1\/signal-(plan|runner)\b/.test(url)) {
      chamadasQueGravam.push(url)
    }
  })
  await page.goto('/')
  await conferirWorkspaceOperacional(page)
  const formulario = page.getByRole('form', { name: 'Pedido aos agentes' })
  await formulario.getByRole('textbox').fill(PEDIDO)
  await formulario.getByRole('button', { name: 'Enviar' }).click()
  await page.waitForURL(/\/sinais\/novo$/)
  await expect(page.getByRole('textbox', { name: /O que você quer acompanhar/ })).toHaveValue(PEDIDO)
  expect(chamadasQueGravam, 'abrir o fluxo não pode montar, salvar nem rodar Sinal').toEqual([])
  await conferir()
})

test('Sinais: "Meus Sinais" e "Modelos" são áreas distintas na mesma tela', async ({ page }, testInfo) => {
  const conferir = vigiar(page, testInfo)
  await page.goto('/sinais')
  await conferirWorkspaceOperacional(page)
  await expect(page.getByRole('heading', { name: 'Meus Sinais' }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Modelos', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Catálogo de sinais' })).toBeVisible()
  await conferir()
})

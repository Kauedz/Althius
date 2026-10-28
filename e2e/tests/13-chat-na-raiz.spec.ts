// Fase 3b: a / é o chat do Agente. O teste só abre e confere a tela; não envia pedido (o envio é conferido fora do
// navegador, pela função `agente`) e não gasta crédito. Só a conta QA.
import { expect, test } from '@playwright/test'
import { conferirWorkspaceOperacional, vigiar } from '../support/vigia.js'

test('/ abre o chat do Agente com o composer pronto e o motor no ar', async ({ page }, testInfo) => {
  const conferir = vigiar(page, testInfo)
  const pedidos: string[] = []
  page.on('request', (req) => {
    if (/\/functions\/v1\/agente\b/.test(req.url()) && /"action"\s*:\s*"enviar"/.test(req.postData() ?? '')) pedidos.push(req.url())
  })
  await page.goto('/')
  await conferirWorkspaceOperacional(page)
  await expect(page.getByRole('heading', { name: 'Agente', exact: true }).first()).toBeVisible()
  const formulario = page.getByRole('form', { name: 'Pedido ao agente' })
  await expect(formulario).toBeVisible()
  await expect(formulario.getByRole('textbox')).toBeEditable()
  await expect(page.getByText('O motor de IA do agente está fora do ar agora.')).toHaveCount(0)
  await expect(page.getByRole('form', { name: 'Pedido aos agentes' })).toHaveCount(0)
  expect(pedidos, 'abrir a / não pode mandar pedido ao agente').toEqual([])
  await conferir()
})

test('/agentes mantém a tela antiga dos agentes', async ({ page }, testInfo) => {
  const conferir = vigiar(page, testInfo)
  await page.goto('/agentes')
  await conferirWorkspaceOperacional(page)
  await expect(page.getByRole('form', { name: 'Pedido aos agentes' })).toBeVisible()
  await conferir()
})

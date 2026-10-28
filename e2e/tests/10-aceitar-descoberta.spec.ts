import { expect, test } from '@playwright/test'
import { ambiente } from '../support/ambiente.js'
import { conferirWorkspaceOperacional, vigiar } from '../support/vigia.js'

test('aceitar Descoberta chama Comitê e Receita sem escrever além do fluxo interceptado', async ({ page }, testInfo) => {
  const conferir = vigiar(page, testInfo)
  const e = ambiente()
  const descoberta = 'e1000000-0000-0000-0000-000000000001'
  const conta = 'd1000000-0000-0000-0000-000000000001'
  const chamadas: string[] = []
  const escritas: string[] = []

  page.on('request', (request) => {
    if (!request.url().startsWith(e.supabaseUrl)) return
    if (request.method() !== 'GET' && request.method() !== 'HEAD') escritas.push(new URL(request.url()).pathname)
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
  await page.route(`${e.supabaseUrl}/functions/v1/account-enrichment`, async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as { action?: string; targetAccountId?: string; cnpj?: string }
    chamadas.push(`${body.action}:${body.targetAccountId}:${body.cnpj ?? ''}`)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body.action === 'comite-compra' ? { encontradas: 1, novas: 1, jaEncontradas: 0 } : { razaoSocial: 'Smoke Receita' }) })
  })

  await page.goto('/contas/descobertas')
  await conferirWorkspaceOperacional(page)
  const linha = page.getByText('Conta Smoke Descoberta').locator('..')
  await linha.getByRole('button', { name: /Aceitar/i }).click()
  await expect(page.getByText(/Conta Smoke Descoberta agora é uma Conta-alvo/)).toBeVisible()
  await expect(page.getByText(/Dados da Receita: ok/)).toBeVisible()
  expect(chamadas).toEqual(['accept', `comite-compra:${conta}:`, `cnpj-receita:${conta}:00000000000191`])
  expect(escritas.filter((path) => !path.includes('/rpc/accept_discovered_account') && !path.includes('/functions/v1/account-enrichment'))).toEqual([])
  await conferir()
})

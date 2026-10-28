import { expect, test } from '@playwright/test'
import { ambiente } from '../support/ambiente.js'
import { conferirWorkspaceOperacional, vigiar } from '../support/vigia.js'

// A Caixa de Descobertas com candidatas no formato que a busca pelo ICP (account-discovery) grava hoje: cada motivo é
// `{ criterio, atende, texto }`. Em 28/10 isso deixava /contas/descobertas em branco (objeto desenhado direto no React).
// A lista é interceptada: o QA não tem candidatas e o teste não busca (a busca gasta créditos e Apify).
test('Descobertas abre com candidatas da busca e mostra os motivos como texto', async ({ page }, testInfo) => {
  const conferir = vigiar(page, testInfo)
  const e = ambiente()
  const agora = new Date().toISOString()
  const candidata = (n: number, nome: string) => ({
    id: `e2000000-0000-0000-0000-00000000000${n}`, run_id: 'e2000000-0000-0000-0000-000000000000', state: 'nova', name: nome,
    website: null, domain: null, cnpj: null, linkedin_url: 'https://www.linkedin.com/company/smoke-descobertas/',
    location: 'Franca, Brazil', uf: 'SP', sector: 'Transportation, Logistics, Supply Chain and Storage', size_label: '2-10',
    employee_count: 8, description: 'Candidata de smoke.', tags: ['Logística'], source_actor: 'harvestapi~linkedin-company-search',
    fit_level: 'alto', signals: [], target_account_id: null, decided_by: null, decided_at: null, discard_reason: null,
    created_at: agora, origin: 'busca', reopened_by_signal_at: null, reopened_discard_reason: null, signal_reasons: [],
    reasons: [
      { texto: 'Setor: combina com "Logistica".', atende: true, criterio: 'setor' },
      { texto: 'Região: sede em SP.', atende: true, criterio: 'regiao' },
      { texto: 'Porte: 8 funcionários, dentro do ICP.', atende: true, criterio: 'porte' },
    ],
  })
  await page.route(`${e.supabaseUrl}/rest/v1/rpc/list_discovered_accounts`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
      candidata(1, 'Smoke Logística Um'), candidata(2, 'Smoke Logística Dois'),
    ]) })
  })

  await page.goto('/contas/descobertas')
  await conferirWorkspaceOperacional(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Contas' })).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'Smoke Logística Um' })).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'Smoke Logística Dois' })).toBeVisible()
  await expect(page.getByText('Região: sede em SP.').first()).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: 'Esta tela não abriu' })).toHaveCount(0)
  await conferir()
})

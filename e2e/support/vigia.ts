// Vigia de cada teste de tela: junta erros de JavaScript da página e respostas 5xx do Supabase e reprova o teste no fim.
import { expect, type Page, type Response, type TestInfo } from '@playwright/test'

export function vigiar(page: Page, testInfo: TestInfo) {
  const erros: string[] = []
  page.on('pageerror', (erro) => erros.push(`Erro na página: ${erro.message}`))
  page.on('response', (r) => {
    if (r.status() >= 500 && /\/(rest|functions|auth)\/v1\//.test(r.url())) erros.push(`HTTP ${r.status()} em ${semQuery(r.url())}`)
  })
  return async function conferir() {
    if (erros.length) await testInfo.attach('erros-da-vigia.txt', { body: erros.join('\n'), contentType: 'text/plain' })
    expect(erros, 'erros de página ou respostas 5xx').toEqual([])
  }
}

/** Espera a resposta de uma RPC pelo nome. */
export function esperarRpc(page: Page, nome: string, timeout = 30_000): Promise<Response> {
  return page.waitForResponse((r) => new URL(r.url()).pathname.endsWith(`/rest/v1/rpc/${nome}`), { timeout })
}

/** Confere que a tela é o Workspace operacional, e não a Demonstração. */
export async function conferirWorkspaceOperacional(page: Page) {
  await expect(page.getByText('Workspace operacional', { exact: true }).first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Você está vendo uma demonstração')).toHaveCount(0)
}

function semQuery(url: string) {
  const u = new URL(url)
  return `${u.origin}${u.pathname}`
}

// Esconder os quatro Agentes (Sinais first 10). A / mostra só o composer, sem a grade dos 4 Agentes nem o "Novo agente";
// a barra lateral não tem "Especialistas"; o @ do composer não sugere Agente; as rotas antigas de cada Agente abrem as
// sub-abas só para leitura. O dado dos Agentes do QA é lido antes e depois pelas mesmas RPCs de leitura da tela e tem
// que sair igual. O teste não escreve nada: nenhuma RPC de escrita de Agente ou de Conversa pode ser chamada.
import { expect, test, type APIRequestContext } from '@playwright/test'
import { ambiente } from '../support/ambiente.js'
import { tokenDoQa } from '../support/sessao.js'
import { conferirWorkspaceOperacional, vigiar } from '../support/vigia.js'

const SECOES = ['conversa', 'memoria', 'habilidades', 'rotinas', 'atividade'] as const

const ESCRITAS = /\/rest\/v1\/rpc\/(create_agent|delete_agent|edit_agent_memory_fact|delete_agent_memory_fact|set_agent_skill_active|create_agent_routine|update_agent_routine|set_agent_routine_paused|delete_agent_routine|retry_agent_run|save_agent_personalization|rename_agent_conversation|start_agent_conversation|append_agent_message)\b|\/functions\/v1\/agent-conversation\b/

async function rpc<T>(request: APIRequestContext, nome: string, dados: Record<string, unknown>): Promise<T> {
  const e = ambiente()
  const resposta = await request.post(`${e.supabaseUrl}/rest/v1/rpc/${nome}`, {
    headers: { apikey: e.publishableKey, Authorization: `Bearer ${tokenDoQa()}` },
    data: dados,
  })
  expect(resposta.status(), `${nome} deveria responder 200`).toBe(200)
  return (await resposta.json()) as T
}

/** Tudo o que a tela lê de cada Agente do QA, pelas RPCs de leitura. */
async function lerAgentes(request: APIRequestContext) {
  const agentes = await rpc<{ id: string }[]>(request, 'list_agents', { p_workspace_id: ambiente().workspaceId })
  const porAgente: Record<string, unknown> = {}
  for (const { id } of agentes) {
    porAgente[id] = {
      memoria: await rpc(request, 'list_agent_memory', { p_agent_id: id }),
      habilidades: await rpc(request, 'list_agent_skills', { p_agent_id: id }),
      rotinas: await rpc(request, 'list_agent_routines', { p_agent_id: id }),
    }
  }
  return { agentes, porAgente }
}

test('/ sem a grade dos 4 Agentes, sem "Novo agente" e sem "Especialistas"; o composer fica e o @ não sugere Agente', async ({ page }, testInfo) => {
  const conferir = vigiar(page, testInfo)
  await page.goto('/')
  await conferirWorkspaceOperacional(page)
  const formulario = page.getByRole('form', { name: 'Pedido aos agentes' })
  await expect(formulario).toBeVisible()
  await expect(page.getByRole('list', { name: 'Agentes do Workspace' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Novo agente' })).toHaveCount(0)
  const navegacao = page.getByRole('complementary', { name: 'Navegação' })
  await expect(navegacao.getByText('Workspace', { exact: true })).toBeVisible()
  await expect(navegacao.getByText('Especialistas', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Especialistas', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('list', { name: 'Especialidades disponíveis' })).toHaveCount(0)

  const campo = formulario.getByRole('textbox')
  for (const texto of ['@', '@S', '@E', '@R', '@O']) {
    await campo.fill(texto)
    await expect(page.getByRole('listbox'), `"${texto}" não pode sugerir Agente`).toHaveCount(0)
  }
  await campo.fill('')
  await conferir()
})

test('rotas antigas de cada Agente abrem só leitura e o dado dos Agentes não muda', async ({ page, request }, testInfo) => {
  test.setTimeout(120_000)
  const conferir = vigiar(page, testInfo)
  const escritas: string[] = []
  page.on('request', (req) => {
    if (ESCRITAS.test(req.url()) || (req.method() !== 'GET' && /\/rest\/v1\/(?!rpc\/)/.test(req.url()))) escritas.push(`${req.method()} ${new URL(req.url()).pathname}`)
  })

  const antes = await lerAgentes(request)
  testInfo.annotations.push({ type: 'info', description: `Agentes do QA: ${antes.agentes.length}` })
  expect(antes.agentes.length, 'o Workspace QA deveria ter Agentes antigos para conferir a leitura').toBeGreaterThan(0)

  for (const { id } of antes.agentes) {
    for (const secao of SECOES) {
      await page.goto(`/agentes/${id}/${secao}`)
      await conferirWorkspaceOperacional(page)
      await expect(page).toHaveURL(new RegExp(`/agentes/${id}/${secao}$`))
      await expect(page.getByText(/só para leitura/).first()).toBeVisible()
      await expect(page.getByRole('navigation', { name: 'Seções do agente' }).getByRole('link')).toHaveText(['Conversa', 'Memória', 'Habilidades', 'Rotinas', 'Atividade'])
      await expect(page.getByRole('textbox'), `${secao}: sem caixa de pedido`).toHaveCount(0)
      for (const acao of [/^Enviar$/, /^Nova conversa$/, /^Nova rotina$/, /^Editar$/, /^Apagar$/, /^Excluir/, /^Pausar$/, /^Retomar$/, /^Tentar de novo$/, /^Renomear/]) {
        await expect(page.getByRole('button', { name: acao }), `${secao}: sem a ação ${acao}`).toHaveCount(0)
      }
      for (const chave of await page.getByRole('switch').all()) await expect(chave).toBeDisabled()
    }
    for (const antiga of ['configuracao', 'canais']) {
      await page.goto(`/agentes/${id}/${antiga}`)
      await expect(page).toHaveURL(new RegExp(`/agentes/${id}/conversa$`))
    }
  }

  const depois = await lerAgentes(request)
  expect(depois, 'os Agentes e o que eles guardam têm que continuar iguais').toEqual(antes)
  expect(escritas, 'abrir as rotas antigas não pode escrever nada').toEqual([])
  await conferir()
})

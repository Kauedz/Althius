// A tela do conector (ADR-0022): em "Ver ferramentas", cada ferramenta que o servidor oferece tem três opções, como nos
// conectores do Claude: sempre permitir, pedir aprovação ou bloquear. Só o Administrador muda; os demais veem. Sem
// decisão, vale o padrão: leitura sempre, escrita ou gasto pede Aprovação. Na Demonstração, a simulada mostra exemplos.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { RaizDoAplicativo } from '@/raiz'
import { criarBancoDeConexoes, rpcsDeConexoes } from '@/test/conexoes-no-banco'
import { renderizarApp } from '@/test/renderizar'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
const NORTE = { id: 'ws-norte', kind: 'empresa', name: 'Norte' }

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
})

function abrir(papel: 'admin' | 'member') {
  localStorage.setItem('althius:modo_demo', 'false')
  sessionStorage.setItem('althius:workspace', NORTE.id)
  window.history.replaceState(null, '', '/conexoes')
  const banco = criarBancoDeConexoes()
  banco.habilitadas.push({ workspaceId: NORTE.id, integrationId: 'hubspot', enabledBy: MARINA.id, enabledAt: '2026-10-01T12:00:00Z' })
  const regras: Record<string, string> = { create_company: 'bloqueada' }
  const definicoes: Record<string, unknown>[] = []
  const supabase = criarSupabaseFalso({
    sessao: sessaoDe(MARINA),
    tabelas: {
      workspaces: [NORTE],
      workspace_memberships: [{ workspace_id: NORTE.id, role: papel, user_id: MARINA.id, active: true }],
    },
    rpcs: {
      bootstrap_personal_workspace: () => NORTE,
      ...rpcsDeConexoes(banco),
      integration_access_status: () => [{
        integration_id: 'hubspot', state: 'conectado', kind: 'oauth_mcp', account_label: 'marina@cliente.com.br', app_portal: null,
        failure: null, connected_at: null, connected_count: 1, kinds: ['oauth_mcp', 'api_key'],
      }],
      list_integration_tool_rules: (p) =>
        p.p_integration_id === 'hubspot'
          ? Object.entries(regras).map(([tool_name, rule]) => ({ tool_name, rule, updated_by: MARINA.id, updated_at: null }))
          : [],
      set_integration_tool_rule: (p) => {
        definicoes.push(p)
        regras[p.p_tool_name as string] = p.p_rule as string
        return p.p_rule
      },
    },
    funcoes: {
      'integration-tools': () => ({
        corpo: {
          ferramentas: [
            { nome: 'search_companies', descricao: 'Busca empresas no CRM.', escreve: false },
            { nome: 'create_company', descricao: 'Cria uma empresa.', escreve: true },
            { nome: 'create_note', descricao: 'Cria uma nota.', escreve: true },
          ],
        },
      }),
    },
  })
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={criarServicosDoNavegadorFalsos().servicos} />)
  return { usuario: userEvent.setup(), definicoes }
}

async function abrirFerramentas(usuario: ReturnType<typeof userEvent.setup>, nome: string) {
  const cartao = await screen.findByRole('article', { name: nome })
  await usuario.click(await within(cartao).findByRole('button', { name: 'Ver ferramentas' }))
  return await screen.findByRole('dialog', { name: `Ferramentas do ${nome}` })
}

describe('As ferramentas de um conector, cada uma com a sua permissão', () => {
  it('o Administrador vê o padrão e a regra salva, e muda a de uma ferramenta', async () => {
    const { usuario, definicoes } = abrir('admin')
    const dialogo = await abrirFerramentas(usuario, 'HubSpot')

    const busca = await within(dialogo).findByRole('radiogroup', { name: 'Permissão de search_companies' })
    expect(within(busca).getByRole('radio', { name: 'Sempre permitir' })).toBeChecked()
    const empresa = within(dialogo).getByRole('radiogroup', { name: 'Permissão de create_company' })
    await waitFor(() => expect(within(empresa).getByRole('radio', { name: 'Bloquear' })).toBeChecked())
    const nota = within(dialogo).getByRole('radiogroup', { name: 'Permissão de create_note' })
    expect(within(nota).getByRole('radio', { name: 'Pedir aprovação' })).toBeChecked()

    await usuario.click(within(nota).getByRole('radio', { name: 'Sempre permitir' }))
    await waitFor(() => expect(within(nota).getByRole('radio', { name: 'Sempre permitir' })).toBeChecked())
    expect(definicoes).toEqual([
      { p_workspace_id: NORTE.id, p_integration_id: 'hubspot', p_tool_name: 'create_note', p_rule: 'sempre' },
    ])
  })

  it('quem não é Administrador vê a permissão de cada ferramenta, mas não muda', async () => {
    const { usuario, definicoes } = abrir('member')
    const dialogo = await abrirFerramentas(usuario, 'HubSpot')
    const nota = await within(dialogo).findByRole('radiogroup', { name: 'Permissão de create_note' })
    for (const opcao of within(nota).getAllByRole('radio')) expect(opcao).toBeDisabled()
    expect(within(dialogo).getByText('Só um Administrador muda a permissão de cada ferramenta.')).toBeInTheDocument()
    await usuario.click(within(nota).getByRole('radio', { name: 'Bloquear' }))
    expect(definicoes).toEqual([])
  })

  it('na Demonstração, uma Integração conectada mostra ferramentas de exemplo com as três opções', async () => {
    const { usuario } = renderizarApp('/conexoes')
    const dialogo = await abrirFerramentas(usuario, 'Notion')
    const grupos = await within(dialogo).findAllByRole('radiogroup')
    expect(grupos.length).toBeGreaterThan(1)
    expect(within(dialogo).getByText(/exemplos da Demonstração/)).toBeInTheDocument()
    const primeira = grupos[0]
    await usuario.click(within(primeira).getByRole('radio', { name: 'Bloquear' }))
    await waitFor(() => expect(within(primeira).getByRole('radio', { name: 'Bloquear' })).toBeChecked())
  })
})

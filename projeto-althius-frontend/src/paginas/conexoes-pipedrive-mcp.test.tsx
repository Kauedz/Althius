import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { idaAoApp } from '@/paginas/ida-ao-app'
import { RaizDoAplicativo } from '@/raiz'
import { criarBancoDeConexoes, rpcsDeConexoes } from '@/test/conexoes-no-banco'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'

// O cartão do Pipedrive em Conexões com o conector oficial (migration 20261002111000): o banco lista os dois caminhos,
// e a tela mostra "Conectar no Pipedrive" com "Usar chave de API" como alternativa.

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
const NORTE = { id: 'ws-norte', kind: 'empresa', name: 'Norte' }

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
})

function abrir() {
  localStorage.setItem('althius:modo_demo', 'false')
  sessionStorage.setItem('althius:workspace', NORTE.id)
  window.history.replaceState(null, '', '/conexoes')
  const banco = criarBancoDeConexoes()
  const rpcs = rpcsDeConexoes(banco)
  const pedidos: Record<string, unknown>[] = []

  const supabase = criarSupabaseFalso({
    sessao: sessaoDe(MARINA),
    tabelas: {
      workspaces: [NORTE],
      workspace_memberships: [{ workspace_id: NORTE.id, role: 'member', user_id: MARINA.id, active: true }],
    },
    rpcs: {
      bootstrap_personal_workspace: () => NORTE,
      ...rpcs,
      list_workspace_integrations: (parametros) => [
        ...rpcs.list_workspace_integrations(parametros),
        {
          id: 'pipedrive',
          name: 'Pipedrive',
          category: 'CRM',
          description: 'Pessoas, organizações e negócios do Pipedrive.',
          writes: true,
          status: 'habilitada',
          enabled_at: '2026-10-02T12:00:00Z',
          enabled_by: 'usuario-ana',
          app_portal: null,
        },
      ],
      integration_access_status: () => [
        {
          integration_id: 'pipedrive',
          state: 'desconectado',
          kind: null,
          account_label: null,
          app_portal: null,
          failure: null,
          connected_at: null,
          connected_count: 0,
          kinds: ['oauth_mcp', 'api_key'],
        },
      ],
    },
    funcoes: {
      'integration-connect': (corpo) => {
        pedidos.push(corpo)
        return { corpo: { url: 'https://oauth.pipedrive.com/oauth/authorize?state=x' } }
      },
    },
  })

  const { servicos } = criarServicosDoNavegadorFalsos()
  const usuario = userEvent.setup()
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={servicos} />)
  return { usuario, pedidos }
}

describe('O Pipedrive pelo conector oficial', () => {
  it('mostra "Conectar no Pipedrive" e mantém "Usar chave de API" como alternativa', async () => {
    const indo = vi.spyOn(idaAoApp, 'ir').mockImplementation(() => {})
    const { usuario, pedidos } = abrir()

    const cartao = await screen.findByRole('article', { name: 'Pipedrive' })
    const conectar = await within(cartao).findByRole('button', { name: 'Conectar no Pipedrive' })
    expect(within(cartao).getByRole('button', { name: 'Usar chave de API' })).toBeInTheDocument()

    await usuario.click(conectar)
    expect(pedidos).toEqual([{ action: 'iniciar', workspaceId: NORTE.id, integrationId: 'pipedrive' }])
    expect(indo).toHaveBeenCalledWith('https://oauth.pipedrive.com/oauth/authorize?state=x')
  })
})

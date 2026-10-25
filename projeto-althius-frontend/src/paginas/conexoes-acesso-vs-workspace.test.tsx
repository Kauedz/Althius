import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RaizDoAplicativo } from '@/raiz'
import { criarBancoDeConexoes, rpcsDeConexoes } from '@/test/conexoes-no-banco'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'

// Evidência (AUDITORIA-TOTAL-2026-10-17, vertical F): "Você ainda não conectou" (o Acesso da pessoa) e logo abaixo
// "1 participante conectou" (contagem do Workspace) lidos juntos pareciam contraditórios. O card separa as duas leituras
// com rótulos: "Seu acesso" é sempre sobre a própria pessoa; "No Workspace" é sempre a contagem dos colegas.

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
const NORTE = { id: 'ws-norte', kind: 'empresa', name: 'Norte' }

interface LinhaDeAcesso {
  integration_id: string
  state: string
  kind: string | null
  account_label: string | null
  app_portal: string | null
  failure: string | null
  connected_at: string | null
  connected_count: number
  kinds: string[]
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
})

function abrir({ acesso }: { acesso: LinhaDeAcesso }) {
  localStorage.setItem('althius:modo_demo', 'false')
  sessionStorage.setItem('althius:workspace', NORTE.id)
  window.history.replaceState(null, '', '/conexoes')
  const banco = criarBancoDeConexoes()
  banco.habilitadas.push({ workspaceId: NORTE.id, integrationId: 'hubspot', enabledBy: MARINA.id, enabledAt: '2026-10-01T12:00:00Z' })

  const supabase = criarSupabaseFalso({
    sessao: sessaoDe(MARINA),
    tabelas: {
      workspaces: [NORTE],
      workspace_memberships: [{ workspace_id: NORTE.id, role: 'member', user_id: MARINA.id, active: true }],
    },
    rpcs: {
      bootstrap_personal_workspace: () => NORTE,
      ...rpcsDeConexoes(banco),
      integration_access_status: () => [acesso],
    },
  })

  const { servicos } = criarServicosDoNavegadorFalsos()
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={servicos} />)
}

const BASE: LinhaDeAcesso = {
  integration_id: 'hubspot',
  state: 'desconectado',
  kind: null,
  account_label: null,
  app_portal: null,
  failure: null,
  connected_at: null,
  connected_count: 0,
  kinds: ['oauth_mcp', 'api_key'],
}

describe('O bloco de Acesso separa "Seu acesso" de "No Workspace"', () => {
  it('não conectado, sem ninguém mais no Workspace: singular e plural em zero', async () => {
    abrir({ acesso: { ...BASE, connected_count: 0 } })

    const cartao = await screen.findByRole('article', { name: 'HubSpot' })
    expect(await within(cartao).findByText('Seu acesso: não conectado')).toBeInTheDocument()
    expect(within(cartao).getByText('No Workspace: 0 participantes conectados')).toBeInTheDocument()
  })

  it('conectado, com a própria conta e 1 participante no Workspace: singular', async () => {
    abrir({ acesso: { ...BASE, state: 'conectado', kind: 'oauth_mcp', account_label: MARINA.email, connected_count: 1 } })

    const cartao = await screen.findByRole('article', { name: 'HubSpot' })
    expect(await within(cartao).findByText(`Seu acesso: Conectado como ${MARINA.email}`)).toBeInTheDocument()
    expect(within(cartao).getByText('No Workspace: 1 participante conectado')).toBeInTheDocument()
  })

  it('precisa reconectar, com vários participantes no Workspace: plural', async () => {
    abrir({ acesso: { ...BASE, state: 'precisa_reconectar', kind: 'oauth_mcp', account_label: MARINA.email, connected_count: 3 } })

    const cartao = await screen.findByRole('article', { name: 'HubSpot' })
    expect(await within(cartao).findByText('Seu acesso: Precisa reconectar')).toBeInTheDocument()
    expect(within(cartao).getByText('No Workspace: 3 participantes conectados')).toBeInTheDocument()
  })
})

import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { RaizDoAplicativo } from '@/raiz'
import { renderizarApp } from '@/test/renderizar'
import { criarBancoDeConexoes, rpcsDeConexoes } from '@/test/conexoes-no-banco'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
const CARLOS = { id: 'usuario-carlos', email: 'carlos@cliente.com.br' }
const NORTE = { id: 'ws-norte', kind: 'empresa', name: 'Norte' }

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
})

function abrirConexoes({
  usuarioAtual = MARINA,
  papel = 'admin' as 'admin' | 'member',
  banco = criarBancoDeConexoes(),
  modoDemo = false,
} = {}) {
  localStorage.setItem('althius:modo_demo', String(modoDemo))
  if (modoDemo) {
    localStorage.setItem(
      'althius.onboarding.v3',
      JSON.stringify({ ramo: 'convidado', etapa: 'checklist', day0Concluido: true, concluido: true }),
    )
  }
  sessionStorage.setItem('althius:workspace', NORTE.id)
  window.history.replaceState(null, '', '/conexoes')

  const supabase = criarSupabaseFalso({
    sessao: sessaoDe(usuarioAtual),
    tabelas: {
      workspaces: [NORTE],
      workspace_memberships: [
        { workspace_id: NORTE.id, role: papel, user_id: usuarioAtual.id, active: true },
      ],
    },
    rpcs: {
      bootstrap_personal_workspace: () => NORTE,
      ...rpcsDeConexoes(banco),
    },
  })

  const { servicos } = criarServicosDoNavegadorFalsos()
  const usuario = userEvent.setup()
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={servicos} />)
  return { ...supabase, servicos, usuario, banco }
}

describe('Conexões reais no Workspace operacional', () => {
  it('mostra canais como "Em breve" e catálogo real de integrações', async () => {
    abrirConexoes()

    // Espera os dados carregarem
    expect(await screen.findByText('Slack')).toBeInTheDocument()
    const secaoCanais = screen.getByRole('region', { name: 'Canais' })
    expect(within(secaoCanais).getByText('Slack')).toBeInTheDocument()
    expect(within(secaoCanais).getByText('WhatsApp')).toBeInTheDocument()
    expect(within(secaoCanais).getByText('Microsoft Teams')).toBeInTheDocument()
    expect(within(secaoCanais).getByText('E-mail')).toBeInTheDocument()
    expect(within(secaoCanais).getAllByText('Em breve')).toHaveLength(4)

    // Nenhuma ação interativa de conectar canal na casca operacional
    expect(within(secaoCanais).queryByRole('button', { name: /Conectar|Ver prévia/ })).not.toBeInTheDocument()

    // Catálogo de integrações real
    const secaoIntegracoes = screen.getByRole('region', { name: 'Integrações' })
    expect(within(secaoIntegracoes).getByText('HubSpot')).toBeInTheDocument()
    expect(within(secaoIntegracoes).getByText('Notion')).toBeInTheDocument()
    expect(within(secaoIntegracoes).getByText('Clay')).toBeInTheDocument()
    expect(within(secaoIntegracoes).getByText('Apollo')).toBeInTheDocument()
    expect(within(secaoIntegracoes).getByText('Lusha')).toBeInTheDocument()
    expect(within(secaoIntegracoes).getByText('Meta Ads')).toBeInTheDocument()
    expect(within(secaoIntegracoes).getByText('Google Ads')).toBeInTheDocument()

    // HubSpot e Notion começam como "Não habilitada"; as demais como "Em breve"
    const cartaoHubspot = screen.getByRole('article', { name: 'HubSpot' })
    expect(within(cartaoHubspot).getByText('Não habilitada')).toBeInTheDocument()

    const cartaoNotion = screen.getByRole('article', { name: 'Notion' })
    expect(within(cartaoNotion).getByText('Não habilitada')).toBeInTheDocument()

    const cartaoClay = screen.getByRole('article', { name: 'Clay' })
    expect(within(cartaoClay).getByText('Em breve')).toBeInTheDocument()
  })

  it('administrador pode habilitar HubSpot e Notion no Workspace', async () => {
    const { usuario, banco } = abrirConexoes({ papel: 'admin' })

    const cartaoHubspot = await screen.findByRole('article', { name: 'HubSpot' })
    const botaoHabilitar = within(cartaoHubspot).getByRole('button', { name: 'Habilitar' })
    await usuario.click(botaoHabilitar)

    // O status muda para Habilitada
    expect(await within(cartaoHubspot).findByText('Habilitada')).toBeInTheDocument()
    expect(within(cartaoHubspot).getByText('Habilitada no Workspace')).toBeInTheDocument()
    expect(within(cartaoHubspot).queryByRole('button', { name: 'Habilitar' })).not.toBeInTheDocument()

    // No banco, a habilitação foi registrada para o workspace
    expect(banco.habilitadas).toHaveLength(1)
    expect(banco.habilitadas[0].integrationId).toBe('hubspot')
    expect(banco.habilitadas[0].workspaceId).toBe(NORTE.id)
  })

  it('membro não pode habilitar e vê mensagem explicativa', async () => {
    abrirConexoes({ usuarioAtual: CARLOS, papel: 'member' })

    const cartaoHubspot = await screen.findByRole('article', { name: 'HubSpot' })
    expect(within(cartaoHubspot).getByText('Não habilitada')).toBeInTheDocument()
    expect(within(cartaoHubspot).getByText('Só um Administrador habilita.')).toBeInTheDocument()
    expect(within(cartaoHubspot).queryByRole('button', { name: 'Habilitar' })).not.toBeInTheDocument()
  })

  it('na Demonstração o fluxo simulado original permanece intacto', async () => {
    renderizarApp('/conexoes')

    const secaoCanais = await screen.findByRole('region', { name: 'Canais' })
    const botaoConectar = await within(secaoCanais).findByRole('button', { name: 'Conectar' })
    expect(botaoConectar).toBeInTheDocument()
  })
})

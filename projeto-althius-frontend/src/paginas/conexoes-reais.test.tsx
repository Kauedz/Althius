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
  falharAoDesabilitar = false,
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

  const chamadasRpc: { nome: string; parametros: Record<string, unknown> }[] = []
  const rpcs = rpcsDeConexoes(banco)
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
      ...rpcs,
      disable_workspace_integration: (parametros) => {
        chamadasRpc.push({ nome: 'disable_workspace_integration', parametros })
        if (falharAoDesabilitar) throw new Error('database unavailable')
        return rpcs.disable_workspace_integration(parametros)
      },
    },
  })

  const { servicos } = criarServicosDoNavegadorFalsos()
  const usuario = userEvent.setup()
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={servicos} />)
  return { ...supabase, servicos, usuario, banco, chamadasRpc }
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
    expect(within(secaoIntegracoes).getByRole('article', { name: 'HubSpot' })).toBeInTheDocument()
    expect(within(secaoIntegracoes).getByRole('article', { name: 'Notion' })).toBeInTheDocument()
    expect(within(secaoIntegracoes).queryByRole('article', { name: 'Clay' })).not.toBeInTheDocument()
    expect(within(secaoIntegracoes).queryByRole('article', { name: 'Apollo' })).not.toBeInTheDocument()
    expect(within(secaoIntegracoes).queryByRole('article', { name: 'Lusha' })).not.toBeInTheDocument()
    expect(within(secaoIntegracoes).queryByRole('article', { name: 'Meta Ads' })).not.toBeInTheDocument()
    expect(within(secaoIntegracoes).queryByRole('article', { name: 'Google Ads' })).not.toBeInTheDocument()

    // HubSpot e Notion começam como "Não habilitada"; as demais ficam fora de Conexões.
    const cartaoHubspot = screen.getByRole('article', { name: 'HubSpot' })
    expect(within(cartaoHubspot).getByText('Não habilitada')).toBeInTheDocument()

    const cartaoNotion = screen.getByRole('article', { name: 'Notion' })
    expect(within(cartaoNotion).getByText('Não habilitada')).toBeInTheDocument()

    expect(within(secaoIntegracoes).getAllByRole('article')).toHaveLength(2)
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

for (const demonstracao of [false, true]) {
  it('mostra os logos de HubSpot e Notion nos cartões ' + (demonstracao ? 'da Demonstração' : 'operacionais'), async () => {
    if (demonstracao) renderizarApp('/conexoes')
    else abrirConexoes()
    for (const nome of ['HubSpot', 'Notion']) {
      const cartao = await screen.findByRole('article', { name: nome })
      expect(within(cartao).getByRole('img', { name: nome })).toBeInTheDocument()
    }
  })
}

it('na Demonstração mostra só HubSpot e Notion em Conexões', async () => {
  renderizarApp('/conexoes')
  await screen.findByRole('article', { name: 'Notion' })
  const secao = screen.getByRole('region', { name: 'Integrações' })
  expect(within(secao).getAllByRole('article').map((cartao) => cartao.getAttribute('aria-label'))).toEqual(['HubSpot', 'Notion'])
})

it('Administrador confirma antes de desabilitar e pode cancelar', async () => {
  const banco = criarBancoDeConexoes()
  banco.habilitadas.push({ workspaceId: NORTE.id, integrationId: 'hubspot', enabledBy: MARINA.id, enabledAt: '2026-10-09T12:00:00Z' })
  const { usuario, chamadasRpc } = abrirConexoes({ banco })
  const cartao = await screen.findByRole('article', { name: 'HubSpot' })
  await usuario.click(within(cartao).getByRole('button', { name: 'Desabilitar' }))
  const dialogo = await screen.findByRole('dialog', { name: 'Desabilitar HubSpot' })
  expect(within(dialogo).getByText(/desconecta todos os participantes/)).toBeInTheDocument()
  expect(chamadasRpc.some((c) => c.nome === 'disable_workspace_integration')).toBe(false)
  await usuario.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
  expect(banco.habilitadas).toHaveLength(1)
  await usuario.click(within(cartao).getByRole('button', { name: 'Desabilitar' }))
  const confirmacao = await screen.findByRole('dialog', { name: 'Desabilitar HubSpot' })
  await usuario.click(within(confirmacao).getByRole('button', { name: 'Desabilitar' }))
  expect(await within(cartao).findByText('Não habilitada')).toBeInTheDocument()
  expect(chamadasRpc.filter((c) => c.nome === 'disable_workspace_integration')).toEqual([
    { nome: 'disable_workspace_integration', parametros: { p_workspace_id: NORTE.id, p_integration_id: 'hubspot' } },
  ])
  expect(banco.habilitadas).toHaveLength(0)
})

it('Membro não vê Desabilitar numa Integração habilitada', async () => {
  const banco = criarBancoDeConexoes()
  banco.habilitadas.push({ workspaceId: NORTE.id, integrationId: 'hubspot', enabledBy: MARINA.id, enabledAt: '2026-10-09T12:00:00Z' })
  abrirConexoes({ banco, usuarioAtual: CARLOS, papel: 'member' })
  const cartao = await screen.findByRole('article', { name: 'HubSpot' })
  expect(within(cartao).getByText('Habilitada')).toBeInTheDocument()
  expect(within(cartao).queryByRole('button', { name: 'Desabilitar' })).not.toBeInTheDocument()
})

it('recusa do servidor mantém a Integração habilitada e explica a falha em português', async () => {
  const banco = criarBancoDeConexoes()
  banco.habilitadas.push({ workspaceId: NORTE.id, integrationId: 'hubspot', enabledBy: MARINA.id, enabledAt: '2026-10-09T12:00:00Z' })
  const { usuario } = abrirConexoes({ banco, falharAoDesabilitar: true })
  const cartao = await screen.findByRole('article', { name: 'HubSpot' })
  await usuario.click(within(cartao).getByRole('button', { name: 'Desabilitar' }))
  const dialogo = await screen.findByRole('dialog', { name: 'Desabilitar HubSpot' })
  await usuario.click(within(dialogo).getByRole('button', { name: 'Desabilitar' }))
  expect(await within(dialogo).findByRole('alert')).toHaveTextContent('Não foi possível desabilitar a Integração agora. Tente novamente.')
  expect(banco.habilitadas).toHaveLength(1)
})

it('desabilitar na Demonstração muda só o estado simulado', async () => {
  const { usuario } = renderizarApp('/conexoes')
  const cartao = await screen.findByRole('article', { name: 'HubSpot' })
  await usuario.click(within(cartao).getByRole('button', { name: 'Desabilitar' }))
  const dialogo = await screen.findByRole('dialog', { name: 'Desabilitar HubSpot' })
  await usuario.click(within(dialogo).getByRole('button', { name: 'Desabilitar' }))
  expect(await within(cartao).findByText('Não conectado')).toBeInTheDocument()
})

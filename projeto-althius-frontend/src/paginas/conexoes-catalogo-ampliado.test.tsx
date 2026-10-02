import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { RaizDoAplicativo } from '@/raiz'
import { criarBancoDeConexoes, rpcsDeConexoes } from '@/test/conexoes-no-banco'
import { renderizarApp } from '@/test/renderizar'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'

// O catálogo ampliado de conectores em Conexões (migration 20261002111000): os apps novos aparecem nas categorias que o
// banco informa, inclusive as novas Agenda e Comunicação, e o Zoho CRM fica "Em breve".

const ANA = { id: 'usuario-ana', email: 'ana@cliente.com.br' }
const NORTE = { id: 'ws-norte', kind: 'empresa', name: 'Norte' }

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
})

const linha = (id: string, name: string, category: string, description: string, status: string) => ({
  id,
  name,
  category,
  description,
  writes: true,
  status,
  enabled_at: null,
  enabled_by: null,
  app_portal: null,
})

function abrir() {
  localStorage.setItem('althius:modo_demo', 'false')
  sessionStorage.setItem('althius:workspace', NORTE.id)
  window.history.replaceState(null, '', '/conexoes')
  const rpcs = rpcsDeConexoes(criarBancoDeConexoes())
  const habilitadas: string[] = []
  const novos = () => [
    linha('slack', 'Slack', 'Comunicação', 'Canais, mensagens e canvases do Slack.', habilitadas.includes('slack') ? 'habilitada' : 'nao_habilitada'),
    linha('calendly', 'Calendly', 'Agenda', 'Tipos de evento e agendamentos do Calendly.', 'nao_habilitada'),
    linha('zoho-crm', 'Zoho CRM', 'CRM', 'Contas, contatos e negócios do Zoho CRM.', 'em_breve'),
  ]
  const supabase = criarSupabaseFalso({
    sessao: sessaoDe(ANA),
    tabelas: {
      workspaces: [NORTE],
      workspace_memberships: [{ workspace_id: NORTE.id, role: 'admin', user_id: ANA.id, active: true }],
    },
    rpcs: {
      bootstrap_personal_workspace: () => NORTE,
      ...rpcs,
      list_workspace_integrations: (parametros) => [...rpcs.list_workspace_integrations(parametros), ...novos()],
      enable_workspace_integration: (parametros) => {
        const id = (parametros ?? {}).p_integration_id as string
        if (id === 'zoho-crm') throw new Error('integration is not available for enablement')
        habilitadas.push(id)
        return null
      },
    },
  })
  const { servicos } = criarServicosDoNavegadorFalsos()
  const usuario = userEvent.setup()
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={servicos} />)
  return { usuario, habilitadas }
}

describe('O catálogo ampliado de conectores', () => {
  it('mostra o Slack em Comunicação e o Calendly em Agenda, e o Administrador habilita o Slack', async () => {
    const { usuario, habilitadas } = abrir()
    const secao = await screen.findByRole('region', { name: 'Integrações' })
    const slack = await within(secao).findByRole('article', { name: 'Slack' })
    expect(within(slack).getByText('Canais, mensagens e canvases do Slack.')).toBeInTheDocument()
    expect(within(slack).getByText('Não habilitada')).toBeInTheDocument()

    const comunicacao = within(secao).getByRole('heading', { level: 3, name: 'Comunicação' }).parentElement!
    expect(within(comunicacao).getByRole('article', { name: 'Slack' })).toBeInTheDocument()
    const agenda = within(secao).getByRole('heading', { level: 3, name: 'Agenda' }).parentElement!
    expect(within(agenda).getByRole('article', { name: 'Calendly' })).toBeInTheDocument()

    await usuario.click(within(slack).getByRole('button', { name: 'Habilitar' }))
    expect(await within(slack).findByText('Habilitada')).toBeInTheDocument()
    expect(habilitadas).toEqual(['slack'])
  })

  it('o Zoho CRM aparece "Em breve" e não se habilita', async () => {
    abrir()
    const secao = await screen.findByRole('region', { name: 'Integrações' })
    const zoho = await within(secao).findByRole('article', { name: 'Zoho CRM' })
    expect(within(zoho).getByText('Em breve')).toBeInTheDocument()
    expect(within(zoho).queryByRole('button', { name: 'Habilitar' })).not.toBeInTheDocument()
  })

  it('na Demonstração, o Google Calendar e o Calendly aparecem em Agenda e o Zoho CRM em breve', async () => {
    renderizarApp('/conexoes')
    const secao = await screen.findByRole('region', { name: 'Integrações' })
    const agenda = (await within(secao).findByRole('heading', { level: 3, name: 'Agenda' })).parentElement!
    expect(within(agenda).getByRole('article', { name: 'Google Calendar' })).toBeInTheDocument()
    expect(within(agenda).getByRole('article', { name: 'Calendly' })).toBeInTheDocument()
    expect(within(within(secao).getByRole('article', { name: 'Zoho CRM' })).getByText('Em breve')).toBeInTheDocument()
    // Sem conector de Comunicação na Demonstração (o Slack dela é Canal), a categoria não aparece vazia.
    expect(within(secao).queryByRole('heading', { level: 3, name: 'Comunicação' })).not.toBeInTheDocument()
  })
})

import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { RaizDoAplicativo } from '@/raiz'
import { renderizarApp } from '@/test/renderizar'
import { criarBancoDeAgentes, rpcsDeAgentes } from '@/test/agentes-no-banco'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
const PESSOAL = { id: 'ws-pessoal-marina', kind: 'pessoal', name: 'Marina Souza', owner_user_id: MARINA.id }
const NORTE = { id: 'ws-norte', kind: 'empresa', name: 'Norte' }

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
})

interface Linha {
  id: string
  kind: string
  agent_id: string | null
  title: string | null
  first_request: string | null
  updated_at: string
  open_run_id: string | null
  origin?: 'althius' | 'slack'
}

const linha = (extra: Partial<Linha> & Pick<Linha, 'id'>): Linha => ({
  kind: 'coordenada',
  agent_id: null,
  title: null,
  first_request: `Pedido ${extra.id}`,
  updated_at: '2026-10-01T12:00:00Z',
  open_run_id: null,
  origin: 'althius',
  ...extra,
})

function abrir(salvas: Linha[], conversas: Record<string, unknown> = {}) {
  localStorage.setItem('althius:modo_demo', 'false')
  sessionStorage.setItem('althius:workspace', NORTE.id)
  window.history.replaceState(null, '', '/')
  const supabase = criarSupabaseFalso({
    sessao: sessaoDe(MARINA),
    tabelas: {
      workspaces: [PESSOAL, NORTE],
      workspace_memberships: [
        { workspace_id: PESSOAL.id, role: 'admin', user_id: MARINA.id, active: true },
        { workspace_id: NORTE.id, role: 'admin', user_id: MARINA.id, active: true },
      ],
    },
    rpcs: {
      bootstrap_personal_workspace: () => PESSOAL,
      list_owned_sender_accounts: () => [],
      ...rpcsDeAgentes(criarBancoDeAgentes()),
      list_agent_conversations_of_agent: (parametros) =>
        salvas
          .filter((c) => (
            parametros.p_agent_id == null
              ? c.kind === 'coordenada' || c.origin === 'slack'
              : c.agent_id === parametros.p_agent_id
          ))
          .map((c) => ({ ...c, named: c.title !== null })),
      get_agent_conversation: (parametros) => conversas[String(parametros.p_conversation_id)] ?? { runs: [] },
      get_agent_run_events: () => ({ status: 'succeeded', error_code: null, events: [] }),
    },
    funcoes: {
      'agent-conversation': (corpo) => {
        if (corpo.action === 'capability') return { status: 200, corpo: { available: true } }
        return { status: 202, corpo: { conversationId: corpo.conversationId ?? 'nova', runId: 'run-1', status: 'queued' } }
      },
    },
  })
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={criarServicosDoNavegadorFalsos().servicos} />)
  return userEvent.setup()
}

describe('Recentes na página de Agentes', () => {
  it('mostra no máximo as 4 mais recentes, e respondendo só quando a Conversa ainda roda', async () => {
    abrir([
      linha({ id: 'antiga', title: 'Conversa antiga', updated_at: '2026-01-01T12:00:00Z' }),
      linha({ id: 'd1', title: 'Dia 1', updated_at: '2026-10-01T12:00:00Z' }),
      linha({ id: 'd2', title: 'Dia 2', updated_at: '2026-10-02T12:00:00Z' }),
      linha({ id: 'd3', title: 'Dia 3', updated_at: '2026-10-03T12:00:00Z' }),
      linha({ id: 'd4', title: 'Dia 4', updated_at: '2026-10-04T12:00:00Z', open_run_id: 'run-aberta' }),
    ])

    const recentes = within(await screen.findByRole('region', { name: 'Recentes' }))
    const titulos = recentes.getAllByRole('listitem').map((item) => item.textContent)
    expect(recentes.getAllByRole('listitem')).toHaveLength(4)
    expect(titulos[0]).toContain('Dia 4')
    expect(titulos.map((texto) => texto?.includes('Conversa antiga'))).not.toContain(true)
    expect(within(recentes.getAllByRole('listitem')[0]).getByText('respondendo')).toBeInTheDocument()
    expect(within(recentes.getAllByRole('listitem')[1]).queryByText('respondendo')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Conversa coordenada em andamento' })).not.toBeInTheDocument()
  })

  it('Ver todas abre as Conversas coordenadas, e escolher uma vai para a Conversa', async () => {
    const usuario = abrir(
      [linha({ id: 'c2', title: 'Campanha do quarto trimestre' })],
      {
        c2: {
          runs: [{
            id: 'run-0',
            request_text: 'Campanha do quarto trimestre',
            status: 'succeeded',
            events: [{ seq: 1, kind: 'resposta', agent_id: null, payload: { texto: 'Aqui vai o plano da campanha.' } }],
          }],
        },
      },
    )

    const verTodas = await screen.findByRole('button', { name: 'Ver todas' })
    expect(verTodas).toHaveAttribute('aria-haspopup', 'dialog')
    await usuario.click(verTodas)
    const gaveta = await screen.findByRole('dialog', { name: 'Conversas coordenadas' })
    expect(within(gaveta).getByText('Campanha do quarto trimestre')).toBeInTheDocument()

    await usuario.click(within(gaveta).getByRole('button', { name: /^Campanha do quarto trimestre/ }))
    expect(await screen.findByText('Aqui vai o plano da campanha.')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/conversa')
  })

  it('a Conversa do Slack, pela gaveta, abre só para leitura no Agente', async () => {
    const usuario = abrir([
      linha({
        id: 'c-slack',
        kind: 'agente',
        agent_id: 'agente-scopus',
        origin: 'slack',
        title: null,
        first_request: 'Quem são as Contas Quentes?',
      }),
    ])

    await usuario.click(await screen.findByRole('button', { name: 'Ver todas' }))
    const gaveta = await screen.findByRole('dialog', { name: 'Conversas coordenadas' })
    await usuario.click(within(gaveta).getByRole('button', { name: /^Quem são as Contas Quentes/ }))

    expect(window.location.pathname).toBe('/agentes/agente-scopus/conversa')
    expect(window.location.search).toBe('?slack=c-slack')
  })

  it('na Demonstração não há Recentes nem Ver todas', async () => {
    renderizarApp('/')

    expect(await screen.findByRole('textbox', { name: 'Peça algo aos agentes' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Agentes do Workspace' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Recentes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ver todas' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

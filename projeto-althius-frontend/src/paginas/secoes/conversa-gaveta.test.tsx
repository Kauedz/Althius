import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
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
  kind: 'agente',
  agent_id: 'agente-scopus',
  title: null,
  first_request: 'Aderência da Alfa',
  updated_at: new Date().toISOString(),
  open_run_id: null,
  origin: 'althius',
  ...extra,
})

function abrir(rota: string, salvas: Linha[], conversas: Record<string, unknown> = {}) {
  localStorage.setItem('althius:modo_demo', 'false')
  sessionStorage.setItem('althius:workspace', NORTE.id)
  window.history.replaceState(null, '', rota)
  const renomeadas: { id: unknown; titulo: unknown }[] = []
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
      list_agent_conversations: () => salvas.map(({ id, kind, agent_id, origin }) => ({ id, kind, agent_id, origin })),
      list_agent_conversations_of_agent: (parametros) =>
        salvas
          .filter((c) => (parametros.p_agent_id == null ? c.kind === 'coordenada' : c.agent_id === parametros.p_agent_id))
          .map((c) => ({ ...c, named: c.title !== null })),
      get_agent_conversation: (parametros) => conversas[String(parametros.p_conversation_id)] ?? { runs: [] },
      rename_agent_conversation: (parametros) => {
        renomeadas.push({ id: parametros.p_conversation_id, titulo: parametros.p_title })
        const alvo = salvas.find((c) => c.id === parametros.p_conversation_id)
        if (alvo) alvo.title = String(parametros.p_title).trim() || null
        return null
      },
      get_agent_run_events: () => ({ status: 'succeeded', error_code: null, events: [] }),
      agent_prompt_suggestions: () => [{ id: 'scopus-aderencia-quente', texto: 'Pontue a aderência da Alfa ao nosso ICP' }],
    },
    funcoes: {
      'agent-conversation': (corpo) => {
        if (corpo.action === 'capability') return { status: 200, corpo: { available: true } }
        return { status: 202, corpo: { conversationId: 'nova', runId: 'run-1', status: 'queued' } }
      },
    },
  })
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={criarServicosDoNavegadorFalsos().servicos} />)
  return { usuario: userEvent.setup(), renomeadas }
}

describe('Conversa do Agente com a gaveta', () => {
  it('a coluna central não tem a lista ao lado, e Histórico abre a gaveta do Agente', async () => {
    const { usuario } = abrir('/agentes/agente-scopus/conversa', [linha({ id: 'a1' })])

    const secao = await screen.findByRole('region', { name: 'Conversa' })
    expect(secao.parentElement).toHaveClass('max-w-[720px]')
    expect(screen.queryByRole('button', { name: 'Recolher o histórico' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mostrar o histórico' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Conversas anteriores' })).not.toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Histórico' }))
    expect(await screen.findByRole('dialog', { name: 'Conversas do Scopus' })).toHaveAttribute('aria-modal', 'true')
  })

  it('escolher uma Conversa do Slack troca ?conversa= por ?slack=', async () => {
    const { usuario } = abrir('/agentes/agente-scopus/conversa?conversa=a1', [
      linha({ id: 'a1', first_request: 'Aderência da Alfa' }),
      linha({
        id: 'c-slack',
        origin: 'slack',
        first_request: 'Quem são as Contas Quentes?',
        updated_at: new Date(Date.now() - 60_000).toISOString(),
      }),
    ])

    await usuario.click(await screen.findByRole('button', { name: 'Histórico' }))
    const gaveta = await screen.findByRole('dialog', { name: 'Conversas do Scopus' })
    await usuario.click(within(gaveta).getByRole('button', { name: /^Quem são as Contas Quentes/ }))

    await waitFor(() => expect(window.location.search).toBe('?slack=c-slack'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  // Sinais first 10: a Conversa do Agente é só leitura. A gaveta e o atalho continuam para consultar; Nova conversa,
  // renomear, sugestões e o composer saíram.
  it('com a Conversa do Slack aberta, não há Nova conversa para trocar por uma vazia', async () => {
    abrir('/agentes/agente-scopus/conversa?slack=c-slack', [
      linha({ id: 'c-slack', origin: 'slack', first_request: 'Quem são as Contas Quentes?' }),
    ])

    await screen.findByRole('region', { name: 'Conversa do Slack' })
    expect(screen.queryByRole('button', { name: 'Nova conversa' })).not.toBeInTheDocument()
    expect(window.location.search).toBe('?slack=c-slack')
  })

  it('a faixa não oferece renomear a Conversa aberta', async () => {
    const { renomeadas } = abrir('/agentes/agente-scopus/conversa?conversa=a1', [linha({ id: 'a1' })])

    expect(await screen.findByRole('button', { name: 'Histórico' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Renomear conversa' })).not.toBeInTheDocument()
    expect(renomeadas).toEqual([])
  })

  it('a Conversa vazia não mostra sugestões nem composer', async () => {
    abrir('/agentes/agente-scopus/conversa', [])

    expect(await screen.findByText('Nenhuma Conversa aberta')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nova conversa' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pontue a aderência da Alfa ao nosso ICP' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Mensagem para Scopus' })).not.toBeInTheDocument()
  })

  it('Ctrl+Shift+H abre a gaveta', async () => {
    const { usuario } = abrir('/agentes/agente-scopus/conversa', [linha({ id: 'a1' })])
    await screen.findByRole('button', { name: 'Histórico' })

    await usuario.keyboard('{Control>}{Shift>}h{/Shift}{/Control}')
    expect(await screen.findByRole('dialog', { name: 'Conversas do Scopus' })).toBeInTheDocument()
  })

  it('na Demonstração não há Histórico, e a Conversa do Agente fica só leitura', async () => {
    renderizarApp('/agentes/scopus/conversa')

    expect(await screen.findByText('Nenhuma Conversa aberta')).toBeInTheDocument()
    expect(screen.getByText(/Este Agente foi retirado do produto/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Histórico' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nova conversa' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pontue a aderência da OpenAI ao nosso ICP' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})

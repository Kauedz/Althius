import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { RaizDoAplicativo } from '@/raiz'
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
}

const linha = (extra: Partial<Linha> & Pick<Linha, 'id'>): Linha => ({
  kind: 'coordenada',
  agent_id: null,
  title: null,
  first_request: 'Montem o ICP e as Personas',
  updated_at: '2026-09-30T12:00:00Z',
  open_run_id: null,
  ...extra,
})

const conversaSalva = (pedido: string, resposta: string) => ({
  runs: [{
    id: 'run-0',
    request_text: pedido,
    status: 'succeeded',
    events: [{ seq: 1, kind: 'resposta', agent_id: null, payload: { texto: resposta } }],
  }],
})

/** A Marina abre o Norte, que já tem Conversas salvas; o banco falso guarda os nomes que ela der. */
function abrir(rota: string, salvas: Linha[], conversas: Record<string, unknown> = {}) {
  localStorage.setItem('althius:modo_demo', 'false')
  sessionStorage.setItem('althius:workspace', NORTE.id)
  window.history.replaceState(null, '', rota)
  const renomeadas: { id: unknown; titulo: unknown }[] = []
  const enviados: Record<string, unknown>[] = []
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
      list_agent_conversations: () => salvas.map(({ id, kind, agent_id }) => ({ id, kind, agent_id })),
      list_named_agent_conversations: () => salvas,
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
    },
    funcoes: {
      'agent-conversation': (corpo) => {
        if (corpo.action === 'capability') return { status: 200, corpo: { available: true } }
        enviados.push(corpo)
        return { status: 202, corpo: { conversationId: corpo.conversationId ?? 'nova', runId: 'run-1', status: 'queued' } }
      },
    },
  })
  const servicos = criarServicosDoNavegadorFalsos()
  const usuario = userEvent.setup()
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={servicos.servicos} />)
  return { usuario, renomeadas, enviados }
}

describe('Conversas nomeadas no Workspace operacional', () => {
  it('a página de Agentes lista as Conversas anteriores, com o nome ou o primeiro pedido', async () => {
    abrir('/', [
      linha({ id: 'c1', title: 'ICP da Norte' }),
      linha({ id: 'c2', first_request: 'Campanha do quarto trimestre', updated_at: '2026-09-29T12:00:00Z' }),
      linha({ id: 'c3', kind: 'agente', agent_id: 'agente-scopus', first_request: 'Conversa na página do Scopus' }),
    ])

    const lista = within(await screen.findByRole('region', { name: 'Conversas anteriores' }))
    expect(lista.getAllByRole('listitem')).toHaveLength(2)
    expect(lista.getByText('ICP da Norte')).toBeInTheDocument()
    expect(lista.getByText('Campanha do quarto trimestre')).toBeInTheDocument()
    expect(lista.queryByText('Conversa na página do Scopus')).not.toBeInTheDocument()
  })

  it('reabrir uma Conversa mostra os pedidos dela, e o próximo pedido a continua', async () => {
    const { usuario, enviados } = abrir(
      '/',
      [linha({ id: 'c1', title: 'ICP da Norte' }), linha({ id: 'c2', first_request: 'Campanha do quarto trimestre' })],
      { c2: conversaSalva('Campanha do quarto trimestre', 'Aqui vai o plano da campanha.') },
    )

    await usuario.click(await screen.findByRole('button', { name: 'Abrir a Conversa Campanha do quarto trimestre' }))

    expect(await screen.findByText('Aqui vai o plano da campanha.')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Campanha do quarto trimestre' })).toBeInTheDocument()
    await usuario.type(screen.getByRole('textbox', { name: 'Continue a Conversa' }), 'E o orçamento?')
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }))
    await screen.findByText('E o orçamento?')
    expect(enviados.at(-1)).toEqual(expect.objectContaining({ conversationId: 'c2', text: 'E o orçamento?' }))
  })

  it('renomear guarda o nome, mostra na Conversa e na lista', async () => {
    const { usuario, renomeadas } = abrir(
      '/',
      [linha({ id: 'c2', first_request: 'Campanha do quarto trimestre' })],
      { c2: conversaSalva('Campanha do quarto trimestre', 'Aqui vai o plano da campanha.') },
    )

    await usuario.click(await screen.findByRole('button', { name: 'Abrir a Conversa Campanha do quarto trimestre' }))
    await usuario.click(await screen.findByRole('button', { name: 'Renomear' }))
    const campo = screen.getByRole('textbox', { name: 'Nome da Conversa' })
    await usuario.type(campo, 'Campanha Q4')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(await screen.findByRole('heading', { name: 'Campanha Q4' })).toBeInTheDocument()
    expect(renomeadas).toEqual([{ id: 'c2', titulo: 'Campanha Q4' }])

    await usuario.click(screen.getByRole('link', { name: 'Voltar para a grade' }))
    expect(await screen.findByRole('button', { name: 'Abrir a Conversa Campanha Q4' })).toBeInTheDocument()
  })

  it('sem Conversas salvas, a lista não aparece', async () => {
    abrir('/', [])

    expect(await screen.findByRole('textbox', { name: 'Peça algo aos agentes' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Conversas anteriores' })).not.toBeInTheDocument()
  })
})

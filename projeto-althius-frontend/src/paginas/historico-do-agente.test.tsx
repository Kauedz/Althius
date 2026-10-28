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

const conversaSalvaDoAgente = (pedido: string, resposta: string) => ({
  runs: [{
    id: 'run-0',
    request_text: pedido,
    status: 'succeeded',
    events: [{ seq: 1, kind: 'texto', agent_id: 'agente-scopus', payload: { texto: resposta } }],
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
      archive_agent_conversation: (parametros) => {
        const indice = salvas.findIndex((c) => c.id === parametros.p_conversation_id)
        if (indice >= 0) salvas.splice(indice, 1)
        return null
      },
      agent_prompt_suggestions: () => [{ id: 'scopus-aderencia-quente', texto: 'Pontue a aderência da Alfa ao nosso ICP' }],
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

const hoje = () => new Date().toISOString()

describe('Histórico de Conversas do Agente', () => {
  // Sinais first 10: a página do Agente é só leitura. O histórico continua aberto à consulta; continuar, renomear,
  // arquivar, Nova conversa e as sugestões saíram.
  it('lista as Conversas do Agente agrupadas e abre pelo endereço, sem continuar a Conversa', async () => {
    const { usuario, enviados } = abrir(
      '/agentes/agente-scopus/conversa',
      [
        linha({ id: 'a1', kind: 'agente', agent_id: 'agente-scopus', first_request: 'Aderência da Alfa', updated_at: hoje() }),
        linha({ id: 'a2', kind: 'agente', agent_id: 'agente-scopus', first_request: 'ICP antigo', updated_at: '2026-01-10T12:00:00Z' }),
        linha({ id: 'c1', first_request: 'Pedido coordenado' }),
      ],
      { a1: conversaSalvaDoAgente('Aderência da Alfa', 'A Alfa tem aderência alta.') },
    )

    expect(screen.queryByRole('button', { name: 'Recolher o histórico' })).not.toBeInTheDocument()
    await usuario.click(await screen.findByRole('button', { name: 'Histórico' }))
    const historico = within(await screen.findByRole('dialog', { name: 'Conversas do Scopus' }))
    expect(await historico.findByRole('heading', { name: 'Hoje' })).toBeInTheDocument()
    expect(historico.getByRole('heading', { name: 'Mais antigas' })).toBeInTheDocument()
    expect(historico.queryByText('Pedido coordenado')).not.toBeInTheDocument()

    await usuario.click(historico.getByRole('button', { name: /^Aderência da Alfa/ }))
    expect(await screen.findByText('A Alfa tem aderência alta.')).toBeInTheDocument()
    expect(window.location.search).toBe('?conversa=a1')

    expect(screen.queryByRole('textbox', { name: 'Mensagem para Scopus' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enviar' })).not.toBeInTheDocument()
    expect(enviados).toEqual([])
  })

  it('a busca filtra, sem arquivar, renomear nem Nova conversa', async () => {
    const { usuario, enviados, renomeadas } = abrir('/agentes/agente-scopus/conversa?conversa=a1', [
      linha({ id: 'a1', kind: 'agente', agent_id: 'agente-scopus', first_request: 'Aderência da Alfa', updated_at: hoje() }),
      linha({ id: 'a2', kind: 'agente', agent_id: 'agente-scopus', first_request: 'Previsão do trimestre', updated_at: hoje() }),
    ], { a1: conversaSalvaDoAgente('Aderência da Alfa', 'A Alfa tem aderência alta.') })

    expect(await screen.findByText('A Alfa tem aderência alta.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nova conversa' })).not.toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Histórico' }))
    const historico = within(await screen.findByRole('dialog', { name: 'Conversas do Scopus' }))
    await usuario.type(historico.getByRole('textbox', { name: 'Buscar conversas' }), 'previsao')
    expect(historico.queryByText('Aderência da Alfa')).not.toBeInTheDocument()
    expect(historico.getByText('Previsão do trimestre')).toBeInTheDocument()
    expect(historico.queryByRole('button', { name: /^(Arquivar|Renomear) / })).not.toBeInTheDocument()
    expect(enviados).toEqual([])
    expect(renomeadas).toEqual([])
  })

  it('não mostra sugestões de pedido novo, nem as do Workspace nem as da Demonstração', async () => {
    abrir('/agentes/agente-scopus/conversa', [])
    expect(await screen.findByText('Nenhuma Conversa aberta')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pontue a aderência da Alfa ao nosso ICP' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pontue a aderência da OpenAI ao nosso ICP' })).not.toBeInTheDocument()
  })
})

import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { RaizDoAplicativo } from '@/raiz'
import { criarBancoDeAgentes, rpcsDeAgentes } from '@/test/agentes-no-banco'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'

// A conversa coordenada (o pedido aos Agentes) mora em /conversa desde que / virou o chat do agente único.
window.history.replaceState(null, '', '/conversa')

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
const PESSOAL = { id: 'ws-pessoal-marina', kind: 'pessoal', name: 'Marina Souza', owner_user_id: MARINA.id }
const NORTE = { id: 'ws-norte', kind: 'empresa', name: 'Norte' }

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/conversa')
  sessionStorage.clear()
})

type Evento = { seq: number; kind: string; agent_id: string | null; payload: Record<string, unknown> }

/** A Marina abre o Norte com o modelo configurado; a Execução termina com os `eventos` e o `status` dados. */
function abrir(
  rota: string,
  {
    eventos = [] as Evento[],
    status = 'succeeded',
    salvas = [] as Record<string, unknown>[],
    conversa = { runs: [] } as Record<string, unknown>,
  } = {},
) {
  localStorage.setItem('althius:modo_demo', 'false')
  sessionStorage.setItem('althius:workspace', NORTE.id)
  window.history.replaceState(null, '', rota)
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
      // Como na rede: a leitura das Conversas salvas chega depois de a tela já ter aberto.
      list_agent_conversations: () => new Promise((responder) => setTimeout(() => responder(salvas), 50)),
      get_agent_conversation: () => conversa,
      get_agent_run_events: () => ({ status, error_code: status === 'failed' ? 'timeout' : null, events: eventos }),
    },
    funcoes: {
      'agent-conversation': (corpo) => {
        if (corpo.action === 'capability') return { status: 200, corpo: { available: true } }
        enviados.push(corpo)
        return { status: 202, corpo: { conversationId: 'conv-1', runId: 'run-1', status: 'queued' } }
      },
    },
  })
  const servicos = criarServicosDoNavegadorFalsos()
  const usuario = userEvent.setup()
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={servicos.servicos} />)
  return { usuario, enviados }
}

describe('Conversas no Workspace operacional, com o modelo configurado', () => {
  it('o pedido à Coordenação mostra o Agente chamado, a consulta real e a resposta consolidada', async () => {
    const { usuario, enviados } = abrir('/conversa', {
      eventos: [
        { seq: 1, kind: 'chamada', agent_id: 'agente-scopus', payload: {} },
        { seq: 2, kind: 'ferramenta', agent_id: 'agente-scopus', payload: { descricao: 'Consultou as Contas-alvo: "Alfa"', estado: 'concluida' } },
        { seq: 3, kind: 'feito', agent_id: 'agente-scopus', payload: { texto: 'Achei a Alfa Incorporadora.' } },
        { seq: 4, kind: 'resposta', agent_id: null, payload: { texto: 'Temos a Alfa Incorporadora.' } },
      ],
    })

    await usuario.type(await screen.findByRole('textbox', { name: 'Peça algo aos agentes' }), 'Quais Contas da Alfa?')
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }))

    const agentes = await screen.findByRole('list', { name: 'Agentes chamados' })
    expect(await within(agentes).findByText('Achei a Alfa Incorporadora.')).toBeInTheDocument()
    expect(await screen.findByText('Temos a Alfa Incorporadora.')).toBeInTheDocument()
    expect(screen.getByText('Resposta consolidada')).toBeInTheDocument()
    expect(enviados).toEqual([expect.objectContaining({ action: 'send', workspaceId: NORTE.id, text: 'Quais Contas da Alfa?' })])
    // Sem roteiros: as sugestões clicáveis da Demonstração não aparecem.
    expect(screen.queryByText('Monte a abordagem completa para a OpenAI')).not.toBeInTheDocument()
  })

  it('a falha aparece como falha, sem resposta no lugar', async () => {
    const { usuario } = abrir('/conversa', {
      status: 'failed',
      eventos: [
        { seq: 1, kind: 'chamada', agent_id: 'agente-scopus', payload: {} },
        { seq: 2, kind: 'falha', agent_id: null, payload: { motivo: 'timeout' } },
      ],
    })

    await usuario.type(await screen.findByRole('textbox', { name: 'Peça algo aos agentes' }), 'Oi, tudo bem?')
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('O pedido passou do tempo e foi interrompido.')
    expect(screen.queryByText('Resposta consolidada')).not.toBeInTheDocument()
    expect(screen.queryByText('Trabalhando')).not.toBeInTheDocument()
  })

  // Sinais first 10: a Conversa direta com o Agente é só leitura; a resposta já salva chega pelo banco, sem composer.
  it('na página do Agente, a Conversa salva volta do banco só para leitura, sem composer nem envio', async () => {
    const { enviados } = abrir('/agentes/agente-scopus/conversa?conversa=conv-s', {
      salvas: [{ id: 'conv-s', kind: 'agente', agent_id: 'agente-scopus' }],
      conversa: {
        runs: [{
          id: 'run-0',
          request_text: 'E a Alfa?',
          status: 'succeeded',
          events: [{ seq: 1, kind: 'texto', agent_id: 'agente-scopus', payload: { texto: 'A Alfa tem aderência.' } }],
        }],
      },
    })

    expect(await screen.findByText('A Alfa tem aderência.')).toBeInTheDocument()
    expect(screen.getAllByText('E a Alfa?').length).toBeGreaterThan(0)
    expect(screen.queryByRole('textbox', { name: 'Mensagem para Scopus' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enviar' })).not.toBeInTheDocument()
    expect(enviados).toEqual([])
  })

  it('depois de recarregar, a Conversa coordenada volta como estava, sem reenviar o pedido', async () => {
    const { enviados } = abrir('/conversa', {
      salvas: [{ id: 'conv-1', kind: 'coordenada', agent_id: null }],
      conversa: {
        runs: [{
          id: 'run-0',
          request_text: 'Quais Contas da Alfa?',
          status: 'succeeded',
          events: [{ seq: 1, kind: 'resposta', agent_id: null, payload: { texto: 'Temos a Alfa Incorporadora.' } }],
        }],
      },
    })

    expect(await screen.findByText('Temos a Alfa Incorporadora.')).toBeInTheDocument()
    expect(screen.getByText('Quais Contas da Alfa?')).toBeInTheDocument()
    expect(enviados).toEqual([])
  })
})

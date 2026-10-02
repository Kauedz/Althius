// A Aprovação que um Agente pede numa Conversa aparece como passo da própria Conversa, com Aprovar e Recusar (ADR-0022):
// a fila /aprovacoes continua desligada no Workspace operacional. Só o Administrador decide; depois de aprovar, a
// execução da chamada de ferramenta é pedida à integration-tools.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
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

const PASSO = {
  seq: 1,
  kind: 'ferramenta',
  agent_id: 'agente-rhetor',
  payload: {
    ferramenta: 'usar_conector',
    descricao: 'Rhetor propôs usar criar_pagina no Notion — aguardando Aprovação',
    estado: 'aguardando',
    link: { tipo: 'aprovacao', id: 'ap-7' },
  },
}

function abrir(rota: string, papel: 'admin' | 'member') {
  localStorage.setItem('althius:modo_demo', 'false')
  sessionStorage.setItem('althius:workspace', NORTE.id)
  window.history.replaceState(null, '', rota)
  let estado = 'pendente'
  const decisoes: Record<string, unknown>[] = []
  const execucoes: Record<string, unknown>[] = []
  const supabase = criarSupabaseFalso({
    sessao: sessaoDe(MARINA),
    tabelas: {
      workspaces: [PESSOAL, NORTE],
      workspace_memberships: [
        { workspace_id: PESSOAL.id, role: 'admin', user_id: MARINA.id, active: true },
        { workspace_id: NORTE.id, role: papel, user_id: MARINA.id, active: true },
      ],
    },
    rpcs: {
      bootstrap_personal_workspace: () => PESSOAL,
      list_owned_sender_accounts: () => [],
      ...rpcsDeAgentes(criarBancoDeAgentes()),
      list_agent_conversations: () => [],
      get_agent_conversation: () => ({ runs: [] }),
      get_agent_run_events: () => ({
        status: 'succeeded',
        error_code: null,
        events: [{ seq: 0, kind: 'chamada', agent_id: 'agente-rhetor', payload: {} }, PASSO, { seq: 2, kind: 'texto', agent_id: 'agente-rhetor', payload: { texto: 'Pedi a Aprovação.' } }],
      }),
      list_approvals: () => [{
        id: 'ap-7', agent_id: 'agente-rhetor', integration_id: 'notion', action: 'Usar criar_pagina no Notion',
        impact: 'Escreve ou gasta no Notion com a conta de quem fez o pedido.', justification: 'A Alfa pediu a pauta.',
        payload: { tipo: 'ferramenta', integration_id: 'notion', ferramenta: 'criar_pagina', argumentos: { titulo: 'Pauta' } },
        target_account_id: null, state: estado, failure: null,
      }],
      decide_approval: (p) => {
        decisoes.push(p)
        estado = p.p_decision === 'aprovar' ? 'aprovada' : 'recusada'
        return estado
      },
    },
    funcoes: {
      'agent-conversation': (corpo) =>
        corpo.action === 'capability'
          ? { status: 200, corpo: { available: true } }
          : { status: 202, corpo: { conversationId: 'conv-1', runId: 'run-1', status: 'queued' } },
      'integration-tools': (corpo) => {
        execucoes.push(corpo)
        estado = 'executada'
        return { corpo: { status: 'executada', mensagem: 'criar_pagina executada.' } }
      },
    },
  })
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={criarServicosDoNavegadorFalsos().servicos} />)
  return { usuario: userEvent.setup(), decisoes, execucoes }
}

describe('A Aprovação pedida por um Agente, decidida dentro da Conversa', () => {
  it('o Administrador aprova no passo da Conversa, e a chamada aprovada é executada', async () => {
    const { usuario, decisoes, execucoes } = abrir('/agentes/agente-rhetor/conversa', 'admin')
    await usuario.type(await screen.findByRole('textbox', { name: 'Mensagem para Rhetor' }), 'Crie a pauta da Alfa no Notion')
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }))

    const cartao = await screen.findByRole('article', { name: 'Aprovação pendente: Usar criar_pagina no Notion' })
    expect(within(cartao).getByText('Escreve ou gasta no Notion com a conta de quem fez o pedido.')).toBeInTheDocument()
    await usuario.click(within(cartao).getByRole('button', { name: 'Aprovar' }))

    await waitFor(() => expect(execucoes).toEqual([{ action: 'executar_aprovacao', approvalId: 'ap-7' }]))
    expect(decisoes).toEqual([{ p_approval_id: 'ap-7', p_decision: 'aprovar', p_where: 'conversa' }])
    expect(await screen.findByText('Aprovada · executada')).toBeInTheDocument()
  })

  it('na Coordenação, quem não é Administrador vê a Aprovação, mas não decide', async () => {
    const { usuario, decisoes } = abrir('/', 'member')
    await usuario.type(await screen.findByRole('textbox', { name: 'Peça algo aos agentes' }), 'Crie a pauta da Alfa')
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }))

    const cartao = await screen.findByRole('article', { name: 'Aprovação pendente: Usar criar_pagina no Notion' })
    expect(within(cartao).getByText('Só um Administrador decide esta Aprovação.')).toBeInTheDocument()
    expect(within(cartao).queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument()
    expect(decisoes).toEqual([])
  })
})

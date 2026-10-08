// A fila de Aprovações do Workspace operacional (CRM-15): lê `list_approvals` e não mostra nada da Demonstração. Uma
// Conversa é de quem a começou, então a Aprovação pedida na Conversa de um Membro é decidida aqui, pelo Administrador:
// `list_approvals` traz toda Aprovação do Workspace (pgTAP `aprovacoes_reais.sql`: o Membro pede, a Administradora aprova
// pela fila). Aprovado o envio ao CRM, a execução é pedida ao crm-handoff.
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

/**
 * O envio ao CRM que o Rhetor propôs na Conversa da Paula, Membro e Vendedora responsável pela Alfa. A fila não recebe
 * quem pediu: só a justificativa conta a história.
 */
function envioDaAlfa(state: string) {
  return {
    id: 'ap-alfa',
    agent_id: 'agente-rhetor',
    integration_id: 'hubspot',
    action: 'Enviar a Alfa Engenharia ao HubSpot',
    impact: 'Cria no HubSpot a empresa, 2 Contatos e uma nota com os Sinais e a abordagem. Depois do envio, o HubSpot é a fonte da verdade.',
    justification: 'A Paula pediu o envio depois da reunião marcada.',
    payload: { tipo: 'envio_ao_crm', integration_id: 'hubspot', target_account_id: 'conta-alfa' },
    target_account_id: 'conta-alfa',
    state,
    failure: null,
  }
}

function abrirAFila(papel: 'admin' | 'member') {
  localStorage.setItem('althius:modo_demo', 'false')
  sessionStorage.setItem('althius:workspace', NORTE.id)
  window.history.replaceState(null, '', '/aprovacoes')
  let estado = 'pendente'
  const leituras: Record<string, unknown>[] = []
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
      list_approvals: (p) => {
        leituras.push(p)
        return [envioDaAlfa(estado)]
      },
      decide_approval: (p) => {
        decisoes.push(p)
        estado = p.p_decision === 'aprovar' ? 'aprovada' : 'recusada'
        return estado
      },
    },
    funcoes: {
      'agent-conversation': () => ({ status: 200, corpo: { available: true } }),
      'crm-handoff': (corpo) => {
        execucoes.push(corpo)
        estado = 'executada'
        return { corpo: { status: 'enviado', mensagem: 'Enviada ao HubSpot.', pendencias: [] } }
      },
    },
  })
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={criarServicosDoNavegadorFalsos().servicos} />)
  return { usuario: userEvent.setup(), leituras, decisoes, execucoes }
}

describe('A fila de Aprovações no Workspace operacional', () => {
  it('o Administrador decide pela fila o envio ao CRM que o Rhetor propôs, e o envio aprovado é executado', async () => {
    const { usuario, leituras, decisoes, execucoes } = abrirAFila('admin')

    const cartao = await screen.findByRole('article', { name: 'Enviar a Alfa Engenharia ao HubSpot' })
    expect(leituras).toContainEqual({ p_workspace_id: NORTE.id })
    expect(screen.getByRole('heading', { name: 'Pendentes · 1' })).toBeInTheDocument()
    expect(within(cartao).getByText('A Paula pediu o envio depois da reunião marcada.')).toBeInTheDocument()
    expect(screen.queryByText(/Meta Ads|Databricks|Clay/)).not.toBeInTheDocument()

    await usuario.click(within(cartao).getByRole('button', { name: 'Aprovar' }))

    await waitFor(() => expect(execucoes).toEqual([{ action: 'executar_aprovacao', approvalId: 'ap-alfa' }]))
    expect(decisoes).toEqual([{ p_approval_id: 'ap-alfa', p_decision: 'aprovar', p_where: 'fila' }])
    expect(await within(cartao).findByText('Aprovada · executada')).toBeInTheDocument()
  })

  it('a navegação mostra quantas Aprovações esperam decisão, e o número some depois de decidida', async () => {
    const { usuario } = abrirAFila('admin')
    const navegacao = await screen.findByRole('complementary', { name: 'Navegação' })

    expect(await within(navegacao).findByRole('link', { name: 'Aprovações, 1 pendente' })).toBeInTheDocument()
    const cartao = await screen.findByRole('article', { name: 'Enviar a Alfa Engenharia ao HubSpot' })
    await usuario.click(within(cartao).getByRole('button', { name: 'Aprovar' }))

    expect(await within(navegacao).findByRole('link', { name: 'Aprovações' })).toBeInTheDocument()
  })

  it('a fila não promete decidir pelo Canal, que ainda não existe no Workspace operacional', async () => {
    abrirAFila('admin')

    await screen.findByRole('article', { name: 'Enviar a Alfa Engenharia ao HubSpot' })
    expect(screen.getByText(/só acontece com o ok de um Administrador/)).toBeInTheDocument()
    expect(screen.queryByText(/canal de onde veio o pedido/)).not.toBeInTheDocument()
  })

  it('um Membro vê a Aprovação pendente na fila, mas não decide', async () => {
    const { decisoes } = abrirAFila('member')

    const cartao = await screen.findByRole('article', { name: 'Enviar a Alfa Engenharia ao HubSpot' })
    expect(within(cartao).getByText('Só um Administrador decide esta Aprovação.')).toBeInTheDocument()
    expect(within(cartao).queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument()
    expect(within(cartao).queryByRole('button', { name: 'Recusar' })).not.toBeInTheDocument()
    expect(decisoes).toEqual([])
  })
})

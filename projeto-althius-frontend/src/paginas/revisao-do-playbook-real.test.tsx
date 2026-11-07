// A revisão do Playbook no Workspace operacional (CRM-09, ADR-0010) depois da retirada do Playbook (contexto-da-empresa
// 07): a revisão que o Scopus ou o Ethos propôs antes continua na fila /aprovacoes e no passo da Conversa, só como
// registro. Nenhum papel a decide pela tela (a pendente vence sozinha), ela não conta como pendente, e a tela não lê
// nenhuma seção do Playbook.
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
const ANA = 'usuario-ana'

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
})

type Estado = 'pendente' | 'aprovada' | 'recusada' | 'desatualizada'

/** A revisão do ICP que o Scopus propôs, na forma de `list_approvals`. */
function revisaoDoIcp(state: Estado, id = 'rev-icp') {
  return {
    id,
    agent_id: 'agente-scopus',
    integration_id: null,
    action: 'Nova versão de ICP no Playbook',
    impact: 'Aprovar grava a versão 3 de ICP, que os Agentes e as telas passam a usar no lugar da versão 2.',
    justification: 'Os três últimos fechamentos foram em indústrias de 200 a 500 pessoas.',
    payload: { tipo: 'revisao_do_playbook', secao: 'icp', versao_base: 2 },
    target_account_id: null,
    state,
    failure: null,
    decided_by: state === 'pendente' ? null : ANA,
    category: 'revisao',
    playbook_section: 'icp',
    base_version: 2,
    applied_version: state === 'aprovada' ? 3 : null,
    proposed_content: state === 'pendente' ? { texto: 'Indústrias de 200 a 500 pessoas no Sul', linhas: [] } : null,
  }
}

function abrir(
  rota: string,
  papel: 'admin' | 'member',
  { fila = [revisaoDoIcp('pendente')] }: { fila?: Record<string, unknown>[] } = {},
) {
  localStorage.setItem('althius:modo_demo', 'false')
  sessionStorage.setItem('althius:workspace', NORTE.id)
  window.history.replaceState(null, '', rota)
  let linhas = fila
  const decisoes: Record<string, unknown>[] = []
  const execucoes: string[] = []
  const leiturasDoPlaybook: unknown[] = []
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
        events: [
          { seq: 0, kind: 'chamada', agent_id: 'agente-scopus', payload: {} },
          {
            seq: 1,
            kind: 'ferramenta',
            agent_id: 'agente-scopus',
            payload: {
              ferramenta: 'propor_mudanca_no_playbook',
              descricao: 'Scopus propôs uma nova versão do ICP — aguardando Aprovação de um Administrador',
              estado: 'aguardando',
              link: { tipo: 'aprovacao', id: 'rev-icp' },
            },
          },
          { seq: 2, kind: 'texto', agent_id: 'agente-scopus', payload: { texto: 'Propus o ICP novo.' } },
        ],
      }),
      list_workspace_participants: () => [
        { user_id: MARINA.id, email: MARINA.email, name: 'Marina Souza', role: papel, is_owner: false },
        { user_id: ANA, email: 'ana@cliente.com.br', name: 'Ana Prado', role: 'admin', is_owner: false },
      ],
      list_workspace_invitations: () => [],
      list_approvals: () => linhas,
      decide_approval: (p) => {
        decisoes.push(p)
        const estado = p.p_decision === 'aprovar' ? 'aprovada' : 'recusada'
        linhas = linhas.map((l) => (l.id === p.p_approval_id ? { ...revisaoDoIcp(estado), decided_by: MARINA.id } : l))
        return estado
      },
      get_playbook_section: (p) => {
        leiturasDoPlaybook.push(p)
        return null
      },
    },
    funcoes: {
      'agent-conversation': (corpo) =>
        corpo.action === 'capability'
          ? { status: 200, corpo: { available: true } }
          : { status: 202, corpo: { conversationId: 'conv-1', runId: 'run-1', status: 'queued' } },
      'crm-handoff': () => (execucoes.push('crm-handoff'), { corpo: { status: 'enviado' } }),
      'integration-tools': () => (execucoes.push('integration-tools'), { corpo: {} }),
    },
  })
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={criarServicosDoNavegadorFalsos().servicos} />)
  return { usuario: userEvent.setup(), decisoes, execucoes, leiturasDoPlaybook }
}

describe('A revisão do Playbook na fila de Aprovações, depois da retirada', () => {
  it('a pendente fica como registro: sem Aprovar nem Recusar, sem ler o Playbook, e leva ao Contexto da empresa', async () => {
    const { decisoes, execucoes, leiturasDoPlaybook } = abrir('/aprovacoes', 'admin')

    const cartao = await screen.findByRole('article', { name: 'Nova versão de ICP no Playbook' })
    expect(within(cartao).getByText('Playbook · ICP')).toBeInTheDocument()
    expect(within(cartao).queryByRole('link', { name: 'Playbook · ICP' })).not.toBeInTheDocument()
    expect(within(cartao).getByText(/Os três últimos fechamentos/)).toBeInTheDocument()
    expect(
      within(cartao).getByText('Não pode mais ser decidida · o Playbook foi substituído pelo Contexto da empresa'),
    ).toBeInTheDocument()
    expect(within(cartao).getByRole('link', { name: 'Contexto da empresa' })).toHaveAttribute('href', '/configuracoes/contexto')
    expect(within(cartao).queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument()
    expect(within(cartao).queryByRole('button', { name: 'Recusar' })).not.toBeInTheDocument()
    expect(within(cartao).queryByText('Indústrias de 200 a 500 pessoas no Sul')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Pendentes · 0' })).toBeInTheDocument()
    expect(decisoes).toEqual([])
    expect(execucoes).toEqual([])
    expect(leiturasDoPlaybook).toEqual([])
  })

  it('as decididas continuam com o histórico: quem decidiu e o que aconteceu', async () => {
    abrir('/aprovacoes', 'member', {
      fila: [revisaoDoIcp('aprovada', 'rev-1'), revisaoDoIcp('recusada', 'rev-2'), revisaoDoIcp('desatualizada', 'rev-3')],
    })
    expect(await screen.findByText('Aprovada por Ana Prado · versão 3 gravada no Playbook')).toBeInTheDocument()
    expect(screen.getByText('Recusada por Ana Prado · o Playbook não mudou')).toBeInTheDocument()
    expect(screen.getByText('Desatualizada · a seção mudou antes da decisão')).toBeInTheDocument()
  })
})

describe('A revisão do Playbook no passo da Conversa, depois da retirada', () => {
  it('a Conversa mostra o registro da revisão, sem decisão ali', async () => {
    const { usuario, decisoes } = abrir('/agentes/agente-scopus/conversa', 'admin')
    await usuario.type(await screen.findByRole('textbox', { name: 'Mensagem para Scopus' }), 'Ajuste o ICP')
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }))

    const cartao = await screen.findByRole('article', { name: 'Nova versão de ICP no Playbook' })
    expect(
      within(cartao).getByText('Não pode mais ser decidida · o Playbook foi substituído pelo Contexto da empresa'),
    ).toBeInTheDocument()
    expect(within(cartao).queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument()
    expect(decisoes).toEqual([])
  })
})

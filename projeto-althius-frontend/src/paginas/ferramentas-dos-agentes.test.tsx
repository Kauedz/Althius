// Os Agentes agem pelas ferramentas (Etapa 5b): cada chamada aparece na Conversa em português, com o link para onde a
// pessoa continua (a Caixa de Descobertas ou a Aprovação). Um passo sem link continua como antes.
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

type Evento = { seq: number; kind: string; agent_id: string | null; payload: Record<string, unknown> }

function abrir(rota: string, eventos: Evento[]) {
  localStorage.setItem('althius:modo_demo', 'false')
  sessionStorage.setItem('althius:workspace', NORTE.id)
  window.history.replaceState(null, '', rota)
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
      list_agent_conversations: () => [],
      get_agent_conversation: () => ({ runs: [] }),
      get_agent_run_events: () => ({ status: 'succeeded', error_code: null, events: eventos }),
    },
    funcoes: {
      'agent-conversation': (corpo) =>
        corpo.action === 'capability'
          ? { status: 200, corpo: { available: true } }
          : { status: 202, corpo: { conversationId: 'conv-1', runId: 'run-1', status: 'queued' } },
    },
  })
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={criarServicosDoNavegadorFalsos().servicos} />)
  return { usuario: userEvent.setup() }
}

describe('Os passos das ferramentas dos Agentes na Conversa', () => {
  it('na Coordenação, cada Agente mostra o que fez, com o link para a Caixa de Descobertas e para a Aprovação', async () => {
    const { usuario } = abrir('/', [
      { seq: 1, kind: 'chamada', agent_id: 'agente-scopus', payload: {} },
      {
        seq: 2,
        kind: 'ferramenta',
        agent_id: 'agente-scopus',
        payload: {
          ferramenta: 'buscar_contas_pelo_icp',
          descricao: 'Scopus pediu uma busca de contas pelo ICP (até 50 empresas, 5 Créditos): confirme na Caixa de Descobertas',
          estado: 'aguardando',
          link: { tipo: 'descobertas' },
        },
      },
      { seq: 3, kind: 'chamada', agent_id: 'agente-rhetor', payload: {} },
      {
        seq: 4,
        kind: 'ferramenta',
        agent_id: 'agente-rhetor',
        payload: {
          ferramenta: 'propor_envio_ao_crm',
          descricao: 'Rhetor propôs enviar a Acme ao HubSpot — aguardando Aprovação',
          estado: 'aguardando',
          link: { tipo: 'aprovacao', id: 'ap-1' },
        },
      },
    ])

    await usuario.type(await screen.findByRole('textbox', { name: 'Peça algo aos agentes' }), 'Ache contas e leve ao CRM')
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }))

    const agentes = await screen.findByRole('list', { name: 'Agentes chamados' })
    expect(await within(agentes).findByText(/Scopus pediu uma busca de contas pelo ICP/)).toBeInTheDocument()
    expect(within(agentes).getByText('Rhetor propôs enviar a Acme ao HubSpot — aguardando Aprovação')).toBeInTheDocument()
    expect(within(agentes).getByRole('link', { name: 'Abrir a Caixa de Descobertas' })).toHaveAttribute('href', '/contas/descobertas')
    expect(within(agentes).getByRole('link', { name: 'Ver a Aprovação' })).toHaveAttribute('href', '/aprovacoes')
  })

  it('na página do Agente, o passo leva à Aprovação; um link de tipo desconhecido não aparece', async () => {
    const { usuario } = abrir('/agentes/agente-rhetor/conversa', [
      {
        seq: 1,
        kind: 'ferramenta',
        agent_id: 'agente-rhetor',
        payload: { descricao: 'Rhetor propôs enviar a Acme ao HubSpot — aguardando Aprovação', estado: 'aguardando', link: { tipo: 'aprovacao', id: 'ap-1' } },
      },
      {
        seq: 2,
        kind: 'ferramenta',
        agent_id: 'agente-rhetor',
        payload: { descricao: 'Rhetor leu as Contas-alvo (3 Contas)', estado: 'concluida', link: { tipo: 'outro' } },
      },
      { seq: 3, kind: 'texto', agent_id: 'agente-rhetor', payload: { texto: 'Propus o envio; depende da Aprovação.' } },
    ])

    await usuario.type(await screen.findByRole('textbox', { name: 'Mensagem para Rhetor' }), 'Leve a Acme ao HubSpot')
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }))

    expect(await screen.findByText('Propus o envio; depende da Aprovação.')).toBeInTheDocument()
    expect(screen.getByText('Rhetor propôs enviar a Acme ao HubSpot — aguardando Aprovação')).toBeInTheDocument()
    expect(screen.getByText('Rhetor leu as Contas-alvo (3 Contas)')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Ver a Aprovação' })).toHaveLength(1)
  })
})

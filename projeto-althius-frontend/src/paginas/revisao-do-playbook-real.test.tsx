// A revisão do Playbook no Workspace operacional (CRM-09, ADR-0010; agentes-em-conversa 05): a nova versão de uma seção
// que o Scopus ou o Ethos propôs aparece na fila /aprovacoes e no passo da Conversa, com a vigente ao lado da proposta.
// Só o Administrador aprova ou recusa (pgTAP `revisao_do_playbook_por_aprovacao.sql` confere no banco); o Membro vê. A
// Memória do Workspace mostra o ICP e as Personas do Playbook: a versão aprovada, a proposta pendente, a última recusa e
// o estado vazio, sem nada da Demonstração. O Playbook marca a seção com proposta pendente.
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

/** Uma seção como `get_playbook_section` a devolve; sem versão, vazia. */
function secaoNoBanco(section: string, name: string, texto: string | null, version = 2) {
  return texto === null
    ? { section, name, version: null, content: null, updated_by: null, updated_at: null, history: [] }
    : {
        section,
        name,
        version,
        content: { texto, linhas: [] },
        updated_by: ANA,
        updated_at: '2026-10-08T14:00:00Z',
        history: [{ version, updated_by: ANA, updated_at: '2026-10-08T14:00:00Z' }],
      }
}

function abrir(
  rota: string,
  papel: 'admin' | 'member',
  { fila = [revisaoDoIcp('pendente')], secoes = {} }: {
    fila?: Record<string, unknown>[]
    secoes?: Record<string, ReturnType<typeof secaoNoBanco>>
  } = {},
) {
  localStorage.setItem('althius:modo_demo', 'false')
  sessionStorage.setItem('althius:workspace', NORTE.id)
  window.history.replaceState(null, '', rota)
  let linhas = fila
  const decisoes: Record<string, unknown>[] = []
  const execucoes: string[] = []
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
      get_playbook_section: (p) =>
        secoes[String(p.p_section)] ??
        (p.p_section === 'icp'
          ? secaoNoBanco('icp', 'ICP', 'Empresas de 50 a 200 pessoas no Brasil')
          : secaoNoBanco(String(p.p_section), String(p.p_section), null)),
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
  return { usuario: userEvent.setup(), decisoes, execucoes }
}

describe('A revisão do Playbook na fila de Aprovações', () => {
  it('o Administrador vê a vigente ao lado da proposta e aprova: a versão nova é gravada, sem executor', async () => {
    const { usuario, decisoes, execucoes } = abrir('/aprovacoes', 'admin')

    const cartao = await screen.findByRole('article', { name: 'Nova versão de ICP no Playbook' })
    expect(within(cartao).getByRole('link', { name: 'Playbook · ICP' })).toHaveAttribute('href', '/configuracoes/playbook/icp')
    expect(within(cartao).getByText(/Os três últimos fechamentos/)).toBeInTheDocument()
    const vigente = await within(cartao).findByRole('region', { name: 'Versão vigente' })
    expect(within(vigente).getByText('Vigente · versão 2')).toBeInTheDocument()
    expect(await within(vigente).findByText('Empresas de 50 a 200 pessoas no Brasil')).toBeInTheDocument()
    const proposta = within(cartao).getByRole('region', { name: 'Proposta' })
    expect(within(proposta).getByText('Indústrias de 200 a 500 pessoas no Sul')).toBeInTheDocument()

    await usuario.click(await within(cartao).findByRole('button', { name: 'Aprovar' }))

    await waitFor(() =>
      expect(decisoes).toEqual([{ p_approval_id: 'rev-icp', p_decision: 'aprovar', p_where: 'fila' }]),
    )
    expect(await within(cartao).findByText('Aprovada por Marina Souza · versão 3 gravada no Playbook')).toBeInTheDocument()
    expect(execucoes).toEqual([])
    expect(within(cartao).queryByRole('region', { name: 'Proposta' })).not.toBeInTheDocument()
  })

  it('o Administrador recusa, e o cartão diz que o Playbook não mudou', async () => {
    const { usuario, decisoes } = abrir('/aprovacoes', 'admin')
    const cartao = await screen.findByRole('article', { name: 'Nova versão de ICP no Playbook' })
    await usuario.click(await within(cartao).findByRole('button', { name: 'Recusar' }))
    expect(await within(cartao).findByText('Recusada por Marina Souza · o Playbook não mudou')).toBeInTheDocument()
    expect(decisoes).toEqual([{ p_approval_id: 'rev-icp', p_decision: 'recusar', p_where: 'fila' }])
  })

  it('o Membro vê a proposta pendente, mas não decide', async () => {
    const { decisoes } = abrir('/aprovacoes', 'member')
    const cartao = await screen.findByRole('article', { name: 'Nova versão de ICP no Playbook' })
    expect(await within(cartao).findByText('Só um Administrador decide esta Aprovação.')).toBeInTheDocument()
    expect(within(cartao).queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument()
    expect(within(cartao).queryByRole('button', { name: 'Recusar' })).not.toBeInTheDocument()
    expect(decisoes).toEqual([])
  })

  it('a desatualizada diz que a seção mudou antes da decisão e pede uma proposta nova', async () => {
    abrir('/aprovacoes', 'admin', { fila: [revisaoDoIcp('desatualizada')] })
    const cartao = await screen.findByRole('article', { name: 'Nova versão de ICP no Playbook' })
    expect(
      await within(cartao).findByText('Desatualizada · a seção mudou antes da decisão; peça ao Scopus uma proposta nova'),
    ).toBeInTheDocument()
    expect(within(cartao).queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument()
  })
})

describe('A revisão do Playbook no passo da Conversa', () => {
  it('a Conversa mostra a proposta e o estado dela, e o Administrador aprova ali mesmo', async () => {
    const { usuario, decisoes } = abrir('/agentes/agente-scopus/conversa', 'admin')
    await usuario.type(await screen.findByRole('textbox', { name: 'Mensagem para Scopus' }), 'Ajuste o ICP')
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }))

    expect(await screen.findByText(/Scopus propôs uma nova versão do ICP — aguardando Aprovação de um Administrador/))
      .toBeInTheDocument()
    const cartao = await screen.findByRole('article', { name: 'Nova versão de ICP no Playbook' })
    expect(within(cartao).getByText('Aprovação pendente')).toBeInTheDocument()
    expect(await within(cartao).findByText('Indústrias de 200 a 500 pessoas no Sul')).toBeInTheDocument()
    await usuario.click(await within(cartao).findByRole('button', { name: 'Aprovar' }))

    await waitFor(() =>
      expect(decisoes).toEqual([{ p_approval_id: 'rev-icp', p_decision: 'aprovar', p_where: 'conversa' }]),
    )
    expect(await within(cartao).findByText(/versão 3 gravada no Playbook/)).toBeInTheDocument()
  })
})

describe('A Memória do Workspace operacional lê o ICP e as Personas do Playbook', () => {
  it('mostra o ICP aprovado e a proposta pendente, sem nada da Demonstração', async () => {
    abrir('/configuracoes/memoria/icp', 'member')

    const icp = await screen.findByRole('region', { name: 'ICP do Workspace' })
    expect(await within(icp).findByText('Empresas de 50 a 200 pessoas no Brasil')).toBeInTheDocument()
    expect(within(icp).getByText('Vigente')).toBeInTheDocument()
    expect(within(icp).getByText(/Versão 2 · Ana Prado/)).toBeInTheDocument()
    expect(await within(icp).findByText('Proposta pendente do Scopus.')).toBeInTheDocument()
    expect(within(icp).getByRole('link', { name: /Ver proposta pendente/ })).toHaveAttribute('href', '/aprovacoes')
    expect(screen.queryByText(/Aguardando a execução dos Agentes/)).not.toBeInTheDocument()
    // Nada dos documentos de exemplo da Demonstração.
    expect(screen.queryByText(/Serviços financeiros|Brasil e México|Solicitar revisão/)).not.toBeInTheDocument()
  })

  it('depois de uma recusa, diz quem recusou e que o ICP vigente não mudou', async () => {
    abrir('/configuracoes/memoria/icp', 'admin', { fila: [revisaoDoIcp('recusada')] })
    const icp = await screen.findByRole('region', { name: 'ICP do Workspace' })
    expect(await within(icp).findByText(/A última proposta do Scopus foi recusada por Ana Prado\. O ICP vigente não mudou\./))
      .toBeInTheDocument()
    expect(within(icp).queryByText('Proposta pendente do Scopus.')).not.toBeInTheDocument()
  })

  it('sem versão aprovada, as Personas dizem o que fazer: pedir ao Ethos numa Conversa', async () => {
    abrir('/configuracoes/memoria/personas', 'admin', { fila: [] })
    const personas = await screen.findByRole('region', { name: 'Personas do Workspace' })
    expect(await within(personas).findByText('Nenhuma versão aprovada ainda.')).toBeInTheDocument()
    expect(within(personas).getByText(/Peça ao Ethos numa Conversa/)).toBeInTheDocument()
    expect(within(personas).getByRole('link', { name: 'Conversar com o Ethos' })).toHaveAttribute('href', '/agentes/agente-ethos')
    expect(within(personas).queryByText('Vigente')).not.toBeInTheDocument()
  })
})

describe('O Playbook marca a seção com proposta pendente', () => {
  it('o menu e a seção avisam da proposta, e a versão vigente continua à mostra', async () => {
    abrir('/configuracoes/playbook/icp', 'admin')
    const menu = await screen.findByRole('navigation', { name: 'Seções do Playbook' })
    expect(await within(menu).findByRole('link', { name: 'ICP, proposta pendente' })).toBeInTheDocument()
    expect(within(menu).getByRole('link', { name: 'Personas' })).toBeInTheDocument()
    expect(await screen.findByText('Há uma proposta para ICP, aguardando Aprovação.')).toBeInTheDocument()
    expect(screen.getByText(/Salvar uma versão agora deixa a proposta desatualizada/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver a proposta' })).toHaveAttribute('href', '/aprovacoes')
  })
})

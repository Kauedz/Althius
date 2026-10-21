// A Sequência que o Rhetor propõe no Workspace operacional (cadencia-pela-ia 02): o passo da Conversa mostra a Conta-alvo,
// os Contatos e os passos (dia, assunto e corpo, com as variáveis em destaque), com Aprovar e Recusar só para o Vendedor
// responsável. Aprovada, mostra "Sequência criada, envios não ativados" e o link para a Sequência; recarregar mostra o
// mesmo, sem reenviar o pedido. A fila filtra por Sequência. Quem não é responsável não lê o assunto nem o corpo.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { RaizDoAplicativo } from '@/raiz'
import { criarBancoDeAgentes, rpcsDeAgentes } from '@/test/agentes-no-banco'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'

const BIA = { id: 'usuario-bia', email: 'bia@cliente.com.br' }
const PESSOAL = { id: 'ws-pessoal-bia', kind: 'pessoal', name: 'Bia Lima', owner_user_id: BIA.id }
const NORTE = { id: 'ws-norte', kind: 'empresa', name: 'Norte' }
const ACAO = 'Sequência de E-mail para Alfa Engenharia'

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
    ferramenta: 'propor_sequencia',
    descricao: 'Rhetor propôs uma Sequência para a Alfa Engenharia (2 Contatos, 3 e-mails) — aguardando o Vendedor responsável',
    estado: 'aguardando',
    link: { tipo: 'aprovacao', id: 'ap-seq' },
  },
}

const CONTEUDO = {
  contatos: [
    { id: 'c-maria', nome: 'Maria Souza', cargo: 'Diretora' },
    { id: 'c-joao', nome: 'João Lima', cargo: null },
  ],
  passos: [
    { esperaEmDias: 0, assunto: '{{primeiro_nome}}, vi as vagas na {{empresa}}', corpo: 'Oi {{primeiro_nome}}, a {{empresa}} abriu 12 vagas.' },
    { esperaEmDias: 3, assunto: 'Re: {{empresa}}', corpo: 'Retomando a conversa.' },
    { esperaEmDias: 4, assunto: 'Última ideia', corpo: 'Fico à disposição. {{remetente.nome}}' },
  ],
}

/** A proposta como `list_approvals` a devolve: o conteúdo só para o Vendedor responsável e só enquanto pendente. */
function proposta(state: string, responsavel: boolean, extra: Record<string, unknown> = {}) {
  return {
    id: 'ap-seq',
    agent_id: 'agente-rhetor',
    integration_id: null,
    action: ACAO,
    impact: 'Aprovar cria a Sequência com 2 Contatos e 3 passos de E-mail, sem envio: nada sai até o Vendedor responsável clicar em "Ativar envios". Recusar não cria nada.',
    justification: 'A Alfa abriu 12 vagas de vendas.',
    payload: { tipo: 'sequencia', conta: 'Alfa Engenharia', total_contatos: 2, total_passos: 3 },
    target_account_id: 'conta-alfa',
    state,
    failure: null,
    category: 'sequencia',
    proposed_content: responsavel && state === 'pendente' ? CONTEUDO : null,
    created_sequence_id: state === 'aprovada' ? 'seq-alfa' : null,
    responsible_seller: responsavel,
    ...extra,
  }
}

function abrir(
  rota: string,
  {
    papel = 'member' as 'admin' | 'member',
    responsavel = true,
    estadoInicial = 'pendente',
    outras = [] as Record<string, unknown>[],
    extra = {} as Record<string, unknown>,
    salvas = [] as Record<string, unknown>[],
    conversa = { runs: [] } as Record<string, unknown>,
  } = {},
) {
  localStorage.setItem('althius:modo_demo', 'false')
  sessionStorage.setItem('althius:workspace', NORTE.id)
  window.history.replaceState(null, '', rota)
  let estado = estadoInicial
  const decisoes: Record<string, unknown>[] = []
  const enviados: Record<string, unknown>[] = []
  const executores: string[] = []
  const supabase = criarSupabaseFalso({
    sessao: sessaoDe(BIA),
    tabelas: {
      workspaces: [PESSOAL, NORTE],
      workspace_memberships: [
        { workspace_id: PESSOAL.id, role: 'admin', user_id: BIA.id, active: true },
        { workspace_id: NORTE.id, role: papel, user_id: BIA.id, active: true },
      ],
    },
    rpcs: {
      bootstrap_personal_workspace: () => PESSOAL,
      list_owned_sender_accounts: () => [],
      ...rpcsDeAgentes(criarBancoDeAgentes()),
      list_agent_conversations: () => salvas,
      get_agent_conversation: () => conversa,
      get_agent_run_events: () => ({
        status: 'succeeded',
        error_code: null,
        events: [
          { seq: 0, kind: 'chamada', agent_id: 'agente-rhetor', payload: {} },
          PASSO,
          { seq: 2, kind: 'texto', agent_id: 'agente-rhetor', payload: { texto: 'Propus a Sequência; ela espera a sua Aprovação.' } },
        ],
      }),
      list_approvals: () => [proposta(estado, responsavel, extra), ...outras],
      decide_approval: (p) => {
        decisoes.push(p)
        estado = p.p_decision === 'aprovar' ? 'aprovada' : 'recusada'
        return estado
      },
    },
    funcoes: {
      'agent-conversation': (corpo) => {
        if (corpo.action === 'capability') return { status: 200, corpo: { available: true } }
        enviados.push(corpo)
        return { status: 202, corpo: { conversationId: 'conv-1', runId: 'run-1', status: 'queued' } }
      },
      'crm-handoff': () => (executores.push('crm-handoff'), { corpo: {} }),
      'integration-tools': () => (executores.push('integration-tools'), { corpo: {} }),
    },
  })
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={criarServicosDoNavegadorFalsos().servicos} />)
  return { usuario: userEvent.setup(), decisoes, enviados, executores }
}

async function pedirAoRhetor(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.type(await screen.findByRole('textbox', { name: 'Mensagem para Rhetor' }), 'Monte uma Sequência para a Alfa')
  await usuario.click(screen.getByRole('button', { name: 'Enviar' }))
  return screen.findByRole('article', { name: ACAO })
}

describe('A Sequência proposta pelo Rhetor na Conversa do Workspace operacional', () => {
  it('mostra a Conta-alvo, os Contatos e os passos, com o dia, o assunto, o corpo e as variáveis em destaque', async () => {
    const { usuario } = abrir('/agentes/agente-rhetor/conversa')
    const cartao = await pedirAoRhetor(usuario)

    expect(within(cartao).getByRole('link', { name: 'Alfa Engenharia' })).toHaveAttribute('href', '/contas/conta-alfa')
    expect(within(cartao).getByText('Maria Souza (Diretora), João Lima')).toBeInTheDocument()
    const passos = within(cartao).getByRole('list', { name: 'Passos propostos' })
    expect(within(passos).getAllByRole('listitem')).toHaveLength(3)
    expect(within(passos).getByText('E-mail 1 · dia útil 0')).toBeInTheDocument()
    expect(within(passos).getByText('E-mail 2 · dia útil 3 (3 dias úteis depois do anterior)')).toBeInTheDocument()
    expect(within(passos).getByText('E-mail 3 · dia útil 7 (4 dias úteis depois do anterior)')).toBeInTheDocument()
    const variaveis = [...cartao.querySelectorAll('[data-variavel]')].map((v) => v.textContent)
    expect(variaveis).toContain('{{primeiro_nome}}')
    expect(variaveis).toContain('{{remetente.nome}}')
  })

  it('o Vendedor responsável aprova no passo: a Sequência é criada sem envio, com o link para ela', async () => {
    const { usuario, decisoes, executores } = abrir('/agentes/agente-rhetor/conversa')
    const cartao = await pedirAoRhetor(usuario)
    expect(await within(cartao).findByText(/os e-mails só saem depois que você clicar em "Ativar envios"/)).toBeInTheDocument()

    await usuario.click(await within(cartao).findByRole('button', { name: 'Aprovar' }))

    expect(await within(cartao).findByText('Sequência criada, envios não ativados')).toBeInTheDocument()
    expect(decisoes).toEqual([{ p_approval_id: 'ap-seq', p_decision: 'aprovar', p_where: 'conversa' }])
    expect(within(cartao).getByRole('link', { name: /Ver a Sequência/ })).toHaveAttribute('href', '/sequencias/seq-alfa')
    // A Sequência proposta não passa por executor: aprovar já criou no banco, sem Envio.
    expect(executores).toEqual([])
  })

  it('o Vendedor responsável recusa, e nada é criado', async () => {
    const { usuario, decisoes } = abrir('/agentes/agente-rhetor/conversa')
    const cartao = await pedirAoRhetor(usuario)
    await usuario.click(await within(cartao).findByRole('button', { name: 'Recusar' }))

    expect(await within(cartao).findByText('Recusada · nada foi criado')).toBeInTheDocument()
    expect(decisoes).toEqual([{ p_approval_id: 'ap-seq', p_decision: 'recusar', p_where: 'conversa' }])
  })

  it('a Administradora que não é a responsável vê a proposta sem o assunto e o corpo, e não decide', async () => {
    const { usuario, decisoes } = abrir('/agentes/agente-rhetor/conversa', { papel: 'admin', responsavel: false })
    const cartao = await pedirAoRhetor(usuario)

    expect(await within(cartao).findByText('Só o Vendedor responsável pela Conta-alvo decide esta Sequência.')).toBeInTheDocument()
    expect(within(cartao).queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument()
    expect(within(cartao).getByText('2 Contatos')).toBeInTheDocument()
    expect(within(cartao).getByText(/só o Vendedor responsável pela Conta-alvo vê/)).toBeInTheDocument()
    expect(cartao).not.toHaveTextContent('vi as vagas na')
    expect(cartao).not.toHaveTextContent('Maria Souza')
    expect(decisoes).toEqual([])
  })

  it('depois de recarregar, a Conversa mostra a Sequência criada, sem reenviar o pedido', async () => {
    const { enviados } = abrir('/conversa', {
      estadoInicial: 'aprovada',
      salvas: [{ id: 'conv-1', kind: 'coordenada', agent_id: null }],
      conversa: {
        runs: [{
          id: 'run-0',
          request_text: 'Monte uma Sequência para a Alfa',
          status: 'succeeded',
          events: [
            { seq: 0, kind: 'chamada', agent_id: 'agente-rhetor', payload: {} },
            PASSO,
            { seq: 2, kind: 'feito', agent_id: 'agente-rhetor', payload: { texto: 'Propus a Sequência.' } },
            { seq: 3, kind: 'resposta', agent_id: null, payload: { texto: 'O Rhetor propôs a Sequência da Alfa.' } },
          ],
        }],
      },
    })

    const cartao = await screen.findByRole('article', { name: ACAO })
    expect(await within(cartao).findByText('Sequência criada, envios não ativados')).toBeInTheDocument()
    expect(within(cartao).getByRole('link', { name: /Ver a Sequência/ })).toHaveAttribute('href', '/sequencias/seq-alfa')
    expect(within(cartao).queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument()
    expect(enviados).toEqual([])
  })

  it('a recusa do sistema mostra o motivo', async () => {
    abrir('/aprovacoes', { estadoInicial: 'recusada', extra: { failure: 'a Conta-alvo já tem uma Sequência em andamento' } })
    const cartao = await screen.findByRole('article', { name: ACAO })
    expect(within(cartao).getByText(
      'Recusada pelo sistema · a Conta-alvo já tem uma Sequência em andamento. Nada foi criado.',
    )).toBeInTheDocument()
  })
})

describe('A Sequência proposta na fila de Aprovações', () => {
  const ENVIO = {
    id: 'ap-envio', agent_id: 'agente-rhetor', integration_id: 'hubspot', action: 'Enviar a Beta ao HubSpot',
    impact: 'Cria a empresa no HubSpot.', justification: 'Reunião marcada.',
    payload: { tipo: 'envio_ao_crm' }, target_account_id: 'conta-beta', state: 'pendente', failure: null,
  }

  it('o filtro "Sequência" mostra só as Sequências propostas', async () => {
    const { usuario } = abrir('/aprovacoes', { outras: [ENVIO] })
    await screen.findByRole('article', { name: ACAO })
    expect(screen.getByRole('article', { name: 'Enviar a Beta ao HubSpot' })).toBeInTheDocument()

    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Tipo' }), 'Sequência')

    expect(screen.getByRole('article', { name: ACAO })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Enviar a Beta ao HubSpot' })).not.toBeInTheDocument()
  })

  it('o Vendedor responsável aprova pela fila', async () => {
    const { usuario, decisoes } = abrir('/aprovacoes')
    const cartao = await screen.findByRole('article', { name: ACAO })
    await usuario.click(await within(cartao).findByRole('button', { name: 'Aprovar' }))
    await waitFor(() => expect(decisoes).toEqual([{ p_approval_id: 'ap-seq', p_decision: 'aprovar', p_where: 'fila' }]))
    expect(await within(cartao).findByText('Sequência criada, envios não ativados')).toBeInTheDocument()
  })

  it('o cartão não mostra dólar, a palavra CRM nem a letra de um nicho', async () => {
    abrir('/aprovacoes')
    const cartao = await screen.findByRole('article', { name: ACAO })
    expect(cartao.textContent).not.toMatch(/US\$|\bCRM\b|\bnicho [A-H]\b|\bICP [A-H]\b|Teto/i)
  })
})

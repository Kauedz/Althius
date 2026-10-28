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
  origin: 'althius' | 'slack' | 'whatsapp'
}

const agora = new Date().toISOString()
const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

const SALVAS: Linha[] = [
  {
    id: 'c-slack',
    kind: 'agente',
    agent_id: 'agente-scopus',
    title: null,
    first_request: 'Quem são as Contas Quentes?',
    updated_at: agora,
    open_run_id: null,
    origin: 'slack',
  },
  {
    id: 'c-whatsapp',
    kind: 'coordenada',
    agent_id: null,
    title: null,
    first_request: 'Quantos Créditos temos?',
    updated_at: agora,
    open_run_id: null,
    origin: 'whatsapp',
  },
  {
    id: 'c-althius',
    kind: 'coordenada',
    agent_id: null,
    title: 'ICP da Norte',
    first_request: 'Montem o ICP',
    updated_at: ontem,
    open_run_id: null,
    origin: 'althius',
  },
]

const CONVERSAS: Record<string, unknown> = {
  'c-slack': {
    id: 'c-slack',
    kind: 'agente',
    agent_id: 'agente-scopus',
    origin: 'slack',
    runs: [{
      id: 'run-0',
      request_text: 'Quem são as Contas Quentes?',
      status: 'succeeded',
      events: [{ seq: 1, kind: 'texto', agent_id: 'agente-scopus', payload: { texto: 'São três: Norte, Sul e Leste.' } }],
    }],
  },
  'c-whatsapp': {
    id: 'c-whatsapp',
    kind: 'coordenada',
    agent_id: null,
    origin: 'whatsapp',
    runs: [{
      id: 'run-whatsapp',
      request_text: 'Quantos Créditos temos?',
      status: 'succeeded',
      events: [{ seq: 1, kind: 'resposta', agent_id: null, payload: { texto: 'Temos 42 Créditos.' } }],
    }],
  },
}

/** A Marina abre o Norte, onde já mencionou o Scopus num thread do Slack. */
function abrir(rota: string) {
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
      list_agent_conversations: () => SALVAS.map(({ id, kind, agent_id, origin }) => ({ id, kind, agent_id, origin })),
      list_agent_conversations_of_agent: (parametros) =>
        SALVAS
          .filter((c) => (
            parametros.p_agent_id == null
              ? c.kind === 'coordenada' || c.origin === 'slack'
              : c.agent_id === parametros.p_agent_id
          ))
          .map((c) => ({ ...c, named: c.title !== null })),
      get_agent_conversation: (parametros) => CONVERSAS[String(parametros.p_conversation_id)] ?? { runs: [] },
      get_agent_run_events: () => ({ status: 'succeeded', error_code: null, events: [] }),
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
  return { usuario, enviados }
}

describe('A Conversa do Slack na Althius', () => {
  it('aparece nas Conversas recentes com a marca do Slack; a da Althius fica sem marca', async () => {
    abrir('/')

    const lista = within(await screen.findByRole('region', { name: 'Recentes' }))
    const linhas = lista.getAllByRole('listitem')
    const doSlack = linhas.find((linha) => within(linha).queryByText('Slack'))!
    const doWhatsApp = linhas.find((linha) => within(linha).queryByText('WhatsApp'))!
    const daAlthius = linhas.find((linha) => within(linha).queryByText('ICP da Norte'))!
    expect(within(doSlack).getByText('Quem são as Contas Quentes?')).toBeInTheDocument()
    expect(within(doSlack).getByText('Slack')).toBeInTheDocument()
    expect(within(doWhatsApp).getByText('Quantos Créditos temos?')).toBeInTheDocument()
    expect(within(doWhatsApp).getByText('WhatsApp')).toBeInTheDocument()
    expect(within(daAlthius).getByText('ICP da Norte')).toBeInTheDocument()
    expect(within(daAlthius).queryByText('Slack')).not.toBeInTheDocument()
  })

  it('abrir mostra os passos na Conversa do Agente, com o composer desabilitado', async () => {
    const { usuario, enviados } = abrir('/')

    await usuario.click(await screen.findByRole('button', { name: /^Quem são as Contas Quentes/ }))

    const leitura = await screen.findByRole('region', { name: 'Conversa do Slack' })
    // Os passos chegam depois da região: espera por eles em vez de ler na hora (o teste falhava às vezes no CI).
    expect(await within(leitura).findByText('São três: Norte, Sul e Leste.')).toBeInTheDocument()
    expect(within(leitura).getByText('Quem são as Contas Quentes?')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Scopus' })).toBeInTheDocument()
    expect(within(leitura).getByText('Slack')).toBeInTheDocument()
    expect(within(leitura).getByText('Esta Conversa continua no Slack')).toBeInTheDocument()
    expect(within(leitura).getByRole('textbox', { name: 'Mensagem para Scopus' })).toBeDisabled()
    expect(within(leitura).getByRole('button', { name: 'Enviar' })).toBeDisabled()
    expect(enviados).toEqual([])
  })

  // Sinais first 10: a Conversa da Althius com o Agente ficou só leitura; voltar leva a ela, sem composer nem sugestões.
  it('voltar leva à Conversa da Althius com o Agente, agora só para leitura', async () => {
    const { usuario } = abrir('/agentes/agente-scopus/conversa?slack=c-slack')

    const leitura = await screen.findByRole('region', { name: 'Conversa do Slack' })
    // Os passos chegam depois da região: espera por eles em vez de ler na hora (o teste falhava às vezes no CI).
    expect(await within(leitura).findByText('São três: Norte, Sul e Leste.')).toBeInTheDocument()
    await usuario.click(screen.getByRole('link', { name: 'Voltar à Conversa na Althius' }))

    expect(screen.queryByRole('region', { name: 'Conversa do Slack' })).not.toBeInTheDocument()
    expect(screen.queryByText('Esta Conversa continua no Slack')).not.toBeInTheDocument()
    expect(await screen.findByText(/Este Agente foi retirado do produto/)).toBeInTheDocument()
    expect(window.location.search).toBe('')
    expect(screen.queryByRole('textbox', { name: 'Mensagem para Scopus' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pontue a aderência da Alfa ao nosso ICP' })).not.toBeInTheDocument()
  })

  it('uma Conversa que não é deste Agente não abre aqui', async () => {
    abrir('/agentes/agente-ethos/conversa?slack=c-slack')

    expect(await screen.findByText('Esta Conversa do Slack é de outro Agente.')).toBeInTheDocument()
    expect(screen.queryByText('São três: Norte, Sul e Leste.')).not.toBeInTheDocument()
  })

  it('a Conversa do WhatsApp aparece com origem e abre somente para leitura', async () => {
    const { usuario } = abrir('/')
    await usuario.click(await screen.findByRole('button', { name: /^Quantos Créditos temos/ }))

    expect(await screen.findByRole('heading', { name: 'Conversa do WhatsApp' })).toBeInTheDocument()
    expect(await screen.findByText('Temos 42 Créditos.')).toBeInTheDocument()
    expect(screen.getByText('WhatsApp')).toBeInTheDocument()
    expect(screen.getByText('Esta Conversa é somente leitura. Continue pelo WhatsApp.')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enviar' })).not.toBeInTheDocument()
  })
})

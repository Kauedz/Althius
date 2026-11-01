import { cleanup, createEvent, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

export const linha = (extra: Partial<Linha> & Pick<Linha, 'id'>): Linha => ({
  kind: 'coordenada',
  agent_id: null,
  title: null,
  first_request: 'Montem o ICP e as Personas',
  updated_at: '2026-09-30T12:00:00Z',
  open_run_id: null,
  ...extra,
})

export const conversaSalvaDoAgente = (pedido: string, resposta: string) => ({
  runs: [{
    id: 'run-0',
    request_text: pedido,
    status: 'succeeded',
    events: [{ seq: 1, kind: 'texto', agent_id: 'agente-scopus', payload: { texto: resposta } }],
  }],
})

/** A Marina abre o Norte, que já tem Conversas salvas; o banco falso guarda os nomes que ela der. */
function abrir(rota: string, salvas: Linha[], conversas: Record<string, unknown> = {}, pendente = false) {
  const subidos: string[] = []
  const acoes: Record<string, unknown>[] = []
  const cancelados: unknown[] = []
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
      get_agent_run_events: () => (pendente ? { status: 'running', error_code: null, events: [] } : { status: 'succeeded', error_code: null, events: [] }),
      archive_agent_conversation: (parametros) => {
        const indice = salvas.findIndex((c) => c.id === parametros.p_conversation_id)
        if (indice >= 0) salvas.splice(indice, 1)
        return null
      },
      agent_prompt_suggestions: () => [],
      cancel_agent_run: (parametros) => {
        cancelados.push(parametros.p_run_id)
        return true
      },
    },
    funcoes: {
      'agent-attachments': (corpo) => {
        if (corpo instanceof FormData) {
          const arquivo = corpo.get('file') as File
          subidos.push(arquivo.name)
          const imagem = arquivo.type.startsWith('image/')
          return { status: 201, corpo: { id: `anexo-${subidos.length}`, tipo: imagem ? 'imagem' : 'arquivo', mime: arquivo.type, tamanho: arquivo.size } }
        }
        acoes.push(corpo)
        return { status: 200, corpo: corpo.action === 'url' ? { url: 'https://assinada.test/x', expiresIn: 300 } : { removed: true } }
      },
      'agent-conversation': (corpo) => {
        if (corpo.action === 'capability') return { status: 200, corpo: { available: true } }
        if (pendente) {
          enviados.push(corpo)
          return { status: 202, corpo: { conversationId: 'nova', runId: 'run-aberto', status: 'queued' } }
        }
        enviados.push(corpo)
        return { status: 202, corpo: { conversationId: corpo.conversationId ?? 'nova', runId: 'run-1', status: 'queued' } }
      },
    },
  })
  const servicos = criarServicosDoNavegadorFalsos()
  const usuario = userEvent.setup()
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={servicos.servicos} />)
  return { usuario, renomeadas, enviados, subidos, acoes, cancelados }
}

const ROTA = '/agentes/agente-scopus/conversa'
const arquivo = (nome: string, tipo: string, tamanho = 10) => new File([new Uint8Array(tamanho)], nome, { type: tipo })

describe('Composer com anexos', () => {
  it('anexa pelo +, remove pelo x e envia os anexos prontos com o pedido', async () => {
    const { usuario, enviados, subidos, acoes } = abrir(ROTA, [])
    const composer = await screen.findByRole('form', { name: 'Conversa com Scopus' })
    await usuario.click(await within(composer).findByRole('button', { name: 'Anexar' }))
    expect(within(composer).getByRole('menuitem', { name: 'Anexar imagem' })).toBeInTheDocument()
    await usuario.upload(within(composer).getByLabelText('Escolher arquivos'), [arquivo('proposta.pdf', 'application/pdf'), arquivo('dados.csv', 'text/csv')])
    await usuario.click(await within(composer).findByRole('button', { name: 'Remover dados.csv' }))
    expect(within(composer).queryByText('dados.csv')).not.toBeInTheDocument()
    await vi.waitFor(() => expect(acoes).toContainEqual({ action: 'remove', attachmentId: 'anexo-2' }))
    expect(subidos).toEqual(['proposta.pdf', 'dados.csv'])

    await usuario.type(within(composer).getByRole('textbox', { name: 'Mensagem para Scopus' }), 'Leia a proposta')
    await usuario.click(within(composer).getByRole('button', { name: 'Enviar' }))
    await within(screen.getByRole('region', { name: 'Conversa' })).findByText('Leia a proposta')
    expect(enviados.at(-1)).toEqual(expect.objectContaining({ text: 'Leia a proposta', attachments: ['anexo-1'] }))
    expect(screen.getByRole('button', { name: 'Abrir o anexo proposta.pdf' })).toBeInTheDocument()
  })

  it('recusa tipo fora da lista; arrastar e colar anexam', async () => {
    const { subidos } = abrir(ROTA, [])
    const composer = await screen.findByRole('form', { name: 'Conversa com Scopus' })
    await within(composer).findByRole('button', { name: 'Anexar' })
    fireEvent.drop(composer, { dataTransfer: { files: [arquivo('video.mp4', 'video/mp4')], types: ['Files'] } })
    expect(await within(composer).findByRole('alert')).toHaveTextContent('só imagens')
    fireEvent.drop(composer, { dataTransfer: { files: [arquivo('planilha.xlsx', '')], types: ['Files'] } })
    const campo = within(composer).getByRole('textbox', { name: 'Mensagem para Scopus' })
    const colar = createEvent.paste(campo)
    Object.defineProperty(colar, 'clipboardData', { value: { files: [arquivo('print.png', 'image/png')] } })
    fireEvent(campo, colar)
    await vi.waitFor(() => expect(subidos).toEqual(['planilha.xlsx', 'print.png']))
  })

  it('enquanto o Agente responde, o Enviar vira Parar e para o pedido', async () => {
    const { usuario, cancelados } = abrir(ROTA, [], {}, true)
    const composer = await screen.findByRole('form', { name: 'Conversa com Scopus' })
    await usuario.type(within(composer).getByRole('textbox', { name: 'Mensagem para Scopus' }), 'Demora')
    await usuario.click(within(composer).getByRole('button', { name: 'Enviar' }))
    await usuario.click(await within(composer).findByRole('button', { name: 'Parar' }))
    await vi.waitFor(() => expect(cancelados).toEqual(['run-aberto']))
  })
})

import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RaizDoAplicativo } from '@/raiz'
import { renderizarApp } from '@/test/renderizar'
import { criarBancoDeAgentes, rpcsDeAgentes } from '@/test/agentes-no-banco'
import { criarBancoDeConexoes, rpcsDeConexoes } from '@/test/conexoes-no-banco'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'

// C3: o titular vê, no detalhe, as respostas de WhatsApp e de LinkedIn junto com a de e-mail.

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
const WORKSPACE_PESSOAL = { id: 'ws-pessoal-marina', kind: 'pessoal', name: 'Marina Souza', owner_user_id: MARINA.id }
const CORPO_EMAIL = 'Podemos falar amanhã por e-mail?'
const CORPO_WHATSAPP = 'Pode ser amanhã no WhatsApp.'
const CORPO_LINKEDIN = 'Vi seu perfil no LinkedIn.'

afterEach(() => {
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
  localStorage.clear()
})

function participacao(workspaceId: string) {
  return { workspace_id: workspaceId, role: 'admin', user_id: MARINA.id, active: true }
}

function respostasDeChat() {
  return [
    {
      interaction_id: 'inter-li', sequence_id: 'sequencia-da-marina', send_id: 'envio-li', contact_id: 'contato-2',
      channel: 'linkedin', from_id: 'joao-lima', from_name: 'João Lima', body: CORPO_LINKEDIN,
      attachments_count: 2, received_at: '2026-09-26T17:00:00Z',
    },
    {
      interaction_id: 'inter-wa', sequence_id: 'sequencia-da-marina', send_id: 'envio-wa', contact_id: 'contato-1',
      channel: 'whatsapp', from_id: '5511988887777@s.whatsapp.net', from_name: 'Maria Souza',
      body: CORPO_WHATSAPP, attachments_count: 0, received_at: '2026-09-26T16:00:00Z',
    },
  ]
}

function respostaDeEmail() {
  return [{
    interaction_id: 'inter-email', sequence_id: 'sequencia-da-marina', send_id: 'envio-email', contact_id: 'contato-1',
    from_email: 'maria@empresa-alvo.test', from_name: 'Maria Souza', subject: 'Re: Olá', body: CORPO_EMAIL,
    received_at: '2026-09-26T15:00:00Z', attachments: [],
  }]
}

function abrir({ titular = true }: { titular?: boolean } = {}) {
  window.history.replaceState(null, '', '/sequencias/sequencia-da-marina')
  localStorage.setItem('althius:modo_demo', 'false')
  sessionStorage.setItem('althius:workspace', 'ws-norte')
  const sequencia = {
    id: 'sequencia-da-marina',
    workspace_id: 'ws-norte',
    target_account_id: 'conta-do-norte',
    owner_user_id: titular ? MARINA.id : 'usuario-outro-vendedor',
    status: 'pausada',
    public_summary: { totalParticipantes: 1, totalSteps: 1, passoAtual: 0 },
    created_at: '2026-09-20T12:00:00Z',
    updated_at: '2026-09-21T12:00:00Z',
  }
  const documento = {
    participantesIds: ['contato-1'],
    steps: [{
      id: 'passo-1', ordem: 1, canal: 'email', contatoId: 'contato-1', delayDiasUteis: 0,
      titulo: 'Primeiro contato', assunto: 'Olá', corpo: 'Oi, Maria.', modoEmail: 'auto',
    }],
    motivoPause: 'Contato respondeu',
  }
  const chamadasDeChat: unknown[] = []
  const tabelas: Record<string, Record<string, unknown>[]> = {
    workspace_memberships: [participacao('ws-norte')],
    sequences: [sequencia],
    target_accounts: [{
      id: 'conta-do-norte', workspace_id: 'ws-norte', name: 'Norte', domain: 'norte.test',
      canonical_url: 'https://norte.test', archived_at: null,
    }],
    target_contacts: [
      {
        id: 'contato-1', workspace_id: 'ws-norte', target_account_id: 'conta-do-norte', name: 'Maria Souza',
        role: null, email: 'maria@empresa-alvo.test', whatsapp: '+5511988887777', linkedin: null, last_interaction_at: null,
      },
      {
        id: 'contato-2', workspace_id: 'ws-norte', target_account_id: 'conta-do-norte', name: 'João Lima',
        role: null, email: null, whatsapp: null, linkedin: 'https://www.linkedin.com/in/joao-lima', last_interaction_at: null,
      },
    ],
  }
  const supabase = criarSupabaseFalso({
    sessao: sessaoDe(MARINA),
    tabelas,
    rpcs: {
      bootstrap_personal_workspace: () => {
        const workspaces = (tabelas.workspaces ??= [])
        if (!workspaces.some((w) => w.id === WORKSPACE_PESSOAL.id)) workspaces.push(WORKSPACE_PESSOAL)
        if (!tabelas.workspace_memberships.some((p) => p.workspace_id === WORKSPACE_PESSOAL.id)) {
          tabelas.workspace_memberships.push(participacao(WORKSPACE_PESSOAL.id))
        }
        return WORKSPACE_PESSOAL
      },
      ...rpcsDeAgentes(criarBancoDeAgentes()),
      ...rpcsDeConexoes(criarBancoDeConexoes()),
      get_owned_sequence: () => [{ ...sequencia, public_summary: { ...sequencia.public_summary, _document: documento } }],
      list_sequence_step_sends: () => [],
      get_sequence_authorization: () => [],
      list_enabled_chat_channels: () => [],
      list_received_emails: () => respostaDeEmail(),
      list_received_chat_messages: (parametros) => {
        chamadasDeChat.push(parametros)
        return respostasDeChat()
      },
    },
  })
  const { servicos } = criarServicosDoNavegadorFalsos()
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={servicos} />)
  return { chamadasDeChat }
}

describe('O titular vê as respostas de WhatsApp e LinkedIn', () => {
  it('no detalhe, o titular distingue WhatsApp de LinkedIn e a resposta de e-mail continua', async () => {
    abrir()

    const respostas = await screen.findByRole('region', { name: 'Respostas recebidas' })
    expect(within(respostas).getByText('WhatsApp')).toBeInTheDocument()
    expect(within(respostas).getByText(CORPO_WHATSAPP)).toBeInTheDocument()
    expect(within(respostas).getByText('LinkedIn')).toBeInTheDocument()
    expect(within(respostas).getByText(CORPO_LINKEDIN)).toBeInTheDocument()
    expect(within(respostas).getByText('João Lima')).toBeInTheDocument()
    expect(within(respostas).getAllByText('Maria Souza')).toHaveLength(2)
    expect(within(respostas).getByText('Re: Olá')).toBeInTheDocument()
    expect(within(respostas).getByText(CORPO_EMAIL)).toBeInTheDocument()
    expect(within(respostas).getAllByText(/26 de setembro de 2026/)).toHaveLength(3)
    expect(within(respostas).getByText('2 anexos')).toBeInTheDocument()
    expect(within(respostas).queryByRole('button', { name: /Baixar|Abrir/ })).not.toBeInTheDocument()
  })

  it('outro participante não vê o corpo das respostas de chat nem o de e-mail', async () => {
    const { chamadasDeChat } = abrir({ titular: false })

    expect(await screen.findByText('Pausada')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Respostas recebidas' })).not.toBeInTheDocument()
    expect(screen.queryByText(CORPO_WHATSAPP)).not.toBeInTheDocument()
    expect(screen.queryByText(CORPO_LINKEDIN)).not.toBeInTheDocument()
    expect(screen.queryByText(CORPO_EMAIL)).not.toBeInTheDocument()
    expect(chamadasDeChat).toEqual([])
  })

  it('a Demonstração não mostra essas respostas como se fossem reais', async () => {
    renderizarApp('/sequencias/sequencia-openai')

    expect(await screen.findByText('WhatsApp com print')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Respostas recebidas' })).not.toBeInTheDocument()
    expect(screen.queryByText(CORPO_WHATSAPP)).not.toBeInTheDocument()
    expect(screen.queryByText(CORPO_LINKEDIN)).not.toBeInTheDocument()
    expect(screen.queryByText(CORPO_EMAIL)).not.toBeInTheDocument()
  })
})

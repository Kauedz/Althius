import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { RaizDoAplicativo } from '@/raiz'
import { criarBancoDeAgentes, rpcsDeAgentes } from '@/test/agentes-no-banco'
import { criarBancoDeConexoes, rpcsDeConexoes } from '@/test/conexoes-no-banco'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'
import { criarFonteDeSequenciasSupabase } from '@/fonte/supabase-sequencias'

// A Sequência pausada porque a Conta remetente do responsável caiu (canais-11).

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
const WORKSPACE_PESSOAL = { id: 'ws-pessoal-marina', kind: 'pessoal', name: 'Marina Souza', owner_user_id: MARINA.id }
const MOTIVO = 'Conta remetente de E-mail desconectada. Reconecte a conta e retome a Sequência'

afterEach(() => {
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
})

function participacao(workspaceId: string) {
  return { workspace_id: workspaceId, role: 'admin', user_id: MARINA.id, active: true }
}

function linha(dono = MARINA.id) {
  return {
    id: 'sequencia-da-conta',
    workspace_id: 'ws-norte',
    target_account_id: 'conta-do-norte',
    owner_user_id: dono,
    status: 'pausada',
    public_summary: { totalParticipantes: 1, totalSteps: 1, passoAtual: 0 },
    created_at: '2026-09-20T12:00:00Z',
    updated_at: '2026-09-21T12:00:00Z',
  }
}

function abrir({ dono = MARINA.id, pausas = true }: { dono?: string; pausas?: boolean } = {}) {
  window.history.replaceState(null, '', '/sequencias/sequencia-da-conta')
  localStorage.setItem('althius:modo_demo', 'false')
  sessionStorage.setItem('althius:workspace', 'ws-norte')
  const sequencia = linha(dono)
  const atualizacoes: Record<string, unknown>[] = []
  const documento = {
    participantesIds: ['contato-1'],
    motivoPause: MOTIVO,
    steps: [{ id: 'passo-1', ordem: 1, canal: 'email', contatoId: 'contato-1', delayDiasUteis: 0, titulo: 'Primeiro contato', assunto: 'Olá', corpo: 'Oi!' }],
  }
  const tabelas: Record<string, Record<string, unknown>[]> = {
    workspace_memberships: [participacao('ws-norte')],
    sequences: [sequencia],
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
      update_owned_sequence: (parametros) => {
        atualizacoes.push(parametros)
        return null
      },
      list_sequence_step_sends: () => [],
      list_received_emails: () => [],
      get_sequence_authorization: () => [],
      ...(pausas ? { list_sequence_sender_holds: () => [{ sequence_id: 'sequencia-da-conta', channel: 'email' }] } : {}),
    },
  })
  const { servicos } = criarServicosDoNavegadorFalsos()
  const usuario = userEvent.setup()
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={servicos} />)
  return { usuario, atualizacoes, cliente: supabase.cliente }
}

describe('Sequência pausada pela Conta remetente (canais-11)', () => {
  it('a responsável lê o motivo honesto, vê Reconectar e só ela retoma', async () => {
    const { usuario, atualizacoes } = abrir()

    expect(await screen.findByText(new RegExp(`Sequência pausada: ${MOTIVO}`))).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Reconectar' })).toHaveAttribute('href', '/conexoes')

    await usuario.click(screen.getByRole('button', { name: 'Retomar' }))
    await waitFor(() => expect(atualizacoes.at(-1)?.p_status).toBe('ativa'))
    const documento = atualizacoes.at(-1)?.p_private_document as Record<string, unknown> | undefined
    expect(documento).toBeDefined()
    expect(documento?.motivoPause).toBeUndefined()
  })

  it('quem não é o responsável lê só que a conta remetente dele caiu, e não "Contato respondeu"', async () => {
    abrir({ dono: 'usuario-outro-vendedor' })
    expect(await screen.findByText('Pausada: conta remetente do responsável desconectada')).toBeInTheDocument()
    expect(screen.queryByText('Contato respondeu; sequência pausada')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Reconectar' })).not.toBeInTheDocument()
  })

  it('sem a leitura das pausas (backend antigo ou falha), a tela segue como antes, sem inventar o motivo', async () => {
    const { cliente } = criarSupabaseFalso({
      sessao: sessaoDe(MARINA),
      tabelas: { sequences: [linha('usuario-outro-vendedor')] },
    })
    const fonte = criarFonteDeSequenciasSupabase(cliente, () => 'ws-norte', () => MARINA.id)
    const sequencia = await fonte.sequencia('sequencia-da-conta')
    expect(sequencia.pausadaPelaContaRemetente).toBeUndefined()
    expect(sequencia.motivoPause).toBeUndefined()
  })

  it('a lista das Sequências diz, para quem não é o responsável, que a conta remetente caiu', async () => {
    const { cliente } = criarSupabaseFalso({
      sessao: sessaoDe(MARINA),
      tabelas: { sequences: [linha('usuario-outro-vendedor')] },
      rpcs: { list_sequence_sender_holds: () => [{ sequence_id: 'sequencia-da-conta', channel: 'whatsapp' }] },
    })
    const fonte = criarFonteDeSequenciasSupabase(cliente, () => 'ws-norte', () => MARINA.id)
    const [sequencia] = await fonte.sequencias()
    expect(sequencia.pausadaPelaContaRemetente).toBe('whatsapp')
    expect(sequencia.motivoPause).toBe('Conta remetente de WhatsApp desconectada')
  })
})

// A Aderência que o Scopus propõe no Workspace operacional (kanban-de-prospeccao 08): a fila mostra a Conta-alvo, Fit ou
// Não fit e o motivo, com Aprovar e Recusar só para o Vendedor responsável. Aprovar não chama executor nenhum: o banco já
// gravou a Aderência. A fila filtra por Aderência, e quem lê só Aprovações (o Canal) não recebe a proposta.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { criarFonteDeAprovacoesSupabase } from '@/fonte/supabase-aprovacoes'
import { RaizDoAplicativo } from '@/raiz'
import { criarBancoDeAgentes, rpcsDeAgentes } from '@/test/agentes-no-banco'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'

const BIA = { id: 'usuario-bia', email: 'bia@cliente.com.br' }
const PESSOAL = { id: 'ws-pessoal-bia', kind: 'pessoal', name: 'Bia Lima', owner_user_id: BIA.id }
const NORTE = { id: 'ws-norte', kind: 'empresa', name: 'Norte' }
const ACAO = 'Aderência Não fit para Alfa Engenharia'

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
})

/** A proposta como `list_approvals` a devolve: o payload, que todo Participante lê, traz a Aderência e o motivo. */
function proposta(state: string, responsavel: boolean, extra: Record<string, unknown> = {}) {
  return {
    id: 'ap-fit',
    agent_id: 'agente-scopus',
    integration_id: null,
    action: ACAO,
    impact: 'Aprovar grava Não fit na Conta-alvo e leva o cartão a Descartada. Recusar não muda nada.',
    justification: 'Só atende o setor público',
    payload: { tipo: 'aderencia', conta: 'Alfa Engenharia', aderencia: 'nao_fit', motivo: 'Só atende o setor público' },
    target_account_id: 'conta-alfa',
    state,
    failure: null,
    category: 'aderencia',
    responsible_seller: responsavel,
    ...extra,
  }
}

const ENVIO = {
  id: 'ap-envio', agent_id: 'agente-scopus', integration_id: 'hubspot', action: 'Enviar a Beta ao HubSpot',
  impact: 'Cria no HubSpot a empresa.', justification: '', payload: { tipo: 'envio_ao_crm' },
  target_account_id: null, state: 'pendente', failure: null,
}

function abrir({ responsavel = true, papel = 'member' as 'admin' | 'member', extra = {} as Record<string, unknown> } = {}) {
  localStorage.setItem('althius:modo_demo', 'false')
  sessionStorage.setItem('althius:workspace', NORTE.id)
  window.history.replaceState(null, '', '/aprovacoes')
  let estado = 'pendente'
  const decisoes: Record<string, unknown>[] = []
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
      list_approvals: () => [proposta(estado, responsavel, extra), ENVIO],
      decide_approval: (p) => {
        decisoes.push(p)
        estado = p.p_decision === 'aprovar' ? 'aprovada' : 'recusada'
        return estado
      },
    },
    funcoes: {
      'agent-conversation': () => ({ status: 200, corpo: { available: true } }),
      'crm-handoff': () => (executores.push('crm-handoff'), { corpo: {} }),
      'integration-tools': () => (executores.push('integration-tools'), { corpo: {} }),
    },
  })
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={criarServicosDoNavegadorFalsos().servicos} />)
  return { usuario: userEvent.setup(), decisoes, executores }
}

describe('A Aderência proposta pelo Scopus na fila do Workspace operacional', () => {
  it('mostra a Conta-alvo, a Aderência e o motivo', async () => {
    abrir()
    const cartao = await screen.findByRole('article', { name: ACAO })
    expect(within(cartao).getByRole('link', { name: 'Alfa Engenharia' })).toHaveAttribute('href', '/contas/conta-alfa')
    expect(cartao).toHaveTextContent('Não fit')
    expect(cartao).toHaveTextContent('Só atende o setor público')
    expect(cartao).toHaveTextContent('leva o cartão a Descartada')
  })

  it('o Vendedor responsável aprova pela fila, e nenhum executor é chamado', async () => {
    const { usuario, decisoes, executores } = abrir()
    const cartao = await screen.findByRole('article', { name: ACAO })
    await usuario.click(await within(cartao).findByRole('button', { name: 'Aprovar' }))
    await waitFor(() => expect(decisoes).toEqual([{ p_approval_id: 'ap-fit', p_decision: 'aprovar', p_where: 'fila' }]))
    expect(await within(cartao).findByText('Não fit gravado na Conta-alvo')).toBeInTheDocument()
    expect(executores).toEqual([])
  })

  it('o Vendedor responsável recusa, e nada é gravado', async () => {
    const { usuario, decisoes } = abrir()
    const cartao = await screen.findByRole('article', { name: ACAO })
    await usuario.click(await within(cartao).findByRole('button', { name: 'Recusar' }))
    await waitFor(() => expect(decisoes).toEqual([{ p_approval_id: 'ap-fit', p_decision: 'recusar', p_where: 'fila' }]))
    expect(await within(cartao).findByText('Recusada · nada foi gravado')).toBeInTheDocument()
  })

  it('a Administradora que não é a responsável lê a proposta e não decide', async () => {
    abrir({ responsavel: false, papel: 'admin' })
    const cartao = await screen.findByRole('article', { name: ACAO })
    expect(await within(cartao).findByText('Só o Vendedor responsável pela Conta-alvo decide esta Aderência.')).toBeInTheDocument()
    expect(within(cartao).queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument()
  })

  it('a recusa do sistema mostra o motivo', async () => {
    abrir({ extra: { state: 'recusada', failure: 'a Conta-alvo não existe mais' } })
    const cartao = await screen.findByRole('article', { name: ACAO })
    expect(cartao).toHaveTextContent('Recusada pelo sistema · a Conta-alvo não existe mais. Nada foi gravado.')
  })

  it('o filtro "Aderência" mostra só as Aderências propostas', async () => {
    const { usuario } = abrir()
    await screen.findByRole('article', { name: ACAO })
    expect(screen.getByRole('article', { name: 'Enviar a Beta ao HubSpot' })).toBeInTheDocument()

    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Tipo' }), 'Aderência')

    expect(screen.getByRole('article', { name: ACAO })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Enviar a Beta ao HubSpot' })).not.toBeInTheDocument()
  })

  it('quem lê só Aprovações (o Canal, o Playbook) não recebe a Aderência proposta', async () => {
    const { cliente } = criarSupabaseFalso({
      sessao: sessaoDe(BIA),
      tabelas: {},
      rpcs: { list_approvals: () => [proposta('pendente', true), ENVIO] },
    })
    const f = criarFonteDeAprovacoesSupabase(cliente, 'ws-norte')
    expect((await f.aprovacoes()).map((a) => a.id)).toEqual(['ap-envio'])
    expect((await f.filaDeAprovacoes()).map((a) => [a.id, a.tipo])).toEqual([['ap-fit', 'aderencia'], ['ap-envio', 'envio']])
  })
})

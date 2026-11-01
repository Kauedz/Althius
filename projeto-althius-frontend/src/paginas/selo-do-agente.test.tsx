// O selo do Agente não promete conversa que o Workspace não tem: com as Conversas indisponíveis, o Agente ocioso diz
// "Sem conversas no momento" na grade, na página dele e na barra lateral; com elas disponíveis, diz "Disponível".
import { cleanup, render, screen, within } from '@testing-library/react'
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

/** A Marina abre o Norte na `rota`; a capability das Conversas responde `conversasDisponiveis`. */
function abrir(rota: string, conversasDisponiveis: boolean) {
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
    },
    funcoes: {
      'agent-conversation': () => ({ status: 200, corpo: { available: conversasDisponiveis } }),
    },
  })
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={criarServicosDoNavegadorFalsos().servicos} />)
}

describe('O selo do Agente e as Conversas', () => {
  it('com as Conversas indisponíveis, nenhum card diz "Disponível"', async () => {
    abrir('/', false)

    const grade = await screen.findByRole('list', { name: 'Agentes do Workspace' })
    expect(within(grade).getAllByText('Sem conversas no momento')).toHaveLength(4)
    expect(screen.queryByText('Disponível')).not.toBeInTheDocument()
  })

  it('com as Conversas indisponíveis, a página do Agente e a barra lateral também não dizem "Disponível"', async () => {
    abrir('/agentes/agente-scopus/memoria', false)

    expect(await screen.findByText('Sem conversas no momento')).toBeInTheDocument()
    expect(screen.queryByText('Disponível')).not.toBeInTheDocument()
    const lateral = screen.getByRole('link', { name: /Scopus/ })
    expect(lateral.querySelector('[title]')).toHaveAttribute('title', 'Sem conversas no momento')
  })

  it('com as Conversas disponíveis, o Agente ocioso segue "Disponível"', async () => {
    abrir('/', true)

    const grade = await screen.findByRole('list', { name: 'Agentes do Workspace' })
    expect(await within(grade).findAllByText('Disponível')).toHaveLength(4)
    expect(screen.queryByText('Sem conversas no momento')).not.toBeInTheDocument()
  })
})

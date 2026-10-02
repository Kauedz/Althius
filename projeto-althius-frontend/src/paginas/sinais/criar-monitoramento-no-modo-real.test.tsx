import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { RaizDoAplicativo } from '@/raiz'
import { renderizarApp } from '@/test/renderizar'
import { criarBancoDeAgentes, rpcsDeAgentes } from '@/test/agentes-no-banco'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
const PESSOAL = { id: 'ws-pessoal-marina', kind: 'pessoal', name: 'Marina Souza', owner_user_id: MARINA.id }
const NORTE = { id: 'ws-norte', kind: 'empresa', name: 'Norte' }
const CONTA = '6f1c2d3e-4a5b-4c6d-8e7f-0000000000aa'
const MONITOR = '8a1c2d3e-4a5b-4c6d-8e7f-0000000000bb'
const MONITOR_NOVO = '8a1c2d3e-4a5b-4c6d-8e7f-0000000000cc'

const LISTAS_DE_EXEMPLO = /Enterprise LATAM|Fintechs Brasil|Oportunidades do HubSpot/

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
  localStorage.clear()
})

interface MonitorNoBanco {
  id: string
  signal_type: string
  name: string
  state: string
  audience: { accountIds: string[] }
  criteria: Record<string, unknown>
  last_error: string | null
}

/** O Workspace operacional com um actor já disponível no fixture e uma Conta-alvo real. */
function abrir(rota: string, opcoes: { monitores?: MonitorNoBanco[]; atores?: { signal_type: string; state: string }[] } = {}) {
  const chamadas: Record<string, unknown>[] = []
  const monitores = [...(opcoes.monitores ?? [])]
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
      target_accounts: [
        {
          id: CONTA,
          workspace_id: NORTE.id,
          name: 'Norte Alimentos',
          canonical_url: 'https://nortealimentos.com.br',
          domain: 'nortealimentos.com.br',
          linkedin_url: null,
          segment: null,
          last_interaction_at: null,
        },
      ],
    },
    rpcs: {
      bootstrap_personal_workspace: () => PESSOAL,
      list_owned_sender_accounts: () => [],
      ...rpcsDeAgentes(criarBancoDeAgentes()),
      list_signal_actors: () =>
        opcoes.atores ?? [
          { signal_type: 'vaga_linkedin', state: 'available' },
          { signal_type: 'nova_lideranca', state: 'testing' },
        ],
      list_signal_monitors: () => monitores,
      list_signals: () => [],
      save_signal_monitor: (p) => {
        chamadas.push(p)
        const id = typeof p.p_id === 'string' && p.p_id ? p.p_id : MONITOR_NOVO
        const salvo: MonitorNoBanco = {
          id,
          signal_type: String(p.p_signal_type),
          name: String(p.p_name),
          state: String(p.p_state),
          audience: p.p_audience as { accountIds: string[] },
          criteria: (p.p_criteria ?? {}) as Record<string, unknown>,
          last_error: null,
        }
        const index = monitores.findIndex((m) => m.id === id)
        if (index >= 0) monitores[index] = salvo
        else monitores.push(salvo)
        return id
      },
    },
  })
  const servicos = criarServicosDoNavegadorFalsos()
  const usuario = userEvent.setup()
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={servicos.servicos} />)
  return { usuario, chamadas }
}

describe('Criar Monitoramento no Workspace operacional', () => {
  it('grava com o id do banco e as Contas reais, sem as listas de exemplo', async () => {
    const { usuario, chamadas } = abrir('/sinais/tipos/abertura-de-vagas/novo')

    expect(await screen.findByRole('heading', { level: 1, name: 'Novo monitoramento' })).toBeInTheDocument()
    expect(screen.queryAllByText(LISTAS_DE_EXEMPLO)).toHaveLength(0)

    const listas = await screen.findByRole('group', { name: 'Listas de Contas-alvo' })
    await usuario.click(within(listas).getByRole('checkbox', { name: /Norte Alimentos/ }))
    await usuario.type(screen.getByRole('textbox', { name: 'Nome do monitoramento' }), 'Vagas na Norte')
    await usuario.click(screen.getByRole('button', { name: 'Salvar rascunho' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Abertura de vagas' })).toBeInTheDocument()
    expect(chamadas).toHaveLength(1)
    expect(chamadas[0]).toMatchObject({
      p_workspace_id: NORTE.id,
      p_id: null,
      p_signal_type: 'vaga_linkedin',
      p_name: 'Vagas na Norte',
      p_state: 'rascunho',
      p_audience: { accountIds: [CONTA] },
    })
    expect(JSON.stringify(chamadas[0])).not.toContain('novo-')
    expect(JSON.stringify(chamadas[0])).not.toContain('enterprise-latam')
    expect(screen.queryAllByText(LISTAS_DE_EXEMPLO)).toHaveLength(0)
  })

  it('editar um Monitoramento gravado manda só o uuid dele', async () => {
    const { usuario, chamadas } = abrir('/sinais/tipos/abertura-de-vagas', {
      monitores: [
        {
          id: MONITOR,
          signal_type: 'vaga_linkedin',
          name: 'Vagas de dados',
          state: 'ativo',
          audience: { accountIds: [CONTA] },
          criteria: { palavras: 'dados' },
          last_error: null,
        },
      ],
    })

    await usuario.click(await screen.findByRole('link', { name: 'Vagas de dados' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Vagas de dados' })).toBeInTheDocument()
    expect(screen.queryAllByText(LISTAS_DE_EXEMPLO)).toHaveLength(0)
    const listas = screen.getByRole('group', { name: 'Listas de Contas-alvo' })
    expect(within(listas).getByRole('checkbox', { name: /Norte Alimentos/ })).toHaveAttribute('aria-checked', 'true')

    await usuario.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    expect(await screen.findByText('Alterações salvas em “Vagas de dados”.')).toBeInTheDocument()
    expect(chamadas).toHaveLength(1)
    expect(chamadas[0]).toMatchObject({
      p_id: MONITOR,
      p_audience: { accountIds: [CONTA] },
    })
    expect(JSON.stringify(chamadas[0])).not.toContain('novo-')
  })

  it('um Sinal em teste não deixa criar Monitoramento e a página diz o motivo', async () => {
    abrir('/sinais/tipos/nova-lideranca/novo')

    expect(await screen.findByText(/ainda não roda de verdade/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Salvar|Ativar/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Novo monitoramento/ })).not.toBeInTheDocument()
  })

  it('a Demonstração continua oferecendo as listas de exemplo', async () => {
    renderizarApp('/sinais/tipos/abertura-de-vagas/novo')

    expect(await screen.findByRole('checkbox', { name: /Enterprise LATAM/ })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Fintechs Brasil/ })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Oportunidades do HubSpot/ })).toBeInTheDocument()
  })
})

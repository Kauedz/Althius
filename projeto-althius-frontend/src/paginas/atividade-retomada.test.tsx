import { cleanup, render, screen, waitFor } from '@testing-library/react'
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
  localStorage.clear()
})

describe('Atividade de Execuções', () => {
  it('a falha mostra o motivo, e Tentar de novo cria e mostra uma Execução nova', async () => {
    localStorage.setItem('althius:modo_demo', 'false')
    sessionStorage.setItem('althius:workspace', NORTE.id)
    window.history.replaceState(null, '', '/agentes/agente-scopus/atividade')
    let retomou = false
    const chamadasDeRetomada: Record<string, unknown>[] = []
    const { cliente } = criarSupabaseFalso({
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
        ...rpcsDeAgentes(criarBancoDeAgentes(), 'admin'),
        list_agent_run_attention: () => [
          ...(retomou ? [{
            id: 'execucao-nova', agent_id: 'agente-scopus', agent_name: 'Scopus', conversation_id: 'conversa-1',
            trigger_kind: 'rotina', status: 'queued', request_text: 'Resuma o mercado', result_text: null,
            error_code: null, created_at: new Date().toISOString(), started_at: null, finished_at: null,
            retry_of: 'execucao-falha', retried_by: null,
          }] : []),
          {
            id: 'execucao-falha', agent_id: 'agente-scopus', agent_name: 'Scopus', conversation_id: 'conversa-1',
            trigger_kind: 'rotina', status: 'failed', request_text: 'Resuma o mercado', result_text: null,
            error_code: 'timeout_queued', created_at: new Date().toISOString(), started_at: null,
            finished_at: new Date().toISOString(), retry_of: null, retried_by: retomou ? 'execucao-nova' : null,
          },
        ],
        retry_agent_run: (parametros) => {
          chamadasDeRetomada.push(parametros)
          retomou = true
          return [{ id: 'execucao-nova', status: 'queued' }]
        },
      },
    })
    const usuario = userEvent.setup()
    render(<RaizDoAplicativo cliente={cliente} servicos={criarServicosDoNavegadorFalsos().servicos} />)

    expect(await screen.findByText(/não pegou o pedido em até 10 minutos/)).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Nova Execução na fila.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByText('Resuma o mercado')).toHaveLength(2))
    expect(chamadasDeRetomada).toHaveLength(1)
    expect(chamadasDeRetomada[0]).toMatchObject({ p_run_id: 'execucao-falha' })
  })

  it('mostra quando não foi possível tentar de novo', async () => {
    localStorage.setItem('althius:modo_demo', 'false')
    sessionStorage.setItem('althius:workspace', NORTE.id)
    window.history.replaceState(null, '', '/agentes/agente-scopus/atividade')
    const { cliente } = criarSupabaseFalso({
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
        ...rpcsDeAgentes(criarBancoDeAgentes(), 'admin'),
        list_agent_run_attention: () => [{
          id: 'execucao-falha', agent_id: 'agente-scopus', agent_name: 'Scopus', conversation_id: 'conversa-1',
          trigger_kind: 'rotina', status: 'failed', request_text: 'Resuma o mercado', result_text: null,
          error_code: 'timeout_queued', created_at: new Date().toISOString(), started_at: null,
          finished_at: new Date().toISOString(), retry_of: null, retried_by: null,
        }],
        retry_agent_run: () => { throw new Error('indisponível') },
      },
    })
    const usuario = userEvent.setup()
    render(<RaizDoAplicativo cliente={cliente} servicos={criarServicosDoNavegadorFalsos().servicos} />)

    await usuario.click(await screen.findByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível tentar de novo agora.')
  })
})

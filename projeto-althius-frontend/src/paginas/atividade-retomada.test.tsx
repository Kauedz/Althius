import { cleanup, render, screen } from '@testing-library/react'
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
  // Sinais first 10: a Atividade do Agente retirado é só leitura; o motivo da falha segue visível, sem Tentar de novo.
  it('a falha mostra o motivo, sem Tentar de novo nem nova Execução', async () => {
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
    render(<RaizDoAplicativo cliente={cliente} servicos={criarServicosDoNavegadorFalsos().servicos} />)

    expect(await screen.findByText(/não pegou o pedido em até 10 minutos/)).toBeInTheDocument()
    expect(screen.getAllByText('Resuma o mercado')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument()
    expect(chamadasDeRetomada).toEqual([])
    expect(retomou).toBe(false)
  })
})

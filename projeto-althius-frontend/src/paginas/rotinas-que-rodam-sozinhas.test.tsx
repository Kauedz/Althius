import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { RaizDoAplicativo } from '@/raiz'
import { criarBancoDeAgentes, rpcsDeAgentes } from '@/test/agentes-no-banco'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'

// Rotinas que rodam sozinhas (orquestracao, ticket 01): a aba Rotinas pede o dia do mês da Rotina mensal e diz se ela
// roda (teto aprovado) ou por que não roda.

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
const PESSOAL = { id: 'ws-pessoal-marina', kind: 'pessoal', name: 'Marina Souza', owner_user_id: MARINA.id }
const NORTE = { id: 'ws-norte', kind: 'empresa', name: 'Norte' }

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
})

const BASE = { weekday: null, run_time: '09:00', destination_channel: null, paused: false, day_of_month: null }

function abrir(rotinas: Record<string, unknown>[], criadas: Record<string, unknown>[] = []) {
  localStorage.setItem('althius:modo_demo', 'false')
  sessionStorage.setItem('althius:workspace', NORTE.id)
  window.history.replaceState(null, '', '/agentes/agente-scopus/rotinas')
  const banco = criarBancoDeAgentes()
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
      ...rpcsDeAgentes(banco, 'admin'),
      list_agent_routines: () => rotinas,
      create_agent_routine: (p) => (criadas.push(p), 'r-nova'),
    },
  })
  const usuario = userEvent.setup()
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={criarServicosDoNavegadorFalsos().servicos} />)
  return { usuario }
}

describe('Rotinas que rodam sozinhas', () => {
  it('a Rotina com teto aprovado diz quanto do teto do mês já foi usado', async () => {
    abrir([{ ...BASE, id: 'r1', task: 'Reavaliar as Contas-alvo', frequency: 'diaria', monthly_cap: '100.00', month_spent: '3.00', blocked_reason: null }])

    const rotina = await screen.findByRole('listitem', { name: 'Reavaliar as Contas-alvo' })
    expect(within(rotina).getByText(/Roda sozinha/)).toBeInTheDocument()
    expect(within(rotina).getByText(/3 de 100 créditos usados no mês/)).toBeInTheDocument()
  })

  it('a Rotina sem teto aprovado diz que não roda e onde aprovar', async () => {
    abrir([{ ...BASE, id: 'r1', task: 'Resumo da semana', frequency: 'diaria', monthly_cap: null, month_spent: '0', blocked_reason: 'confirmar' }])

    const rotina = await screen.findByRole('listitem', { name: 'Resumo da semana' })
    expect(within(rotina).getByText(/Não roda sozinha/)).toBeInTheDocument()
    expect(within(rotina).getByText(/Automação e tetos/)).toBeInTheDocument()
  })

  it('a Rotina que chegou no teto do mês diz que está pausada até o mês virar', async () => {
    abrir([{ ...BASE, id: 'r1', task: 'Resumo da semana', frequency: 'diaria', monthly_cap: '3.00', month_spent: '3.00', blocked_reason: 'teto_atingido' }])

    const rotina = await screen.findByRole('listitem', { name: 'Resumo da semana' })
    expect(within(rotina).getByText(/Chegou no teto do mês/)).toBeInTheDocument()
  })

  it('a Rotina mensal mostra o dia do mês', async () => {
    abrir([{ ...BASE, id: 'r1', task: 'Fechamento', frequency: 'mensal', day_of_month: 15, monthly_cap: '10.00', month_spent: '0', blocked_reason: null }])

    const rotina = await screen.findByRole('listitem', { name: 'Fechamento' })
    expect(within(rotina).getByText(/Todo mês, dia 15 às 09:00/)).toBeInTheDocument()
  })

  it('o Administrador cria a Rotina mensal com o dia do mês', async () => {
    const criadas: Record<string, unknown>[] = []
    const { usuario } = abrir([], criadas)

    await usuario.click(await screen.findByRole('button', { name: 'Nova rotina' }))
    const formulario = screen.getByRole('form', { name: 'Nova rotina' })
    expect(within(formulario).queryByLabelText('Dia do mês')).not.toBeInTheDocument()
    await usuario.type(within(formulario).getByLabelText('Tarefa'), 'Fechar o mês')
    await usuario.selectOptions(within(formulario).getByLabelText('Frequência'), 'mensal')
    const dia = within(formulario).getByLabelText('Dia do mês')
    await usuario.clear(dia)
    await usuario.type(dia, '20')
    await usuario.click(within(formulario).getByRole('button', { name: 'Criar rotina' }))

    expect(criadas).toHaveLength(1)
    expect(criadas[0]).toMatchObject({ p_task: 'Fechar o mês', p_frequency: 'mensal', p_day_of_month: 20 })
  })
})

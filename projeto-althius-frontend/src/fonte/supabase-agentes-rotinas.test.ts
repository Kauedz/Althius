import { describe, expect, it } from 'vitest'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { criarFonteDeAgentesSupabase } from './supabase-agentes'

// Rotinas que rodam sozinhas (orquestracao, ticket 01): o dia do mês e o teto da Rotina, como o banco os devolve.

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }

function fonteCom(rpcs: Record<string, (parametros: Record<string, unknown>) => unknown>) {
  const { cliente } = criarSupabaseFalso({ sessao: sessaoDe(MARINA), rpcs })
  return criarFonteDeAgentesSupabase(cliente, 'ws-norte')
}

const MENSAL = { id: 'r1', task: 'Fechamento', frequency: 'mensal', weekday: null, run_time: '09:00', destination_channel: null, paused: false, day_of_month: 15 }

describe('Rotinas no Workspace operacional: dia do mês e teto', () => {
  it('traz o dia do mês e o teto aprovado, com o gasto do mês', async () => {
    const fonte = fonteCom({
      list_agent_routines: () => [{ ...MENSAL, monthly_cap: '100.00', month_spent: '3.00', blocked_reason: null }],
    })

    expect(await fonte.rotinas('a1')).toEqual([
      {
        id: 'r1', agenteId: 'a1', tarefa: 'Fechamento', frequencia: 'mensal', diaDoMes: 15, horario: '09:00', canalDestino: null,
        pausada: false, teto: 100, gastoNoMes: 3, bloqueio: null,
      },
    ])
  })

  it('traz por que a Rotina não roda quando ela não tem teto aprovado', async () => {
    const fonte = fonteCom({
      list_agent_routines: () => [{ ...MENSAL, monthly_cap: null, month_spent: '0', blocked_reason: 'confirmar' }],
    })

    expect(await fonte.rotinas('a1')).toMatchObject([{ teto: null, gastoNoMes: 0, bloqueio: 'confirmar' }])
  })

  it('manda o dia do mês ao criar e ao editar a Rotina mensal, e nada nas outras', async () => {
    const chamadas: Record<string, unknown>[] = []
    const fonte = fonteCom({
      create_agent_routine: (p) => (chamadas.push(p), 'r1'),
      update_agent_routine: (p) => (chamadas.push(p), null),
    })

    await fonte.criarRotina({ agenteId: 'a1', tarefa: 'Fechamento', frequencia: 'mensal', diaDoMes: 15, horario: '09:00', canalDestino: null })
    await fonte.criarRotina({ agenteId: 'a1', tarefa: 'Reavaliar', frequencia: 'diaria', horario: '09:00', canalDestino: null })
    await fonte.editarRotina('r1', { agenteId: 'a1', tarefa: 'Fechamento', frequencia: 'mensal', diaDoMes: 20, horario: '10:00', canalDestino: null })

    expect(chamadas.map((c) => c.p_day_of_month)).toEqual([15, undefined, 20])
    expect('p_day_of_month' in chamadas[1]).toBe(false)
  })

  it('diz o que está errado quando o dia do mês é recusado', async () => {
    const recusando = () => {
      throw Object.assign(new Error('invalid day of month'), { code: '22023' })
    }
    const fonte = fonteCom({ create_agent_routine: recusando })

    await expect(
      fonte.criarRotina({ agenteId: 'a1', tarefa: 'Fechamento', frequencia: 'mensal', horario: '09:00', canalDestino: null }),
    ).rejects.toThrow('Informe o dia do mês da Rotina mensal, de 1 a 28.')
  })
})

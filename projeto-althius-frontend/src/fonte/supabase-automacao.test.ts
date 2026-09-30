import { describe, expect, it } from 'vitest'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { criarFonteDeAutomacaoSupabase } from './supabase-automacao'

const USUARIO = { id: 'usuario-ana', email: 'ana@cliente.com.br' }

function fonte(rpcs: Record<string, (p: Record<string, unknown>) => unknown>) {
  const { cliente } = criarSupabaseFalso({ sessao: sessaoDe(USUARIO), rpcs })
  return criarFonteDeAutomacaoSupabase(cliente, () => 'ws-norte')
}

describe('Automação e tetos no Workspace operacional', () => {
  it('lê os escopos de list_automation_settings', async () => {
    const f = fonte({
      list_automation_settings: () => [
        { scope: 'acao:varredura', kind: 'acao', name: 'Varredura de Sinais', mode: 'automatico', monthly_cap: '10.00', month_spent: '4.00', blocked_reason: null },
        { scope: 'integracao:hubspot', kind: 'integracao', name: 'HubSpot', mode: 'confirmar', monthly_cap: null, month_spent: '0', blocked_reason: 'confirmar' },
      ],
    })
    expect(await f.escopos()).toEqual([
      { escopo: 'acao:varredura', tipo: 'acao', nome: 'Varredura de Sinais', modo: 'automatico', teto: 10, gastoNoMes: 4, bloqueio: null },
      { escopo: 'integracao:hubspot', tipo: 'integracao', nome: 'HubSpot', modo: 'confirmar', teto: null, gastoNoMes: 0, bloqueio: 'confirmar' },
    ])
  })

  it('salvar chama save_automation_setting e traduz as recusas', async () => {
    const chamadas: Record<string, unknown>[] = []
    const f = fonte({
      save_automation_setting: (p) => {
        chamadas.push(p)
        if (p.p_scope === 'acao:agentes') throw Object.assign(new Error('only administrators can change automation'), { code: '42501' })
        if (p.p_monthly_cap === null) throw Object.assign(new Error('automatic mode requires an approved monthly cap'), { code: '22023' })
      },
    })
    await f.salvar('acao:varredura', 'automatico', 10)
    expect(chamadas[0]).toEqual({ p_workspace_id: 'ws-norte', p_scope: 'acao:varredura', p_mode: 'automatico', p_monthly_cap: 10 })
    await expect(f.salvar('acao:agentes', 'automatico', 5)).rejects.toThrow('Só um Administrador muda o automático e os tetos.')
    await expect(f.salvar('acao:varredura', 'automatico', null)).rejects.toThrow('O automático precisa de um teto mensal aprovado.')
  })
})

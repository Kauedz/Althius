import { describe, expect, it } from 'vitest'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { criarFonteDeAutomacaoSupabase } from './supabase-automacao'

const USUARIO = { id: 'usuario-ana', email: 'ana@cliente.com.br' }

function fonte(rpcs: Record<string, (p: Record<string, unknown>) => unknown>) {
  const { cliente } = criarSupabaseFalso({ sessao: sessaoDe(USUARIO), rpcs })
  return criarFonteDeAutomacaoSupabase(cliente, () => 'ws-norte')
}

describe('Automação e tetos: os escopos que ninguém executa (creditos-e-planos 03)', () => {
  it('o escopo sem executor chega travado em confirmar, mesmo que tenha sido ligado antes', async () => {
    const pedidos: Record<string, unknown>[] = []
    const f = fonte({
      list_automation_settings: () => [
        { scope: 'acao:varredura', kind: 'acao', name: 'Varredura de Sinais', mode: 'automatico', monthly_cap: '10.00', month_spent: '4.00', blocked_reason: null },
        { scope: 'acao:enriquecimento', kind: 'acao', name: 'Enriquecimento', mode: 'automatico', monthly_cap: '50.00', month_spent: '0', blocked_reason: null },
      ],
      list_runnable_automation_scopes: (p) => {
        pedidos.push(p)
        return [{ scope: 'acao:varredura' }, { scope: 'acao:agentes' }]
      },
    })
    expect(await f.escopos()).toEqual([
      { escopo: 'acao:varredura', tipo: 'acao', nome: 'Varredura de Sinais', modo: 'automatico', teto: 10, gastoNoMes: 4, bloqueio: null },
      { escopo: 'acao:enriquecimento', tipo: 'acao', nome: 'Enriquecimento', modo: 'confirmar', teto: 50, gastoNoMes: 0, bloqueio: 'sem_executor' },
    ])
    expect(pedidos).toEqual([{ p_workspace_id: 'ws-norte' }])
  })

  it('ligar o automático de um escopo sem executor é recusado em português', async () => {
    const f = fonte({
      save_automation_setting: () => {
        throw Object.assign(new Error('automatic mode is not available for this scope yet'), { code: '22023' })
      },
    })
    await expect(f.salvar('acao:enriquecimento', 'automatico', 10)).rejects.toThrow(
      'Este escopo ainda não roda sozinho: fica em Confirmar.',
    )
  })
})

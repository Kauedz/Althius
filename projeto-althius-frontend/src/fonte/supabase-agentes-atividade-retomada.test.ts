import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { criarFonteDeAgentesSupabase } from './supabase-agentes'

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }

function fonteCom(rpcs: Record<string, (parametros: Record<string, unknown>) => unknown>) {
  const { cliente } = criarSupabaseFalso({ sessao: sessaoDe(MARINA), rpcs })
  return criarFonteDeAgentesSupabase(cliente, 'ws-norte')
}

const emHoraLocal = (...partes: [number, number, number, number, number]) => new Date(...partes).toISOString()

function execucao(campos: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    agent_id: 'a1',
    agent_name: 'Scopus',
    conversation_id: 'c1',
    trigger_kind: 'rotina',
    status: 'failed',
    request_text: 'Resuma o mercado',
    result_text: null,
    error_code: 'timeout_queued',
    created_at: emHoraLocal(2026, 9, 15, 8, 0),
    started_at: null,
    finished_at: emHoraLocal(2026, 9, 15, 8, 10),
    retried_by: null,
    ...campos,
  }
}

describe('retomada de Execuções na Atividade', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0))
  })
  afterEach(() => vi.useRealTimers())

  it('traduz o motivo e chama uma vez a RPC para criar a nova Execução', async () => {
    const chamadas: Record<string, unknown>[] = []
    const fonte = fonteCom({
      list_agent_run_attention: () => [execucao()],
      retry_agent_run: (parametros) => {
        chamadas.push(parametros)
        return [{ id: 'r2', status: 'queued' }]
      },
    })

    const [item] = await fonte.atividade('a1')
    expect(item.resultado).toBe('O motor dos Agentes não pegou o pedido em até 10 minutos. Tente de novo.')
    expect(item.tentarDeNovo).toBe(true)
    await fonte.tentarDeNovo?.('r1')
    expect(chamadas).toHaveLength(1)
    expect(chamadas[0]).toMatchObject({ p_run_id: 'r1', p_client_request_id: expect.any(String) })
  })

  it('oculta a retomada após membership_inactive e mostra há quanto tempo a Execução está parada', async () => {
    const fonte = fonteCom({
      list_agent_run_attention: () => [
        execucao({ id: 'saiu', error_code: 'membership_inactive' }),
        execucao({ id: 'presa', status: 'queued', error_code: null, finished_at: null, created_at: emHoraLocal(2026, 9, 15, 11, 40) }),
      ],
    })

    const itens = await fonte.atividade('a1')
    expect(itens.find((item) => item.id === 'saiu')).not.toHaveProperty('tentarDeNovo')
    expect(itens.find((item) => item.id === 'presa')?.resultado).toBe('Parada há 20 minutos.')
  })
})

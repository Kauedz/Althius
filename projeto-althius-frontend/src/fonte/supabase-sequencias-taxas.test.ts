import { describe, expect, it } from 'vitest'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { criarFonteDeSequenciasSupabase } from './supabase-sequencias'

const ANA = { id: 'usuario-ana', email: 'ana@cliente.com.br' }

describe('Resultado dos envios no Workspace operacional (motor-hermes 03)', () => {
  it('lê send_outcome_rates do Workspace e converte as contagens, que podem chegar em texto', async () => {
    const chamadas: Record<string, unknown>[] = []
    const { cliente } = criarSupabaseFalso({
      sessao: sessaoDe(ANA),
      tabelas: {},
      rpcs: {
        send_outcome_rates: (p) => {
          chamadas.push(p)
          return [{ channel: 'email', segment: 'Sem segmento', sent: '4', replied: '2', positive: 1, meetings: '1', opportunities: '0' }]
        },
      },
    })
    const fonte = criarFonteDeSequenciasSupabase(cliente, () => 'ws-norte', () => ANA.id)
    expect(await fonte.taxasDosEnvios!()).toEqual([
      { canal: 'email', segmento: 'Sem segmento', enviados: 4, respostas: 2, positivas: 1, reunioes: 1, oportunidades: 0 },
    ])
    expect(chamadas).toEqual([{ p_workspace_id: 'ws-norte' }])
  })
})

describe('Resultado dos envios por abordagem no Workspace operacional', () => {
  it('lê send_outcome_rates_by_approach do Workspace', async () => {
    const { cliente } = criarSupabaseFalso({
      sessao: sessaoDe(ANA),
      tabelas: {},
      rpcs: {
        send_outcome_rates_by_approach: () => [
          { approach: 'Abertura pelo Sinal', channel: 'email', sent: '3', replied: 1, positive: '1', meetings: 0, opportunities: '0' },
        ],
      },
    })
    const fonte = criarFonteDeSequenciasSupabase(cliente, () => 'ws-norte', () => ANA.id)
    expect(await fonte.taxasPorAbordagem!()).toEqual([
      { abordagem: 'Abertura pelo Sinal', canal: 'email', enviados: 3, respostas: 1, positivas: 1, reunioes: 0, oportunidades: 0 },
    ])
  })
})

describe('Resultado por Conta-alvo no Workspace operacional', () => {
  it('lê a apuração por Conta com o corte e converte as contagens', async () => {
    const chamadas: Record<string, unknown>[] = []
    const { cliente } = criarSupabaseFalso({
      sessao: sessaoDe(ANA),
      tabelas: {},
      rpcs: {
        sequence_account_outcome_summary: (p) => {
          chamadas.push(p)
          return [{
            cutoff_at: '2026-10-25T12:00:00Z',
            approached_accounts: '12',
            positive_accounts: '4',
            meeting_accounts: '2',
            negative_accounts: '3',
          }]
        },
      },
    })
    const fonte = criarFonteDeSequenciasSupabase(cliente, () => 'ws-norte', () => ANA.id)
    expect(await fonte.resultadosPorConta!()).toEqual({
      dataCorte: '2026-10-25T12:00:00Z',
      contasAbordadas: 12,
      respostasPositivas: 4,
      reunioes: 2,
      respostasNegativas: 3,
    })
    expect(chamadas).toEqual([{ p_workspace_id: 'ws-norte' }])
  })
})

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

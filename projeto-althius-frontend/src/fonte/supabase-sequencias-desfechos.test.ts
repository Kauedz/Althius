import { describe, expect, it } from 'vitest'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { criarFonteDeSequenciasSupabase } from './supabase-sequencias'

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
const LINHA = {
  id: 'sequencia-da-marina', workspace_id: 'ws-norte', target_account_id: 'conta-do-norte', owner_user_id: MARINA.id,
  status: 'ativa', public_summary: { totalParticipantes: 1, totalSteps: 1, passoAtual: 0 },
  created_at: '2026-09-20T12:00:00Z', updated_at: '2026-09-21T12:00:00Z',
}
const ENVIO = {
  id: 'envio-1', step_id: 'passo-1', contact_id: 'contato-1', destination: 'maria@empresa-alvo.test', status: 'sent',
  attempts: 1, confirmed_at: '2026-09-26T15:00:00Z', sent_at: '2026-09-30T13:00:05Z', last_error: null,
  last_error_at: null, updated_at: '2026-09-30T13:00:05Z', mode: 'auto', scheduled_for: null,
}

function fonte(rpcs: Record<string, (p: Record<string, unknown>) => unknown>) {
  const { cliente } = criarSupabaseFalso({
    sessao: sessaoDe(MARINA),
    tabelas: { sequences: [LINHA] },
    rpcs: { list_sequence_step_sends: () => [ENVIO], ...rpcs },
  })
  return criarFonteDeSequenciasSupabase(cliente, () => 'ws-norte', () => MARINA.id)
}

describe('Resultado do Envio na Fonte de Sequências (motor-hermes 03)', () => {
  it('os Envios trazem o desfecho lido de list_send_outcomes', async () => {
    const f = fonte({ list_send_outcomes: () => [{ send_id: 'envio-1', outcome: 'reuniao_marcada' }] })
    expect((await f.envios('sequencia-da-marina'))[0].desfecho).toBe('reuniao_marcada')
  })

  it('se a leitura dos desfechos falhar, os Envios aparecem sem desfecho', async () => {
    const f = fonte({})
    const [envio] = await f.envios('sequencia-da-marina')
    expect(envio.status).toBe('sent')
    expect(envio).not.toHaveProperty('desfecho')
  })

  it('classificar chama set_send_outcome com o Envio e o desfecho, e a recusa do banco vira erro', async () => {
    const pedidos: Record<string, unknown>[] = []
    const f = fonte({ set_send_outcome: (p) => (pedidos.push(p), null) })
    await f.classificarEnvio!('envio-1', 'resposta_negativa')
    expect(pedidos).toEqual([{ p_send_id: 'envio-1', p_outcome: 'resposta_negativa' }])

    const recusada = fonte({
      set_send_outcome: () => {
        throw Object.assign(new Error('only the sequence owner can classify its sends'), { code: '42501' })
      },
    })
    await expect(recusada.classificarEnvio!('envio-1', 'resposta')).rejects.toThrow(
      'Só o responsável pela Sequência registra o resultado dos Envios dela.',
    )
  })
})

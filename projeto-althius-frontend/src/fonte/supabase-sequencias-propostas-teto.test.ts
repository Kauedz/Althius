import { describe, expect, it } from 'vitest'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { criarFonteDeSequenciasSupabase } from './supabase-sequencias'

const ANA = { id: 'usuario-ana', email: 'ana@cliente.com.br' }

function linha(id: string, failureCode: string | null) {
  return {
    id,
    sequence_id: 'seq-1',
    target_account_id: 'conta-1',
    contact_id: 'contato-1',
    channel: 'email',
    origin_interaction_id: `interacao-${id}`,
    recipient: 'carla@acme.com.br',
    recipient_name: null,
    subject: null,
    body: null,
    revision: 0,
    status: 'falhou',
    failure_code: failureCode,
    approved_revision: null,
    decided_at: null,
    sent_at: null,
    send_error: null,
    generations: 1,
    origin_received_at: null,
    origin_subject: null,
    origin_excerpt: null,
    created_at: '2026-10-08T10:01:00Z',
    updated_at: '2026-10-08T10:02:00Z',
  }
}

describe('Propostas de resposta barradas pelo teto (creditos-e-planos 03)', () => {
  it('a proposta que o teto barrou chega com o motivo; as outras falhas, sem ele', async () => {
    const { cliente } = criarSupabaseFalso({
      sessao: sessaoDe(ANA),
      rpcs: {
        list_reply_proposals: () => [
          linha('p1', 'automation_confirm'),
          linha('p2', 'automation_no_cap'),
          linha('p3', 'automation_cap_reached'),
          linha('p4', 'model_timeout'),
        ],
      },
    })
    const fonte = criarFonteDeSequenciasSupabase(cliente, () => 'ws-norte', () => ANA.id)
    const propostas = await fonte.propostasDeResposta!('seq-1')
    expect(propostas.map((p) => [p.id, p.paradaPeloTeto])).toEqual([
      ['p1', 'confirmar'],
      ['p2', 'sem_teto'],
      ['p3', 'teto_atingido'],
      ['p4', undefined],
    ])
    expect(propostas[3]).not.toHaveProperty('paradaPeloTeto')
  })
})

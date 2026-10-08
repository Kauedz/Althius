// A leitura da fila de Aprovações (CRM-15): o que abre junto (a navegação, a fila, cada cartão na Conversa) divide a
// mesma chamada a `list_approvals`, e quem lê depois de uma decisão vê a fila nova.
import { describe, expect, it } from 'vitest'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { criarFonteDeAprovacoesSupabase } from './supabase-aprovacoes'

const ANA = { id: 'usuario-ana', email: 'ana@cliente.com.br' }

function fonte() {
  let estado = 'pendente'
  let leituras = 0
  const { cliente } = criarSupabaseFalso({
    sessao: sessaoDe(ANA),
    tabelas: {},
    rpcs: {
      list_approvals: () => {
        leituras++
        return [{
          id: 'ap-1', agent_id: 'agente-rhetor', integration_id: 'hubspot', action: 'Enviar a Alfa Engenharia ao HubSpot',
          impact: 'Cria no HubSpot a empresa.', justification: 'Reunião marcada.', payload: { tipo: 'envio_ao_crm' },
          target_account_id: null, state: estado, failure: null,
        }]
      },
      decide_approval: () => (estado = 'recusada'),
    },
  })
  return { f: criarFonteDeAprovacoesSupabase(cliente, 'ws-norte'), leituras: () => leituras }
}

describe('A leitura da fila de Aprovações', () => {
  it('leituras ao mesmo tempo dividem uma chamada a list_approvals', async () => {
    const { f, leituras } = fonte()

    const [navegacao, fila, cartao] = await Promise.all([f.aprovacoes(), f.aprovacoes(), f.aprovacoes()])

    expect(leituras()).toBe(1)
    expect([navegacao, fila, cartao].map((lista) => lista[0]?.estado)).toEqual(['pendente', 'pendente', 'pendente'])
  })

  it('quem lê depois de uma decisão vê a fila nova', async () => {
    const { f, leituras } = fonte()
    await f.aprovacoes()

    await f.decidirAprovacao('ap-1', 'rejeitada', 'fila')

    expect((await f.aprovacoes())[0]?.estado).toBe('rejeitada')
    expect(leituras()).toBe(2)
  })
})

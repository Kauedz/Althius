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

  it('a Sequência proposta pelo Rhetor vem só na fila inteira, nunca em aprovacoes()', async () => {
    const { cliente } = criarSupabaseFalso({
      sessao: sessaoDe(ANA),
      tabelas: {},
      rpcs: {
        list_approvals: () => [
          {
            id: 'ap-1', agent_id: 'agente-rhetor', integration_id: 'hubspot', action: 'Enviar a Alfa ao HubSpot',
            impact: 'Cria no HubSpot a empresa.', justification: '', payload: { tipo: 'envio_ao_crm' },
            target_account_id: null, state: 'pendente', failure: null,
          },
          {
            id: 'ap-seq', agent_id: 'agente-rhetor', integration_id: null, action: 'Sequência de E-mail para Alfa',
            impact: 'Aprovar cria a Sequência.', justification: '', category: 'sequencia',
            payload: { tipo: 'sequencia', conta: 'Alfa', total_contatos: 1, total_passos: 3 },
            target_account_id: '11111111-1111-4111-8111-111111111111', state: 'pendente', failure: null,
          },
        ],
      },
    })
    const f = criarFonteDeAprovacoesSupabase(cliente, 'ws-norte')

    // Quem lê só Aprovações (o Canal, a Memória, o Playbook) não recebe a Sequência: ela não tem Integração.
    expect((await f.aprovacoes()).map((a) => a.id)).toEqual(['ap-1'])
    expect((await f.filaDeAprovacoes()).map((a) => [a.id, a.tipo])).toEqual([['ap-1', 'envio'], ['ap-seq', 'sequencia']])
  })
})

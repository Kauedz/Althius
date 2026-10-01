import { describe, expect, it } from 'vitest'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { rotuloDoEstadoDaAprovacao } from './regras'
import { criarFonteDeAprovacoesSupabase } from './supabase-aprovacoes'

const ANA = { id: 'usuario-ana', email: 'ana@cliente.com.br' }

const linha = (state: string, extra: Record<string, unknown> = {}) => ({
  id: `ap-${state}`, agent_id: 'agente-scopus', integration_id: 'hubspot', action: 'Criar a Alfa no HubSpot',
  impact: 'Uma empresa nova no CRM', justification: 'Sinal de expansão', payload: {}, target_account_id: null,
  state, failure: null, ...extra,
})

function fonte(rpcs: Record<string, (p: Record<string, unknown>) => unknown>) {
  const { cliente } = criarSupabaseFalso({ sessao: sessaoDe(ANA), tabelas: {}, rpcs })
  return criarFonteDeAprovacoesSupabase(cliente, 'ws-norte')
}

describe('Aprovações reais do Workspace operacional (CRM-15)', () => {
  it('a fila vem de list_approvals, com os estados do banco na linguagem da tela', async () => {
    const f = fonte({
      list_approvals: () => [
        linha('pendente'), linha('recusada'), linha('expirada'), linha('cancelada'), linha('executada'),
        linha('falhou', { failure: 'HubSpot recusou' }),
      ],
    })
    const fila = await f.aprovacoes()
    expect(fila.map((a) => [a.estado, a.revisao ? undefined : a.execucao])).toEqual([
      ['pendente', undefined], ['rejeitada', undefined], ['expirada', undefined], ['cancelada', undefined],
      ['aprovada', 'executada'], ['aprovada', 'falhou'],
    ])
    expect(fila[0]).toMatchObject({ agenteId: 'agente-scopus', integracaoId: 'hubspot', acao: 'Criar a Alfa no HubSpot', origem: 'althius' })
    expect(fila.map((a) => (a.revisao ? '' : rotuloDoEstadoDaAprovacao(a)))).toEqual([
      'Pendente', 'Recusada', 'Expirada', 'Cancelada', 'Aprovada · executada', 'Aprovada · falhou',
    ])
  })

  it('decidir chama decide_approval com aprovar ou recusar e o lugar', async () => {
    const pedidos: Record<string, unknown>[] = []
    const f = fonte({ decide_approval: (p) => (pedidos.push(p), 'aprovada') })
    await f.decidirAprovacao('ap-1', 'aprovada', 'fila')
    await f.decidirAprovacao('ap-2', 'rejeitada', 'conversa')
    await f.decidirAprovacao('ap-3', 'aprovada', 'slack')
    expect(pedidos).toEqual([
      { p_approval_id: 'ap-1', p_decision: 'aprovar', p_where: 'fila' },
      { p_approval_id: 'ap-2', p_decision: 'recusar', p_where: 'conversa' },
      { p_approval_id: 'ap-3', p_decision: 'aprovar', p_where: 'canal' },
    ])
  })

  it('as recusas do banco viram palavras do produto', async () => {
    const recusa = (mensagem: string) => () => {
      throw Object.assign(new Error(mensagem), { code: '42501' })
    }
    await expect(fonte({ decide_approval: recusa('only administrators can decide approvals') }).decidirAprovacao('a', 'aprovada', 'fila'))
      .rejects.toThrow('Só Administradores do Workspace decidem Aprovações.')
    await expect(fonte({ decide_approval: recusa('the approval was already decided') }).decidirAprovacao('a', 'aprovada', 'fila'))
      .rejects.toThrow('Esta Aprovação já foi decidida.')
  })
})

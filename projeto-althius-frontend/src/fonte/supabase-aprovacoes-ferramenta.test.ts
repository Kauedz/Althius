// A decisão que libera uma chamada de ferramenta de conector proposta por um Agente (ADR-0022): logo depois de aprovar,
// a Fonte pede à `integration-tools` a execução daquela Aprovação; as de envio ao CRM continuam no `crm-handoff`.
import { describe, expect, it } from 'vitest'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { criarFonteDeAprovacoesSupabase } from './supabase-aprovacoes'

const ANA = { id: 'usuario-ana', email: 'ana@cliente.com.br' }

const linha = (id: string, payload: Record<string, unknown>) => ({
  id, agent_id: 'agente-rhetor', integration_id: 'notion', action: 'Usar criar_pagina no Notion',
  impact: 'Escreve ou gasta no Notion', justification: '', payload, target_account_id: null, state: 'pendente', failure: null,
})

function fonte() {
  const pedidos: { funcao: string; corpo: Record<string, unknown> }[] = []
  const { cliente } = criarSupabaseFalso({
    sessao: sessaoDe(ANA),
    tabelas: {},
    rpcs: {
      list_approvals: () => [
        linha('ap-ferramenta', { tipo: 'ferramenta', integration_id: 'notion', ferramenta: 'criar_pagina', argumentos: {} }),
        linha('ap-envio', { tipo: 'envio_ao_crm' }),
      ],
      decide_approval: () => 'aprovada',
    },
    funcoes: {
      'integration-tools': (corpo) => (pedidos.push({ funcao: 'integration-tools', corpo }), { corpo: { status: 'executada', mensagem: 'ok' } }),
      'crm-handoff': (corpo) => (pedidos.push({ funcao: 'crm-handoff', corpo }), { corpo: { status: 'enviado' } }),
    },
  })
  return { f: criarFonteDeAprovacoesSupabase(cliente, 'ws-norte'), pedidos }
}

describe('Executar a Aprovação de ferramenta logo depois de aprovar na Conversa (ADR-0022)', () => {
  it('a de ferramenta vai à integration-tools; a de envio ao CRM, ao crm-handoff', async () => {
    const { f, pedidos } = fonte()
    await f.aprovacoes()
    await f.decidirAprovacao('ap-ferramenta', 'aprovada', 'conversa')
    await f.decidirAprovacao('ap-envio', 'aprovada', 'conversa')
    expect(pedidos).toEqual([
      { funcao: 'integration-tools', corpo: { action: 'executar_aprovacao', approvalId: 'ap-ferramenta' } },
      { funcao: 'crm-handoff', corpo: { action: 'executar_aprovacao', approvalId: 'ap-envio' } },
    ])
  })

  it('recusar não executa nada', async () => {
    const { f, pedidos } = fonte()
    await f.aprovacoes()
    await f.decidirAprovacao('ap-ferramenta', 'rejeitada', 'conversa')
    expect(pedidos).toEqual([])
  })
})

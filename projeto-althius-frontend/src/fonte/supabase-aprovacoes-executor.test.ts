// A decisão que libera um envio ao CRM proposto por um Agente (Etapa 5b, CRM-15): logo depois de aprovar, a Fonte pede
// ao `crm-handoff` que execute a Aprovação. Recusar não executa nada; um envio que não sai não desfaz a decisão, e a
// fila mostra o estado que o banco gravou (executada ou falhou).
import { describe, expect, it } from 'vitest'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { criarFonteDeAprovacoesSupabase } from './supabase-aprovacoes'

const ANA = { id: 'usuario-ana', email: 'ana@cliente.com.br' }
type Resposta = { status?: number; corpo: unknown }

function fonte(crmHandoff: (corpo: Record<string, unknown>) => Resposta) {
  const pedidos: Record<string, unknown>[] = []
  const { cliente } = criarSupabaseFalso({
    sessao: sessaoDe(ANA),
    tabelas: {},
    rpcs: { decide_approval: () => 'aprovada' },
    funcoes: { 'crm-handoff': (corpo) => (pedidos.push(corpo), crmHandoff(corpo)) },
  })
  return { f: criarFonteDeAprovacoesSupabase(cliente, 'ws-norte'), pedidos }
}

describe('Executar a Aprovação de envio ao CRM logo depois de aprovar (CRM-15)', () => {
  it('aprovar pede ao crm-handoff a execução daquela Aprovação; recusar não pede', async () => {
    const { f, pedidos } = fonte(() => ({ corpo: { status: 'enviado', mensagem: 'Enviada ao HubSpot.', pendencias: [] } }))
    await f.decidirAprovacao('ap-1', 'aprovada', 'fila')
    await f.decidirAprovacao('ap-2', 'rejeitada', 'fila')
    expect(pedidos).toEqual([{ action: 'executar_aprovacao', approvalId: 'ap-1' }])
  })

  it('um envio que não sai não desfaz a decisão, e a fila é avisada para reler o estado', async () => {
    const { f } = fonte(() => ({ status: 502, corpo: { error: 'O HubSpot recusou.', code: 'falhou', status: 'falhou' } }))
    let avisos = 0
    f.observar(() => avisos++)
    await expect(f.decidirAprovacao('ap-1', 'aprovada', 'fila')).resolves.toBeUndefined()
    expect(avisos).toBeGreaterThanOrEqual(1)
  })
})

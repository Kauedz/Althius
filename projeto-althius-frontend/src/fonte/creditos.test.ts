import { describe, expect, it } from 'vitest'
import { textoDoSaldo, lerExtratoDeCreditos } from './creditos'

describe('texto do saldo', () => {
  it('mostra Ilimitado no Workspace ilimitado, mesmo com o número negativo', () => {
    expect(textoDoSaldo({ lancado: -4, reservado: 1, disponivel: -5, ilimitado: true })).toBe('Ilimitado')
  })

  it('mostra o disponível em pt-BR quando o saldo é finito', () => {
    expect(textoDoSaldo({ lancado: 1200, reservado: 0, disponivel: 1200, ilimitado: false })).toBe('1.200')
  })
})

describe('extrato de créditos', () => {
  it('mapeia sinal quando o RPC novo o devolve', async () => {
    const cliente = { rpc: async () => ({ data: [{ id: '1', amount: '-2', kind: 'acao', action: 'account_scan', note: null, created_at: '2026-10-20', signal_name: 'Vagas' }], error: null }) } as never
    await expect(lerExtratoDeCreditos(cliente, 'ws')).resolves.toEqual([
      { id: '1', creditos: -2, tipo: 'acao', acao: 'account_scan', sinal: 'Vagas', criadoEm: '2026-10-20' },
    ])
  })

  it('usa o extrato antigo quando a migration nova ainda não existe', async () => {
    const chamadas: string[] = []
    const cliente = {
      rpc: async (nome: string) => {
        chamadas.push(nome)
        if (nome === 'list_credit_statement') return { data: null, error: { code: 'PGRST202' } }
        return { data: [{ id: '2', amount: '-1', kind: 'acao', action: 'cnpj_receita', note: null, created_at: '2026-10-21' }], error: null }
      },
    } as never
    await expect(lerExtratoDeCreditos(cliente, 'ws')).resolves.toEqual([
      { id: '2', creditos: -1, tipo: 'acao', acao: 'cnpj_receita', sinal: null, criadoEm: '2026-10-21' },
    ])
    expect(chamadas).toEqual(['list_credit_statement', 'list_credit_entries'])
  })
})

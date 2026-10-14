import { describe, expect, it } from 'vitest'
import { textoDoSaldo } from './creditos'

describe('texto do saldo', () => {
  it('mostra Ilimitado no Workspace ilimitado, mesmo com o número negativo', () => {
    expect(textoDoSaldo({ lancado: -4, reservado: 1, disponivel: -5, ilimitado: true })).toBe('Ilimitado')
  })

  it('mostra o disponível em pt-BR quando o saldo é finito', () => {
    expect(textoDoSaldo({ lancado: 1200, reservado: 0, disponivel: 1200, ilimitado: false })).toBe('1.200')
  })
})

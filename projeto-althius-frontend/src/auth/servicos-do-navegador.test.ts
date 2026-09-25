import { describe, expect, it } from 'vitest'
import { criarServicosDoNavegador } from './servicos-do-navegador'

/** SHA-1 de "password": 5BAA6 1E4C9B93F3F0682250B6CF8331B7EE68FD8. */
const SUFIXO_DE_PASSWORD = '1E4C9B93F3F0682250B6CF8331B7EE68FD8'

/** Um Pwned Passwords falso, que registra o que o navegador enviou e responde `corpo`. */
function pwnedPasswordsFalso(corpo: string, status = 200) {
  const pedidos: { url: string; headers: Record<string, string> }[] = []
  const buscar: typeof fetch = (entrada, init) => {
    pedidos.push({ url: String(entrada), headers: init?.headers as Record<string, string> })
    return Promise.resolve(new Response(corpo, { status }))
  }
  return { buscar, pedidos }
}

describe('Pwned Passwords por k-anonimato', () => {
  it('só os 5 primeiros caracteres do SHA-1 saem do navegador, com preenchimento na resposta', async () => {
    const { buscar, pedidos } = pwnedPasswordsFalso(`${SUFIXO_DE_PASSWORD}:9659365\r\n`)

    expect(await criarServicosDoNavegador({ fetch: buscar }).senhaVazada('password')).toBe(true)
    expect(pedidos).toEqual([{ url: 'https://api.pwnedpasswords.com/range/5BAA6', headers: { 'Add-Padding': 'true' } }])
    expect(JSON.stringify(pedidos)).not.toContain(SUFIXO_DE_PASSWORD)
  })

  it('uma senha fora da lista, ou só nas linhas de preenchimento, não é vazada', async () => {
    const outra = pwnedPasswordsFalso('0018A45C4D1DEF81644B54AB7F969B88D65:3\r\n')
    expect(await criarServicosDoNavegador({ fetch: outra.buscar }).senhaVazada('password')).toBe(false)

    const preenchimento = pwnedPasswordsFalso(`${SUFIXO_DE_PASSWORD}:0\r\n`)
    expect(await criarServicosDoNavegador({ fetch: preenchimento.buscar }).senhaVazada('password')).toBe(false)
  })

  it('uma resposta de erro do serviço falha, para quem chama decidir não bloquear', async () => {
    const { buscar } = pwnedPasswordsFalso('', 503)
    await expect(criarServicosDoNavegador({ fetch: buscar }).senhaVazada('password')).rejects.toThrow('503')
  })
})

import { describe, expect, it, vi } from 'vitest'
import { criarServicosDoNavegador, type ApiDoTurnstile } from './servicos-do-navegador'

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

/** Um Turnstile falso: registra os widgets e responde a cada `execute` com token ou erro, conforme `resposta`. */
function turnstileFalso(resposta: 'token' | 'erro' | 'nao-renderiza') {
  const renderizados: { sitekey: string; action: string; execution: string; appearance: string; noDocumento: boolean }[] = []
  const removidos: string[] = []
  const callbacks = new Map<string, Parameters<ApiDoTurnstile['render']>[1]>()
  const api: ApiDoTurnstile = {
    render(container, opcoes) {
      if (resposta === 'nao-renderiza') return undefined
      const { sitekey, action, execution, appearance } = opcoes
      renderizados.push({ sitekey, action, execution, appearance, noDocumento: document.body.contains(container) })
      const id = `widget-${renderizados.length}`
      callbacks.set(id, opcoes)
      return id
    },
    execute(widget) {
      const opcoes = callbacks.get(widget)!
      if (resposta === 'token') opcoes.callback(`token-de-${widget}`)
      else opcoes['error-callback']()
    },
    remove: (widget) => { removidos.push(widget) },
  }
  return { carregarTurnstile: vi.fn(() => Promise.resolve(api)), renderizados, removidos }
}

describe('Turnstile invisível', () => {
  it('sem site key, nenhum token é pedido e o script do Turnstile não é carregado', async () => {
    const { carregarTurnstile } = turnstileFalso('token')
    const servicos = criarServicosDoNavegador({ carregarTurnstile })

    expect(await servicos.tokenDoCaptcha('cadastro')).toBeNull()
    expect(await criarServicosDoNavegador({ siteKeyDoTurnstile: '  ', carregarTurnstile }).tokenDoCaptcha('cadastro')).toBeNull()
    expect(carregarTurnstile).not.toHaveBeenCalled()
    expect(document.querySelector('script[src*="challenges.cloudflare.com"]')).toBeNull()
  })

  it('com site key, cada pedido executa um widget invisível com a ação e devolve um token novo, sem deixar nada na página', async () => {
    const { carregarTurnstile, renderizados, removidos } = turnstileFalso('token')
    const servicos = criarServicosDoNavegador({ siteKeyDoTurnstile: 'site-key-de-teste', carregarTurnstile })

    expect(await servicos.tokenDoCaptcha('login_com_senha')).toBe('token-de-widget-1')
    expect(await servicos.tokenDoCaptcha('redefinicao_de_senha')).toBe('token-de-widget-2')
    expect(renderizados).toEqual([
      { sitekey: 'site-key-de-teste', action: 'login_com_senha', execution: 'execute', appearance: 'interaction-only', noDocumento: true },
      { sitekey: 'site-key-de-teste', action: 'redefinicao_de_senha', execution: 'execute', appearance: 'interaction-only', noDocumento: true },
    ])
    expect(removidos).toEqual(['widget-1', 'widget-2'])
    expect(document.querySelector('[data-turnstile]')).toBeNull()
  })

  it.each(['erro', 'nao-renderiza'] as const)('quando o Turnstile não confirma a pessoa (%s), o pedido falha', async (resposta) => {
    const { carregarTurnstile } = turnstileFalso(resposta)
    const servicos = criarServicosDoNavegador({ siteKeyDoTurnstile: 'site-key-de-teste', carregarTurnstile })

    await expect(servicos.tokenDoCaptcha('cadastro')).rejects.toThrow('Turnstile')
    expect(document.querySelector('[data-turnstile]')).toBeNull()
  })
})

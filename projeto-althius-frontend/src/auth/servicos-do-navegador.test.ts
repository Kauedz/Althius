import { afterEach, describe, expect, it, vi } from 'vitest'
import { criarServicosDoNavegador, type ApiDoTurnstile, type GoogleAccountsId } from './servicos-do-navegador'

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

/** Um `google.accounts.id` falso, que registra o que a Althius pediu ao Google Identity Services. */
function googleAccountsIdFalso() {
  const chamadas: { metodo: string; argumentos: unknown[] }[] = []
  let callback: ((resposta: { credential: string }) => void) | undefined
  const id: GoogleAccountsId = {
    initialize(configuracao) {
      callback = configuracao.callback
      chamadas.push({ metodo: 'initialize', argumentos: [configuracao] })
    },
    renderButton: (...argumentos) => { chamadas.push({ metodo: 'renderButton', argumentos }) },
    prompt: () => { chamadas.push({ metodo: 'prompt', argumentos: [] }) },
    cancel: () => { chamadas.push({ metodo: 'cancel', argumentos: [] }) },
  }
  return { id, chamadas, escolherConta: (credential: string) => callback!({ credential }) }
}

describe('Google Identity Services', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('sem o Client ID do Google, não há Google', () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '')
    expect(criarServicosDoNavegador().google).toBeUndefined()
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'client-id-do-teste.apps.googleusercontent.com')
    expect(criarServicosDoNavegador().google).toBeDefined()
  })

  it('desenha o botão oficial e o One Tap por FedCM com o hash do nonce, sem escopos além do ID token', async () => {
    const google = googleAccountsIdFalso()
    const servicos = criarServicosDoNavegador({ googleClientId: 'client-id-do-teste', carregarGoogle: () => Promise.resolve(google.id) })
    const elemento = document.createElement('div')
    const credenciais: string[] = []

    const limpar = servicos.google!.iniciar({ elemento, nonceComHash: 'hash-do-nonce', contexto: 'signup', aoReceberCredencial: (token) => credenciais.push(token) })
    await vi.waitFor(() => expect(google.chamadas.map((c) => c.metodo)).toEqual(['initialize', 'renderButton', 'prompt']))

    const configuracao = google.chamadas[0].argumentos[0] as Record<string, unknown>
    expect(configuracao).toMatchObject({ client_id: 'client-id-do-teste', nonce: 'hash-do-nonce', context: 'signup', use_fedcm_for_prompt: true })
    expect(configuracao).not.toHaveProperty('scope')
    expect(google.chamadas[1].argumentos).toEqual([elemento, expect.objectContaining({ type: 'standard', text: 'continue_with' })])

    google.escolherConta('id-token')
    expect(credenciais).toEqual(['id-token'])

    // Depois da limpeza, o One Tap fecha e nenhuma credencial chega mais à tela.
    limpar()
    expect(google.chamadas.at(-1)?.metodo).toBe('cancel')
    google.escolherConta('outro-id-token')
    expect(credenciais).toEqual(['id-token'])
  })

  it('se o script do Google não carregar, o Google só não aparece', async () => {
    const servicos = criarServicosDoNavegador({ googleClientId: 'client-id-do-teste', carregarGoogle: () => Promise.reject(new Error('bloqueado')) })
    const elemento = document.createElement('div')

    const limpar = servicos.google!.iniciar({ elemento, nonceComHash: 'hash', contexto: 'signin', aoReceberCredencial: () => {} })
    await Promise.resolve()
    limpar()
    expect(elemento.childElementCount).toBe(0)
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

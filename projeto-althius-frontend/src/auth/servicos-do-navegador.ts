/**
 * Os serviços que o módulo de autenticação usa direto do navegador, fora do Supabase. Entram juntos, por uma única
 * dependência passada ao lado do cliente Supabase, para os testes trocarem todos por versões falsas. Os próximos
 * (Google Identity Services, Turnstile) entram como novos membros desta interface.
 */
export interface ServicosDoNavegador {
  /**
   * Se a senha já apareceu em vazamentos (Pwned Passwords do HaveIBeenPwned). Pode falhar ou demorar: quem chama não
   * bloqueia por isso.
   */
  senhaVazada: (senha: string) => Promise<boolean>
  /**
   * Um token novo do Cloudflare Turnstile invisível para esta ação, a mandar em `options.captchaToken` da chamada ao
   * Supabase Auth, que o valida quando o CAPTCHA está ligado no projeto. `null` quando o Turnstile não está
   * configurado (sem site key): a chamada segue sem token. Falha quando o Turnstile não confirma a pessoa.
   */
  tokenDoCaptcha: (acao: AcaoDoCaptcha) => Promise<string | null>
}

/** As chamadas ao Supabase Auth protegidas pelo CAPTCHA; vira o `action` do Turnstile, visível na Cloudflare. */
export type AcaoDoCaptcha = 'cadastro' | 'reenvio_do_cadastro' | 'login_com_senha' | 'codigo_de_entrada' | 'redefinicao_de_senha'

/** A parte da API do Turnstile (`window.turnstile`) que o app usa. */
export interface ApiDoTurnstile {
  render: (
    container: HTMLElement,
    opcoes: {
      sitekey: string
      action: string
      execution: 'execute'
      appearance: 'interaction-only'
      callback: (token: string) => void
      'error-callback': () => void
      'expired-callback': () => void
      'timeout-callback': () => void
    },
  ) => string | undefined
  execute: (widget: string) => void
  remove: (widget: string) => void
}

const SCRIPT_DO_TURNSTILE = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

/** Quanto o Turnstile pode demorar para entregar o token antes de a tela avisar e deixar tentar de novo. */
const TEMPO_LIMITE_DO_CAPTCHA_MS = 30_000

let turnstileCarregado: Promise<ApiDoTurnstile> | undefined

/** Carrega o script do Turnstile uma única vez, só quando o primeiro token é pedido. */
function carregarTurnstileDoNavegador(): Promise<ApiDoTurnstile> {
  turnstileCarregado ??= new Promise<ApiDoTurnstile>((resolver, rejeitar) => {
    const script = document.createElement('script')
    script.src = SCRIPT_DO_TURNSTILE
    script.async = true
    script.onload = () => {
      const api = (window as unknown as { turnstile?: ApiDoTurnstile }).turnstile
      if (api) resolver(api)
      else rejeitar(new Error('Turnstile indisponível'))
    }
    script.onerror = () => rejeitar(new Error('Não foi possível carregar o Turnstile'))
    document.head.appendChild(script)
  }).catch((erro: unknown) => {
    turnstileCarregado = undefined
    throw erro
  })
  return turnstileCarregado
}

/** Executa um widget invisível do Turnstile fora da tela e devolve o token; o widget é removido em seguida. */
async function executarTurnstile(api: ApiDoTurnstile, sitekey: string, acao: AcaoDoCaptcha): Promise<string> {
  const container = document.createElement('div')
  container.dataset.turnstile = acao
  document.body.appendChild(container)
  let widget: string | undefined
  let relogio: ReturnType<typeof setTimeout> | undefined
  try {
    return await new Promise<string>((resolver, rejeitar) => {
      const falhar = () => rejeitar(new Error('O Turnstile não confirmou a pessoa'))
      relogio = setTimeout(falhar, TEMPO_LIMITE_DO_CAPTCHA_MS)
      widget = api.render(container, {
        sitekey,
        action: acao,
        execution: 'execute',
        // Só aparece se a Cloudflare exigir interação; no fluxo normal, nada é mostrado.
        appearance: 'interaction-only',
        callback: resolver,
        'error-callback': falhar,
        'expired-callback': falhar,
        'timeout-callback': falhar,
      })
      if (widget === undefined) falhar()
      else api.execute(widget)
    })
  } finally {
    clearTimeout(relogio)
    if (widget !== undefined) api.remove(widget)
    container.remove()
  }
}

const PWNED_PASSWORDS = 'https://api.pwnedpasswords.com/range/'

/** O SHA-1 da senha, em hexadecimal maiúsculo, como o Pwned Passwords indexa. */
async function sha1(senha: string, subtle: SubtleCrypto): Promise<string> {
  const resumo = await subtle.digest('SHA-1', new TextEncoder().encode(senha))
  return Array.from(new Uint8Array(resumo), (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
}

/**
 * Os serviços reais. A consulta ao Pwned Passwords usa k-anonimato: só os 5 primeiros caracteres do SHA-1 saem do
 * navegador, e o resto do hash é comparado aqui com os sufixos devolvidos.
 */
export function criarServicosDoNavegador({
  fetch: buscar = (...args) => globalThis.fetch(...args),
  subtle = globalThis.crypto.subtle,
  siteKeyDoTurnstile,
  carregarTurnstile = carregarTurnstileDoNavegador,
}: {
  fetch?: typeof globalThis.fetch
  subtle?: SubtleCrypto
  /** A site key pública do Turnstile (`VITE_TURNSTILE_SITE_KEY`); sem ela, nenhum token é pedido. */
  siteKeyDoTurnstile?: string
  /** Como a API do Turnstile chega; o padrão carrega o script da Cloudflare. */
  carregarTurnstile?: () => Promise<ApiDoTurnstile>
} = {}): ServicosDoNavegador {
  return {
    async senhaVazada(senha) {
      const hash = await sha1(senha, subtle)
      const prefixo = hash.slice(0, 5)
      const sufixo = hash.slice(5)
      // Com o preenchimento, o tamanho da resposta não revela o prefixo; as linhas de preenchimento têm contagem 0.
      const resposta = await buscar(PWNED_PASSWORDS + prefixo, { headers: { 'Add-Padding': 'true' } })
      if (!resposta.ok) throw new Error(`Pwned Passwords respondeu ${resposta.status}`)
      return (await resposta.text()).split('\n').some((linha) => {
        const [sufixoVazado, vezes] = linha.trim().split(':')
        return sufixoVazado === sufixo && Number(vezes) > 0
      })
    },
    async tokenDoCaptcha(acao) {
      const sitekey = siteKeyDoTurnstile?.trim()
      if (!sitekey) return null
      return executarTurnstile(await carregarTurnstile(), sitekey, acao)
    },
  }
}

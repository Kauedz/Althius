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
  /** O Google Identity Services; ausente quando o Client ID do Google não está configurado, e então não há Google. */
  google?: ServicoDoGoogle
  /**
   * Um token novo do Cloudflare Turnstile invisível para esta ação, a mandar em `options.captchaToken` da chamada ao
   * Supabase Auth (ou no corpo da Edge Function account-password, que o repassa a ele), que o valida quando o CAPTCHA
   * está ligado no projeto. `null` quando o Turnstile não está
   * configurado (sem site key): a chamada segue sem token. Falha quando o Turnstile não confirma a pessoa.
   */
  tokenDoCaptcha: (acao: AcaoDoCaptcha) => Promise<string | null>
}

/**
 * O "Continuar com Google" por ID token: o botão oficial e o One Tap (via FedCM). O login pede só `openid`, `email` e
 * `profile`, os escopos fixos do ID token do Google; nenhum outro escopo é pedido.
 */
export interface ServicoDoGoogle {
  /**
   * Desenha o botão oficial em `elemento` e oferece o One Tap. Cada conta escolhida chega a `aoReceberCredencial` como
   * um ID token com `nonceComHash` (o SHA-256 do nonce); cancelar a escolha não chama nada. Devolve a limpeza, que
   * fecha o One Tap e para de entregar credenciais.
   */
  iniciar: (opcoes: {
    elemento: HTMLElement
    nonceComHash: string
    contexto: 'signin' | 'signup'
    aoReceberCredencial: (idToken: string) => void
  }) => () => void
}

/**
 * As chamadas ao Supabase Auth protegidas pelo CAPTCHA; vira o `action` do Turnstile, visível na Cloudflare. A
 * `troca_de_senha` vai à Edge Function account-password, que repassa o token ao Supabase Auth ao conferir a senha atual.
 */
export type AcaoDoCaptcha =
  | 'cadastro'
  | 'reenvio_do_cadastro'
  | 'login_com_senha'
  | 'codigo_de_entrada'
  | 'redefinicao_de_senha'
  | 'troca_de_senha'

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
  googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID,
  carregarGoogle = carregarGoogleIdentityServices,
  siteKeyDoTurnstile,
  carregarTurnstile = carregarTurnstileDoNavegador,
}: {
  fetch?: typeof globalThis.fetch
  subtle?: SubtleCrypto
  /** O Client ID Web do Google Cloud; sem ele, não há Google. */
  googleClientId?: string
  /** Carrega o script do Google Identity Services; só a implementação real o busca. */
  carregarGoogle?: () => Promise<GoogleAccountsId>
  /** A site key pública do Turnstile (`VITE_TURNSTILE_SITE_KEY`); sem ela, nenhum token é pedido. */
  siteKeyDoTurnstile?: string
  /** Como a API do Turnstile chega; o padrão carrega o script da Cloudflare. */
  carregarTurnstile?: () => Promise<ApiDoTurnstile>
} = {}): ServicosDoNavegador {
  return {
    ...(googleClientId ? { google: criarGoogle(googleClientId, carregarGoogle) } : {}),
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

/** A parte de `google.accounts.id` que a Althius usa. */
export interface GoogleAccountsId {
  initialize: (configuracao: Record<string, unknown> & { callback: (resposta: { credential: string }) => void }) => void
  renderButton: (elemento: HTMLElement, opcoes: Record<string, unknown>) => void
  prompt: () => void
  cancel: () => void
}

const SCRIPT_DO_GOOGLE = 'https://accounts.google.com/gsi/client'

let scriptDoGoogle: Promise<GoogleAccountsId> | null = null

/** Carrega o script do Google Identity Services uma vez por página. */
function carregarGoogleIdentityServices(): Promise<GoogleAccountsId> {
  scriptDoGoogle ??= new Promise<GoogleAccountsId>((resolver, rejeitar) => {
    const script = document.createElement('script')
    script.src = SCRIPT_DO_GOOGLE
    script.async = true
    script.onload = () => {
      const id = (window as { google?: { accounts?: { id?: GoogleAccountsId } } }).google?.accounts?.id
      if (id) resolver(id)
      else rejeitar(new Error('Google Identity Services indisponível'))
    }
    script.onerror = () => rejeitar(new Error('Google Identity Services indisponível'))
    document.head.append(script)
  }).catch((erro: unknown) => {
    scriptDoGoogle = null
    throw erro
  })
  return scriptDoGoogle
}

/** A largura do botão oficial, em pixels, dentro dos limites que o Google aceita. */
const larguraDoBotao = (elemento: HTMLElement) => Math.min(400, Math.max(200, elemento.clientWidth || 320))

function criarGoogle(clientId: string, carregar: () => Promise<GoogleAccountsId>): ServicoDoGoogle {
  return {
    iniciar({ elemento, nonceComHash, contexto, aoReceberCredencial }) {
      let ativo = true
      let id: GoogleAccountsId | null = null
      carregar().then((carregado) => {
        if (!ativo) return
        id = carregado
        // Sem `scope`: o ID token do Google traz só openid, email e profile.
        carregado.initialize({
          client_id: clientId,
          nonce: nonceComHash,
          context: contexto,
          ux_mode: 'popup',
          use_fedcm_for_prompt: true,
          use_fedcm_for_button: true,
          itp_support: true,
          auto_select: false,
          cancel_on_tap_outside: true,
          callback: ({ credential }) => { if (ativo) aoReceberCredencial(credential) },
        })
        carregado.renderButton(elemento, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          locale: 'pt-BR',
          width: larguraDoBotao(elemento),
        })
        carregado.prompt()
      }).catch(() => {
        // Sem o script (bloqueado ou fora do ar), o Google só não aparece; os outros métodos continuam.
      })
      return () => {
        ativo = false
        id?.cancel()
        elemento.replaceChildren()
      }
    },
  }
}

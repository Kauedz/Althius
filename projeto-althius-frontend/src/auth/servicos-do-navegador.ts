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
}: {
  fetch?: typeof globalThis.fetch
  subtle?: SubtleCrypto
  /** O Client ID Web do Google Cloud; sem ele, não há Google. */
  googleClientId?: string
  /** Carrega o script do Google Identity Services; só a implementação real o busca. */
  carregarGoogle?: () => Promise<GoogleAccountsId>
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

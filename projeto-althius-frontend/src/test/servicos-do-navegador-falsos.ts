import type { AcaoDoCaptcha, ServicosDoNavegador } from '@/auth/servicos-do-navegador'

export interface OpcoesDosServicosFalsos {
  /** As senhas que a consulta ao Pwned Passwords encontra em vazamentos. */
  senhasVazadas?: string[]
  /** Como a consulta ao Pwned Passwords se comporta: responde, falha (fora do ar) ou nunca responde. */
  consultaDeVazadas?: 'responde' | 'falha' | 'demora'
  /**
   * O Turnstile: desligado (sem site key, nenhum token) ou ligado, entregando um token novo a cada pedido. Com
   * `falhasDoCaptcha`, os primeiros pedidos falham, como quando o Turnstile não consegue confirmar a pessoa.
   */
  captcha?: 'desligado' | 'ligado'
  falhasDoCaptcha?: number
  /**
   * O Google Identity Services, presente quando o Client ID está configurado; sem esta opção, não há Google. Com
   * `contaNoNavegador`, há sessão Google neste navegador e o One Tap a oferece.
   */
  google?: { contaNoNavegador?: ContaDoGoogle }
}

/** Uma conta Google, como a escolha de conta a mostra. */
export interface ContaDoGoogle {
  email: string
  nome: string
}

/** Os serviços do navegador do teste: nunca chamam a rede. */
export function criarServicosDoNavegadorFalsos({
  senhasVazadas = [],
  consultaDeVazadas = 'responde',
  captcha = 'desligado',
  falhasDoCaptcha = 0,
  google,
}: OpcoesDosServicosFalsos = {}) {
  const senhasConsultadas: string[] = []
  const captchasPedidos: AcaoDoCaptcha[] = []
  const servicos: ServicosDoNavegador = {
    senhaVazada(senha) {
      senhasConsultadas.push(senha)
      if (consultaDeVazadas === 'falha') return Promise.reject(new Error('Pwned Passwords indisponível'))
      if (consultaDeVazadas === 'demora') return new Promise(() => {})
      return Promise.resolve(senhasVazadas.includes(senha))
    },
    tokenDoCaptcha(acao) {
      if (captcha === 'desligado') return Promise.resolve(null)
      captchasPedidos.push(acao)
      if (captchasPedidos.length <= falhasDoCaptcha) return Promise.reject(new Error('Turnstile não confirmou a pessoa'))
      return Promise.resolve(`token-captcha-${captchasPedidos.length}`)
    },
  }
  const googleFalso = criarGoogleFalso(google)
  if (googleFalso) servicos.google = googleFalso.servico
  return {
    servicos,
    /** As senhas que a tela mandou verificar, na ordem. */
    senhasConsultadas: () => [...senhasConsultadas],
    /** O Google do teste; lança se o teste não o configurou. */
    google: googleFalso?.controles ?? semGoogle(),
    /** As ações para as quais o Turnstile ligado foi executado, na ordem; o token N é `token-captcha-N`. */
    captchasPedidos: () => [...captchasPedidos],
  }
}

/**
 * O ID token que o Google falso emite: um JWT de mentira, com o e-mail verificado, o nome e o nonce (já com hash) que
 * a página entregou ao Google.
 */
function idTokenDoGoogle(conta: ContaDoGoogle, nonce: string) {
  const payload = btoa(JSON.stringify({ iss: 'https://accounts.google.com', email: conta.email, email_verified: true, name: conta.nome, nonce }))
  return `cabecalho.${payload}.assinatura`
}

type ControlesDoGoogleFalso = NonNullable<ReturnType<typeof criarGoogleFalso>>['controles']

function semGoogle(): ControlesDoGoogleFalso {
  return new Proxy({} as ControlesDoGoogleFalso, { get: () => { throw new Error('o Google não foi configurado neste teste: passe navegador.google') } })
}

/** O Google Identity Services do teste: o botão oficial vira um botão comum; a escolha de conta e o One Tap, controles. */
function criarGoogleFalso(opcoes: OpcoesDosServicosFalsos['google']) {
  if (!opcoes) return null
  /** O Google iniciado agora numa tela; nenhum depois da limpeza. */
  let ativo: { nonceComHash: string; aoReceberCredencial: (idToken: string) => void; oneTap: boolean } | null = null
  let escolhaAberta = false
  let vezesIniciado = 0
  const noncesRecebidos: string[] = []

  const servico: NonNullable<ServicosDoNavegador['google']> = {
    iniciar({ elemento, nonceComHash, aoReceberCredencial }) {
      vezesIniciado++
      noncesRecebidos.push(nonceComHash)
      const atual = { nonceComHash, aoReceberCredencial, oneTap: opcoes.contaNoNavegador !== undefined }
      ativo = atual
      const botao = document.createElement('button')
      botao.type = 'button'
      botao.textContent = 'Continuar com Google'
      botao.addEventListener('click', () => { escolhaAberta = true })
      elemento.append(botao)
      return () => {
        botao.remove()
        if (ativo === atual) ativo = null
        escolhaAberta = false
      }
    },
  }

  function emitirCredencial(conta: ContaDoGoogle) {
    const atual = ativo!
    atual.oneTap = false
    escolhaAberta = false
    atual.aoReceberCredencial(idTokenDoGoogle(conta, atual.nonceComHash))
  }

  const controles = {
    /** Na escolha de conta aberta pelo botão, a pessoa escolhe `conta`. */
    escolherConta(conta: ContaDoGoogle) {
      if (!ativo || !escolhaAberta) throw new Error('a escolha de conta do Google não está aberta')
      emitirCredencial(conta)
    },
    /** A pessoa fecha a escolha de conta sem escolher: o Google não chama a página. */
    cancelarEscolha() {
      if (!escolhaAberta) throw new Error('a escolha de conta do Google não está aberta')
      escolhaAberta = false
    },
    /** O One Tap está oferecendo a conta Google do navegador agora. */
    oneTapVisivel: () => ativo?.oneTap === true,
    /** A pessoa aceita a conta que o One Tap oferece. */
    aceitarOneTap() {
      if (!ativo?.oneTap) throw new Error('o One Tap não está aberto')
      emitirCredencial(opcoes.contaNoNavegador!)
    },
    /** Quantas vezes alguma tela iniciou o Google (botão e One Tap). */
    vezesIniciado: () => vezesIniciado,
    /** Os nonces (com hash) que as telas entregaram ao Google, na ordem. */
    noncesRecebidos: () => [...noncesRecebidos],
  }
  return { servico, controles }
}

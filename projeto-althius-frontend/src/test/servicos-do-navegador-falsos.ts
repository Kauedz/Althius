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
}

/** Os serviços do navegador do teste: nunca chamam a rede. */
export function criarServicosDoNavegadorFalsos({
  senhasVazadas = [],
  consultaDeVazadas = 'responde',
  captcha = 'desligado',
  falhasDoCaptcha = 0,
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
  return {
    servicos,
    /** As senhas que a tela mandou verificar, na ordem. */
    senhasConsultadas: () => [...senhasConsultadas],
    /** As ações para as quais o Turnstile ligado foi executado, na ordem; o token N é `token-captcha-N`. */
    captchasPedidos: () => [...captchasPedidos],
  }
}

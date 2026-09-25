import type { ServicosDoNavegador } from '@/auth/servicos-do-navegador'

export interface OpcoesDosServicosFalsos {
  /** As senhas que a consulta ao Pwned Passwords encontra em vazamentos. */
  senhasVazadas?: string[]
  /** Como a consulta ao Pwned Passwords se comporta: responde, falha (fora do ar) ou nunca responde. */
  consultaDeVazadas?: 'responde' | 'falha' | 'demora'
}

/** Os serviços do navegador do teste: nunca chamam a rede. */
export function criarServicosDoNavegadorFalsos({ senhasVazadas = [], consultaDeVazadas = 'responde' }: OpcoesDosServicosFalsos = {}) {
  const senhasConsultadas: string[] = []
  const servicos: ServicosDoNavegador = {
    senhaVazada(senha) {
      senhasConsultadas.push(senha)
      if (consultaDeVazadas === 'falha') return Promise.reject(new Error('Pwned Passwords indisponível'))
      if (consultaDeVazadas === 'demora') return new Promise(() => {})
      return Promise.resolve(senhasVazadas.includes(senha))
    },
  }
  return {
    servicos,
    /** As senhas que a tela mandou verificar, na ordem. */
    senhasConsultadas: () => [...senhasConsultadas],
  }
}

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
}: { fetch?: typeof globalThis.fetch; subtle?: SubtleCrypto } = {}): ServicosDoNavegador {
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
  }
}

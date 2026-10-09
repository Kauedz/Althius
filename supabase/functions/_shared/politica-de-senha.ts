// A política de senha da Althius (spec autenticacao-google-email, "Política de senha"; ADR-0012), conferida também no
// servidor: a tela já a aplica, mas quem chama a Edge Function direto não passa pela tela. NIST SP 800-63B: mínimo de 8
// caracteres, sem regras de composição, e nada de senha que já apareceu em vazamentos. O máximo vem do Supabase Auth:
// o bcrypt só usa os primeiros 72 bytes, e o GoTrue recusa uma senha maior.

/** O mínimo da política, contado como a tela conta (`senha.length`). */
export const TAMANHO_MINIMO_DA_SENHA = 8

/** O máximo que o Supabase Auth aceita, em bytes UTF-8: um acento ou um emoji conta mais de um. */
export const TAMANHO_MAXIMO_DA_SENHA_EM_BYTES = 72

/** Por que a nova senha foi recusada; a tela escolhe o texto por este motivo. */
export type MotivoDaSenhaFraca = 'curta' | 'longa' | 'vazada'

/** Quanto a consulta de senhas vazadas pode demorar antes de a troca seguir sem ela. */
const TEMPO_LIMITE_DA_CONSULTA_MS = 2_000

const PWNED_PASSWORDS = 'https://api.pwnedpasswords.com/range/'

/** A senha fora do tamanho da política, ou null quando o tamanho serve. */
export function conferirTamanhoDaSenha(senha: string): MotivoDaSenhaFraca | null {
  if (senha.length < TAMANHO_MINIMO_DA_SENHA) return 'curta'
  if (new TextEncoder().encode(senha).length > TAMANHO_MAXIMO_DA_SENHA_EM_BYTES) return 'longa'
  return null
}

/** O SHA-1 da senha, em hexadecimal maiúsculo, como o Pwned Passwords indexa. */
async function sha1(senha: string): Promise<string> {
  const resumo = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(senha))
  return Array.from(new Uint8Array(resumo), (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
}

/**
 * Se a senha já apareceu em vazamentos, pelo Pwned Passwords do HaveIBeenPwned com k-anonimato: só os 5 primeiros
 * caracteres do SHA-1 saem do servidor, e o resto é comparado aqui com os sufixos devolvidos (com preenchimento, as
 * linhas de contagem 0 não contam). `indisponivel` quando o serviço falha ou demora: quem chama não bloqueia por isso,
 * como na tela.
 */
export async function consultarSenhaVazada(
  senha: string,
  buscar: typeof fetch,
  tempoLimiteMs = TEMPO_LIMITE_DA_CONSULTA_MS,
): Promise<'vazada' | 'limpa' | 'indisponivel'> {
  const hash = await sha1(senha)
  const sufixo = hash.slice(5)
  const controle = new AbortController()
  const relogio = setTimeout(() => controle.abort(), tempoLimiteMs)
  try {
    const resposta = await buscar(PWNED_PASSWORDS + hash.slice(0, 5), {
      headers: { 'Add-Padding': 'true' },
      signal: controle.signal,
    })
    if (!resposta.ok) {
      await resposta.body?.cancel()
      return 'indisponivel'
    }
    const vazada = (await resposta.text()).split('\n').some((linha) => {
      const [sufixoVazado, vezes] = linha.trim().split(':')
      return sufixoVazado === sufixo && Number(vezes) > 0
    })
    return vazada ? 'vazada' : 'limpa'
  } catch {
    return 'indisponivel'
  } finally {
    clearTimeout(relogio)
  }
}

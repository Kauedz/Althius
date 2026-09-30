// Quem pode chamar o signal-scan: só o servidor. A função sai com `verify_jwt = true` (supabase/config.toml), então o
// gateway do Supabase já conferiu a assinatura do JWT antes de a requisição chegar aqui; basta ver que o papel é o de
// serviço. A comparação com a chave de serviço do ambiente continua valendo, mas sozinha falha quando o Supabase injeta
// na função uma chave diferente da legada que o painel e o CLI mostram (visto em 30/09/2026: o gateway aceitou o JWT
// `service_role` e a comparação recusou).

const codificar = new TextEncoder()

/** Compara sem vazar, pelo tempo, quantos caracteres batem: compara os resumos, de mesmo tamanho. */
async function iguais(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', codificar.encode(a)),
    crypto.subtle.digest('SHA-256', codificar.encode(b)),
  ])
  const va = new Uint8Array(ha)
  const vb = new Uint8Array(hb)
  let diferenca = 0
  for (let i = 0; i < va.length; i++) diferenca |= va[i] ^ vb[i]
  return diferenca === 0
}

/** O papel (`role`) do JWT do cabeçalho, sem conferir a assinatura (o gateway já conferiu), ou nulo. */
function papelDoJwt(token: string): string | null {
  const partes = token.split('.')
  if (partes.length !== 3) return null
  try {
    const base64 = partes[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))) as { role?: unknown }
    return typeof payload.role === 'string' ? payload.role : null
  } catch {
    return null
  }
}

/** Se o cabeçalho Authorization é do servidor: a chave de serviço do ambiente ou um JWT com o papel de serviço. */
export async function autorizadoComoServidor(authorization: string, chaveDeServico: string): Promise<boolean> {
  if (await iguais(authorization, `Bearer ${chaveDeServico}`)) return true
  const achado = authorization.match(/^Bearer\s+(\S+)$/)
  return !!achado && papelDoJwt(achado[1]) === 'service_role'
}

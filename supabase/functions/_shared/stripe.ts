// O Stripe por REST, sem SDK: as chamadas que a cobrança usa (cliente, checkout, portal, assinatura) e a conferência
// da assinatura do webhook. A chave secreta e o segredo do webhook ficam só nos segredos do Supabase.

export class StripeError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(`Stripe respondeu HTTP ${status}${code ? ` (${code})` : ''}`)
    this.name = 'StripeError'
  }
}

/** Monta o corpo application/x-www-form-urlencoded com a notação de colchetes do Stripe. */
export function formDoStripe(valor: Record<string, unknown>, prefixo = ''): string[] {
  const partes: string[] = []
  for (const [chave, item] of Object.entries(valor)) {
    if (item === undefined || item === null) continue
    const nome = prefixo ? `${prefixo}[${chave}]` : chave
    if (Array.isArray(item)) {
      item.forEach((elemento, indice) => {
        if (typeof elemento === 'object' && elemento !== null) {
          partes.push(...formDoStripe(elemento as Record<string, unknown>, `${nome}[${indice}]`))
        } else partes.push(`${encodeURIComponent(`${nome}[${indice}]`)}=${encodeURIComponent(String(elemento))}`)
      })
    } else if (typeof item === 'object') {
      partes.push(...formDoStripe(item as Record<string, unknown>, nome))
    } else {
      partes.push(`${encodeURIComponent(nome)}=${encodeURIComponent(String(item))}`)
    }
  }
  return partes
}

export interface Stripe {
  post(caminho: string, corpo: Record<string, unknown>): Promise<Record<string, unknown>>
  get(caminho: string): Promise<Record<string, unknown>>
}

export function stripeHttp(chaveSecreta: string, fetcher: typeof fetch = fetch): Stripe {
  async function chamar(metodo: 'GET' | 'POST', caminho: string, corpo?: Record<string, unknown>) {
    const resposta = await fetcher(`https://api.stripe.com/v1/${caminho}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${chaveSecreta}`,
        ...(corpo ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      ...(corpo ? { body: formDoStripe(corpo).join('&') } : {}),
    })
    const json = (await resposta.json().catch(() => ({}))) as Record<string, unknown>
    if (!resposta.ok) {
      const erro = (json.error ?? {}) as { code?: string; type?: string }
      throw new StripeError(resposta.status, erro.code ?? erro.type ?? '')
    }
    return json
  }
  return {
    post: (caminho, corpo) => chamar('POST', caminho, corpo),
    get: (caminho) => chamar('GET', caminho),
  }
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diferenca = 0
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diferenca === 0
}

/**
 * Confere o cabeçalho Stripe-Signature (t=…,v1=…): HMAC-SHA256 de "t.corpo" com o segredo do webhook, dentro da
 * tolerância de tempo. Devolve true só quando uma das assinaturas v1 confere.
 */
export async function assinaturaDoStripeValida(
  corpo: string,
  cabecalho: string | null,
  segredo: string,
  agoraEmSegundos: number,
  toleranciaEmSegundos = 300,
): Promise<boolean> {
  if (!cabecalho || !segredo) return false
  const partes = cabecalho.split(',').map((p) => p.trim().split('='))
  const t = partes.find(([k]) => k === 't')?.[1]
  const assinaturas = partes.filter(([k]) => k === 'v1').map(([, v]) => v ?? '')
  if (!t || !/^\d+$/.test(t) || assinaturas.length === 0) return false
  if (Math.abs(agoraEmSegundos - Number(t)) > toleranciaEmSegundos) return false
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const esperado = hex(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(`${t}.${corpo}`)))
  return assinaturas.some((v) => iguais(v, esperado))
}

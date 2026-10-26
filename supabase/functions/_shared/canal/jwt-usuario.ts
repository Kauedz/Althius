export interface JwtFerramentaWhatsApp {
  userId: string
  segredo: string
  agora?: number
}

function base64url(bytes: Uint8Array): string {
  let binario = ''
  for (const byte of bytes) binario += String.fromCharCode(byte)
  return btoa(binario).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

/** Emite um JWT de sessão curto para executar RPCs da tela em nome do participante WhatsApp. */
export async function criarJwtDeFerramentaWhatsApp({ userId, segredo, agora = Math.floor(Date.now() / 1000) }: JwtFerramentaWhatsApp): Promise<string> {
  if (!userId || !segredo) throw new Error('Identidade do Canal indisponível')
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const payload = base64url(new TextEncoder().encode(JSON.stringify({
    aud: 'authenticated',
    sub: userId,
    role: 'authenticated',
    canal: 'whatsapp',
    iat: agora,
    exp: agora + 60,
  })))
  const unsigned = `${header}.${payload}`
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(unsigned)))
  return `${unsigned}.${base64url(signature)}`
}

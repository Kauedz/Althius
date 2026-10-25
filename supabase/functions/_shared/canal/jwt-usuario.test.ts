import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { criarJwtDeFerramentaWhatsApp } from './jwt-usuario.ts'

function decodificar(payload: string) {
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(payload.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))))
}

Deno.test('JWT de ferramenta representa a Conta autenticada por 60 segundos e identifica o WhatsApp', async () => {
  const emitidoEm = 1_800_000_000
  const jwt = await criarJwtDeFerramentaWhatsApp({ userId: '11111111-1111-4111-8111-111111111111', segredo: 'chave-de-teste', agora: emitidoEm })
  const [header, payload] = jwt.split('.')
  assertEquals(decodificar(header).alg, 'HS256')
  assertEquals(decodificar(payload), {
    aud: 'authenticated',
    sub: '11111111-1111-4111-8111-111111111111',
    role: 'authenticated',
    canal: 'whatsapp',
    iat: emitidoEm,
    exp: emitidoEm + 60,
  })
})

Deno.test('JWT de ferramenta recusa Conta ausente e segredo vazio', async () => {
  await assertRejects(() => criarJwtDeFerramentaWhatsApp({ userId: '', segredo: 'chave' }))
  await assertRejects(() => criarJwtDeFerramentaWhatsApp({ userId: '11111111-1111-4111-8111-111111111111', segredo: '' }))
})

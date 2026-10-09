import { assertEquals } from 'jsr:@std/assert@1'
import { conferirTamanhoDaSenha, consultarSenhaVazada } from './politica-de-senha.ts'

/** SHA-1 de "password": 5BAA6 1E4C9B93F3F0682250B6CF8331B7EE68FD8. */
const SUFIXO_DE_PASSWORD = '1E4C9B93F3F0682250B6CF8331B7EE68FD8'

/** Um Pwned Passwords falso, que registra o que o servidor enviou e responde `corpo`. */
function pwnedPasswordsFalso(corpo: string, status = 200) {
  const pedidos: { url: string; headers: Record<string, string> }[] = []
  const buscar: typeof fetch = (entrada, init) => {
    pedidos.push({ url: String(entrada), headers: init?.headers as Record<string, string> })
    return Promise.resolve(new Response(corpo, { status }))
  }
  return { buscar, pedidos }
}

Deno.test('a senha precisa de 8 caracteres e cabe em 72 bytes, sem regras de composição', () => {
  assertEquals(conferirTamanhoDaSenha('1234567'), 'curta')
  assertEquals(conferirTamanhoDaSenha('12345678'), null)
  assertEquals(conferirTamanhoDaSenha('a'.repeat(72)), null)
  assertEquals(conferirTamanhoDaSenha('a'.repeat(73)), 'longa')
  // Em bytes: 36 "ç" são 72 bytes; 37, já não cabem.
  assertEquals(conferirTamanhoDaSenha('ç'.repeat(36)), null)
  assertEquals(conferirTamanhoDaSenha('ç'.repeat(37)), 'longa')
})

Deno.test('só os 5 primeiros caracteres do SHA-1 saem do servidor, com preenchimento na resposta', async () => {
  const { buscar, pedidos } = pwnedPasswordsFalso(`${SUFIXO_DE_PASSWORD}:9659365\r\n`)

  assertEquals(await consultarSenhaVazada('password', buscar), 'vazada')
  assertEquals(pedidos, [{ url: 'https://api.pwnedpasswords.com/range/5BAA6', headers: { 'Add-Padding': 'true' } }])
  assertEquals(JSON.stringify(pedidos).includes(SUFIXO_DE_PASSWORD), false)
})

Deno.test('uma senha fora da lista, ou só nas linhas de preenchimento, não é vazada', async () => {
  assertEquals(await consultarSenhaVazada('password', pwnedPasswordsFalso('0018A45C4D1DEF81644B54AB7F969B88D65:3\r\n').buscar), 'limpa')
  assertEquals(await consultarSenhaVazada('password', pwnedPasswordsFalso(`${SUFIXO_DE_PASSWORD}:0\r\n`).buscar), 'limpa')
})

Deno.test('com o serviço fora do ar, recusando ou demorando, a consulta fica indisponível, sem bloquear', async () => {
  assertEquals(await consultarSenhaVazada('password', pwnedPasswordsFalso('', 503).buscar), 'indisponivel')
  assertEquals(await consultarSenhaVazada('password', () => Promise.reject(new TypeError('falha de rede'))), 'indisponivel')

  // Um serviço que nunca responde: a consulta desiste no tempo limite.
  const semResposta: typeof fetch = (_entrada, init) =>
    new Promise((_resolver, rejeitar) => init?.signal?.addEventListener('abort', () => rejeitar(new DOMException('', 'AbortError'))))
  assertEquals(await consultarSenhaVazada('password', semResposta, 10), 'indisponivel')
})

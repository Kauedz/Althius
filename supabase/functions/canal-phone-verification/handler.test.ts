import { assertEquals } from 'jsr:@std/assert@1'
import { createCanalSimulado } from '../_shared/canal/index.ts'
import { createHandler } from './handler.ts'

Deno.test('a verificação envia o template pelo simulador sem devolver o código ao navegador', async () => {
  const canal = createCanalSimulado()
  const handler = createHandler({
    db: {
      getUser: async () => ({ id: 'user-1', email: 'ana@example.test' }),
      rpc: async (name) => name === 'start_my_channel_phone_verification' ? '034921' : '5511999990000',
    },
    canal,
    mail: { send: async () => ({ id: 'email-1' }) },
    template: 'codigo_verificacao_telefone',
  })
  const response = await handler(new Request('https://local.test', {
    method: 'POST', headers: { Authorization: 'Bearer sessao', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'start', phone: '+55 (11) 99999-0000' }),
  }))
  assertEquals(response.status, 200)
  assertEquals(await response.json(), { ok: true })
  assertEquals(canal.envios, [{ tipo: 'template', para: '5511999990000', nome: 'codigo_verificacao_telefone', idioma: 'pt_BR', parametros: ['034921'], categoria: 'autenticacao' }])
})

Deno.test('não permite solicitar código sem sessão autenticada', async () => {
  const handler = createHandler({
    db: { getUser: async () => null, rpc: async () => null },
    canal: createCanalSimulado(), mail: { send: async () => ({}) }, template: 'codigo_verificacao_telefone',
  })
  const response = await handler(new Request('https://local.test', { method: 'POST', body: '{}' }))
  assertEquals(response.status, 401)
})

Deno.test('confirma o telefone e envia aviso ao e-mail da Conta', async () => {
  const mensagens: unknown[] = []
  const handler = createHandler({
    db: {
      getUser: async () => ({ id: 'user-1', email: 'ana@example.test' }),
      rpc: async () => [{ phone_e164: '+5511999990000', email: 'ana@example.test' }],
    },
    canal: createCanalSimulado(),
    mail: { send: async (email) => { mensagens.push(email); return { id: 'email-1' } } },
    template: 'codigo_verificacao_telefone',
  })
  const response = await handler(new Request('https://local.test', {
    method: 'POST', headers: { Authorization: 'Bearer sessao', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'confirm', code: '034921' }),
  }))
  assertEquals(response.status, 200)
  assertEquals(mensagens.length, 1)
  assertEquals((mensagens[0] as { to: string }).to, 'ana@example.test')
})

Deno.test('mantém aviso de e-mail pendente se o envio falhar e permite tentar de novo', async () => {
  let pendente = true
  let tentativas = 0
  const handler = createHandler({
    db: {
      getUser: async () => ({ id: 'user-1', email: 'ana@example.test' }),
      rpc: async (name) => {
        if (name === 'confirm_my_channel_phone') return [{ phone_e164: '+5511999990000', email: 'ana@example.test' }]
        if (name === 'get_my_channel_phone_verification_email') return pendente ? [{ phone_e164: '+5511999990000', email: 'ana@example.test' }] : []
        if (name === 'mark_my_channel_phone_email_sent') { pendente = false; return null }
        return null
      },
    },
    canal: createCanalSimulado(),
    mail: { send: async () => { tentativas++; if (tentativas === 1) throw new Error('indisponível') } },
    template: 'codigo_verificacao_telefone',
  })
  const confirmar = await handler(new Request('https://local.test', {
    method: 'POST', headers: { Authorization: 'Bearer sessao', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'confirm', code: '034921' }),
  }))
  assertEquals(await confirmar.json(), { ok: true, emailPending: true })
  const reenviar = await handler(new Request('https://local.test', {
    method: 'POST', headers: { Authorization: 'Bearer sessao', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'retry-email' }),
  }))
  assertEquals(await reenviar.json(), { ok: true, emailPending: false })
  assertEquals(pendente, false)
  assertEquals(tentativas, 2)
})

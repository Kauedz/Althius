import { deepStrictEqual as assertEquals } from 'node:assert/strict'
import { createHandler, type Deps } from './handler.ts'

const agora = Date.parse('2026-10-24T12:00:00Z')
function montar(ultimoSinal: string | null, extra: Partial<Deps> = {}) {
  const gravados: string[] = []
  const deps = {
    db: {
      userFromJwt: () => Promise.resolve({ userId: 'ana' }),
      startRun: () => { gravados.push('pedido'); throw new Error('não deve guardar') },
      iniciarEnvioAoCrm: () => { gravados.push('crm'); throw new Error('não deve guardar') },
    },
    executar: () => Promise.resolve(),
    waitUntil: () => {},
    appOrigin: 'https://app.test',
    comHermes: true,
    agora: () => agora,
    ultimoSinalDoMotor: () => Promise.resolve(ultimoSinal),
    ...extra,
  }
  const handler = createHandler(deps)
  return {
    gravados,
    pedir: (action: string) => handler(new Request('http://local.test', {
      method: 'POST', headers: { Authorization: 'Bearer teste', apikey: 'teste' }, body: JSON.stringify({ action }),
    })),
  }
}

Deno.test('motor ausente: capability recusa e nenhum pedido é guardado, inclusive envio ao CRM', async () => {
  const app = montar(null)
  assertEquals(await (await app.pedir('capability')).json(), { available: false, motivo: 'motor_fora_do_ar' })
  for (const action of ['send', 'enviar_ao_crm']) {
    const resposta = await app.pedir(action)
    assertEquals(resposta.status, 503)
    assertEquals((await resposta.json()).motivo, 'motor_fora_do_ar')
  }
  assertEquals(app.gravados, [])
})

for (const [sinal, esperado] of [
  ['2026-10-24T11:58:00.001Z', { available: true }],
  ['2026-10-24T11:58:00Z', { available: false, motivo: 'motor_fora_do_ar' }],
  ['2026-10-24T11:57:59Z', { available: false, motivo: 'motor_fora_do_ar' }],
  ['inválido', { available: false, motivo: 'motor_fora_do_ar' }],
  ['2026-10-24T12:01:00Z', { available: false, motivo: 'motor_fora_do_ar' }],
] as const) {
  Deno.test(`capability considera o sinal ${sinal}`, async () => {
    assertEquals(await (await montar(sinal).pedir('capability')).json(), esperado)
  })
}
Deno.test('falha ao ler sinal recusa pedidos', async () => {
  const app = montar(null, { ultimoSinalDoMotor: () => Promise.reject(new Error('banco indisponível')) })
  assertEquals((await app.pedir('send')).status, 503)
  assertEquals(app.gravados, [])
})
Deno.test('sem Hermes preserva a disponibilidade pelo modelo, com motivo quando ausente', async () => {
  assertEquals(await (await montar(null, { comHermes: false }).pedir('capability')).json(), { available: true })
  assertEquals(await (await montar(null, { comHermes: false, executar: null }).pedir('capability')).json(), {
    available: false, motivo: 'sem_modelo',
  })
})

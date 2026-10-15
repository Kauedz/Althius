// A entrega só fica confirmada depois do post (slack-canal 09): reservar, postar e confirmar. Se o Slack falhar, a reserva
// é solta para o relógio do banco tentar de novo; numa recusa definitiva do Slack, desiste. Tudo no log com o run_id.
import { assertEquals } from 'jsr:@std/assert@1'
import { createHandler, type Entrega } from './handler.ts'

const SEGREDO = 'segredo-interno-da-entrega'
const RUN = '7e000000-0000-4000-8000-000000000009'

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

const SUCESSO: Entrega = {
  status: 'succeeded',
  codigoDoErro: null,
  resposta: 'A Alfa e a Beta.',
  canal: 'C0GERAL',
  threadTs: '1700000000.000100',
  token: 'xoxb-norte',
}

function montar(
  slack: () => Response,
  opcoes: { entrega?: Entrega; decisao?: 'nova_tentativa' | 'desistiu'; confirmarFalha?: boolean } = {},
) {
  const c = {
    ordem: [] as string[],
    falhas: [] as { motivo: string; final: boolean }[],
    logs: [] as Record<string, unknown>[],
  }
  const handler = createHandler({
    db: {
      reservarEntrega: () => {
        c.ordem.push('reservar')
        return Promise.resolve(opcoes.entrega ?? SUCESSO)
      },
      confirmarEntrega: () => {
        c.ordem.push('confirmar')
        return opcoes.confirmarFalha ? Promise.reject(new Error('banco')) : Promise.resolve()
      },
      falharEntrega: (_runId, motivo, final) => {
        c.ordem.push('falhar')
        c.falhas.push({ motivo, final })
        return Promise.resolve(opcoes.decisao ?? 'nova_tentativa')
      },
    },
    segredoInterno: SEGREDO,
    fetch: (() => {
      c.ordem.push('postar')
      return Promise.resolve(slack())
    }) as typeof fetch,
    log: (campos) => c.logs.push(campos),
  })
  const chamar = () =>
    handler(
      new Request('https://proj.supabase.co/functions/v1/slack-channel-delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-slack-delivery-secret': SEGREDO },
        body: JSON.stringify({ run_id: RUN }),
      }),
    )
  return { c, chamar }
}

Deno.test('a entrega só é confirmada depois de o Slack aceitar o post', async () => {
  const m = montar(() => json({ ok: true, ts: '1.2' }))
  const resposta = await m.chamar()
  assertEquals(resposta.status, 200)
  assertEquals(m.c.ordem, ['reservar', 'postar', 'confirmar'])
  assertEquals(m.c.falhas, [])
})

Deno.test('uma recusa do Slack não confirma: a falha é definitiva e fica no log com o run_id', async () => {
  const m = montar(() => json({ ok: false, error: 'channel_not_found' }), { decisao: 'desistiu' })
  const resposta = await m.chamar()
  assertEquals(resposta.status, 502)
  assertEquals(m.c.ordem, ['reservar', 'postar', 'falhar'])
  assertEquals(m.c.falhas, [{ motivo: 'recusado:channel_not_found', final: true }])
  const log = m.c.logs.find((l) => l.resultado === 'falha_ao_postar')!
  assertEquals([log.runId, log.decisao], [RUN, 'desistiu'])
})

Deno.test('o Slack fora do ar depois das tentativas solta a reserva para nova tentativa, sem confirmar', async () => {
  const m = montar(() => json({ ok: false }, 429))
  // Retry-After ausente: 1s e 2s de espera real nas tentativas de dentro; o teste aceita os ~3s.
  const resposta = await m.chamar()
  assertEquals(resposta.status, 502)
  assertEquals(m.c.ordem.filter((o) => o !== 'postar'), ['reservar', 'falhar'])
  assertEquals(m.c.falhas, [{ motivo: 'indisponivel:429', final: false }])
  assertEquals(m.c.logs.find((l) => l.resultado === 'falha_ao_postar')!.decisao, 'nova_tentativa')
})

Deno.test('canal retirado: nada postado, nada confirmado nem falhado (o banco já marcou na reserva)', async () => {
  const m = montar(() => json({ ok: true }), { entrega: { ...SUCESSO, token: null } })
  await m.chamar()
  assertEquals(m.c.ordem, ['reservar'])
})

Deno.test('o post saiu e a confirmação falhou: fica no log, a resposta ao banco segue 200', async () => {
  const m = montar(() => json({ ok: true }), { confirmarFalha: true })
  const resposta = await m.chamar()
  assertEquals(resposta.status, 200)
  assertEquals(m.c.logs.map((l) => l.resultado), ['falha_ao_confirmar', 'resposta_postada'])
})

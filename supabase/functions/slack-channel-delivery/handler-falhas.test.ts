// Falhas e Aprovações no thread (slack-canal 05): a Execução que falha é postada com o motivo humano, nunca como resposta;
// a Aprovação pedida pela Execução fica na fila da Althius e o thread avisa que ela aguarda lá, sem botões no Slack.
import { assert, assertEquals } from 'jsr:@std/assert@1'
import { createHandler, type Entrega, RESPOSTAS } from './handler.ts'

const SEGREDO = 'segredo-interno-da-entrega'
const RUN = '7e000000-0000-4000-8000-000000000005'

const ENTREGA: Entrega = {
  status: 'succeeded',
  codigoDoErro: null,
  resposta: 'Propus criar o negócio da Alfa no HubSpot.',
  canal: 'C0GERAL',
  threadTs: '1700000000.000100',
  token: 'xoxb-norte',
  aprovacoesPendentes: [],
}

/** Entrega uma Execução e devolve o que foi postado no thread (e a resposta da função). */
async function entregar(entrega: Entrega | null) {
  const postagens: { canal: string; thread_ts: string; text: string }[] = []
  const reservas: string[] = []
  const handler = createHandler({
    db: {
      reservarEntrega: (runId) => {
        reservas.push(runId)
        const proxima = entrega
        entrega = null
        return Promise.resolve(proxima)
      },
    },
    segredoInterno: SEGREDO,
    fetch: (async (entrada: string | URL | Request, init?: RequestInit) => {
      const corpo = await new Request(entrada, init).json()
      postagens.push({ canal: corpo.channel, thread_ts: corpo.thread_ts, text: corpo.text })
      return new Response(JSON.stringify({ ok: true, ts: '1.9' }), { headers: { 'Content-Type': 'application/json' } })
    }) as typeof fetch,
    log: () => {},
  })
  const chamar = () =>
    handler(
      new Request('https://proj.supabase.co/functions/v1/slack-channel-delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-slack-delivery-secret': SEGREDO },
        body: JSON.stringify({ run_id: RUN }),
      }),
    )
  const resposta = await chamar()
  return { resposta, postagens, reservas, chamar }
}

const falha = (codigo: string | null, extra: Partial<Entrega> = {}): Entrega => ({
  ...ENTREGA,
  status: 'failed',
  codigoDoErro: codigo,
  resposta: 'meia resposta que não pode sair',
  ...extra,
})

Deno.test('sem Créditos: o thread diz que o Workspace está sem Créditos, sem resposta inventada', async () => {
  const { postagens } = await entregar(falha('insufficient_credits'))
  assertEquals(postagens.map((p) => p.text), [RESPOSTAS.semCreditos])
})

Deno.test('sem contrato ativo: o thread diz que o Workspace está sem contrato', async () => {
  const { postagens } = await entregar(falha('contrato_inativo'))
  assertEquals(postagens.map((p) => p.text), [RESPOSTAS.semContrato])
})

Deno.test('erro do Agente: o thread diz que o Agente falhou, nunca a meia resposta', async () => {
  for (const codigo of ['model_error', 'model_unreachable', 'hermes_failed', 'tool_loop_limit', 'internal_error', null]) {
    const { postagens } = await entregar(falha(codigo))
    assertEquals(postagens.map((p) => p.text), [RESPOSTAS.falha], `código ${codigo}`)
  }
})

Deno.test('expirada por prazo: o thread diz que o pedido passou do tempo', async () => {
  const { postagens } = await entregar(falha('timeout', { resposta: null }))
  assertEquals(postagens.map((p) => p.text), [RESPOSTAS.passouDoTempo])
})

Deno.test('os outros motivos conhecidos também saem em palavras de quem pediu', async () => {
  const casos: [string, string][] = [
    ['membership_inactive', RESPOSTAS.semParticipacao],
    ['workspace_ai_key_invalid', RESPOSTAS.chaveDeIa],
    ['workspace_ai_key_unavailable', RESPOSTAS.chaveDeIa],
    ['workspace_ai_key_unsupported', RESPOSTAS.chaveDeIa],
  ]
  for (const [codigo, texto] of casos) {
    const { postagens } = await entregar(falha(codigo))
    assertEquals(postagens.map((p) => p.text), [texto], `código ${codigo}`)
  }
})

Deno.test('cada falha vai no thread do fio', async () => {
  const { postagens } = await entregar(falha('insufficient_credits'))
  assertEquals(postagens.map((p) => [p.canal, p.thread_ts]), [['C0GERAL', '1700000000.000100']])
})

Deno.test('Aprovação pendente: a resposta sai com o aviso de que ela aguarda na fila da Althius, num post só', async () => {
  const { postagens } = await entregar({ ...ENTREGA, aprovacoesPendentes: ['Criar o negócio da Alfa no HubSpot'] })
  assertEquals(postagens.length, 1)
  assertEquals(
    postagens[0].text,
    `${ENTREGA.resposta}\n\n${RESPOSTAS.aprovacoesNaFila(['Criar o negócio da Alfa no HubSpot'])}`,
  )
  assert(postagens[0].text.includes('fila de Aprovações da Althius'))
})

Deno.test('várias Aprovações pendentes: o aviso cita cada ação', async () => {
  const acoes = ['Criar o negócio da Alfa no HubSpot', 'Atualizar o contato da Beta']
  const { postagens } = await entregar({ ...ENTREGA, aprovacoesPendentes: acoes })
  const aviso = RESPOSTAS.aprovacoesNaFila(acoes)
  assert(postagens[0].text.endsWith(aviso))
  for (const acao of acoes) assert(aviso.includes(acao))
})

Deno.test('Aprovação pendente sem texto do Agente: o thread recebe só o aviso, não uma falha', async () => {
  const { postagens } = await entregar({ ...ENTREGA, resposta: null, aprovacoesPendentes: ['Criar o negócio da Alfa no HubSpot'] })
  assertEquals(postagens.map((p) => p.text), [RESPOSTAS.aprovacoesNaFila(['Criar o negócio da Alfa no HubSpot'])])
})

Deno.test('a ação escrita pelo Agente não vira menção no Slack', async () => {
  const { postagens } = await entregar({ ...ENTREGA, aprovacoesPendentes: ['Avisar <!channel> & time'] })
  assert(postagens[0].text.includes('"Avisar &lt;!channel&gt; &amp; time"'))
  assertEquals(postagens[0].text.includes('<!channel>'), false)
})

Deno.test('a Execução falhou depois de pedir a Aprovação: a falha sai com o aviso, porque a Aprovação continua na fila', async () => {
  const { postagens } = await entregar(falha('model_unreachable', { aprovacoesPendentes: ['Criar o negócio da Alfa no HubSpot'] }))
  assertEquals(postagens.map((p) => p.text), [
    `${RESPOSTAS.falha}\n\n${RESPOSTAS.aprovacoesNaFila(['Criar o negócio da Alfa no HubSpot'])}`,
  ])
})

Deno.test('Canal retirado antes da entrega: nem a falha nem o aviso da Aprovação são postados, e a entrega fica marcada', async () => {
  const { postagens, reservas, resposta } = await entregar(
    falha('insufficient_credits', { token: null, aprovacoesPendentes: ['Criar o negócio da Alfa no HubSpot'] }),
  )
  assertEquals(resposta.status, 200)
  assertEquals(reservas, [RUN])
  assertEquals(postagens, [])
})

Deno.test('a falha é postada uma vez só, mesmo que a entrega seja chamada de novo', async () => {
  const { postagens, chamar } = await entregar(falha('timeout'))
  await chamar()
  assertEquals(postagens.length, 1)
})

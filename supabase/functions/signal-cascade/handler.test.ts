// A porta da conversa para a cascata de Sinais (sinais em cascata, fatia 2): só o servidor chama (o worker do Hermes, com a
// chave de serviço); a resposta é só o que o Hermes pode repetir ao usuário: itens normalizados, créditos e mensagem neutra.
import { assert, assertEquals } from 'jsr:@std/assert@1'
import type { PedidoDeCascata, ResultadoDaCascata } from '../_shared/cascata-de-sinais/tipos.ts'
import { MARCA_INTERNA } from '../_shared/marca.ts'
import { createHandler, type MotorDaConversa } from './handler.ts'

const WS = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'
const CONTA = '33333333-3333-4333-8333-333333333333'

const resultado: ResultadoDaCascata = {
  desfecho: 'concluida',
  mensagem: '1 Sinal novo gravado.',
  creditosCobrados: 2,
  custoUsd: 0.18,
  sinais: [{
    contaId: CONTA, contaNome: 'Alfa', eventKey: 'vaga|alfa|analista|2026', phrase: 'Abriu vaga de Analista de Comex',
    firedAt: '2026-10-12T10:00:00Z', source: 'LinkedIn Vagas', evidence: 'Analista de Comex — Alfa, publicada em 12/10/2026.',
  }],
  novos: 1, repetidos: 0, semConta: 2, semContaNomes: ['Gama', 'Delta'], mercado: [],
  passos: [{ ordem: 1, handler: 'linkedin_vagas', estado: 'succeeded', itensEntrada: 0, itensSaida: 9 }],
}

function montar(r: ResultadoDaCascata | Error = resultado) {
  const pedidos: PedidoDeCascata[] = []
  const motor: MotorDaConversa = {
    rodar: (p) => (pedidos.push(p), r instanceof Error ? Promise.reject(r) : Promise.resolve(r)),
    catalogo: () => Promise.resolve([
      { signalType: 'vaga_comex', icp: 'A', name: 'Vaga de analista de comex', state: 'testing', scope: 'conta', semFonteMotivo: null, cadenceHours: 24 },
      { signalType: 'radar_habilitacao', icp: 'A', name: 'Habilitação no Radar', state: 'sem_fonte', scope: 'conta', semFonteMotivo: 'A consulta é individual; não há fonte pública em massa.', cadenceHours: 24 },
    ]),
  }
  const handler = createHandler({ motor, autorizado: (a) => a === 'Bearer chave-de-servico', log: () => {} })
  const pedir = (corpo: unknown, auth: string | null = 'Bearer chave-de-servico', method = 'POST') =>
    handler(new Request('http://x/signal-cascade', {
      method,
      headers: auth ? { Authorization: auth } : {},
      body: method === 'POST' ? JSON.stringify(corpo) : undefined,
    }))
  return { pedidos, pedir }
}

const valido = { workspaceId: WS, userId: USER, sinal: 'vaga_comex', chave: 'hermes:run-1:vaga_comex' }

Deno.test('só POST, e só com a chave de serviço', async () => {
  const { pedir, pedidos } = montar()
  assertEquals((await pedir(null, null, 'GET')).status, 405)
  assertEquals((await pedir(valido, null)).status, 401)
  assertEquals((await pedir(valido, 'Bearer outra')).status, 401)
  assertEquals(pedidos.length, 0)
})

Deno.test('entradas inválidas voltam 400 sem rodar nada', async () => {
  const { pedir, pedidos } = montar()
  const ruins = [
    { ...valido, workspaceId: 'x' },
    { ...valido, userId: 'x' },
    { ...valido, sinal: 'Vaga Comex!' },
    { ...valido, contas: ['x'] },
    { ...valido, contas: Array(101).fill(CONTA) },
    { ...valido, tetoCreditos: 0 },
    { ...valido, tetoCreditos: 500 },
    { ...valido, criterios: 'texto' },
    { ...valido, criterios: { termos: 'x'.repeat(5000) } },
    { ...valido, action: 'outra' },
  ]
  for (const corpo of ruins) assertEquals((await pedir(corpo)).status, 400, JSON.stringify(corpo).slice(0, 80))
  assertEquals((await pedir('não é json')).status, 400)
  assertEquals(pedidos.length, 0)
})

Deno.test('a busca roda pela origem "conversa", com a chave, as Contas, os critérios e o teto pedidos', async () => {
  const { pedir, pedidos } = montar()
  const r = await pedir({ ...valido, contas: [CONTA], criterios: { termos: ['analista de comex'], periodo: 'Últimos 7 dias' }, tetoCreditos: 5 })
  assertEquals(r.status, 200)
  assertEquals(pedidos.length, 1)
  const p = pedidos[0]
  assertEquals([p.workspaceId, p.userId, p.signalType, p.origem, p.chave, p.tetoCreditos], [WS, USER, 'vaga_comex', 'conversa', 'hermes:run-1:vaga_comex', 5])
  assertEquals(p.idsDeContas, [CONTA])
  assertEquals(p.criterios, { termos: ['analista de comex'], periodo: 'Últimos 7 dias' })
  assertEquals(p.permitirTeste, false)
  assert(p.prazoFinal !== undefined)
})

Deno.test('a resposta traz só itens normalizados, créditos e a mensagem; nada técnico', async () => {
  const { pedir } = montar()
  const corpo = await (await pedir(valido)).json()
  assertEquals(Object.keys(corpo).sort(), ['creditos', 'desfecho', 'empresasSemConta', 'mensagem', 'novos', 'repetidos', 'sinais'])
  assertEquals(corpo.creditos, 2)
  assertEquals(corpo.sinais, [{
    conta: 'Alfa', contaId: CONTA, frase: 'Abriu vaga de Analista de Comex', quando: '2026-10-12T10:00:00Z', fonte: 'LinkedIn Vagas',
    evidencia: 'Analista de Comex — Alfa, publicada em 12/10/2026.',
  }])
  const texto = JSON.stringify(corpo)
  assert(!MARCA_INTERNA.test(texto) && !texto.includes('custoUsd') && !texto.includes('linkedin_vagas') && !texto.includes('0.18'), texto)
})

Deno.test('a busca sem chave ganha uma chave própria; o catálogo vem do motor, sem nada técnico', async () => {
  const { pedir, pedidos } = montar()
  await pedir({ workspaceId: WS, userId: USER, sinal: 'vaga_comex' })
  assert(pedidos[0].chave.startsWith('conversa:'))
  const catalogo = await (await pedir({ action: 'catalogo' })).json()
  assertEquals(catalogo.sinais, [
    { sinal: 'vaga_comex', icp: 'A', nome: 'Vaga de analista de comex', estado: 'em_validacao', escopo: 'conta', motivo: null },
    { sinal: 'radar_habilitacao', icp: 'A', nome: 'Habilitação no Radar', estado: 'sem_fonte', escopo: 'conta', motivo: 'A consulta é individual; não há fonte pública em massa.' },
  ])
  assert(!MARCA_INTERNA.test(JSON.stringify(catalogo)))
})

Deno.test('a falha do motor responde com uma mensagem neutra e o erro real fica só no log', async () => {
  const logs: unknown[] = []
  const motor: MotorDaConversa = { rodar: () => Promise.reject(new Error('begin_cascade_run: 42501 permission denied (apify)')), catalogo: () => Promise.resolve([]) }
  const handler = createHandler({ motor, autorizado: () => true, log: (c) => logs.push(c) })
  const r = await handler(new Request('http://x', { method: 'POST', headers: { Authorization: 'x' }, body: JSON.stringify(valido) }))
  assertEquals(r.status, 500)
  const corpo = await r.json()
  assert(!MARCA_INTERNA.test(JSON.stringify(corpo)), JSON.stringify(corpo))
  assertEquals(corpo.mensagem, 'Não foi possível fazer a busca agora. Tente de novo em alguns minutos.')
  assert(JSON.stringify(logs).includes('permission denied'))
})

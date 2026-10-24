import { deepStrictEqual as assertEquals } from 'node:assert/strict'
import { createWorker, type FilaDb, type FimDoHermes } from './worker.ts'
import { createHandler } from '../agent-conversation/handler.ts'

Deno.test('cada busca com motor saudável renova o sinal, inclusive com fila vazia', async () => {
  let sinais = 0
  let vivo = true
  const db: FilaDb & { sinalDeVida(): Promise<void> } = {
    sinalDeVida: () => { sinais++; return Promise.resolve() },
    listQueued: () => Promise.resolve([]),
    claim: () => Promise.resolve(null),
    append: () => Promise.resolve(1),
    finish: () => Promise.resolve(),
    searchAccounts: () => Promise.resolve([]),
  }
  const worker = createWorker({ db, hermes: {
    vivo: () => Promise.resolve(vivo),
    iniciar: () => Promise.reject(new Error('não chamar')),
    aguardar: () => Promise.reject(new Error('não chamar')),
  } })
  await worker.rodada()
  await worker.rodada()
  assertEquals(sinais, 2)
  vivo = false
  assertEquals(await worker.rodada(), null)
  assertEquals(sinais, 2)
})

Deno.test('execução pendente mantém capability disponível além de 120s somente enquanto motor saudável', async () => {
  let agora = Date.parse('2026-10-24T12:00:00Z')
  let sinal: string | null = null
  let vivo = true
  let renovar: (() => Promise<void>) | undefined
  let intervalo = 0
  let cancelado = false
  const pendente = Promise.withResolvers<FimDoHermes>()
  const iniciada = Promise.withResolvers<void>()
  const db: FilaDb = {
    sinalDeVida: () => { sinal = new Date(agora).toISOString(); return Promise.resolve() },
    listQueued: () => Promise.resolve(['r1']),
    claim: () => Promise.resolve({
      run_id: 'r1', kind: 'coordenada', workspace_name: 'Norte', request_text: 'Oi',
      agent_id: null, mentions: [], agents: [], history: [],
    }),
    append: () => Promise.resolve(1),
    finish: () => Promise.resolve(),
    searchAccounts: () => Promise.resolve([]),
  }
  const handler = createHandler({
    db: { userFromJwt: () => Promise.resolve({ userId: 'ana' }), startRun: () => Promise.reject(new Error('não chamar')) },
    executar: () => Promise.resolve(), waitUntil: () => {}, appOrigin: 'https://app.test',
    comHermes: true, agora: () => agora, ultimoSinalDoMotor: () => Promise.resolve(sinal),
  })
  const capability = async () => (await handler(new Request('http://local.test', {
    method: 'POST', headers: { Authorization: 'Bearer teste', apikey: 'teste' },
    body: JSON.stringify({ action: 'capability' }),
  }))).json()
  const worker = createWorker({
    db, log: () => {},
    agendarSinal: (callback, ms) => {
      renovar = callback
      intervalo = ms
      return () => { cancelado = true; renovar = undefined }
    },
    hermes: {
      vivo: () => Promise.resolve(vivo), iniciar: () => Promise.resolve('h1'),
      aguardar: () => { iniciada.resolve(); return pendente.promise },
    },
  })
  const rodada = worker.rodada()
  await iniciada.promise
  try {
    // Avança o relógio e dispara o temporizador, sem esperar tempo real.
    for (let i = 0; i < 5; i++) {
      agora += 30_000
      await renovar?.()
    }
    assertEquals(await capability(), { available: true })
    assertEquals(intervalo, 30_000)
    vivo = false
    for (let i = 0; i < 4; i++) {
      agora += 30_000
      await renovar?.()
    }
    assertEquals(await capability(), { available: false, motivo: 'motor_fora_do_ar' })
    vivo = true
    agora += 30_000
    await renovar?.()
    assertEquals(await capability(), { available: true })
  } finally {
    pendente.resolve({ status: 'completed', output: '{"etapas":[],"resposta":"Olá"}' })
    await rodada
  }
  assertEquals(cancelado, true)
})

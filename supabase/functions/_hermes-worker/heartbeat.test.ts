import { deepStrictEqual as assertEquals } from 'node:assert/strict'
import { createWorker, type FilaDb } from './worker.ts'

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

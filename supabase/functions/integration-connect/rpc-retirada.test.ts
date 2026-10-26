import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { ErroDoBanco } from '../_shared/integration-access.ts'
import { criarRetiradaIntegracao } from './rpc-retirada.ts'

Deno.test('a RPC de retirada preserva código e mensagem do erro do Postgres', async () => {
  const retirar = criarRetiradaIntegracao(async () => ({ data: null, error: { code: '42501', message: 'only administrators' } }))
  const erro = await assertRejects(() => retirar({
    workspaceId: 'workspace',
    userId: 'admin',
    integrationId: 'clay',
    resultados: [],
  }), ErroDoBanco)
  assertEquals(erro.codigo, '42501')
  assertEquals(erro.message, 'only administrators')
})

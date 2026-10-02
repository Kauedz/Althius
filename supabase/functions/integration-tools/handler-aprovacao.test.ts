// A tela pede a execução de uma Aprovação de ferramenta logo depois de o Administrador aprovar na Conversa (ADR-0022):
// `{ action: 'executar_aprovacao', approvalId }`. Quem pede vem do JWT e o executor confere que é Administrador ativo; o
// desfecho volta sem token.
import { assertEquals } from 'jsr:@std/assert@1'
import type { DesfechoDaChamadaAprovada } from '../_shared/executor-de-aprovacoes.ts'
import type { BancoDeAcessos } from '../_shared/integration-access.ts'
import { createHandler } from './handler.ts'

const APROVACAO = '9a1c2d3e-4a5b-4c6d-8e7f-0000000000ab'

function montar(desfecho?: DesfechoDaChamadaAprovada) {
  const pedidos: { approvalId: string; administrador: string | null }[] = []
  const banco = {} as BancoDeAcessos
  const handler = createHandler({
    acesso: { banco, ambiente: () => undefined },
    userFromJwt: () => Promise.resolve({ userId: 'usuario-ana', email: 'ana@norte.test' }),
    appOrigin: 'https://app.althius.test',
    log: () => {},
    ...(desfecho
      ? {
        executarChamada: (a: { approvalId: string; administrador: string | null }) => (pedidos.push(a), Promise.resolve(desfecho)),
      }
      : {}),
  })
  const pedir = (corpo: unknown) =>
    handler(new Request('https://x/integration-tools', {
      method: 'POST',
      body: JSON.stringify(corpo),
      headers: { Authorization: 'Bearer jwt', apikey: 'anon', Origin: 'https://app.althius.test' },
    }))
  return { pedir, pedidos }
}

Deno.test('executa a Aprovação de ferramenta em nome do Administrador que aprovou e devolve o desfecho', async () => {
  const { pedir, pedidos } = montar({ status: 'executada', mensagem: 'criar_pagina executada.', resultado: '"ok"' })
  const r = await pedir({ action: 'executar_aprovacao', approvalId: APROVACAO })
  assertEquals(r.status, 200)
  assertEquals(await r.json(), { status: 'executada', mensagem: 'criar_pagina executada.' })
  assertEquals(pedidos, [{ approvalId: APROVACAO, administrador: 'usuario-ana' }])
})

Deno.test('quem não é Administrador recebe 403; a que não saiu, 409; a que falhou, 502', async () => {
  const recusada = await montar({ status: 'recusada', mensagem: 'Só Administradores do Workspace executam Aprovações.' })
    .pedir({ action: 'executar_aprovacao', approvalId: APROVACAO })
  assertEquals(recusada.status, 403)
  const naoLiberada = await montar({ status: 'nao_liberada', motivo: 'not_approved', mensagem: 'A Aprovação não está liberada.' })
    .pedir({ action: 'executar_aprovacao', approvalId: APROVACAO })
  assertEquals(naoLiberada.status, 409)
  const falhou = await montar({ status: 'falhou', mensagem: 'O app recusou.' }).pedir({ action: 'executar_aprovacao', approvalId: APROVACAO })
  assertEquals([falhou.status, (await falhou.json()).error], [502, 'O app recusou.'])
})

Deno.test('sem o executor ligado ou sem um id válido, nada é executado', async () => {
  assertEquals((await montar().pedir({ action: 'executar_aprovacao', approvalId: APROVACAO })).status, 400)
  const { pedir, pedidos } = montar({ status: 'executada', mensagem: 'ok', resultado: '' })
  assertEquals((await pedir({ action: 'executar_aprovacao', approvalId: 'x' })).status, 400)
  assertEquals(pedidos, [])
})

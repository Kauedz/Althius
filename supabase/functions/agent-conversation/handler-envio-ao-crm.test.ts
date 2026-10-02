// O Enviar ao CRM pelos Agentes na porta das Conversas (ADR-0023): o Vendedor responsável pede com o JWT dele; o banco
// (`begin_crm_handoff_by_agents`) confere e guarda a Execução com o pacote; a função a roda depois de responder.
import { assertEquals } from 'jsr:@std/assert@1'
import { createHandler, type Db, type InicioDoEnvioAoCrm, type PedidoDeEnvioAoCrm, recusaDoEnvioPelosAgentes } from './handler.ts'

const WORKSPACE = 'a0000000-0000-0000-0000-000000000001'
const CONTA = 'f0000000-0000-0000-0000-000000000001'
const PEDIDO_ID = 'd0000000-0000-0000-0000-000000000001'
const CONVERSA = 'b0000000-0000-0000-0000-000000000001'
const EXECUCAO = 'e0000000-0000-0000-0000-000000000001'

function montar(opcoes: { inicio?: InicioDoEnvioAoCrm | Error; semModelo?: boolean; semEnvio?: boolean } = {}) {
  const pedidos: PedidoDeEnvioAoCrm[] = []
  const db: Db = {
    userFromJwt: (authorization) => Promise.resolve(authorization === 'Bearer jwt-da-ana' ? { userId: 'ana' } : null),
    startRun: () => Promise.reject(new Error('não usado')),
    ...(opcoes.semEnvio ? {} : {
      iniciarEnvioAoCrm: (pedido: PedidoDeEnvioAoCrm) => {
        pedidos.push(pedido)
        const inicio = opcoes.inicio ?? { kind: 'started', conversationId: CONVERSA, runId: EXECUCAO, status: 'queued' }
        return inicio instanceof Error ? Promise.reject(inicio) : Promise.resolve(inicio)
      },
    }),
  }
  const executados: string[] = []
  const handler = createHandler({
    db,
    executar: opcoes.semModelo ? null : (runId) => (executados.push(runId), Promise.resolve()),
    waitUntil: (work) => void work,
    appOrigin: 'https://app.althius.com.br',
    log: () => {},
  })
  return { handler, pedidos, executados }
}

function pedido(body: unknown, jwt = 'jwt-da-ana') {
  return new Request('https://fn.test/agent-conversation', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, apikey: 'anon', Origin: 'https://app.althius.com.br', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const ENVIO = { action: 'enviar_ao_crm', workspaceId: WORKSPACE, targetAccountId: CONTA, integrationId: 'hubspot', clientRequestId: PEDIDO_ID }

Deno.test('o envio pelos Agentes guarda o pedido com quem o JWT identificou e roda a Execução depois de responder', async () => {
  const { handler, pedidos, executados } = montar()
  const resposta = await handler(pedido(ENVIO))
  assertEquals(resposta.status, 202)
  assertEquals(await resposta.json(), { conversationId: CONVERSA, runId: EXECUCAO, status: 'queued' })
  assertEquals(pedidos, [{ userId: 'ana', workspaceId: WORKSPACE, targetAccountId: CONTA, integrationId: 'hubspot', clientRequestId: PEDIDO_ID }])
  assertEquals(executados, [EXECUCAO])
})

Deno.test('o mesmo pedido que já rodou não roda de novo', async () => {
  const { handler, executados } = montar({ inicio: { kind: 'started', conversationId: CONVERSA, runId: EXECUCAO, status: 'succeeded' } })
  assertEquals((await handler(pedido(ENVIO))).status, 202)
  assertEquals(executados, [])
})

Deno.test('a recusa do banco chega com a mensagem em palavras do produto, e nada roda', async () => {
  const { handler, executados } = montar({ inicio: { kind: 'recusado', ...recusaDoEnvioPelosAgentes('42501', 'only the responsible seller can send') } })
  const resposta = await handler(pedido(ENVIO))
  assertEquals(resposta.status, 403)
  assertEquals(await resposta.json(), { error: 'Só o Vendedor responsável pela Conta-alvo a envia ao CRM.', code: 'nao_responsavel' })
  assertEquals(executados, [])
})

Deno.test('sem sessão, com entrada inválida, sem o modelo ou sem o banco do envio, nada é guardado', async () => {
  const semSessao = montar()
  assertEquals((await semSessao.handler(pedido(ENVIO, 'jwt-falso'))).status, 401)
  const invalido = montar()
  for (const corpo of [{ ...ENVIO, targetAccountId: 'alfa' }, { ...ENVIO, integrationId: 'HubSpot!' }, { ...ENVIO, clientRequestId: undefined }]) {
    assertEquals((await invalido.handler(pedido(corpo))).status, 400)
  }
  assertEquals(invalido.pedidos, [])
  assertEquals((await montar({ semModelo: true }).handler(pedido(ENVIO))).status, 503)
  assertEquals((await montar({ semEnvio: true }).handler(pedido(ENVIO))).status, 503)
  assertEquals((await montar({ inicio: new Error('rede') }).handler(pedido(ENVIO))).status, 502)
})

Deno.test('as recusas do banco em palavras do produto', () => {
  assertEquals(recusaDoEnvioPelosAgentes('23505', 'target account already sent to the CRM').code, 'ja_enviada')
  assertEquals(recusaDoEnvioPelosAgentes('55000', 'integration access is not by authorization').code, 'pela_chave')
  assertEquals(recusaDoEnvioPelosAgentes('55000', 'no agent can write to this CRM').code, 'sem_agente')
  assertEquals(recusaDoEnvioPelosAgentes('55000', 'integration access not connected').code, 'sem_acesso')
  assertEquals(recusaDoEnvioPelosAgentes('55000', 'integration not enabled').code, 'nao_habilitada')
  assertEquals(recusaDoEnvioPelosAgentes('P0002', 'target account not found').httpStatus, 404)
  assertEquals(recusaDoEnvioPelosAgentes('XX000', 'boom').code, 'indisponivel')
})

import { assertEquals } from 'jsr:@std/assert@1'
import type Anthropic from 'npm:@anthropic-ai/sdk@0.128.0'
import {
  type AgenteDoWorkspace,
  type ChaveDoCliente,
  createRunner,
  ErroDoModelo,
  type Modelo,
  type Reserva,
  type RunDb,
} from './runner.ts'

// A chave de IA do cliente (creditos-e-planos, ticket 08): as Execuções de um Workspace com chave própria usam o modelo
// dele; sem chave, o da Althius. A chave nunca aparece em log, evento nem motivo.

type Mensagem = Anthropic.Beta.Messages.BetaMessage

const SCOPUS: AgenteDoWorkspace = {
  id: 'a0000000-0000-0000-0000-000000000001',
  name: 'Scopus',
  specialty: 'scopus',
  kind: 'padrao',
  instructions: '',
  voice_tone: '',
}
const CHAVE_SECRETA = 'sk-ant-chave-secreta-do-cliente-123456'
const DO_CLIENTE: ChaveDoCliente = { provider: 'anthropic', model: 'claude-sonnet-5-5', apiKey: CHAVE_SECRETA }

const reserva = (runId: string): Reserva => ({
  run_id: runId,
  kind: 'agente',
  workspace_name: 'Norte',
  request_text: 'Resuma a Alfa',
  agent_id: SCOPUS.id,
  mentions: [],
  agents: [SCOPUS],
  history: [],
})

const resposta = (t: string) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: t }] }) as unknown as Mensagem

interface Opcoes {
  /** A chave de cada Execução; sem entrada, o Workspace usa o modelo da Althius. */
  chaves?: Record<string, ChaveDoCliente | Error>
  modeloDoCliente?: (chave: ChaveDoCliente) => Modelo | null
  semLeituraDaChave?: boolean
}

function montar(opcoes: Opcoes = {}) {
  const c = {
    logs: [] as Record<string, unknown>[],
    eventos: [] as unknown[],
    fechamentos: [] as { runId: string; status: string; errorCode: string | null; model: string | null }[],
    chamadasDaAlthius: 0,
    chamadasDoCliente: [] as string[],
    chavesLidas: [] as string[],
  }
  const db: RunDb = {
    claim: (runId) => Promise.resolve(reserva(runId)),
    append: (_runId, kind, agentId, payload) => (c.eventos.push({ kind, agentId, payload }), Promise.resolve(c.eventos.length)),
    finish: (runId, status, errorCode, model) => (c.fechamentos.push({ runId, status, errorCode, model }), Promise.resolve()),
    searchAccounts: () => Promise.resolve([]),
    ...(opcoes.semLeituraDaChave ? {} : {
      chaveDoCliente: (runId: string) => {
        c.chavesLidas.push(runId)
        const chave = opcoes.chaves?.[runId]
        if (chave instanceof Error) return Promise.reject(chave)
        return Promise.resolve(chave ?? null)
      },
    }),
  }
  const modelo: Modelo = {
    nome: 'claude-opus-5-5',
    criar: () => (c.chamadasDaAlthius++, Promise.resolve(resposta('Resposta do modelo da Althius.'))),
  }
  const modeloDoCliente = opcoes.modeloDoCliente ?? ((chave: ChaveDoCliente): Modelo => ({
    nome: chave.model,
    criar: () => (c.chamadasDoCliente.push(chave.apiKey), Promise.resolve(resposta('Resposta do modelo do cliente.'))),
  }))
  const rodar = createRunner({ db, modelo, modeloDoCliente, log: (campos) => c.logs.push(campos) })
  return { rodar, c }
}

Deno.test('sem chave do cliente, o modelo da Althius responde e é o nome dele que a Execução guarda', async () => {
  const { rodar, c } = montar()
  await rodar('r1')
  assertEquals(c.chamadasDaAlthius > 0, true)
  assertEquals(c.chamadasDoCliente, [])
  assertEquals(c.fechamentos, [{ runId: 'r1', status: 'succeeded', errorCode: null, model: 'claude-opus-5-5' }])
})

Deno.test('com a chave do cliente, o modelo dele responde e a Althius não é chamada', async () => {
  const { rodar, c } = montar({ chaves: { r1: DO_CLIENTE } })
  await rodar('r1')
  assertEquals(c.chamadasDaAlthius, 0)
  assertEquals(c.chamadasDoCliente, [CHAVE_SECRETA])
  assertEquals(c.fechamentos, [{ runId: 'r1', status: 'succeeded', errorCode: null, model: 'claude-sonnet-5-5' }])
})

Deno.test('duas Execuções ao mesmo tempo usam cada uma o modelo do seu Workspace', async () => {
  const { rodar, c } = montar({ chaves: { r1: DO_CLIENTE } })
  await Promise.all([rodar('r1'), rodar('r2')])
  assertEquals(c.chamadasDoCliente, [CHAVE_SECRETA])
  assertEquals(c.chamadasDaAlthius, 1)
  assertEquals(
    c.fechamentos.map((f) => [f.runId, f.model]).sort(),
    [['r1', 'claude-sonnet-5-5'], ['r2', 'claude-opus-5-5']],
  )
})

Deno.test('o provedor recusa a chave do cliente: a Execução falha com esse motivo, sem cair no modelo da Althius', async () => {
  const { rodar, c } = montar({
    chaves: { r1: DO_CLIENTE },
    modeloDoCliente: (chave) => ({ nome: chave.model, criar: () => Promise.reject(new ErroDoModelo('model_auth')) }),
  })
  await rodar('r1')
  assertEquals(c.chamadasDaAlthius, 0)
  assertEquals(c.fechamentos, [{ runId: 'r1', status: 'failed', errorCode: 'workspace_ai_key_invalid', model: 'claude-sonnet-5-5' }])
})

Deno.test('chave ligada mas sem valor no Vault: a Execução falha com o motivo e a Althius não paga o modelo', async () => {
  const { rodar, c } = montar({ chaves: { r1: new ErroDoModelo('workspace_ai_key_unavailable') } })
  await rodar('r1')
  assertEquals(c.chamadasDaAlthius, 0)
  assertEquals(c.fechamentos, [{ runId: 'r1', status: 'failed', errorCode: 'workspace_ai_key_unavailable', model: 'claude-opus-5-5' }])
})

Deno.test('provedor que a função não sabe usar: falha com o motivo, sem rodar em outro modelo', async () => {
  const { rodar, c } = montar({ chaves: { r1: { ...DO_CLIENTE, provider: 'outro' } }, modeloDoCliente: () => null })
  await rodar('r1')
  assertEquals(c.chamadasDaAlthius, 0)
  assertEquals(c.fechamentos, [{ runId: 'r1', status: 'failed', errorCode: 'workspace_ai_key_unsupported', model: 'claude-opus-5-5' }])
})

Deno.test('a chave nunca aparece em log, evento ou motivo, nem quando o provedor a repete na mensagem de erro', async () => {
  const { rodar, c } = montar({
    chaves: { r1: DO_CLIENTE },
    modeloDoCliente: (chave) => ({
      nome: chave.model,
      criar: () => Promise.reject(new Error(`401 invalid x-api-key: ${chave.apiKey}`)),
    }),
  })
  await rodar('r1')
  assertEquals(c.fechamentos.length, 1)
  assertEquals(c.fechamentos[0].status, 'failed')
  const tudo = JSON.stringify({ logs: c.logs, eventos: c.eventos, fechamentos: c.fechamentos })
  assertEquals(tudo.includes(CHAVE_SECRETA), false)
  assertEquals(tudo.includes('sk-ant-'), false)
})

Deno.test('o detalhe de uma falha do modelo do cliente também sai sem a chave', async () => {
  const { rodar, c } = montar({
    chaves: { r1: DO_CLIENTE },
    modeloDoCliente: (chave) => ({
      nome: chave.model,
      criar: () => Promise.reject(new ErroDoModelo('model_http_400', `bad request for key ${chave.apiKey}`)),
    }),
  })
  await rodar('r1')
  assertEquals(c.fechamentos[0].errorCode, 'model_http_400')
  assertEquals(JSON.stringify(c.logs).includes(CHAVE_SECRETA), false)
})

Deno.test('um motor sem a leitura da chave roda como antes, no modelo da Althius', async () => {
  const { rodar, c } = montar({ semLeituraDaChave: true })
  await rodar('r1')
  assertEquals(c.chamadasDaAlthius > 0, true)
  assertEquals(c.fechamentos[0].status, 'succeeded')
})

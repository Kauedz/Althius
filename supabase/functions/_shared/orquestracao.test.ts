import { assertEquals, assertThrows } from 'jsr:@std/assert@1'
import {
  type AgenteDoWorkspace,
  agentesMencionados,
  anfitriaoDaConversa,
  chamadosDaCoordenacao,
  codigoDoErro,
  ErroDoModelo,
  ESPECIALIDADES,
  fecharComFalha,
  historicoDaConversa,
  MAX_CHAMADOS,
  participantesDaConversa,
  registrador,
  type Reserva,
  type RunDb,
  type TipoDeEvento,
} from './orquestracao.ts'

const agente = (id: string, specialty: string): AgenteDoWorkspace => ({
  id,
  name: id.toUpperCase(),
  specialty,
  kind: 'padrao',
  instructions: '',
  voice_tone: '',
})
const SCOPUS = agente('scopus', 'scopus')
const ETHOS = agente('ethos', 'ethos')
const RHETOR = agente('rhetor', 'rhetor')
const ORACULUM = agente('oraculum', 'oraculum')
const EXTRA = agente('extra', 'rhetor')

function reserva(extra: Partial<Reserva> = {}): Reserva {
  return {
    run_id: 'r1',
    kind: 'coordenada',
    workspace_name: 'Norte',
    request_text: 'Oi',
    agent_id: null,
    mentions: [],
    agents: [SCOPUS, ETHOS, RHETOR, ORACULUM, EXTRA],
    history: [],
    ...extra,
  }
}

Deno.test('o vocabulário: cada Especialidade padrão tem a sua descrição', () => {
  assertEquals(Object.keys(ESPECIALIDADES).sort(), ['ethos', 'oraculum', 'rhetor', 'scopus'])
})

Deno.test('o histórico vira pares de mensagens; um pedido sem resposta entra sozinho', () => {
  assertEquals(
    historicoDaConversa(reserva({ history: [{ request: 'Oi', answer: 'Olá.' }, { request: 'E agora?', answer: null }] })),
    [
      { role: 'user', content: 'Oi' },
      { role: 'assistant', content: 'Olá.' },
      { role: 'user', content: 'E agora?' },
    ],
  )
})

Deno.test('os mencionados são os que existem no Workspace, na ordem em que foram citados', () => {
  assertEquals(
    agentesMencionados(reserva({ mentions: ['rhetor', 'fantasma', 'scopus'] })).map((a) => a.id),
    ['rhetor', 'scopus'],
  )
})

Deno.test('na página de um Agente, ele fala primeiro e cada mencionado entra depois, sem repetir o anfitrião', () => {
  const r = reserva({ kind: 'agente', agent_id: 'ethos', mentions: ['scopus', 'ethos', 'rhetor'] })
  assertEquals(participantesDaConversa(r).map((a) => a.id), ['ethos', 'scopus', 'rhetor'])
  assertEquals(anfitriaoDaConversa(r).id, 'ethos')
})

Deno.test('um Agente que já não existe é agent_not_found', () => {
  const erro = assertThrows(() => participantesDaConversa(reserva({ kind: 'agente', agent_id: 'apagado' })), ErroDoModelo)
  assertEquals(erro.codigo, 'agent_not_found')
  assertThrows(() => anfitriaoDaConversa(reserva({ kind: 'agente', agent_id: null })), ErroDoModelo)
})

Deno.test('na Coordenação, os mencionados sempre trabalham; a escolha entra até o limite, sem repetir', () => {
  assertEquals(
    chamadosDaCoordenacao(reserva({ mentions: ['rhetor'] }), ['scopus', 'rhetor', 'ethos']).map((a) => a.id),
    ['rhetor', 'scopus', 'ethos'],
  )
  assertEquals(chamadosDaCoordenacao(reserva(), ['fantasma']).map((a) => a.id), [])
  const muitos = chamadosDaCoordenacao(
    reserva({ mentions: ['scopus', 'ethos', 'rhetor', 'oraculum', 'extra'] }),
    ['extra'],
  )
  assertEquals(muitos.length, MAX_CHAMADOS)
})

Deno.test('a Coordenação escolhe no máximo 3 Agentes por conta própria', () => {
  assertEquals(
    chamadosDaCoordenacao(reserva(), ['scopus', 'ethos', 'rhetor', 'oraculum']).map((a) => a.id),
    ['scopus', 'ethos', 'rhetor'],
  )
})

function bancoFalso() {
  const eventos: { kind: TipoDeEvento; agentId: string | null; payload: Record<string, unknown> }[] = []
  const fechamentos: { status: string; errorCode: string | null; model: string | null }[] = []
  let fecharFalha = false
  const db: RunDb = {
    claim: () => Promise.resolve(null),
    append: (_r, kind, agentId, payload) => (eventos.push({ kind, agentId, payload }), Promise.resolve(eventos.length)),
    finish: (_r, status, errorCode, model) => {
      if (fecharFalha) return Promise.reject(new Error('já fechou'))
      fechamentos.push({ status, errorCode, model })
      return Promise.resolve()
    },
    searchAccounts: () => Promise.resolve([]),
  }
  return { db, eventos, fechamentos, falharAoFechar: () => (fecharFalha = true) }
}

Deno.test('o registrador grava cada passo no formato que a tela lê', async () => {
  const { db, eventos } = bancoFalso()
  const registro = registrador(db, 'r1')
  await registro.chamada('scopus')
  await registro.feito('scopus', 'Achei a Alfa.')
  await registro.texto('ethos', 'Na página dele.')
  await registro.resposta('Temos a Alfa.')
  assertEquals(eventos, [
    { kind: 'chamada', agentId: 'scopus', payload: {} },
    { kind: 'feito', agentId: 'scopus', payload: { texto: 'Achei a Alfa.' } },
    { kind: 'texto', agentId: 'ethos', payload: { texto: 'Na página dele.' } },
    { kind: 'resposta', agentId: null, payload: { texto: 'Temos a Alfa.' } },
  ])
})

Deno.test('o motivo da falha: o do modelo, ou internal_error para qualquer outra', () => {
  assertEquals(codigoDoErro(new ErroDoModelo('model_refusal', 'detalhe')), 'model_refusal')
  assertEquals(codigoDoErro(new Error('banco caiu')), 'internal_error')
})

Deno.test('fechar com falha grava o motivo; se a Execução já fechou, só registra no log', async () => {
  const { db, fechamentos, falharAoFechar } = bancoFalso()
  const logs: Record<string, unknown>[] = []
  const log = (campos: Record<string, unknown>) => logs.push(campos)

  await fecharComFalha({ db, runId: 'r1', codigo: 'timeout', modelo: 'hermes', log, tipoDoLog: 'hermes_worker' })
  assertEquals(fechamentos, [{ status: 'failed', errorCode: 'timeout', model: 'hermes' }])
  assertEquals(logs, [])

  falharAoFechar()
  await fecharComFalha({ db, runId: 'r1', codigo: 'timeout', modelo: null, log, tipoDoLog: 'agent_run' })
  assertEquals(logs.length, 1)
  assertEquals([logs[0].type, logs[0].outcome], ['agent_run', 'finish_failed'])
})

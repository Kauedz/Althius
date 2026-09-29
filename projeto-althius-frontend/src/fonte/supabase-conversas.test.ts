import { describe, expect, it } from 'vitest'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { conversasDisponiveis, criarFonteDeConversasSupabase } from './supabase-conversas'

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
const SCOPUS = { id: 'a-scopus', nome: 'Scopus' }
const RHETOR = { id: 'a-rhetor', nome: 'Rhetor' }

type Leitura = { status: string; error_code: string | null; events: Record<string, unknown>[] }

/** As leituras de get_agent_run_events em ordem: cada chamada devolve a próxima, e a última se repete. */
function leituras(...respostas: (Leitura | Error)[]) {
  const pedidos: Record<string, unknown>[] = []
  return {
    pedidos,
    responder: (parametros: Record<string, unknown>) => {
      pedidos.push(parametros)
      const resposta = respostas.length > 1 ? respostas.shift()! : respostas[0]
      if (resposta instanceof Error) throw resposta
      return resposta
    },
  }
}

const evento = (seq: number, kind: string, agent_id: string | null, payload: Record<string, unknown> = {}) => ({
  seq,
  kind,
  agent_id,
  agent_name: agent_id ? 'Agente' : null,
  payload,
})

function montar({
  funcao = (() => ({ status: 202, corpo: { conversationId: 'conv-1', runId: 'run-1', status: 'queued' } })) as (
    corpo: Record<string, unknown>,
  ) => { status: number; corpo: unknown },
  rpcs = {} as Record<string, (parametros: Record<string, unknown>) => unknown>,
} = {}) {
  const enviados: Record<string, unknown>[] = []
  const { cliente } = criarSupabaseFalso({
    sessao: sessaoDe(MARINA),
    rpcs,
    funcoes: {
      'agent-conversation': (corpo) => {
        enviados.push(corpo)
        return funcao(corpo)
      },
    },
  })
  const fonte = criarFonteDeConversasSupabase(cliente, 'ws-norte', {
    agentes: async () => [SCOPUS, RHETOR],
    intervaloMs: 0,
  })
  return { fonte, enviados }
}

async function todos<P>(passos: AsyncIterable<P>): Promise<P[]> {
  const lista: P[] = []
  for await (const passo of passos) lista.push(passo)
  return lista
}

describe('Conversas no Workspace operacional', () => {
  it('a Coordenação: guarda o pedido com as menções e segue os passos pelo banco até a resposta', async () => {
    const { pedidos, responder } = leituras(
      { status: 'queued', error_code: null, events: [] },
      { status: 'running', error_code: null, events: [evento(1, 'chamada', SCOPUS.id)] },
      {
        status: 'succeeded',
        error_code: null,
        events: [
          evento(2, 'ferramenta', SCOPUS.id, { descricao: 'Consultou as Contas-alvo: "Alfa"', estado: 'concluida' }),
          evento(3, 'ferramenta', SCOPUS.id, { descricao: 'Consultou as Contas-alvo mais recentes', estado: 'falhou' }),
          evento(4, 'feito', SCOPUS.id, { texto: 'Achei a Alfa.' }),
          evento(5, 'resposta', null, { texto: 'Temos a Alfa.' }),
        ],
      },
    )
    const { fonte, enviados } = montar({ rpcs: { get_agent_run_events: responder } })
    const passos = await todos(fonte.conversarCoordenado({ texto: 'Quais Contas? @rhetor ajuda' }, []))
    expect(passos).toEqual([
      { tipo: 'chamada', agenteId: SCOPUS.id },
      { tipo: 'ferramenta', agenteId: SCOPUS.id, descricao: 'Consultou as Contas-alvo: "Alfa"' },
      { tipo: 'ferramenta', agenteId: SCOPUS.id, descricao: 'Consultou as Contas-alvo mais recentes (falhou)' },
      { tipo: 'feito', agenteId: SCOPUS.id, resumo: 'Achei a Alfa.' },
      { tipo: 'resposta', texto: 'Temos a Alfa.' },
    ])
    expect(enviados).toEqual([
      expect.objectContaining({
        action: 'send',
        workspaceId: 'ws-norte',
        conversationId: null,
        agentId: null,
        text: 'Quais Contas? @rhetor ajuda',
        mentions: [RHETOR.id],
        clientRequestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      }),
    ])
    // A leitura retoma do último passo lido, sem repetir.
    expect(pedidos.map((p) => p.p_after_seq)).toEqual([0, 0, 1])
  })

  it('continuar a Conversa manda a mesma Conversa; uma Conversa nova, não', async () => {
    const { responder } = leituras({ status: 'succeeded', error_code: null, events: [evento(1, 'resposta', null, { texto: 'Ok.' })] })
    const { fonte, enviados } = montar({ rpcs: { get_agent_run_events: responder } })
    await todos(fonte.conversarCoordenado({ texto: 'Primeiro' }, []))
    await todos(fonte.conversarCoordenado({ texto: 'Segundo' }, [{ texto: 'Primeiro' }]))
    await todos(fonte.conversarCoordenado({ texto: 'Outra' }, []))
    expect(enviados.map((corpo) => corpo.conversationId)).toEqual([null, 'conv-1', null])
    expect(new Set(enviados.map((corpo) => corpo.clientRequestId)).size).toBe(3)
  })

  it('na página do Agente: a resposta e a consulta dele, na Conversa dele', async () => {
    const { responder } = leituras({
      status: 'succeeded',
      error_code: null,
      events: [
        evento(1, 'ferramenta', SCOPUS.id, { descricao: 'Consultou as Contas-alvo: "Alfa"', estado: 'concluida' }),
        evento(2, 'texto', SCOPUS.id, { texto: 'A Alfa tem aderência.' }),
      ],
    })
    const { fonte, enviados } = montar({ rpcs: { get_agent_run_events: responder } })
    expect(await todos(fonte.conversar(SCOPUS.id, { texto: 'E a Alfa?' }))).toEqual([
      { tipo: 'ferramenta', agenteId: SCOPUS.id, descricao: 'Consultou as Contas-alvo: "Alfa"' },
      { tipo: 'texto', agenteId: SCOPUS.id, texto: 'A Alfa tem aderência.' },
    ])
    await todos(fonte.conversar(SCOPUS.id, { texto: 'E a Beta?' }))
    expect(enviados.map((corpo) => [corpo.agentId, corpo.conversationId])).toEqual([
      [SCOPUS.id, null],
      [SCOPUS.id, 'conv-1'],
    ])
  })

  it('a falha gravada vira passo de falha, com o motivo em português, sem resposta', async () => {
    const { responder } = leituras({
      status: 'failed',
      error_code: 'model_rate_limited',
      events: [evento(1, 'chamada', SCOPUS.id), evento(2, 'falha', null, { motivo: 'model_rate_limited' })],
    })
    const { fonte } = montar({ rpcs: { get_agent_run_events: responder } })
    expect(await todos(fonte.conversarCoordenado({ texto: 'Oi' }, []))).toEqual([
      { tipo: 'chamada', agenteId: SCOPUS.id },
      { tipo: 'falha', motivo: 'O modelo está sobrecarregado agora. Tente de novo em alguns minutos.' },
    ])
  })

  it('o pedido recusado pela função mostra o motivo dela, sem ler o banco', async () => {
    const { fonte } = montar({
      funcao: () => ({ status: 409, corpo: { error: 'Espere a resposta anterior terminar para mandar outro pedido.' } }),
      rpcs: { get_agent_run_events: () => expect.fail('não deveria ler') },
    })
    expect(await todos(fonte.conversar(SCOPUS.id, { texto: 'Oi' }))).toEqual([
      { tipo: 'falha', motivo: 'Espere a resposta anterior terminar para mandar outro pedido.' },
    ])
  })

  it('sem conexão com o banco por várias leituras, avisa para recarregar e para', async () => {
    const { pedidos, responder } = leituras(new Error('rede'))
    const { fonte } = montar({ rpcs: { get_agent_run_events: responder } })
    const passos = await todos(fonte.conversarCoordenado({ texto: 'Oi' }, []))
    expect(passos).toEqual([
      { tipo: 'falha', motivo: 'Perdi a conexão com o Workspace. Recarregue a página para acompanhar a resposta.' },
    ])
    expect(pedidos).toHaveLength(5)
  })

  it('depois de recarregar, traz as Conversas salvas e continua o pedido que ainda roda de onde parou', async () => {
    const { pedidos, responder } = leituras({
      status: 'succeeded',
      error_code: null,
      events: [evento(3, 'resposta', null, { texto: 'Pronto.' })],
    })
    const { fonte, enviados } = montar({
      rpcs: {
        list_agent_conversations: (p) => {
          expect(p).toEqual({ p_workspace_id: 'ws-norte' })
          return [
            { id: 'conv-coord', kind: 'coordenada', agent_id: null },
            { id: 'conv-scopus', kind: 'agente', agent_id: SCOPUS.id },
            { id: 'conv-antiga', kind: 'coordenada', agent_id: null },
          ]
        },
        get_agent_conversation: (p) =>
          p.p_conversation_id === 'conv-coord'
            ? {
              runs: [
                { id: 'r1', request_text: 'Primeiro', status: 'succeeded', events: [evento(1, 'resposta', null, { texto: 'Um.' })] },
                { id: 'r2', request_text: 'Segundo', status: 'running', events: [evento(1, 'chamada', SCOPUS.id), evento(2, 'feito', SCOPUS.id, { texto: 'Feito.' })] },
              ],
            }
            : { runs: [{ id: 'r3', request_text: 'Oi', status: 'succeeded', events: [evento(1, 'texto', SCOPUS.id, { texto: 'Olá.' })] }] },
        get_agent_run_events: responder,
      },
    })
    const retomadas = await fonte.retomarConversas!()
    expect(retomadas.coordenada?.turnos).toEqual([
      { pedido: 'Primeiro', passos: [{ tipo: 'resposta', texto: 'Um.' }] },
      {
        pedido: 'Segundo',
        passos: [{ tipo: 'chamada', agenteId: SCOPUS.id }, { tipo: 'feito', agenteId: SCOPUS.id, resumo: 'Feito.' }],
      },
    ])
    expect(retomadas.porAgente[SCOPUS.id]).toEqual({
      turnos: [{ pedido: 'Oi', passos: [{ tipo: 'texto', agenteId: SCOPUS.id, texto: 'Olá.' }] }],
      emAndamento: undefined,
    })
    expect(await todos(retomadas.coordenada!.emAndamento!)).toEqual([{ tipo: 'resposta', texto: 'Pronto.' }])
    expect(pedidos).toEqual([{ p_run_id: 'r2', p_after_seq: 2 }])
    // O pedido seguinte continua a Conversa retomada, e nada foi reenviado.
    expect(enviados).toEqual([])
    await todos(fonte.conversarCoordenado({ texto: 'Terceiro' }, [{ texto: 'Primeiro' }, { texto: 'Segundo' }]))
    expect(enviados[0].conversationId).toBe('conv-coord')
  })

  it('as Conversas só aparecem quando a função confirma o modelo', async () => {
    const com = criarSupabaseFalso({ funcoes: { 'agent-conversation': () => ({ status: 200, corpo: { available: true } }) } })
    const sem = criarSupabaseFalso({ funcoes: { 'agent-conversation': () => ({ status: 200, corpo: { available: false } }) } })
    const fora = criarSupabaseFalso({})
    expect(await conversasDisponiveis(com.cliente)).toBe(true)
    expect(await conversasDisponiveis(sem.cliente)).toBe(false)
    expect(await conversasDisponiveis(fora.cliente)).toBe(false)
  })
})

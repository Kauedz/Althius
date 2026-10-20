import { describe, expect, it } from 'vitest'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { criarFonteDeConversasSupabase } from './supabase-conversas'

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }

function montar(rpcs: Record<string, (parametros: Record<string, unknown>) => unknown>) {
  const enviados: Record<string, unknown>[] = []
  const { cliente } = criarSupabaseFalso({
    sessao: sessaoDe(MARINA),
    rpcs,
    funcoes: {
      'agent-conversation': (corpo) => {
        enviados.push(corpo)
        return { status: 202, corpo: { conversationId: corpo.conversationId ?? 'nova', runId: 'run-1', status: 'queued' } }
      },
    },
  })
  const fonte = criarFonteDeConversasSupabase(cliente, 'ws-norte', { agentes: async () => [], intervaloMs: 0 })
  return { fonte, enviados }
}

const linha = (extra: Record<string, unknown>) => ({
  kind: 'coordenada',
  agent_id: null,
  title: null,
  named: false,
  first_request: 'Primeiro pedido',
  updated_at: '2026-10-15T12:00:00Z',
  open_run_id: null,
  origin: 'althius',
  ...extra,
})

const conversaDoSlack = (extra: Record<string, unknown> = {}) => ({
  id: 'c-slack',
  kind: 'agente',
  agent_id: 'a-scopus',
  origin: 'slack',
  runs: [{
    id: 'run-0',
    request_text: 'Quem são as Contas Quentes?',
    status: 'succeeded',
    events: [{ seq: 1, kind: 'texto', agent_id: 'a-scopus', payload: { texto: 'São três: Norte, Sul e Leste.' } }],
  }],
  ...extra,
})

describe('A Conversa do Slack na fonte do Supabase', () => {
  it('a lista traz a Conversa do Slack com o Agente dela; as da Althius não mudam', async () => {
    const { fonte } = montar({
      list_agent_conversations_of_agent: () => [
        linha({ id: 'c-slack', kind: 'agente', agent_id: 'a-scopus', origin: 'slack', first_request: 'Quem são as Contas Quentes?' }),
        linha({ id: 'c1', title: 'ICP da Norte', named: true }),
      ],
    })

    expect(await fonte.conversasSalvas!()).toEqual([
      {
        id: 'c-slack',
        titulo: null,
        primeiroPedido: 'Quem são as Contas Quentes?',
        atualizadaEm: '2026-10-15T12:00:00Z',
        emAndamento: false,
        doSlack: { agenteId: 'a-scopus' },
      },
      { id: 'c1', titulo: 'ICP da Norte', primeiroPedido: 'Primeiro pedido', atualizadaEm: '2026-10-15T12:00:00Z', emAndamento: false },
    ])
  })

  it('o histórico do Agente traz a origem e continua com o título do PR-9', async () => {
    const { fonte } = montar({
      list_agent_conversations_of_agent: () => [
        linha({ id: 'c-slack', kind: 'agente', agent_id: 'a-scopus', origin: 'slack', first_request: 'Quem são as Contas Quentes?' }),
        linha({ id: 'a1', kind: 'agente', agent_id: 'a-scopus', title: 'Aderência', named: true, first_request: 'Pontue a Alfa' }),
      ],
    })

    expect(await fonte.historicoDeConversas!('a-scopus')).toEqual([
      {
        id: 'c-slack',
        titulo: null,
        primeiroPedido: 'Quem são as Contas Quentes?',
        atualizadaEm: '2026-10-15T12:00:00Z',
        emAndamento: false,
        doSlack: { agenteId: 'a-scopus' },
      },
      {
        id: 'a1',
        titulo: 'Aderência',
        primeiroPedido: 'Pontue a Alfa',
        atualizadaEm: '2026-10-15T12:00:00Z',
        emAndamento: false,
      },
    ])
  })

  it('a página do Agente retoma a Conversa da Althius, não a do Slack mais recente', async () => {
    const { fonte, enviados } = montar({
      list_agent_conversations: () => [
        { id: 'c-slack', kind: 'agente', agent_id: 'a-scopus', origin: 'slack' },
        { id: 'c-althius', kind: 'agente', agent_id: 'a-scopus', origin: 'althius' },
      ],
      get_agent_conversation: (p) =>
        p.p_conversation_id === 'c-slack'
          ? conversaDoSlack()
          : { ...conversaDoSlack({ id: 'c-althius', origin: 'althius' }), runs: [{
              id: 'run-a', request_text: 'Pedido na Althius', status: 'succeeded', events: [],
            }] },
      get_agent_run_events: () => ({ status: 'succeeded', error_code: null, events: [] }),
    })

    const retomadas = await fonte.retomarConversas!()
    expect(retomadas.porAgente['a-scopus']?.turnos).toEqual([{ pedido: 'Pedido na Althius', passos: [] }])

    for await (const _ of fonte.conversar('a-scopus', { texto: 'E agora?' })) void _
    expect(enviados[0]).toEqual(expect.objectContaining({ conversationId: 'c-althius' }))
  })

  it('abre a Conversa do Slack só para leitura, com o Agente e os passos, sem mudar a Conversa em curso', async () => {
    const { fonte, enviados } = montar({
      get_agent_conversation: () => conversaDoSlack(),
      get_agent_run_events: () => ({ status: 'succeeded', error_code: null, events: [] }),
    })

    const conversa = await fonte.abrirConversaDoSlack!('c-slack')
    expect(conversa.agenteId).toBe('a-scopus')
    expect(conversa.turnos).toEqual([
      {
        pedido: 'Quem são as Contas Quentes?',
        passos: [{ tipo: 'texto', agenteId: 'a-scopus', texto: 'São três: Norte, Sul e Leste.' }],
      },
    ])
    expect(conversa.emAndamento).toBeUndefined()

    for await (const _ of fonte.conversar('a-scopus', { texto: 'Outra coisa' })) void _
    expect(enviados[0]).toEqual(expect.objectContaining({ conversationId: null }))
  })

  it('o pedido do Slack que ainda roda segue sendo lido até terminar', async () => {
    const { fonte } = montar({
      get_agent_conversation: () => conversaDoSlack({
        runs: [{ id: 'run-1', request_text: 'Quem são as Contas Quentes?', status: 'running', events: [] }],
      }),
      get_agent_run_events: () => ({
        status: 'succeeded',
        error_code: null,
        events: [{ seq: 1, kind: 'texto', agent_id: 'a-scopus', payload: { texto: 'Pronto.' } }],
      }),
    })

    const conversa = await fonte.abrirConversaDoSlack!('c-slack')
    const passos = []
    for await (const passo of conversa.emAndamento!) passos.push(passo)
    expect(passos).toEqual([{ tipo: 'texto', agenteId: 'a-scopus', texto: 'Pronto.' }])
  })

  it('uma Conversa da Althius não abre como Conversa do Slack', async () => {
    const { fonte } = montar({ get_agent_conversation: () => conversaDoSlack({ origin: 'althius' }) })

    await expect(fonte.abrirConversaDoSlack!('c1')).rejects.toThrow('Esta Conversa não veio do Slack.')
  })

  it('sem a Conversa, diz que não carregou', async () => {
    const { fonte } = montar({
      get_agent_conversation: () => {
        throw Object.assign(new Error('x'), { code: 'P0002' })
      },
    })

    await expect(fonte.abrirConversaDoSlack!('c-x')).rejects.toThrow('Não foi possível carregar a Conversa.')
  })

  it('as sugestões do Agente continuam vindo do banco', async () => {
    const { fonte } = montar({
      agent_prompt_suggestions: () => [{ id: 'scopus-aderencia-quente', texto: 'Pontue a aderência da Alfa ao nosso ICP' }],
    })

    expect(await fonte.sugestoesDoAgente!('a-scopus')).toEqual([
      { id: 'dados-scopus-aderencia-quente', texto: 'Pontue a aderência da Alfa ao nosso ICP' },
    ])
  })
})

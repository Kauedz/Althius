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
  first_request: 'Primeiro pedido',
  updated_at: '2026-09-30T12:00:00Z',
  open_run_id: null,
  ...extra,
})

describe('Conversas nomeadas: a fonte do Supabase', () => {
  it('lista só as Conversas coordenadas, com o nome, o primeiro pedido e se ainda respondem', async () => {
    const { fonte } = montar({
      list_named_agent_conversations: () => [
        linha({ id: 'c1', title: 'ICP da Norte' }),
        linha({ id: 'c2', open_run_id: 'run-9', first_request: null }),
        linha({ id: 'c3', kind: 'agente', agent_id: 'a-scopus' }),
      ],
    })

    expect(await fonte.conversasSalvas!()).toEqual([
      { id: 'c1', titulo: 'ICP da Norte', primeiroPedido: 'Primeiro pedido', atualizadaEm: '2026-09-30T12:00:00Z', emAndamento: false },
      { id: 'c2', titulo: null, primeiroPedido: '', atualizadaEm: '2026-09-30T12:00:00Z', emAndamento: true },
    ])
  })

  it('renomear chama a função com o nome; os erros viram texto para a pessoa', async () => {
    const chamadas: Record<string, unknown>[] = []
    const erro = (code: string) => Object.assign(new Error('x'), { code })
    let proximo: Error | null = null
    const { fonte } = montar({
      rename_agent_conversation: (parametros) => {
        chamadas.push(parametros)
        if (proximo) throw proximo
        return null
      },
    })

    await fonte.renomearConversa!('c1', 'Campanha Q4')
    expect(chamadas).toEqual([{ p_conversation_id: 'c1', p_title: 'Campanha Q4' }])

    proximo = erro('22023')
    await expect(fonte.renomearConversa!('c1', 'x')).rejects.toThrow('O nome pode ter até 80 caracteres.')
    proximo = erro('P0002')
    await expect(fonte.renomearConversa!('c1', 'x')).rejects.toThrow('Esta Conversa não existe mais.')
    proximo = erro('XX000')
    await expect(fonte.renomearConversa!('c1', 'x')).rejects.toThrow('Não foi possível renomear a Conversa.')
  })

  it('abrir uma Conversa devolve os pedidos dela, e o próximo pedido a continua', async () => {
    const { fonte, enviados } = montar({
      get_agent_conversation: () => ({
        runs: [{
          id: 'run-0',
          request_text: 'Campanha do quarto trimestre',
          status: 'succeeded',
          events: [{ seq: 1, kind: 'resposta', agent_id: null, payload: { texto: 'Aqui vai o plano.' } }],
        }],
      }),
      get_agent_run_events: () => ({ status: 'succeeded', error_code: null, events: [] }),
    })

    expect(fonte.conversaCoordenadaAtual!()).toBeNull()
    const conversa = await fonte.abrirConversa!('c2')
    expect(conversa.turnos).toEqual([
      { pedido: 'Campanha do quarto trimestre', passos: [{ tipo: 'resposta', texto: 'Aqui vai o plano.' }] },
    ])
    expect(fonte.conversaCoordenadaAtual!()).toBe('c2')

    for await (const _ of fonte.conversarCoordenado({ texto: 'E o orçamento?' }, [{ texto: 'Campanha do quarto trimestre' }])) {
      void _
    }
    expect(enviados[0]).toEqual(expect.objectContaining({ conversationId: 'c2', text: 'E o orçamento?' }))
  })
})

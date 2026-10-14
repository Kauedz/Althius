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
    const chamadas: Record<string, unknown>[] = []
    const { fonte } = montar({
      list_agent_conversations_of_agent: (parametros) => {
        chamadas.push(parametros)
        return [
          linha({ id: 'c1', title: 'ICP da Norte', named: true }),
          linha({ id: 'c2', open_run_id: 'run-9', first_request: null, title: null, named: false }),
        ]
      },
    })

    expect(await fonte.conversasSalvas!()).toEqual([
      { id: 'c1', titulo: 'ICP da Norte', primeiroPedido: 'Primeiro pedido', atualizadaEm: '2026-09-30T12:00:00Z', emAndamento: false },
      { id: 'c2', titulo: null, primeiroPedido: '', atualizadaEm: '2026-09-30T12:00:00Z', emAndamento: true },
    ])
    expect(chamadas).toEqual([{ p_workspace_id: 'ws-norte', p_agent_id: null, p_limit: 30, p_before: null }])
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

  it('o histórico do Agente pede a página dele, e o título dado só vale quando a pessoa nomeou', async () => {
    const chamadas: Record<string, unknown>[] = []
    const { fonte } = montar({
      list_agent_conversations_of_agent: (parametros) => {
        chamadas.push(parametros)
        return [linha({ id: 'a1', kind: 'agente', agent_id: 'a-scopus', title: 'Primeiro pedido', named: false })]
      },
    })
    const lista = await fonte.historicoDeConversas!('a-scopus', '2026-10-01T00:00:00Z')
    expect(lista[0]).toEqual(expect.objectContaining({ id: 'a1', titulo: null, primeiroPedido: 'Primeiro pedido' }))
    expect(chamadas).toEqual([{ p_workspace_id: 'ws-norte', p_agent_id: 'a-scopus', p_limit: 30, p_before: '2026-10-01T00:00:00Z' }])
  })

  it('arquivar chama a função; uma Conversa que sumiu vira texto para a pessoa', async () => {
    let falhar = false
    const chamadas: Record<string, unknown>[] = []
    const { fonte } = montar({
      archive_agent_conversation: (parametros) => {
        chamadas.push(parametros)
        if (falhar) throw Object.assign(new Error('x'), { code: 'P0002' })
        return null
      },
    })
    await fonte.arquivarConversa!('c1')
    expect(chamadas).toEqual([{ p_conversation_id: 'c1' }])
    falhar = true
    await expect(fonte.arquivarConversa!('c1')).rejects.toThrow('Esta Conversa não existe mais.')
  })

  it('as sugestões do Agente vêm do banco; uma falha não mostra nenhuma', async () => {
    let falhar = false
    const { fonte } = montar({
      agent_prompt_suggestions: () => {
        if (falhar) throw new Error('x')
        return [{ id: 'scopus-aderencia-quente', texto: 'Pontue a aderência da Alfa ao nosso ICP' }, { id: 1 }]
      },
    })
    expect(await fonte.sugestoesDoAgente!('a-scopus')).toEqual([
      { id: 'dados-scopus-aderencia-quente', texto: 'Pontue a aderência da Alfa ao nosso ICP' },
    ])
    falhar = true
    expect(await fonte.sugestoesDoAgente!('a-scopus')).toEqual([])
  })

  it('abrir uma Conversa do Agente faz o próximo pedido continuá-la; Nova conversa recomeça', async () => {
    const { fonte, enviados } = montar({ get_agent_conversation: () => ({ runs: [] }) })
    await fonte.abrirConversaDoAgente!('a-scopus', 'a1')
    expect(fonte.conversaDoAgenteAtual!('a-scopus')).toBe('a1')
    for await (const _ of fonte.conversar('a-scopus', { texto: 'E agora?' })) void _
    expect(enviados.at(-1)).toEqual(expect.objectContaining({ conversationId: 'a1', agentId: 'a-scopus' }))
    fonte.novaConversaDoAgente!('a-scopus')
    expect(fonte.conversaDoAgenteAtual!('a-scopus')).toBeNull()
  })
})

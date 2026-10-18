import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { criarFonteDeAgentesSupabase } from './supabase-agentes'

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }

function fonteCom(rpcs: Record<string, (parametros: Record<string, unknown>) => unknown>) {
  const { cliente } = criarSupabaseFalso({ sessao: sessaoDe(MARINA), rpcs })
  return criarFonteDeAgentesSupabase(cliente, 'ws-norte')
}

// As datas em hora local: a Atividade mostra o horário no fuso de quem vê, e o teste não pode depender do fuso da máquina.
const emHoraLocal = (...partes: [number, number, number, number, number]) => new Date(...partes).toISOString()

/** Uma Execução como a função do banco devolve. */
function execucao(campos: Record<string, unknown>) {
  return {
    id: 'r1',
    agent_id: 'a1',
    agent_name: 'Scopus',
    conversation_id: 'c1',
    trigger_kind: 'conversa',
    status: 'succeeded',
    request_text: 'Pontue a Alfa',
    result_text: null,
    error_code: null,
    created_at: emHoraLocal(2026, 9, 15, 8, 0),
    finished_at: emHoraLocal(2026, 9, 15, 8, 1),
    ...campos,
  }
}

describe('Atividade do Agente no Workspace operacional', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0))
  })
  afterEach(() => vi.useRealTimers())

  it('lê as Execuções do Agente pela função do banco, com o gatilho, o pedido, o resultado e o link da Conversa', async () => {
    const chamadas: Record<string, unknown>[] = []
    const fonte = fonteCom({
      agent_activity: (p) => {
        chamadas.push(p)
        return [
          execucao({ id: 'r2', trigger_kind: 'canal', request_text: 'Resuma a Alfa', result_text: 'A Alfa subiu para 91.' }),
          execucao({ id: 'r1', created_at: emHoraLocal(2026, 9, 14, 17, 30) }),
        ]
      },
    })

    const itens = await fonte.atividade('a1')

    expect(chamadas).toEqual([{ p_workspace_id: 'ws-norte', p_agent_id: 'a1', p_trigger_kind: null, p_limit: 50 }])
    expect(itens).toEqual([
      {
        id: 'r2',
        agenteId: 'a1',
        tipo: 'execucao',
        gatilho: 'canal',
        quando: 'Hoje, 08:00',
        descricao: 'Resuma a Alfa',
        resultado: 'A Alfa subiu para 91.',
        link: { rotulo: 'Ver Conversa', para: '/agentes/a1/conversa?conversa=c1' },
      },
      expect.objectContaining({ id: 'r1', gatilho: 'conversa', quando: 'Ontem, 17:30', resultado: 'Concluída.' }),
    ])
  })

  it('marca a Execução que falhou e mostra a que ainda roda como em andamento', async () => {
    const fonte = fonteCom({
      agent_activity: () => [
        execucao({ id: 'r1', status: 'failed', error_code: 'model_error' }),
        execucao({ id: 'r2', status: 'running', finished_at: null }),
      ],
    })

    const [falhou, rodando] = await fonte.atividade('a1')

    expect(falhou).toMatchObject({ falhou: true, resultado: 'A Execução não se concluiu e nada foi alterado.' })
    expect(rodando).toMatchObject({ resultado: 'Em andamento.' })
    expect(rodando).not.toHaveProperty('falhou')
  })

  it('filtra pelo gatilho no banco', async () => {
    const chamadas: Record<string, unknown>[] = []
    const fonte = fonteCom({ agent_activity: (p) => {
        chamadas.push(p)
        return []
      }, })

    expect(await fonte.atividade('a1', 'rotina')).toEqual([])
    expect(chamadas[0]).toMatchObject({ p_trigger_kind: 'rotina' })
  })
})

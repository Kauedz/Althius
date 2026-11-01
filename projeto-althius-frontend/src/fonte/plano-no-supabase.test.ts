import { describe, expect, it } from 'vitest'
import { ErroDoPlano, MENSAGEM_DA_FALHA_DO_PLANO, type PlanoDoSinal } from './plano-do-sinal'
import { criarFonteDeSinaisSupabase } from './supabase-sinais'
import { criarSupabaseFalso, type RespostaDaFuncao } from '@/test/supabase-falso'

// A Fonte de Sinais do Workspace operacional fala com `signal-plan` e `save_signal_plan` (agente-de-sinal 01).

const WORKSPACE = 'ws-norte'
const CONTA = '6f1c2d3e-4a5b-4c6d-8e7f-0000000000aa'
const PLANO: PlanoDoSinal = {
  versao: 1,
  origem: 'briefing',
  escopo: { tipo: 'contas', contaIds: [CONTA] },
  sinais: [{ tipo: 'anuncio_meta', criterios: { periodo: 'Últimos 14 dias' } }],
  explicacao: 'Vamos acompanhar “Anunciando na Meta”.',
  maxEmpresasPorRodada: 25,
}

function fonteCom(opcoes: { funcao?: (corpo: Record<string, unknown>) => RespostaDaFuncao; rpcs?: Record<string, (p: Record<string, unknown>) => unknown> }) {
  const chamadas: Record<string, unknown>[] = []
  const supabase = criarSupabaseFalso({
    funcoes: { 'signal-plan': (corpo) => { chamadas.push(corpo); return (opcoes.funcao ?? (() => ({ corpo: { plano: PLANO, avisos: [] } })))(corpo) } },
    rpcs: { list_cascade_catalog: () => [], list_signal_monitors: () => [], ...opcoes.rpcs },
  })
  return { fonte: criarFonteDeSinaisSupabase(supabase.cliente, () => WORKSPACE), chamadas }
}

describe('montarPlano', () => {
  it('manda o Briefing e as Contas à função e devolve o Plano e os avisos, sem gravar nada', async () => {
    const { fonte, chamadas } = fonteCom({ funcao: () => ({ corpo: { plano: PLANO, avisos: ['Montamos um plano inicial. Revise os critérios.', 7] } }) })

    const montado = await fonte.montarPlano!({ briefing: 'Quem anuncia na Meta', contaIds: [CONTA] })

    expect(montado).toEqual({ plano: PLANO, avisos: ['Montamos um plano inicial. Revise os critérios.'] })
    expect(chamadas).toEqual([{ workspaceId: WORKSPACE, briefing: 'Quem anuncia na Meta', escopo: { tipo: 'contas', contaIds: [CONTA] } }])
  })

  it('o limite do dia e a falta de Sinais têm mensagem própria; qualquer outra falha é a recuperável, sem texto técnico', async () => {
    const casos: [RespostaDaFuncao, string, string][] = [
      [{ status: 429, corpo: { error: 'Limite de hoje.', codigo: 'limite_diario' } }, 'limite_diario', 'Limite de hoje.'],
      [{ status: 409, corpo: { error: 'Nenhum Sinal.', codigo: 'sem_tipos' } }, 'sem_tipos', 'Nenhum Sinal.'],
      [{ status: 500, corpo: { error: 'Erro do fornecedor apify 401', codigo: 'x' } }, 'falha', MENSAGEM_DA_FALHA_DO_PLANO],
      [{ status: 503, corpo: { code: 'BOOT_ERROR', message: 'segredo faltando' } }, 'falha', MENSAGEM_DA_FALHA_DO_PLANO],
      [{ corpo: { plano: null } }, 'falha', MENSAGEM_DA_FALHA_DO_PLANO],
    ]
    for (const [resposta, codigo, mensagem] of casos) {
      const { fonte } = fonteCom({ funcao: () => resposta })
      const erro = await fonte.montarPlano!({ briefing: 'x', contaIds: [CONTA] }).then(() => null, (e: unknown) => e)
      expect(erro).toBeInstanceOf(ErroDoPlano)
      expect((erro as ErroDoPlano).codigo).toBe(codigo)
      expect((erro as ErroDoPlano).message).toBe(mensagem)
    }
  })

  it('a função que não está publicada também cai na mensagem recuperável', async () => {
    const supabase = criarSupabaseFalso({ rpcs: { list_cascade_catalog: () => [] } })
    const fonte = criarFonteDeSinaisSupabase(supabase.cliente, () => WORKSPACE)
    const erro = await fonte.montarPlano!({ briefing: 'x', contaIds: [CONTA] }).then(() => null, (e: unknown) => e)
    expect((erro as ErroDoPlano).message).toBe(MENSAGEM_DA_FALHA_DO_PLANO)
  })
})

describe('salvarPlano e a lista de Monitoramentos', () => {
  const noBanco = {
    id: 'mon-1', signal_type: 'anuncio_meta', name: 'Meta', state: 'rascunho', audience: { accountIds: [CONTA] },
    criteria: { periodo: 'Últimos 14 dias' }, last_error: null, brief: 'Quem anuncia na Meta', plan: PLANO, plan_version: 2, plan_origin: 'briefing',
  }

  it('chama save_signal_plan com os nomes do banco e devolve o Monitoramento com o Plano', async () => {
    const chamadas: Record<string, unknown>[] = []
    const { fonte } = fonteCom({
      rpcs: { save_signal_plan: (p) => { chamadas.push(p); return 'mon-1' }, list_signal_monitors: () => [noBanco] },
    })

    const salvo = await fonte.salvarPlano!({ nome: 'Meta', briefing: 'Quem anuncia na Meta', plano: PLANO })

    expect(chamadas).toEqual([{ p_workspace_id: WORKSPACE, p_monitor_id: null, p_name: 'Meta', p_brief: 'Quem anuncia na Meta', p_plan: PLANO }])
    expect(salvo).toMatchObject({ id: 'mon-1', tipoId: 'anuncios-meta', briefing: 'Quem anuncia na Meta', plano: PLANO, versaoDoPlano: 2 })
  })

  it('o Monitoramento sem Plano (ou com o Plano solto pelo editor) não leva Briefing nem versão', async () => {
    const { fonte } = fonteCom({
      rpcs: { list_signal_monitors: () => [{ ...noBanco, plan: null, plan_version: 3, plan_origin: null }, { ...noBanco, id: 'mon-2', plan: undefined, brief: undefined }] },
    })

    const todos = await fonte.monitoramentos()

    expect(todos).toHaveLength(2)
    for (const m of todos) {
      expect(m.plano).toBeUndefined()
      expect(m.briefing).toBeUndefined()
      expect(m.versaoDoPlano).toBeUndefined()
    }
  })

  it('traduz as recusas do banco para palavras do produto', async () => {
    const recusas: [string, RegExp][] = [
      ['invalid signal plan', /Contas, critérios ou limites inválidos/],
      ['signal type is not available', /ainda está em teste/],
      ['the target account is archived', /arquivada ou foi apagada/],
      ['only the creator or an administrator can change this monitor', /Só quem criou/],
    ]
    for (const [mensagem, esperado] of recusas) {
      const { fonte } = fonteCom({ rpcs: { save_signal_plan: () => { throw new Error(mensagem) } } })
      await expect(fonte.salvarPlano!({ nome: 'x', briefing: 'y', plano: PLANO })).rejects.toThrow(esperado)
    }
  })
})

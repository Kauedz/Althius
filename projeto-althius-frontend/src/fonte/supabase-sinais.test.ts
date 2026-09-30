import { describe, expect, it } from 'vitest'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { criarFonteDeSinaisSupabase } from './supabase-sinais'

const USUARIO = { id: 'usuario-ana', email: 'ana@cliente.com.br' }
const CONTA = '6f1c2d3e-4a5b-4c6d-8e7f-000000000001'
const MONITOR = '8a1c2d3e-4a5b-4c6d-8e7f-000000000001'

function fonte(rpcs: Record<string, (p: Record<string, unknown>) => unknown>) {
  const { cliente } = criarSupabaseFalso({ sessao: sessaoDe(USUARIO), rpcs })
  return criarFonteDeSinaisSupabase(cliente, () => 'ws-norte')
}

const monitorNoBanco = {
  id: MONITOR, signal_type: 'vaga_linkedin', name: 'Vagas de dados', state: 'ativo',
  audience: { accountIds: [CONTA] }, criteria: { palavras: ['dados'] }, every_hours: 24,
  created_by: USUARIO.id, last_run_at: null, created_at: '2026-09-30T10:00:00Z',
}

describe('Sinais reais no Workspace operacional', () => {
  it('cada tipo do catálogo diz se está disponível, em teste ou em breve', async () => {
    const f = fonte({
      list_signal_actors: () => [
        { signal_type: 'vaga_linkedin', state: 'available' },
        { signal_type: 'nova_lideranca', state: 'testing' },
        { signal_type: 'anuncio_meta', state: 'out' },
      ],
    })
    const tipos = await f.tipos()
    const estado = (id: string) => tipos.find((t) => t.id === id)?.disponibilidade
    expect(estado('abertura-de-vagas')).toBe('disponivel')
    expect(estado('nova-lideranca')).toBe('em-teste')
    expect(estado('rodadas')).toBe('em-breve')
  })

  it('lista os Monitoramentos do banco, com o público como Contas', async () => {
    const f = fonte({ list_signal_monitors: () => [monitorNoBanco, { ...monitorNoBanco, id: 'outro', signal_type: 'sem_tipo_na_tela' }] })
    const monitoramentos = await f.monitoramentos()
    expect(monitoramentos).toEqual([
      {
        id: MONITOR, tipoId: 'abertura-de-vagas', nome: 'Vagas de dados', estado: 'ativo',
        publico: { modo: 'listas', listas: [CONTA], usaRecomendado: false }, criterios: { palavras: ['dados'] },
      },
    ])
  })

  it('salvar um Monitoramento chama save_signal_monitor com o Sinal do tipo', async () => {
    const chamadas: Record<string, unknown>[] = []
    const f = fonte({
      save_signal_monitor: (p) => (chamadas.push(p), MONITOR),
      list_signal_monitors: () => [monitorNoBanco],
    })
    const salvo = await f.salvarMonitoramento({
      tipoId: 'abertura-de-vagas', nome: 'Vagas de dados', estado: 'ativo',
      publico: { modo: 'listas', listas: [CONTA], usaRecomendado: false }, criterios: { palavras: ['dados'] },
    })
    expect(chamadas[0]).toMatchObject({
      p_workspace_id: 'ws-norte', p_id: null, p_signal_type: 'vaga_linkedin', p_name: 'Vagas de dados', p_state: 'ativo',
      p_audience: { accountIds: [CONTA] }, p_criteria: { palavras: ['dados'] },
    })
    expect(salvo.id).toBe(MONITOR)
  })

  it('um tipo sem Sinal real ainda é recusado em palavras do produto', async () => {
    const f = fonte({})
    await expect(f.salvarMonitoramento({ tipoId: 'rodadas', nome: 'Rodadas' })).rejects.toThrow('Este Sinal ainda não está disponível.')
  })

  it('um Sinal em teste no registro também é recusado', async () => {
    const f = fonte({
      save_signal_monitor: () => {
        throw Object.assign(new Error('signal type is not available'), { code: '55000' })
      },
    })
    await expect(f.salvarMonitoramento({ tipoId: 'nova-lideranca', nome: 'Liderança' })).rejects.toThrow(
      'Este Sinal ainda está em teste e não roda de verdade.',
    )
  })

  it('muda o estado e exclui pelo banco', async () => {
    const chamadas: [string, Record<string, unknown>][] = []
    const f = fonte({
      set_signal_monitor_state: (p) => (chamadas.push(['estado', p]), null),
      delete_signal_monitor: (p) => (chamadas.push(['excluir', p]), null),
      list_signal_monitors: () => [{ ...monitorNoBanco, state: 'pausado' }],
    })
    expect((await f.mudarEstado(MONITOR, 'pausado')).estado).toBe('pausado')
    await f.excluirMonitoramento(MONITOR)
    expect(chamadas).toEqual([['estado', { p_id: MONITOR, p_state: 'pausado' }], ['excluir', { p_id: MONITOR }]])
  })

  it('os Sinais encontrados trazem a evidência e o reencontro', async () => {
    const f = fonte({
      list_signals: () => [
        {
          id: 's1', target_account_id: CONTA, monitor_id: MONITOR, signal_type: 'vaga_linkedin', event_key: 'alfa|v1',
          phrase: 'Abriu vaga de dados', fired_at: '2026-09-28T10:00:00Z', source: 'LinkedIn', evidence: 'linkedin.com/jobs/1',
          seen_again_at: '2026-09-29T10:00:00Z', valid: true,
        },
      ],
    })
    expect(await f.sinaisEncontrados()).toEqual([
      {
        id: 's1', contaId: CONTA, acontecimentoId: 'alfa|v1', tipoId: 'abertura-de-vagas', monitoramentoId: MONITOR,
        frase: 'Abriu vaga de dados', data: '2026-09-28T10:00:00Z', fonte: 'LinkedIn', evidencia: 'linkedin.com/jobs/1',
        reencontrado: { data: '2026-09-29T10:00:00Z', monitoramentoId: MONITOR },
      },
    ])
  })

  it('o disparo simulado só existe na Demonstração', async () => {
    await expect(fonte({}).simularDisparo({ monitoramentoId: MONITOR })).rejects.toThrow('só na Demonstração')
  })
})

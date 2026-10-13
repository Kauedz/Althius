import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import {
  SINAL_AGREGADO_DO_TIPO,
  SINAL_DO_TIPO,
  SINAL_INTERNO_DO_TIPO,
  SINAL_REAL_DO_TIPO,
  TIPO_DO_SINAL_REAL,
} from './sinais-reais-mapa'
import { criarFonteDeSinaisSupabase } from './supabase-sinais'

// Auditoria de Sinais de 13/10/2026: "Proposta recusada" ganhou a regra no banco, e seis tipos genéricos do catálogo
// passaram a ser servidos pelas cascatas que já existem. A tela só conhece o tipo do catálogo do banco; quem junta as
// cascatas é o servidor.

const USUARIO = { id: 'usuario-ana', email: 'ana@cliente.com.br' }
const CONTA = '6f1c2d3e-4a5b-4c6d-8e7f-000000000001'
const MONITOR = '8a1c2d3e-4a5b-4c6d-8e7f-000000000001'

function fonte(rpcs: Record<string, (p: Record<string, unknown>) => unknown>) {
  const { cliente } = criarSupabaseFalso({ sessao: sessaoDe(USUARIO), rpcs })
  return criarFonteDeSinaisSupabase(cliente, () => 'ws-norte')
}

const catalogo = (linhas: { signal_type: string; origin: string; state: string }[]) => () => linhas

describe('Proposta recusada (Sinal interno)', () => {
  it('fica disponível quando o catálogo do banco a traz, sem actor', async () => {
    const f = fonte({
      list_signal_actors: () => [],
      list_signal_catalog: catalogo([{ signal_type: 'proposta_recusada', origin: 'interno', state: 'available' }]),
    })
    const tipo = (await f.tipos()).find((t) => t.id === 'proposta-recusada')
    expect(tipo?.disponibilidade).toBe('disponivel')
  })

  it('é um tipo interno: só o prazo, como os outros dois', () => {
    expect(SINAL_INTERNO_DO_TIPO['proposta-recusada']).toBe('proposta_recusada')
    expect(SINAL_INTERNO_DO_TIPO).toEqual({
      'sem-resposta': 'sem_resposta',
      'negociacao-parada': 'negociacao_parada',
      'proposta-recusada': 'proposta_recusada',
    })
  })

  it('o Monitoramento salvo vai ao banco com o Sinal interno', async () => {
    const chamadas: Record<string, unknown>[] = []
    const f = fonte({
      save_signal_monitor: (p) => (chamadas.push(p), MONITOR),
      list_signal_monitors: () => [{
        id: MONITOR, signal_type: 'proposta_recusada', name: 'Recusadas há 90 dias', state: 'ativo',
        audience: { accountIds: [CONTA] }, criteria: { prazo: '90' }, last_error: null,
      }],
    })
    const salvo = await f.salvarMonitoramento({
      tipoId: 'proposta-recusada', nome: 'Recusadas há 90 dias', estado: 'ativo',
      publico: { modo: 'listas', listas: [CONTA], usaRecomendado: false }, criterios: { prazo: '90' },
    })
    expect(chamadas[0]).toMatchObject({ p_signal_type: 'proposta_recusada', p_criteria: { prazo: '90' } })
    expect(salvo.tipoId).toBe('proposta-recusada')
  })
})

describe('Tipos genéricos servidos por cascatas', () => {
  const GENERICOS: Record<string, string> = {
    'novo-escritorio': 'novo_escritorio',
    'registros-empresariais': 'registros_empresariais',
    'investimentos-anunciados': 'investimentos_anunciados',
    'crescimento-de-equipes': 'crescimento_de_equipes',
    'expansao-geografica': 'expansao_geografica',
  }

  it('o mapa liga cada tipo genérico ao tipo que o banco calcula, sem tocar nos 9 do lançamento', () => {
    expect(SINAL_AGREGADO_DO_TIPO).toEqual(GENERICOS)
    for (const [tipo, sinal] of Object.entries(GENERICOS)) {
      expect(SINAL_DO_TIPO[tipo]).toBe(sinal)
      expect(TIPO_DO_SINAL_REAL[sinal]).toBe(tipo)
    }
    expect(Object.values(SINAL_REAL_DO_TIPO)).toHaveLength(9)
    expect(Object.keys(SINAL_REAL_DO_TIPO)).not.toContain('novo-escritorio')
  })

  it('cada tipo mostra o estado que o catálogo do banco calcula a partir das cascatas ligadas', async () => {
    const f = fonte({
      list_signal_actors: () => [],
      list_signal_catalog: catalogo([
        { signal_type: 'novo_escritorio', origin: 'externo', state: 'available' },
        { signal_type: 'registros_empresariais', origin: 'externo', state: 'testing' },
        { signal_type: 'investimentos_anunciados', origin: 'externo', state: 'out' },
      ]),
    })
    const estado = async (id: string) => (await f.tipos()).find((t) => t.id === id)?.disponibilidade
    expect(await estado('novo-escritorio')).toBe('disponivel')
    expect(await estado('registros-empresariais')).toBe('em-teste')
    expect(await estado('investimentos-anunciados')).toBe('em-breve')
    expect(await estado('crescimento-de-equipes')).toBe('em-breve')
  })

  it('sem o catálogo no banco, os genéricos ficam em breve', async () => {
    const f = fonte({ list_signal_actors: () => [] })
    const tipos = await f.tipos()
    for (const id of Object.keys(GENERICOS)) expect(tipos.find((t) => t.id === id)?.disponibilidade, id).toBe('em-breve')
  })

  it('salvar um Monitoramento grava o tipo genérico, e a lista o devolve no card genérico', async () => {
    const chamadas: Record<string, unknown>[] = []
    const f = fonte({
      save_signal_monitor: (p) => (chamadas.push(p), MONITOR),
      list_signal_monitors: () => [{
        id: MONITOR, signal_type: 'crescimento_de_equipes', name: 'Times que crescem', state: 'ativo',
        audience: { accountIds: [CONTA] }, criteria: {}, last_error: null,
      }],
    })
    const salvo = await f.salvarMonitoramento({
      tipoId: 'crescimento-de-equipes', nome: 'Times que crescem', estado: 'ativo',
      publico: { modo: 'listas', listas: [CONTA], usaRecomendado: false }, criterios: {},
    })
    expect(chamadas[0]).toMatchObject({ p_signal_type: 'crescimento_de_equipes' })
    expect(salvo.tipoId).toBe('crescimento-de-equipes')
    expect((await f.monitoramentosDoTipo('crescimento-de-equipes')).map((m) => m.id)).toEqual([MONITOR])
  })

  it('os Sinais encontrados do tipo genérico aparecem no card genérico', async () => {
    const f = fonte({
      list_signals: () => [{
        id: 's1', target_account_id: CONTA, monitor_id: MONITOR, signal_type: 'expansao_geografica', event_key: 'filial|1',
        phrase: 'Nova filial em Curitiba', fired_at: '2026-10-10T10:00:00Z', source: 'Receita Federal', evidence: 'Filial aberta em 10/10/2026.',
        seen_again_at: null, seen_again_monitor_id: null, valid: true,
      }],
    })
    expect((await f.sinaisEncontrados()).map((s) => [s.tipoId, s.frase])).toEqual([['expansao-geografica', 'Nova filial em Curitiba']])
  })
})

// A tela e o banco têm de dizer os mesmos nomes de tipo: um tipo que a tela mapeia e o banco não conhece nunca fica disponível.
describe('Paridade com as migrações da auditoria de Sinais', () => {
  const migracao = (arquivo: string) => readFileSync(path.resolve(import.meta.dirname, '../../../supabase/migrations', arquivo), 'utf8')
  const GENERICOS = migracao('20261015110000_tipos_genericos_em_cascatas.sql')
  const RECUSADA = migracao('20261015100000_sinal_proposta_recusada.sql')

  it('cada tipo genérico que a tela mapeia entra no catálogo do banco e tem cascatas ligadas', () => {
    for (const sinal of Object.values(SINAL_AGREGADO_DO_TIPO)) {
      expect(GENERICOS, sinal).toContain(`('${sinal}', 'externo')`)
      expect(GENERICOS, sinal).toMatch(new RegExp(`\\('${sinal}', '[a-z_]+', [0-9]+\\)`))
    }
    expect(GENERICOS).toMatch(/\('vaga_linkedin', 'vaga_comex', 1\)/)
  })

  it('a Proposta recusada entra no catálogo do banco como Sinal interno disponível', () => {
    expect(RECUSADA).toContain(`('${SINAL_INTERNO_DO_TIPO['proposta-recusada']}', 'interno', 'available')`)
  })
})

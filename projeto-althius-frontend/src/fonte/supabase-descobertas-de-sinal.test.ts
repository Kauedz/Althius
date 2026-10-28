import { describe, expect, it } from 'vitest'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { criarFonteDeDescobertasSupabase } from './supabase-descobertas'
import { criarFonteDeSinaisSupabase } from './supabase-sinais'

const USUARIO = { id: 'usuario-ana', email: 'ana@cliente.com.br' }

function cliente(rpcs: Record<string, (p: Record<string, unknown>) => unknown>) {
  return criarSupabaseFalso({ sessao: sessaoDe(USUARIO), rpcs }).cliente
}

const linhaDaCaixa = {
  id: 'c-1', run_id: null, state: 'nova', name: 'Zeta Indústria Ltda', website: null, domain: null, cnpj: '47960950000121',
  linkedin_url: null, location: null, uf: 'SP', sector: null, size_label: null, employee_count: null, description: null,
  tags: [], source_actor: 'sinal:nova_filial_icp_g', fit_level: 'alto', reasons: [], signals: [], target_account_id: null,
  decided_by: null, decided_at: null, discard_reason: null, created_at: '2026-10-01T10:00:00Z',
  origin: 'sinal', reopened_by_signal_at: '2026-10-10T12:00:00Z', reopened_discard_reason: 'Fora do ICP',
  signal_reasons: [
    { id: 's-1', tipo: 'nova_filial_icp_g', frase: 'Abriu filial em Campinas', fonte: 'Diário Oficial', data: '2026-10-09T12:00:00Z', valido: true, mercado: false },
    { id: 's-2', tipo: 'licenca_instalacao_dou', frase: 'Sinal registrado.', fonte: null, data: '2026-08-01T12:00:00Z', valido: false, mercado: true },
  ],
}

describe('Descobertas reais com Sinais', () => {
  it('a lista traz a origem, a reabertura por Sinal novo, o motivo anterior e os Sinais da candidata', async () => {
    const f = criarFonteDeDescobertasSupabase(cliente({ list_discovered_accounts: () => [linhaDaCaixa] }), () => 'ws-norte')
    const [c] = await f.listarDescobertas('nova')
    expect(c.origem).toBe('sinal')
    expect(c.voltouPorSinalEm).toBe('2026-10-10T12:00:00Z')
    expect(c.motivoDoDescarteAnterior).toBe('Fora do ICP')
    expect(c.fitLevel).toBe('alto')
    expect(c.motivosDeSinal).toEqual([
      { id: 's-1', tipo: 'nova_filial_icp_g', frase: 'Abriu filial em Campinas', fonte: 'Diário Oficial', data: '2026-10-09T12:00:00Z', valido: true, mercado: false },
      { id: 's-2', tipo: 'licenca_instalacao_dou', frase: 'Sinal registrado.', data: '2026-08-01T12:00:00Z', valido: false, mercado: true },
    ])
  })

  it('uma candidata antiga da busca, sem as colunas novas, segue como busca e sem Sinais', async () => {
    const { origin: _o, signal_reasons: _s, reopened_by_signal_at: _r, reopened_discard_reason: _d, ...antiga } = linhaDaCaixa
    const f = criarFonteDeDescobertasSupabase(cliente({ list_discovered_accounts: () => [antiga] }), () => 'ws-norte')
    const [c] = await f.listarDescobertas('nova')
    expect([c.origem, c.motivosDeSinal, c.voltouPorSinalEm, c.motivoDoDescarteAnterior]).toEqual(['busca', [], undefined, undefined])
  })

  it('os motivos da busca chegam como objetos {criterio, atende, texto} e viram o texto de cada um', async () => {
    const daBusca = {
      ...linhaDaCaixa, origin: 'busca', signal_reasons: [],
      reasons: [
        { texto: 'Setor: combina com "Logistica".', atende: true, criterio: 'setor' },
        { texto: 'Região: sede em SP.', atende: true, criterio: 'regiao' },
        'Porte: até 50 funcionários',
        { criterio: 'porte', atende: null },
        null,
      ],
    }
    const f = criarFonteDeDescobertasSupabase(cliente({ list_discovered_accounts: () => [daBusca] }), () => 'ws-norte')
    const [c] = await f.listarDescobertas('nova')
    expect(c.motivos).toEqual(['Setor: combina com "Logistica".', 'Região: sede em SP.', 'Porte: até 50 funcionários'])
  })

  it('o aceite devolve a Conta, os Sinais migrados e o que dá para fazer com o Comitê; sem site manda p_url nulo', async () => {
    const chamadas: Record<string, unknown>[] = []
    const f = criarFonteDeDescobertasSupabase(cliente({
      accept_discovered_account: (p) => (chamadas.push(p), [{ target_account_id: 'conta-1', created: true, signals_moved: 2, committee: 'liberado' }]),
    }), () => 'ws-norte')
    expect(await f.aceitarDescoberta('c-1')).toEqual({ targetAccountId: 'conta-1', created: true, sinaisMigrados: 2, comite: 'liberado' })
    expect(chamadas[0]).toEqual({ p_id: 'c-1', p_url: null })
    await f.aceitarDescoberta('c-1', ' https://zeta.test ')
    expect(chamadas[1]).toEqual({ p_id: 'c-1', p_url: 'https://zeta.test' })
  })

  it('um estado do Comitê que a tela não conhece vira "sem saldo": nunca dispara sozinho', async () => {
    const f = criarFonteDeDescobertasSupabase(cliente({
      accept_discovered_account: () => [{ target_account_id: 'conta-1', created: false, signals_moved: 0, committee: 'qualquer' }],
    }), () => 'ws-norte')
    expect((await f.aceitarDescoberta('c-1')).comite).toBe('sem_saldo')
  })
})

describe('Sinais com empresa no Workspace operacional', () => {
  it('os Sinais das candidatas vêm de list_candidate_signals, e um tipo que a tela não conhece vira Sinal', async () => {
    const f = criarFonteDeSinaisSupabase(cliente({
      list_candidate_signals: () => [
        { id: 'g-1', discovered_account_id: 'c-1', company_name: 'Zeta Indústria Ltda', signal_type: 'vaga_linkedin', phrase: 'Abriu vaga', fired_at: '2026-10-09T12:00:00Z', source: 'LinkedIn' },
        { id: 'g-2', discovered_account_id: 'c-1', company_name: 'Zeta Indústria Ltda', signal_type: 'tipo_que_nao_existe', phrase: 'Sinal registrado.', fired_at: '2026-10-08T12:00:00Z', source: null },
      ],
    }), () => 'ws-norte')
    const sinais = await f.sinaisDeCandidatas!()
    expect(sinais.map((s) => [s.candidataId, s.empresa, s.frase, s.fonte])).toEqual([
      ['c-1', 'Zeta Indústria Ltda', 'Abriu vaga', 'LinkedIn'],
      ['c-1', 'Zeta Indústria Ltda', 'Sinal registrado.', ''],
    ])
    expect(sinais[1].tipoId).toBe('tipo_que_nao_existe')
  })

  it('os Sinais de mercado ganham a empresa (Conta ou candidata) quando o banco a sabe', async () => {
    const f = criarFonteDeSinaisSupabase(cliente({
      list_market_signals_for_workspace_icp: () => [
        { id: 'm1', signal_type: 'licenca_instalacao_dou', name: 'Licença', phrase: 'Licença para uma empresa', fired_at: '2026-10-03T00:00:00Z' },
        { id: 'm2', signal_type: 'licenca_instalacao_dou', name: 'Licença', phrase: 'Licença para a Beta', fired_at: '2026-10-02T00:00:00Z' },
        { id: 'm3', signal_type: 'licenca_instalacao_dou', name: 'Licença', phrase: 'Licença sem empresa', fired_at: '2026-10-01T00:00:00Z' },
      ],
      list_market_signal_companies: () => [
        { market_signal_id: 'm1', target_account_id: null, discovered_account_id: 'c-1' },
        { market_signal_id: 'm2', target_account_id: 'conta-2', discovered_account_id: null },
      ],
    }), () => 'ws-norte')
    const sinais = await f.sinaisDeMercado('A')
    expect(sinais.map((s) => s.empresa)).toEqual([{ tipo: 'candidata', id: 'c-1' }, { tipo: 'conta', id: 'conta-2' }, undefined])
  })

  it('se a leitura do vínculo falha, a lista de Mercado aparece como sempre', async () => {
    const f = criarFonteDeSinaisSupabase(cliente({
      list_market_signals_for_workspace_icp: () => [{ id: 'm1', signal_type: 'licenca_instalacao_dou', name: 'Licença', phrase: 'Licença', fired_at: '2026-10-03T00:00:00Z' }],
      list_market_signal_companies: () => { throw new Error('indisponível') },
    }), () => 'ws-norte')
    expect(await f.sinaisDeMercado('A')).toEqual([{ id: 'm1', tipo: 'licenca_instalacao_dou', nome: 'Licença', frase: 'Licença', data: '2026-10-03T00:00:00Z' }])
  })
})

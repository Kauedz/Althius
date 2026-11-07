import { describe, expect, it, vi } from 'vitest'
import { ErroDaBuscaDeContas } from './descobertas-tipos'
import { criarFonteDeDescobertasSupabase } from './supabase-descobertas'

const criterios = { fonte: 'linkedin' as const, setores: ['Software'], palavrasChave: [], portes: [], regioes: [], tecnologias: [], excluir: [], cnaes: [] }

function cliente(invoke: ReturnType<typeof vi.fn>) {
  return { functions: { invoke }, rpc: vi.fn() } as never
}

describe('Fonte Supabase de Descobertas', () => {
  it('transforma o corpo JSON do erro em mensagem e usa fallback quando não é JSON', async () => {
    const json = vi.fn().mockResolvedValue({ error: 'Informe ao menos um setor ou uma palavra-chave.' })
    const invoke = vi.fn().mockResolvedValue({ error: { message: 'generic', context: { json } } })
    const fonte = criarFonteDeDescobertasSupabase(cliente(invoke), () => 'w1')
    await expect(fonte.prepararBusca()).rejects.toThrow('Informe ao menos um setor ou uma palavra-chave.')
    invoke.mockResolvedValue({ error: { message: 'generic', context: { json: vi.fn().mockRejectedValue(new Error('not json')) } } })
    await expect(fonte.prepararBusca()).rejects.toThrow('generic')
  })

  it('não tem mais a leitura de filtros pelo ICP do Playbook (contexto-da-empresa 07)', () => {
    const fonte = criarFonteDeDescobertasSupabase(cliente(vi.fn()), () => 'w1') as unknown as Record<string, unknown>
    expect(fonte.criteriosDaBusca).toBeUndefined()
    expect(fonte.buscarContas).toBeUndefined()
  })

  it('prepara pelo Contexto da empresa e busca pelos perfis com a versão; a recusa traz o código', async () => {
    const preparacao = { estado: 'pronta', contextoVersao: 7, fonte: 'linkedin', perfis: [{ nome: 'ICP primário', criterios, aplicados: [], pendentes: [] }] }
    const json = vi.fn().mockResolvedValue({ code: 'contexto_mudou', error: 'O Contexto da empresa mudou.' })
    const invoke = vi.fn()
      .mockResolvedValueOnce({ data: preparacao, error: null })
      .mockResolvedValueOnce({ data: { runId: 'r1' }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'generic', context: { json } } })
    const fonte = criarFonteDeDescobertasSupabase(cliente(invoke), () => 'w1')
    await expect(fonte.prepararBusca()).resolves.toEqual(preparacao)
    expect(invoke).toHaveBeenLastCalledWith('account-discovery', { body: { action: 'prepare', workspaceId: 'w1' } })

    const perfis = [{ nome: 'ICP primário', criterios, aplicados: [], pendentes: [] }]
    await fonte.buscarPorPerfis({ perfis, contextoVersao: 7 })
    expect(invoke).toHaveBeenLastCalledWith('account-discovery', {
      body: expect.objectContaining({ action: 'search', workspaceId: 'w1', perfis, contextoVersao: 7, maxResults: 50, allowTesting: false }),
    })
    const erro = await fonte.buscarPorPerfis({ perfis, contextoVersao: 7 }).catch((e) => e)
    expect(erro).toBeInstanceOf(ErroDaBuscaDeContas)
    expect(erro).toMatchObject({ message: 'O Contexto da empresa mudou.', codigo: 'contexto_mudou' })
  })

  it('a última busca distingue falha da fonte, zero resultados e resultados, com a versão do contexto', async () => {
    const rpc = vi.fn()
    const fonte = criarFonteDeDescobertasSupabase({ functions: { invoke: vi.fn() }, rpc } as never, () => 'w1')
    const linha = (extra: Record<string, unknown>) => ({
      state: 'concluida', found: 0, added: 0, last_error: null,
      criteria: { origem: 'contexto_da_empresa', contexto: { versao: 7 }, perfis: [{ nome: 'ICP primário' }, { nome: 'ICP secundário' }] },
      ...extra,
    })
    rpc.mockResolvedValueOnce({ data: [linha({ state: 'aguardando_confirmacao' }), linha({})], error: null })
    await expect(fonte.ultimaBusca!()).resolves.toEqual({
      desfecho: 'sem_resultados', encontradas: 0, novas: 0, contextoVersao: 7, perfis: ['ICP primário', 'ICP secundário'],
    })
    expect(rpc).toHaveBeenCalledWith('list_discovery_runs', { p_workspace_id: 'w1', p_kind: 'contas', p_limit: 5 })

    rpc.mockResolvedValueOnce({ data: [linha({ state: 'falhou', last_error: 'A fonte não respondeu a tempo.', criteria: { setores: ['x'] } })], error: null })
    await expect(fonte.ultimaBusca!()).resolves.toMatchObject({ desfecho: 'falha_da_fonte', mensagem: 'A fonte não respondeu a tempo.', contextoVersao: null, perfis: [] })

    rpc.mockResolvedValueOnce({ data: [linha({ found: 4, added: 3, last_error: 'Parte da busca falhou.' })], error: null })
    await expect(fonte.ultimaBusca!()).resolves.toMatchObject({ desfecho: 'com_resultados', encontradas: 4, novas: 3, mensagem: 'Parte da busca falhou.' })

    // Falha parcial sem nenhuma empresa: a fonte falhou, não é mercado vazio.
    rpc.mockResolvedValueOnce({ data: [linha({ found: 0, last_error: 'Parte da busca falhou: a fonte não respondeu.' })], error: null })
    await expect(fonte.ultimaBusca!()).resolves.toMatchObject({ desfecho: 'falha_da_fonte' })

    rpc.mockResolvedValueOnce({ data: [linha({ state: 'em_andamento' })], error: null })
    await expect(fonte.ultimaBusca!()).resolves.toMatchObject({ desfecho: 'em_andamento' })

    rpc.mockResolvedValueOnce({ data: [], error: null })
    await expect(fonte.ultimaBusca!()).resolves.toBeNull()
  })
})

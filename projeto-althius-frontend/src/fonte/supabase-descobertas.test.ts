import { describe, expect, it, vi } from 'vitest'
import { criarFonteDeDescobertasSupabase } from './supabase-descobertas'

const criterios = { fonte: 'linkedin' as const, setores: ['Software'], palavrasChave: [], portes: [], regioes: [], tecnologias: [], excluir: [], cnaes: [] }

function cliente(invoke: ReturnType<typeof vi.fn>) {
  return { functions: { invoke }, rpc: vi.fn() } as never
}

describe('Fonte Supabase de Descobertas', () => {
  it('envia critérios e versão na busca e critérios na leitura', async () => {
    const invoke = vi.fn()
      .mockResolvedValueOnce({ data: { temIcp: true, icpVersion: 4, icpResumo: 'Software', criteria: criterios }, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
    const fonte = criarFonteDeDescobertasSupabase(cliente(invoke), () => 'w1')
    await expect(fonte.criteriosDaBusca()).resolves.toMatchObject({ icpVersion: 4, criterios })
    await fonte.buscarContas({ criterios, icpVersion: 4, allowTesting: true })
    expect(invoke).toHaveBeenLastCalledWith('account-discovery', expect.objectContaining({ body: expect.objectContaining({ action: 'search', workspaceId: 'w1', criteria: criterios, icpVersion: 4, allowTesting: true }) }))
  })

  it('transforma o corpo JSON do erro em mensagem e usa fallback quando não é JSON', async () => {
    const json = vi.fn().mockResolvedValue({ error: 'Informe ao menos um setor ou uma palavra-chave.' })
    const invoke = vi.fn().mockResolvedValue({ error: { message: 'generic', context: { json } } })
    const fonte = criarFonteDeDescobertasSupabase(cliente(invoke), () => 'w1')
    await expect(fonte.criteriosDaBusca()).rejects.toThrow('Informe ao menos um setor ou uma palavra-chave.')
    invoke.mockResolvedValue({ error: { message: 'generic', context: { json: vi.fn().mockRejectedValue(new Error('not json')) } } })
    await expect(fonte.criteriosDaBusca()).rejects.toThrow('generic')
  })
})

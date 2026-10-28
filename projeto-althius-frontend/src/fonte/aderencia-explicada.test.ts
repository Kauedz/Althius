import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { explicarAderencia } from './aderencia-explicada'

function cliente(resposta: { data?: unknown; error?: unknown }) {
  const invoke = vi.fn().mockResolvedValue({ data: null, error: null, ...resposta })
  return { cliente: { functions: { invoke } } as unknown as SupabaseClient, invoke }
}

describe('explicarAderencia', () => {
  it('chama a função com a Descoberta e devolve texto, origem e nível', async () => {
    const { cliente: c, invoke } = cliente({ data: { explicacao: 'Atua em seguros, como o ICP pede.', origem: 'ia', nivel: 'medio', pontuacao: 71 } })
    await expect(explicarAderencia(c, 'd1')).resolves.toEqual({ explicacao: 'Atua em seguros, como o ICP pede.', origem: 'ia', nivel: 'medio' })
    expect(invoke).toHaveBeenCalledWith('account-fit-explanation', { body: { discoveredAccountId: 'd1' } })
  })

  it('traduz 404 e erros desconhecidos sem mostrar o erro cru', async () => {
    await expect(explicarAderencia(cliente({ error: { context: { status: 404 } } }).cliente, 'd1')).rejects.toThrow('Descoberta não encontrada.')
    await expect(explicarAderencia(cliente({ error: { message: 'boom 500 stack' } }).cliente, 'd1')).rejects.toThrow('Não deu para explicar a Aderência agora. Tente de novo.')
  })

  it('resposta fora do contrato vira erro neutro', async () => {
    await expect(explicarAderencia(cliente({ data: { explicacao: 1 } }).cliente, 'd1')).rejects.toThrow('Não deu para explicar')
  })
})

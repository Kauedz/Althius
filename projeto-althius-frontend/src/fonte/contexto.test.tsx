import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useCarregamento, useDados } from './contexto'
import type { FonteObservavel } from './tipos'

describe('useCarregamento e useDados genéricos', () => {
  function criarFonteMock<T>(valorInicial: T) {
    let valor = valorInicial
    const ouvintes = new Set<() => void>()
    return {
      observar(ouvinte: () => void) {
        ouvintes.add(ouvinte)
        return () => {
          ouvintes.delete(ouvinte)
        }
      },
      obter() {
        return Promise.resolve(valor)
      },
      atualizar(novoValor: T) {
        valor = novoValor
        for (const ouvinte of ouvintes) ouvinte()
      },
    } satisfies FonteObservavel & { obter: () => Promise<T>; atualizar: (v: T) => void }
  }

  it('carrega dados de uma fonte observável arbitrária sem depender de FonteDeAgentes', async () => {
    const fonte = criarFonteMock(['Item A', 'Item B'])
    const { result } = renderHook(() => useDados(fonte, (f) => f.obter(), []))

    expect(result.current).toBeUndefined()
    await waitFor(() => expect(result.current).toEqual(['Item A', 'Item B']))
  })

  it('recarrega automaticamente quando a fonte avisa uma mudança via observar', async () => {
    const fonte = criarFonteMock(['Primeiro'])
    const { result } = renderHook(() => useDados(fonte, (f) => f.obter(), []))

    await waitFor(() => expect(result.current).toEqual(['Primeiro']))

    act(() => {
      fonte.atualizar(['Primeiro', 'Segundo'])
    })

    await waitFor(() => expect(result.current).toEqual(['Primeiro', 'Segundo']))
  })

  it('descarta dados anteriores ao mudar dependências', async () => {
    const fonte = {
      observar: () => () => {},
      buscarPorId: (id: string) => Promise.resolve(`Resultado ${id}`),
    }

    let id = '1'
    const { result, rerender } = renderHook(() => useDados(fonte, (f) => f.buscarPorId(id), [id]))

    await waitFor(() => expect(result.current).toBe('Resultado 1'))

    id = '2'
    rerender()

    // Ao mudar id, não deve manter 'Resultado 1'
    expect(result.current).toBeUndefined()
    await waitFor(() => expect(result.current).toBe('Resultado 2'))
  })

  it('useCarregamento captura erro e permite tentar de novo via recarregar()', async () => {
    let deveFalhar = true
    const ouvintes = new Set<() => void>()
    const fonte: FonteObservavel = {
      observar: (o) => {
        ouvintes.add(o)
        return () => {
          ouvintes.delete(o)
        }
      },
    }

    const carregar = vi.fn(() => {
      if (deveFalhar) return Promise.reject(new Error('Falha na conexão'))
      return Promise.resolve('Sucesso')
    })

    const { result } = renderHook(() => useCarregamento(fonte, carregar, []))

    await waitFor(() => {
      expect(result.current.erro).toBeInstanceOf(Error)
      expect(result.current.erro?.message).toBe('Falha na conexão')
      expect(result.current.carregando).toBe(false)
      expect(result.current.dados).toBeUndefined()
    })

    // Corrige e tenta de novo
    deveFalhar = false
    act(() => {
      result.current.recarregar()
    })

    await waitFor(() => {
      expect(result.current.dados).toBe('Sucesso')
      expect(result.current.erro).toBeNull()
      expect(result.current.carregando).toBe(false)
    })
  })
})

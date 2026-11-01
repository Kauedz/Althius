import { act, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { FonteDeContas } from '@/fonte/contas-tipos'
import { renderizarAppCom } from '@/test/renderizar'

async function abrir(metodos: Partial<FonteDeContas>) {
  const app = renderizarAppCom('/contatos', {
    contas: (fonte): FonteDeContas => ({
      ...fonte,
      contatos: async () => (await fonte.contatos()).map((c) =>
        ['Clara Dupont', 'Carlos Mendoza'].includes(c.nome)
          ? { ...c, canais: { ...c.canais, email: false } } : c),
      ...metodos,
    }),
  })
  for (const nome of ['Clara Dupont', 'Carlos Mendoza']) {
    await app.usuario.click(await screen.findByRole('checkbox', { name: `Selecionar ${nome}` }))
  }
  await app.usuario.click(screen.getByRole('button', { name: 'Revelar E-mail em lote' }))
  return app.usuario
}

function pendente<T>() {
  let resolver!: (valor: T) => void
  const promessa = new Promise<T>((resolve) => { resolver = resolve })
  return { promessa, resolver }
}

describe('Correções do lote de e-mail', () => {
  it('aguarda todas as cotações e soma preços diferentes de 2 antes de confirmar', async () => {
    const segunda = pendente<{ creditos: number; saldo: number; podeRevelar: boolean }>()
    const cotar = vi.fn().mockResolvedValueOnce({ creditos: 7, saldo: 30, podeRevelar: true })
      .mockReturnValueOnce(segunda.promessa)
    const revelar = vi.fn()
    const usuario = await abrir({ cotarRevelacaoContato: cotar, revelarContato: revelar })
    expect(screen.getByRole('button', { name: 'Confirmar e Revelar' })).toBeDisabled()
    await usuario.click(screen.getByRole('button', { name: 'Confirmar e Revelar' }))
    expect(revelar).not.toHaveBeenCalled()
    await act(async () => segunda.resolver({ creditos: 4, saldo: 30, podeRevelar: true }))
    expect(await screen.findByText('11 créditos')).toBeInTheDocument()
    expect(cotar).toHaveBeenCalledTimes(2)
    expect(cotar.mock.calls.every(([, canal]) => canal === 'email')).toBe(true)
    expect(screen.getByRole('button', { name: 'Confirmar e Revelar' })).toBeEnabled()
  })
  it.each([
    ['erro', { cotarRevelacaoContato: vi.fn().mockRejectedValue(new Error('Falha da cotação')) }],
    ['indisponível', { cotarRevelacaoContato: undefined }],
    ['impedido', { cotarRevelacaoContato: vi.fn().mockResolvedValue({ creditos: 7, saldo: 30, podeRevelar: false }) }],
  ])('bloqueia confirmação com cotação %s', async (_, metodos) => {
    const revelarContato = vi.fn()
    const usuario = await abrir({ ...metodos, revelarContato })
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar e Revelar' })).toBeDisabled()
    await usuario.click(screen.getByRole('button', { name: 'Confirmar e Revelar' }))
    expect(revelarContato).not.toHaveBeenCalled()
  })

  it('impede Cancelar, X e Escape durante a busca e preserva o resultado até fechar e reabrir', async () => {
    const busca = pendente<{ sucesso: boolean; valor: null; creditosDebitados: number }>()
    const revelarContato = vi.fn().mockReturnValueOnce(busca.promessa)
      .mockResolvedValue({ sucesso: false, valor: null, creditosDebitados: 0 })
    const usuario = await abrir({
      cotarRevelacaoContato: vi.fn().mockResolvedValue({ creditos: 3, saldo: 30, podeRevelar: true }),
      revelarContato,
    })
    await screen.findByText('6 créditos')
    await usuario.click(screen.getByRole('button', { name: 'Confirmar e Revelar' }))
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    const fechar = screen.queryByRole('button', { name: 'Fechar' })
    if (fechar) await usuario.click(fechar)
    await usuario.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(revelarContato).toHaveBeenCalledTimes(1)
    await act(async () => busca.resolver({ sucesso: false, valor: null, creditosDebitados: 0 }))
    expect(revelarContato).toHaveBeenCalledTimes(2)
    expect(within(screen.getByRole('dialog')).getByText(/Clara Dupont:/)).toBeInTheDocument()
    await usuario.click(screen.getAllByRole('button', { name: 'Fechar' })[0])
    await usuario.click(screen.getByRole('button', { name: 'Revelar E-mail em lote' }))
    expect(await screen.findByText('6 créditos')).toBeInTheDocument()
    expect(revelarContato).toHaveBeenCalledTimes(2)
  })

  it('respeita podeRevelar da Fonte para créditos ilimitados com saldo zero', async () => {
    await abrir({
      cotarRevelacaoContato: vi.fn().mockResolvedValue({ creditos: 7, saldo: 0, podeRevelar: true }),
      revelarContato: vi.fn(),
    })
    await screen.findByText('14 créditos')
    expect(screen.getByRole('button', { name: 'Confirmar e Revelar' })).toBeEnabled()
  })

})

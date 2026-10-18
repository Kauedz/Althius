import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PaginaDeDescadastro, tokenDeDescadastroDoCaminho } from './pagina-de-descadastro'

describe('Página de descadastro', () => {
  it('só abre em /descadastro com o token', () => {
    expect(tokenDeDescadastroDoCaminho('/descadastro', '?t=abc')).toBe('abc')
    expect(tokenDeDescadastroDoCaminho('/contas', '?t=abc')).toBeNull()
    expect(tokenDeDescadastroDoCaminho('/descadastro', '')).toBe('')
  })

  it('pede a confirmação e confirma em português', async () => {
    const confirmar = vi.fn().mockResolvedValue('registered')
    render(<PaginaDeDescadastro token="abc" confirmar={confirmar} />)
    expect(confirmar).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar descadastro' }))
    expect(confirmar).toHaveBeenCalledWith('abc')
    expect(await screen.findByText('Pronto: você não vai mais receber estes e-mails.')).toBeTruthy()
  })

  it('link inválido não confirma nada', async () => {
    const confirmar = vi.fn().mockResolvedValue('invalid')
    render(<PaginaDeDescadastro token="xyz" confirmar={confirmar} />)
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar descadastro' }))
    expect(await screen.findByText('Este link de descadastro não é válido.')).toBeTruthy()
  })
})

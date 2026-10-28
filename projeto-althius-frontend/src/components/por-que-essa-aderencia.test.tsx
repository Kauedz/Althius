import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PorQueEssaAderencia } from './por-que-essa-aderencia'

describe('PorQueEssaAderencia', () => {
  it('mostra a explicação da IA com o aviso de que a nota não muda', async () => {
    const explicar = vi.fn().mockResolvedValue({ explicacao: 'Atua em seguros, como o ICP pede.', origem: 'ia', nivel: 'medio' })
    render(<PorQueEssaAderencia explicar={explicar} />)
    await userEvent.click(screen.getByRole('button', { name: 'Por que essa Aderência?' }))
    expect(await screen.findByText('Atua em seguros, como o ICP pede.')).toBeInTheDocument()
    expect(screen.getByText('Escrita por IA; a nota não muda.')).toBeInTheDocument()
    expect(explicar).toHaveBeenCalledTimes(1)
  })

  it('explicação pela regra não leva o aviso de IA', async () => {
    render(<PorQueEssaAderencia explicar={vi.fn().mockResolvedValue({ explicacao: 'Aderência média. Setor: atua em Insurance.', origem: 'regra', nivel: 'medio' })} />)
    await userEvent.click(screen.getByRole('button', { name: 'Por que essa Aderência?' }))
    expect(await screen.findByText('Aderência média. Setor: atua em Insurance.')).toBeInTheDocument()
    expect(screen.queryByText('Escrita por IA; a nota não muda.')).not.toBeInTheDocument()
  })

  it('erro mostra a mensagem e deixa tentar de novo', async () => {
    render(<PorQueEssaAderencia explicar={vi.fn().mockRejectedValue(new Error('Descoberta não encontrada.'))} />)
    await userEvent.click(screen.getByRole('button', { name: 'Por que essa Aderência?' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Descoberta não encontrada.')
    expect(screen.getByRole('button', { name: 'Por que essa Aderência?' })).toBeEnabled()
  })
})

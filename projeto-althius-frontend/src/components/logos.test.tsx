import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LogoDaIntegracao } from '@/components/logos'

// Uma Integração sem logo cadastrado (Calendly, Bitrix24, TikTok Ads…) mostra as iniciais, nunca uma imagem quebrada.

afterEach(cleanup)

describe('O logo de uma Integração', () => {
  it('sem logo cadastrado, mostra as iniciais com o nome para leitores de tela, sem imagem quebrada', () => {
    const { container } = render(<LogoDaIntegracao id="calendly" nome="Calendly" />)
    expect(screen.getByRole('img', { name: 'Calendly' })).toHaveTextContent('C')
    expect(container.querySelector('img')).toBeNull()
  })

  it('com logo em imagem, usa a imagem', () => {
    const { container } = render(<LogoDaIntegracao id="clay" nome="Clay" />)
    expect(container.querySelector('img')?.getAttribute('src')).toBeTruthy()
  })

  it('a Integração Slack usa o mesmo logo do Canal Slack', () => {
    const { container } = render(<LogoDaIntegracao id="slack" nome="Slack" />)
    expect(container.querySelector('svg path')).not.toBeNull()
    expect(screen.getByRole('img', { name: 'Slack' })).toBeInTheDocument()
  })
})

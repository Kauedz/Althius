import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { LimiteDeErro } from './limite-de-erro'

function Quebra({ quebrar }: { quebrar: boolean }) {
  if (quebrar) throw new Error('Objects are not valid as a React child')
  return <p>Conteúdo da tela</p>
}

describe('LimiteDeErro', () => {
  it('um erro ao desenhar a tela mostra o aviso no lugar dela e deixa o resto do app de pé', () => {
    const silenciar = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <div>
        <nav>Barra lateral</nav>
        <LimiteDeErro><Quebra quebrar /></LimiteDeErro>
      </div>,
    )
    expect(screen.getByText('Barra lateral')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Esta tela não abriu por um erro')
    silenciar.mockRestore()
  })

  it('"Tentar de novo" desenha a tela outra vez', async () => {
    const silenciar = vi.spyOn(console, 'error').mockImplementation(() => {})
    function Cenario() {
      const [quebrar, setQuebrar] = useState(true)
      return (
        <>
          <button type="button" onClick={() => setQuebrar(false)}>Consertar</button>
          <LimiteDeErro><Quebra quebrar={quebrar} /></LimiteDeErro>
        </>
      )
    }
    render(<Cenario />)
    await userEvent.click(screen.getByRole('button', { name: 'Consertar' }))
    await userEvent.click(screen.getByRole('button', { name: /Tentar de novo/ }))
    expect(screen.getByText('Conteúdo da tela')).toBeInTheDocument()
    silenciar.mockRestore()
  })
})

describe('LimiteDeErro ao trocar de endereço', () => {
  it('uma chave de reinício nova (outro endereço) tira o aviso e desenha a tela nova', () => {
    const silenciar = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { rerender } = render(<LimiteDeErro chaveDeReinicio="/contas/descobertas"><Quebra quebrar /></LimiteDeErro>)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    rerender(<LimiteDeErro chaveDeReinicio="/contas"><Quebra quebrar={false} /></LimiteDeErro>)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Conteúdo da tela')).toBeInTheDocument()
    silenciar.mockRestore()
  })
})

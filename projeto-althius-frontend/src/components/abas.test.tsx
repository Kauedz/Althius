import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AbasSublinhadas } from './abas'

describe('AbasSublinhadas', () => {
  it('renderiza o nav com o rótulo acessível e os links das abas', () => {
    const abas = [
      { rotulo: 'Contas', para: '/contas' },
      { rotulo: 'Contatos', para: '/contatos' },
    ]

    render(
      <MemoryRouter initialEntries={['/contas']}>
        <AbasSublinhadas rotuloAcessivel="Módulo de Contas" abas={abas} />
      </MemoryRouter>,
    )

    const nav = screen.getByRole('navigation', { name: 'Módulo de Contas' })
    expect(nav).toBeInTheDocument()

    const linkContas = screen.getByRole('link', { name: 'Contas' })
    const linkContatos = screen.getByRole('link', { name: 'Contatos' })

    expect(linkContas).toHaveAttribute('href', '/contas')
    expect(linkContatos).toHaveAttribute('href', '/contatos')

    // Contas está ativa na rota /contas
    expect(linkContas).toHaveClass('border-al-accent')
    expect(linkContatos).toHaveClass('border-transparent')
  })

  it('destaca a aba correspondente quando a rota muda', () => {
    const abas = [
      { rotulo: 'Conversa', para: '/agentes/1/conversa' },
      { rotulo: 'Memória', para: '/agentes/1/memoria' },
    ]

    render(
      <MemoryRouter initialEntries={['/agentes/1/memoria']}>
        <AbasSublinhadas rotuloAcessivel="Seções do agente" abas={abas} />
      </MemoryRouter>,
    )

    const linkConversa = screen.getByRole('link', { name: 'Conversa' })
    const linkMemoria = screen.getByRole('link', { name: 'Memória' })

    expect(linkConversa).toHaveClass('border-transparent')
    expect(linkMemoria).toHaveClass('border-al-accent')
  })
})

import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderizarApp } from '@/test/renderizar'

describe('Pedido de Sinal à equipe Althius', () => {
  it('o catálogo oferece Falar com a equipe Althius e não o construtor antigo', async () => {
    const { usuario } = renderizarApp('/sinais')
    const falar = await screen.findByRole('link', { name: 'Falar com a equipe Althius' })
    expect(falar).toHaveAttribute('href', '/sinais/pedidos')
    expect(screen.queryByRole('link', { name: 'Criar sinal personalizado' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Descrever um sinal' })).not.toBeInTheDocument()

    await usuario.click(falar)
    expect(await screen.findByRole('heading', { level: 1, name: 'Falar com a equipe Althius' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Evento' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Urgência' })).toBeInTheDocument()
  })

  it('a rota antiga do personalizado volta para o pedido', async () => {
    renderizarApp('/sinais/tipos/personalizado/novo')
    expect(await screen.findByRole('heading', { level: 1, name: 'Falar com a equipe Althius' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Novo sinal personalizado' })).not.toBeInTheDocument()
  })

  it('a busca sem resultado mantém o pedido à equipe e não oferece criar personalizado', async () => {
    const { usuario } = renderizarApp('/sinais')
    await usuario.type(await screen.findByRole('searchbox', { name: 'Buscar tipos de sinal' }), 'xyzabc')
    expect(screen.getByText('Nenhum tipo de sinal corresponde a “xyzabc”.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Criar personalizado com essa busca' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Falar com a equipe Althius' })).toBeInTheDocument()
  })
})

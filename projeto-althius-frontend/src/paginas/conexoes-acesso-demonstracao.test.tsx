import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderizarApp } from '@/test/renderizar'

// Achado da revisão cruzada (conexoes-clareza-01): o bloco "Seu acesso" / "No Workspace" só existia no cartão real
// (CartaoDeIntegracaoReal → SeuAcesso). Na Demonstração, as Integrações usam CartaoDeConexaoDemo, que não rotulava
// nada disso. Este teste garante que a Demonstração mostra os mesmos textos do Workspace operacional.

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})

describe('Na Demonstração, o cartão de Integração mostra "Seu acesso" e "No Workspace" como no Workspace operacional', () => {
  it('conectado, mostra "Seu acesso: Conectado" e "No Workspace: 1 participante conectado"', async () => {
    renderizarApp('/conexoes')

    const cartao = await screen.findByRole('article', { name: 'Notion' })
    expect(within(cartao).getByText('Seu acesso: Conectado')).toBeInTheDocument()
    expect(within(cartao).getByText('No Workspace: 1 participante conectado')).toBeInTheDocument()
  })

  it('desconectado, mostra "Seu acesso: não conectado" e "No Workspace: 0 participantes conectados"', async () => {
    const { usuario } = renderizarApp('/conexoes')

    const cartao = await screen.findByRole('article', { name: 'HubSpot' })
    await usuario.click(within(cartao).getByRole('button', { name: 'Desabilitar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Desabilitar HubSpot' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Desabilitar' }))

    expect(await within(cartao).findByText('Seu acesso: não conectado')).toBeInTheDocument()
    expect(within(cartao).getByText('No Workspace: 0 participantes conectados')).toBeInTheDocument()
  })
})

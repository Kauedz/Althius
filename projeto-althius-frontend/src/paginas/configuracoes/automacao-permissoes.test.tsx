import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderizarAppNoNavegador } from '@/test/renderizar'

describe('Configurações › Automação e tetos: as Permissões dos Agentes (creditos-e-planos 03)', () => {
  it('as Permissões do Agente aparecem na página, lidas da configuração dele', async () => {
    renderizarAppNoNavegador('/configuracoes/automacao')

    const rhetor = await screen.findByRole('listitem', { name: 'Rhetor' })
    expect(
      await within(rhetor).findByText('Permissões: HubSpot: Propor · Notion: Propor · Meta Ads: Propor · Google Ads: Propor'),
    ).toBeInTheDocument()
  })

  // Sinais first 10: a aba Configuração saiu da página do Agente, que ficou só leitura; as Permissões não se editam mais ali.
  it('a página do Agente não edita mais as Permissões: a Configuração leva à Conversa', async () => {
    renderizarAppNoNavegador('/agentes/rhetor/configuracao')

    expect(await screen.findByText(/Este Agente foi retirado do produto/)).toBeInTheDocument()
    await waitFor(() => expect(window.location.pathname).toBe('/agentes/rhetor/conversa'))
    expect(screen.queryByRole('radiogroup', { name: 'Permissão em Meta Ads' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salvar personalização' })).not.toBeInTheDocument()
  })
})

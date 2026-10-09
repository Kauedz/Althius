import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderizarApp } from '@/test/renderizar'

describe('Configurações › Automação e tetos: as Permissões dos Agentes (creditos-e-planos 03)', () => {
  it('as Permissões do Agente aparecem na página, lidas da configuração dele', async () => {
    const { usuario } = renderizarApp('/agentes/rhetor/configuracao')
    const metaAds = await screen.findByRole('radiogroup', { name: 'Permissão em Meta Ads' })
    await usuario.click(within(metaAds).getByRole('radio', { name: 'Executar' }))
    await usuario.click(screen.getByRole('button', { name: 'Salvar personalização' }))
    await screen.findByText('Personalização salva.')

    await usuario.click(within(screen.getByRole('complementary', { name: 'Navegação' })).getByRole('link', { name: 'Configurações' }))
    const abas = await screen.findByRole('navigation', { name: 'Seções de Configurações' })
    await usuario.click(within(abas).getByRole('link', { name: 'Automação e tetos' }))

    const rhetor = await screen.findByRole('listitem', { name: 'Rhetor' })
    expect(
      await within(rhetor).findByText('Permissões: HubSpot: Propor · Notion: Propor · Meta Ads: Executar · Google Ads: Propor'),
    ).toBeInTheDocument()
  })
})

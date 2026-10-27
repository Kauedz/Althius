import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderizarApp } from '@/test/renderizar'
import { criarFonteDeSinaisSimulada } from '@/fonte/simulada-sinais'
import { CATALOGO_VISIVEL } from './catalogo-visivel'
import { TIPOS_DO_PLANO } from './campos-do-plano'

describe('uso de um Modelo', () => {
  it('abre o Plano já preenchido com Briefing, critérios, Agenda sugerida e versão do Modelo', async () => {
    const { usuario } = renderizarApp('/sinais')
    const catalogo = await screen.findByRole('region', { name: 'Catálogo de sinais' })
    await usuario.click(within(catalogo).getByRole('link', { name: /Abertura de vagas/ }))

    expect(await screen.findByRole('heading', { name: 'Revisar Modelo' })).toBeInTheDocument()
    expect(screen.getByText('Acompanha vagas publicadas para os cargos do nicho, num card só.')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Tipo de Sinal' })).toHaveValue('vaga_linkedin')
    expect(screen.getByText('Modelo · versão 1')).toBeInTheDocument()
    expect(screen.getByText('08:00, seg a sex')).toBeInTheDocument()
    expect(await screen.findByText('Até 50 por Rodada, 50 por dia e 1.084 por mês.')).toBeInTheDocument()
  })

  it('gera um Plano editável para cada card visível da Demonstração', async () => {
    const fonte = criarFonteDeSinaisSimulada({ atrasoMs: 0 })
    const modelos = await Promise.all(CATALOGO_VISIVEL.map((card) => fonte.modelo!(card.id)))

    expect(modelos).toHaveLength(CATALOGO_VISIVEL.length)
    for (const modelo of modelos) {
      expect(TIPOS_DO_PLANO[modelo.plano.sinais[0].tipo]).toBeDefined()
      expect(modelo.plano.sinais[0].criterios).toBeDefined()
      expect(modelo.agenda).toEqual({ horarios: ['08:00'], dias: [1, 2, 3, 4, 5] })
    }
  })
})

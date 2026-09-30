import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SINAL_REAL_DO_TIPO } from '@/fonte/sinais-reais-mapa'
import type { FonteDeSinais, Monitoramento } from '@/fonte/sinais-tipos'
import { renderizarApp, renderizarAppCom } from '@/test/renderizar'
import { familiaDoTipo, formularioDoTipo, tipoPorId } from './catalogo'

// Os 9 Sinais do lançamento (sinais-reais 03 a 06): cada um tem um card no catálogo, com o formulário da família, e o
// motivo da última rodada aparece no Monitoramento do Workspace operacional.

const SINAIS_DO_REGISTRO = [
  'vaga_linkedin', 'vaga_indeed', 'mudanca_de_emprego', 'nova_lideranca', 'entradas_e_saidas',
  'anuncio_de_movimentacao', 'anuncio_linkedin', 'anuncio_meta', 'avaliacoes_google_maps',
]

describe('Sinais do lançamento no catálogo', () => {
  it('cada um dos 9 Sinais do registro de actors tem o seu card, e cada card um Sinal só', () => {
    expect(Object.values(SINAL_REAL_DO_TIPO).sort()).toEqual([...SINAIS_DO_REGISTRO].sort())
    for (const tipoId of Object.keys(SINAL_REAL_DO_TIPO)) {
      const tipo = tipoPorId(tipoId)
      expect(tipo, tipoId).toBeDefined()
      expect(formularioDoTipo(tipo!), tipoId).toBeDefined()
    }
  })

  it('os cards novos ficam na família certa', () => {
    const familia = (id: string) => familiaDoTipo(tipoPorId(id)!)?.nome
    expect(familia('vagas-no-indeed')).toBe('Vagas e equipes')
    expect(familia('anuncio-de-movimentacao')).toBe('Movimentação profissional')
    expect(familia('anuncios-linkedin')).toBe('Anúncios')
    expect(familia('anuncios-meta')).toBe('Anúncios')
    expect(familia('avaliacoes-google-maps')).toBe('Reputação e concorrência')
  })

  it('o formulário de anúncios pede localização, período e as palavras do anúncio', async () => {
    renderizarApp('/sinais/tipos/anuncios-meta/novo')
    expect(await screen.findByRole('group', { name: 'Localização' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Período observado' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Palavras no anúncio/ })).toBeInTheDocument()
  })

  it('o formulário de avaliações do Google Maps começa contando como reclamação até 2 estrelas', async () => {
    renderizarApp('/sinais/tipos/avaliacoes-google-maps/novo')
    const nota = await screen.findByRole('radiogroup', { name: 'Nota da avaliação' })
    expect(within(nota).getByRole('radio', { name: 'Até 2 estrelas' })).toBeChecked()
    expect(screen.getByRole('textbox', { name: /Assuntos das reclamações/ })).toBeInTheDocument()
  })
})

describe('Motivo da última rodada no Monitoramento', () => {
  const FALHA = 'Contas sem a página da empresa no LinkedIn ficaram de fora: Beta.'
  const marcar = (lista: Monitoramento[]) => lista.map((m, i) => (i === 0 ? { ...m, ultimaFalha: FALHA } : m))
  const comFalha = (fonte: FonteDeSinais): FonteDeSinais =>
    Object.assign(Object.create(fonte) as FonteDeSinais, {
      monitoramentos: async () => marcar(await fonte.monitoramentos()),
      monitoramentosDoTipo: async (tipoId: string) => marcar(await fonte.monitoramentosDoTipo(tipoId)),
    })

  it('aparece embaixo do Monitoramento, em palavras do produto', async () => {
    renderizarAppCom('/sinais/tipos/abertura-de-vagas', { sinais: comFalha })
    const lista = await screen.findByRole('list', { name: 'Monitoramentos deste tipo' })
    expect(await within(lista).findByText(`Última rodada: ${FALHA}`)).toBeInTheDocument()
  })
})

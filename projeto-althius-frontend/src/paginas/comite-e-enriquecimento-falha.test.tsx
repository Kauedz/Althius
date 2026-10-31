import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ContaAlvo, FonteDeContas } from '@/fonte/contas-tipos'
import { FonteDeContasProvider } from '@/fonte/contexto'
import { SecaoComiteDeCompra, SecaoReceitaFederal } from './comite-e-enriquecimento'

// prospeccao-funcional B6: a falha da consulta de CNPJ aparece como falha, e o comitê avisa quem não foi gravado.

const conta: ContaAlvo = {
  id: 'conta-1',
  nome: 'LogiFlow',
  legalIdentifier: '07.526.557/0001-00',
  totalContatos: 0,
}

function renderizarReceita(fonte: Partial<FonteDeContas>) {
  render(
    <FonteDeContasProvider fonte={fonte as FonteDeContas}>
      <SecaoReceitaFederal conta={conta} aoAtualizar={() => {}} />
    </FonteDeContasProvider>,
  )
}

function renderizarComite(fonte: Partial<FonteDeContas>) {
  render(
    <FonteDeContasProvider fonte={fonte as FonteDeContas}>
      <SecaoComiteDeCompra contaId="conta-1" propostas={[]} carregando={false} aoAtualizar={() => {}} />
    </FonteDeContasProvider>,
  )
}

describe('Consulta da Receita que falhou', () => {
  it('mostra a falha da consulta, não "não encontrado"', async () => {
    renderizarReceita({
      enriquecerReceita: vi.fn().mockRejectedValue(new Error('A consulta do CNPJ falhou: a BrasilAPI respondeu 503.')),
    })

    await userEvent.setup().click(screen.getByRole('button', { name: /Consultar Receita/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('A consulta do CNPJ falhou: a BrasilAPI respondeu 503.')
    expect(screen.queryByText(/não encontrad/i)).not.toBeInTheDocument()
  })
})

describe('Comitê com pessoa que não foi gravada', () => {
  it('avisa quantas pessoas achadas não puderam ser gravadas', async () => {
    renderizarComite({
      buscarComite: vi.fn().mockResolvedValue({ encontradas: 1, novas: 1, jaEncontradas: 0, naoGravadas: 2 }),
    })

    await userEvent.setup().click(screen.getByRole('button', { name: /Enriquecer Comitê/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '2 pessoas encontradas não puderam ser gravadas e não foram cobradas. Busque o comitê de novo.',
    )
    expect(screen.getByRole('status')).toHaveTextContent('1 nova · 0 já encontradas (sem custo)')
  })

  it('uma pessoa no singular', async () => {
    renderizarComite({
      buscarComite: vi.fn().mockResolvedValue({ encontradas: 0, novas: 0, jaEncontradas: 0, naoGravadas: 1 }),
    })

    await userEvent.setup().click(screen.getByRole('button', { name: /Enriquecer Comitê/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '1 pessoa encontrada não pôde ser gravada e não foi cobrada. Busque o comitê de novo.',
    )
  })

  it('sem falha de gravação, não há aviso', async () => {
    renderizarComite({
      buscarComite: vi.fn().mockResolvedValue({ encontradas: 1, novas: 1, jaEncontradas: 0, naoGravadas: 0 }),
    })

    await userEvent.setup().click(screen.getByRole('button', { name: /Enriquecer Comitê/ }))

    expect(await screen.findByRole('status')).toHaveTextContent('1 nova')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

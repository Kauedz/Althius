import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ContaAlvo, FonteDeContas } from '@/fonte/contas-tipos'
import { FonteDeContasProvider } from '@/fonte/contexto'
import { SecaoReceitaFederal } from './comite-e-enriquecimento'

// Consulta de CNPJ (prospeccao-funcional B1): o custo em créditos aparece antes do clique.

const conta: ContaAlvo = {
  id: 'conta-1',
  nome: 'LogiFlow',
  legalIdentifier: '07.526.557/0001-00',
  totalContatos: 0,
}

function renderizar() {
  render(
    <FonteDeContasProvider fonte={{ enriquecerReceita: vi.fn() } as unknown as FonteDeContas}>
      <SecaoReceitaFederal conta={conta} aoAtualizar={() => {}} />
    </FonteDeContasProvider>,
  )
}

describe('Consulta da Receita Federal', () => {
  it('mostra 1 crédito antes do clique em Consultar Receita', () => {
    renderizar()
    const botao = screen.getByRole('button', { name: /Consultar Receita/ })
    expect(botao).toHaveAccessibleDescription('1 crédito')
    expect(screen.getByText('1 crédito')).toBeInTheDocument()
  })
})

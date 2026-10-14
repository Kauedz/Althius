import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Contato, FonteDeContas } from '@/fonte/contas-tipos'
import { FonteDeContasProvider } from '@/fonte/contexto'
import { BotoesRevelarContato, SecaoComiteDeCompra } from './comite-e-enriquecimento'

// Nunca cobrar de novo o que já foi descoberto (decisão do Renan, 09/10/2026): a tela diz o que é novo e o que já foi
// encontrado, sem custo.

function contato(extra: Partial<Contato> = {}): Contato {
  return {
    id: 'contato-1',
    contaId: 'conta-1',
    nome: 'Gilsomar Maia',
    canais: { email: false, telefone: false, linkedin: true },
    linkedin: 'https://www.linkedin.com/in/gilsomar-maia',
    ...extra,
  }
}

function renderizarRevelar(fonte: Partial<FonteDeContas>) {
  render(
    <FonteDeContasProvider fonte={fonte as FonteDeContas}>
      <BotoesRevelarContato contato={contato()} aoRevelar={() => {}} />
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

describe('Revelar o e-mail que já foi encontrado', () => {
  it('a cotação 0 mostra "Já encontrado, sem custo" no lugar dos 2 créditos', async () => {
    renderizarRevelar({
      cotarRevelacaoContato: vi.fn().mockResolvedValue({ creditos: 0, saldo: 11, podeRevelar: true, jaEncontrado: true }),
      revelarContato: vi.fn(),
    })

    await userEvent.setup().click(screen.getByRole('button', { name: /Revelar E-mail/ }))

    expect(await screen.findByText('Já encontrado, sem custo')).toBeInTheDocument()
    expect(screen.queryByText('2 créditos')).not.toBeInTheDocument()
  })

  it('a cotação de quem ainda não tem e-mail continua mostrando os créditos', async () => {
    renderizarRevelar({
      cotarRevelacaoContato: vi.fn().mockResolvedValue({ creditos: 2, saldo: 11, podeRevelar: true, jaEncontrado: false }),
      revelarContato: vi.fn(),
    })

    await userEvent.setup().click(screen.getByRole('button', { name: /Revelar E-mail/ }))

    expect(await screen.findByText('2 créditos')).toBeInTheDocument()
    expect(screen.queryByText('Já encontrado, sem custo')).not.toBeInTheDocument()
  })

  it('o e-mail que já existia volta como "já encontrado, sem custo"', async () => {
    const revelarContato = vi.fn().mockResolvedValue({
      sucesso: true,
      valor: 'gilsomar@totvs.com.br',
      creditosDebitados: 0,
      jaExistia: true,
    })
    renderizarRevelar({
      cotarRevelacaoContato: vi.fn().mockResolvedValue({ creditos: 0, saldo: 11, podeRevelar: true, jaEncontrado: true }),
      revelarContato,
    })

    const usuario = userEvent.setup()
    await usuario.click(screen.getByRole('button', { name: /Revelar E-mail/ }))
    await usuario.click(await screen.findByRole('button', { name: 'Confirmar e Revelar' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Já encontrado, sem custo: gilsomar@totvs.com.br')
    expect(screen.queryByText(/créditos debitados/)).not.toBeInTheDocument()
  })
})

describe('Comitê sem recobrança', () => {
  it('o custo diz que pessoas já encontradas não são cobradas', () => {
    renderizarComite({ buscarComite: vi.fn() })

    expect(screen.getByText('Custo: 1 crédito por pessoa nova. Pessoas já encontradas não são cobradas.')).toBeInTheDocument()
  })

  it('o resultado separa as novas das já encontradas, sem custo', async () => {
    renderizarComite({ buscarComite: vi.fn().mockResolvedValue({ encontradas: 3, novas: 1, jaEncontradas: 2 }) })

    await userEvent.setup().click(screen.getByRole('button', { name: 'Enriquecer Comitê' }))

    expect(await screen.findByRole('status')).toHaveTextContent('1 nova · 2 já encontradas (sem custo)')
  })

  it('a repetição de 09/10 (uma pessoa já proposta) aparece como já encontrada', async () => {
    renderizarComite({ buscarComite: vi.fn().mockResolvedValue({ encontradas: 1, novas: 0, jaEncontradas: 1 }) })

    await userEvent.setup().click(screen.getByRole('button', { name: 'Enriquecer Comitê' }))

    expect(await screen.findByRole('status')).toHaveTextContent('0 novas · 1 já encontrada (sem custo)')
  })
})

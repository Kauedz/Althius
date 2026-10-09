import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Contato, FonteDeContas } from '@/fonte/contas-tipos'
import { FonteDeContasProvider } from '@/fonte/contexto'
import { BotoesRevelarContato } from './comite-e-enriquecimento'

// Revelar o e-mail (prospeccao-funcional B3): o telefone aparece indisponível, e a falha da busca não vira "não encontrado".

function contato(extra: Partial<Contato> = {}): Contato {
  return {
    id: 'contato-1',
    contaId: 'conta-1',
    nome: 'Mariana Souza',
    canais: { email: false, telefone: false, linkedin: true },
    linkedin: 'https://www.linkedin.com/in/marianasouza',
    ...extra,
  }
}

function renderizar(c: Contato, fonte: Partial<FonteDeContas>) {
  render(
    <FonteDeContasProvider fonte={fonte as FonteDeContas}>
      <BotoesRevelarContato contato={c} aoRevelar={() => {}} />
    </FonteDeContasProvider>,
  )
}

async function revelarEmail() {
  const usuario = userEvent.setup()
  await usuario.click(screen.getByRole('button', { name: /Revelar E-mail/ }))
  await usuario.click(await screen.findByRole('button', { name: 'Confirmar e Revelar' }))
}

describe('Botões de revelar do Contato', () => {
  it('mostra o telefone como indisponível, sem botão, sem cotação e sem 5 créditos', () => {
    const cotarRevelacaoContato = vi.fn()
    const revelarContato = vi.fn()
    renderizar(contato({ email: 'mariana@acme.test', canais: { email: true, telefone: false, linkedin: true } }), {
      cotarRevelacaoContato,
      revelarContato,
    })

    expect(screen.getByText('Telefone indisponível')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Telefone/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/5 créditos/)).not.toBeInTheDocument()
    expect(cotarRevelacaoContato).not.toHaveBeenCalled()
    expect(revelarContato).not.toHaveBeenCalled()
  })

  it('a falha da busca aparece como falha, não como "não encontrado"', async () => {
    renderizar(contato(), {
      cotarRevelacaoContato: vi.fn().mockResolvedValue({ creditos: 2, saldo: 10, podeRevelar: true }),
      revelarContato: vi.fn().mockRejectedValue(new Error('A busca do e-mail falhou: O actor do Apify não respondeu a tempo')),
    })

    await revelarEmail()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A busca do e-mail falhou: O actor do Apify não respondeu a tempo',
    )
    expect(screen.queryByText(/não encontrado/i)).not.toBeInTheDocument()
  })

  it('sem e-mail novo, diz que nada foi debitado', async () => {
    const revelarContato = vi.fn().mockResolvedValue({ sucesso: false, valor: null, creditosDebitados: 0 })
    renderizar(contato(), {
      cotarRevelacaoContato: vi.fn().mockResolvedValue({ creditos: 2, saldo: 10, podeRevelar: true }),
      revelarContato,
    })

    await revelarEmail()

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Nenhum e-mail novo encontrado. Nenhum crédito foi debitado.',
    )
    expect(revelarContato).toHaveBeenCalledWith('contato-1', 'email')
  })
})

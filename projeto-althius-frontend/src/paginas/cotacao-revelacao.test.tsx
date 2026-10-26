import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import type { FonteDeContas } from '@/fonte/contas-tipos'
import { FonteDeContasProvider } from '@/fonte/contexto'
import { BotoesRevelarContato } from './comite-e-enriquecimento'

function renderizar(fonte: Partial<FonteDeContas>) {
  render(
    <FonteDeContasProvider fonte={fonte as FonteDeContas}>
      <BotoesRevelarContato
        contato={{ id: 'contato-1', contaId: 'conta-1', nome: 'Ana', canais: { email: false, telefone: false, linkedin: true } }}
        aoRevelar={() => {}}
      />
    </FonteDeContasProvider>,
  )
}

it('aguarda a cotação do servidor sem inventar preço nem permitir revelar', async () => {
  const revelarContato = vi.fn()
  renderizar({ cotarRevelacaoContato: () => new Promise(() => {}), revelarContato })
  const usuario = userEvent.setup()
  await usuario.click(screen.getByRole('button', { name: 'Revelar E-mail' }))
  const confirmar = screen.getByRole('button', { name: 'Confirmar e Revelar' })
  expect(confirmar).toBeDisabled()
  expect(screen.getByText('Consultando cotação...')).toBeInTheDocument()
  expect(screen.queryByText('2 créditos')).not.toBeInTheDocument()
  await usuario.click(confirmar)
  expect(revelarContato).not.toHaveBeenCalled()
})

it('explica saldo insuficiente e não revela', async () => {
  const revelarContato = vi.fn()
  renderizar({
    cotarRevelacaoContato: vi.fn().mockResolvedValue({ creditos: 7, saldo: 3, podeRevelar: false }),
    revelarContato,
  })
  const usuario = userEvent.setup()
  await usuario.click(screen.getByRole('button', { name: 'Revelar E-mail' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Saldo insuficiente: 3 créditos disponíveis; são necessários 7.')
  await usuario.click(screen.getByRole('button', { name: 'Confirmar e Revelar' }))
  expect(revelarContato).not.toHaveBeenCalled()
})

it('mostra falha de cotação, bloqueia revelar e permite tentar novamente com preço real', async () => {
  const revelarContato = vi.fn().mockResolvedValue({ sucesso: true, valor: 'ana@example.test', creditosDebitados: 7 })
  renderizar({
    cotarRevelacaoContato: vi.fn()
      .mockRejectedValueOnce(new Error('Não foi possível consultar a cotação.'))
      .mockResolvedValueOnce({ creditos: 7, saldo: 20, podeRevelar: true }),
    revelarContato,
  })
  const usuario = userEvent.setup()
  await usuario.click(screen.getByRole('button', { name: 'Revelar E-mail' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('A cotação da revelação está indisponível.')
  await usuario.click(screen.getByRole('button', { name: 'Confirmar e Revelar' }))
  expect(revelarContato).not.toHaveBeenCalled()
  expect(screen.queryByText('2 créditos')).not.toBeInTheDocument()
  await usuario.click(screen.getByRole('button', { name: 'Tentar de novo' }))
  expect(await screen.findByText('7 créditos')).toBeInTheDocument()
  await usuario.click(screen.getByRole('button', { name: 'Confirmar e Revelar' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Encontrado: ana@example.test (7 créditos debitados)')
})

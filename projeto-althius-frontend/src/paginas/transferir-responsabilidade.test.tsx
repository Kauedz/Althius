import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ContaAlvo, FonteDeContas } from '@/fonte/contas-tipos'
import { renderizarAppCom } from '@/test/renderizar'

function comResponsavelAusente(conta: Partial<ContaAlvo>, metodos: Partial<FonteDeContas> = {}) {
  return (fonteDeContas: FonteDeContas): FonteDeContas => ({
    ...fonteDeContas,
    conta: async (id) => ({ ...(await fonteDeContas.conta(id)), ...conta }),
    participantesParaTransferir: async () => [
      { id: 'u-ana', nome: 'Ana' },
      { id: 'u-bruno', nome: 'Bruno' },
    ],
    ...metodos,
  })
}

describe('Transferir a responsabilidade pelo detalhe da Conta (CRM-06)', () => {
  it('sem o aviso de responsável ausente, ou sem o método na fonte, a ação não aparece', async () => {
    renderizarAppCom('/contas/openai', {
      contas: comResponsavelAusente({ responsavelAusente: false }, { transferirResponsabilidade: vi.fn() }),
    })
    await screen.findByRole('heading', { level: 2, name: 'OpenAI' })
    expect(screen.queryByRole('button', { name: /Transferir responsabilidade/ })).not.toBeInTheDocument()
  })

  it('o Administrador escolhe quem recebe e diz o motivo, e só então a Conta é transferida', async () => {
    const transferirResponsabilidade = vi.fn(async () => {})
    const { usuario } = renderizarAppCom('/contas/openai', {
      contas: comResponsavelAusente({ responsavelAusente: true }, { transferirResponsabilidade }),
    })
    await usuario.click(await screen.findByRole('button', { name: /Transferir responsabilidade/ }))
    const dialogo = await screen.findByRole('dialog')
    const enviar = within(dialogo).getByRole('button', { name: 'Transferir' })
    expect(enviar).toBeDisabled()

    await usuario.selectOptions(await within(dialogo).findByRole('combobox', { name: 'Novo responsável' }), 'u-bruno')
    expect(enviar).toBeDisabled()
    await usuario.type(within(dialogo).getByRole('textbox', { name: 'Motivo da transferência' }), '  Saiu da empresa  ')
    await usuario.click(enviar)

    expect(transferirResponsabilidade).toHaveBeenCalledWith('openai', 'u-bruno', 'Saiu da empresa')
    expect(await screen.findByRole('status')).toHaveTextContent('Responsabilidade transferida')
  })

  it('a recusa do banco aparece no diálogo e ele continua aberto', async () => {
    const { usuario } = renderizarAppCom('/contas/openai', {
      contas: comResponsavelAusente(
        { responsavelAusente: true },
        { transferirResponsabilidade: () => Promise.reject(new Error('Só um Administrador pode transferir a responsabilidade.')) },
      ),
    })
    await usuario.click(await screen.findByRole('button', { name: /Transferir responsabilidade/ }))
    const dialogo = await screen.findByRole('dialog')
    await usuario.selectOptions(await within(dialogo).findByRole('combobox', { name: 'Novo responsável' }), 'u-ana')
    await usuario.type(within(dialogo).getByRole('textbox', { name: 'Motivo da transferência' }), 'Saiu')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Transferir' }))

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('Só um Administrador pode transferir a responsabilidade.')
  })
})

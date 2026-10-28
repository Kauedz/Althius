import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { render } from '@testing-library/react'
import { MeusSinais } from './vitrine-pecas'

describe('Meus Sinais reorganizado', () => {
  it('lista Sinais ativos de qualquer origem e identifica as origens novas', () => {
    render(
      <MemoryRouter>
        <MeusSinais
          monitoramentosAtivos={[
            { id: 'composer', tipoId: 'abertura-de-vagas', nome: 'Vagas estratégicas', disparos: 0, criadoVia: 'composer' },
            { id: 'modelo', tipoId: 'promocoes', nome: 'Promoções de concorrentes', disparos: 1, criadoVia: 'modelo' },
            { id: 'antigo', tipoId: 'certificacoes', nome: 'Certificações novas', disparos: 2, criadoVia: 'sinais_novo' },
          ]}
          disparos={3}
          contasQuentes={0}
          sequenciasAtivas={0}
          acaoDosEncontrados={<span />}
        />
      </MemoryRouter>,
    )

    const lista = screen.getByRole('list', { name: 'Meus Sinais ativos' })
    expect(lista).toHaveTextContent('Vagas estratégicas')
    expect(lista).toHaveTextContent('Promoções de concorrentes')
    expect(lista).toHaveTextContent('Certificações novas')
    expect(lista).toHaveTextContent('Criado pelo composer')
    expect(lista).toHaveTextContent('Criado de um Modelo')
    expect(lista).not.toHaveTextContent('sinais_novo')
  })

  it('renomeia inline e não aceita nome vazio', async () => {
    const aoRenomear = vi.fn().mockResolvedValue(undefined)
    render(<MemoryRouter><MeusSinais monitoramentosAtivos={[{ id: 'm1', tipoId: 'abertura-de-vagas', nome: 'Nome antigo', disparos: 0 }]} disparos={0} contasQuentes={0} sequenciasAtivas={0} acaoDosEncontrados={<span />} aoRenomear={aoRenomear} /></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: 'Renomear Nome antigo' }))
    const campo = screen.getByRole('textbox', { name: 'Nome de Nome antigo' })
    await userEvent.clear(campo)
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(aoRenomear).not.toHaveBeenCalled())
    expect(screen.getAllByText('Nome antigo').length).toBeGreaterThan(0)
  })
})

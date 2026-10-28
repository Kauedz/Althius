import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/fonte/contexto', () => ({
  useFonte: () => ({}),
  useDados: (selecionar: (fonte: Record<string, () => unknown>) => unknown) => selecionar({
    workspace: () => null,
    agentes: () => [],
    especialidades: () => [],
  }),
}))
vi.mock('@/conversa/mencao', () => ({
  useMencao: () => ({ aberta: false, aoTeclar: () => false, opcoes: [], indice: 0, selecionar: vi.fn() }),
  ListaDeMencoes: () => null,
}))

import { Composer } from './composer'

afterEach(() => vi.clearAllMocks())

describe('Composer com classificação de intenção', () => {
  it('mostra sugestões de Modelo sem encaminhar o pedido', async () => {
    const aoEnviar = vi.fn()
    render(<MemoryRouter><Composer nome="Pedido" rotulo="Pedido" placeholder="Descreva" classificarIntencao aoEnviar={aoEnviar} /></MemoryRouter>)
    await userEvent.type(screen.getByRole('textbox', { name: 'Pedido' }), 'Quero acompanhar novas vagas de engenharia')
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(await screen.findByRole('link', { name: /Abertura de vagas/ })).toHaveAttribute('href', '/sinais/novo?modelo=abertura-de-vagas')
    expect(aoEnviar).not.toHaveBeenCalled()
  })

  it('leva plano_novo ao briefing com o pedido no estado e não envia à conversa', async () => {
    const aoEnviar = vi.fn()
    function Destino() { const localizacao = useLocation(); return <output data-testid="estado">{JSON.stringify(localizacao.state)}</output> }
    render(<MemoryRouter initialEntries={['/']}><Composer nome="Pedido" rotulo="Pedido" placeholder="Descreva" classificarIntencao criarSinalNoComposer aoEnviar={aoEnviar} /><Destino /></MemoryRouter>)
    await userEvent.type(screen.getByRole('textbox', { name: 'Pedido' }), 'Quero monitorar um evento muito específico chamado zyxq')
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(aoEnviar).not.toHaveBeenCalled()
    expect(await screen.findByTestId('estado')).toHaveTextContent('"origem":"composer"')
    expect(screen.getByTestId('estado')).toHaveTextContent('Quero monitorar um evento muito específico chamado zyxq')
  })

  it('mantém o aviso e o link no modo demonstração', async () => {
    render(<MemoryRouter><Composer nome="Pedido" rotulo="Pedido" placeholder="Descreva" classificarIntencao aoEnviar={vi.fn()} /></MemoryRouter>)
    await userEvent.type(screen.getByRole('textbox', { name: 'Pedido' }), 'Quero monitorar um evento específico zyxq')
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(await screen.findByRole('link', { name: 'Descrever meu Sinal' })).toHaveAttribute('href', '/sinais/novo')
  })
})

import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { FonteDeAutomacao } from '@/fonte/automacao-tipos'
import { renderizarAppCom } from '@/test/renderizar'

/** Como no Workspace operacional: o Enriquecimento ainda não tem quem o execute sozinho. */
function enriquecimentoSemExecutor(fonte: FonteDeAutomacao): FonteDeAutomacao {
  return {
    ...fonte,
    escopos: async () =>
      (await fonte.escopos()).map((e) =>
        e.escopo === 'acao:enriquecimento' ? { ...e, modo: 'confirmar' as const, bloqueio: 'sem_executor' as const } : e,
      ),
  }
}

describe('Configurações › Automação e tetos: quem roda sozinho (creditos-e-planos 03)', () => {
  it('o escopo que ninguém executa fica travado em Confirmar e a página diz por quê', async () => {
    renderizarAppCom('/configuracoes/automacao', { automacao: enriquecimentoSemExecutor })

    const item = await screen.findByRole('listitem', { name: 'Enriquecimento' })
    expect(within(item).getByText('Ainda não roda sozinho: cada ação pede confirmação.')).toBeInTheDocument()
    expect(within(item).queryByLabelText('Modo de Enriquecimento')).not.toBeInTheDocument()
    expect(within(item).queryByLabelText('Teto mensal de Enriquecimento')).not.toBeInTheDocument()
    expect(within(item).getByText('Confirmar')).toBeInTheDocument()
    // Quem tem executor continua com o interruptor.
    const varredura = await screen.findByRole('listitem', { name: 'Varredura de Sinais' })
    expect(within(varredura).getByLabelText('Modo de Varredura de Sinais')).toBeInTheDocument()
  })
})

import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { FonteDeAutomacao } from '@/fonte/automacao-tipos'
import { renderizarApp, renderizarAppCom } from '@/test/renderizar'

// Rotinas que rodam sozinhas (orquestracao, ticket 01): cada Rotina é um escopo da página, com o teto dela.

function comRotina(fonte: FonteDeAutomacao): FonteDeAutomacao {
  return {
    ...fonte,
    escopos: async () => [
      ...(await fonte.escopos()),
      {
        escopo: 'rotina:11111111-1111-1111-1111-111111111111',
        tipo: 'rotina' as const,
        nome: 'Rotina · Scopus · Reavaliar as Contas-alvo',
        modo: 'confirmar' as const,
        teto: null,
        gastoNoMes: 0,
        bloqueio: 'confirmar' as const,
      },
    ],
  }
}

describe('Configurações › Automação e tetos: Rotinas (orquestracao 01)', () => {
  it('lista cada Rotina num grupo próprio, com o teto aprovado pelo Administrador', async () => {
    renderizarAppCom('/configuracoes/automacao', { automacao: comRotina })

    const item = await screen.findByRole('listitem', { name: 'Rotina · Scopus · Reavaliar as Contas-alvo' })
    expect(screen.getByText('Rotinas')).toBeInTheDocument()
    expect(within(item).getByLabelText('Modo de Rotina · Scopus · Reavaliar as Contas-alvo')).toBeInTheDocument()
    expect(within(item).getByLabelText('Teto mensal de Rotina · Scopus · Reavaliar as Contas-alvo')).toBeInTheDocument()
  })

  it('sem nenhuma Rotina, o grupo não aparece', async () => {
    renderizarApp('/configuracoes/automacao')

    await screen.findByRole('listitem', { name: 'Varredura de Sinais' })
    expect(screen.queryByText('Rotinas')).not.toBeInTheDocument()
  })
})

// contexto-da-empresa 07: a prateleira "Para o seu nicho" do catálogo sai do Perfil de cliente ideal do Contexto da
// empresa, e não mais dos Segmentos do ICP da Memória do Workspace.
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { FonteDoContextoDaEmpresa } from '@/fonte/contexto-da-empresa-tipos'
import { renderizarAppCom } from '@/test/renderizar'

function comIcp(icp: string) {
  return (fonte: FonteDoContextoDaEmpresa): FonteDoContextoDaEmpresa => ({
    ...fonte,
    observar: fonte.observar.bind(fonte),
    async contexto() {
      const atual = await fonte.contexto()
      return {
        ...atual,
        vigente: { empresa: 'x', icp, personas: '', versao: 4, origem: 'manual', autor: null, em: '2026-11-01T12:00:00.000Z' },
      }
    },
  })
}

describe('Para o seu nicho pelo Contexto da empresa', () => {
  it('o nicho vem do Perfil de cliente ideal', async () => {
    renderizarAppCom('/sinais', {
      contextoDaEmpresa: comIcp('ICP primário: transportadoras de carga fracionada, com frota própria e frete B2B.'),
    })
    expect(
      await screen.findByText('Logística e transporte, pelo Perfil de cliente ideal do Contexto da empresa'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Segmentos do ICP/)).not.toBeInTheDocument()
  })

  it('sem nicho no texto, diz para descrever o Perfil de cliente ideal no Contexto da empresa', async () => {
    renderizarAppCom('/sinais', { contextoDaEmpresa: comIcp('Empresas que querem crescer.') })
    expect(
      await screen.findByText(
        'Sinais que valem para qualquer nicho. Descreva o Perfil de cliente ideal no Contexto da empresa para afinar.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Memória/)).not.toBeInTheDocument()
  })
})

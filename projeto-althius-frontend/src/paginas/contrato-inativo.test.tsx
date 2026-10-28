import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { FonteDeAgentes, ResumoDoContrato } from '@/fonte/tipos'
import { renderizarApp, renderizarAppCom } from '@/test/renderizar'

const AVISO = 'Contrato inativo. Fale com a equipe Althius para reativar.'

function resumo(estado: ResumoDoContrato['estado'], ilimitado = false): ResumoDoContrato {
  return {
    estado,
    modo: 'contrato',
    faixa: 'Essencial',
    maximoDeUsuarios: ilimitado ? null : 2,
    usuariosAtivos: 1,
    creditosMensais: 3000,
    limiteMensal: 3000,
    usoDoMes: 0,
    ilimitado,
  }
}

function comContrato(contrato: ResumoDoContrato | null) {
  return (fonte: FonteDeAgentes): FonteDeAgentes => ({
    ...fonte,
    contratoDoWorkspace: async () => contrato,
  })
}

describe('Contrato inativo', () => {
  it('a demonstração, sem leitura de contrato, não mostra o aviso', async () => {
    renderizarApp('/conversa')
    expect(await screen.findByRole('heading', { level: 1, name: 'Agentes' })).toBeInTheDocument()
    expect(screen.queryByText(AVISO)).not.toBeInTheDocument()
  })

  it('suspenso mostra o aviso na home e abre o pedido para a equipe', async () => {
    const { usuario } = renderizarAppCom('/', { fonte: comContrato(resumo('suspenso')) })
    expect(await screen.findByRole('heading', { level: 1, name: 'Agente' })).toBeInTheDocument()
    expect(await screen.findByText(AVISO)).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Fale com a equipe Althius' }))
    const dialogo = within(await screen.findByRole('dialog', { name: 'Fale com a equipe Althius' }))
    expect(dialogo.getByText(/não está ativo/)).toBeInTheDocument()
  })

  it('sem contrato mostra o aviso em Sinais e em Sequências', async () => {
    const { unmount } = renderizarAppCom('/sinais', { fonte: comContrato(null) })
    expect(await screen.findByRole('heading', { level: 1, name: 'Sinais' })).toBeInTheDocument()
    expect(await screen.findByText(AVISO)).toBeInTheDocument()
    unmount()
    renderizarAppCom('/sequencias', { fonte: comContrato(null) })
    expect(await screen.findByRole('heading', { level: 1, name: 'Sequências' })).toBeInTheDocument()
    expect(await screen.findByText(AVISO)).toBeInTheDocument()
  })

  it('contrato ativo e Workspace ilimitado não mostram o aviso', async () => {
    const { unmount } = renderizarAppCom('/conversa', { fonte: comContrato(resumo('ativo')) })
    expect(await screen.findByRole('heading', { level: 1, name: 'Agentes' })).toBeInTheDocument()
    expect(screen.queryByText(AVISO)).not.toBeInTheDocument()
    unmount()
    renderizarAppCom('/conversa', { fonte: comContrato(resumo('suspenso', true)) })
    expect(await screen.findByRole('heading', { level: 1, name: 'Agentes' })).toBeInTheDocument()
    expect(screen.queryByText(AVISO)).not.toBeInTheDocument()
  })

  it('Contas não mostra o aviso, mesmo com o contrato suspenso', async () => {
    renderizarAppCom('/contas', { fonte: comContrato(resumo('suspenso')) })
    expect(await screen.findByRole('heading', { level: 1, name: 'Contas' })).toBeInTheDocument()
    expect(screen.queryByText(AVISO)).not.toBeInTheDocument()
  })
})

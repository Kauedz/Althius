import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { FonteDeAutomacao } from '@/fonte/automacao-tipos'
import { renderizarApp, renderizarAppCom } from '@/test/renderizar'

function ilimitada(fonte: FonteDeAutomacao): FonteDeAutomacao {
  return {
    ...fonte,
    resumoDoLimite: async () => ({ ilimitado: true, limite: null, tetoDaFaixa: null, uso: 0, inativo: false }),
    async salvar(escopo, modo, teto) {
      if (escopo.startsWith('acao:') && teto === null) return fonte.salvar(escopo, modo, 1).then(() => undefined)
      return fonte.salvar(escopo, modo, teto)
    },
  }
}

const linha = (nome: string) => screen.findByRole('listitem', { name: nome })

describe('Configurações › Automação e tetos', () => {
  it('lista os tipos de ação, os Agentes e as Integrações, tudo começando em confirmar', async () => {
    renderizarApp('/configuracoes/automacao')
    expect(await screen.findByRole('heading', { level: 2, name: 'Automação e tetos' })).toBeInTheDocument()
    for (const nome of ['Varredura de Sinais', 'Enriquecimento', 'Execuções de Agentes']) {
      const item = await linha(nome)
      expect(within(item).getByText('Cada ação pede confirmação.')).toBeInTheDocument()
    }
    expect(await screen.findByRole('heading', { level: 3, name: 'Agentes' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 3, name: 'Integrações' })).toBeInTheDocument()
  })

  it('o tipo de ação só troca Confirmar e Automático; o teto próprio fica na Integração', async () => {
    const { usuario } = renderizarApp('/configuracoes/automacao')
    await screen.findByLabelText('Limite mensal do Workspace')
    const varredura = await linha('Varredura de Sinais')
    expect(within(varredura).queryByLabelText('Teto mensal de Varredura de Sinais')).not.toBeInTheDocument()
    const hubspot = await linha('HubSpot')
    await usuario.selectOptions(within(hubspot).getByLabelText('Modo de HubSpot'), 'automatico')
    await usuario.click(within(hubspot).getByRole('button', { name: 'Salvar' }))
    expect(await within(hubspot).findByRole('alert')).toHaveTextContent('O automático precisa de um teto mensal aprovado.')
    expect(within(hubspot).getByText('Cada ação pede confirmação.')).toBeInTheDocument()
  })

  it('com o limite do mês aprovado, a página mostra o uso e o tipo de ação passa a rodar', async () => {
    const { usuario } = renderizarApp('/configuracoes/automacao')
    const campo = await screen.findByLabelText('Limite mensal do Workspace')
    await usuario.clear(campo)
    await usuario.type(campo, '50')
    await usuario.click(screen.getByRole('button', { name: 'Salvar limite' }))
    expect(await screen.findByText('0 de 50 créditos usados no mês.')).toBeInTheDocument()
    const item = await linha('Enriquecimento')
    await usuario.selectOptions(within(item).getByLabelText('Modo de Enriquecimento'), 'automatico')
    await usuario.click(within(item).getByRole('button', { name: 'Salvar' }))
    expect(await within(await linha('Enriquecimento')).findByText('Roda sozinho, dentro do limite do mês.')).toBeInTheDocument()
  })

  it('limite zero ou acima da faixa é recusado', async () => {
    const { usuario } = renderizarApp('/configuracoes/automacao')
    const campo = await screen.findByLabelText('Limite mensal do Workspace')
    await usuario.clear(campo)
    await usuario.type(campo, '0')
    await usuario.click(screen.getByRole('button', { name: 'Salvar limite' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('O limite precisa ser maior que zero.')
    await usuario.clear(campo)
    await usuario.type(campo, '150')
    await usuario.click(screen.getByRole('button', { name: 'Salvar limite' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('O limite não pode passar dos créditos da faixa.')
  })

  it('a Equipe ilimitada mostra Ilimitado e liga o automático sem teto', async () => {
    const { usuario } = renderizarAppCom('/configuracoes/automacao', { automacao: ilimitada })
    expect(await screen.findByText('Ilimitado')).toBeInTheDocument()
    expect(screen.queryByLabelText('Limite mensal do Workspace')).not.toBeInTheDocument()
    const item = await linha('Varredura de Sinais')
    expect(within(item).queryByLabelText('Teto mensal de Varredura de Sinais')).not.toBeInTheDocument()
    await usuario.selectOptions(within(item).getByLabelText('Modo de Varredura de Sinais'), 'automatico')
    await usuario.click(within(item).getByRole('button', { name: 'Salvar' }))
    expect(await within(await linha('Varredura de Sinais')).findByText('Roda sozinho, dentro do limite do mês.')).toBeInTheDocument()
  })

  it('a seção aparece nas abas de Configurações', async () => {
    renderizarApp('/configuracoes/perfil')
    const abas = await screen.findByRole('navigation', { name: 'Seções de Configurações' })
    expect(within(abas).getByRole('link', { name: 'Automação e tetos' })).toBeInTheDocument()
  })
})

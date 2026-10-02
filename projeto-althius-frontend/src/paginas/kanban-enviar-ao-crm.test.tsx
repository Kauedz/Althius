import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AcessoDaIntegracao, FonteDeConexoes } from '@/fonte/conexoes-tipos'
import type { ContaAlvo, EnvioAoCrm, FonteDeContas } from '@/fonte/contas-tipos'
import type { IntegracaoId } from '@/fonte/tipos'
import { renderizarApp, renderizarAppCom } from '@/test/renderizar'

// "Enviar ao CRM" no cartão do Kanban (kanban-de-prospeccao 05): o mesmo envio do detalhe da Conta, com os dois
// caminhos (a chave REST e o pedido aos Agentes pelo conector, ADR-0023). Nada de código por app de CRM.

interface Registro {
  diretos: [string, IntegracaoId][]
  pelosAgentes: [string, IntegracaoId][]
}

function comEnvio(registro: Registro, ajustar: (conta: ContaAlvo) => Partial<ContaAlvo> = () => ({})) {
  const envios = new Map<string, EnvioAoCrm>()
  return (fonte: FonteDeContas): FonteDeContas =>
    Object.assign(Object.create(fonte) as FonteDeContas, {
      contas: async () => (await fonte.contas()).map((c) => ({ ...c, sobMinhaResponsabilidade: true, ...ajustar(c) })),
      envioAoCrm: (contaId: string) => Promise.resolve(envios.get(contaId) ?? null),
      enviarAoCrm: (contaId: string, integracaoId: IntegracaoId) => {
        registro.diretos.push([contaId, integracaoId])
        envios.set(contaId, { integracaoId, estado: 'enviado' })
        return Promise.resolve({ mensagem: 'Enviada ao HubSpot: a empresa, os Contatos e a nota.', pendencias: [] })
      },
      enviarAoCrmPelosAgentes: (contaId: string, integracaoId: IntegracaoId) => {
        registro.pelosAgentes.push([contaId, integracaoId])
        envios.set(contaId, { integracaoId, estado: 'enviando' })
        return Promise.resolve({ conversaId: 'conversa-do-envio' })
      },
      conversaDoEnvioAoCrm: () => Promise.resolve(null),
    })
}

function comAcesso(caminho: AcessoDaIntegracao['caminho']) {
  return (fonte: FonteDeConexoes): FonteDeConexoes =>
    Object.assign(Object.create(fonte) as FonteDeConexoes, {
      acessos: () =>
        Promise.resolve([{ integracaoId: 'hubspot', estado: 'conectado', conectados: 1, caminhos: ['autorizacao', 'chave'], caminho }]),
    })
}

const registro = (): Registro => ({ diretos: [], pelosAgentes: [] })
const colunas = () => within(screen.getByRole('list', { name: 'Kanban de Contas' })).getAllByRole('listitem')
const coluna = (rotulo: string) =>
  colunas().find((c) => c.getAttribute('aria-label')?.startsWith(`${rotulo},`)) as HTMLElement

describe('Enviar ao CRM no cartão do Kanban', () => {
  it('na Demonstração, sem envio real, o cartão não oferece o envio', async () => {
    renderizarApp('/contas?vista=kanban')
    await screen.findByRole('list', { name: 'Kanban de Contas' })
    expect(screen.queryByRole('button', { name: /^Enviar .* ao CRM$/ })).not.toBeInTheDocument()
  })

  it('pela chave de API, o cartão abre a confirmação do envio e confirmar envia ao CRM', async () => {
    const r = registro()
    const { usuario } = renderizarAppCom('/contas?vista=kanban', { contas: comEnvio(r), conexoes: comAcesso('chave') })
    await screen.findByRole('list', { name: 'Kanban de Contas' })
    const cartao = within(coluna('Fit')).getAllByRole('article')[0]
    const nome = cartao.getAttribute('aria-label')!

    await usuario.click(within(cartao).getByRole('button', { name: `Enviar ${nome} ao CRM` }))
    const dialogo = await screen.findByRole('dialog', { name: `Enviar ${nome} ao CRM` })
    const confirmacao = await within(dialogo).findByRole('region', { name: 'Confirmar o envio ao CRM' })
    expect(within(confirmacao).getByText(/uma nota com os Sinais e a abordagem/)).toBeInTheDocument()
    expect(within(confirmacao).getByText(/HubSpot/)).toBeInTheDocument()

    await usuario.click(within(confirmacao).getByRole('button', { name: 'Confirmar envio' }))
    expect(await within(dialogo).findByText('Enviada ao HubSpot: a empresa, os Contatos e a nota.')).toBeInTheDocument()
    expect(r.diretos).toHaveLength(1)
    expect(r.diretos[0][1]).toBe('hubspot')
    expect(r.pelosAgentes).toEqual([])
  })

  it('pela autorização (servidor MCP), o cartão pede aos Agentes, pelo caminho genérico do conector', async () => {
    const r = registro()
    const { usuario } = renderizarAppCom('/contas?vista=kanban', { contas: comEnvio(r), conexoes: comAcesso('autorizacao') })
    await screen.findByRole('list', { name: 'Kanban de Contas' })
    const cartao = within(coluna('Fit')).getAllByRole('article')[0]
    const nome = cartao.getAttribute('aria-label')!

    await usuario.click(within(cartao).getByRole('button', { name: `Enviar ${nome} ao CRM` }))
    const dialogo = await screen.findByRole('dialog', { name: `Enviar ${nome} ao CRM` })
    await usuario.click(await within(dialogo).findByRole('button', { name: 'Pedir aos Agentes' }))
    expect(await within(dialogo).findByText(`Os Agentes estão levando a ${nome} ao HubSpot.`)).toBeInTheDocument()
    expect(r.pelosAgentes).toHaveLength(1)
    expect(r.diretos).toEqual([])
  })

  it('cancelar fecha a confirmação sem enviar', async () => {
    const r = registro()
    const { usuario } = renderizarAppCom('/contas?vista=kanban', { contas: comEnvio(r), conexoes: comAcesso('chave') })
    await screen.findByRole('list', { name: 'Kanban de Contas' })
    const cartao = within(coluna('Fit')).getAllByRole('article')[0]
    await usuario.click(within(cartao).getByRole('button', { name: /^Enviar .* ao CRM$/ }))
    const dialogo = await screen.findByRole('dialog')
    await usuario.click(await within(dialogo).findByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(r.diretos).toEqual([])
  })

  it('quem não é o Vendedor responsável e a Conta que já está No CRM não têm o envio no cartão', async () => {
    renderizarAppCom('/contas?vista=kanban', {
      contas: comEnvio(registro(), (c) => (c.estagio === 'fit' ? { sobMinhaResponsabilidade: false } : {})),
      conexoes: comAcesso('chave'),
    })
    await screen.findByRole('list', { name: 'Kanban de Contas' })
    for (const cartao of within(coluna('Fit')).getAllByRole('article')) {
      expect(within(cartao).queryByRole('button', { name: /^Enviar .* ao CRM$/ })).not.toBeInTheDocument()
    }
    for (const cartao of within(coluna('No CRM')).queryAllByRole('article')) {
      expect(within(cartao).queryByRole('button', { name: /^Enviar .* ao CRM$/ })).not.toBeInTheDocument()
    }
    expect(within(coluna('Descoberta')).getAllByRole('button', { name: /^Enviar .* ao CRM$/ }).length).toBeGreaterThan(0)
  })
})

import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AcessoDaIntegracao, FonteDeConexoes } from '@/fonte/conexoes-tipos'
import type { EnvioAoCrm, FonteDeContas } from '@/fonte/contas-tipos'
import type { IntegracaoId } from '@/fonte/tipos'
import { renderizarAppCom } from '@/test/renderizar'

// "Enviar ao CRM" pelos Agentes (ADR-0023): com o CRM conectado pela autorização (servidor MCP), confirmar abre um pedido
// aos Agentes numa Conversa, com o mesmo pacote; pela chave de API, o envio direto continua como antes.

interface Registro {
  pelosAgentes: [string, IntegracaoId][]
  diretos: [string, IntegracaoId][]
}

function comEnvio(registro: Registro, opcoes: {
  envio?: EnvioAoCrm | null
  conversa?: string | null
  pedir?: () => Promise<{ conversaId: string }>
} = {}) {
  let envio = opcoes.envio ?? null
  return (fonte: FonteDeContas): FonteDeContas =>
    Object.assign(Object.create(fonte) as FonteDeContas, {
      conta: async (id: string) => ({ ...(await fonte.conta(id)), sobMinhaResponsabilidade: true }),
      envioAoCrm: () => Promise.resolve(envio),
      enviarAoCrm: (contaId: string, integracaoId: IntegracaoId) => {
        registro.diretos.push([contaId, integracaoId])
        envio = { integracaoId, estado: 'enviado' }
        return Promise.resolve({ mensagem: 'Enviada ao HubSpot: a empresa, 2 Contatos e a nota.', pendencias: [] })
      },
      enviarAoCrmPelosAgentes: async (contaId: string, integracaoId: IntegracaoId) => {
        registro.pelosAgentes.push([contaId, integracaoId])
        const r = await (opcoes.pedir ?? (() => Promise.resolve({ conversaId: 'conversa-do-envio' })))()
        envio = { integracaoId, estado: 'enviando' }
        return r
      },
      conversaDoEnvioAoCrm: () => Promise.resolve(opcoes.conversa ?? null),
    })
}

function comAcesso(caminho: AcessoDaIntegracao['caminho']) {
  return (fonte: FonteDeConexoes): FonteDeConexoes =>
    Object.assign(Object.create(fonte) as FonteDeConexoes, {
      acessos: () =>
        Promise.resolve([{ integracaoId: 'hubspot', estado: 'conectado', conectados: 1, caminhos: ['autorizacao', 'chave'], caminho }]),
    })
}

const registro = (): Registro => ({ pelosAgentes: [], diretos: [] })

describe('Enviar ao CRM pelos Agentes', () => {
  it('pela autorização, confirmar pede aos Agentes numa Conversa, com o CRM escolhido, e mostra como acompanhar', async () => {
    const r = registro()
    const { usuario } = renderizarAppCom('/contas/openai', { contas: comEnvio(r), conexoes: comAcesso('autorizacao') })
    await usuario.click(await screen.findByRole('button', { name: 'Enviar ao CRM' }))
    const confirmacao = await screen.findByRole('region', { name: 'Confirmar o envio ao CRM' })
    expect(within(confirmacao).getByText(/os Agentes levam a Conta pelas ferramentas do conector/)).toBeInTheDocument()
    expect(within(confirmacao).getByText(/uma nota com os Sinais e a abordagem/)).toBeInTheDocument()

    await usuario.click(within(confirmacao).getByRole('button', { name: 'Pedir aos Agentes' }))
    expect(await screen.findByText('Os Agentes estão levando a OpenAI ao HubSpot.')).toBeInTheDocument()
    expect(screen.getByText(/as que pedem Aprovação esperam a decisão na Conversa/)).toBeInTheDocument()
    expect(r.pelosAgentes).toEqual([['openai', 'hubspot']])
    expect(r.diretos).toEqual([])
    expect(screen.queryByRole('button', { name: 'Enviar ao CRM' })).not.toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Abrir a Conversa' }))
    await waitFor(() => expect(screen.queryByText('Os Agentes estão levando a OpenAI ao HubSpot.')).not.toBeInTheDocument())
  })

  it('depois de recarregar, o envio que os Agentes fazem mostra a Conversa dele', async () => {
    renderizarAppCom('/contas/openai', {
      contas: comEnvio(registro(), { envio: { integracaoId: 'hubspot', estado: 'enviando' }, conversa: 'conversa-do-envio' }),
      conexoes: comAcesso('autorizacao'),
    })
    expect(await screen.findByText('Os Agentes estão levando a OpenAI ao HubSpot.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir a Conversa' })).toBeInTheDocument()
  })

  it('pela chave de API, o envio continua direto, sem os Agentes', async () => {
    const r = registro()
    const { usuario } = renderizarAppCom('/contas/openai', { contas: comEnvio(r), conexoes: comAcesso('chave') })
    await usuario.click(await screen.findByRole('button', { name: 'Enviar ao CRM' }))
    const confirmacao = await screen.findByRole('region', { name: 'Confirmar o envio ao CRM' })
    expect(within(confirmacao).queryByText(/os Agentes levam a Conta/)).not.toBeInTheDocument()
    await usuario.click(within(confirmacao).getByRole('button', { name: 'Confirmar envio' }))
    expect(await screen.findByText('Enviada ao HubSpot')).toBeInTheDocument()
    expect(r.diretos).toEqual([['openai', 'hubspot']])
    expect(r.pelosAgentes).toEqual([])
  })

  it('a recusa do pedido aos Agentes aparece com a mensagem do servidor, e o botão volta', async () => {
    const r = registro()
    const recusa = 'Nenhum Agente pode escrever neste CRM. Dê ao Rhetor, ao Ethos ou ao Scopus a Permissão Propor ou Executar nele, em Agentes.'
    const { usuario } = renderizarAppCom('/contas/openai', {
      contas: comEnvio(r, { pedir: () => Promise.reject(new Error(recusa)) }),
      conexoes: comAcesso('autorizacao'),
    })
    await usuario.click(await screen.findByRole('button', { name: 'Enviar ao CRM' }))
    await usuario.click(await screen.findByRole('button', { name: 'Pedir aos Agentes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(recusa)
    expect(screen.getByRole('button', { name: 'Enviar ao CRM' })).toBeInTheDocument()
  })
})

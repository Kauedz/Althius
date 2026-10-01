import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AcessoDaIntegracao, FonteDeConexoes } from '@/fonte/conexoes-tipos'
import type { EnvioAoCrm, FonteDeContas } from '@/fonte/contas-tipos'
import type { IntegracaoId } from '@/fonte/tipos'
import { renderizarApp, renderizarAppCom } from '@/test/renderizar'

// "Enviar ao CRM" no detalhe da Conta-alvo (kanban-de-prospeccao 05): o Vendedor responsável escolhe um CRM em que tem
// Acesso conectado, confere o que vai e confirma.

function comEnvio(opcoes: {
  envio?: EnvioAoCrm | null
  responsavel?: boolean
  enviar?: (contaId: string, integracaoId: IntegracaoId) => Promise<{ mensagem: string; pendencias: string[] }>
  pedidos?: [string, IntegracaoId][]
}) {
  let envio = opcoes.envio ?? null
  return (fonte: FonteDeContas): FonteDeContas =>
    Object.assign(Object.create(fonte) as FonteDeContas, {
      conta: async (id: string) => ({ ...(await fonte.conta(id)), sobMinhaResponsabilidade: opcoes.responsavel ?? true }),
      envioAoCrm: () => Promise.resolve(envio),
      enviarAoCrm: async (contaId: string, integracaoId: IntegracaoId) => {
        opcoes.pedidos?.push([contaId, integracaoId])
        const r = await (opcoes.enviar ?? (() => Promise.resolve({ mensagem: 'Enviada ao HubSpot: a empresa, 2 Contatos e a nota.', pendencias: [] })))(contaId, integracaoId)
        envio = { integracaoId, estado: 'enviado' }
        return r
      },
    })
}

function comAcessos(acessos: Partial<AcessoDaIntegracao>[]) {
  return (fonte: FonteDeConexoes): FonteDeConexoes =>
    Object.assign(Object.create(fonte) as FonteDeConexoes, {
      acessos: () =>
        Promise.resolve(acessos.map((a) => ({ integracaoId: 'hubspot', estado: 'conectado', conectados: 1, caminhos: ['chave'], ...a }))),
    })
}

const botao = () => screen.findByRole('button', { name: 'Enviar ao CRM' })

describe('Enviar ao CRM', () => {
  it('na Demonstração, sem envio real, o botão não aparece', async () => {
    renderizarApp('/contas/openai')
    await screen.findByRole('heading', { name: 'Sinais' })
    expect(screen.queryByRole('button', { name: 'Enviar ao CRM' })).not.toBeInTheDocument()
  })

  it('quem não é o Vendedor responsável não vê o envio', async () => {
    renderizarAppCom('/contas/openai', { contas: comEnvio({ responsavel: false }), conexoes: comAcessos([{}]) })
    await screen.findByRole('heading', { name: 'Sinais' })
    expect(screen.queryByRole('button', { name: 'Enviar ao CRM' })).not.toBeInTheDocument()
  })

  it('sem nenhum CRM conectado, pede para conectar em Conexões', async () => {
    renderizarAppCom('/contas/openai', { contas: comEnvio({}), conexoes: comAcessos([{ estado: 'desconectado' }]) })
    const aviso = (_: string, el: Element | null) => el?.tagName === 'P' && el.textContent === 'Conecte um CRM em Conexões para enviar esta Conta.'
    const paragrafo = await screen.findByText(aviso)
    expect(within(paragrafo).getByRole('link', { name: 'Conexões' })).toHaveAttribute('href', '/conexoes')
    expect(screen.queryByRole('button', { name: 'Enviar ao CRM' })).not.toBeInTheDocument()
  })

  it('a confirmação mostra o que vai; confirmar envia ao CRM escolhido e a Conta passa a "Enviada ao HubSpot"', async () => {
    const pedidos: [string, IntegracaoId][] = []
    const { usuario, fonteDeContas } = renderizarAppCom('/contas/openai', { contas: comEnvio({ pedidos }), conexoes: comAcessos([{}]) })
    const contatos = (await fonteDeContas.contatosDaConta('openai')).length
    await usuario.click(await botao())
    const confirmacao = await screen.findByRole('region', { name: 'Confirmar o envio ao CRM' })
    expect(within(confirmacao).getByText(/OpenAI/)).toBeInTheDocument()
    expect(within(confirmacao).getByText(new RegExp(`${contatos} Contato`))).toBeInTheDocument()
    expect(within(confirmacao).getByText(/uma nota com os Sinais e a abordagem/)).toBeInTheDocument()
    expect(within(confirmacao).getByText(/HubSpot/)).toBeInTheDocument()

    await usuario.click(within(confirmacao).getByRole('button', { name: 'Confirmar envio' }))
    expect(await screen.findByText('Enviada ao HubSpot: a empresa, 2 Contatos e a nota.')).toBeInTheDocument()
    expect(pedidos).toEqual([['openai', 'hubspot']])
    expect(await screen.findByText('Enviada ao HubSpot')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enviar ao CRM' })).not.toBeInTheDocument()
  })

  it('com dois CRMs conectados, a pessoa escolhe para qual vai', async () => {
    const pedidos: [string, IntegracaoId][] = []
    const { usuario } = renderizarAppCom('/contas/openai', {
      contas: comEnvio({ pedidos }),
      conexoes: (fonte) =>
        comAcessos([{}, { integracaoId: 'pipedrive' }])(Object.assign(Object.create(fonte) as FonteDeConexoes, {
          integracoes: async () => [
            ...(await fonte.integracoes()),
            { id: 'pipedrive', nome: 'Pipedrive', categoria: 'CRM', descricao: '', escreve: true, estado: 'habilitada', habilitada: true },
          ],
        })),
    })
    await usuario.click(await botao())
    await usuario.click(await screen.findByRole('radio', { name: 'Pipedrive' }))
    await usuario.click(screen.getByRole('button', { name: 'Confirmar envio' }))
    await screen.findByText('Enviada ao Pipedrive')
    expect(pedidos).toEqual([['openai', 'pipedrive']])
  })

  it('a falha mostra a mensagem do servidor e o botão continua para tentar de novo', async () => {
    const { usuario } = renderizarAppCom('/contas/openai', {
      contas: comEnvio({ enviar: () => Promise.reject(new Error('O HubSpot recusou o Contato Maria. A empresa já está no HubSpot.')) }),
      conexoes: comAcessos([{}]),
    })
    await usuario.click(await botao())
    await usuario.click(await screen.findByRole('button', { name: 'Confirmar envio' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('O HubSpot recusou o Contato Maria. A empresa já está no HubSpot.')
    expect(screen.getByRole('button', { name: 'Enviar ao CRM' })).toBeInTheDocument()
  })

  it('uma Conta já enviada mostra para qual CRM foi, sem o botão; a última falha aparece antes de tentar de novo', async () => {
    renderizarAppCom('/contas/openai', { contas: comEnvio({ envio: { integracaoId: 'hubspot', estado: 'enviado' } }), conexoes: comAcessos([{}]) })
    expect(await screen.findByText('Enviada ao HubSpot')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enviar ao CRM' })).not.toBeInTheDocument()
  })

  it('a última tentativa que falhou aparece com o motivo', async () => {
    renderizarAppCom('/contas/openai', {
      contas: comEnvio({ envio: { integracaoId: 'hubspot', estado: 'falhou', erro: 'O HubSpot não respondeu.' } }),
      conexoes: comAcessos([{}]),
    })
    expect(await screen.findByText('A última tentativa de envio falhou: O HubSpot não respondeu.')).toBeInTheDocument()
    expect(await botao()).toBeInTheDocument()
  })
})

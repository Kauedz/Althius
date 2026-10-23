import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ErroDoPlano, MENSAGEM_DA_FALHA_DO_PLANO } from '@/fonte/plano-do-sinal'
import { renderizarApp, renderizarAppCom } from '@/test/renderizar'

// Descrever um Sinal na Demonstração (agente-de-sinal 01): a fonte simulada devolve um Plano fixo, para o fluxo inteiro
// (Briefing, Plano, edição, rascunho) funcionar sem servidor. A Demonstração não ganha conteúdo novo além disto.

const BRIEFING = 'Avise quando essas empresas abrirem vaga de RevOps.'

async function escreverEEscolher(usuario: ReturnType<typeof renderizarApp>['usuario']) {
  await usuario.type(await screen.findByRole('textbox', { name: 'O que você quer acompanhar' }), BRIEFING)
  const contas = await screen.findByRole('group', { name: 'Contas-alvo' })
  await usuario.click(within(contas).getAllByRole('checkbox')[0])
}

describe('Descrever um Sinal na Demonstração', () => {
  it('o catálogo oferece o botão ao lado de Meus Sinais e ele abre a página do Briefing', async () => {
    const { usuario } = renderizarApp('/sinais')

    const meus = await screen.findByRole('region', { name: 'Meus Sinais' })
    const botao = within(meus).getByRole('link', { name: 'Descrever um Sinal' })
    expect(botao).toHaveAttribute('href', '/sinais/novo')
    await usuario.click(botao)
    expect(await screen.findByRole('heading', { level: 1, name: 'Descrever um Sinal' })).toBeInTheDocument()
  })

  it('briefing, Plano fixo, critério editado e rascunho salvo na página do Monitoramento', async () => {
    const { usuario } = renderizarApp('/sinais/novo')

    expect(screen.queryByRole('combobox', { name: 'Tipo de Sinal' })).not.toBeInTheDocument()
    await escreverEEscolher(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Montar plano' }))

    expect(await screen.findByRole('combobox', { name: 'Tipo de Sinal' })).toHaveValue('vaga_linkedin')
    expect(screen.getByText(/Vamos acompanhar “Abertura de vagas”/)).toBeInTheDocument()
    await usuario.click(within(screen.getByRole('group', { name: 'Cargos ou funções' })).getByRole('checkbox', { name: 'Finanças' }))
    await usuario.click(screen.getByRole('button', { name: 'Salvar rascunho' }))

    const plano = await screen.findByRole('complementary', { name: 'Briefing e Plano' })
    expect(within(plano).getByText('Plano v1')).toBeInTheDocument()
    expect(within(plano).getByText(BRIEFING)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: BRIEFING.replace(/\.$/, '') })).toBeInTheDocument()
    expect(within(plano).getByRole('link', { name: 'Editar plano' })).toHaveAttribute('href', expect.stringMatching(/^\/sinais\/novo\?monitor=mon-/))
  })

  it('volta ao briefing sem perder o texto', async () => {
    const { usuario } = renderizarApp('/sinais/novo')

    await escreverEEscolher(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Montar plano' }))
    await screen.findByRole('combobox', { name: 'Tipo de Sinal' })
    await usuario.click(screen.getByRole('button', { name: 'Voltar ao briefing' }))

    expect(screen.getByRole('textbox', { name: 'O que você quer acompanhar' })).toHaveValue(BRIEFING)
    expect(within(screen.getByRole('group', { name: 'Contas-alvo' })).getAllByRole('checkbox')[0]).toHaveAttribute('aria-checked', 'true')
  })

  it('a falha do servidor ao montar vira a mensagem recuperável, e o limite do dia, a mensagem dele', async () => {
    const montarPlano = vi.fn()
      .mockRejectedValueOnce(new Error('Edge Function fora do ar: apify 500'))
      .mockRejectedValueOnce(new ErroDoPlano('limite_diario', 'Você chegou ao limite de planos de hoje. Tente de novo amanhã.'))
    const { usuario } = renderizarAppCom('/sinais/novo', { sinais: (fonte) => ({ ...fonte, montarPlano }) })

    await escreverEEscolher(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Montar plano' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAGEM_DA_FALHA_DO_PLANO)
    expect(screen.getByRole('alert')).not.toHaveTextContent(/apify|Edge Function/)

    await usuario.click(screen.getByRole('button', { name: 'Montar plano' }))
    expect(await screen.findByText('Você chegou ao limite de planos de hoje. Tente de novo amanhã.')).toBeInTheDocument()
    expect(montarPlano).toHaveBeenCalledTimes(2)
  })

  it('o botão não aparece onde a Fonte não monta Planos', async () => {
    renderizarAppCom('/sinais', { sinais: (fonte) => ({ ...fonte, montarPlano: undefined }) })

    await screen.findByRole('region', { name: 'Meus Sinais' })
    expect(screen.queryByRole('link', { name: 'Descrever um Sinal' })).not.toBeInTheDocument()
  })
})

import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderizarApp } from '@/test/renderizar'

describe('Bloco Sequência no detalhe da Conta-alvo (Ticket 04)', () => {
  it('clicar em uma Conta-alvo na tabela de contas abre o detalhe da empresa com a migalha "Contas / Nome"', async () => {
    const { usuario } = renderizarApp('/contas')

    const tabela = await screen.findByRole('table', { name: 'Tabela de Contas' })
    const linkOpenAI = within(tabela).getByRole('link', { name: 'OpenAI' })
    expect(linkOpenAI).toBeInTheDocument()

    await usuario.click(linkOpenAI)

    // Abre o detalhe com cabeçalho e migalha
    expect(await screen.findByRole('heading', { level: 2, name: 'OpenAI' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Contas \/ OpenAI/i })).toBeInTheDocument()
    expect(screen.getByText('🔥 Quente')).toBeInTheDocument()
    expect(screen.getByText('Recomendada pela Althius')).toBeInTheDocument()
  })

  it('mostra a seção Sequência com status, cobertura, steps e atalho para o documento quando houver sequência', async () => {
    const { usuario } = renderizarApp('/contas/openai')

    // Seção Sequência
    const secaoSequencia = await screen.findByRole('region', { name: 'Sequência' })
    expect(secaoSequencia).toBeInTheDocument()

    // Status 'Ativa'
    expect(within(secaoSequencia).getByText('Ativa')).toBeInTheDocument()

    // Cobertura e progresso
    expect(within(secaoSequencia).getByText('3 contatos participantes')).toBeInTheDocument()
    expect(within(secaoSequencia).getByText(/Passo atual: 1 de 6/i)).toBeInTheDocument()

    // Atalho para abrir o documento completo da sequência
    const linkVerSequencia = within(secaoSequencia).getByRole('link', { name: /Ver sequência/i })
    expect(linkVerSequencia).toHaveAttribute('href', '/sequencias/sequencia-openai')

    // Clicar no atalho navega para o detalhe da sequência
    await usuario.click(linkVerSequencia)
    expect(await screen.findByText(/Sequências \/ OpenAI/i)).toBeInTheDocument()
    expect(screen.getByText(/Regra de pause na Conta-alvo/i)).toBeInTheDocument()
  })

  it('mostra a seção Sequência com status Pausada e aviso explicativo quando a sequência estiver pausada', async () => {
    renderizarApp('/contas/anthropic')

    const secaoSequencia = await screen.findByRole('region', { name: 'Sequência' })
    expect(secaoSequencia).toBeInTheDocument()

    expect(within(secaoSequencia).getByText('Pausada')).toBeInTheDocument()
    expect(within(secaoSequencia).getByText('3 contatos participantes')).toBeInTheDocument()
    expect(
      within(secaoSequencia).getByText(/Alex Rivera respondeu no LinkedIn/i),
    ).toBeInTheDocument()
  })

  it('sem sequência, exibe estado vazio com mensagem orientadora e ação para criar', async () => {
    // Figma não tem sequência nas contas iniciais da demo
    renderizarApp('/contas/figma')

    const secaoSequencia = await screen.findByRole('region', { name: 'Sequência' })
    expect(secaoSequencia).toBeInTheDocument()

    expect(
      within(secaoSequencia).getByText('Nenhuma sequência nesta Conta-alvo.'),
    ).toBeInTheDocument()
    expect(
      within(secaoSequencia).getByRole('button', { name: /Criar sequência/i }),
    ).toBeInTheDocument()
  })

  it('criar sequência a partir do botão no estado vazio abre modal com conta pré-selecionada e atualiza a seção', async () => {
    const { usuario } = renderizarApp('/contas/figma')

    const secaoSequencia = await screen.findByRole('region', { name: 'Sequência' })
    const botaoCriar = within(secaoSequencia).getByRole('button', { name: /Criar sequência/i })

    await usuario.click(botaoCriar)

    // O modal abre com o título e a conta Figma pré-selecionada
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText('Nova sequência')).toBeInTheDocument()
    const selectConta = within(dialogo).getByRole('combobox', { name: 'Conta-alvo' })
    expect(selectConta).toHaveValue('figma')
    expect(selectConta).toBeDisabled()

    // Submete a criação
    const botaoSubmeter = within(dialogo).getByRole('button', { name: 'Criar sequência' })
    await usuario.click(botaoSubmeter)

    // O modal fecha e a seção agora exibe a sequência criada
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(secaoSequencia).getByText('Ativa')).toBeInTheDocument()
    expect(within(secaoSequencia).getByRole('link', { name: /Ver sequência/i })).toBeInTheDocument()
  })

  it('Conta com 1 Contato consegue ter sequência válida', async () => {
    // Cloudflare tem 1 participante na sequência na demo inicial
    renderizarApp('/contas/cloudflare')

    const secaoSequencia = await screen.findByRole('region', { name: 'Sequência' })
    expect(secaoSequencia).toBeInTheDocument()

    expect(within(secaoSequencia).getByText('Ativa')).toBeInTheDocument()
    expect(within(secaoSequencia).getByText('1 contato participante')).toBeInTheDocument()
  })

  it('tentativa de criar segunda sequência na mesma Conta é rejeitada pela fonte e prevenida na UI', async () => {
    const { fonteDeSequencias, usuario } = renderizarApp('/contas/openai')

    // 1. Rejeição no nível da Fonte de dados (comportamento único com erro)
    await expect(
      fonteDeSequencias.criarSequencia({
        contaId: 'openai',
      }),
    ).rejects.toThrow(/já possui uma sequência/i)

    // 2. Prevenção no diálogo global de nova sequência
    // Se abrir o modal global de Nova sequência e selecionar OpenAI
    await usuario.click(screen.getByRole('link', { name: 'Sequências' }))
    const botaoNovaGlobal = await screen.findByRole('button', { name: /Nova sequência/i })
    await usuario.click(botaoNovaGlobal)

    const dialogo = await screen.findByRole('dialog')
    const optionOpenAI = within(dialogo).getByRole('option', { name: /OpenAI \(já possui sequência\)/i })
    expect(optionOpenAI).toBeDisabled()
  })

  it('exibe mensagem amigável quando a conta não for encontrada com link de volta', async () => {
    renderizarApp('/contas/empresa-fantasma')

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Conta não encontrada.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Voltar para Contas/i })).toBeInTheDocument()
  })
})

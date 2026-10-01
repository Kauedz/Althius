import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderizarApp } from '@/test/renderizar'

describe('Módulo Sequências e Casca (Ticket 02 & Ticket 03)', () => {
  it('o item "Sequências" aparece na seção Workspace da sidebar entre Contas e Contatos e Agentes e abre o módulo', async () => {
    const { usuario } = renderizarApp('/')

    const nav = screen.getByRole('navigation', { name: 'Workspace' })
    const links = within(nav).getAllByRole('link')
    expect(links[0]).toHaveTextContent('Contas e Contatos')
    expect(links[1]).toHaveTextContent('Sequências')
    expect(links[2]).toHaveTextContent('Agentes')

    // Clicar em Sequências abre a página de Sequências
    await usuario.click(links[1])
    expect(await screen.findByRole('heading', { level: 1, name: 'Sequências' })).toBeInTheDocument()
    expect(links[1]).toHaveAttribute('aria-current', 'page')
  })

  it('o item Sequências fica ativo em sub-rotas do módulo', async () => {
    renderizarApp('/sequencias/sequencia-openai')

    const nav = screen.getByRole('navigation', { name: 'Workspace' })
    const linkSequencias = within(nav).getByRole('link', { name: 'Sequências' })
    expect(linkSequencias).toHaveAttribute('aria-current', 'page')
    expect(await screen.findByRole('heading', { level: 1, name: 'Sequências' })).toBeInTheDocument()
  })

  it('a página inicial continua sendo a grade de Agentes', async () => {
    renderizarApp('/')
    expect(await screen.findByRole('heading', { level: 1, name: 'Agentes' })).toBeInTheDocument()
  })

  it('a tela de Sequências exibe o título, descrição, contagem e a tabela com as 5 colunas', async () => {
    renderizarApp('/sequencias')

    expect(await screen.findByRole('heading', { level: 1, name: 'Sequências' })).toBeInTheDocument()
    expect(
      screen.getByText(/Planos de abordagem por Conta-alvo/i),
    ).toBeInTheDocument()
    expect(screen.getByText('7 sequências')).toBeInTheDocument()

    const tabela = screen.getByRole('table', { name: 'Tabela de Sequências' })
    const cabecalhos = within(tabela)
      .getAllByRole('columnheader')
      .map((th) => th.textContent?.trim())

    expect(cabecalhos).toEqual([
      'Conta-alvo',
      'Status',
      'Cobertura',
      'Próximo step',
      'Progresso',
    ])

    // Linhas populadas com contas da demo
    expect(within(tabela).getByText('OpenAI')).toBeInTheDocument()
    expect(within(tabela).getByText('Stripe')).toBeInTheDocument()
    expect(within(tabela).getByText('Anthropic')).toBeInTheDocument()
    expect(within(tabela).getByText('GitLab')).toBeInTheDocument()
  })

  it('cada linha da tabela exibe status, cobertura e resumo do próximo step', async () => {
    renderizarApp('/sequencias')

    const tabela = await screen.findByRole('table', { name: 'Tabela de Sequências' })
    const linhas = within(tabela).getAllByRole('row').slice(1) // ignora o thead

    // Primeira linha: OpenAI
    const linhaOpenAI = linhas[0]
    expect(within(linhaOpenAI).getByText('OpenAI')).toBeInTheDocument()
    expect(within(linhaOpenAI).getByText('Ativa')).toBeInTheDocument()
    expect(within(linhaOpenAI).getByText(/3 contatos de 4/i)).toBeInTheDocument()
    expect(within(linhaOpenAI).getByText(/Step 1 · Abertura pelo Sinal/i)).toBeInTheDocument()
    expect(within(linhaOpenAI).getByText('0/6 steps')).toBeInTheDocument()

    // Segunda linha: Anthropic (pausada)
    const linhaAnthropic = linhas[1]
    expect(within(linhaAnthropic).getByText('Anthropic')).toBeInTheDocument()
    expect(within(linhaAnthropic).getByText('Pausada')).toBeInTheDocument()
    expect(within(linhaAnthropic).getByText(/Pausada · Alex Rivera respondeu/i)).toBeInTheDocument()

    // Terceira linha: Stripe (reunião)
    const linhaStripe = linhas[2]
    expect(within(linhaStripe).getByText('Stripe')).toBeInTheDocument()
    expect(within(linhaStripe).getByText('Reunião')).toBeInTheDocument()
    expect(within(linhaStripe).getByText(/Reunião marcada/i)).toBeInTheDocument()
  })

  it('busca por Conta-alvo filtra dinamicamente as linhas da tabela', async () => {
    const { usuario } = renderizarApp('/sequencias')

    const tabela = await screen.findByRole('table', { name: 'Tabela de Sequências' })
    expect(within(tabela).getByText('OpenAI')).toBeInTheDocument()
    expect(within(tabela).getByText('Stripe')).toBeInTheDocument()

    const campoBusca = screen.getByRole('searchbox', { name: 'Buscar por Conta-alvo' })
    await usuario.type(campoBusca, 'stripe')

    expect(screen.getByText('Exibindo 1 de 7 sequências')).toBeInTheDocument()
    expect(within(tabela).getByText('Stripe')).toBeInTheDocument()
    expect(within(tabela).queryByText('OpenAI')).not.toBeInTheDocument()

    // Limpar a busca restaura a lista completa
    await usuario.clear(campoBusca)
    expect(screen.getByText('7 sequências')).toBeInTheDocument()
    expect(within(tabela).getByText('OpenAI')).toBeInTheDocument()
  })

  it('filtro por status exibe apenas sequências no status selecionado', async () => {
    const { usuario } = renderizarApp('/sequencias')

    const tabela = await screen.findByRole('table', { name: 'Tabela de Sequências' })
    const filtro = screen.getByRole('combobox', { name: 'Filtrar por status' })

    // Filtrar por Pausada
    await usuario.selectOptions(filtro, 'pausada')
    expect(screen.getByText('Exibindo 1 de 7 sequências')).toBeInTheDocument()
    expect(within(tabela).getByText('Anthropic')).toBeInTheDocument()
    expect(within(tabela).queryByText('OpenAI')).not.toBeInTheDocument()

    // Filtrar por Reunião
    await usuario.selectOptions(filtro, 'reuniao')
    expect(screen.getByText('Exibindo 1 de 7 sequências')).toBeInTheDocument()
    expect(within(tabela).getByText('Stripe')).toBeInTheDocument()
    expect(within(tabela).queryByText('Anthropic')).not.toBeInTheDocument()

    // Voltar para Todos
    await usuario.selectOptions(filtro, 'todos')
    expect(screen.getByText('7 sequências')).toBeInTheDocument()
  })

  it('exibe mensagem quando a busca ou filtro não encontra nenhuma sequência', async () => {
    const { usuario } = renderizarApp('/sequencias')

    const campoBusca = await screen.findByRole('searchbox', { name: 'Buscar por Conta-alvo' })
    await usuario.type(campoBusca, 'empresa inexistente xyz')

    expect(screen.getByText('Exibindo 0 de 7 sequências')).toBeInTheDocument()
    expect(screen.getByText('Nenhuma sequência encontrada')).toBeInTheDocument()
    expect(screen.getByText('Ajuste a busca ou o filtro de status.')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Tabela de Sequências' })).not.toBeInTheDocument()
  })

  it('abrir Sequências com fonte vazia mostra estado vazio e botão de Nova sequência', async () => {
    const { usuario } = renderizarApp('/sequencias', {}, { vazia: true })

    expect(await screen.findByRole('heading', { level: 1, name: 'Sequências' })).toBeInTheDocument()
    expect(screen.getByText(/Nenhuma sequência ainda/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Nova sequência/i })).toBeInTheDocument()

    // Navegar para Contas funciona perfeitamente
    const nav = screen.getByRole('navigation', { name: 'Workspace' })
    await usuario.click(within(nav).getByRole('link', { name: 'Contas e Contatos' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Contas' })).toBeInTheDocument()

    // Voltar para Sequências vazia continua funcionando
    await usuario.click(within(nav).getByRole('link', { name: 'Sequências' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Sequências' })).toBeInTheDocument()
    expect(screen.getByText(/Nenhuma sequência ainda/i)).toBeInTheDocument()
  })

  it('exibe alerta de erro e permite recarregar via "Tentar de novo"', async () => {
    const { fonteDeSequencias, usuario } = renderizarApp('/sequencias', {}, { falha: true })

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Não foi possível carregar as sequências.')

    fonteDeSequencias.definirFalha(false)
    const botaoTentar = within(alerta).getByRole('button', { name: 'Tentar de novo' })
    await usuario.click(botaoTentar)

    expect(await screen.findByText('7 sequências')).toBeInTheDocument()
  })

  it('recarrega automaticamente quando a fonte avisa uma mudança via observar', async () => {
    const { fonteDeSequencias } = renderizarApp('/sequencias')

    expect(await screen.findByText('7 sequências')).toBeInTheDocument()

    await fonteDeSequencias.criarSequencia({
      contaId: 'figma',
      participantesIds: ['contato-figma-1'],
    })

    expect(await screen.findByText('8 sequências')).toBeInTheDocument()
    const tabela = screen.getByRole('table', { name: 'Tabela de Sequências' })
    expect(within(tabela).getByText('Figma')).toBeInTheDocument()
  })

  it('permite criar uma "Nova sequência" via modal escolhendo Conta-alvo e participantes', async () => {
    const { usuario } = renderizarApp('/sequencias')

    expect(await screen.findByText('7 sequências')).toBeInTheDocument()

    // Clica no botão Nova sequência
    const botaoNova = screen.getByRole('button', { name: /Nova sequência/i })
    await usuario.click(botaoNova)

    // O modal se abre
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Nova sequência' })).toBeInTheDocument()

    const selectConta = within(dialog).getByRole('combobox', { name: 'Conta-alvo' })
    // OpenAI já tem sequência e deve estar desabilitada
    const opcaoOpenAI = within(selectConta).getByRole('option', { name: /OpenAI/i })
    expect(opcaoOpenAI).toBeDisabled()

    // Figma não tem sequência e está disponível
    const opcaoFigma = within(selectConta).getByRole('option', { name: /Figma/i })
    expect(opcaoFigma).not.toBeDisabled()

    // Seleciona Figma
    await usuario.selectOptions(selectConta, 'figma')

    // Contatos da Figma são carregados e listados
    expect(await within(dialog).findByText(/Gabriel Siqueira/i)).toBeInTheDocument()

    // Submete a criação
    const botaoCriar = within(dialog).getByRole('button', { name: /Criar sequência/i })
    await usuario.click(botaoCriar)

    // Redireciona para o detalhe da nova sequência
    expect(await screen.findByRole('heading', { level: 2, name: /Figma/i })).toBeInTheDocument()
    expect(screen.getByText(/Regra de pause na Conta-alvo/i)).toBeInTheDocument()
  })

  it('clique na linha da tabela abre o detalhe da sequência com regra de pause e steps', async () => {
    const { usuario } = renderizarApp('/sequencias')

    const tabela = await screen.findByRole('table', { name: 'Tabela de Sequências' })
    const linkOpenAI = within(tabela).getByRole('link', { name: 'OpenAI' })

    await usuario.click(linkOpenAI)

    // Abre o detalhe da OpenAI
    expect(await screen.findByRole('heading', { level: 2, name: /OpenAI/i })).toBeInTheDocument()
    expect(screen.getByText(/Regra de pause na Conta-alvo/i)).toBeInTheDocument()
    expect(
      screen.getByText(/Qualquer resposta nesta Conta-alvo \(positiva ou negativa\) pausa a sequência inteira/i),
    ).toBeInTheDocument()

    // Mostra os steps
    expect(screen.getByText('Abertura pelo Sinal')).toBeInTheDocument()
    expect(screen.getByText('Follow-up com vídeo')).toBeInTheDocument()

    // Permite voltar para a lista global
    const linkVoltar = screen.getByRole('link', { name: /Sequências \/ OpenAI/i })
    await usuario.click(linkVoltar)

    expect(await screen.findByRole('table', { name: 'Tabela de Sequências' })).toBeInTheDocument()
  })

  it('uma Sequência encerrada aparece como histórico e não segura a Conta na criação de outra', async () => {
    const { fonteDeSequencias, usuario } = renderizarApp('/sequencias')
    expect(await screen.findByText('7 sequências')).toBeInTheDocument()

    await fonteDeSequencias.criarSequencia({ contaId: 'figma', participantesIds: ['contato-figma-1'], status: 'encerrada' })

    const tabela = await screen.findByRole('table', { name: 'Tabela de Sequências' })
    const linhaFigma = (await within(tabela).findByRole('link', { name: 'Figma' })).closest('tr')!
    expect(within(linhaFigma).getByText('Encerrada')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: /Nova sequência/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('option', { name: /Figma/i })).not.toBeDisabled()
  })

  it('o detalhe de uma Sequência encerrada mostra só o resumo seguro, com o motivo', async () => {
    const { fonteDeSequencias, usuario } = renderizarApp('/sequencias')
    expect(await screen.findByText('7 sequências')).toBeInTheDocument()
    await fonteDeSequencias.criarSequencia({ contaId: 'figma', participantesIds: ['contato-figma-1'], status: 'encerrada' })

    const tabela = await screen.findByRole('table', { name: 'Tabela de Sequências' })
    await usuario.click(await within(tabela).findByRole('link', { name: 'Figma' }))

    expect(await screen.findByRole('heading', { name: 'Resumo da Conta-alvo' })).toBeInTheDocument()
    expect(screen.getByText(/foi encerrada porque a responsabilidade pela Conta-alvo mudou/i)).toBeInTheDocument()
    expect(screen.queryByText(/Regra de pause na Conta-alvo/i)).not.toBeInTheDocument()
  })
})

describe('Cadência do Playbook como modelo da Nova sequência', () => {
  it('oferece o modelo com os toques, marca o que depende do canal e cria a Sequência já com os passos', async () => {
    const { usuario } = renderizarApp('/sequencias')
    expect(await screen.findByText('7 sequências')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: /Nova sequência/i }))
    const dialog = await screen.findByRole('dialog')
    await usuario.selectOptions(within(dialog).getByRole('combobox', { name: 'Conta-alvo' }), 'figma')
    await within(dialog).findByText(/Gabriel Siqueira/i)

    expect(await within(dialog).findByRole('checkbox', { name: /Usar a Cadência do Playbook como modelo \(3 toques\)/ })).toBeChecked()
    expect(within(dialog).getByText(/Dia 2 · Conexão \(LinkedIn\)/)).toHaveTextContent('depende do canal')
    expect(within(dialog).getByText(/Dia 1 · Abertura pelo Sinal \(E-mail\)/)).not.toHaveTextContent('depende do canal')
    expect(within(dialog).getByText(/Ficam de fora, por ainda não terem canal: Ligação de qualificação/)).toBeInTheDocument()

    await usuario.click(within(dialog).getByRole('button', { name: /Criar sequência/i }))
    expect(await screen.findByRole('heading', { level: 2, name: /Figma/i })).toBeInTheDocument()
    expect(await screen.findByText('Abertura pelo Sinal')).toBeInTheDocument()
    expect(screen.getByText('Follow-up')).toBeInTheDocument()
  })

  it('desmarcar o modelo cria a Sequência vazia, como antes', async () => {
    const { fonteDeSequencias, usuario } = renderizarApp('/sequencias')
    expect(await screen.findByText('7 sequências')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: /Nova sequência/i }))
    const dialog = await screen.findByRole('dialog')
    await usuario.selectOptions(within(dialog).getByRole('combobox', { name: 'Conta-alvo' }), 'figma')
    await usuario.click(await within(dialog).findByRole('checkbox', { name: /Usar a Cadência do Playbook/ }))
    await usuario.click(within(dialog).getByRole('button', { name: /Criar sequência/i }))

    await screen.findByRole('heading', { level: 2, name: /Figma/i })
    expect((await fonteDeSequencias.sequenciaPorConta('figma'))?.steps).toEqual([])
  })
})

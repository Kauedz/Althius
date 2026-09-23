import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderizarApp } from '@/test/renderizar'

describe('Aba Contas (ponta a ponta)', () => {
  it('o item "Contas e Contatos" aparece na seção Workspace da sidebar acima de Agentes e abre a aba Contas', async () => {
    const { usuario } = renderizarApp('/')

    const nav = screen.getByRole('navigation', { name: 'Workspace' })
    const links = within(nav).getAllByRole('link')
    expect(links[0]).toHaveTextContent('Contas e Contatos')
    expect(links[1]).toHaveTextContent('Agentes')

    // O selo de demonstração continua visível
    expect(screen.getByText('Demonstração')).toBeInTheDocument()

    // Clicar em Contas e Contatos abre a aba Contas
    await usuario.click(links[0])
    expect(await screen.findByRole('heading', { level: 1, name: 'Contas' })).toBeInTheDocument()
  })

  it('a página inicial continua sendo a grade de Agentes', async () => {
    renderizarApp('/')
    expect(await screen.findByRole('heading', { level: 1, name: 'Agentes' })).toBeInTheDocument()
    expect(await screen.findByRole('list', { name: 'Agentes do Workspace' })).toBeInTheDocument()
  })

  it('a aba Contas mostra o título, a descrição, a contagem "N contas" e a tabela com as seis colunas nessa ordem', async () => {
    renderizarApp('/contas')

    expect(await screen.findByRole('heading', { level: 1, name: 'Contas' })).toBeInTheDocument()
    expect(
      screen.getByText('Empresas do seu mercado organizadas pelo momento de abordagem'),
    ).toBeInTheDocument()
    expect(screen.getByText('5 contas')).toBeInTheDocument()

    const tabela = screen.getByRole('table', { name: 'Tabela de Contas' })
    const cabecalhos = within(tabela)
      .getAllByRole('columnheader')
      .map((th) => th.textContent?.trim())

    expect(cabecalhos).toEqual([
      'Empresa',
      'Aderência',
      'Contatos',
      'Último sinal',
      'Segmento',
      'Último contato',
    ])
  })

  it('a ordem padrão é a Prioridade: Quente, Fit, Não fit e não avaliada, com desempate por sinal mais recente e nome', async () => {
    renderizarApp('/contas')

    const tabela = await screen.findByRole('table', { name: 'Tabela de Contas' })
    const linhas = within(tabela).getAllByRole('row').slice(1) // ignora o header

    const nomesDasEmpresas = linhas.map(
      (linha) => within(linha).getAllByRole('cell')[0].textContent?.trim(),
    )

    // Quentes (OpenAI sinal há 2 dias > Stripe sinal há 10 dias)
    // Fit (Anthropic)
    // Não fit (Nubank)
    // Não avaliada (BBVA México)
    expect(nomesDasEmpresas).toEqual([
      'OpenAI',
      'Stripe',
      'Anthropic',
      'Nubank',
      'BBVA México',
    ])
  })

  it('Último sinal mostra "frase · data relativa" ou "Nenhum sinal"; Último contato mostra data ou "Nunca"', async () => {
    renderizarApp('/contas')

    const tabela = await screen.findByRole('table', { name: 'Tabela de Contas' })
    const linhas = within(tabela).getAllByRole('row').slice(1)

    // OpenAI: Quente, 3 contatos, sinal há 2 dias, IA, último contato Há 5 dias
    const openaiCells = within(linhas[0]).getAllByRole('cell')
    expect(openaiCells[0]).toHaveTextContent('OpenAI')
    expect(openaiCells[1]).toHaveTextContent('🔥 Quente')
    expect(openaiCells[2]).toHaveTextContent('3 contatos')
    expect(openaiCells[3]).toHaveTextContent('Abriu 3 vagas de engenharia de dados de avaliação · há 2 dias')
    expect(openaiCells[4]).toHaveTextContent('Inteligência Artificial')
    expect(openaiCells[5]).toHaveTextContent('Há 5 dias')

    // Stripe: Quente, último contato Ontem
    const stripeCells = within(linhas[1]).getAllByRole('cell')
    expect(stripeCells[0]).toHaveTextContent('Stripe')
    expect(stripeCells[1]).toHaveTextContent('🔥 Quente')
    expect(stripeCells[2]).toHaveTextContent('2 contatos')
    expect(stripeCells[3]).toHaveTextContent('Lançamento de suporte a pagamentos de agentes · há 1 semana')
    expect(stripeCells[4]).toHaveTextContent('Infraestrutura de pagamentos')
    expect(stripeCells[5]).toHaveTextContent('Ontem')

    // Anthropic: Fit, último contato há 45 dias (data explícita: 9 ago.)
    const anthropicCells = within(linhas[2]).getAllByRole('cell')
    expect(anthropicCells[0]).toHaveTextContent('Anthropic')
    expect(anthropicCells[1]).toHaveTextContent('Fit')
    expect(anthropicCells[2]).toHaveTextContent('1 contato')
    expect(anthropicCells[3]).toHaveTextContent('Anúncio de novas ferramentas para empresas · há 2 semanas')
    expect(anthropicCells[4]).toHaveTextContent('Inteligência Artificial')
    expect(anthropicCells[5]).toHaveTextContent('9 ago.')

    // Nubank: Não fit, sem contatos, sem sinal, nunca contatada
    const nubankCells = within(linhas[3]).getAllByRole('cell')
    expect(nubankCells[0]).toHaveTextContent('Nubank')
    expect(nubankCells[1]).toHaveTextContent('Não fit')
    expect(nubankCells[2]).toHaveTextContent('Nenhum contato')
    expect(nubankCells[3]).toHaveTextContent('Nenhum sinal')
    expect(nubankCells[4]).toHaveTextContent('Serviços financeiros')
    expect(nubankCells[5]).toHaveTextContent('Nunca')

    // BBVA México: sem aderência ("—" com tooltip), segmento ausente ("—"), nunca contatada
    const bbvaCells = within(linhas[4]).getAllByRole('cell')
    expect(bbvaCells[0]).toHaveTextContent('BBVA México')
    expect(within(bbvaCells[1]).getByTitle('Aderência ainda não avaliada')).toBeInTheDocument()
    expect(bbvaCells[2]).toHaveTextContent('2 contatos')
    expect(bbvaCells[3]).toHaveTextContent('Expansão da equipe de inovação digital · há 2 semanas')
    expect(bbvaCells[4]).toHaveTextContent('—')
    expect(bbvaCells[5]).toHaveTextContent('Nunca')
  })

  it('enquanto carrega, aparece o pulso do app', async () => {
    renderizarApp('/contas', { atrasoMs: 150 })

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText('Carregando')).toBeInTheDocument()

    expect(await screen.findByRole('table', { name: 'Tabela de Contas' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('com a fonte vazia, exibe mensagem explicativa sem botões e sem pedido de configuração', async () => {
    renderizarApp('/contas', { vazia: true })

    expect(
      await screen.findByText(
        'Nenhuma Conta-alvo ainda. As empresas aparecem aqui quando o Scopus encontrá-las ou quando forem importadas.',
      ),
    ).toBeInTheDocument()

    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /configurar|novo|adicionar/i })).not.toBeInTheDocument()
  })

  it('com a fonte em falha, exibe mensagem curta de erro com "Tentar de novo" que recupera os dados', async () => {
    const { fonteDeContas, usuario } = renderizarApp('/contas', { falha: true })

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Não foi possível carregar as contas.')).toBeInTheDocument()

    const botaoTentar = screen.getByRole('button', { name: 'Tentar de novo' })
    expect(botaoTentar).toBeInTheDocument()

    // Recupera a falha e tenta de novo
    fonteDeContas.definirFalha(false)
    await usuario.click(botaoTentar)

    expect(await screen.findByRole('table', { name: 'Tabela de Contas' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

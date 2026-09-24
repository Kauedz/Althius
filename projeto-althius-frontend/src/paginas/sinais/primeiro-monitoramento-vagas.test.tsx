import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderizarApp } from '@/test/renderizar'

describe('Ticket 03: Primeiro Monitoramento de vagas', () => {
  it('navega pelo catálogo com busca, filtro de origem e continuidade em busca sem correspondência', async () => {
    const { usuario } = renderizarApp('/sinais')

    const catalogo = await screen.findByRole('region', { name: 'Catálogo de sinais' })
    expect(within(catalogo).getByRole('heading', { level: 2, name: /^Vagas e equipes/ })).toBeInTheDocument()

    // Filtro por origem: Externos contém Vagas e equipes
    await usuario.click(screen.getByRole('button', { name: /Externos/ }))
    expect(screen.getByRole('link', { name: /Abertura de vagas/ })).toBeInTheDocument()

    // Filtro por origem: Internos esconde Abertura de vagas
    await usuario.click(screen.getByRole('button', { name: /Internos/ }))
    expect(screen.queryByRole('link', { name: /Abertura de vagas/ })).not.toBeInTheDocument()

    // Voltar para Todos
    await usuario.click(screen.getByRole('button', { name: /Todos/ }))
    expect(screen.getByRole('link', { name: /Abertura de vagas/ })).toBeInTheDocument()

    // Busca por termo que não corresponde
    const busca = screen.getByRole('searchbox', { name: 'Buscar tipos de sinal' })
    await usuario.type(busca, 'termo-inexistente-123')
    expect(screen.getByText('Nenhum tipo de sinal corresponde a “termo-inexistente-123”.')).toBeInTheDocument()

    // Ação de continuidade: Limpar busca
    await usuario.click(screen.getByRole('button', { name: 'Limpar busca' }))
    expect(await screen.findByRole('region', { name: 'Catálogo de sinais' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Abertura de vagas/ })).toBeInTheDocument()
  })

  it('abre Abertura de vagas em página própria com retorno ao catálogo, contagem de ativos excluindo rascunhos e lista de monitoramentos', async () => {
    const { usuario } = renderizarApp('/sinais')

    // Clica no card de Abertura de vagas
    await usuario.click(await screen.findByRole('link', { name: /Abertura de vagas/ }))

    // Página própria do tipo
    expect(await screen.findByRole('heading', { level: 1, name: 'Abertura de vagas' })).toBeInTheDocument()
    expect(screen.getByText(/Cada Sinal disparado deixa a Conta-alvo Quente por \d+ dias/)).toBeInTheDocument()

    // Retorno explícito ao catálogo
    const linkVoltar = within(screen.getByRole('main')).getByRole('link', { name: 'Sinais' })
    expect(linkVoltar).toBeInTheDocument()

    // Lista de monitoramentos do tipo
    const lista = screen.getByRole('list', { name: 'Monitoramentos deste tipo' })
    expect(within(lista).getByRole('listitem', { name: 'Vagas de engenharia de dados' })).toHaveTextContent('Ativo')
    expect(within(lista).getByRole('listitem', { name: 'Vagas de IA no México' })).toHaveTextContent('Pausado')
    expect(within(lista).getByRole('listitem', { name: 'Vagas de finanças em fintechs' })).toHaveTextContent('Rascunho')

    // Contagem: 3 no total, mas apenas 1 ativo (Rascunho e Pausado não contam como ativos)
    expect(screen.getByText(/3 no total · 1 ativo/)).toBeInTheDocument()

    // Clica em voltar e confere retorno ao catálogo
    await usuario.click(linkVoltar)
    expect(await screen.findByRole('region', { name: 'Catálogo de sinais' })).toBeInTheDocument()
  })

  it('configura um Monitoramento de vagas, seleciona lista importada e salva como Rascunho', async () => {
    const { usuario } = renderizarApp('/sinais/tipos/abertura-de-vagas')

    // Clica em Novo monitoramento
    await usuario.click(await screen.findByRole('link', { name: 'Novo monitoramento' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Novo monitoramento' })).toBeInTheDocument()

    // Preenche nome
    const campoNome = screen.getByRole('textbox', { name: 'Nome do monitoramento' })
    await usuario.type(campoNome, 'Lideranças de Engenharia em SP')

    // Critérios de vagas: cargos ou funções
    const grupoCargos = screen.getByRole('group', { name: 'Cargos ou funções' })
    await usuario.click(within(grupoCargos).getByRole('checkbox', { name: 'Engenharia de dados' }))
    await usuario.click(within(grupoCargos).getByRole('checkbox', { name: 'IA e machine learning' }))

    // Localização
    const grupoLocalizacao = screen.getByRole('group', { name: 'Localização' })
    await usuario.click(within(grupoLocalizacao).getByRole('checkbox', { name: 'Brasil' }))

    // Período
    const grupoPeriodo = screen.getByRole('radiogroup', { name: 'Período observado' })
    await usuario.click(within(grupoPeriodo).getByRole('radio', { name: 'Últimos 14 dias' }))

    // Palavras opcionais
    const campoPalavras = screen.getByRole('textbox', { name: 'Palavras na descrição da vaga' })
    await usuario.type(campoPalavras, 'lakehouse')

    // Público: verifica que o público recomendado das configurações simuladas é ofertado
    expect(screen.getByRole('complementary', { name: 'Público recomendado' })).toHaveTextContent(
      'ICP Enterprise dados e IA',
    )

    // Seleciona a lista de Contas-alvo importadas
    const secaoPublico = screen.getByRole('region', { name: 'Público' })
    const grupoListas = within(secaoPublico).getByRole('group', { name: 'Listas de Contas-alvo' })
    await usuario.click(within(grupoListas).getByRole('checkbox', { name: /Enterprise LATAM/ }))

    // Salvar Rascunho
    const botaoSalvarRascunho = screen.getByRole('button', { name: 'Salvar rascunho' })
    await usuario.click(botaoSalvarRascunho)

    // Volta à página do tipo com confirmação
    expect(await screen.findByRole('heading', { level: 1, name: 'Abertura de vagas' })).toBeInTheDocument()
    expect(
      screen.getByText('Rascunho “Lideranças de Engenharia em SP” salvo.'),
    ).toBeInTheDocument()

    // O novo monitoramento aparece na lista com badge Rascunho
    const lista = screen.getByRole('list', { name: 'Monitoramentos deste tipo' })
    const itemNovo = within(lista).getByRole('listitem', { name: 'Lideranças de Engenharia em SP' })
    expect(itemNovo).toHaveTextContent('Rascunho')

    // O total aumentou para 4, mas o número de ativos continua 1 (rascunhos não contam como ativos)
    expect(screen.getByText(/4 no total · 1 ativo/)).toBeInTheDocument()
  })

  it('preserva o Rascunho ao navegar para fora para outros módulos (Contas) e voltar na mesma sessão', async () => {
    const { usuario } = renderizarApp('/sinais/tipos/abertura-de-vagas')

    // 1. Criar e salvar um Rascunho
    await usuario.click(await screen.findByRole('link', { name: 'Novo monitoramento' }))
    await usuario.type(
      await screen.findByRole('textbox', { name: 'Nome do monitoramento' }),
      'Rascunho Persistente na Sessão',
    )
    const grupoCargos = screen.getByRole('group', { name: 'Cargos ou funções' })
    await usuario.click(within(grupoCargos).getByRole('checkbox', { name: 'Engenharia de dados' }))

    const campoPalavras = screen.getByRole('textbox', { name: 'Palavras na descrição da vaga' })
    await usuario.type(campoPalavras, 'data mesh')

    await usuario.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Abertura de vagas' })).toBeInTheDocument()

    // 2. Navegar para fora: clicar em "Contas e Contatos" na barra de navegação global
    const nav = screen.getByRole('navigation', { name: 'Workspace' })
    await usuario.click(within(nav).getByRole('link', { name: 'Contas e Contatos' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Contas' })).toBeInTheDocument()

    // 3. Navegar de volta para Sinais
    await usuario.click(within(nav).getByRole('link', { name: 'Sinais' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Sinais' })).toBeInTheDocument()

    // 4. Abrir Abertura de vagas
    await usuario.click(await screen.findByRole('link', { name: /Abertura de vagas/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Abertura de vagas' })).toBeInTheDocument()

    // 5. O rascunho continua presente
    const lista = screen.getByRole('list', { name: 'Monitoramentos deste tipo' })
    const itemRascunho = within(lista).getByRole('listitem', { name: 'Rascunho Persistente na Sessão' })
    expect(itemRascunho).toHaveTextContent('Rascunho')

    // 6. Clica no rascunho para reabri-lo
    await usuario.click(within(itemRascunho).getByRole('link', { name: 'Rascunho Persistente na Sessão' }))

    // 7. O editor abre com o nome e os critérios preservados
    expect(await screen.findByRole('heading', { level: 1, name: 'Rascunho Persistente na Sessão' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Nome do monitoramento' })).toHaveValue(
      'Rascunho Persistente na Sessão',
    )
    expect(screen.getByRole('textbox', { name: 'Palavras na descrição da vaga' })).toHaveValue('data mesh')
  })

  it('exibe estado de vazio quando não há monitoramentos configurados e permite criar o primeiro', async () => {
    const { usuario } = renderizarApp('/sinais/tipos/abertura-de-vagas', {}, {}, {}, { vazia: true })

    expect(await screen.findByRole('heading', { level: 1, name: 'Abertura de vagas' })).toBeInTheDocument()
    expect(screen.getByText('0 no total · 0 ativos')).toBeInTheDocument()
    expect(screen.getByText('Nenhum Monitoramento deste tipo ainda.')).toBeInTheDocument()

    const botaoCriar = screen.getByRole('link', { name: 'Criar o primeiro' })
    expect(botaoCriar).toBeInTheDocument()

    await usuario.click(botaoCriar)
    expect(await screen.findByRole('heading', { level: 1, name: 'Novo monitoramento' })).toBeInTheDocument()
  })

  it('oferece recuperação de falha com botão "Tentar de novo"', async () => {
    const { usuario, fonteDeSinais } = renderizarApp(
      '/sinais/tipos/abertura-de-vagas',
      {},
      {},
      {},
      { falha: true },
    )

    // Estado de falha
    expect(
      await screen.findByText('Não foi possível carregar os monitoramentos.'),
    ).toBeInTheDocument()
    const botaoTentar = screen.getByRole('button', { name: 'Tentar de novo' })
    expect(botaoTentar).toBeInTheDocument()

    // Recuperação: fonte deixa de falhar e usuário clica em tentar de novo
    fonteDeSinais.definirFalha(false)
    await usuario.click(botaoTentar)

    // Monitoramentos carregam com sucesso
    expect(
      await screen.findByRole('list', { name: 'Monitoramentos deste tipo' }),
    ).toBeInTheDocument()
  })
})

import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderizarApp } from '@/test/renderizar'

describe('Mockup do módulo Sinais', () => {
  it('o item Sinais da navegação abre o catálogo, sem tirar Contas, Sequências e Agentes do lugar', async () => {
    const { usuario } = renderizarApp('/')

    const nav = screen.getByRole('navigation', { name: 'Workspace' })
    const links = within(nav).getAllByRole('link')
    expect(links.slice(0, 3).map((l) => l.textContent)).toEqual(['Contas e Contatos', 'Sequências', 'Agentes'])

    await usuario.click(within(nav).getByRole('link', { name: 'Sinais' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Sinais' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Sinais' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('region', { name: 'Catálogo de sinais' })).toBeInTheDocument()
  })

  it('busca e filtra o catálogo por origem e oferece continuidade quando nada corresponde', async () => {
    const { usuario } = renderizarApp('/sinais')
    const catalogo = await screen.findByRole('region', { name: 'Catálogo de sinais' })

    // As doze famílias aparecem, das três origens.
    for (const familia of [
      'Vagas e equipes',
      'Movimentação profissional',
      'Capital e finanças',
      'Expansão e registros',
      'Tecnologia',
      'Notícias e iniciativas',
      'Eventos e conteúdo',
      'Reputação e concorrência',
      'Comunidades e intenção',
      'Comportamento no site',
      'Histórico comercial',
      'Testes e verificações',
    ]) {
      expect(within(catalogo).getByRole('heading', { level: 2, name: new RegExp(`^${familia}`) })).toBeInTheDocument()
    }

    await usuario.click(screen.getByRole('button', { name: /Internos/ }))
    expect(screen.getByRole('link', { name: /Proposta recusada/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Abertura de vagas/ })).not.toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: /Todos/ }))
    const busca = screen.getByRole('searchbox', { name: 'Buscar tipos de sinal' })
    await usuario.type(busca, 'rodadas')
    expect(screen.getByRole('link', { name: /Rodadas de investimento/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Proposta recusada/ })).not.toBeInTheDocument()

    await usuario.clear(busca)
    await usuario.type(busca, 'xyzabc')
    expect(screen.getByText('Nenhum tipo de sinal corresponde a “xyzabc”.')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Limpar busca' }))
    expect(await screen.findByRole('region', { name: 'Catálogo de sinais' })).toBeInTheDocument()
  })

  it('abre um card numa página própria com os Monitoramentos do tipo e volta ao catálogo', async () => {
    const { usuario } = renderizarApp('/sinais')
    await usuario.click(await screen.findByRole('link', { name: /Abertura de vagas.*1 ativo/ }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Abertura de vagas' })).toBeInTheDocument()
    const lista = screen.getByRole('list', { name: 'Monitoramentos deste tipo' })
    expect(within(lista).getByRole('listitem', { name: 'Vagas de engenharia de dados' })).toHaveTextContent('Ativo')
    expect(within(lista).getByRole('listitem', { name: 'Vagas de IA no México' })).toHaveTextContent('Pausado')
    expect(within(lista).getByRole('listitem', { name: 'Vagas de finanças em fintechs' })).toHaveTextContent('Rascunho')

    await usuario.click(within(screen.getByRole('main')).getByRole('link', { name: 'Sinais' }))
    expect(await screen.findByRole('region', { name: 'Catálogo de sinais' })).toBeInTheDocument()
  })

  it('cria um segundo Monitoramento do mesmo tipo: rascunho, revisão, ativação, pausa e retomada', async () => {
    const { usuario } = renderizarApp('/sinais/tipos/rodadas')
    await usuario.click(await screen.findByRole('link', { name: 'Novo monitoramento' }))

    expect(screen.getByRole('button', { name: 'Revisar e ativar' })).toBeDisabled()
    await usuario.type(screen.getByRole('textbox', { name: 'Nome do monitoramento' }), 'Fusões no México')
    const acontecimentos = screen.getByRole('group', { name: 'Acontecimentos' })
    await usuario.click(within(acontecimentos).getByRole('checkbox', { name: 'Fusão ou aquisição' }))
    expect(screen.getByRole('complementary', { name: 'Público recomendado' })).toHaveTextContent('ICP Enterprise dados e IA')
    await usuario.click(screen.getByRole('radio', { name: 'Descobrir por perfil' }))

    await usuario.click(screen.getByRole('button', { name: 'Revisar e ativar' }))
    const revisao = screen.getByRole('region', { name: 'Revisão antes de ativar' })
    expect(revisao).toHaveTextContent('Rodada, Fusão ou aquisição')
    expect(revisao).toHaveTextContent('Descoberta por ICP Enterprise dados e IA')
    await usuario.click(within(revisao).getByRole('button', { name: 'Ativar monitoramento' }))

    const lista = await screen.findByRole('list', { name: 'Monitoramentos deste tipo' })
    const novo = within(lista).getByRole('listitem', { name: 'Fusões no México' })
    expect(novo).toHaveTextContent('Ativo')
    // O outro Monitoramento do mesmo tipo continua com os próprios critérios.
    expect(within(lista).getByRole('listitem', { name: 'Rodadas a partir de US$ 50 mi' })).toHaveTextContent('US$ 50 mi ou mais')

    await usuario.click(within(novo).getByRole('button', { name: 'Pausar' }))
    expect(novo).toHaveTextContent('Pausado')
    await usuario.click(within(novo).getByRole('button', { name: 'Retomar' }))
    expect(novo).toHaveTextContent('Ativo')

    await usuario.click(within(screen.getByRole('main')).getByRole('link', { name: 'Sinais' }))
    expect(await screen.findByRole('link', { name: /Rodadas de investimento.*2 ativos/ })).toBeInTheDocument()
  })

  it('tipos que compartilham um formulário abrem com os valores do próprio tipo', async () => {
    renderizarApp('/sinais/tipos/proposta-recusada/novo')
    expect(await screen.findByRole('radio', { name: 'Proposta recusada' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('spinbutton', { name: 'Há pelo menos' })).toHaveValue(90)
    // O histórico comercial só acompanha listas: a descoberta não é oferecida.
    expect(screen.queryByRole('radio', { name: 'Descobrir por perfil' })).not.toBeInTheDocument()
  })

  it('no público personalizado, a descoberta usa o perfil firmográfico escolhido nos dropdowns', async () => {
    const { usuario } = renderizarApp('/sinais/tipos/rodadas/novo')
    await usuario.type(await screen.findByRole('textbox', { name: 'Nome do monitoramento' }), 'Rodadas em SP')
    await usuario.click(screen.getByRole('radio', { name: 'Público personalizado' }))

    const perfil = screen.getByRole('group', { name: 'Perfil firmográfico' })
    await usuario.selectOptions(within(perfil).getByRole('combobox', { name: 'País' }), 'Brasil')
    await usuario.selectOptions(within(perfil).getByRole('combobox', { name: 'UF' }), 'SP')
    await usuario.selectOptions(within(perfil).getByRole('combobox', { name: 'Funcionários' }), '1.001 a 5.000')
    await usuario.selectOptions(within(perfil).getByRole('combobox', { name: 'Faturamento anual' }), 'R$ 100 a 500 mi')
    await usuario.selectOptions(within(perfil).getByRole('combobox', { name: 'Setor' }), 'Serviços financeiros')

    await usuario.click(screen.getByRole('button', { name: 'Revisar e ativar' }))
    expect(screen.getByRole('region', { name: 'Revisão antes de ativar' })).toHaveTextContent(
      'descoberta por perfil personalizado: Brasil · SP · 1.001 a 5.000 funcionários · R$ 100 a 500 mi · Serviços financeiros',
    )
  })

  it('a UF só vale para empresas no Brasil', async () => {
    const { usuario } = renderizarApp('/sinais/tipos/rodadas/novo')
    await usuario.click(await screen.findByRole('radio', { name: 'Público personalizado' }))
    const perfil = screen.getByRole('group', { name: 'Perfil firmográfico' })
    await usuario.selectOptions(within(perfil).getByRole('combobox', { name: 'País' }), 'México')
    expect(within(perfil).getByRole('combobox', { name: 'UF' })).toBeDisabled()
  })

  it('cria um sinal personalizado por descrição: Em preparação, critérios editáveis e ativação sem API', async () => {
    const { usuario } = renderizarApp('/sinais')
    await usuario.click(await screen.findByRole('link', { name: 'Descrever um sinal' }))

    await usuario.type(screen.getByRole('textbox', { name: 'O que você quer acompanhar?' }), 'Hospitais que anunciam novas alas')
    await usuario.type(screen.getByRole('textbox', { name: /Fonte, se você souber/ }), 'Diário oficial')
    await usuario.click(screen.getByRole('button', { name: 'Preparar critérios' }))

    const preparacao = screen.getByRole('region', { name: 'Em preparação' })
    expect(preparacao).toHaveTextContent('Hospitais que anunciam novas alas')
    await usuario.click(within(preparacao).getByRole('button', { name: 'Ver critérios preparados' }))

    const criterios = screen.getByRole('list', { name: 'Critérios editáveis' })
    const segundo = within(criterios).getByRole('textbox', { name: 'Critério 2' })
    expect(segundo).toHaveValue('Observar em: Diário oficial')
    await usuario.clear(segundo)
    await usuario.type(segundo, 'Observar em: diários oficiais estaduais')

    await usuario.click(screen.getByRole('button', { name: 'Revisar e ativar' }))
    const revisao = screen.getByRole('region', { name: 'Revisão antes de ativar' })
    expect(revisao).toHaveTextContent('Observar em: diários oficiais estaduais')
    await usuario.click(within(revisao).getByRole('button', { name: 'Ativar monitoramento' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Sinais personalizados' })).toBeInTheDocument()
    expect(screen.getByRole('listitem', { name: 'Hospitais que anunciam novas alas' })).toHaveTextContent('Ativo')
    expect(screen.getByRole('listitem', { name: 'Varejistas sem agendamento de entrega' })).toHaveTextContent('Em preparação')
  })

  it('Sinais encontrados leva à Conta-alvo com o foguinho separado da Aderência, e volta', async () => {
    const { usuario } = renderizarApp('/sinais')
    await usuario.click(await screen.findByRole('button', { name: /Sinais encontrados/ }))

    const tabela = screen.getByRole('table', { name: 'Sinais encontrados' })
    expect(within(tabela).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Empresa', 'Sinal', 'Data'])
    await usuario.click(within(tabela).getAllByRole('link', { name: 'Stripe' })[0])

    expect(await screen.findByRole('heading', { level: 1, name: 'Stripe' })).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: 'Quente, 2 sinais válidos' }).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Fit').length).toBeGreaterThan(0)
    expect(screen.getByRole('listitem', { name: 'Abriu 3 vagas de engenharia de dados em São Paulo' })).toHaveTextContent('Último sinal')

    await usuario.click(screen.getByRole('link', { name: 'Sinais encontrados' }))
    // Um Sinal deixa Quente uma Conta-alvo Não fit ou ainda não avaliada, sem mudar a Aderência.
    await usuario.click(within(await screen.findByRole('table', { name: 'Sinais encontrados' })).getAllByRole('link', { name: 'Rappi' })[0])
    expect(screen.getAllByRole('img', { name: 'Quente, 2 sinais válidos' }).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Não fit').length).toBeGreaterThan(0)

    await usuario.click(screen.getByRole('link', { name: 'Sinais encontrados' }))
    await usuario.click(within(await screen.findByRole('table', { name: 'Sinais encontrados' })).getByRole('link', { name: 'BBVA México' }))
    expect(screen.getAllByRole('img', { name: 'Quente, 1 sinal válido' }).length).toBeGreaterThan(0)
    expect(screen.getByText('Aderência não avaliada')).toBeInTheDocument()
  })

  it('a Conta-alvo sem Sinais válidos perde o foguinho e mantém o histórico', async () => {
    renderizarApp('/sinais/contas/zendesk')
    expect(await screen.findByRole('heading', { level: 1, name: 'Zendesk' })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /Quente/ })).not.toBeInTheDocument()
    expect(screen.getByRole('listitem', { name: 'Negociação parada há 30 dias' })).toHaveTextContent('Expirado')
  })

  it('representa falha recuperável e ausência de resultados pelo estado do mockup', async () => {
    const { usuario } = renderizarApp('/sinais')
    const estado = await screen.findByRole('combobox', { name: 'Estado do mockup' })

    await usuario.selectOptions(estado, 'Falha recuperável')
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar o catálogo de sinais.')
    await usuario.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('region', { name: 'Catálogo de sinais' })).toBeInTheDocument()

    await usuario.selectOptions(estado, 'Sem Sinais encontrados')
    await usuario.click(screen.getByRole('button', { name: /Sinais encontrados/ }))
    expect(screen.getByText('Nenhum Sinal encontrado ainda.')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Voltar ao catálogo' }))
    expect(await screen.findByRole('region', { name: 'Catálogo de sinais' })).toBeInTheDocument()
  })
})

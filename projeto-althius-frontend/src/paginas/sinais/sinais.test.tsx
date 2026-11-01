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
    // O seletor de estados ilustrativos do mockup saiu depois da aprovação.
    expect(screen.queryByRole('combobox', { name: 'Estado do mockup' })).not.toBeInTheDocument()
  })

  it('busca e filtra o catálogo por família e oferece continuidade quando nada corresponde', async () => {
    const { usuario } = renderizarApp('/sinais')
    await screen.findByRole('region', { name: 'Catálogo de sinais' })

    const familias = screen.getByRole('group', { name: 'Filtrar por família' })
    for (const familia of ['Vagas e equipes', 'Movimentação profissional', 'Histórico comercial']) {
      expect(within(familias).getByRole('button', { name: familia })).toBeInTheDocument()
    }

    await usuario.click(within(familias).getByRole('button', { name: 'Histórico comercial' }))
    expect(screen.getByRole('link', { name: /Proposta recusada/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Abertura de vagas/ })).not.toBeInTheDocument()

    await usuario.click(within(familias).getByRole('button', { name: 'Todas' }))
    const busca = screen.getByRole('searchbox', { name: 'Buscar tipos de sinal' })
    await usuario.type(busca, 'abertura')
    expect(screen.getByRole('link', { name: /Abertura de vagas/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Proposta recusada/ })).not.toBeInTheDocument()

    await usuario.clear(busca)
    await usuario.type(busca, 'xyzabc')
    expect(screen.getByText('Nenhum tipo de sinal corresponde a “xyzabc”.')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Pedir um Sinal' })).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Limpar busca' }))
    expect(await screen.findByRole('region', { name: 'Catálogo de sinais' })).toBeInTheDocument()
  })

  it('abre um card numa página própria com os Monitoramentos do tipo e volta ao catálogo', async () => {
    const { usuario } = renderizarApp('/sinais')
    await usuario.click(await within(await screen.findByRole('region', { name: 'Catálogo de sinais' })).findByRole('link', { name: /Abertura de vagas.*1 ativo/ }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Abertura de vagas' })).toBeInTheDocument()
    const lista = screen.getByRole('list', { name: 'Monitoramentos deste tipo' })
    expect(within(lista).getByRole('listitem', { name: 'Vagas de engenharia de dados' })).toHaveTextContent('Ativo')
    expect(within(lista).getByRole('listitem', { name: 'Vagas de IA no México' })).toHaveTextContent('Pausado')
    expect(within(lista).getByRole('listitem', { name: 'Vagas de finanças em fintechs' })).toHaveTextContent('Rascunho')

    await usuario.click(within(screen.getByRole('main')).getByRole('link', { name: 'Sinais' }))
    expect(await screen.findByRole('region', { name: 'Catálogo de sinais' })).toBeInTheDocument()
  })

  it('cria um segundo Monitoramento do mesmo tipo: rascunho, revisão, ativação, pausa e retomada', async () => {
    const { usuario } = renderizarApp('/sinais/tipos/financiamento-bndes-finep')
    await usuario.click(await screen.findByRole('link', { name: 'Ativar Monitoramento' }))

    expect(screen.getByRole('button', { name: 'Revisar e ativar' })).toBeDisabled()
    await usuario.type(screen.getByRole('textbox', { name: 'Nome do monitoramento' }), 'Fusões no México')
    const acontecimentos = screen.getByRole('group', { name: 'Acontecimentos' })
    await usuario.click(within(acontecimentos).getByRole('checkbox', { name: 'Fusão ou aquisição' }))
    expect(screen.getByRole('complementary', { name: 'Público recomendado' })).toHaveTextContent('ICP do Workspace')
    await usuario.click(screen.getByRole('radio', { name: 'Descobrir por perfil' }))

    await usuario.click(screen.getByRole('button', { name: 'Revisar e ativar' }))
    const revisao = screen.getByRole('region', { name: 'Revisão antes de ativar' })
    expect(revisao).toHaveTextContent('Fusão ou aquisição')
    expect(revisao).toHaveTextContent('Descoberta pelo ICP do Workspace')
    await usuario.click(within(revisao).getByRole('button', { name: 'Ativar monitoramento' }))

    const lista = await screen.findByRole('list', { name: 'Monitoramentos deste tipo' })
    const novo = within(lista).getByRole('listitem', { name: 'Fusões no México' })
    expect(novo).toHaveTextContent('Ativo')

    await usuario.click(within(novo).getByRole('button', { name: 'Pausar' }))
    expect(novo).toHaveTextContent('Pausado')
    await usuario.click(within(novo).getByRole('button', { name: 'Retomar' }))
    expect(novo).toHaveTextContent('Ativo')

    await usuario.click(within(screen.getByRole('main')).getByRole('link', { name: 'Sinais' }))
    expect(await within(await screen.findByRole('region', { name: 'Catálogo de sinais' })).findByRole('link', { name: /Financiamento BNDES\/Finep.*1 ativo/ })).toBeInTheDocument()
  })

  it('tipos que compartilham um formulário abrem com os valores do próprio tipo', async () => {
    renderizarApp('/sinais/tipos/proposta-recusada/novo')
    expect(await screen.findByRole('radio', { name: 'Proposta recusada' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('spinbutton', { name: 'Há pelo menos' })).toHaveValue(90)
    // O histórico comercial só acompanha listas: a descoberta não é oferecida.
    expect(screen.queryByRole('radio', { name: 'Descobrir por perfil' })).not.toBeInTheDocument()
  })

  it('no público personalizado, o perfil combina várias UFs e cidades, faixas de porte, tempo de empresa e CNAE', async () => {
    const { usuario } = renderizarApp('/sinais/tipos/financiamento-bndes-finep/novo')
    await usuario.type(await screen.findByRole('textbox', { name: 'Nome do monitoramento' }), 'Rodadas no Sudeste')
    await usuario.click(screen.getByRole('radio', { name: 'Público personalizado' }))
    const perfil = screen.getByRole('group', { name: 'Perfil firmográfico' })

    await usuario.selectOptions(within(perfil).getByRole('combobox', { name: 'País' }), 'Brasil')
    for (const uf of ['SP', 'RJ']) {
      await usuario.type(await within(perfil).findByRole('combobox', { name: 'UFs' }), uf)
      await usuario.click(within(perfil).getByRole('option', { name: new RegExp(`^${uf} `) }))
    }
    await usuario.type(within(perfil).getByRole('combobox', { name: 'Cidades' }), 'Campinas')
    await usuario.click(within(perfil).getByRole('option', { name: /^Campinas \(SP\)/ }))
    expect(within(perfil).getByRole('button', { name: 'Remover Campinas (SP)' })).toBeInTheDocument()

    await usuario.selectOptions(within(perfil).getByRole('combobox', { name: 'Funcionários, mínimo' }), '11')
    await usuario.selectOptions(within(perfil).getByRole('combobox', { name: 'Funcionários, máximo' }), '50')
    await usuario.selectOptions(within(perfil).getByRole('combobox', { name: 'Faturamento anual, mínimo' }), '360000')
    await usuario.selectOptions(within(perfil).getByRole('combobox', { name: 'Faturamento anual, máximo' }), '4800000')
    await usuario.selectOptions(within(perfil).getByRole('combobox', { name: 'Tempo de empresa, mínimo' }), '2')
    await usuario.selectOptions(within(perfil).getByRole('combobox', { name: 'Tempo de empresa, máximo' }), '5')

    // CNAE pelos cinco níveis, cada um filtrado pelo anterior.
    await usuario.selectOptions(within(perfil).getByRole('combobox', { name: 'Seção' }), 'J')
    await usuario.selectOptions(within(perfil).getByRole('combobox', { name: 'Divisão' }), '62')
    await usuario.selectOptions(within(perfil).getByRole('combobox', { name: 'Grupo' }), '62.0')
    await usuario.selectOptions(within(perfil).getByRole('combobox', { name: 'Classe' }), '62.01-5')
    await usuario.selectOptions(within(perfil).getByRole('combobox', { name: 'Subclasse' }), '6201-5/01')
    await usuario.click(within(perfil).getByRole('button', { name: 'Adicionar CNAE' }))
    // Ou por busca, em qualquer nível.
    await usuario.type(within(perfil).getByRole('combobox', { name: 'CNAEs' }), '6311-9/00')
    await usuario.click(within(perfil).getByRole('option', { name: /^6311-9\/00/ }))
    await usuario.click(within(perfil).getByRole('radio', { name: 'Principal ou secundário' }))

    await usuario.click(screen.getByRole('button', { name: 'Revisar e ativar' }))
    expect(screen.getByRole('region', { name: 'Revisão antes de ativar' })).toHaveTextContent(
      'descoberta por perfil personalizado: Brasil · SP, RJ · Campinas (SP) · 11 a 50 funcionários · faturamento R$ 360 mil a R$ 4,8 mi · 2 a 5 anos de empresa · CNAE 6201-5/01, 6311-9/00 (principal ou secundário)',
    )
  })

  it('fora do Brasil, a localização é só por estado', async () => {
    const { usuario } = renderizarApp('/sinais/tipos/financiamento-bndes-finep/novo')
    await usuario.click(await screen.findByRole('radio', { name: 'Público personalizado' }))
    const perfil = screen.getByRole('group', { name: 'Perfil firmográfico' })
    await usuario.selectOptions(within(perfil).getByRole('combobox', { name: 'País' }), 'México')

    expect(within(perfil).queryByRole('combobox', { name: 'UFs' })).not.toBeInTheDocument()
    expect(within(perfil).queryByRole('combobox', { name: 'Cidades' })).not.toBeInTheDocument()
    await usuario.type(within(perfil).getByRole('combobox', { name: 'Estados' }), 'Nuevo')
    await usuario.click(within(perfil).getByRole('option', { name: 'Nuevo León' }))
    expect(within(perfil).getByRole('button', { name: 'Remover Nuevo León' })).toBeInTheDocument()
  })

  it('o pedido à equipe substitui o construtor de sinal personalizado', async () => {
    const { usuario } = renderizarApp('/sinais')
    await usuario.click(await screen.findByRole('link', { name: 'Falar com a equipe Althius' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Falar com a equipe Althius' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Novo sinal personalizado' })).not.toBeInTheDocument()
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
})

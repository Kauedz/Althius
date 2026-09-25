import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DATA_HOJE_TESTES, renderizarApp } from '@/test/renderizar'

describe('Ticket 09: Consultar Sinais encontrados', () => {
  it('conecta o acesso discreto Sinais encontrados à lista simples na página principal, alternando com o catálogo e permitindo retorno explícito sem dashboards ou gráficos', async () => {
    const { usuario } = renderizarApp('/sinais')

    // 1. Está no catálogo principal
    expect(await screen.findByRole('region', { name: 'Catálogo de sinais' })).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Sinais encontrados' })).not.toBeInTheDocument()

    // 2. Acesso discreto com contagem
    const botaoEncontrados = screen.getByRole('button', { name: /Sinais encontrados/ })
    expect(botaoEncontrados).toBeInTheDocument()
    await usuario.click(botaoEncontrados)

    // 3. Exibe a lista simples (tabela com Empresa, Sinal, Data)
    const tabela = await screen.findByRole('table', { name: 'Sinais encontrados' })
    expect(within(tabela).getAllByRole('columnheader').map((c) => c.textContent)).toEqual([
      'Empresa',
      'Sinal',
      'Data',
    ])

    // Não cria dashboard, gráficos nem visualizações analíticas extensas
    expect(screen.queryByRole('region', { name: /dashboard|gráficos|analytics/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /gráfico|chart/i })).not.toBeInTheDocument()

    // 4. Retorno explícito ao catálogo
    const botaoVoltar = screen.getByRole('button', { name: 'Voltar ao catálogo' })
    await usuario.click(botaoVoltar)

    expect(await screen.findByRole('region', { name: 'Catálogo de sinais' })).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Sinais encontrados' })).not.toBeInTheDocument()
  })

  it('oferece carregamento, falha recuperável e ausência de resultados com ação clara para continuar no catálogo', async () => {
    // 1. Ausência de resultados
    const { usuario, fonteDeSinais } = renderizarApp('/sinais?vista=encontrados', {}, {}, {}, { vazia: true })

    expect(await screen.findByText('Nenhum Sinal encontrado ainda.')).toBeInTheDocument()
    expect(
      screen.getByText(/Os Monitoramentos ativos procuram novos acontecimentos; os disparos aparecem aqui/),
    ).toBeInTheDocument()

    // Ação clara para continuar no catálogo
    const botaoConfigurar = screen.getByRole('button', { name: 'Configurar Monitoramentos' })
    await usuario.click(botaoConfigurar)
    expect(await screen.findByRole('region', { name: 'Catálogo de sinais' })).toBeInTheDocument()

    // 2. Falha recuperável
    await usuario.click(screen.getByRole('button', { name: /Sinais encontrados/ }))
    expect(await screen.findByText('Nenhum Sinal encontrado ainda.')).toBeInTheDocument()

    // Simula falha transitória
    fonteDeSinais.definirFalha(true)
    // Força recarregar disparando notificação
    fonteDeSinais.definirHoje(DATA_HOJE_TESTES)

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Não foi possível carregar os sinais encontrados.')
    expect(within(alerta).getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
    expect(within(alerta).getByRole('button', { name: 'Voltar ao catálogo' })).toBeInTheDocument()

    // Corrige a falha e tenta de novo
    fonteDeSinais.definirFalha(false)
    fonteDeSinais.definirVazia(false)
    await usuario.click(within(alerta).getByRole('button', { name: 'Tentar de novo' }))

    // Lista carregada com sucesso
    expect(await screen.findByRole('table', { name: 'Sinais encontrados' })).toBeInTheDocument()
  })

  it('abre a Conta-alvo a partir de um resultado: Último sinal, histórico consistente, fonte e evidência simulada', async () => {
    const { usuario } = renderizarApp('/sinais?vista=encontrados')

    const tabela = await screen.findByRole('table', { name: 'Sinais encontrados' })

    // Abre a Conta-alvo 'Stripe'
    const linkStripe = within(tabela).getAllByRole('link', { name: 'Stripe' })[0]
    await usuario.click(linkStripe)

    // Página da Conta-alvo
    expect(await screen.findByRole('heading', { level: 1, name: 'Stripe' })).toBeInTheDocument()

    // Exibe evidência e fonte simulada no histórico
    const historico = screen.getByRole('list', { name: 'Histórico de sinais' })
    const itemMaisRecente = within(historico).getByRole('listitem', {
      name: 'Abriu 3 vagas de engenharia de dados em São Paulo',
    })
    expect(itemMaisRecente).toHaveTextContent('Último sinal')
    expect(itemMaisRecente).toHaveTextContent('Válido até')
    expect(itemMaisRecente).toHaveTextContent('Página de carreiras (simulada)')
    expect(itemMaisRecente).toHaveTextContent(
      '“Buscamos Data Engineer para migrar nosso data warehouse para uma arquitetura lakehouse.”',
    )

    // O sinal mais antigo na Conta-alvo corresponde à respectiva entrada do histórico
    const itemAntigo = within(historico).getByRole('listitem', {
      name: 'Abriu a primeira vaga de liderança de RevOps na América Latina',
    })
    expect(itemAntigo).toBeInTheDocument()
    expect(within(itemAntigo).queryByText('Último sinal')).not.toBeInTheDocument()

    // A tabela "Como aparece na lista de Contas" reflete o Último sinal idêntico
    const linhaComoAparece = screen.getByRole('row', {
      name: /Stripe.*Quente, 2 sinais válidos.*Fit.*Abriu 3 vagas de engenharia de dados em São Paulo/,
    })
    expect(linhaComoAparece).toBeInTheDocument()

    // Atalho para ver a Conta-alvo no módulo Contas do CRM
    const linkVerEmContas = screen.getByRole('link', { name: 'Ver em Contas' })
    expect(linkVerEmContas).toHaveAttribute('href', '/contas/stripe')

    // Volta para Sinais encontrados pelo retorno explícito
    await usuario.click(screen.getByRole('link', { name: 'Sinais encontrados' }))
    expect(await screen.findByRole('table', { name: 'Sinais encontrados' })).toBeInTheDocument()
  })

  it('mantém descrições e datas consistentes após novos disparos, duplicatas e pausa de Monitoramentos', async () => {
    const { usuario, fonteDeSinais } = renderizarApp('/sinais?vista=encontrados')

    expect(await screen.findByRole('table', { name: 'Sinais encontrados' })).toBeInTheDocument()

    // 1. Produz novo disparo simulado para a Stripe
    const dataNovoDisparo = '2026-09-23'
    await fonteDeSinais.simularDisparo({
      id: 'disparo-novo-latam',
      monitoramentoId: 'vagas-engenharia-de-dados',
      contaId: 'stripe',
      frase: 'Contratando 5 engenheiros de dados sênior no Brasil',
      evidencia: '“Nova equipe de dados para atender clientes corporativos na América Latina.” (simulada)',
      fonte: 'LinkedIn Jobs (simulado)',
      data: dataNovoDisparo,
    })

    // O novo disparo aparece no topo dos resultados globais
    expect(
      await screen.findByText('Contratando 5 engenheiros de dados sênior no Brasil'),
    ).toBeInTheDocument()

    // Abre a Conta-alvo Stripe
    const tabelaAtualizada = screen.getByRole('table', { name: 'Sinais encontrados' })
    await usuario.click(within(tabelaAtualizada).getAllByRole('link', { name: 'Stripe' })[0])
    expect(await screen.findByRole('heading', { level: 1, name: 'Stripe' })).toBeInTheDocument()

    // O novo sinal tornou-se o Último sinal tanto na tabela de Contas quanto no histórico
    const historicoAtualizado = await screen.findByRole('list', { name: 'Histórico de sinais' })
    const novoItem = within(historicoAtualizado).getByRole('listitem', {
      name: 'Contratando 5 engenheiros de dados sênior no Brasil',
    })
    expect(novoItem).toHaveTextContent('Último sinal')
    expect(novoItem).toHaveTextContent('LinkedIn Jobs (simulado)')
    expect(novoItem).toHaveTextContent(
      '“Nova equipe de dados para atender clientes corporativos na América Latina.” (simulada)',
    )

    // Agora são 3 sinais válidos
    expect(screen.getAllByRole('img', { name: 'Quente, 3 sinais válidos' }).length).toBeGreaterThan(0)

    // 2. Reencontra o mesmo acontecimento (duplicata de acontecimento)
    await fonteDeSinais.simularDisparo({
      id: 'disparo-repetido-latam',
      acontecimentoId: 'disparo-novo-latam',
      monitoramentoId: 'vagas-engenharia-de-dados',
      contaId: 'stripe',
      frase: 'Contratando 5 engenheiros de dados sênior no Brasil (coleta repetida)',
      data: '2026-09-23',
    })

    // Não aumenta a contagem de sinais válidos (permanece 3)
    expect(screen.getAllByRole('img', { name: 'Quente, 3 sinais válidos' }).length).toBeGreaterThan(0)
    // Mantém a data de disparo original e exibe a nota de reencontro
    expect(
      await within(novoItem).findByText(/é o mesmo acontecimento, então não conta de novo nem renova a validade/),
    ).toBeInTheDocument()

    // 3. Pausar o Monitoramento preserva os sinais existentes e suas validades
    await fonteDeSinais.mudarEstado('vagas-engenharia-de-dados', 'pausado')
    // Sinais existentes e histórico continuam íntegros e consistentes
    expect(screen.getAllByRole('img', { name: 'Quente, 3 sinais válidos' }).length).toBeGreaterThan(0)
    expect(novoItem).toBeInTheDocument()
  })

  it('sinais expirados permanecem nos resultados e no histórico sem contar no foguinho; datas futuras não aparecem como já disparadas', async () => {
    const { usuario, fonteDeSinais } = renderizarApp('/sinais?vista=encontrados')

    // 1. Sinais expirados aparecem na lista de resultados com identificação 'expirado'
    const tabela = await screen.findByRole('table', { name: 'Sinais encontrados' })
    // Zendesk tem sinal disparado em 2026-08-01 (mais de 30 dias atrás em relação a 2026-09-23)
    const linhaZendesk = within(tabela).getByRole('link', { name: 'Zendesk' }).closest('tr')!
    expect(linhaZendesk).toHaveTextContent('Negociação parada há 30 dias')
    expect(linhaZendesk).toHaveTextContent('expirado')

    // 2. Abre a conta Zendesk: histórico preserva o sinal expirado, mas foguinho NÃO é exibido
    await usuario.click(within(linhaZendesk).getByRole('link', { name: 'Zendesk' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Zendesk' })).toBeInTheDocument()

    // Sem foguinho (não está quente)
    expect(screen.queryByRole('img', { name: /Quente/ })).not.toBeInTheDocument()
    expect(screen.getByText(/Sem Sinais válidos: a Conta-alvo não está Quente/)).toBeInTheDocument()

    // Na tabela "Como aparece na lista de Contas", a coluna Quente exibe "—", e Último sinal exibe o sinal expirado
    const tabelaConta = screen.getByRole('table')
    expect(within(tabelaConta).getByRole('cell', { name: '—' })).toBeInTheDocument()
    expect(within(tabelaConta).getByText('Negociação parada há 30 dias')).toBeInTheDocument()

    // No histórico de sinais, a entrada existe com selo 'Expirado'
    const historico = screen.getByRole('list', { name: 'Histórico de sinais' })
    const itemZendesk = within(historico).getByRole('listitem', { name: 'Negociação parada há 30 dias' })
    expect(itemZendesk).toHaveTextContent('Expirado')

    // 3. Datas futuras não aparecem como sinais já disparados
    // Dispara sinal com data futura (amanhã: 2026-09-24)
    await fonteDeSinais.simularDisparo({
      id: 'sinal-data-futura',
      monitoramentoId: 'vagas-engenharia-de-dados',
      contaId: 'stripe',
      frase: 'Vaga agendada para data futura',
      data: '2026-09-25',
    })

    // Volta aos resultados
    await usuario.click(screen.getByRole('link', { name: 'Sinais encontrados' }))
    const tabelaAposFuturo = await screen.findByRole('table', { name: 'Sinais encontrados' })
    // O sinal futuro NÃO aparece nos resultados
    expect(within(tabelaAposFuturo).queryByText('Vaga agendada para data futura')).not.toBeInTheDocument()
  })

  it('demonstra empresas importadas e recomendadas, preservando Fit nas recomendadas e qualquer avaliação original nas importadas', async () => {
    const { usuario } = renderizarApp('/sinais?vista=encontrados')
    const tabela = await screen.findByRole('table', { name: 'Sinais encontrados' })

    // 1. Recomendada: Stripe
    await usuario.click(within(tabela).getAllByRole('link', { name: 'Stripe' })[0])
    expect(await screen.findByRole('heading', { level: 1, name: 'Stripe' })).toBeInTheDocument()
    expect(screen.getByText(/Recomendada pela Althius/)).toBeInTheDocument()
    expect(screen.getAllByText('Fit').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('img', { name: 'Quente, 2 sinais válidos' }).length).toBeGreaterThan(0)

    // 2. Importada Não fit: Rappi (tem sinal válido, fica Quente, mas preserva Aderência Não fit)
    await usuario.click(screen.getByRole('link', { name: 'Sinais encontrados' }))
    const tabelaRappi = await screen.findByRole('table', { name: 'Sinais encontrados' })
    await usuario.click(within(tabelaRappi).getAllByRole('link', { name: 'Rappi' })[0])

    expect(await screen.findByRole('heading', { level: 1, name: 'Rappi' })).toBeInTheDocument()
    expect(screen.getByText(/Importada/)).toBeInTheDocument()
    expect(screen.getAllByText('Não fit').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('img', { name: 'Quente, 2 sinais válidos' }).length).toBeGreaterThan(0)

    // 3. Importada não avaliada: BBVA México (tem sinal válido, fica Quente, mantém Aderência não avaliada)
    await usuario.click(screen.getByRole('link', { name: 'Sinais encontrados' }))
    const tabelaBBVA = await screen.findByRole('table', { name: 'Sinais encontrados' })
    await usuario.click(within(tabelaBBVA).getByRole('link', { name: 'BBVA México' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'BBVA México' })).toBeInTheDocument()
    expect(screen.getByText(/Importada/)).toBeInTheDocument()
    expect(screen.getByText('Aderência não avaliada')).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: 'Quente, 1 sinal válido' }).length).toBeGreaterThan(0)
  })

  it('testa limite de validade de 30 dias: com 2 sinais válidos, 1 expira (cai para 1) e depois o segundo expira (foguinho some)', async () => {
    const { fonteDeContas, fonteDeSinais } = renderizarApp('/sinais/contas/stripe')

    expect(await screen.findByRole('heading', { level: 1, name: 'Stripe' })).toBeInTheDocument()

    // Inicialmente Stripe tem 2 sinais:
    // - s-stripe-vagas (2026-09-18, há 5 dias)
    // - s-stripe-revops (2026-09-10, há 13 dias)
    expect(screen.getAllByRole('img', { name: 'Quente, 2 sinais válidos' }).length).toBeGreaterThan(0)

    // Avança a data para 2026-10-12 (32 dias após s-stripe-revops, mas 24 dias após s-stripe-vagas)
    const dataUmExpirado = new Date(2026, 9, 12, 12, 0, 0)
    fonteDeContas.definirHoje(dataUmExpirado)
    fonteDeSinais.definirHoje(dataUmExpirado)

    // Agora apenas 1 sinal continua válido!
    expect(await screen.findAllByRole('img', { name: 'Quente, 1 sinal válido' })).toHaveLength(2)

    // Avança para 2026-10-20 (32 dias após s-stripe-vagas)
    const dataTodosExpirados = new Date(2026, 9, 20, 12, 0, 0)
    fonteDeContas.definirHoje(dataTodosExpirados)
    fonteDeSinais.definirHoje(dataTodosExpirados)

    // Foguinho desaparece! Histórico permanece com ambos marcados como Expirado
    await waitFor(() => {
      expect(screen.queryByRole('img', { name: /Quente/ })).not.toBeInTheDocument()
    })
    const historico = screen.getByRole('list', { name: 'Histórico de sinais' })
    const itens = within(historico).getAllByRole('listitem')
    expect(itens).toHaveLength(2)
    for (const item of itens) {
      expect(item).toHaveTextContent('Expirado')
    }
  })
})

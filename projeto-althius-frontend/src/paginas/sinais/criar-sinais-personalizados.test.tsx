import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DATA_HOJE_TESTES, renderizarApp } from '@/test/renderizar'

describe('Ticket 08: Criar sinais personalizados', () => {
  it('oferece Criar sinal personalizado em destaque no catálogo e abre página própria com retorno explícito', async () => {
    const { usuario } = renderizarApp('/sinais')

    // Botão de destaque no topo da página
    const botaoCriarTopo = screen.getByRole('link', { name: 'Criar sinal personalizado' })
    expect(botaoCriarTopo).toHaveAttribute('href', '/sinais/tipos/personalizado/novo')

    // Cartão de destaque no corpo do catálogo
    const cartaoDestaque = await screen.findByRole('region', { name: 'Sinal personalizado' })
    expect(within(cartaoDestaque).getByRole('heading', { level: 2, name: 'Não encontrou o que procura?' })).toBeInTheDocument()
    expect(
      within(cartaoDestaque).getByText(/Descreva em linguagem livre o que quer acompanhar e, se souber, onde encontrar/i),
    ).toBeInTheDocument()

    // Botões no destaque: Meus personalizados e Descrever um sinal
    const linkMeusPersonalizados = within(cartaoDestaque).getByRole('link', { name: /Meus personalizados/ })
    expect(linkMeusPersonalizados).toHaveAttribute('href', '/sinais/tipos/personalizado')

    const linkDescrever = within(cartaoDestaque).getByRole('link', { name: 'Descrever um sinal' })
    expect(linkDescrever).toHaveAttribute('href', '/sinais/tipos/personalizado/novo')

    // Acessa Meus personalizados: abre página própria, sem painel lateral
    await usuario.click(linkMeusPersonalizados)
    expect(await screen.findByRole('heading', { level: 1, name: 'Sinais personalizados' })).toBeInTheDocument()
    expect(screen.getByText('Qualquer origem')).toBeInTheDocument()

    // Link de retorno explícito para Sinais
    const linkVoltar = within(screen.getByRole('main')).getByRole('link', { name: 'Sinais' })
    expect(linkVoltar).toBeInTheDocument()
    await usuario.click(linkVoltar)
    expect(await screen.findByRole('heading', { level: 1, name: 'Sinais' })).toBeInTheDocument()

    // Busca sem resultados no catálogo oferece atalho para criar personalizado com o termo buscado
    const busca = screen.getByRole('searchbox', { name: 'Buscar tipos de sinal' })
    await usuario.type(busca, 'termo inexistente xpto')
    expect(screen.getByText(/Nenhum tipo de sinal corresponde a “termo inexistente xpto”/i)).toBeInTheDocument()
    const botaoCriarComBusca = screen.getByRole('button', { name: 'Criar personalizado com essa busca' })
    await usuario.click(botaoCriarComBusca)

    // Abre a página de criação com a descrição pré-preenchida
    expect(await screen.findByRole('heading', { level: 1, name: 'Novo sinal personalizado' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'O que você quer acompanhar?' })).toHaveValue('termo inexistente xpto')
  })

  it('recebe descrição livre, fonte opcional e origem, representando Em preparação por cenários simulados com critérios editáveis', async () => {
    const { usuario } = renderizarApp('/sinais/tipos/personalizado/novo')

    expect(await screen.findByRole('heading', { level: 1, name: 'Novo sinal personalizado' })).toBeInTheDocument()
    expect(screen.getByText('Rascunho')).toBeInTheDocument()

    // Preenche descrição e fonte opcional
    const campoDescricao = screen.getByRole('textbox', { name: 'O que você quer acompanhar?' })
    await usuario.type(campoDescricao, 'Varejistas com mais de 50 lojas que não oferecem agendamento de entrega no site')

    const campoFonte = screen.getByRole('textbox', { name: /Fonte, se você souber/ })
    await usuario.type(campoFonte, 'Sites das empresas e páginas de frete')

    // Seleção de origem (respeitando Externo, Interno e Originado)
    const grupoOrigem = screen.getByRole('radiogroup', { name: 'Origem' })
    expect(within(grupoOrigem).getByRole('radio', { name: 'Externo' })).toBeInTheDocument()
    expect(within(grupoOrigem).getByRole('radio', { name: 'Interno' })).toBeInTheDocument()
    expect(within(grupoOrigem).getByRole('radio', { name: 'Originado' })).toBeInTheDocument()
    expect(within(grupoOrigem).getByRole('radio', { name: 'Não sei' })).toBeInTheDocument()
    await usuario.click(within(grupoOrigem).getByRole('radio', { name: 'Originado' }))

    // Avança para Preparar critérios
    await usuario.click(screen.getByRole('button', { name: 'Preparar critérios' }))

    // Representação de "Em preparação"
    const preparacao = screen.getByRole('region', { name: 'Em preparação' })
    expect(preparacao).toBeInTheDocument()
    expect(preparacao).toHaveTextContent('Varejistas com mais de 50 lojas que não oferecem agendamento de entrega no site')
    expect(preparacao).toHaveTextContent('A Althius está transformando a sua descrição em critérios. Você pode sair e voltar depois.')
    expect(preparacao).toHaveTextContent('simulação: a preparação termina quando você pedir')

    // Permite corrigir a descrição voltando sem perder os dados
    await usuario.click(within(preparacao).getByRole('button', { name: 'Corrigir descrição' }))
    expect(screen.getByRole('textbox', { name: 'O que você quer acompanhar?' })).toHaveValue(
      'Varejistas com mais de 50 lojas que não oferecem agendamento de entrega no site',
    )
    expect(screen.getByRole('textbox', { name: /Fonte, se você souber/ })).toHaveValue('Sites das empresas e páginas de frete')
    expect(within(grupoOrigem).getByRole('radio', { name: 'Originado' })).toHaveAttribute('aria-checked', 'true')

    // Prepara novamente e avança para ver os critérios
    await usuario.click(screen.getByRole('button', { name: 'Preparar critérios' }))
    const preparacaoReaberta = screen.getByRole('region', { name: 'Em preparação' })
    await usuario.click(within(preparacaoReaberta).getByRole('button', { name: 'Ver critérios preparados' }))

    // Critérios preparados estão editáveis por campos de texto
    const listaCriterios = screen.getByRole('list', { name: 'Critérios editáveis' })
    expect(listaCriterios).toBeInTheDocument()

    // Fonte indicada refletida nos critérios
    expect(within(listaCriterios).getByRole('textbox', { name: 'Critério 2' })).toHaveValue(
      'Observar em: Sites das empresas e páginas de frete',
    )

    // Edita um dos critérios preparados
    const campoCrit2 = within(listaCriterios).getByRole('textbox', { name: 'Critério 2' })
    await usuario.clear(campoCrit2)
    await usuario.type(campoCrit2, 'Observar em: fluxo de checkout e política de entregas')

    // Adiciona um novo critério
    await usuario.click(screen.getByRole('button', { name: 'Adicionar critério' }))
    const campoCritNovo = within(listaCriterios).getByRole('textbox', { name: 'Critério 5' })
    await usuario.type(campoCritNovo, 'Notificar se houver opção de retirada em loja como alternativa')

    // Remove o critério 4
    await usuario.click(screen.getByRole('button', { name: 'Remover critério 4' }))
    expect(screen.queryByRole('textbox', { name: 'Critério 5' })).not.toBeInTheDocument()

    // Exibe a origem selecionada
    expect(screen.getByText('Originado')).toBeInTheDocument()
  })

  it('permite acompanhar listas, descoberta e ambos com recomendação simulada, sem código nem API', async () => {
    const { usuario } = renderizarApp('/sinais/tipos/personalizado/novo')

    await usuario.type(screen.getByRole('textbox', { name: 'O que você quer acompanhar?' }), 'Uso público de LLMs em produção')
    await usuario.click(screen.getByRole('button', { name: 'Preparar critérios' }))
    await usuario.click(within(screen.getByRole('region', { name: 'Em preparação' })).getByRole('button', { name: 'Ver critérios preparados' }))

    // Recomendação de público simulada presente em todos os modos
    const blocoRecomendado = screen.getByRole('complementary', { name: 'Público recomendado' })
    expect(blocoRecomendado).toHaveTextContent('ICP do Workspace')
    expect(blocoRecomendado).toHaveTextContent(/Vem do ICP vigente na Memória do Workspace/)

    // Não há nenhum campo de código, API, tokens ou executor
    expect(screen.queryByLabelText(/código/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/api/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/webhook/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/agente executor/i)).not.toBeInTheDocument()

    // 1. Modo Acompanhar listas
    const grupoModo = screen.getByRole('radiogroup', { name: 'Como encontrar as empresas' })
    await usuario.click(within(grupoModo).getByRole('radio', { name: 'Acompanhar listas' }))
    const grupoListas = screen.getByRole('group', { name: 'Listas de Contas-alvo' })
    expect(within(grupoListas).getByRole('checkbox', { name: /Fintechs Brasil/ })).toBeInTheDocument()
    await usuario.click(within(grupoListas).getByRole('checkbox', { name: /Fintechs Brasil/ }))

    // 2. Modo Descobrir por perfil
    await usuario.click(within(grupoModo).getByRole('radio', { name: 'Descobrir por perfil' }))
    const grupoDescoberta = screen.getByRole('radiogroup', { name: 'Perfil da descoberta' })
    expect(within(grupoDescoberta).getByRole('radio', { name: 'Usar o público recomendado' })).toBeChecked()

    // Alterna para perfil personalizado e valida presença dos filtros firmográficos
    await usuario.click(within(grupoDescoberta).getByRole('radio', { name: 'Público personalizado' }))
    expect(screen.getByRole('group', { name: 'Perfil firmográfico' })).toBeInTheDocument()

    // 3. Modo Listas e descoberta (ambos)
    await usuario.click(within(grupoModo).getByRole('radio', { name: 'Listas e descoberta' }))
    expect(screen.getByRole('group', { name: 'Listas de Contas-alvo' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Perfil da descoberta' })).toBeInTheDocument()
  })

  it('ciclo completo de Rascunho, edição, revisão antes de ativar e ativação sem chamadas externas', async () => {
    const { usuario } = renderizarApp('/sinais/tipos/personalizado/novo')

    await usuario.type(screen.getByRole('textbox', { name: 'O que você quer acompanhar?' }), 'Empresas abrindo hubs de dados em Curitiba')
    await usuario.type(screen.getByRole('textbox', { name: /Fonte, se você souber/ }), 'Imprensa regional e registros')
    await usuario.click(within(screen.getByRole('radiogroup', { name: 'Origem' })).getByRole('radio', { name: 'Externo' }))
    await usuario.click(screen.getByRole('button', { name: 'Preparar critérios' }))
    await usuario.click(within(screen.getByRole('region', { name: 'Em preparação' })).getByRole('button', { name: 'Ver critérios preparados' }))

    // Ajusta o nome do monitoramento
    const campoNome = screen.getByRole('textbox', { name: 'Nome do monitoramento' })
    await usuario.clear(campoNome)
    await usuario.type(campoNome, 'Hubs de dados em Curitiba')

    // Salvar como Rascunho
    await usuario.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Sinais personalizados' })).toBeInTheDocument()
    expect(screen.getByText('Rascunho “Hubs de dados em Curitiba” salvo.')).toBeInTheDocument()

    // Aparece na lista como Rascunho
    const lista = screen.getByRole('list', { name: 'Monitoramentos deste tipo' })
    const itemRascunho = within(lista).getByRole('listitem', { name: 'Hubs de dados em Curitiba' })
    expect(itemRascunho).toHaveTextContent('Rascunho')
    expect(itemRascunho).toHaveTextContent('Externo')

    // Reabre para continuar
    await usuario.click(within(itemRascunho).getByRole('link', { name: 'Continuar' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Hubs de dados em Curitiba' })).toBeInTheDocument()

    // Avança para revisão
    await usuario.click(screen.getByRole('button', { name: 'Revisar e ativar' }))
    const revisao = screen.getByRole('region', { name: 'Revisão antes de ativar' })
    expect(revisao).toBeInTheDocument()
    expect(revisao).toHaveTextContent('Hubs de dados em Curitiba')
    expect(revisao).toHaveTextContent('Empresas abrindo hubs de dados em Curitiba')
    expect(revisao).toHaveTextContent('Imprensa regional e registros')
    expect(revisao).toHaveTextContent('Externo')
    expect(revisao).toHaveTextContent('Cada Sinal deixa a Conta-alvo Quente por 30 dias a partir do disparo')

    // Permite voltar à edição
    await usuario.click(within(revisao).getByRole('button', { name: 'Voltar à edição' }))
    expect(screen.getByRole('textbox', { name: 'Nome do monitoramento' })).toHaveValue('Hubs de dados em Curitiba')

    // Avança novamente e ativa
    await usuario.click(screen.getByRole('button', { name: 'Revisar e ativar' }))
    await usuario.click(within(screen.getByRole('region', { name: 'Revisão antes de ativar' })).getByRole('button', { name: 'Ativar monitoramento' }))

    // Retorna ativo para a lista de monitoramentos
    expect(await screen.findByRole('heading', { level: 1, name: 'Sinais personalizados' })).toBeInTheDocument()
    expect(screen.getByText(/“Hubs de dados em Curitiba” está ativo\. Na demonstração, a coleta é simulada\./)).toBeInTheDocument()

    const itemAtivo = within(screen.getByRole('list', { name: 'Monitoramentos deste tipo' })).getByRole('listitem', {
      name: 'Hubs de dados em Curitiba',
    })
    expect(itemAtivo).toHaveTextContent('Ativo')
    expect(within(itemAtivo).getByRole('button', { name: 'Pausar' })).toBeInTheDocument()
  })

  it('permite salvar Em preparação e voltar depois, e continuar monitoramentos em preparação pré-existentes', async () => {
    const { usuario } = renderizarApp('/sinais/tipos/personalizado/novo')

    // Cria e salva em preparação
    await usuario.type(screen.getByRole('textbox', { name: 'O que você quer acompanhar?' }), 'Escolas que adotaram tablets para alunos')
    await usuario.click(screen.getByRole('button', { name: 'Preparar critérios' }))

    const preparacao = screen.getByRole('region', { name: 'Em preparação' })
    await usuario.click(within(preparacao).getByRole('button', { name: 'Salvar e voltar depois' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Sinais personalizados' })).toBeInTheDocument()
    expect(screen.getByText('Sinal personalizado em preparação. Você revisa os critérios antes de ativar.')).toBeInTheDocument()

    const item = within(screen.getByRole('list', { name: 'Monitoramentos deste tipo' })).getByRole('listitem', {
      name: 'Escolas que adotaram tablets para alunos',
    })
    expect(item).toHaveTextContent('Em preparação')

    // Clica em "Acompanhar" no item em preparação pré-existente dos dados mock (Varejistas sem agendamento de entrega)
    const itemPreexistente = within(screen.getByRole('list', { name: 'Monitoramentos deste tipo' })).getByRole('listitem', {
      name: 'Varejistas sem agendamento de entrega',
    })
    expect(itemPreexistente).toHaveTextContent('Em preparação')
    await usuario.click(within(itemPreexistente).getByRole('link', { name: 'Acompanhar' }))

    // Abre diretamente na etapa Em preparação
    expect(await screen.findByRole('region', { name: 'Em preparação' })).toBeInTheDocument()
    expect(screen.getByText(/Varejistas com mais de 50 lojas que não oferecem agendamento de entrega no site/i)).toBeInTheDocument()

    // Conclui preparação e vê critérios gerados
    await usuario.click(screen.getByRole('button', { name: 'Ver critérios preparados' }))
    expect(screen.getByRole('list', { name: 'Critérios editáveis' })).toBeInTheDocument()
  })

  it('trata falhas recuperáveis na criação e preparação sem perder a descrição nem configurações preenchidas', async () => {
    const { usuario, fonteDeSinais } = renderizarApp('/sinais/tipos/personalizado/novo')

    await usuario.type(screen.getByRole('textbox', { name: 'O que você quer acompanhar?' }), 'Clínicas com prontuário eletrônico legado')
    await usuario.type(screen.getByRole('textbox', { name: /Fonte, se você souber/ }), 'Anúncios de vagas de TI médica')
    await usuario.click(screen.getByRole('button', { name: 'Preparar critérios' }))

    // 1. Falha ao clicar em "Salvar e voltar depois" na preparação
    fonteDeSinais.definirFalha(true)
    await usuario.click(screen.getByRole('button', { name: 'Salvar e voltar depois' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar o sinal em preparação.')
    expect(screen.getByText('Clínicas com prontuário eletrônico legado')).toBeInTheDocument()

    fonteDeSinais.definirFalha(false)
    await usuario.click(screen.getByRole('button', { name: 'Ver critérios preparados' }))

    // 2. Falha ao salvar rascunho
    const campoNome = screen.getByRole('textbox', { name: 'Nome do monitoramento' })
    await usuario.clear(campoNome)
    await usuario.type(campoNome, 'Clínicas com TI legada')

    fonteDeSinais.definirFalha(true)
    await usuario.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar o rascunho.')
    expect(screen.getByRole('textbox', { name: 'Nome do monitoramento' })).toHaveValue('Clínicas com TI legada')

    fonteDeSinais.definirFalha(false)

    // 3. Falha ao ativar na revisão
    await usuario.click(screen.getByRole('button', { name: 'Revisar e ativar' }))
    const revisao = screen.getByRole('region', { name: 'Revisão antes de ativar' })
    expect(revisao).toBeInTheDocument()

    fonteDeSinais.definirFalha(true)
    await usuario.click(within(revisao).getByRole('button', { name: 'Ativar monitoramento' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível ativar o monitoramento.')

    // Recupera da falha e ativa
    fonteDeSinais.definirFalha(false)
    await usuario.click(within(revisao).getByRole('button', { name: 'Ativar monitoramento' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Sinais personalizados' })).toBeInTheDocument()
    expect(screen.getByText(/“Clínicas com TI legada” está ativo/)).toBeInTheDocument()
  })

  it('reutiliza gestão independente, pausa, retomada e disparo simulado refletido na Conta-alvo', async () => {
    const { usuario, fonteDeSinais, fonteDeContas } = renderizarApp('/sinais/tipos/personalizado')

    expect(await screen.findByRole('heading', { level: 1, name: 'Sinais personalizados' })).toBeInTheDocument()
    const lista = await screen.findByRole('list', { name: 'Monitoramentos deste tipo' })

    // Monitoramento personalizado ativo pré-existente
    const itemCusto = within(lista).getByRole('listitem', { name: 'Queixas públicas sobre custo de nuvem' })
    expect(itemCusto).toHaveTextContent('Ativo')

    // Pausar monitoramento personalizado
    await usuario.click(within(itemCusto).getByRole('button', { name: 'Pausar' }))
    expect(itemCusto).toHaveTextContent('Pausado')

    // Bloqueia disparos enquanto pausado
    await expect(
      fonteDeSinais.simularDisparo({
        monitoramentoId: 'custo-de-nuvem',
        contaId: 'cloudflare',
        frase: 'Queixa pública sobre custos altos de storage',
      }),
    ).rejects.toThrow(/Apenas Monitoramentos Ativos produzem disparos/i)

    // Retoma monitoramento
    await usuario.click(within(itemCusto).getByRole('button', { name: 'Retomar' }))
    expect(itemCusto).toHaveTextContent('Ativo')

    // Realiza disparo simulado para uma Conta-alvo (Cloudflare)
    const disparo = await fonteDeSinais.simularDisparo({
      monitoramentoId: 'custo-de-nuvem',
      contaId: 'cloudflare',
      frase: 'Liderança técnica publicou queixa sobre custo imprevisível de data warehouse',
      acontecimentoId: 'acont-custo-nuvem-cloudflare-01',
      fonte: 'Posts e entrevistas públicas (simuladas)',
      evidencia: '“Custos de consultas e storage escalaram 3x no último trimestre.” (simulada)',
      data: DATA_HOJE_TESTES,
    })

    expect(disparo).toBeDefined()
    expect(disparo.monitoramentoId).toBe('custo-de-nuvem')

    // Reencontro do mesmo acontecimento não cria novo sinal nem altera validade
    const reencontro = await fonteDeSinais.simularDisparo({
      monitoramentoId: 'custo-de-nuvem',
      contaId: 'cloudflare',
      acontecimentoId: 'acont-custo-nuvem-cloudflare-01',
      frase: 'Liderança técnica publicou queixa sobre custo imprevisível de data warehouse (repetido)',
      data: DATA_HOJE_TESTES,
    })
    expect(reencontro.reencontrado).toBeDefined()

    // Vai para Sinais encontrados e verifica o sinal disparado
    await usuario.click(within(screen.getByRole('main')).getByRole('link', { name: 'Sinais' }))
    await usuario.click(await screen.findByRole('button', { name: /Sinais encontrados/ }))

    const tabela = await screen.findByRole('table', { name: 'Sinais encontrados' })
    expect(
      within(tabela).getByText('Liderança técnica publicou queixa sobre custo imprevisível de data warehouse'),
    ).toBeInTheDocument()

    // Clica na empresa Cloudflare
    await usuario.click(within(tabela).getAllByRole('link', { name: 'Cloudflare' })[0])
    expect(await screen.findByRole('heading', { level: 1, name: 'Cloudflare' })).toBeInTheDocument()

    // Conta-alvo fica Quente pelo sinal personalizado
    expect(screen.getAllByRole('img', { name: /Quente/ }).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Fit').length).toBeGreaterThan(0)

    // O sinal personalizado aparece como Último sinal e no Histórico com evidência e fonte
    expect(
      screen.getByRole('listitem', {
        name: 'Liderança técnica publicou queixa sobre custo imprevisível de data warehouse',
      }),
    ).toHaveTextContent('Último sinal')

    expect(screen.getByText(/Fonte: Posts e entrevistas públicas \(simuladas\)/i)).toBeInTheDocument()
    expect(screen.getByText(/Custos de consultas e storage escalaram 3x no último trimestre/i)).toBeInTheDocument()
    expect(
      screen.getByText(/Disparado em .* · Sinais personalizados · Queixas públicas sobre custo de nuvem/i),
    ).toBeInTheDocument()

    // O reencontro é informado na evidência histórica
    expect(screen.getByText(/Reencontrado em .* é o mesmo acontecimento/i)).toBeInTheDocument()

    // Confirma que a fonte de contas compartilhada também reflete a conta quente
    const contaNaFonte = await fonteDeContas.conta('cloudflare')
    expect(contaNaFonte?.quente).toBe(true)
    expect(contaNaFonte?.totalSinaisValidos).toBeGreaterThanOrEqual(1)
  })

  it('permite criar outras verificações personalizadas sem depender dos tipos prontos', async () => {
    const { usuario } = renderizarApp('/sinais/tipos/personalizado/novo')

    // Descreve uma verificação personalizada deliberada
    await usuario.type(
      screen.getByRole('textbox', { name: 'O que você quer acompanhar?' }),
      'Testar tempo de carregamento da página de preços das empresas',
    )
    await usuario.type(screen.getByRole('textbox', { name: /Fonte, se você souber/ }), 'Páginas públicas de preços')
    await usuario.click(within(screen.getByRole('radiogroup', { name: 'Origem' })).getByRole('radio', { name: 'Originado' }))

    await usuario.click(screen.getByRole('button', { name: 'Preparar critérios' }))
    const preparacao = screen.getByRole('region', { name: 'Em preparação' })
    await usuario.click(within(preparacao).getByRole('button', { name: 'Ver critérios preparados' }))

    // Critérios preparados pelo cenário de verificação
    const listaCriterios = screen.getByRole('list', { name: 'Critérios editáveis' })
    expect(within(listaCriterios).getByRole('textbox', { name: 'Critério 1' })).toHaveValue(
      'Verificação deliberada investigando: testar tempo de carregamento da página de preços das empresas',
    )
    expect(within(listaCriterios).getByRole('textbox', { name: 'Critério 2' })).toHaveValue(
      'Observar em: Páginas públicas de preços',
    )

    // Ajusta nome e ativa diretamente
    await usuario.click(screen.getByRole('button', { name: 'Revisar e ativar' }))
    const revisao = screen.getByRole('region', { name: 'Revisão antes de ativar' })
    expect(revisao).toHaveTextContent('Originado')
    expect(revisao).toHaveTextContent('Páginas públicas de preços')

    await usuario.click(within(revisao).getByRole('button', { name: 'Ativar monitoramento' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Sinais personalizados' })).toBeInTheDocument()
  })
})

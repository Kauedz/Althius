import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DATA_HOJE_TESTES, renderizarApp } from '@/test/renderizar'

describe('Ticket 06: Configurar sinais internos', () => {
  it('o histórico comercial fica no catálogo e o comportamento no site saiu da tela', async () => {
    const { usuario } = renderizarApp('/sinais')
    const catalogo = await screen.findByRole('region', { name: 'Catálogo de sinais' })
    const familias = screen.getByRole('group', { name: 'Filtrar por família' })
    await usuario.click(within(familias).getByRole('button', { name: 'Histórico comercial' }))

    expect(within(catalogo).getByRole('link', { name: /Ausência de resposta/ })).toBeInTheDocument()
    expect(within(catalogo).getByRole('link', { name: /Negociação parada/ })).toBeInTheDocument()
    expect(within(catalogo).getByRole('link', { name: /Proposta recusada/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Abertura de vagas/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Visitas ao site/ })).not.toBeInTheDocument()
    expect(within(familias).queryByRole('button', { name: 'Comportamento no site' })).not.toBeInTheDocument()

    const busca = screen.getByRole('searchbox', { name: 'Buscar tipos de sinal' })
    await usuario.type(busca, 'sem resposta')
    expect(screen.getByRole('link', { name: /Ausência de resposta/ })).toBeInTheDocument()
  })

  it('páginas específicas saiu da tela: a URL volta ao catálogo', async () => {
    renderizarApp('/sinais/tipos/paginas-especificas')
    expect(await screen.findByRole('region', { name: 'Catálogo de sinais' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'Páginas específicas' })).not.toBeInTheDocument()
  })

  it.skip('configuração de Comportamento no site: páginas específicas, URLs, simulação sem dados reais, público recomendado e ciclo completo', async () => {
    const { usuario } = renderizarApp('/sinais/tipos/paginas-especificas')

    expect(await screen.findByRole('heading', { level: 1, name: 'Páginas específicas' })).toBeInTheDocument()
    expect(screen.getByText('Interno')).toBeInTheDocument()
    expect(screen.getByText('Comportamento no site')).toBeInTheDocument()

    // Inicia novo monitoramento
    await usuario.click(screen.getByRole('link', { name: 'Novo monitoramento' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Novo monitoramento' })).toBeInTheDocument()

    // Aviso explícito de simulação no formulário
    expect(
      screen.getByText(/as visitas e pessoas identificadas são simuladas\. Não há identificação real de visitantes nem conexões externas/i),
    ).toBeInTheDocument()

    // Preenche nome
    await usuario.type(screen.getByRole('textbox', { name: 'Nome do monitoramento' }), 'Visitas a documentação de API')

    // Ajusta critérios: páginas, URLs específicas, pessoas distintas e período
    const grupoPaginas = screen.getByRole('group', { name: 'Páginas' })
    expect(within(grupoPaginas).getByRole('checkbox', { name: 'Cases' })).toBeInTheDocument()
    await usuario.click(within(grupoPaginas).getByRole('checkbox', { name: 'Documentação' }))

    const campoCaminhos = screen.getByRole('textbox', { name: 'URLs ou caminhos específicos' })
    await usuario.clear(campoCaminhos)
    await usuario.type(campoCaminhos, '/docs/api, /integracoes/rest')

    const campoPessoas = screen.getByRole('spinbutton', { name: 'Pessoas distintas da mesma empresa' })
    await usuario.clear(campoPessoas)
    await usuario.type(campoPessoas, '4')

    // Público recomendado pelas configurações e opção de descoberta
    expect(screen.getByRole('complementary', { name: 'Público recomendado' })).toHaveTextContent('ICP do Workspace')
    await usuario.click(screen.getByRole('radio', { name: 'Listas e descoberta' }))

    // Salva rascunho
    await usuario.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Páginas específicas' })).toBeInTheDocument()
    expect(screen.getByText(/Rascunho “Visitas a documentação de API” salvo/)).toBeInTheDocument()

    const lista = screen.getByRole('list', { name: 'Monitoramentos deste tipo' })
    const item = within(lista).getByRole('listitem', { name: 'Visitas a documentação de API' })
    expect(item).toHaveTextContent('Rascunho')

    // Continua edição e revisa antes de ativar
    await usuario.click(within(item).getByRole('link', { name: 'Continuar' }))
    await usuario.click(await screen.findByRole('button', { name: 'Revisar e ativar' }))

    const revisao = screen.getByRole('region', { name: 'Revisão antes de ativar' })
    expect(revisao).toHaveTextContent('Visitas a documentação de API')
    expect(revisao).toHaveTextContent('Documentação')
    expect(revisao).toHaveTextContent('/docs/api, /integracoes/rest')
    expect(revisao).toHaveTextContent('4 ou mais')
    expect(revisao).toHaveTextContent('Cada Sinal deixa a Conta-alvo Quente por 30 dias a partir do disparo')

    await usuario.click(within(revisao).getByRole('button', { name: 'Ativar monitoramento' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Páginas específicas' })).toBeInTheDocument()
    expect(screen.getByText(/Visitas a documentação de API.*está ativo/)).toBeInTheDocument()

    const itemAtivo = within(screen.getByRole('list', { name: 'Monitoramentos deste tipo' })).getByRole('listitem', { name: 'Visitas a documentação de API' })
    expect(itemAtivo).toHaveTextContent('Ativo')

    // Pausar e retomar pelo ciclo compartilhado
    await usuario.click(within(itemAtivo).getByRole('button', { name: 'Pausar' }))
    expect(itemAtivo).toHaveTextContent('Pausado')

    await usuario.click(within(itemAtivo).getByRole('button', { name: 'Retomar' }))
    expect(itemAtivo).toHaveTextContent('Ativo')
  })

  it('configuração de Histórico comercial: distingue prazo de detecção da validade de 30 dias, foca em listas e alerta para respostas comerciais', async () => {
    const { usuario } = renderizarApp('/sinais/tipos/sem-resposta/novo')

    expect(await screen.findByRole('heading', { level: 1, name: 'Novo monitoramento' })).toBeInTheDocument()
    expect(screen.getByText(/Interno · Histórico comercial/)).toBeInTheDocument()

    // Valores padrão do tipo sem-resposta
    expect(screen.getByRole('radio', { name: 'Sem resposta' })).toHaveAttribute('aria-checked', 'true')
    const campoPrazo = screen.getByRole('spinbutton', { name: 'Há pelo menos' })
    expect(campoPrazo).toHaveValue(45)

    // Alerta no formulário: prazo de inatividade vs validade fixa de 30 dias e resposta isolada não é sinal automático
    expect(
      screen.getByText(/O prazo define o tempo de inatividade no CRM.*validade fixa de 30 dias.*Uma resposta comercial isolada continua sendo Interação e não gera Sinal automaticamente/i),
    ).toBeInTheDocument()

    // O histórico comercial só acompanha listas e não permite descoberta de empresas desconhecidas
    expect(screen.queryByRole('radio', { name: 'Descobrir por perfil' })).not.toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Público recomendado' })).toHaveTextContent(
      'Sinais do histórico comercial acompanham as Contas-alvo que já estão no seu CRM',
    )

    // Ajusta o prazo conforme o ciclo comercial do negócio
    await usuario.type(screen.getByRole('textbox', { name: 'Nome do monitoramento' }), 'Sem resposta há 60 dias')
    await usuario.clear(campoPrazo)
    await usuario.type(campoPrazo, '60')

    await usuario.click(screen.getByRole('button', { name: 'Revisar e ativar' }))

    const revisao = screen.getByRole('region', { name: 'Revisão antes de ativar' })
    // Distinção clara na revisão: critério de detecção (60 dias) vs validade após disparo (30 dias)
    expect(within(revisao).getByText('Há pelo menos')).toBeInTheDocument()
    expect(within(revisao).getByText('60 dias')).toBeInTheDocument()
    expect(within(revisao).getByText('Validade')).toBeInTheDocument()
    expect(within(revisao).getByText(/Cada Sinal deixa a Conta-alvo Quente por 30 dias a partir do disparo/)).toBeInTheDocument()

    await usuario.click(within(revisao).getByRole('button', { name: 'Ativar monitoramento' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Ausência de resposta' })).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Monitoramentos deste tipo' })).getByRole('listitem', { name: 'Sem resposta há 60 dias' })).toHaveTextContent('Ativo')
  })

  it('preserva Interações no histórico comercial e mostra evidência simulada sem substituir Interação pelo Sinal no detalhe da Conta-alvo', async () => {
    const { fonteDeContas } = renderizarApp('/contas/mercadolivre')

    expect(await screen.findByRole('heading', { level: 1, name: 'Mercado Livre' })).toBeInTheDocument()

    // Seção Interações preservada com o histórico comercial de e-mails/reuniões
    const secaoInteracoes = await screen.findByRole('region', { name: 'Interações' })
    expect(within(secaoInteracoes).getByText(/E-mail enviado/i)).toBeInTheDocument()
    expect(within(secaoInteracoes).getByText(/Marina Alves/i)).toBeInTheDocument()
    expect(within(secaoInteracoes).getByText(/HubSpot/i)).toBeInTheDocument()

    // Simula uma resposta comercial recebida do cliente
    await fonteDeContas.registrarInteracao({
      contaId: 'mercadolivre',
      contatoId: 'contato-mercadolivre-1',
      tipo: 'email-recebido',
      participanteCliente: 'Marina Alves',
      origem: 'Gmail',
    })

    // A resposta comercial surge como Interação no histórico comercial
    expect(await within(secaoInteracoes).findByText(/E-mail recebido/i)).toBeInTheDocument()

    // Uma resposta comercial isolada NÃO gera Sinal automaticamente
    const sinaisAposResposta = await fonteDeContas.sinaisDaConta('mercadolivre')
    for (const sinal of sinaisAposResposta) {
      expect(sinal.frase).not.toMatch(/resposta recebida/i)
      expect(sinal.frase).not.toMatch(/email recebido/i)
    }

    // Seção Sinais apresenta o sinal com descrição, data, fonte e evidência simulada
    const secaoSinais = screen.getByRole('region', { name: 'Sinais' })
    expect(within(secaoSinais).getByText(/Consolidou operações de tecnologia na região/i)).toBeInTheDocument()
    expect(within(secaoSinais).getByText(/Fonte: Estadão/i)).toBeInTheDocument()

    // O Sinal e a Interação coexistem pacificamente; a Interação NÃO foi substituída pelo Sinal
    expect(within(secaoInteracoes).getByText(/E-mail recebido/i)).toBeInTheDocument()
    expect(within(secaoSinais).getByText(/Consolidou operações/i)).toBeInTheDocument()
  })

  it('projeta Sinais internos em Último sinal, histórico e foguinho sem alterar Aderência, e bloqueia disparos quando pausado', async () => {
    const { fonteDeSinais, fonteDeContas } = renderizarApp('/sinais')

    // Dispara sinal interno para a conta Mercado Livre (que é Não fit importada)
    const monitoramento = await fonteDeSinais.monitoramento('recusadas-90')
    expect(monitoramento.estado).toBe('ativo')

    const sinalDisparado = await fonteDeSinais.simularDisparo({
      monitoramentoId: 'recusadas-90',
      contaId: 'mercadolivre',
      frase: 'Proposta recusada há 90 dias',
      fonte: 'HubSpot (simulado)',
      evidencia: 'Negócio “Plataforma de dados 2026” marcado como perdido: orçamento adiado para o 2º semestre.',
      data: DATA_HOJE_TESTES,
    })

    expect(sinalDisparado).toBeDefined()
    expect(sinalDisparado.contaId).toBe('mercadolivre')

    // Verifica projeções na Conta-alvo
    const contaAtualizada = await fonteDeContas.conta('mercadolivre')
    expect(contaAtualizada.quente).toBe(true)
    expect(contaAtualizada.totalSinaisValidos).toBeGreaterThanOrEqual(1)
    expect(contaAtualizada.ultimoSinal?.frase).toBe('Proposta recusada há 90 dias')
    // Aderência NÃO é alterada pelo disparo do sinal (ADR 0007)
    expect(contaAtualizada.aderencia).toBe('nao-fit')

    // Pausa o monitoramento
    await fonteDeSinais.mudarEstado('recusadas-90', 'pausado')

    // Tentar produzir novo disparo simulado enquanto pausado deve falhar
    await expect(
      fonteDeSinais.simularDisparo({
        monitoramentoId: 'recusadas-90',
        contaId: 'mercadolivre',
        frase: 'Segundo disparo não permitido',
      }),
    ).rejects.toThrow(/Apenas Monitoramentos Ativos produzem disparos/i)

    // Os sinais existentes e o Último sinal são preservados intactos
    const sinaisAposPausa = await fonteDeContas.sinaisDaConta('mercadolivre')
    expect(sinaisAposPausa.some((s) => s.frase === 'Proposta recusada há 90 dias')).toBe(true)
  })

  it('exibe evidência simulada formatada e preserva histórico com expiração aos 30 dias na rota de Sinais encontrados', async () => {
    const { usuario } = renderizarApp('/sinais')
    await usuario.click(await screen.findByRole('button', { name: /Sinais encontrados/ }))

    const tabela = await screen.findByRole('table', { name: 'Sinais encontrados' })
    expect(tabela).toBeInTheDocument()

    // Visitas às páginas de preço e produto (Nubank)
    expect(within(tabela).getByText('4 pessoas visitaram as páginas de preço e produto')).toBeInTheDocument()

    // Proposta recusada (Mercado Livre)
    expect(within(tabela).getByText('Proposta recusada há 90 dias')).toBeInTheDocument()

    // Abre a Conta com Sinais (Nubank)
    await usuario.click(within(tabela).getByRole('link', { name: 'Nubank' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Nubank' })).toBeInTheDocument()

    // Evidência simulada legível e contextualizada
    expect(screen.getByText(/4 pessoas do escritório de São Paulo, 11 páginas em 3 dias, incluindo Preços/i)).toBeInTheDocument()
    expect(screen.getByText(/Fonte: Visitas ao site da Databricks \(simuladas\)/i)).toBeInTheDocument()

    // Abre a Conta com Sinais do Mercado Livre (Não fit com foguinho)
    await usuario.click(screen.getByRole('link', { name: 'Sinais encontrados' }))
    await usuario.click(within(await screen.findByRole('table', { name: 'Sinais encontrados' })).getAllByRole('link', { name: 'Mercado Livre' })[0])

    expect(await screen.findByRole('heading', { level: 1, name: 'Mercado Livre' })).toBeInTheDocument()
    expect(screen.getAllByText('Não fit').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('img', { name: 'Quente, 1 sinal válido' }).length).toBeGreaterThan(0)
    expect(screen.getByText(/Negócio “Plataforma de dados 2026” marcado como perdido/i)).toBeInTheDocument()
  })

  it('trata estados vazios e falhas recuperáveis adequadamente', async () => {
    // Tipo sem monitoramentos ativos ou configurados
    renderizarApp('/sinais/tipos/anuncios-google', {}, {}, {}, { vazia: true })

    expect(await screen.findByRole('heading', { level: 1, name: 'Anunciando no Google' })).toBeInTheDocument()
    expect(screen.getByText('Nenhum Monitoramento deste tipo ainda.')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Criar Monitoramento' }).length).toBeGreaterThan(0)

    // Falha recuperável no catálogo
    const appComFalha = renderizarApp('/sinais', {}, {}, {}, { falha: true })
    const alerta = await appComFalha.findByRole('alert')
    expect(within(alerta).getByText('Não foi possível carregar os sinais.')).toBeInTheDocument()
    expect(within(alerta).getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })
})

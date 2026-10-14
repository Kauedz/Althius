import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CAMPOS } from './catalogo'
import { renderizarApp } from '@/test/renderizar'

describe('Ticket 05: Completar os sinais externos', () => {
  it('filtra o catálogo por família e não mostra tipos que saíram da tela', async () => {
    const { usuario } = renderizarApp('/sinais')
    const catalogo = await screen.findByRole('region', { name: 'Catálogo de sinais' })
    const familias = screen.getByRole('group', { name: 'Filtrar por família' })

    for (const familia of ['Vagas e equipes', 'Movimentação profissional', 'Capital e finanças', 'Expansão e registros']) {
      expect(within(familias).getByRole('button', { name: familia })).toBeInTheDocument()
    }

    await usuario.click(within(familias).getByRole('button', { name: 'Histórico comercial' }))
    expect(within(catalogo).getByRole('link', { name: /Ausência de resposta/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Abertura de vagas/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Rodadas de investimento/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Certificações/ })).not.toBeInTheDocument()
  })

  it('a busca acha um Sinal visível e a página mostra a família, sem a letra do nicho', async () => {
    const { usuario } = renderizarApp('/sinais')
    const busca = await screen.findByRole('searchbox', { name: 'Buscar tipos de sinal' })
    await usuario.type(busca, 'google maps')
    const card = screen.getByRole('link', { name: /Avaliações no Google Maps/ })
    await usuario.click(card)

    expect(await screen.findByRole('heading', { level: 1, name: 'Avaliações no Google Maps' })).toBeInTheDocument()
    expect(screen.getByText('Externo')).toBeInTheDocument()
    expect(screen.getByText('Reputação e concorrência')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/\b[A-H] ·/)
  })

  it('percurso completo em Movimentação profissional: campos específicos de cargos e pessoas, rascunho, revisão e ativação', async () => {
    const { usuario } = renderizarApp('/sinais/tipos/promocoes')

    expect(await screen.findByRole('heading', { level: 1, name: 'Promoções e mudança de emprego' })).toBeInTheDocument()
    expect(screen.getByText('Externo')).toBeInTheDocument()
    expect(screen.getByText('Movimentação profissional')).toBeInTheDocument()

    await usuario.click(screen.getAllByRole('link', { name: 'Criar Monitoramento' })[0])

    // Campos adequados da família pessoas
    expect(await screen.findByRole('group', { name: 'Cargos acompanhados' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Movimento' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Pessoas de referência' })).toBeInTheDocument()

    // Preenche nome
    await usuario.type(screen.getByRole('textbox', { name: 'Nome do monitoramento' }), 'Promoções de novos decisores')

    // Ajusta critérios
    const cargos = screen.getByRole('group', { name: 'Cargos acompanhados' })
    await usuario.click(within(cargos).getByRole('checkbox', { name: 'VP de Engenharia' }))

    // Verifica que oferece público recomendado simulado
    expect(screen.getByRole('complementary', { name: 'Público recomendado' })).toHaveTextContent('ICP do Workspace')

    // Salva rascunho
    await usuario.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Promoções e mudança de emprego' })).toBeInTheDocument()
    expect(screen.getByText(/Rascunho “Promoções de novos decisores” salvo/)).toBeInTheDocument()

    const lista = screen.getByRole('list', { name: 'Monitoramentos deste tipo' })
    const item = within(lista).getByRole('listitem', { name: 'Promoções de novos decisores' })
    expect(item).toHaveTextContent('Rascunho')

    // Continua edição e ativa
    await usuario.click(within(item).getByRole('link', { name: 'Continuar' }))
    expect(await screen.findByRole('button', { name: 'Revisar e ativar' })).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Revisar e ativar' }))

    const revisao = screen.getByRole('region', { name: 'Revisão antes de ativar' })
    expect(revisao).toHaveTextContent('Promoções de novos decisores')
    expect(revisao).toHaveTextContent('CDO, VP de Engenharia')
    expect(revisao).toHaveTextContent('Promoção')
    expect(revisao).toHaveTextContent('Contatos das Contas-alvo')

    await usuario.click(within(revisao).getByRole('button', { name: 'Ativar monitoramento' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Promoções e mudança de emprego' })).toBeInTheDocument()
    expect(screen.getByText(/Promoções de novos decisores.*está ativo/)).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Monitoramentos deste tipo' })).getByRole('listitem', { name: 'Promoções de novos decisores' })).toHaveTextContent('Ativo')
  })

  it('certificações saiu da tela: a URL de criar volta ao catálogo e o formulário continua no código', async () => {
    renderizarApp('/sinais/tipos/certificacoes/novo')
    expect(await screen.findByRole('region', { name: 'Catálogo de sinais' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Certificações' })).not.toBeInTheDocument()
    expect(CAMPOS.seguranca.map((campo) => campo.rotulo)).toEqual(
      expect.arrayContaining(['Acontecimentos', 'Normas e certificações']),
    )
  })

  it('percurso completo em Expansão e registros: licitações e contratos públicos com pausa e retomada independentes', async () => {
    const { usuario } = renderizarApp('/sinais/tipos/nova-empresa-aberta/novo')

    await usuario.type(await screen.findByRole('textbox', { name: 'Nome do monitoramento' }), 'Contratos públicos em SP')
    const eventos = screen.getByRole('group', { name: 'Acontecimentos' })
    await usuario.click(within(eventos).getByRole('checkbox', { name: 'Licitação ou contrato público' }))

    await usuario.click(screen.getByRole('button', { name: 'Revisar e ativar' }))
    await usuario.click(within(screen.getByRole('region', { name: 'Revisão antes de ativar' })).getByRole('button', { name: 'Ativar monitoramento' }))

    const lista = await screen.findByRole('list', { name: 'Monitoramentos deste tipo' })
    const item = within(lista).getByRole('listitem', { name: 'Contratos públicos em SP' })
    expect(item).toHaveTextContent('Ativo')

    // Pausar
    await usuario.click(within(item).getByRole('button', { name: 'Pausar' }))
    expect(item).toHaveTextContent('Pausado')

    // Retomar
    await usuario.click(within(item).getByRole('button', { name: 'Retomar' }))
    expect(item).toHaveTextContent('Ativo')
  })

  it('demonstra ao menos um resultado simulado coerente por família externa, refletido na Conta-alvo e nos Sinais encontrados', async () => {
    const { usuario } = renderizarApp('/sinais')
    await usuario.click(await screen.findByRole('button', { name: /Sinais encontrados/ }))

    const tabela = await screen.findByRole('table', { name: 'Sinais encontrados' })
    expect(tabela).toBeInTheDocument()

    // 1. Vagas e equipes: Stripe
    expect(within(tabela).getByText('Abriu 3 vagas de engenharia de dados em São Paulo')).toBeInTheDocument()

    // 2. Movimentação profissional: Anthropic
    expect(within(tabela).getByText('Nova liderança de Engenharia e IA assumiu a operação regional')).toBeInTheDocument()

    // 3. Capital e finanças: BBVA México / Rappi
    expect(within(tabela).getByText('Anunciou plano de investimento em dados e IA no México')).toBeInTheDocument()

    // 4. Expansão e registros: Rappi
    expect(within(tabela).getByText('Abriu nova unidade em Monterrey')).toBeInTheDocument()

    // 5. Tecnologia: Twilio
    expect(within(tabela).getByText('Anunciou a retirada do cluster Hadoop até 2027')).toBeInTheDocument()

    // 6. Notícias e iniciativas: Figma
    expect(within(tabela).getByText('Anunciou parceria estratégica para expansão de recursos corporativos de IA')).toBeInTheDocument()

    // 7. Eventos e conteúdo: OpenAI
    expect(within(tabela).getByText('Head de Dados confirmado como palestrante no Data + AI Summit')).toBeInTheDocument()

    // 8. Reputação e concorrência: Notion
    expect(within(tabela).getByText('Avaliação no G2 apontando custos e latência em solução concorrente')).toBeInTheDocument()

    // 9. Comunidades e intenção: Cloudflare
    expect(within(tabela).getByText('Pico de intenção de pesquisa corporativa no tema Modernização de dados')).toBeInTheDocument()

    // Navega até a Conta-alvo de Movimentação profissional (Anthropic) e confere histórico e evidência
    await usuario.click(within(tabela).getByRole('link', { name: 'Anthropic' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Anthropic' })).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: 'Quente, 1 sinal válido' }).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Fit').length).toBeGreaterThan(0)

    const itemHistorico = screen.getByRole('listitem', { name: 'Nova liderança de Engenharia e IA assumiu a operação regional' })
    expect(itemHistorico).toHaveTextContent('Último sinal')
    expect(itemHistorico).toHaveTextContent('LinkedIn e anúncio institucional (simulados)')
    expect(itemHistorico).toHaveTextContent('Anunciamos a contratação de novo Diretor de Engenharia de Dados')

    // Volta aos Sinais encontrados e navega até a Conta-alvo de Reputação e concorrência (Notion)
    await usuario.click(screen.getByRole('link', { name: 'Sinais encontrados' }))
    await usuario.click(within(await screen.findByRole('table', { name: 'Sinais encontrados' })).getByRole('link', { name: 'Notion' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Notion' })).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: 'Quente, 1 sinal válido' }).length).toBeGreaterThan(0)
    expect(screen.getByRole('listitem', { name: 'Avaliação no G2 apontando custos e latência em solução concorrente' })).toHaveTextContent('G2 Crowd (simulado)')
  })
})

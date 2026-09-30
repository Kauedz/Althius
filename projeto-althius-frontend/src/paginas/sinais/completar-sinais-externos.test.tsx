import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TIPOS, familiaDoTipo } from './catalogo'
import { renderizarApp } from '@/test/renderizar'

describe('Ticket 05: Completar os sinais externos', () => {
  it('cobre todas as 9 famílias externas e seus 41 tipos específicos com descrições de negócio claras', async () => {
    const { usuario } = renderizarApp('/sinais')
    const catalogo = await screen.findByRole('region', { name: 'Catálogo de sinais' })

    const familiasEsperadas = [
      'Vagas e equipes',
      'Movimentação profissional',
      'Capital e finanças',
      'Expansão e registros',
      'Tecnologia',
      'Notícias e iniciativas',
      'Eventos e conteúdo',
      'Reputação e concorrência',
      'Comunidades e intenção',
    ]

    // Todas as 9 famílias externas estão presentes
    for (const familia of familiasEsperadas) {
      expect(within(catalogo).getByRole('heading', { level: 2, name: new RegExp(`^${familia}`) })).toBeInTheDocument()
    }

    // Filtro "Externos" isola as famílias externas (46 tipos, com os 5 cards do lançamento de Sinais reais) e oculta as
    // internas e originadas
    const botaoExternos = screen.getByRole('button', { name: /Externos/ })
    expect(botaoExternos).toHaveTextContent('46')
    await usuario.click(botaoExternos)

    // Internos e originados não aparecem
    expect(screen.queryByRole('heading', { level: 2, name: /^Comportamento no site/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: /^Histórico comercial/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: /^Testes e verificações/ })).not.toBeInTheDocument()

    // Todos os 46 tipos externos têm cards específicos e não apenas um genérico por família
    const tiposExternos = TIPOS.filter((t) => familiaDoTipo(t)?.origem === 'externo')
    expect(tiposExternos).toHaveLength(46)

    for (const tipo of tiposExternos) {
      expect(within(catalogo).getByRole('link', { name: new RegExp(tipo.nome) })).toBeInTheDocument()
    }
  })

  it('permite buscar e filtrar tipos externos mantendo a classificação externa mesmo para fontes técnicas ou de dados', async () => {
    const { usuario } = renderizarApp('/sinais')
    const busca = await screen.findByRole('searchbox', { name: 'Buscar tipos de sinal' })

    // Sinais que no futuro usam API externa continuam categorizados como Externos, não Originados
    await usuario.type(busca, 'repositórios')
    const cardRepositorios = screen.getByRole('link', { name: /Interesse em repositórios/ })
    expect(cardRepositorios).toBeInTheDocument()
    await usuario.click(cardRepositorios)

    expect(await screen.findByRole('heading', { level: 1, name: 'Interesse em repositórios' })).toBeInTheDocument()
    // Classificação "Externo" mantida
    expect(screen.getByText('Externo')).toBeInTheDocument()
    expect(screen.getByText('Comunidades e intenção')).toBeInTheDocument()
  })

  it('percurso completo em Movimentação profissional: campos específicos de cargos e pessoas, rascunho, revisão e ativação', async () => {
    const { usuario } = renderizarApp('/sinais/tipos/promocoes')

    expect(await screen.findByRole('heading', { level: 1, name: 'Promoções' })).toBeInTheDocument()
    expect(screen.getByText('Externo')).toBeInTheDocument()
    expect(screen.getByText('Movimentação profissional')).toBeInTheDocument()

    await usuario.click(screen.getByRole('link', { name: 'Novo monitoramento' }))

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
    expect(await screen.findByRole('heading', { level: 1, name: 'Promoções' })).toBeInTheDocument()
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
    expect(await screen.findByRole('heading', { level: 1, name: 'Promoções' })).toBeInTheDocument()
    expect(screen.getByText(/Promoções de novos decisores.*está ativo/)).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Monitoramentos deste tipo' })).getByRole('listitem', { name: 'Promoções de novos decisores' })).toHaveTextContent('Ativo')
  })

  it('percurso completo em Tecnologia com formulário de segurança: certificações e incidentes usam campos de normas e acontecimentos', async () => {
    const { usuario } = renderizarApp('/sinais/tipos/certificacoes/novo')

    expect(await screen.findByRole('heading', { level: 1, name: 'Novo monitoramento' })).toBeInTheDocument()
    expect(screen.getByText(/Tecnologia/)).toBeInTheDocument()

    // O tipo certificações utiliza o formulário seguranca em vez do padrão de tecnologia
    expect(screen.getByRole('group', { name: 'Acontecimentos' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Normas e certificações' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Onde observar' })).toBeInTheDocument()

    await usuario.type(screen.getByRole('textbox', { name: 'Nome do monitoramento' }), 'Certificações ISO 27001 e SOC 2')
    await usuario.click(screen.getByRole('button', { name: 'Revisar e ativar' }))

    const revisao = screen.getByRole('region', { name: 'Revisão antes de ativar' })
    expect(revisao).toHaveTextContent('ISO 27001, SOC 2')
    expect(revisao).toHaveTextContent('Certificação em andamento, Certificação conquistada')

    await usuario.click(within(revisao).getByRole('button', { name: 'Ativar monitoramento' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Certificações' })).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Monitoramentos deste tipo' })).getByRole('listitem', { name: 'Certificações ISO 27001 e SOC 2' })).toHaveTextContent('Ativo')
  })

  it('percurso completo em Expansão e registros: licitações e contratos públicos com pausa e retomada independentes', async () => {
    const { usuario } = renderizarApp('/sinais/tipos/licitacoes/novo')

    await usuario.type(await screen.findByRole('textbox', { name: 'Nome do monitoramento' }), 'Contratos públicos em SP')
    const eventos = screen.getByRole('group', { name: 'Acontecimentos' })
    expect(within(eventos).getByRole('checkbox', { name: 'Licitação ou contrato público' })).toHaveAttribute('aria-checked', 'true')

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

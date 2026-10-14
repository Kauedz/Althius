import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DATA_HOJE_TESTES, renderizarApp } from '@/test/renderizar'

describe('Ticket 07: Configurar sinais originados', () => {
  it('testes e verificações saíram do catálogo', async () => {
    renderizarApp('/sinais')
    const catalogo = await screen.findByRole('region', { name: 'Catálogo de sinais' })
    const familias = screen.getByRole('group', { name: 'Filtrar por família' })
    expect(within(familias).queryByRole('button', { name: 'Testes e verificações' })).not.toBeInTheDocument()
    expect(within(catalogo).queryByRole('link', { name: /lead oculto/i })).not.toBeInTheDocument()
    expect(within(catalogo).getByRole('link', { name: /Abertura de vagas/ })).toBeInTheDocument()
  })

  it.skip('percurso completo de Teste de atendimento (lead oculto): critérios de canais e prazos, rascunho, revisão, ativação e aviso de não execução real', async () => {
    const { usuario } = renderizarApp('/sinais/tipos/lead-oculto')

    expect(await screen.findByRole('heading', { level: 1, name: 'Teste de atendimento (lead oculto)' })).toBeInTheDocument()
    expect(screen.getByText('Originado')).toBeInTheDocument()
    expect(screen.getByText('Testes e verificações')).toBeInTheDocument()

    // Inicia novo monitoramento
    await usuario.click(screen.getByRole('link', { name: 'Novo monitoramento' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Novo monitoramento' })).toBeInTheDocument()

    // Aviso explícito: nenhuma mensagem é enviada, nenhuma ação real nem API/credenciais
    expect(
      screen.getByText(/Na demonstração, nenhuma verificação real é executada, nenhum site é varrido e nenhuma mensagem é enviada\. Não é necessário configurar agentes executores, APIs ou credenciais\./i),
    ).toBeInTheDocument()

    // Não exige escolha de executor, Apify, credenciais ou tokens
    expect(screen.queryByLabelText(/apify/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/credenciais/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/agente executor/i)).not.toBeInTheDocument()

    // Preenche nome
    await usuario.type(screen.getByRole('textbox', { name: 'Nome do monitoramento' }), 'Verificação de resposta a leads inbound')

    // Critérios: canais, condição, prazo limite e frequência
    const grupoCanais = screen.getByRole('group', { name: 'Canais verificados' })
    expect(within(grupoCanais).getByRole('checkbox', { name: 'WhatsApp' })).toBeInTheDocument()
    expect(within(grupoCanais).getByRole('checkbox', { name: 'Formulário do site' })).toBeInTheDocument()
    await usuario.click(within(grupoCanais).getByRole('checkbox', { name: 'E-mail' }))

    const campoCriterio = screen.getByRole('textbox', { name: 'Dispara quando' })
    await usuario.clear(campoCriterio)
    await usuario.type(campoCriterio, 'não houver resposta comercial em 48 horas úteis')

    const grupoPrazo = screen.getByRole('radiogroup', { name: 'Prazo limite ou tolerância' })
    await usuario.click(within(grupoPrazo).getByRole('radio', { name: '48 horas úteis' }))

    const grupoFrequencia = screen.getByRole('radiogroup', { name: 'Frequência' })
    await usuario.click(within(grupoFrequencia).getByRole('radio', { name: 'Toda semana' }))

    // Público com recomendação simulada
    expect(screen.getByRole('complementary', { name: 'Público recomendado' })).toHaveTextContent('ICP do Workspace')

    // Salva rascunho
    await usuario.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Teste de atendimento (lead oculto)' })).toBeInTheDocument()
    expect(screen.getByText(/Rascunho “Verificação de resposta a leads inbound” salvo/)).toBeInTheDocument()

    const lista = screen.getByRole('list', { name: 'Monitoramentos deste tipo' })
    const item = within(lista).getByRole('listitem', { name: 'Verificação de resposta a leads inbound' })
    expect(item).toHaveTextContent('Rascunho')

    // Continua edição e revisa antes de ativar
    await usuario.click(within(item).getByRole('link', { name: 'Continuar' }))
    await usuario.click(await screen.findByRole('button', { name: 'Revisar e ativar' }))

    const revisao = screen.getByRole('region', { name: 'Revisão antes de ativar' })
    expect(revisao).toHaveTextContent('Verificação de resposta a leads inbound')
    expect(revisao).toHaveTextContent('E-mail')
    expect(revisao).toHaveTextContent('não houver resposta comercial em 48 horas úteis')
    expect(revisao).toHaveTextContent('48 horas úteis')
    expect(revisao).toHaveTextContent('Cada Sinal deixa a Conta-alvo Quente por 30 dias a partir do disparo')

    // Ativação
    await usuario.click(within(revisao).getByRole('button', { name: 'Ativar monitoramento' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Teste de atendimento (lead oculto)' })).toBeInTheDocument()
    expect(screen.getByText(/“Verificação de resposta a leads inbound” está ativo/)).toBeInTheDocument()
  })

  it.skip('percurso completo de Erros ou indisponibilidade no site: critérios, prazo imediato, frequência e ciclo de edição/pausa/retomada', async () => {
    const { usuario } = renderizarApp('/sinais/tipos/erros-no-site')

    expect(await screen.findByRole('heading', { level: 1, name: 'Erros ou indisponibilidade no site' })).toBeInTheDocument()
    expect(screen.getByText('Originado')).toBeInTheDocument()

    // Abre monitoramento ativo existente
    const lista = await screen.findByRole('list', { name: 'Monitoramentos deste tipo' })
    const item = within(lista).getByRole('listitem', { name: 'Erros e indisponibilidade no site' })
    expect(item).toHaveTextContent('Ativo')

    // Pausar monitoramento
    await usuario.click(within(item).getByRole('button', { name: 'Pausar' }))
    expect(item).toHaveTextContent('Pausado')

    // Retomar monitoramento
    await usuario.click(within(item).getByRole('button', { name: 'Retomar' }))
    expect(item).toHaveTextContent('Ativo')

    // Editar critérios existentes
    await usuario.click(within(item).getByRole('link', { name: 'Editar' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Erros e indisponibilidade no site' })).toBeInTheDocument()

    const campoCriterio = screen.getByRole('textbox', { name: 'Dispara quando' })
    await usuario.clear(campoCriterio)
    await usuario.type(campoCriterio, 'páginas de preços ou checkout retornarem erro 500')
    await usuario.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Erros ou indisponibilidade no site' })).toBeInTheDocument()
    expect(screen.getByText(/Alterações salvas em “Erros e indisponibilidade no site”/)).toBeInTheDocument()
  })

  it.skip('percurso completo de Formulários e fluxos públicos: critérios de envio e confirmação, público e ativação', async () => {
    const { usuario } = renderizarApp('/sinais/tipos/formularios')

    expect(await screen.findByRole('heading', { level: 1, name: 'Formulários e fluxos públicos' })).toBeInTheDocument()
    expect(screen.getByText('Originado')).toBeInTheDocument()

    await usuario.click(screen.getByRole('link', { name: 'Novo monitoramento' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Novo monitoramento' })).toBeInTheDocument()

    await usuario.type(screen.getByRole('textbox', { name: 'Nome do monitoramento' }), 'Teste de formulário de contato enterprise')

    const campoCriterio = screen.getByRole('textbox', { name: 'Dispara quando' })
    await usuario.clear(campoCriterio)
    await usuario.type(campoCriterio, 'o clique de submissão não exibir mensagem de sucesso')

    // Salva rascunho e ativa
    await usuario.click(screen.getByRole('button', { name: 'Revisar e ativar' }))
    const revisao = screen.getByRole('region', { name: 'Revisão antes de ativar' })
    expect(revisao).toHaveTextContent('Teste de formulário de contato enterprise')
    expect(revisao).toHaveTextContent('o clique de submissão não exibir mensagem de sucesso')

    await usuario.click(within(revisao).getByRole('button', { name: 'Ativar monitoramento' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Formulários e fluxos públicos' })).toBeInTheDocument()
    expect(screen.getByText(/“Teste de formulário de contato enterprise” está ativo/)).toBeInTheDocument()
  })

  it('demonstra resultados simulados para cada tipo de verificação originada em Sinais encontrados e no detalhe da Conta-alvo', async () => {
    const { usuario } = renderizarApp('/sinais')
    await usuario.click(await screen.findByRole('button', { name: /Sinais encontrados/ }))

    const tabela = await screen.findByRole('table', { name: 'Sinais encontrados' })
    expect(tabela).toBeInTheDocument()

    // 1. Lead oculto: TOTVS
    expect(within(tabela).getByText('Sem resposta no formulário de contato após 24 horas úteis')).toBeInTheDocument()

    // 2. Erros ou indisponibilidade no site: Locaweb
    expect(within(tabela).getByText('Página de checkout e preços exibiu erro 500 intermitente')).toBeInTheDocument()

    // 3. Formulários e fluxos públicos: Creditas
    expect(within(tabela).getByText('Formulário de solicitação corporativa falhou no envio')).toBeInTheDocument()

    // Navega até a Conta-alvo de Lead oculto (TOTVS)
    await usuario.click(within(tabela).getByRole('link', { name: 'TOTVS' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'TOTVS' })).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: 'Quente, 1 sinal válido' }).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Fit').length).toBeGreaterThan(0)
    expect(screen.getByRole('listitem', { name: 'Sem resposta no formulário de contato após 24 horas úteis' })).toHaveTextContent('Último sinal')
    expect(screen.getByText(/Fonte: Verificação deliberada de lead oculto \(simulada\)/i)).toBeInTheDocument()
    expect(screen.getByText(/Disparo de mensagem de teste via formulário comercial em 21\/09\/2026/i)).toBeInTheDocument()

    // Volta aos Sinais encontrados e navega até a Conta-alvo de Erros no site (Locaweb - Não fit)
    await usuario.click(screen.getByRole('link', { name: 'Sinais encontrados' }))
    await usuario.click(within(await screen.findByRole('table', { name: 'Sinais encontrados' })).getByRole('link', { name: 'Locaweb' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Locaweb' })).toBeInTheDocument()
    // Preserva a Aderência Não fit mesmo tornando a conta Quente
    expect(screen.getAllByText('Não fit').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('img', { name: 'Quente, 1 sinal válido' }).length).toBeGreaterThan(0)
    expect(screen.getByRole('listitem', { name: 'Página de checkout e preços exibiu erro 500 intermitente' })).toHaveTextContent('Último sinal')
    expect(screen.getByText(/Fonte: Verificação deliberada de integridade do site \(simulada\)/i)).toBeInTheDocument()
    expect(screen.getByText(/Verificação automatizada detectou falha HTTP 500 na rota de checkout/i)).toBeInTheDocument()

    // Volta aos Sinais encontrados e navega até a Conta-alvo de Formulários (Creditas)
    await usuario.click(screen.getByRole('link', { name: 'Sinais encontrados' }))
    await usuario.click(within(await screen.findByRole('table', { name: 'Sinais encontrados' })).getByRole('link', { name: 'Creditas' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Creditas' })).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: 'Quente, 1 sinal válido' }).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Fit').length).toBeGreaterThan(0)
    expect(screen.getByRole('listitem', { name: 'Formulário de solicitação corporativa falhou no envio' })).toHaveTextContent('Último sinal')
    expect(screen.getByText(/Fonte: Teste de formulários públicos \(simulado\)/i)).toBeInTheDocument()
    expect(screen.getByText(/Tentativa de submissão no formulário público corporativo gerou erro/i)).toBeInTheDocument()
  })

  it('aplica contagem, deduplicação e validade de 30 dias com disparo simulado, bloqueando novos disparos quando pausado', async () => {
    const { fonteDeSinais, fonteDeContas } = renderizarApp('/sinais')

    // Dispara sinal originado para a conta Locaweb
    const sinalDisparado = await fonteDeSinais.simularDisparo({
      monitoramentoId: 'erros-site-verificacao',
      contaId: 'locaweb',
      frase: 'Página de checkout e preços exibiu erro 500 intermitente',
      acontecimentoId: 'acont-erro-locaweb-01',
      fonte: 'Verificação deliberada de integridade do site (simulada)',
      evidencia: 'Erro 500 confirmado em nova rodada de teste.',
      data: DATA_HOJE_TESTES,
    })

    expect(sinalDisparado).toBeDefined()
    expect(sinalDisparado.contaId).toBe('locaweb')

    // Reencontro do mesmo acontecimento não cria novo sinal nem altera validade
    const sinalReencontrado = await fonteDeSinais.simularDisparo({
      monitoramentoId: 'erros-site-verificacao',
      contaId: 'locaweb',
      acontecimentoId: 'acont-erro-locaweb-01',
      frase: 'Página de checkout e preços exibiu erro 500 intermitente (repetido)',
      data: DATA_HOJE_TESTES,
    })

    expect(sinalReencontrado.reencontrado).toBeDefined()

    // Pausa o monitoramento de erros
    await fonteDeSinais.mudarEstado('erros-site-verificacao', 'pausado')

    // Disparo bloqueado enquanto pausado
    await expect(
      fonteDeSinais.simularDisparo({
        monitoramentoId: 'erros-site-verificacao',
        contaId: 'locaweb',
        frase: 'Novo erro detectado durante pausa',
      }),
    ).rejects.toThrow(/Apenas Monitoramentos Ativos produzem disparos/i)

    // Resultados anteriores e histórico continuam íntegros
    const sinaisLocaweb = await fonteDeContas.sinaisDaConta('locaweb')
    expect(sinaisLocaweb.length).toBeGreaterThanOrEqual(1)
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

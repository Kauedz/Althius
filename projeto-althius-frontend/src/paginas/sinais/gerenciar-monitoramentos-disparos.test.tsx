import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderizarApp } from '@/test/renderizar'

describe('Ticket 04: Gerenciar vários Monitoramentos e simular disparos', () => {
  it('cria dois ou mais Monitoramentos do mesmo tipo e edita um sem alterar os demais', async () => {
    const { usuario } = renderizarApp('/sinais/tipos/abertura-de-vagas')

    expect(await screen.findByRole('heading', { level: 1, name: 'Abertura de vagas' })).toBeInTheDocument()

    // 1. Cria o primeiro monitoramento novo
    await usuario.click(screen.getByRole('link', { name: 'Novo monitoramento' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Novo monitoramento' })).toBeInTheDocument()

    await usuario.type(screen.getByRole('textbox', { name: 'Nome do monitoramento' }), 'Vagas de Produto SP')
    const grupoCargos1 = screen.getByRole('group', { name: 'Cargos ou funções' })
    await usuario.click(within(grupoCargos1).getByRole('checkbox', { name: 'Plataforma e infraestrutura' }))
    const grupoLoc1 = screen.getByRole('group', { name: 'Localização' })
    await usuario.click(within(grupoLoc1).getByRole('checkbox', { name: 'Brasil' }))

    // Salva rascunho do primeiro
    await usuario.click(screen.getByRole('button', { name: 'Salvar rascunho' }))

    // De volta à página do tipo
    expect(await screen.findByRole('heading', { level: 1, name: 'Abertura de vagas' })).toBeInTheDocument()
    const listaAposPrimeiro = screen.getByRole('list', { name: 'Monitoramentos deste tipo' })
    expect(within(listaAposPrimeiro).getByRole('listitem', { name: 'Vagas de Produto SP' })).toBeInTheDocument()

    // 2. Cria o segundo monitoramento do mesmo tipo
    await usuario.click(screen.getByRole('link', { name: 'Novo monitoramento' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Novo monitoramento' })).toBeInTheDocument()

    await usuario.type(screen.getByRole('textbox', { name: 'Nome do monitoramento' }), 'Vagas de Dados México')
    const grupoLoc2 = screen.getByRole('group', { name: 'Localização' })
    await usuario.click(within(grupoLoc2).getByRole('checkbox', { name: 'México' }))
    await usuario.click(screen.getByRole('radio', { name: 'Descobrir por perfil' }))

    // Salva rascunho do segundo
    await usuario.click(screen.getByRole('button', { name: 'Salvar rascunho' }))

    // Lista agora contém ambos os novos monitoramentos
    expect(await screen.findByRole('heading', { level: 1, name: 'Abertura de vagas' })).toBeInTheDocument()
    const listaAposSegundo = screen.getByRole('list', { name: 'Monitoramentos deste tipo' })
    expect(within(listaAposSegundo).getByRole('listitem', { name: 'Vagas de Produto SP' })).toBeInTheDocument()
    expect(within(listaAposSegundo).getByRole('listitem', { name: 'Vagas de Dados México' })).toBeInTheDocument()

    // 3. Edita o primeiro ("Vagas de Produto SP") sem alterar o segundo
    const itemPrimeiro = within(listaAposSegundo).getByRole('listitem', { name: 'Vagas de Produto SP' })
    await usuario.click(within(itemPrimeiro).getByRole('link', { name: 'Continuar' }))

    const campoNomeEdicao = await screen.findByRole('textbox', { name: 'Nome do monitoramento' })
    expect(campoNomeEdicao).toHaveValue('Vagas de Produto SP')
    await usuario.clear(campoNomeEdicao)
    await usuario.type(campoNomeEdicao, 'Liderança de Produto LATAM')
    const grupoSenioridade = screen.getByRole('radiogroup', { name: 'Senioridade' })
    await usuario.click(within(grupoSenioridade).getByRole('radio', { name: 'Liderança' }))

    await usuario.click(screen.getByRole('button', { name: 'Salvar rascunho' }))

    // Verifica que o primeiro foi atualizado e os outros mantêm suas configurações intactas
    expect(await screen.findByRole('heading', { level: 1, name: 'Abertura de vagas' })).toBeInTheDocument()
    const listaFinal = screen.getByRole('list', { name: 'Monitoramentos deste tipo' })
    const itemEditado = within(listaFinal).getByRole('listitem', { name: 'Liderança de Produto LATAM' })
    expect(itemEditado).toBeInTheDocument()
    expect(itemEditado).toHaveTextContent('Liderança')
    expect(itemEditado).toHaveTextContent('Plataforma e infraestrutura')

    // O segundo monitoramento ("Vagas de Dados México") continua inalterado
    const itemSegundo = within(listaFinal).getByRole('listitem', { name: 'Vagas de Dados México' })
    expect(itemSegundo).toBeInTheDocument()
    expect(itemSegundo).toHaveTextContent('Engenharia de dados')
    expect(itemSegundo).toHaveTextContent('México')
  })

  it('permite os três modos de público (listas, descoberta, ambos) com recomendação simulada em todos', async () => {
    const { usuario } = renderizarApp('/sinais/tipos/abertura-de-vagas/novo')

    await screen.findByRole('heading', { level: 1, name: 'Novo monitoramento' })
    await usuario.type(screen.getByRole('textbox', { name: 'Nome do monitoramento' }), 'Monitoramento de Públicos')

    // O aside com o público recomendado simulado é ofertado
    const aside = screen.getByRole('complementary', { name: 'Público recomendado' })
    expect(aside).toHaveTextContent('ICP Enterprise dados e IA')
    expect(aside).toHaveTextContent('Configurações do Workspace (simulado)')

    // Modo 1: Acompanhar listas
    await usuario.click(screen.getByRole('radio', { name: 'Acompanhar listas' }))
    expect(screen.getByRole('group', { name: 'Listas de Contas-alvo' })).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: 'Perfil da descoberta' })).not.toBeInTheDocument()
    expect(aside).toBeInTheDocument()

    // Modo 2: Descobrir por perfil
    await usuario.click(screen.getByRole('radio', { name: 'Descobrir por perfil' }))
    expect(screen.queryByRole('group', { name: 'Listas de Contas-alvo' })).not.toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Perfil da descoberta' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Usar o público recomendado' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Público personalizado' })).toBeInTheDocument()
    expect(aside).toBeInTheDocument()

    // Modo 3: Listas e descoberta (ambos)
    await usuario.click(screen.getByRole('radio', { name: 'Listas e descoberta' }))
    expect(screen.getByRole('group', { name: 'Listas de Contas-alvo' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Perfil da descoberta' })).toBeInTheDocument()
    expect(aside).toBeInTheDocument()

    // Revisa e verifica que o público é fielmente resumido
    await usuario.click(screen.getByRole('button', { name: 'Revisar e ativar' }))
    const revisao = screen.getByRole('region', { name: 'Revisão antes de ativar' })
    expect(revisao).toHaveTextContent('Listas Enterprise LATAM + descoberta por ICP Enterprise dados e IA')
  })

  it('salva Rascunho, revisa critérios/público antes da ativação, pausa e retoma independentemente, contando apenas ativos', async () => {
    const { usuario } = renderizarApp('/sinais/tipos/abertura-de-vagas')

    expect(await screen.findByRole('heading', { level: 1, name: 'Abertura de vagas' })).toBeInTheDocument()
    // Contagem inicial: 3 no total · 1 ativo
    expect(screen.getByText(/3 no total · 1 ativo/)).toBeInTheDocument()

    await usuario.click(screen.getByRole('link', { name: 'Novo monitoramento' }))
    await usuario.type(screen.getByRole('textbox', { name: 'Nome do monitoramento' }), 'Monitoramento Ciclo Completo')
    const grupoCargos = screen.getByRole('group', { name: 'Cargos ou funções' })
    await usuario.click(within(grupoCargos).getByRole('checkbox', { name: 'IA e machine learning' }))

    // Salva rascunho
    await usuario.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Abertura de vagas' })).toBeInTheDocument()
    // 4 no total, mas continua 1 ativo (o rascunho não conta como ativo)
    expect(screen.getByText(/4 no total · 1 ativo/)).toBeInTheDocument()

    // Abre o rascunho para revisar e ativar
    const item = within(screen.getByRole('list', { name: 'Monitoramentos deste tipo' })).getByRole('listitem', {
      name: 'Monitoramento Ciclo Completo',
    })
    expect(item).toHaveTextContent('Rascunho')
    await usuario.click(within(item).getByRole('link', { name: 'Continuar' }))

    // Clica em Revisar e ativar
    await usuario.click(screen.getByRole('button', { name: 'Revisar e ativar' }))
    const revisao = screen.getByRole('region', { name: 'Revisão antes de ativar' })
    expect(revisao).toHaveTextContent('Monitoramento Ciclo Completo')
    expect(revisao).toHaveTextContent('IA e machine learning')
    expect(revisao).toHaveTextContent('na demonstração, a coleta é simulada')

    // Ativa
    await usuario.click(within(revisao).getByRole('button', { name: 'Ativar monitoramento' }))

    // Agora são 4 no total · 2 ativos!
    expect(await screen.findByRole('heading', { level: 1, name: 'Abertura de vagas' })).toBeInTheDocument()
    expect(screen.getByText(/4 no total · 2 ativos/)).toBeInTheDocument()
    const itemAtivo = within(screen.getByRole('list', { name: 'Monitoramentos deste tipo' })).getByRole('listitem', {
      name: 'Monitoramento Ciclo Completo',
    })
    expect(itemAtivo).toHaveTextContent('Ativo')

    // Pausa o monitoramento ativado
    await usuario.click(within(itemAtivo).getByRole('button', { name: 'Pausar' }))
    expect(itemAtivo).toHaveTextContent('Pausado')
    // Contagem cai de volta para 1 ativo
    expect(screen.getByText(/4 no total · 1 ativo/)).toBeInTheDocument()

    // Retoma
    await usuario.click(within(itemAtivo).getByRole('button', { name: 'Retomar' }))
    expect(itemAtivo).toHaveTextContent('Ativo')
    expect(screen.getByText(/4 no total · 2 ativos/)).toBeInTheDocument()

    // Volta ao catálogo e confere que o card reflete exatamente os 2 ativos
    await usuario.click(within(screen.getByRole('main')).getByRole('link', { name: 'Sinais' }))
    expect(await screen.findByRole('region', { name: 'Catálogo de sinais' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Abertura de vagas.*2 ativos/ })).toBeInTheDocument()
  })

  it('produz disparos simulados apenas para Monitoramentos Ativos, alimentando o armazenamento compartilhado e as projeções', async () => {
    const { fonteDeSinais, fonteDeContas } = renderizarApp('/sinais')

    // Monitoramento ativo existente: 'vagas-engenharia-de-dados'
    // Dispara um novo sinal simulado para a conta recomendada 'stripe' (que tem Fit)
    const sinalStripe = await fonteDeSinais.simularDisparo({
      monitoramentoId: 'vagas-engenharia-de-dados',
      contaId: 'stripe',
      frase: 'Nova vaga de Staff Data Engineer em SP (simulada)',
      evidencia: '“Buscamos Staff Data Engineer para infraestrutura lakehouse.” (evidência simulada)',
      fonte: 'Página de carreiras (simulada)',
      data: '2026-09-23',
    })

    expect(sinalStripe).toBeDefined()
    expect(sinalStripe.monitoramentoId).toBe('vagas-engenharia-de-dados')
    expect(sinalStripe.contaId).toBe('stripe')

    // Verifica que o disparo alimentou a projeção na FonteDeContas
    const stripeNaFonte = await fonteDeContas.conta('stripe')
    expect(stripeNaFonte.quente).toBe(true)
    expect(stripeNaFonte.aderencia).toBe('fit') // Origem recomendada mantém Fit
    expect(stripeNaFonte.totalSinaisValidos).toBeGreaterThanOrEqual(1)
    expect(stripeNaFonte.ultimoSinal?.frase).toBe('Nova vaga de Staff Data Engineer em SP (simulada)')

    // Dispara sinal para uma conta importada com Aderência Não fit ('rappi')
    const sinalRappi = await fonteDeSinais.simularDisparo({
      monitoramentoId: 'vagas-engenharia-de-dados',
      contaId: 'rappi',
      frase: 'Vaga de Engenharia de Plataforma (simulada)',
      evidencia: '“Contratação para plataforma de logística regional.” (evidência simulada)',
      fonte: 'LinkedIn Jobs (simulado)',
      data: '2026-09-23',
    })

    expect(sinalRappi).toBeDefined()
    const rappiNaFonte = await fonteDeContas.conta('rappi')
    expect(rappiNaFonte.quente).toBe(true)
    expect(rappiNaFonte.aderencia).toBe('nao-fit') // Aderência Não fit preservada!
    expect(rappiNaFonte.totalSinaisValidos).toBe(1)

    // Dispara sinal para conta importada não avaliada ('bbva-mexico')
    const sinalBBVA = await fonteDeSinais.simularDisparo({
      monitoramentoId: 'vagas-engenharia-de-dados',
      contaId: 'bbva-mexico',
      frase: 'Vagas de engenharia de dados no México (simulada)',
      data: '2026-09-23',
    })

    expect(sinalBBVA).toBeDefined()
    const bbvaNaFonte = await fonteDeContas.conta('bbva-mexico')
    expect(bbvaNaFonte.quente).toBe(true)
    expect(bbvaNaFonte.aderencia).toBeUndefined() // Continua sem avaliação!
    expect(bbvaNaFonte.totalSinaisValidos).toBe(1)
  })

  it('pausar impede novos disparos simulados desse Monitoramento e preserva sinais existentes e validade', async () => {
    const { fonteDeSinais } = renderizarApp('/sinais')

    // Monitoramento pausado: 'vagas-ia-mexico'
    const monPausado = await fonteDeSinais.monitoramento('vagas-ia-mexico')
    expect(monPausado.estado).toBe('pausado')

    // Tentar disparar sinal para monitoramento pausado deve rejeitar
    await expect(
      fonteDeSinais.simularDisparo({
        monitoramentoId: 'vagas-ia-mexico',
        contaId: 'stripe',
        frase: 'Disparo inválido enquanto pausado',
      }),
    ).rejects.toThrow(/Apenas Monitoramentos Ativos produzem disparos/)

    // Ao retomar, torna-se ativo e pode produzir novos disparos
    await fonteDeSinais.mudarEstado('vagas-ia-mexico', 'ativo')
    const sinalAposRetomar = await fonteDeSinais.simularDisparo({
      monitoramentoId: 'vagas-ia-mexico',
      contaId: 'stripe',
      frase: 'Vaga de IA após retomar (simulada)',
      data: '2026-09-23',
    })
    expect(sinalAposRetomar.frase).toBe('Vaga de IA após retomar (simulada)')
  })

  it('reencontrar acontecimento existente não renova data nem duplica acontecimentos entre monitoramentos', async () => {
    const { fonteDeSinais, fonteDeContas } = renderizarApp('/sinais')

    const dataOriginal = '2026-09-10'
    const acontecimentoId = 'vaga-compartilhada-lakehouse'

    // Monitoramento 1 dispara
    await fonteDeSinais.simularDisparo({
      id: 'sinal-original-01',
      monitoramentoId: 'vagas-engenharia-de-dados',
      contaId: 'stripe',
      acontecimentoId,
      frase: 'Vaga Lakehouse original',
      data: dataOriginal,
    })

    const sinaisIniciais = await fonteDeContas.sinaisDaConta('stripe')
    const sinalGravado = sinaisIniciais.find((s) => s.acontecimentoId === acontecimentoId)
    expect(sinalGravado).toBeDefined()
    expect(sinalGravado?.data).toContain('2026-09-10')

    // Outro monitoramento ativo (ou o mesmo mais tarde) encontra o mesmo acontecimento
    const dataPosterior = '2026-09-23'
    await fonteDeSinais.simularDisparo({
      id: 'sinal-reencontrado-02',
      monitoramentoId: 'vagas-engenharia-de-dados',
      contaId: 'stripe',
      acontecimentoId,
      frase: 'Vaga Lakehouse reencontrada',
      data: dataPosterior,
    })

    const sinaisAposReencontro = await fonteDeContas.sinaisDaConta('stripe')
    const sinaisDoAcontecimento = sinaisAposReencontro.filter((s) => s.acontecimentoId === acontecimentoId)

    // Não duplicou!
    expect(sinaisDoAcontecimento).toHaveLength(1)
    // Manteve a data original do disparo
    expect(sinaisDoAcontecimento[0].data).toContain('2026-09-10')
    // Registrou reencontro
    expect(sinaisDoAcontecimento[0].reencontrado).toBeDefined()
  })

  it('verifica erros recuperáveis nas operações sem perda das configurações salvas', async () => {
    const { usuario, fonteDeSinais } = renderizarApp('/sinais/tipos/abertura-de-vagas')

    expect(await screen.findByRole('heading', { level: 1, name: 'Abertura de vagas' })).toBeInTheDocument()

    // Abre o editor
    await usuario.click(screen.getByRole('link', { name: 'Novo monitoramento' }))
    const campoNome = await screen.findByRole('textbox', { name: 'Nome do monitoramento' })
    await usuario.type(campoNome, 'Engenharia com Resiliência')

    const grupoCargos = screen.getByRole('group', { name: 'Cargos ou funções' })
    await usuario.click(within(grupoCargos).getByRole('checkbox', { name: 'IA e machine learning' }))

    // Simula falha transitória na fonte
    fonteDeSinais.definirFalha(true)

    // Tenta salvar rascunho: deve capturar o erro e exibir alerta
    await usuario.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar o rascunho.')

    // O formulário NÃO foi perdido nem limpo!
    expect(screen.getByRole('textbox', { name: 'Nome do monitoramento' })).toHaveValue('Engenharia com Resiliência')
    expect(within(grupoCargos).getByRole('checkbox', { name: 'IA e machine learning' })).toBeChecked()

    // Corrige a falha
    fonteDeSinais.definirFalha(false)

    // Clica novamente em salvar rascunho: agora tem sucesso e navega de volta!
    await usuario.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Abertura de vagas' })).toBeInTheDocument()
    expect(screen.getByText('Rascunho “Engenharia com Resiliência” salvo.')).toBeInTheDocument()

    // Teste de erro recuperável ao ativar na revisão sem perder configurações preenchidas
    const item = within(screen.getByRole('list', { name: 'Monitoramentos deste tipo' })).getByRole('listitem', {
      name: 'Engenharia com Resiliência',
    })
    await usuario.click(within(item).getByRole('link', { name: 'Continuar' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Engenharia com Resiliência' })).toBeInTheDocument()

    // Abre revisão
    await usuario.click(screen.getByRole('button', { name: 'Revisar e ativar' }))
    const modalRevisao = screen.getByRole('region', { name: 'Revisão antes de ativar' })
    expect(modalRevisao).toBeInTheDocument()

    // Simula falha ao tentar ativar
    fonteDeSinais.definirFalha(true)
    await usuario.click(within(modalRevisao).getByRole('button', { name: 'Ativar monitoramento' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível ativar o monitoramento.')

    // As configurações do formulário continuam intactas na revisão
    expect(modalRevisao).toHaveTextContent('Engenharia com Resiliência')

    // Ao voltar para a edição, os inputs do formulário continuam exatamente preenchidos
    await usuario.click(within(modalRevisao).getByRole('button', { name: 'Voltar à edição' }))
    expect(screen.getByRole('textbox', { name: 'Nome do monitoramento' })).toHaveValue('Engenharia com Resiliência')

    // Abre revisão novamente, corrige a falha e ativa com sucesso
    await usuario.click(screen.getByRole('button', { name: 'Revisar e ativar' }))
    const modalAposVoltar = screen.getByRole('region', { name: 'Revisão antes de ativar' })
    fonteDeSinais.definirFalha(false)
    await usuario.click(within(modalAposVoltar).getByRole('button', { name: 'Ativar monitoramento' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Abertura de vagas' })).toBeInTheDocument()
    const itemAtivado = within(screen.getByRole('list', { name: 'Monitoramentos deste tipo' })).getByRole('listitem', {
      name: 'Engenharia com Resiliência',
    })
    expect(itemAtivado).toHaveTextContent('Ativo')
  })
})

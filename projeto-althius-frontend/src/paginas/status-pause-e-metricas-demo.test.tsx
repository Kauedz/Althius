import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderizarApp } from '@/test/renderizar'

describe('Status, pause e métricas de demo (Ticket 09)', () => {
  it('quando a demo registra uma Interação de resposta na Conta-alvo, a sequência da empresa fica Pausada', async () => {
    const { fonteDeContas, fonteDeSequencias, usuario } = renderizarApp('/contas/openai')

    // Inicialmente a sequência da OpenAI está ativa
    const seqInicial = await fonteDeSequencias.sequenciaPorConta('openai')
    expect(seqInicial?.status).toBe('ativa')

    // Seção Sequência no detalhe da Conta exibe 'Ativa'
    const secaoSequencia = await screen.findByRole('region', { name: 'Sequência' })
    expect(within(secaoSequencia).getByText('Ativa')).toBeInTheDocument()

    // Registra uma Interação de resposta na OpenAI
    await fonteDeContas.registrarInteracao({
      contaId: 'openai',
      contatoId: 'contato-openai-1',
      tipo: 'email-recebido',
      origem: 'E-mail',
      participanteCliente: 'Marina Costa',
    })

    // A sequência passa automaticamente para 'pausada' pela regra account-first
    const seqPausada = await fonteDeSequencias.sequenciaPorConta('openai')
    expect(seqPausada?.status).toBe('pausada')

    // Na UI do detalhe da Conta, reflete Pausada e aviso de Pausa da Conta inteira
    expect(await within(secaoSequencia).findByText('Pausada')).toBeInTheDocument()
    expect(within(secaoSequencia).getByText(/Pausa da Conta inteira/i)).toBeInTheDocument()
    expect(within(secaoSequencia).getByText(/Sarah Chen respondeu via E-mail hoje/i)).toBeInTheDocument()

    // Na aba/seção de Interações da empresa, a nova interação recebida aparece
    const secaoInteracoes = screen.getByRole('region', { name: 'Interações' })
    expect(await within(secaoInteracoes).findByText(/E-mail recebido/i)).toBeInTheDocument()

    // Navegando para o detalhe da sequência, também exibe o status Pausada
    await usuario.click(within(secaoSequencia).getByRole('link', { name: /Ver sequência/i }))
    expect(await screen.findByText(/Pausa da Conta inteira/i)).toBeInTheDocument()
    expect(
      screen.getByText(/Toda a sequência da OpenAI está parada — nenhum Contato recebe o próximo step até alguém analisar/i),
    ).toBeInTheDocument()
  })

  it('o botão "Simular resposta" no detalhe da sequência pausa a Conta inteira e registra uma Interação na Conta-alvo', async () => {
    const { fonteDeContas, fonteDeSequencias, usuario } = renderizarApp('/sequencias/sequencia-openai')

    // Sequência da OpenAI inicia ativa com botão de simular resposta
    expect(await screen.findByRole('heading', { level: 2, name: /OpenAI/i })).toBeInTheDocument()
    const botaoSimular = screen.getByRole('button', { name: /Simular resposta/i })
    expect(botaoSimular).toBeInTheDocument()

    // Quantidade inicial de interações da OpenAI
    const interacoesAntes = await fonteDeContas.interacoesDaConta('openai')

    // Clica em "Simular resposta"
    await usuario.click(botaoSimular)

    // A sequência fica pausada
    const seq = await fonteDeSequencias.sequenciaPorConta('openai')
    expect(seq?.status).toBe('pausada')

    // Na UI do detalhe da sequência fica explícito que a pausa é da Conta inteira
    expect(await screen.findByText('Pausa da Conta inteira')).toBeInTheDocument()
    expect(
      screen.getByText(/Toda a sequência da OpenAI está parada — nenhum Contato recebe o próximo step até alguém analisar/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Regra do produto: qualquer resposta de qualquer Contato \(positiva ou negativa\) pausa a sequência inteira da empresa/i),
    ).toBeInTheDocument()

    // Uma nova Interação de resposta foi gravada na FonteDeContas
    const interacoesDepois = await fonteDeContas.interacoesDaConta('openai')
    expect(interacoesDepois.length).toBe(interacoesAntes.length + 1)
    expect(interacoesDepois[0].tipo).toBe('email-recebido')
    expect(interacoesDepois[0].origem).toBe('E-mail')

    // Navega para a Conta-alvo e verifica se o pause e a Interação constam lá
    await usuario.click(screen.getByRole('link', { name: /Ver Conta-alvo/i }))
    expect(await screen.findByRole('heading', { level: 2, name: 'OpenAI' })).toBeInTheDocument()

    const secaoSequencia = screen.getByRole('region', { name: 'Sequência' })
    expect(within(secaoSequencia).getByText('Pausada')).toBeInTheDocument()
    expect(within(secaoSequencia).getByText(/Pausa da Conta inteira/i)).toBeInTheDocument()

    const secaoInteracoes = screen.getByRole('region', { name: 'Interações' })
    expect(await within(secaoInteracoes).findByText(/E-mail recebido/i)).toBeInTheDocument()
  })

  it('fica explícito na UI do detalhe da sequência, detalhe da Conta e lista global que o pause é da Conta inteira', async () => {
    // Anthropic já inicia pausada na demonstração (Alex Rivera respondeu no LinkedIn)
    const { usuario } = renderizarApp('/sequencias/sequencia-anthropic')

    // 1. Detalhe da sequência: destaque explícito de Pausa da Conta inteira
    expect(await screen.findByText('Pausa da Conta inteira')).toBeInTheDocument()
    expect(
      screen.getByText(/Toda a sequência da Anthropic está parada — nenhum Contato recebe o próximo step até alguém analisar/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Regra do produto: qualquer resposta de qualquer Contato \(positiva ou negativa\) pausa a sequência inteira da empresa/i),
    ).toBeInTheDocument()

    // 2. Detalhe da Conta: seção Sequência explicita Pausa da Conta inteira
    await usuario.click(screen.getByRole('link', { name: /Ver Conta-alvo/i }))
    const secaoSequencia = await screen.findByRole('region', { name: 'Sequência' })
    expect(within(secaoSequencia).getByText('Pausada')).toBeInTheDocument()
    expect(within(secaoSequencia).getByText(/Pausa da Conta inteira/i)).toBeInTheDocument()
    expect(within(secaoSequencia).getByText(/Alex Rivera respondeu no LinkedIn/i)).toBeInTheDocument()
    expect(
      within(secaoSequencia).getByText(/Nenhum Contato da empresa recebe os próximos steps enquanto a sequência estiver pausada/i),
    ).toBeInTheDocument()

    // 3. Lista global de Sequências: coluna Próximo step destaca Pausa da Conta
    await usuario.click(screen.getByRole('link', { name: 'Sequências' }))
    const tabela = await screen.findByRole('table', { name: 'Tabela de Sequências' })
    const linhaAnthropic = within(tabela).getByRole('link', { name: 'Anthropic' }).closest('tr')!
    expect(within(linhaAnthropic).getByText(/Pausada · Alex Rivera respondeu no LinkedIn/i)).toBeInTheDocument()
    expect(within(linhaAnthropic).getByText('Pausa da Conta')).toBeInTheDocument()
  })

  it('métricas de demonstração aparecem rotuladas como Demonstração e apoiam a narrativa', async () => {
    const { usuario } = renderizarApp('/sequencias/sequencia-anthropic')

    // No cabeçalho da sequência, exibe resumo de respostas com o selo Demonstração
    const headerMetricas = await screen.findByTitle('Métricas de demonstração')
    expect(within(headerMetricas).getByText(/1 resposta/i)).toBeInTheDocument()

    // Step 1: E-mail com métricas de aberturas e respostas
    const timeline = screen.getByRole('list', { name: 'Linha do tempo de passos' })
    const botaoStep1 = within(timeline).getByRole('button', { name: /Abertura pelo Sinal/i })
    await usuario.click(botaoStep1)

    const composer = screen.getByTestId('composer-step')
    expect(within(composer).getByText('Demonstração')).toBeInTheDocument()
    expect(within(composer).getByText(/Aberto/i)).toBeInTheDocument()
    expect(within(composer).getByText('3×')).toBeInTheDocument()
    expect(within(composer).getByText(/0 respostas/i)).toBeInTheDocument()

    // Step 2: LinkedIn com resposta positiva
    const botaoStep2 = within(timeline).getByRole('button', { name: /Convite no LinkedIn/i })
    expect(within(botaoStep2).getByText('1 resposta')).toBeInTheDocument()
    await usuario.click(botaoStep2)

    expect(within(composer).getByText('Demonstração')).toBeInTheDocument()
    expect(within(composer).getByText(/1 resposta/i)).toBeInTheDocument()

  })

  it('exibe desfechos de tarefas e ligações quando presentes nas métricas da demo', async () => {
    const { usuario } = renderizarApp('/sequencias/sequencia-stripe')
    expect(await screen.findByRole('heading', { level: 2, name: /Stripe/i })).toBeInTheDocument()

    const timeline = screen.getByRole('list', { name: 'Linha do tempo de passos' })
    const botaoStep1 = within(timeline).getByRole('button', { name: /Aquecer no LinkedIn/i })
    await usuario.click(botaoStep1)

    const composerStripe = screen.getByTestId('composer-step')
    expect(within(composerStripe).getByText('Demonstração')).toBeInTheDocument()
    expect(within(composerStripe).getByText(/Resultado:/i)).toBeInTheDocument()
    expect(within(composerStripe).getByText('Concluída')).toBeInTheDocument()
  })

  it('steps e sequências sem métricas de demo renderizam sem quebrar a UI', async () => {
    // OpenAI não possui step.metricas em nenhum de seus 6 steps
    const { usuario } = renderizarApp('/sequencias/sequencia-openai')

    expect(await screen.findByRole('heading', { level: 2, name: /OpenAI/i })).toBeInTheDocument()
    const composer = screen.getByTestId('composer-step')

    // Renderiza normalmente com selo de Demonstração e aviso amigável
    expect(within(composer).getByText('Demonstração')).toBeInTheDocument()
    expect(
      within(composer).getByText('Ainda não enviado · nada sai deste protótipo'),
    ).toBeInTheDocument()

    // Clicar em outros steps da OpenAI continua sem quebrar
    const timeline = screen.getByRole('list', { name: 'Linha do tempo de passos' })
    const botaoStep3 = within(timeline).getByRole('button', { name: /Follow-up com vídeo/i })
    await usuario.click(botaoStep3)

    expect(within(composer).getByText('Demonstração')).toBeInTheDocument()
    expect(
      within(composer).getByText('Ainda não enviado · nada sai deste protótipo'),
    ).toBeInTheDocument()
  })

  it('criar sequência sozinha continua não sendo Interação (regra do CONTEXT.md)', async () => {
    const { fonteDeContas, fonteDeSequencias } = renderizarApp('/contas/figma')

    // Figma já tem interações da base demo, mas nenhuma sequência
    const interacoesAntes = await fonteDeContas.interacoesDaConta('figma')

    // Cria uma sequência válida para a Figma
    await fonteDeSequencias.criarSequencia({
      contaId: 'figma',
      participantesIds: ['contato-figma-1'],
    })

    // A sequência existe na fonte
    const seq = await fonteDeSequencias.sequenciaPorConta('figma')
    expect(seq).toBeDefined()
    expect(seq?.status).toBe('ativa')

    // A lista de Interações da Figma NÃO AUMENTOU (criar sequência não é Interação)
    const interacoesDepois = await fonteDeContas.interacoesDaConta('figma')
    expect(interacoesDepois).toHaveLength(interacoesAntes.length)
  })

  it('permite alternar entre Ativa, Pausada, Retomada e Reunião com consistência', async () => {
    const { fonteDeContas, fonteDeSequencias, usuario } = renderizarApp('/sequencias/sequencia-openai')

    expect(await screen.findByRole('heading', { level: 2, name: /OpenAI/i })).toBeInTheDocument()

    // 1. Simula resposta -> Pausada
    await usuario.click(screen.getByRole('button', { name: /Simular resposta/i }))
    expect(await screen.findByText('Pausa da Conta inteira')).toBeInTheDocument()
    expect((await fonteDeSequencias.sequenciaPorConta('openai'))?.status).toBe('pausada')

    // 2. Retoma a sequência -> Ativa
    const botaoRetomar = screen.getByRole('button', { name: /Retomar/i })
    await usuario.click(botaoRetomar)
    expect((await fonteDeSequencias.sequenciaPorConta('openai'))?.status).toBe('ativa')
    await waitFor(() => {
      expect(screen.queryByText('Pausa da Conta inteira')).not.toBeInTheDocument()
    })

    // 3. Simula resposta novamente -> Pausada
    await usuario.click(screen.getByRole('button', { name: /Simular resposta/i }))
    expect(await screen.findByText('Pausa da Conta inteira')).toBeInTheDocument()

    // 4. Marca reunião -> Reunião
    const botaoReuniao = screen.getByRole('button', { name: /Marcar reunião/i })
    await usuario.click(botaoReuniao)
    expect((await fonteDeSequencias.sequenciaPorConta('openai'))?.status).toBe('reuniao')
    expect(await screen.findByText(/Reunião marcada:/i)).toBeInTheDocument()

    // Verifica que uma Interação de reunião foi registrada na Conta
    const interacoes = await fonteDeContas.interacoesDaConta('openai')
    expect(interacoes.some((i) => i.tipo === 'reuniao')).toBe(true)
  })
})

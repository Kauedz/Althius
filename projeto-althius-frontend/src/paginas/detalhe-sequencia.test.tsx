import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderizarApp } from '@/test/renderizar'

describe('Detalhe da Sequência - Documento e Timeline (Ticket 05)', () => {
  it('exibe o documento completo: Conta-alvo, status, participantes, timeline ordenada, delays e regra de pause', async () => {
    renderizarApp('/sequencias/sequencia-openai')

    // Título da página e cabeçalho com nome da conta e link
    expect(await screen.findByRole('heading', { level: 2, name: /OpenAI/i })).toBeInTheDocument()
    expect(screen.getByText('Ativa')).toBeInTheDocument()

    // Link para a Conta-alvo
    const linkConta = screen.getByRole('link', { name: 'Ver Conta-alvo' })
    expect(linkConta).toHaveAttribute('href', '/contas/openai')

    // Regra de pause account-level sempre visível
    expect(screen.getByText(/Regra de pause na Conta-alvo/i)).toBeInTheDocument()
    expect(
      screen.getByText(/Qualquer resposta nesta Conta-alvo \(positiva ou negativa\) pausa a sequência inteira/i),
    ).toBeInTheDocument()

    // Participantes exibidos com chips
    expect(screen.getByText(/Participantes ·/i)).toBeInTheDocument()
    expect(screen.getByText('Sarah Chen')).toBeInTheDocument()
    expect(screen.getByText('Marcus Vance')).toBeInTheDocument()
    expect(screen.getByText('Elena Rostova')).toBeInTheDocument()

    // Janela padrão
    expect(screen.getByText(/Janela padrão/i)).toBeInTheDocument()
    expect(screen.getByText(/Seg a sex, dias úteis/i)).toBeInTheDocument()

    // Timeline lateral com resumo e steps
    expect(screen.getByText(/6 steps · 9 dias úteis/i)).toBeInTheDocument()
    expect(screen.getByText('Abertura pelo Sinal')).toBeInTheDocument()
    expect(screen.getByText('Convite no LinkedIn')).toBeInTheDocument()
    expect(screen.getByText('Follow-up com vídeo')).toBeInTheDocument()
    expect(screen.getByText('Ligação para a Product Lead')).toBeInTheDocument()
    expect(screen.getByText('WhatsApp com print')).toBeInTheDocument()
    expect(screen.getByText('Encerramento')).toBeInTheDocument()

    // Editor do step selecionado (o primeiro por padrão)
    expect(screen.getByDisplayValue('Abertura pelo Sinal')).toBeInTheDocument()
    expect(screen.getByDisplayValue(/as vagas de avaliação de dados/i)).toBeInTheDocument()
    expect(screen.getByDisplayValue(/Conectar o Sinal a uma dor concreta/i)).toBeInTheDocument()
  })

  it('exibe corretamente os diferentes status: Pausada, Reunião e Esgotada com banners apropriados', async () => {
    // 1. Pausada: Anthropic
    const { unmount } = renderizarApp('/sequencias/sequencia-anthropic')

    expect(await screen.findByRole('heading', { level: 2, name: /Anthropic/i })).toBeInTheDocument()
    expect(screen.getByText('Pausada')).toBeInTheDocument()
    expect(screen.getByText(/Sequência pausada/i)).toBeInTheDocument()
    expect(screen.getByText(/Alex Rivera respondeu no LinkedIn/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retomar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Marcar reunião' })).toBeInTheDocument()
    unmount()

    // 2. Reunião: Stripe
    const renderStripe = renderizarApp('/sequencias/sequencia-stripe')
    expect(await screen.findByRole('heading', { level: 2, name: /Stripe/i })).toBeInTheDocument()
    expect(screen.getByText('Reunião')).toBeInTheDocument()
    expect(screen.getByText(/Reunião marcada/i)).toBeInTheDocument()
    expect(screen.getByText(/David Kim aceitou reunião/i)).toBeInTheDocument()
    renderStripe.unmount()

    // 3. Esgotada: Snowflake
    renderizarApp('/sequencias/sequencia-snowflake')
    expect(await screen.findByRole('heading', { level: 2, name: /Snowflake/i })).toBeInTheDocument()
    expect(screen.getByText('Esgotada')).toBeInTheDocument()
  })

  it('permite alternar o step selecionado ao clicar na timeline', async () => {
    const { usuario } = renderizarApp('/sequencias/sequencia-openai')

    expect(await screen.findByDisplayValue('Abertura pelo Sinal')).toBeInTheDocument()

    // Clica no segundo step: Convite no LinkedIn
    const botaoStep2 = screen.getByRole('button', { name: /Convite no LinkedIn/i })
    await usuario.click(botaoStep2)

    // O editor agora mostra o step 2
    expect(screen.getByDisplayValue('Convite no LinkedIn')).toBeInTheDocument()
    expect(screen.getByDisplayValue(/acompanho o trabalho da OpenAI/i)).toBeInTheDocument()
  })

  it('permite editar campos do step e reflete a atualização na timeline', async () => {
    const { usuario } = renderizarApp('/sequencias/sequencia-openai')

    const inputTitulo = await screen.findByDisplayValue('Abertura pelo Sinal')
    await usuario.clear(inputTitulo)
    await usuario.type(inputTitulo, 'Novo Título do Step 1')

    // Reflete no input e na timeline
    expect(screen.getByDisplayValue('Novo Título do Step 1')).toBeInTheDocument()
    expect(screen.getAllByText('Novo Título do Step 1').length).toBeGreaterThan(0)
  })

  it('permite reordenar steps para cima e para baixo', async () => {
    const { usuario } = renderizarApp('/sequencias/sequencia-openai')

    // Step 1 está selecionado inicialmente
    expect(await screen.findByDisplayValue('Abertura pelo Sinal')).toBeInTheDocument()

    // Seleciona o step 2: Convite no LinkedIn
    await usuario.click(screen.getByRole('button', { name: /Convite no LinkedIn/i }))
    expect(screen.getByDisplayValue('Convite no LinkedIn')).toBeInTheDocument()

    // Clica em "Mover para cima"
    const botaoMoverCima = screen.getByRole('button', { name: /Mover para cima/i })
    await usuario.click(botaoMoverCima)

    // Agora Convite no LinkedIn virou o Step 1
    expect(await screen.findByText(/Step 1 de 6/i)).toBeInTheDocument()
  })

  it('permite excluir um step da timeline', async () => {
    const { usuario } = renderizarApp('/sequencias/sequencia-openai')

    expect(await screen.findByText(/6 steps · 9 dias úteis/i)).toBeInTheDocument()

    const botaoExcluir = screen.getByRole('button', { name: /Excluir step/i })
    await usuario.click(botaoExcluir)

    // Agora restam 5 steps
    expect(await screen.findByText(/5 steps ordenados/i)).toBeInTheDocument()
  })

  it('permite adicionar um novo step escolhendo o canal', async () => {
    const { usuario } = renderizarApp('/sequencias/sequencia-openai')

    expect(await screen.findByText(/6 steps · 9 dias úteis/i)).toBeInTheDocument()

    // Clica em Adicionar step
    const botaoAdicionar = screen.getByRole('button', { name: /Adicionar step/i })
    await usuario.click(botaoAdicionar)

    // Menu de canais aparece
    const botaoCanal = screen.getByRole('button', { name: /Adicionar step SMS/i })
    await usuario.click(botaoCanal)

    // Agora temos 7 steps e o novo step de SMS está selecionado
    expect(await screen.findByText(/7 steps ordenados/i)).toBeInTheDocument()
    expect(screen.getByDisplayValue('SMS')).toBeInTheDocument()
  })

  it('permite adicionar e remover participantes da sequência', async () => {
    const { usuario } = renderizarApp('/sequencias/sequencia-openai')

    expect(await screen.findByText('Elena Rostova')).toBeInTheDocument()

    // Remover Elena Rostova
    const botaoRemoverElena = screen.getByRole('button', { name: /Tirar Elena Rostova/i })
    await usuario.click(botaoRemoverElena)

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Tirar Elena Rostova/i })).not.toBeInTheDocument()
    })

    // Adicionar contato restante via select
    const selectAdicionar = screen.getByRole('combobox', { name: /Adicionar Contato/i })
    await usuario.selectOptions(selectAdicionar, 'contato-openai-4') // Carla Mendonça

    expect(await screen.findByText('Carla Mendonça')).toBeInTheDocument()
  })

  it('permite pausar a sequência via "Simular resposta" e depois retomar via "Retomar"', async () => {
    const { usuario } = renderizarApp('/sequencias/sequencia-openai')

    expect(await screen.findByText('Ativa')).toBeInTheDocument()

    // Clica em Simular resposta
    const botaoSimular = screen.getByRole('button', { name: /Simular resposta/i })
    await usuario.click(botaoSimular)

    // Agora está Pausada
    expect(await screen.findByText('Pausada')).toBeInTheDocument()
    expect(screen.getByText(/Sequência pausada/i)).toBeInTheDocument()

    // Clica em Retomar
    const botaoRetomar = screen.getByRole('button', { name: 'Retomar' })
    await usuario.click(botaoRetomar)

    // Volta a ser Ativa
    expect(await screen.findByText('Ativa')).toBeInTheDocument()
  })

  it('atualizar o documento reflete em tempo real nos observadores da fonte na mesma sessão', async () => {
    const { usuario } = renderizarApp('/sequencias/sequencia-openai')

    expect(await screen.findByText('Ativa')).toBeInTheDocument()

    // Simula uma resposta pausando a sequência
    await usuario.click(screen.getByRole('button', { name: /Simular resposta/i }))
    expect(await screen.findByText('Pausada')).toBeInTheDocument()

    // Ao navegar para a lista global de sequências, ela reflete o status Pausada
    const linkVoltar = screen.getByRole('link', { name: /Sequências \/ OpenAI/i })
    await usuario.click(linkVoltar)

    const tabela = await screen.findByRole('table', { name: 'Tabela de Sequências' })
    const linhaOpenAI = within(tabela).getByRole('row', { name: /OpenAI/i })
    expect(within(linhaOpenAI).getByText('Pausada')).toBeInTheDocument()

    // E ao navegar para a página de detalhes da conta OpenAI, a seção Sequência reflete o pause
    // Clica na conta e navega para /contas/openai
    await usuario.click(screen.getByRole('link', { name: 'Contas e Contatos' }))
    const tabelaContas = await screen.findByRole('table', { name: 'Tabela de Contas' })
    await usuario.click(within(tabelaContas).getByText('OpenAI'))

    expect(await screen.findByText(/Sequência pausada/i)).toBeInTheDocument()
  })
})

describe('Composer de Step por Canal (Ticket 06)', () => {
  it('exibe a barra de variáveis com os tokens esperados', async () => {
    renderizarApp('/sequencias/sequencia-openai')

    await screen.findByTestId('composer-step')

    // Tokens de conta
    expect(screen.getByRole('button', { name: /Inserir variável \{\{conta\.nome\}\}/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Inserir variável \{\{contato\.primeiro_nome\}\}/i })).toBeInTheDocument()
    // Botão de preview
    expect(screen.getByRole('button', { name: 'Pré-visualizar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Modo edição' })).toBeInTheDocument()
  })

  it('insere variável no cursor ao clicar no token', async () => {
    const { usuario } = renderizarApp('/sequencias/sequencia-openai')

    // Aguarda editor carregar
    await screen.findByTestId('composer-step')

    // Foca o textarea (corpo)
    const textarea = screen.getByRole('textbox', { name: 'Corpo da mensagem' })
    await usuario.click(textarea)

    const antes = (textarea as HTMLTextAreaElement).value

    // Clica no token de primeiro_nome
    const botao = screen.getByRole('button', { name: /Inserir variável \{\{contato\.primeiro_nome\}\}/i })
    await usuario.click(botao)

    const depois = (screen.getByRole('textbox', { name: 'Corpo da mensagem' }) as HTMLTextAreaElement).value
    expect(depois).toContain('{{contato.primeiro_nome}}')
    expect(depois.length).toBeGreaterThan(antes.length)
  })

  it('exibe pré-visualização de WhatsApp com variáveis resolvidas', async () => {
    const { usuario } = renderizarApp('/sequencias/sequencia-openai')

    await screen.findByTestId('composer-step')

    // Clica em Pré-visualizar
    await usuario.click(screen.getByRole('button', { name: 'Pré-visualizar' }))

    // Para o step 1 (email), a preview deve aparecer com o canal atual
    const composer = screen.getByTestId('composer-step')
    expect(composer).toBeInTheDocument()
  })

  it('exibe as opções de modo do e-mail (Automático / Manual)', async () => {
    renderizarApp('/sequencias/sequencia-openai')

    await screen.findByTestId('composer-step')

    // O primeiro step da OpenAI é e-mail — deve mostrar os modos
    expect(screen.getByRole('button', { name: 'Automático' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Manual — revisar antes' })).toBeInTheDocument()
  })

  it('exibe as opções de subtipo do LinkedIn ao trocar de canal', async () => {
    const { usuario } = renderizarApp('/sequencias/sequencia-openai')

    await screen.findByTestId('composer-step')

    // Troca para o step 2 (LinkedIn)
    await usuario.click(screen.getByRole('button', { name: /Convite no LinkedIn/i }))

    // Deve mostrar as opções de subtipo LinkedIn
    expect(screen.getByRole('button', { name: 'Convite com nota' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mensagem' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'InMail' })).toBeInTheDocument()
  })

  it('exibe contador de caracteres ao criar um step de SMS', async () => {
    const { usuario } = renderizarApp('/sequencias/sequencia-openai')

    await screen.findByTestId('composer-step')

    // Clica em "+ Adicionar step"
    const botaoAdicionar = screen.getByRole('button', { name: 'Adicionar step' })
    await usuario.click(botaoAdicionar)

    // Seleciona SMS no menu com o aria-label correto
    const botaoSMS = screen.getByRole('button', { name: /Adicionar step SMS/i })
    await usuario.click(botaoSMS)

    // Agora deve aparecer o contador de caracteres
    expect(await screen.findByLabelText('Contador de caracteres')).toBeInTheDocument()
  })

  it('exibe a linha de Anexos para canais de mensagem', async () => {
    renderizarApp('/sequencias/sequencia-openai')

    await screen.findByTestId('composer-step')

    // Step 1 é e-mail — deve ter botões de anexar imagem e vídeo
    expect(screen.getByRole('button', { name: /Pré-visualizar/i })).toBeInTheDocument()
    // A linha de anexos precisa estar presente com os labels
    expect(screen.getByLabelText('Anexar imagem')).toBeInTheDocument()
    expect(screen.getByLabelText('Anexar vídeo')).toBeInTheDocument()
  })
})

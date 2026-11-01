import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderizarApp } from '@/test/renderizar'

describe('Espelho e Fecho da Demo (Ticket 10)', () => {
  it('roteiro demo fecha ponta a ponta: Sinal quente -> Conversa -> Participantes -> Documento -> Conta -> Lista sem divergência', async () => {
    const { usuario } = renderizarApp('/')

    // 1. Ponto de partida: Grade de Agentes continua sendo a home
    expect(await screen.findByRole('heading', { level: 1, name: 'Agentes' })).toBeInTheDocument()

    // 2. Aciona o roteiro demo pela sugestão na home
    const botaoSugestao = await screen.findByRole('button', {
      name: 'Montar sequência para Conta Quente com Sinal',
    })
    await usuario.click(botaoSugestao)

    // 3. Conversa Coordenada abre e exibe as etapas Scopus -> Ethos e a oferta de sequência para OpenAI
    expect(await screen.findByRole('heading', { level: 1, name: 'Conversa' })).toBeInTheDocument()
    const oferta = await screen.findByRole('article', {
      name: /Oferta de sequência: OpenAI/i,
    })
    expect(within(oferta).getByText(/Montar sequência de abordagem para OpenAI/i)).toBeInTheDocument()
    expect(within(oferta).getByText(/Abriu 3 vagas de engenharia de dados de avaliação/i)).toBeInTheDocument()

    // 4. Humano confirma a oferta para ver sugestão de participantes pelo Rhetor
    await usuario.click(within(oferta).getByRole('button', { name: /Montar sequência/i }))

    const secaoParticipantes = await screen.findByRole('article', {
      name: /Sugestão de participantes: OpenAI/i,
    })
    expect(secaoParticipantes).toBeInTheDocument()

    // 5. Humano personaliza participantes (não inclui o comitê inteiro no automático)
    const grupo = within(secaoParticipantes).getByRole('group', {
      name: 'Contatos participantes da sequência',
    })
    const checkElena = within(grupo).getByRole('checkbox', { name: /Elena Rostova/i })
    const checkMarcus = within(grupo).getByRole('checkbox', { name: /Marcus Vance/i })

    await usuario.click(checkElena) // inclui Elena
    await usuario.click(checkMarcus) // remove Marcus

    // 6. Confirma participantes e gera o documento vivo na Conversa
    await usuario.click(
      within(secaoParticipantes).getByRole('button', {
        name: /Confirmar participantes e gerar sequência/i,
      }),
    )

    // 7. Superfície 1: Documento vivo na Conversa
    const docConversa = await screen.findByRole('article', {
      name: /Documento da sequência: OpenAI/i,
    })
    expect(docConversa).toBeInTheDocument()
    expect(within(docConversa).getByText('2 contatos participantes')).toBeInTheDocument()
    expect(within(docConversa).getByText('Sarah Chen')).toBeInTheDocument()
    expect(within(docConversa).getByText('Elena Rostova')).toBeInTheDocument()

    // Mostra regra de pause account-first
    expect(
      within(docConversa).getByText(/Regra de pause na Conta-alvo/i),
    ).toBeInTheDocument()

    // Mostra proposta de Aprovação simulada pós-documento
    const secaoAprovacao = await screen.findByRole('region', {
      name: 'Aprovação pós-documento',
    })
    expect(
      await within(secaoAprovacao).findByRole('article', {
        name: /Aprovação pendente: Ativar sequência da Conta-alvo OpenAI/i,
      }),
    ).toBeInTheDocument()

    // 8. Navega para a Superfície 2: Bloco no detalhe da Conta-alvo (via link Ver Conta-alvo)
    const linkConta = within(docConversa).getByRole('link', { name: 'Ver Conta-alvo' })
    await usuario.click(linkConta)

    expect(await screen.findByRole('heading', { level: 2, name: 'OpenAI' })).toBeInTheDocument()
    const secaoConta = await screen.findByRole('region', { name: 'Sequência' })
    expect(within(secaoConta).getByText('Ativa')).toBeInTheDocument()
    expect(within(secaoConta).getByText('2 contatos participantes')).toBeInTheDocument()

    // 9. Do detalhe da Conta-alvo, navega para o Detalhe completo da Sequência
    const linkVerSequencia = within(secaoConta).getByRole('link', { name: /Ver sequência/i })
    await usuario.click(linkVerSequencia)

    // Detalhe da sequência abre com as mesmas informações sem divergência
    expect(await screen.findByRole('heading', { level: 1, name: 'Sequências' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /OpenAI/i })).toBeInTheDocument()
    expect(screen.getByText('2 contatos participantes')).toBeInTheDocument()

    // 10. Navega para a Superfície 3: Lista Global de Sequências no Workspace
    await usuario.click(screen.getByRole('link', { name: /Sequências \/ OpenAI/i }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Sequências' })).toBeInTheDocument()
    const tabela = screen.getByRole('table', { name: 'Tabela de Sequências' })
    const linhaOpenAI = within(tabela).getByRole('row', { name: /OpenAI/i })
    expect(within(linhaOpenAI).getByText('Ativa')).toBeInTheDocument()
    expect(within(linhaOpenAI).getByText(/2 contatos/i)).toBeInTheDocument()
  })

  it('editar no Detalhe da Sequência atualiza o bloco da Conta e a Lista Global na mesma sessão', async () => {
    const { usuario } = renderizarApp('/sequencias/sequencia-openai')

    // Abre o detalhe existente da OpenAI
    expect(await screen.findByRole('heading', { level: 2, name: /OpenAI/i })).toBeInTheDocument()
    expect(screen.getByText('3 contatos participantes')).toBeInTheDocument()

    // Pausa a sequência via botão "Simular resposta"
    const botaoSimular = screen.getByRole('button', { name: 'Simular resposta' })
    await usuario.click(botaoSimular)

    // Detalhe exibe estado Pausada com banner explícito de pausa da conta inteira
    expect(await screen.findByText('Pausada')).toBeInTheDocument()
    expect(screen.getByText(/Pausa da Conta inteira/i)).toBeInTheDocument()

    // Navega para o Detalhe da Conta-alvo via link no cabeçalho
    const linkConta = screen.getByRole('link', { name: 'Ver Conta-alvo' })
    await usuario.click(linkConta)

    // Detalhe da Conta-alvo reflete imediatamente o estado Pausada na mesma sessão
    expect(await screen.findByRole('heading', { level: 2, name: 'OpenAI' })).toBeInTheDocument()
    const secaoConta = await screen.findByRole('region', { name: 'Sequência' })
    expect(within(secaoConta).getByText('Pausada')).toBeInTheDocument()
    expect(within(secaoConta).getByText(/Pausa da Conta inteira/i)).toBeInTheDocument()

    // Navega para a Lista Global pela sidebar
    const navWorkspace = screen.getByRole('navigation', { name: 'Workspace' })
    await usuario.click(within(navWorkspace).getByRole('link', { name: 'Sequências' }))

    // Lista Global reflete imediatamente que a sequência da OpenAI está Pausada com selo Pausa da Conta
    const tabela = await screen.findByRole('table', { name: 'Tabela de Sequências' })
    const linhaOpenAI = within(tabela).getByRole('row', { name: /OpenAI/i })
    expect(within(linhaOpenAI).getByText('Pausada')).toBeInTheDocument()
    expect(within(linhaOpenAI).getByText(/Pausa da Conta/i)).toBeInTheDocument()
  })

  it('editar na Conversa reflete imediatamente no detalhe da Conta e na Lista Global', async () => {
    const { usuario } = renderizarApp('/')

    // Gera a sequência na Conversa
    await usuario.click(
      await screen.findByRole('button', {
        name: 'Montar sequência para Conta Quente com Sinal',
      }),
    )
    await usuario.click(await screen.findByRole('button', { name: /Montar sequência/i }))
    await usuario.click(
      await screen.findByRole('button', {
        name: /Confirmar participantes e gerar sequência/i,
      }),
    )

    // Documento na Conversa
    const docConversa = await screen.findByRole('article', {
      name: /Documento da sequência: OpenAI/i,
    })
    expect(docConversa).toBeInTheDocument()

    // Simula resposta diretamente no documento da Conversa
    const botaoSimular = within(docConversa).getByRole('button', { name: 'Simular resposta' })
    await usuario.click(botaoSimular)

    // O documento na conversa agora mostra Pausada
    expect(await within(docConversa).findByText('Pausada')).toBeInTheDocument()
    expect(await within(docConversa).findByText(/Pausa da Conta inteira/i)).toBeInTheDocument()

    // Navega para o Detalhe da Conta OpenAI
    await usuario.click(within(docConversa).getByRole('link', { name: 'Ver Conta-alvo' }))
    const secaoConta = await screen.findByRole('region', { name: 'Sequência' })
    expect(await within(secaoConta).findByText('Pausada')).toBeInTheDocument()
    expect(within(secaoConta).getByText(/Pausa da Conta inteira/i)).toBeInTheDocument()

    // Navega para a Lista Global
    const navWorkspace = screen.getByRole('navigation', { name: 'Workspace' })
    await usuario.click(within(navWorkspace).getByRole('link', { name: 'Sequências' }))
    const tabela = await screen.findByRole('table', { name: 'Tabela de Sequências' })
    const linha = within(tabela).getByRole('row', { name: /OpenAI/i })
    expect(within(linha).getByText('Pausada')).toBeInTheDocument()
    expect(within(linha).getByText(/Pausa da Conta/i)).toBeInTheDocument()
  })

  it('selo Demonstração permanece visível em todas as superfícies e nada finge envio real', async () => {
    // 1. Sequência com métricas de demonstração (Anthropic)
    const { usuario } = renderizarApp('/sequencias/sequencia-anthropic')

    // Selo permanente na sidebar da Casca
    const sidebar = await screen.findByRole('complementary', { name: 'Navegação' })
    expect(within(sidebar).getByText('Demonstração')).toBeInTheDocument()

    // Selo de Métricas de Demonstração no cabeçalho
    expect(screen.getByTitle('Métricas de demonstração')).toBeInTheDocument()

    // Rodapé do step composer rotulado explicitamente como Demonstração
    const composer = screen.getByTestId('composer-step')
    expect(within(composer).getByText('Demonstração')).toBeInTheDocument()

    // 2. Sequência ativa da OpenAI comprova que nada finge envio real
    await usuario.click(screen.getByRole('link', { name: /Sequências \/ Anthropic/i }))
    const tabela = await screen.findByRole('table', { name: 'Tabela de Sequências' })
    await usuario.click(within(tabela).getByRole('link', { name: 'OpenAI' }))

    // Botão Simular resposta com aviso de demonstração
    expect(screen.getByTitle('Demonstração')).toBeInTheDocument()

    // Step ainda não enviado deixa explícito: "Ainda não enviado · nada sai deste protótipo"
    expect(screen.getByText(/Ainda não enviado · nada sai deste protótipo/i)).toBeInTheDocument()
  })

  it('critérios account-first da spec: Conta com 1 Contato é válida e convive com Contas e Agentes', async () => {
    const { usuario } = renderizarApp('/contas/cloudflare')

    // Cloudflare possui apenas 1 contato mapeado
    expect(await screen.findByRole('heading', { level: 2, name: 'Cloudflare' })).toBeInTheDocument()
    const secaoSeq = await screen.findByRole('region', { name: 'Sequência' })

    // Sequência de 1 contato é totalmente válida, sem erros
    expect(within(secaoSeq).getByText('Ativa')).toBeInTheDocument()
    expect(within(secaoSeq).getByText('1 contato participante')).toBeInTheDocument()

    // Abre o detalhe da sequência da Cloudflare
    await usuario.click(within(secaoSeq).getByRole('link', { name: /Ver sequência/i }))
    expect(await screen.findByRole('heading', { level: 2, name: /Cloudflare/i })).toBeInTheDocument()
    expect(screen.getByText('1 contato participante')).toBeInTheDocument()

    // Navega para a grade de Agentes e depois para Contas comprovando convivência perfeita
    const navWorkspace = screen.getByRole('navigation', { name: 'Workspace' })
    await usuario.click(within(navWorkspace).getByRole('link', { name: 'Agentes' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Agentes' })).toBeInTheDocument()

    await usuario.click(within(navWorkspace).getByRole('link', { name: 'Contas e Contatos' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Contas' })).toBeInTheDocument()
  })
})

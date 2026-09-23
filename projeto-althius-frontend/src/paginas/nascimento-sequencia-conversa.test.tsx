import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderizarApp } from '@/test/renderizar'

describe('Nascimento de Sequência na Conversa (Ticket 07)', () => {
  it('o roteiro oferece a sequência e exige confirmação humana antes de gravar na fonte', async () => {
    const { usuario } = renderizarApp('/')

    // Sugestão clicável na página inicial de Agentes
    const botaoSugestao = await screen.findByRole('button', {
      name: 'Montar sequência para Conta Quente com Sinal',
    })
    expect(botaoSugestao).toBeInTheDocument()

    await usuario.click(botaoSugestao)

    // Abre a Conversa coordenada
    expect(await screen.findByRole('heading', { level: 1, name: 'Conversa' })).toBeInTheDocument()

    // Card de oferta de sequência visível na Conversa após as etapas da Coordenação
    const oferta = await screen.findByRole('article', {
      name: /Oferta de sequência: OpenAI/i,
    })
    expect(oferta).toBeInTheDocument()
    expect(within(oferta).getByText(/Montar sequência de abordagem para OpenAI/i)).toBeInTheDocument()
    expect(within(oferta).getByText(/Abriu 3 vagas de engenharia de dados de avaliação/i)).toBeInTheDocument()
    expect(within(oferta).getByText(/Exige confirmação humana antes de gravar na conta/i)).toBeInTheDocument()

    // Coordenação chamou Scopus e Ethos
    const etapas = screen.getByRole('list', { name: 'Agentes chamados' })
    expect(within(etapas).getByText(/OpenAI é Conta Quente \(aderência 87\)/i)).toBeInTheDocument()
    expect(within(etapas).getByText(/Mapeou 3 papéis do Comitê de compra/i)).toBeInTheDocument()

    // Botão de confirmação de montagem disponível
    const botaoMontar = within(oferta).getByRole('button', { name: /Montar sequência/i })
    expect(botaoMontar).toBeInTheDocument()

    // Documento de sequência ainda NÃO foi renderizado na conversa
    expect(screen.queryByRole('article', { name: /Documento da sequência/i })).not.toBeInTheDocument()
  })

  it('o Rhetor sugere participantes e a confirmação humana altera a lista antes de persistir', async () => {
    const { usuario } = renderizarApp('/')

    await usuario.click(
      await screen.findByRole('button', {
        name: 'Montar sequência para Conta Quente com Sinal',
      }),
    )

    const oferta = await screen.findByRole('article', {
      name: /Oferta de sequência: OpenAI/i,
    })
    const botaoMontar = within(oferta).getByRole('button', { name: /Montar sequência/i })
    await usuario.click(botaoMontar)

    // Transiciona para a tela de sugestão de participantes pelo Rhetor
    const secaoParticipantes = await screen.findByRole('article', {
      name: /Sugestão de participantes: OpenAI/i,
    })
    expect(secaoParticipantes).toBeInTheDocument()

    // Rhetor sugere personas prioritárias (Sarah Chen e Marcus Vance), mas NÃO inclui o comitê inteiro no automático
    const grupo = within(secaoParticipantes).getByRole('group', {
      name: 'Contatos participantes da sequência',
    })
    const checkSarah = within(grupo).getByRole('checkbox', { name: /Sarah Chen/i })
    const checkMarcus = within(grupo).getByRole('checkbox', { name: /Marcus Vance/i })
    const checkElena = within(grupo).getByRole('checkbox', { name: /Elena Rostova/i })
    const checkCarla = within(grupo).getByRole('checkbox', { name: /Carla Mendonça/i })

    expect(checkSarah).toBeChecked()
    expect(checkMarcus).toBeChecked()
    expect(checkElena).not.toBeChecked()
    expect(checkCarla).not.toBeChecked()

    // Badges de "Sugerido pelo Rhetor" nos contatos pré-selecionados
    expect(within(grupo).getAllByText(/Sugerido pelo Rhetor/i)).toHaveLength(2)

    // Humano altera a lista: inclui Elena Rostova e desmarca Marcus Vance
    await usuario.click(checkElena)
    expect(checkElena).toBeChecked()

    await usuario.click(checkMarcus)
    expect(checkMarcus).not.toBeChecked()

    // Contador atualizado
    expect(within(secaoParticipantes).getByText('2 participantes selecionados de 4')).toBeInTheDocument()

    // Confirma participantes e gera o documento
    const botaoConfirmar = within(secaoParticipantes).getByRole('button', {
      name: /Confirmar participantes e gerar sequência/i,
    })
    await usuario.click(botaoConfirmar)

    // Documento gerado e persistido
    const docConversa = await screen.findByRole('article', {
      name: /Documento da sequência: OpenAI/i,
    })
    expect(docConversa).toBeInTheDocument()
    expect(within(docConversa).getByText(/Documento vivo da sequência/i)).toBeInTheDocument()
    expect(within(docConversa).getByText('2 contatos participantes')).toBeInTheDocument()

    const barraParticipantes = within(docConversa).getByText(/Participantes ·/i).closest('div')!
    expect(within(barraParticipantes).getByText('Sarah Chen')).toBeInTheDocument()
    expect(within(barraParticipantes).getByText('Elena Rostova')).toBeInTheDocument()
    expect(within(barraParticipantes).getByRole('button', { name: /Tirar Sarah Chen/i })).toBeInTheDocument()
    expect(within(barraParticipantes).getByRole('button', { name: /Tirar Elena Rostova/i })).toBeInTheDocument()
    expect(within(barraParticipantes).queryByRole('button', { name: /Tirar Marcus Vance/i })).not.toBeInTheDocument()
  })

  it('o documento na Conversa usa a mesma sequência da fonte que o detalhe e espelha alterações', async () => {
    const { usuario } = renderizarApp('/')

    await usuario.click(
      await screen.findByRole('button', {
        name: 'Montar sequência para Conta Quente com Sinal',
      }),
    )

    // Avança oferta -> participantes -> documento
    const botaoMontar = await screen.findByRole('button', { name: /Montar sequência/i })
    await usuario.click(botaoMontar)

    const botaoConfirmar = await screen.findByRole('button', {
      name: /Confirmar participantes e gerar sequência/i,
    })
    await usuario.click(botaoConfirmar)

    // Documento na Conversa
    const docConversa = await screen.findByRole('article', {
      name: /Documento da sequência: OpenAI/i,
    })
    expect(docConversa).toBeInTheDocument()

    // Tem timeline, regra de pause e campos de composer
    expect(within(docConversa).getByText(/Regra de pause na Conta-alvo/i)).toBeInTheDocument()
    expect(within(docConversa).getByText('Abertura pelo Sinal')).toBeInTheDocument()

    // Atalho para Ver Conta-alvo navega para o detalhe da empresa
    const linkConta = within(docConversa).getByRole('link', { name: 'Ver Conta-alvo' })
    await usuario.click(linkConta)

    // Na página de detalhe da Conta, a seção Sequência espelha os mesmos dados
    expect(await screen.findByRole('heading', { level: 2, name: 'OpenAI' })).toBeInTheDocument()
    const secaoSeq = await screen.findByRole('region', { name: 'Sequência' })
    expect(within(secaoSeq).getByText('Ativa')).toBeInTheDocument()
    expect(within(secaoSeq).getByText('2 contatos participantes')).toBeInTheDocument()

    // E na lista global de sequências, a linha também reflete
    await usuario.click(
      within(screen.getByRole('navigation', { name: 'Workspace' })).getByRole('link', {
        name: 'Sequências',
      }),
    )
    expect(await screen.findByRole('heading', { level: 1, name: 'Sequências' })).toBeInTheDocument()
    const tabela = screen.getByRole('table', { name: 'Tabela de Sequências' })
    const linhaOpenAI = within(tabela).getByRole('row', { name: /OpenAI/i })
    expect(within(linhaOpenAI).getByText(/2 contatos/i)).toBeInTheDocument()
  })

  it('Conta com 1 Contato no roteiro ainda consegue nascer sequência', async () => {
    const { usuario } = renderizarApp('/')

    // Sugestão clicável para Conta com 1 Contato (Okta)
    const botaoOkta = await screen.findByRole('button', {
      name: 'Montar sequência para Conta com 1 Contato (Okta)',
    })
    await usuario.click(botaoOkta)

    // Abre a Conversa coordenada
    expect(await screen.findByRole('heading', { level: 1, name: 'Conversa' })).toBeInTheDocument()

    // Aguarda a oferta para Okta (última etapa do fluxo coordenado)
    const oferta = await screen.findByRole('article', {
      name: /Oferta de sequência: Okta/i,
    })
    expect(oferta).toBeInTheDocument()
    expect(within(oferta).getByText(/Montar sequência de abordagem para Okta/i)).toBeInTheDocument()
    expect(
      within(oferta).getByText(/Anunciou nova rodada de expansão em segurança de identidade/i),
    ).toBeInTheDocument()

    // Scopus e Ethos identificam Okta e seu contato único
    const etapas = screen.getByRole('list', { name: 'Agentes chamados' })
    expect(within(etapas).getByText(/Okta é Conta Quente/i)).toBeInTheDocument()
    expect(within(etapas).getByText(/Identificou 1 contato-chave mapeado: Fernando Guedes/i)).toBeInTheDocument()

    // Humano confirma a oferta
    await usuario.click(within(oferta).getByRole('button', { name: /Montar sequência/i }))

    // Sugestão de participantes mostra o contato único selecionado
    const secaoParticipantes = await screen.findByRole('article', {
      name: /Sugestão de participantes: Okta/i,
    })
    expect(secaoParticipantes).toBeInTheDocument()
    expect(
      within(secaoParticipantes).getByText(/Conta com 1 contato: uma sequência focada é válida e recomendada/i),
    ).toBeInTheDocument()

    const checkFernando = within(secaoParticipantes).getByRole('checkbox', {
      name: /Fernando Guedes/i,
    })
    expect(checkFernando).toBeChecked()

    // Humano confirma e cria a sequência
    await usuario.click(
      within(secaoParticipantes).getByRole('button', {
        name: /Confirmar participantes e gerar sequência/i,
      }),
    )

    // Documento gerado na Conversa para a Okta
    const docConversa = await screen.findByRole('article', {
      name: /Documento da sequência: Okta/i,
    })
    expect(docConversa).toBeInTheDocument()
    expect(within(docConversa).getByText('1 contato participante')).toBeInTheDocument()
    expect(within(docConversa).getByText('Fernando Guedes')).toBeInTheDocument()
    expect(within(docConversa).getByText('Ativa')).toBeInTheDocument()

    // Verifica que navegar para o detalhe da Okta agora mostra a sequência ativa
    const linkConta = within(docConversa).getByRole('link', { name: 'Ver Conta-alvo' })
    await usuario.click(linkConta)

    expect(await screen.findByRole('heading', { level: 2, name: 'Okta' })).toBeInTheDocument()
    const secaoSeqOkta = await screen.findByRole('region', { name: 'Sequência' })
    expect(within(secaoSeqOkta).getByText('Ativa')).toBeInTheDocument()
    expect(within(secaoSeqOkta).getByText('1 contato participante')).toBeInTheDocument()
    expect(within(secaoSeqOkta).getByRole('link', { name: /Ver sequência/i })).toHaveAttribute(
      'href',
      '/sequencias/sequencia-okta',
    )
  })
})

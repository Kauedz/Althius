import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { navegarPara } from '@/test/navegar'
import { renderizarApp, renderizarAppNoNavegador } from '@/test/renderizar'

describe('Aprovação simulada pós-documento (Ticket 08)', () => {
  it('após gravar a sequência na Conversa, surge Aprovação pendente identificando Conta-alvo e sequência', async () => {
    const { usuario } = renderizarApp('/')

    // Inicia fluxo coordenado a partir da sugestão de sinal quente
    await usuario.click(
      await screen.findByRole('button', {
        name: 'Montar sequência para Conta Quente com Sinal',
      }),
    )

    // Oferta -> Participantes -> Confirmar e gerar sequência
    const botaoMontar = await screen.findByRole('button', { name: /Montar sequência/i })
    await usuario.click(botaoMontar)

    const botaoConfirmar = await screen.findByRole('button', {
      name: /Confirmar participantes e gerar sequência/i,
    })
    await usuario.click(botaoConfirmar)

    // Documento vivo exibido
    const docConversa = await screen.findByRole('article', {
      name: /Documento da sequência: OpenAI/i,
    })
    expect(docConversa).toBeInTheDocument()

    // Bloco de Aprovação pós-documento surge no padrão do app
    const secaoAprovacao = await screen.findByRole('region', {
      name: 'Aprovação pós-documento',
    })
    expect(secaoAprovacao).toBeInTheDocument()

    // Card de aprovação pendente identifica a ação, conta e sequência
    const cardAprovacao = await within(secaoAprovacao).findByRole('article', {
      name: /Aprovação pendente: Ativar sequência da Conta-alvo OpenAI/i,
    })
    expect(cardAprovacao).toBeInTheDocument()
    expect(within(cardAprovacao).getByText('Rhetor')).toBeInTheDocument()
    expect(within(cardAprovacao).getByText('Aprovação pendente')).toBeInTheDocument()
    expect(within(cardAprovacao).getByText(/Simulação \(sem envio real\)/i)).toBeInTheDocument()

    // Identificação explícita da Conta-alvo com link
    const linkConta = within(cardAprovacao).getByRole('link', { name: 'OpenAI' })
    expect(linkConta).toHaveAttribute('href', '/contas/openai')

    // Identificação explícita da Sequência com link
    const linkSeq = within(cardAprovacao).getByRole('link', { name: 'Ver sequência' })
    expect(linkSeq).toHaveAttribute('href', '/sequencias/sequencia-openai')

    // Impacto e botões de decisão
    expect(within(cardAprovacao).getByText(/steps multicanal para 2 contatos/i)).toBeInTheDocument()
    expect(within(cardAprovacao).getByRole('button', { name: 'Aprovar' })).toBeInTheDocument()
    expect(within(cardAprovacao).getByRole('button', { name: 'Recusar' })).toBeInTheDocument()
  })

  it('aprovar na Conversa marca como aprovada e registra na Atividade sem disparar envio externo', async () => {
    const { usuario } = renderizarAppNoNavegador('/')

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

    const secaoAprovacao = await screen.findByRole('region', {
      name: 'Aprovação pós-documento',
    })
    const botaoAprovar = await within(secaoAprovacao).findByRole('button', { name: 'Aprovar' })

    // Aprova a proposta diretamente na Conversa
    await usuario.click(botaoAprovar)

    // O status muda para Aprovada sem botões
    expect(await within(secaoAprovacao).findByText('Aprovada')).toBeInTheDocument()
    expect(within(secaoAprovacao).queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument()
    expect(within(secaoAprovacao).queryByRole('button', { name: 'Recusar' })).not.toBeInTheDocument()

    // A Atividade do Rhetor (só leitura desde o Sinais first 10, e fora da barra lateral) registra a decisão
    navegarPara('/agentes/rhetor/atividade')

    // Ação registrada com gatilho e link para a sequência
    const itemAtividade = await screen.findByText(
      /Aprovada na conversa: Ativar sequência da Conta-alvo OpenAI/i,
    )
    expect(itemAtividade).toBeInTheDocument()
    const containerItem = itemAtividade.closest('article') || itemAtividade.closest('li')!
    expect(within(containerItem).getByText('Ação executada.')).toBeInTheDocument()
    expect(within(containerItem).getByRole('link', { name: 'Ver sequência' })).toHaveAttribute(
      'href',
      '/sequencias/sequencia-openai',
    )
  })

  it('a Aprovação gerada aparece na Fila de Aprovações (/aprovacoes) e pode ser rejeitada sem side-effects', async () => {
    const { usuario } = renderizarAppNoNavegador('/')

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

    // Aguarda o card de aprovação surgir na Conversa
    await screen.findByRole('region', { name: 'Aprovação pós-documento' })

    // O contador de pendentes na sidebar aumentou de 2 para 3
    const navWorkspace = screen.getByRole('navigation', { name: 'Workspace' })
    const linkAprovacoes = await within(navWorkspace).findByRole('link', {
      name: 'Aprovações, 3 pendentes',
    })
    expect(linkAprovacoes).toBeInTheDocument()

    // Navega para a Fila de Aprovações
    await usuario.click(linkAprovacoes)
    expect(await screen.findByRole('heading', { level: 1, name: 'Aprovações' })).toBeInTheDocument()

    // Cartão da sequência OpenAI listado na fila
    const cartaoFila = await screen.findByRole('article', {
      name: /Ativar sequência da Conta-alvo OpenAI/i,
    })
    expect(cartaoFila).toBeInTheDocument()

    // Mostra Conta-alvo e Sequência no cartão da fila
    expect(within(cartaoFila).getByRole('link', { name: 'OpenAI' })).toHaveAttribute(
      'href',
      '/contas/openai',
    )
    expect(within(cartaoFila).getByRole('link', { name: 'Ver sequência' })).toHaveAttribute(
      'href',
      '/sequencias/sequencia-openai',
    )

    // Recusa a proposta na fila
    await usuario.click(within(cartaoFila).getByRole('button', { name: 'Recusar' }))

    // Fica marcada como Recusada
    expect(await within(cartaoFila).findByText('Recusada')).toBeInTheDocument()

    // Contador de pendentes na sidebar volta para 2
    expect(
      await within(navWorkspace).findByRole('link', { name: 'Aprovações, 2 pendentes' }),
    ).toBeInTheDocument()

    // Na Atividade do Rhetor (só leitura), o registro reflete a rejeição sem envio externo
    navegarPara('/agentes/rhetor/atividade')

    const itemAtividade = await screen.findByText(
      /Recusada na fila: Ativar sequência da Conta-alvo OpenAI/i,
    )
    expect(itemAtividade).toBeInTheDocument()
    const containerItem = itemAtividade.closest('article') || itemAtividade.closest('li')!
    expect(within(containerItem).getByText('Nada foi alterado.')).toBeInTheDocument()
  })

  it('Conta com 1 Contato (Okta) também propõe Aprovação pós-documento identificando Conta e Sequência', async () => {
    const { usuario } = renderizarApp('/')

    await usuario.click(
      await screen.findByRole('button', {
        name: 'Montar sequência para Conta com 1 Contato (Okta)',
      }),
    )

    await usuario.click(await screen.findByRole('button', { name: /Montar sequência/i }))
    await usuario.click(
      await screen.findByRole('button', {
        name: /Confirmar participantes e gerar sequência/i,
      }),
    )

    // Documento e Aprovação pós-documento para Okta
    const secaoAprovacao = await screen.findByRole('region', {
      name: 'Aprovação pós-documento',
    })
    expect(secaoAprovacao).toBeInTheDocument()

    const cardAprovacao = await within(secaoAprovacao).findByRole('article', {
      name: /Aprovação pendente: Ativar sequência da Conta-alvo Okta/i,
    })
    expect(cardAprovacao).toBeInTheDocument()

    // Identifica Conta-alvo Okta e Sequência da Okta
    expect(within(cardAprovacao).getByRole('link', { name: 'Okta' })).toHaveAttribute(
      'href',
      '/contas/okta',
    )
    expect(within(cardAprovacao).getByRole('link', { name: 'Ver sequência' })).toHaveAttribute(
      'href',
      '/sequencias/sequencia-okta',
    )
    expect(within(cardAprovacao).getByText(/4 steps multicanal para 1 contato/i)).toBeInTheDocument()

    // Aprova
    await usuario.click(within(cardAprovacao).getByRole('button', { name: 'Aprovar' }))
    expect(await within(cardAprovacao).findByText('Aprovada')).toBeInTheDocument()
  })
})

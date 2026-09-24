import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderizarApp } from '@/test/renderizar'

describe('Bloco Sequência no detalhe da Conta-alvo (Ticket 04)', () => {
  it('mostra a seção Sequência com status, cobertura, steps e atalho para o documento quando houver sequência', async () => {
    const { usuario } = renderizarApp('/contas/openai')

    // Seção Sequência
    const secaoSequencia = await screen.findByRole('region', { name: 'Sequência' })
    expect(secaoSequencia).toBeInTheDocument()

    // Status 'Ativa'
    expect(within(secaoSequencia).getByText('Ativa')).toBeInTheDocument()

    // Cobertura e progresso
    expect(within(secaoSequencia).getByText('3 contatos participantes')).toBeInTheDocument()
    expect(within(secaoSequencia).getByText(/Passo atual: 1 de 6/i)).toBeInTheDocument()

    // Atalho para abrir o documento completo da sequência
    const linkVerSequencia = within(secaoSequencia).getByRole('link', { name: /Ver sequência/i })
    expect(linkVerSequencia).toHaveAttribute('href', '/sequencias/sequencia-openai')

    // Clicar no atalho navega para o detalhe da sequência
    await usuario.click(linkVerSequencia)
    expect(await screen.findByText(/Sequências \/ OpenAI/i)).toBeInTheDocument()
    expect(screen.getByText(/Regra de pause na Conta-alvo/i)).toBeInTheDocument()
  })

  it('mostra a seção Sequência com status Pausada e aviso explicativo quando a sequência estiver pausada', async () => {
    renderizarApp('/contas/anthropic')

    const secaoSequencia = await screen.findByRole('region', { name: 'Sequência' })
    expect(secaoSequencia).toBeInTheDocument()

    expect(within(secaoSequencia).getByText('Pausada')).toBeInTheDocument()
    expect(within(secaoSequencia).getByText('3 contatos participantes')).toBeInTheDocument()
    expect(
      within(secaoSequencia).getByText(/Alex Rivera respondeu no LinkedIn/i),
    ).toBeInTheDocument()
  })

  it('sem sequência, exibe estado vazio com mensagem orientadora e ação para criar', async () => {
    // Figma não tem sequência nas contas iniciais da demo
    renderizarApp('/contas/figma')

    const secaoSequencia = await screen.findByRole('region', { name: 'Sequência' })
    expect(secaoSequencia).toBeInTheDocument()

    expect(
      within(secaoSequencia).getByText('Nenhuma sequência nesta Conta-alvo.'),
    ).toBeInTheDocument()
    expect(
      within(secaoSequencia).getByRole('button', { name: /Criar sequência/i }),
    ).toBeInTheDocument()
  })

  it('criar sequência a partir do botão no estado vazio abre modal com conta pré-selecionada e atualiza a seção', async () => {
    const { usuario } = renderizarApp('/contas/figma')

    const secaoSequencia = await screen.findByRole('region', { name: 'Sequência' })
    const botaoCriar = within(secaoSequencia).getByRole('button', { name: /Criar sequência/i })

    await usuario.click(botaoCriar)

    // O modal abre com o título e a conta Figma pré-selecionada
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText('Nova sequência')).toBeInTheDocument()
    const selectConta = within(dialogo).getByRole('combobox', { name: 'Conta-alvo' })
    expect(selectConta).toHaveValue('figma')
    expect(selectConta).toBeDisabled()

    // Submete a criação
    const botaoSubmeter = within(dialogo).getByRole('button', { name: 'Criar sequência' })
    await usuario.click(botaoSubmeter)

    // O modal fecha e a seção agora exibe a sequência criada
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(secaoSequencia).getByText('Ativa')).toBeInTheDocument()
    expect(within(secaoSequencia).getByRole('link', { name: /Ver sequência/i })).toBeInTheDocument()
  })

  it('Conta com 1 Contato consegue ter sequência válida', async () => {
    // Cloudflare tem 1 participante na sequência na demo inicial
    renderizarApp('/contas/cloudflare')

    const secaoSequencia = await screen.findByRole('region', { name: 'Sequência' })
    expect(secaoSequencia).toBeInTheDocument()

    expect(within(secaoSequencia).getByText('Ativa')).toBeInTheDocument()
    expect(within(secaoSequencia).getByText('1 contato participante')).toBeInTheDocument()
  })

  it('tentativa de criar segunda sequência na mesma Conta é rejeitada pela fonte e prevenida na UI', async () => {
    const { fonteDeSequencias, usuario } = renderizarApp('/contas/openai')

    // 1. Rejeição no nível da Fonte de dados (comportamento único com erro)
    await expect(
      fonteDeSequencias.criarSequencia({
        contaId: 'openai',
      }),
    ).rejects.toThrow(/já possui uma sequência/i)

    // 2. Prevenção no diálogo global de nova sequência
    // Se abrir o modal global de Nova sequência e selecionar OpenAI
    await usuario.click(screen.getByRole('link', { name: 'Sequências' }))
    const botaoNovaGlobal = await screen.findByRole('button', { name: /Nova sequência/i })
    await usuario.click(botaoNovaGlobal)

    const dialogo = await screen.findByRole('dialog')
    const optionOpenAI = within(dialogo).getByRole('option', { name: /OpenAI \(já possui sequência\)/i })
    expect(optionOpenAI).toBeDisabled()
  })

})

/** O cabeçalho do detalhe, achado pelo nome da Conta-alvo em destaque. */
async function cabecalhoDa(nome: string) {
  return (await screen.findByRole('heading', { level: 2, name: nome })).closest('header')!
}

describe('Detalhe da Conta-alvo', () => {
  it('clicar no nome da empresa, que é um link, abre o detalhe', async () => {
    const { usuario } = renderizarApp('/contas')

    const tabela = await screen.findByRole('table', { name: 'Tabela de Contas' })
    const nome = within(tabela).getByRole('link', { name: 'OpenAI' })
    expect(nome).toHaveAttribute('href', '/contas/openai')
    await usuario.click(nome)

    expect(await screen.findByRole('heading', { level: 1, name: 'OpenAI' })).toBeInTheDocument()
  })

  it('clicar em qualquer ponto da linha abre o detalhe', async () => {
    const { usuario } = renderizarApp('/contas')

    const tabela = await screen.findByRole('table', { name: 'Tabela de Contas' })
    const linha = within(tabela).getByRole('link', { name: 'Stripe' }).closest('tr')!
    await usuario.click(within(linha).getAllByRole('cell')[4])

    expect(await screen.findByRole('heading', { level: 1, name: 'Stripe' })).toBeInTheDocument()
  })

  it('tem a migalha "Contas / Nome", que volta para Contas, e o item da sidebar continua ativo', async () => {
    const { usuario } = renderizarApp('/contas/openai')

    const titulo = await screen.findByRole('heading', { level: 1, name: 'OpenAI' })
    const barra = titulo.closest('header')!
    expect(barra).toHaveTextContent('Contas/OpenAI')
    expect(screen.getByRole('link', { name: 'Contas e Contatos' })).toHaveAttribute('aria-current', 'page')

    await usuario.click(within(barra).getByRole('link', { name: 'Contas' }))
    expect(await screen.findByRole('table', { name: 'Tabela de Contas' })).toBeInTheDocument()
  })

  it('o cabeçalho mostra o logo, o nome, o domínio com link para o site, o LinkedIn, o segmento e a Aderência', async () => {
    renderizarApp('/contas/openai')

    const cabecalho = await cabecalhoDa('OpenAI')
    expect(within(cabecalho).getByRole('img', { name: 'OpenAI' })).toBeInTheDocument()
    expect(within(cabecalho).getByRole('link', { name: /openai\.com/ })).toHaveAttribute('href', 'https://openai.com')
    expect(within(cabecalho).getByRole('link', { name: /LinkedIn/ })).toHaveAttribute(
      'href',
      'https://www.linkedin.com/company/openai',
    )
    expect(within(cabecalho).getByText('Inteligência Artificial')).toBeInTheDocument()
    expect(within(cabecalho).getByText('🔥 Quente')).toBeInTheDocument()
    expect(within(cabecalho).getByText('Recomendada pela Althius')).toBeInTheDocument()
  })

  it('o cabeçalho mostra só os dados que existem: sem site, o domínio não é link; sem LinkedIn nem segmento, nada aparece', async () => {
    renderizarApp('/contas/rappi')

    const cabecalho = await cabecalhoDa('Rappi')
    expect(within(cabecalho).getByRole('img', { name: 'Rappi' })).toHaveTextContent('R')
    expect(within(cabecalho).getByText('rappi.com.br')).toBeInTheDocument()
    expect(within(cabecalho).queryByRole('link')).not.toBeInTheDocument()
    expect(within(cabecalho).queryByText(/LinkedIn|Segmento/)).not.toBeInTheDocument()
    expect(within(cabecalho).getByText('Não fit')).toBeInTheDocument()
  })

  it('a Aderência ainda não avaliada aparece como na tabela', async () => {
    renderizarApp('/contas/bbva-mexico')

    const cabecalho = await cabecalhoDa('BBVA México')
    expect(within(cabecalho).getByLabelText('Aderência ainda não avaliada')).toHaveTextContent('—')
  })

  it('uma Conta-alvo importada mostra quem importou e quando', async () => {
    renderizarApp('/contas/banorte')

    const cabecalho = await cabecalhoDa('Banorte')
    const origem = within(cabecalho).getByText(/^Importada por Marina em/)
    expect(origem).toHaveTextContent('Importada por Marina em 11 set.')
    expect(within(origem).getByTitle('11 de setembro de 2026')).toBeInTheDocument()
  })

  it('as seções começam por Sinais, Contatos e Interações, nessa ordem', async () => {
    renderizarApp('/contas/openai')

    await screen.findByRole('article', { name: 'Sinal mais recente' })
    const titulos = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(titulos.slice(0, 3)).toEqual(['Sinais', 'Contatos', 'Interações'])
  })

  it('a seção Sinais mostra o mais recente em destaque, com data, fonte e quem detectou, e o histórico abaixo', async () => {
    renderizarApp('/contas/openai')

    const secao = await screen.findByRole('region', { name: 'Sinais' })
    const destaque = await within(secao).findByRole('article', { name: 'Sinal mais recente' })
    expect(destaque).toHaveTextContent('Abriu 3 vagas de engenharia de dados de avaliação')
    expect(within(destaque).getByTitle('21 de setembro de 2026')).toHaveTextContent('Há 2 dias')
    expect(destaque).toHaveTextContent('Fonte: LinkedIn Jobs')
    expect(destaque).toHaveTextContent('Detectado por Scopus')

    const historico = within(secao).getByRole('list', { name: 'Histórico de sinais' })
    const itens = within(historico).getAllByRole('listitem')
    expect(itens).toHaveLength(1)
    expect(itens[0]).toHaveTextContent('Publicou novo relatório de alinhamento e avaliação de modelos')
    expect(itens[0]).toHaveTextContent('Fonte: Blog da OpenAI')
    expect(itens[0]).toHaveTextContent('Detectado por Scopus')
  })

  it('o Sinal em destaque não inventa quem o detectou, e sem outros Sinais não há histórico', async () => {
    renderizarApp('/contas/twilio')

    const secao = await screen.findByRole('region', { name: 'Sinais' })
    const destaque = await within(secao).findByRole('article', { name: 'Sinal mais recente' })
    expect(destaque).toHaveTextContent('Nova liderança global de parcerias estratégicas')
    expect(destaque).toHaveTextContent('16 ago.')
    expect(destaque).not.toHaveTextContent('Detectado por')
    expect(within(secao).queryByRole('list', { name: 'Histórico de sinais' })).not.toBeInTheDocument()
  })

  it('sem Sinal, a seção Sinais mostra "Nenhum sinal"', async () => {
    renderizarApp('/contas/oracle')

    const secao = await screen.findByRole('region', { name: 'Sinais' })
    expect(await within(secao).findByText('Nenhum sinal')).toBeInTheDocument()
  })

  it('a seção Interações lista da mais recente à mais antiga, com tipo, Contato, quem participou, origem e data', async () => {
    renderizarApp('/contas/openai')

    const secao = await screen.findByRole('region', { name: 'Interações' })
    const lista = await within(secao).findByRole('list', { name: 'Interações' })
    const [primeira, segunda] = within(lista).getAllByRole('listitem')
    expect(primeira).toHaveTextContent('E-mail enviado · Carla Mendonça')
    expect(primeira).toHaveTextContent('Há 5 dias')
    expect(primeira).toHaveTextContent('Marina Alves')
    expect(primeira).toHaveTextContent('HubSpot')
    expect(segunda).toHaveTextContent('Reunião · Sarah Chen')
    expect(segunda).toHaveTextContent('Google Calendar')
  })

  it('sem Interações, mostra "Nenhuma interação registrada", e o Último contato da tabela é "Nunca"', async () => {
    const { usuario } = renderizarApp('/contas/banorte')

    const secao = await screen.findByRole('region', { name: 'Interações' })
    expect(await within(secao).findByText('Nenhuma interação registrada')).toBeInTheDocument()

    await usuario.click(screen.getByRole('link', { name: 'Contas' }))
    const tabela = await screen.findByRole('table', { name: 'Tabela de Contas' })
    const linha = within(tabela).getByText('Banorte').closest('tr')!
    expect(within(linha).getAllByRole('cell')[5]).toHaveTextContent('Nunca')
  })

  it('não há texto explicando "por que importa"', async () => {
    renderizarApp('/contas/openai')

    await screen.findByRole('article', { name: 'Sinal mais recente' })
    expect(screen.queryByText(/por que importa/i)).not.toBeInTheDocument()
  })

  it('um endereço de Conta-alvo inexistente mostra "Conta não encontrada" com um link de volta para Contas', async () => {
    const { usuario } = renderizarApp('/contas/empresa-fantasma')

    expect(await screen.findByRole('heading', { level: 1, name: 'Conta não encontrada' })).toBeInTheDocument()
    await usuario.click(screen.getByRole('link', { name: 'Voltar para Contas' }))
    expect(await screen.findByRole('table', { name: 'Tabela de Contas' })).toBeInTheDocument()
  })

  it('com a fonte em falha, o detalhe mostra o erro e "Tentar de novo"', async () => {
    renderizarApp('/contas/openai', { falha: true })

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Não foi possível carregar a Conta-alvo.')
    expect(within(alerta).getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })
})

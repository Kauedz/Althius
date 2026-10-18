import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderizarApp, renderizarAppCom } from '@/test/renderizar'

describe('Aba Contas (ponta a ponta)', () => {
  it('o item "Contas e Contatos" aparece na seção Workspace da sidebar acima de Agentes e abre a aba Contas', async () => {
    const { usuario } = renderizarApp('/')

    const nav = screen.getByRole('navigation', { name: 'Workspace' })
    const links = within(nav).getAllByRole('link')
    expect(links[0]).toHaveTextContent('Contas e Contatos')
    expect(links[1]).toHaveTextContent('Sequências')
    expect(links[2]).toHaveTextContent('Agentes')

    // O selo de demonstração continua visível
    expect(screen.getByText('Demonstração')).toBeInTheDocument()

    // Clicar em Contas e Contatos abre a aba Contas
    await usuario.click(links[0])
    expect(await screen.findByRole('heading', { level: 1, name: 'Contas' })).toBeInTheDocument()
  })

  it('a página inicial continua sendo a grade de Agentes', async () => {
    renderizarApp('/')
    expect(await screen.findByRole('heading', { level: 1, name: 'Agentes' })).toBeInTheDocument()
    expect(await screen.findByRole('list', { name: 'Agentes do Workspace' })).toBeInTheDocument()
  })

  it('a aba Contas mostra o título, a descrição, a contagem "N contas" e a tabela com as sete colunas nessa ordem', async () => {
    renderizarApp('/contas')

    expect(await screen.findByRole('heading', { level: 1, name: 'Contas' })).toBeInTheDocument()
    expect(
      screen.getByText('Empresas do seu mercado organizadas pelo momento de abordagem'),
    ).toBeInTheDocument()
    expect(contagem()).toHaveTextContent(/^30 contas$/)

    const tabela = screen.getByRole('table', { name: 'Tabela de Contas' })
    const cabecalhos = within(tabela)
      .getAllByRole('columnheader')
      .map((th) => th.textContent?.trim())

    expect(cabecalhos).toEqual([
      'Empresa',
      'Quente',
      'Aderência',
      'Contatos',
      'Último sinal',
      'Segmento',
      'Último contato',
    ])
  })

  it('a ordem padrão é a Prioridade: Quente, Fit, Não fit e não avaliada, com desempate por sinal mais recente e nome', async () => {
    renderizarApp('/contas')

    const tabela = await screen.findByRole('table', { name: 'Tabela de Contas' })
    const linhas = within(tabela).getAllByRole('row').slice(1) // ignora o header

    // 18 Quentes (OpenAI sinal há 2 dias até Ramp há 24 dias)
    // 8 Fit (SAP até Okta, depois Miro e Oracle sem sinal empatados e desfeitos pelo nome)
    // 3 Não fit (Mercado Livre, Rappi e Banorte sem sinal)
    // 1 Não avaliada (BBVA México)
    const ordemEsperada = [
      'OpenAI',
      'Stripe',
      'Anthropic',
      'Nubank',
      'Databricks',
      'Snowflake',
      'Cloudflare',
      'GitLab',
      'Figma',
      'Notion',
      'Canva',
      'MongoDB',
      'HubSpot',
      'Rippling',
      'Deel',
      'Vercel',
      'Brex',
      'Ramp',
      'SAP',
      'Twilio',
      'Zendesk',
      'Asana',
      'monday.com',
      'Okta',
      'Miro',
      'Oracle',
      'Mercado Livre',
      'Rappi',
      'Banorte',
      'BBVA México',
    ]

    // A célula Empresa também traz o logo ou as iniciais e o domínio: basta que o nome esperado esteja nela
    expect(linhas).toHaveLength(ordemEsperada.length)
    linhas.forEach((linha, i) => {
      const empresa = within(linha).getAllByRole('cell')[0]
      expect(within(empresa).queryAllByText(ordemEsperada[i], { exact: true }), `linha ${i + 1}`).not.toHaveLength(0)
    })
  })

  it('Último sinal mostra "frase · data relativa" ou "Nenhum sinal"; Último contato mostra data ou "Nunca"', async () => {
    renderizarApp('/contas')

    const tabela = await screen.findByRole('table', { name: 'Tabela de Contas' })
    const linhas = within(tabela).getAllByRole('row').slice(1)

    // OpenAI: Quente (2 sinais), Fit, 4 contatos, sinal há 2 dias, IA, último contato Há 5 dias
    const openaiCells = within(linhas[0]).getAllByRole('cell')
    expect(openaiCells[0]).toHaveTextContent('OpenAI')
    expect(openaiCells[1]).toHaveTextContent('2 sinais')
    expect(openaiCells[2]).toHaveTextContent('Fit')
    expect(openaiCells[3]).toHaveTextContent('4 contatos')
    expect(openaiCells[4]).toHaveTextContent('Abriu 3 vagas de engenharia de dados de avaliação · há 2 dias')
    expect(openaiCells[5]).toHaveTextContent('Inteligência Artificial')
    expect(openaiCells[6]).toHaveTextContent('Há 5 dias')

    // Stripe: Quente (1 sinal), Fit, 4 contatos, sinal há 3 dias, Serviços financeiros, último contato Ontem
    const stripeCells = within(linhas[1]).getAllByRole('cell')
    expect(stripeCells[0]).toHaveTextContent('Stripe')
    expect(stripeCells[1]).toHaveTextContent('1 sinal')
    expect(stripeCells[2]).toHaveTextContent('Fit')
    expect(stripeCells[3]).toHaveTextContent('4 contatos')
    expect(stripeCells[4]).toHaveTextContent('Expansão da operação enterprise no Brasil · há 3 dias')
    expect(stripeCells[5]).toHaveTextContent('Serviços financeiros')
    expect(stripeCells[6]).toHaveTextContent('Ontem')

    // Anthropic: Quente (1 sinal), Fit, 3 contatos, sinal há 4 dias, IA, último contato Há 1 semana
    const anthropicCells = within(linhas[2]).getAllByRole('cell')
    expect(anthropicCells[0]).toHaveTextContent('Anthropic')
    expect(anthropicCells[1]).toHaveTextContent('1 sinal')
    expect(anthropicCells[2]).toHaveTextContent('Fit')
    expect(anthropicCells[3]).toHaveTextContent('3 contatos')
    expect(anthropicCells[4]).toHaveTextContent('Nova liderança de receita para América Latina · há 4 dias')
    expect(anthropicCells[5]).toHaveTextContent('Inteligência Artificial')
    expect(anthropicCells[6]).toHaveTextContent('Há 1 semana')

    // Nubank: Quente (1 sinal), Fit, 5 contatos, sinal há 5 dias, Serviços financeiros, último contato Há 3 dias
    const nubankCells = within(linhas[3]).getAllByRole('cell')
    expect(nubankCells[0]).toHaveTextContent('Nubank')
    expect(nubankCells[1]).toHaveTextContent('1 sinal')
    expect(nubankCells[2]).toHaveTextContent('Fit')
    expect(nubankCells[3]).toHaveTextContent('5 contatos')
    expect(nubankCells[4]).toHaveTextContent('Contratando liderança de IA para atendimento · há 5 dias')
    expect(nubankCells[5]).toHaveTextContent('Serviços financeiros')
    expect(nubankCells[6]).toHaveTextContent('Há 3 dias')

    // Miro: Fit, sem contatos, sem sinal, nunca contatada
    const miroCells = within(linhas[24]).getAllByRole('cell')
    expect(miroCells[0]).toHaveTextContent('Miro')
    expect(miroCells[1]).toHaveTextContent('—')
    expect(miroCells[2]).toHaveTextContent('Fit')
    expect(miroCells[3]).toHaveTextContent('Nenhum contato')
    expect(miroCells[4]).toHaveTextContent('Nenhum sinal')
    expect(miroCells[5]).toHaveTextContent('Produtividade')
    expect(miroCells[6]).toHaveTextContent('Nunca')

    // Oracle: Fit, 4 contatos, sem sinal
    const oracleCells = within(linhas[25]).getAllByRole('cell')
    expect(oracleCells[0]).toHaveTextContent('Oracle')
    expect(oracleCells[1]).toHaveTextContent('—')
    expect(oracleCells[2]).toHaveTextContent('Fit')
    expect(oracleCells[3]).toHaveTextContent('4 contatos')
    expect(oracleCells[4]).toHaveTextContent('Nenhum sinal')
    expect(oracleCells[5]).toHaveTextContent('Software corporativo')

    // Banorte: Não fit, sem contatos, sem sinal, nunca contatada
    const banorteCells = within(linhas[28]).getAllByRole('cell')
    expect(banorteCells[0]).toHaveTextContent('Banorte')
    expect(banorteCells[1]).toHaveTextContent('—')
    expect(banorteCells[2]).toHaveTextContent('Não fit')
    expect(banorteCells[3]).toHaveTextContent('Nenhum contato')
    expect(banorteCells[4]).toHaveTextContent('Nenhum sinal')
    expect(banorteCells[5]).toHaveTextContent('Serviços financeiros')
    expect(banorteCells[6]).toHaveTextContent('Nunca')

    // BBVA México: sem aderência ("—" com tooltip), segmento ausente ("—"), nunca contatada
    const bbvaCells = within(linhas[29]).getAllByRole('cell')
    expect(bbvaCells[0]).toHaveTextContent('BBVA México')
    expect(bbvaCells[1]).toHaveTextContent('—')
    expect(within(bbvaCells[2]).getByTitle('Aderência ainda não avaliada')).toBeInTheDocument()
    expect(bbvaCells[3]).toHaveTextContent('2 contatos')
    expect(bbvaCells[4]).toHaveTextContent('Nova unidade de inovação para serviços corporativos · 24 jun.')
    expect(bbvaCells[5]).toHaveTextContent('—')
    expect(bbvaCells[6]).toHaveTextContent('Nunca')
  })

  it('enquanto carrega, aparece o pulso do app', async () => {
    renderizarApp('/contas', { atrasoMs: 150 })

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText('Carregando')).toBeInTheDocument()

    expect(await screen.findByRole('table', { name: 'Tabela de Contas' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('com a fonte vazia, exibe mensagem explicativa sem botões e sem pedido de configuração', async () => {
    renderizarApp('/contas', { vazia: true })

    expect(
      await screen.findByText(
        'Nenhuma Conta-alvo ainda. As empresas aparecem aqui quando o Scopus encontrá-las ou quando forem importadas.',
      ),
    ).toBeInTheDocument()

    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /configurar|novo|adicionar/i })).not.toBeInTheDocument()
  })

  it('com a fonte em falha, exibe mensagem curta de erro com "Tentar de novo" que recupera os dados', async () => {
    const { fonteDeContas, usuario } = renderizarApp('/contas', { falha: true })

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Não foi possível carregar as contas.')).toBeInTheDocument()

    const botaoTentar = screen.getByRole('button', { name: 'Tentar de novo' })
    expect(botaoTentar).toBeInTheDocument()

    // Recupera a falha e tenta de novo
    fonteDeContas.definirFalha(false)
    await usuario.click(botaoTentar)

    expect(await screen.findByRole('table', { name: 'Tabela de Contas' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

/** As células da linha de uma Conta-alvo na tabela de Contas, achada pelo nome da empresa. */
async function celulasDaConta(nome: string) {
  const tabela = await screen.findByRole('table', { name: 'Tabela de Contas' })
  const linha = within(tabela).getAllByText(nome, { exact: true })[0].closest('tr')!
  return within(linha).getAllByRole('cell')
}

describe('Células da tabela de Contas', () => {
  it('a célula Empresa mostra o logo ou as iniciais, o nome e o domínio', async () => {
    renderizarApp('/contas')

    const [openai] = await celulasDaConta('OpenAI')
    expect(within(openai).getByRole('img', { name: 'OpenAI' })).toHaveAttribute('src', '/logos/openai.svg')
    expect(within(openai).getByText('OpenAI')).toBeInTheDocument()
    expect(within(openai).getByText('openai.com')).toBeInTheDocument()

    // Um logo de uma cor só também é o logo, e não as iniciais
    const [notion] = await celulasDaConta('Notion')
    expect(within(notion).getByRole('img', { name: 'Notion' })).toBeInTheDocument()
    expect(within(notion).queryByText('N')).not.toBeInTheDocument()
    expect(within(notion).getByText('notion.so')).toBeInTheDocument()

    // Sem logo, só as iniciais no quadrado, sem ícone de pessoa
    const [bbva] = await celulasDaConta('BBVA México')
    expect(within(bbva).getByRole('img', { name: 'BBVA México' })).toHaveTextContent(/^BM$/)
    expect(within(bbva).getByText('bbva.mx')).toBeInTheDocument()

    const [miro] = await celulasDaConta('Miro')
    expect(within(miro).getByRole('img', { name: 'Miro' })).toHaveTextContent(/^M$/)
    expect(within(miro).getByText('miro.com')).toBeInTheDocument()
  })

  it('sem domínio, a célula Empresa mostra "Domínio não informado"', async () => {
    // Nenhuma Conta-alvo da demo está sem domínio: só neste teste, a fonte entrega a Miro sem ele
    renderizarAppCom('/contas', {
      contas: (fonteDeContas) => ({
        ...fonteDeContas,
        contas: async () =>
          (await fonteDeContas.contas()).map((conta) => (conta.id === 'miro' ? { ...conta, dominio: undefined } : conta)),
      }),
    })

    const [miro] = await celulasDaConta('Miro')
    expect(within(miro).getByText('Domínio não informado')).toBeInTheDocument()
  })

  it('a coluna Quente mostra Foguinho com contagem ou "—" quando não há sinais válidos', async () => {
    renderizarApp('/contas')

    const [, openai] = await celulasDaConta('OpenAI')
    expect(openai).toHaveTextContent('2 sinais')
    expect(within(openai).getByLabelText('Quente, 2 sinais válidos')).toBeInTheDocument()

    const [, anthropic] = await celulasDaConta('Anthropic')
    expect(anthropic).toHaveTextContent('1 sinal')
    expect(within(anthropic).getByLabelText('Quente, 1 sinal válido')).toBeInTheDocument()

    const [, sap] = await celulasDaConta('SAP')
    expect(sap).toHaveTextContent('—')
    expect(within(sap).getByTitle('Sem sinais válidos')).toBeInTheDocument()
  })

  it('a Aderência aparece como "Fit", "Não fit" ou "—" com "Aderência ainda não avaliada"', async () => {
    renderizarApp('/contas')

    const [, , openai] = await celulasDaConta('OpenAI')
    expect(openai).toHaveTextContent(/^Fit$/)
    const [, , sap] = await celulasDaConta('SAP')
    expect(sap).toHaveTextContent(/^Fit$/)
    const [, , rappi] = await celulasDaConta('Rappi')
    expect(rappi).toHaveTextContent(/^Não fit$/)
    const [, , bbva] = await celulasDaConta('BBVA México')
    expect(bbva).toHaveTextContent(/^—$/)
    expect(within(bbva).getByTitle('Aderência ainda não avaliada')).toHaveTextContent('—')
  })

  it('a célula Contatos mostra até três avatares, com foto ou iniciais, e a contagem, ou "Nenhum contato"', async () => {
    renderizarApp('/contas')

    const [, , , stripe] = await celulasDaConta('Stripe')
    expect(within(stripe).getAllByRole('img')).toHaveLength(3)
    expect(within(stripe).getByRole('img', { name: 'David Kim' })).toHaveAttribute('src', '/avatars/avatar-4.jpg')
    expect(within(stripe).getByRole('img', { name: 'Rachel Green' })).toHaveAttribute('src', '/avatars/avatar-5.jpg')
    // Sem foto, as iniciais
    expect(within(stripe).getByRole('img', { name: 'Robert Thorne' })).toHaveTextContent(/^RT$/)
    expect(stripe).toHaveTextContent('4 contatos')

    // Com mais de três Contatos, só três avatares
    const [, , , nubank] = await celulasDaConta('Nubank')
    expect(within(nubank).getAllByRole('img')).toHaveLength(3)
    expect(nubank).toHaveTextContent('5 contatos')

    const [, , , miro] = await celulasDaConta('Miro')
    expect(within(miro).queryAllByRole('img')).toHaveLength(0)
    expect(miro).toHaveTextContent(/^Nenhum contato$/)
  })

  it('o Último sinal longo é truncado em uma linha e tem o texto completo, com a data completa, no tooltip', async () => {
    renderizarApp('/contas')

    const [, , , , openai] = await celulasDaConta('OpenAI')
    expect(
      within(openai).getByTitle('Abriu 3 vagas de engenharia de dados de avaliação · 21 de setembro de 2026'),
    ).toHaveTextContent(/^Abriu 3 vagas de engenharia de dados de avaliação · há 2 dias$/)

    const [, , , , bbva] = await celulasDaConta('BBVA México')
    expect(
      within(bbva).getByTitle('Nova unidade de inovação para serviços corporativos · 24 de junho de 2026'),
    ).toHaveTextContent(/^Nova unidade de inovação para serviços corporativos · 24 jun\.$/)
  })

  it('o segmento aparece em texto simples, ou "—" quando está ausente', async () => {
    renderizarApp('/contas')

    const [, , , , , openai] = await celulasDaConta('OpenAI')
    expect(openai).toHaveTextContent(/^Inteligência Artificial$/)
    const [, , , , , rappi] = await celulasDaConta('Rappi')
    expect(rappi).toHaveTextContent(/^—$/)
    const [, , , , , bbva] = await celulasDaConta('BBVA México')
    expect(bbva).toHaveTextContent(/^—$/)
  })

  it('não há nota, letra, score, "Etapa" ou "CRM" no módulo', async () => {
    renderizarApp('/contas')
    const tabela = await screen.findByRole('table', { name: 'Tabela de Contas' })
    const aderencias = within(tabela)
      .getAllByRole('row')
      .slice(1)
      .map((linha) => within(linha).getAllByRole('cell')[2].textContent)
    expect(new Set(aderencias)).toEqual(new Set(['Fit', 'Não fit', '—']))

    // A coluna Quente traz 18 contas com Foguinho e 12 com "—"
    const quentes = within(tabela)
      .getAllByRole('row')
      .slice(1)
      .map((linha) => within(linha).getAllByRole('cell')[1].textContent)
    expect(quentes.filter((q) => q !== '—')).toHaveLength(18)

    // O texto de cada elemento, e não o do módulo inteiro, que cola as células umas nas outras
    const modulo = within(screen.getByRole('main'))
    expect(modulo.queryAllByText(/\b(score|nota|pontuação)\b/i)).toHaveLength(0)
    expect(modulo.queryAllByText(/\d+\s*(\/|de)\s*100\b/)).toHaveLength(0)
    expect(modulo.queryAllByText(/\bEtapa\b/i)).toHaveLength(0)
    expect(modulo.queryAllByText(/\bCRM\b/)).toHaveLength(0)
  })
})

/** O link com o nome da empresa na tabela de Contas, que abre o pop-up. */
async function nomeDaEmpresa(nome: string) {
  const tabela = await screen.findByRole('table', { name: 'Tabela de Contas' })
  return within(tabela).getByRole('link', { name: nome })
}

/** Mais que o atraso de abrir e o de fechar o pop-up da empresa somados. */
const ALEM_DOS_ATRASOS_DO_POP_UP_MS = 800

describe('Pop-up da empresa', () => {
  it('abre ao passar o mouse sobre a empresa, depois de um pequeno atraso, com os links do site e do LinkedIn', async () => {
    const { usuario } = renderizarApp('/contas')

    await usuario.hover(await nomeDaEmpresa('OpenAI'))

    // Não abre na hora, para não piscar ao percorrer a tabela
    expect(screen.queryByRole('link', { name: /Site/ })).not.toBeInTheDocument()

    const site = await screen.findByRole('link', { name: /Site/ })
    expect(site).toHaveAttribute('href', 'https://openai.com')
    expect(screen.getByRole('link', { name: /LinkedIn/ })).toHaveAttribute(
      'href',
      'https://www.linkedin.com/company/openai',
    )
  })

  it('abre quando o nome da empresa recebe o foco do teclado', async () => {
    renderizarApp('/contas')

    const nome = await nomeDaEmpresa('Stripe')
    act(() => nome.focus())

    expect(await screen.findByRole('link', { name: /Site/ })).toHaveAttribute('href', 'https://stripe.com')
  })

  it('pelo teclado, o Tab leva do nome aos links do pop-up e depois segue a tabela', async () => {
    const { usuario } = renderizarApp('/contas')

    const nome = await nomeDaEmpresa('OpenAI')
    act(() => nome.focus())
    const site = await screen.findByRole('link', { name: /Site/ })

    await usuario.tab()
    expect(site).toHaveFocus()
    await usuario.tab()
    expect(screen.getByRole('link', { name: /LinkedIn/ })).toHaveFocus()

    // Shift+Tab volta pelo mesmo caminho
    await usuario.tab({ shift: true })
    expect(site).toHaveFocus()
    await usuario.tab({ shift: true })
    expect(nome).toHaveFocus()

    // Saindo do último link, o foco segue para o que vem depois do nome, e o pop-up fecha
    await usuario.tab()
    await usuario.tab()
    await usuario.tab()
    const tabela = screen.getByRole('table', { name: 'Tabela de Contas' })
    expect(tabela).toContainElement(document.activeElement as HTMLElement)
    expect(nome).not.toHaveFocus()
    await waitFor(() => expect(screen.queryByRole('link', { name: /Site/ })).not.toBeInTheDocument())
  })

  it('continua aberto enquanto o ponteiro está nele, e o link pode ser clicado', async () => {
    const { usuario } = renderizarApp('/contas')

    await usuario.hover(await nomeDaEmpresa('OpenAI'))
    const linkedin = await screen.findByRole('link', { name: /LinkedIn/ })

    await usuario.hover(linkedin)
    await new Promise((r) => setTimeout(r, ALEM_DOS_ATRASOS_DO_POP_UP_MS))
    expect(screen.getByRole('link', { name: /LinkedIn/ })).toBeInTheDocument()

    // Clicar no link do pop-up não abre o detalhe da conta
    await usuario.click(screen.getByRole('link', { name: /LinkedIn/ }))
    expect(screen.getByRole('table', { name: 'Tabela de Contas' })).toBeInTheDocument()
  })

  it('mostra só os links que existem: só o site, quando não há LinkedIn', async () => {
    const { usuario } = renderizarApp('/contas')

    await usuario.hover(await nomeDaEmpresa('Banorte'))

    expect(await screen.findByRole('link', { name: /Site/ })).toHaveAttribute('href', 'https://banorte.com')
    expect(screen.queryByRole('link', { name: /LinkedIn/ })).not.toBeInTheDocument()
  })

  it('sem site nem LinkedIn, o pop-up não aparece', async () => {
    const { usuario } = renderizarApp('/contas')

    const nome = await nomeDaEmpresa('Miro')
    await usuario.hover(nome)
    act(() => nome.focus())
    await new Promise((r) => setTimeout(r, ALEM_DOS_ATRASOS_DO_POP_UP_MS))

    expect(screen.queryByRole('link', { name: /Site|LinkedIn/ })).not.toBeInTheDocument()
  })

  it('os links abrem em outra aba', async () => {
    const { usuario } = renderizarApp('/contas')

    await usuario.hover(await nomeDaEmpresa('OpenAI'))

    for (const link of [
      await screen.findByRole('link', { name: /Site/ }),
      screen.getByRole('link', { name: /LinkedIn/ }),
    ]) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    }
  })
})

/** Os nomes das empresas na tabela de Contas, na ordem das linhas. */
async function nomesNaTabela() {
  const tabela = await screen.findByRole('table', { name: 'Tabela de Contas' })
  return within(tabela)
    .getAllByRole('row')
    .slice(1)
    .map((linha) => within(linha).getAllByRole('link')[0].textContent)
}

/** A contagem de contas exibidas, no topo da aba Contas ("30 contas" ou "N de 30 contas"). */
function contagem() {
  return screen.getByText((_, elemento) => /^\d+( de \d+)? contas?$/.test(elemento?.textContent ?? '') && elemento?.tagName === 'SPAN')
}

type Usuario = ReturnType<typeof renderizarApp>['usuario']

/** Escolhe uma opção de "Ordenar por" na aba Contas. */
async function ordenarPor(usuario: Usuario, rotulo: string) {
  await usuario.selectOptions(await screen.findByRole('combobox', { name: 'Ordenar por' }), `Ordenar por: ${rotulo}`)
}

describe('"Ordenar por" e busca na aba Contas', () => {
  it('"Ordenar por" mostra as quatro opções, com Prioridade escolhida por padrão', async () => {
    renderizarApp('/contas')

    const ordenar = await screen.findByRole('combobox', { name: 'Ordenar por' })
    expect(within(ordenar).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Ordenar por: Prioridade',
      'Ordenar por: Último sinal',
      'Ordenar por: Contatos',
      'Ordenar por: Último contato',
    ])
    expect(ordenar).toHaveDisplayValue('Ordenar por: Prioridade')
  })

  it('os cabeçalhos da tabela não são clicáveis', async () => {
    renderizarApp('/contas')

    const tabela = await screen.findByRole('table', { name: 'Tabela de Contas' })
    for (const cabecalho of within(tabela).getAllByRole('columnheader')) {
      expect(within(cabecalho).queryByRole('button')).not.toBeInTheDocument()
      expect(cabecalho).not.toHaveAttribute('aria-sort')
    }
  })

  it('Último sinal põe o mais recente primeiro e as contas sem Sinal no fim', async () => {
    const { usuario } = renderizarApp('/contas')

    await ordenarPor(usuario, 'Último sinal')

    const nomes = await nomesNaTabela()
    expect(nomes.slice(0, 3)).toEqual(['OpenAI', 'Stripe', 'Anthropic'])
    // Depois das Quentes e das Fit, os Sinais mais antigos misturam os grupos: Mercado Livre (Não fit) antes de BBVA México
    expect(nomes.slice(18, 27)).toEqual([
      'SAP',
      'Twilio',
      'Zendesk',
      'Asana',
      'monday.com',
      'Okta',
      'Mercado Livre',
      'Rappi',
      'BBVA México',
    ])
    expect(nomes.slice(27)).toEqual(['Banorte', 'Miro', 'Oracle'])
  })

  it('Contatos põe a conta com mais Contatos primeiro e as sem Contatos no fim', async () => {
    const { usuario } = renderizarApp('/contas')

    await ordenarPor(usuario, 'Contatos')

    const nomes = await nomesNaTabela()
    expect(nomes.slice(0, 3)).toEqual(['Canva', 'HubSpot', 'Nubank'])
    expect(nomes.slice(-4)).toEqual(['Okta', 'Banorte', 'Miro', 'Rappi'])
  })

  it('Último contato põe o mais recente primeiro e "Nunca" no fim', async () => {
    const { usuario } = renderizarApp('/contas')

    await ordenarPor(usuario, 'Último contato')

    const nomes = await nomesNaTabela()
    expect(nomes.slice(0, 4)).toEqual(['Stripe', 'Nubank', 'Databricks', 'OpenAI'])
    expect(nomes.slice(-6)).toEqual(['Mercado Livre', 'Banorte', 'BBVA México', 'Miro', 'Okta', 'Rappi'])
  })

  it('voltar para Prioridade restaura a ordem padrão', async () => {
    const { usuario } = renderizarApp('/contas')
    const ordenar = await screen.findByRole('combobox', { name: 'Ordenar por' })

    await usuario.selectOptions(ordenar, 'Ordenar por: Contatos')
    await usuario.selectOptions(ordenar, 'Ordenar por: Prioridade')

    const nomes = await nomesNaTabela()
    expect(nomes.slice(0, 2)).toEqual(['OpenAI', 'Stripe'])
    expect(nomes.at(-1)).toBe('BBVA México')
  })

  it('a busca encontra pelo nome ignorando maiúsculas e acentos, e a contagem mostra "N de M contas"', async () => {
    const { usuario } = renderizarApp('/contas')

    await usuario.type(await screen.findByRole('searchbox', { name: 'Buscar contas' }), 'MEXICO')

    expect(await nomesNaTabela()).toEqual(['BBVA México'])
    expect(contagem()).toHaveTextContent(/^1 de 30 contas$/)
  })

  it('a busca encontra pelo domínio', async () => {
    const { usuario } = renderizarApp('/contas')

    await usuario.type(await screen.findByRole('searchbox', { name: 'Buscar contas' }), 'mercadolivre.com')

    expect(await nomesNaTabela()).toEqual(['Mercado Livre'])
  })

  it('a busca mantém a ordenação escolhida', async () => {
    const { usuario } = renderizarApp('/contas')

    await ordenarPor(usuario, 'Contatos')
    await usuario.type(screen.getByRole('searchbox', { name: 'Buscar contas' }), 'n')

    const nomes = await nomesNaTabela()
    expect(nomes[0]).toBe('Canva')
    expect(contagem()).toHaveTextContent(`${nomes.length} de 30 contas`)
  })

  it('uma busca sem resultado mostra a mensagem e "Limpar busca e filtros" restaura a lista', async () => {
    const { usuario } = renderizarApp('/contas')

    await usuario.type(await screen.findByRole('searchbox', { name: 'Buscar contas' }), 'xyz')

    expect(screen.getByText('Nenhuma conta encontrada para “xyz”.')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Tabela de Contas' })).not.toBeInTheDocument()
    expect(contagem()).toHaveTextContent(/^0 de 30 contas$/)

    await usuario.click(screen.getByRole('button', { name: 'Limpar busca e filtros' }))

    expect(await nomesNaTabela()).toHaveLength(30)
    expect(screen.getByRole('searchbox', { name: 'Buscar contas' })).toHaveValue('')
    expect(contagem()).toHaveTextContent(/^30 contas$/)
  })

  it('abrir o endereço com busca e ordenação reconstrói a lista com elas', async () => {
    renderizarApp('/contas?busca=an&ordem=ultimo-contato')

    expect(await screen.findByRole('searchbox', { name: 'Buscar contas' })).toHaveValue('an')
    expect(screen.getByRole('combobox', { name: 'Ordenar por' })).toHaveDisplayValue('Ordenar por: Último contato')
    // "an" no nome ou no domínio: Stripe (Ontem) fica fora, Anthropic antes de Canva e Banorte (Nunca) no fim
    const nomes = await nomesNaTabela()
    expect(nomes).not.toContain('Stripe')
    expect(nomes.indexOf('Anthropic')).toBeLessThan(nomes.indexOf('Canva'))
    expect(nomes.at(-1)).toBe('Banorte')
    expect(contagem()).toHaveTextContent(`${nomes.length} de 30 contas`)
  })

  it('uma ordenação desconhecida no endereço cai na Prioridade', async () => {
    renderizarApp('/contas?ordem=inventada')

    expect(await screen.findByRole('combobox', { name: 'Ordenar por' })).toHaveDisplayValue('Ordenar por: Prioridade')
    expect((await nomesNaTabela())[0]).toBe('OpenAI')
  })
})

/** Abre o menu "Filtros" da aba Contas e devolve o painel. */
async function abrirFiltros(usuario: Usuario) {
  await usuario.click(await screen.findByRole('button', { name: /^Filtros/ }))
  return screen.findByRole('dialog', { name: 'Filtrar contas' })
}

/** Marca uma opção do grupo de filtros com esse nome. */
async function filtrar(usuario: Usuario, grupo: string, opcao: string) {
  const painel = screen.queryByRole('dialog', { name: 'Filtrar contas' }) ?? (await abrirFiltros(usuario))
  const doGrupo = within(within(painel).getByRole('group', { name: grupo }))
  await usuario.click(doGrupo.queryByRole('checkbox', { name: opcao }) ?? doGrupo.getByRole('radio', { name: opcao }))
}

/** Os rótulos dos chips de filtros ativos, na ordem em que aparecem. */
function chips() {
  return screen
    .queryAllByRole('button', { name: /^Remover filtro / })
    .map((botao) => botao.getAttribute('aria-label')?.replace(/^Remover filtro /, ''))
}

describe('Filtros da aba Contas', () => {
  it('"Filtros" abre um menu com os grupos Aderência, Segmento, Sinal e Contatos, e os Segmentos vêm dos dados', async () => {
    const { usuario } = renderizarApp('/contas')

    const painel = await abrirFiltros(usuario)

    expect(within(painel).getAllByRole('group').map((g) => g.querySelector('legend')?.textContent)).toEqual([
      'Aderência',
      'Segmento',
      'Sinal',
      'Contatos',
    ])
    // As opções do grupo, nesta ordem e com estes nomes; o nome é o rótulo, sem a contagem ao lado
    const opcoes = (grupo: string, papel: 'checkbox' | 'radio', nomes: string[]) => {
      const doGrupo = within(within(painel).getByRole('group', { name: grupo }))
      expect(doGrupo.getAllByRole(papel)).toEqual(nomes.map((nome) => doGrupo.getByRole(papel, { name: nome })))
    }
    opcoes('Aderência', 'checkbox', ['Quente', 'Fit', 'Não fit'])
    opcoes('Segmento', 'checkbox', [
      'Atendimento',
      'Comércio eletrônico',
      'Comunicação',
      'Dados e analytics',
      'DevOps',
      'Gestão de pessoas',
      'Infraestrutura',
      'Inteligência Artificial',
      'Marketing e vendas',
      'Produtividade',
      'Segurança',
      'Serviços financeiros',
      'Software corporativo',
    ])
    opcoes('Sinal', 'radio', ['Com sinal', 'Sem sinal'])
    opcoes('Contatos', 'radio', ['Com contatos', 'Sem contatos'])
  })

  it('cada filtro reduz a lista e atualiza a contagem "N de M contas"', async () => {
    const { usuario } = renderizarApp('/contas')

    await filtrar(usuario, 'Aderência', 'Quente')
    expect(await nomesNaTabela()).toHaveLength(18)
    expect(contagem()).toHaveTextContent(/^18 de 30 contas$/)
  })

  it('opções do mesmo grupo se combinam com "ou"', async () => {
    const { usuario } = renderizarApp('/contas')

    await filtrar(usuario, 'Aderência', 'Fit')
    await filtrar(usuario, 'Aderência', 'Não fit')
    expect(await nomesNaTabela()).toHaveLength(11)

    await usuario.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    await filtrar(usuario, 'Segmento', 'Inteligência Artificial')
    await filtrar(usuario, 'Segmento', 'Serviços financeiros')
    expect((await nomesNaTabela()).toSorted()).toEqual(['Anthropic', 'Banorte', 'Brex', 'Nubank', 'OpenAI', 'Ramp', 'Stripe'])
  })

  it('grupos diferentes se combinam com "e"', async () => {
    const { usuario } = renderizarApp('/contas')

    await filtrar(usuario, 'Aderência', 'Fit')
    await filtrar(usuario, 'Sinal', 'Sem sinal')
    expect(await nomesNaTabela()).toEqual(['Miro', 'Oracle'])

    await filtrar(usuario, 'Contatos', 'Sem contatos')
    expect(await nomesNaTabela()).toEqual(['Miro'])
    expect(contagem()).toHaveTextContent(/^1 de 30 contas$/)
  })

  it('Sinal e Contatos têm uma escolha só: "Com" ou "Sem"', async () => {
    const { usuario } = renderizarApp('/contas')

    await filtrar(usuario, 'Contatos', 'Com contatos')
    expect(await nomesNaTabela()).toHaveLength(27)
    await filtrar(usuario, 'Contatos', 'Sem contatos')
    expect(await nomesNaTabela()).toEqual(['Miro', 'Rappi', 'Banorte'])
    expect(chips()).toEqual(['Sem contatos'])
  })

  it('busca e filtros se combinam', async () => {
    const { usuario } = renderizarApp('/contas')

    await filtrar(usuario, 'Segmento', 'Serviços financeiros')
    await usuario.keyboard('{Escape}')
    await usuario.type(screen.getByRole('searchbox', { name: 'Buscar contas' }), 'b')

    // Nubank e Brex têm "b" no nome; Banorte, no nome e no domínio. Stripe e Ramp não.
    expect((await nomesNaTabela()).toSorted()).toEqual(['Banorte', 'Brex', 'Nubank'])
    expect(contagem()).toHaveTextContent(/^3 de 30 contas$/)
  })

  it('cada filtro ativo aparece como um chip abaixo da barra, e remover o chip desfaz o filtro', async () => {
    const { usuario } = renderizarApp('/contas')

    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).not.toBeInTheDocument()

    await filtrar(usuario, 'Aderência', 'Quente')
    await filtrar(usuario, 'Aderência', 'Fit')
    await filtrar(usuario, 'Segmento', 'Produtividade')
    await filtrar(usuario, 'Sinal', 'Com sinal')
    await filtrar(usuario, 'Contatos', 'Com contatos')
    await usuario.keyboard('{Escape}')

    expect(chips()).toEqual([
      'Aderência: Quente',
      'Aderência: Fit',
      'Segmento: Produtividade',
      'Com sinal',
      'Com contatos',
    ])
    // Figma, Notion, Canva, Asana e monday.com; Miro fica fora, sem Sinal nem Contatos
    expect(await nomesNaTabela()).toHaveLength(5)

    await usuario.click(screen.getByRole('button', { name: 'Remover filtro Com sinal' }))
    await usuario.click(screen.getByRole('button', { name: 'Remover filtro Com contatos' }))
    expect(chips()).toEqual(['Aderência: Quente', 'Aderência: Fit', 'Segmento: Produtividade'])
    expect(await nomesNaTabela()).toContain('Miro')

    await usuario.click(screen.getByRole('button', { name: 'Remover filtro Aderência: Quente' }))
    expect(await nomesNaTabela()).toEqual(['Asana', 'monday.com', 'Miro'])

    // O menu reflete a remoção
    const painel = await abrirFiltros(usuario)
    expect(within(painel).getByRole('checkbox', { name: 'Quente' })).not.toBeChecked()
    expect(within(painel).getByRole('checkbox', { name: 'Fit' })).toBeChecked()
  })

  it('"Limpar filtros" desfaz todos os filtros e mantém a busca', async () => {
    const { usuario } = renderizarApp('/contas')

    await usuario.type(await screen.findByRole('searchbox', { name: 'Buscar contas' }), 'a')
    const comBusca = (await nomesNaTabela()).length
    await filtrar(usuario, 'Aderência', 'Não fit')
    await filtrar(usuario, 'Sinal', 'Com sinal')
    await usuario.keyboard('{Escape}')

    await usuario.click(screen.getByRole('button', { name: 'Limpar filtros' }))

    expect(chips()).toEqual([])
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).not.toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Buscar contas' })).toHaveValue('a')
    expect(await nomesNaTabela()).toHaveLength(comBusca)
  })

  it('filtros sem resultado mostram "Nenhuma conta encontrada", e "Limpar busca e filtros" restaura a lista', async () => {
    const { usuario } = renderizarApp('/contas')

    await filtrar(usuario, 'Aderência', 'Quente')
    await filtrar(usuario, 'Sinal', 'Sem sinal')
    await usuario.keyboard('{Escape}')
    await usuario.type(screen.getByRole('searchbox', { name: 'Buscar contas' }), 'o')

    expect(screen.getByText(/^Nenhuma conta encontrada/)).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Tabela de Contas' })).not.toBeInTheDocument()
    expect(contagem()).toHaveTextContent(/^0 de 30 contas$/)

    await usuario.click(screen.getByRole('button', { name: 'Limpar busca e filtros' }))

    expect(await nomesNaTabela()).toHaveLength(30)
    expect(screen.getByRole('searchbox', { name: 'Buscar contas' })).toHaveValue('')
    expect(chips()).toEqual([])
    expect(contagem()).toHaveTextContent(/^30 contas$/)
  })

  it('só com filtros, a mensagem sem resultado não menciona busca', async () => {
    const { usuario } = renderizarApp('/contas')

    await filtrar(usuario, 'Aderência', 'Quente')
    await filtrar(usuario, 'Sinal', 'Sem sinal')

    expect(screen.getByText('Nenhuma conta encontrada.')).toBeInTheDocument()
  })

  it('abrir o endereço com filtros, busca e ordenação reconstrói a lista, os chips e o menu', async () => {
    const { usuario } = renderizarApp(
      '/contas?aderencia=fit&aderencia=nao-fit&segmento=Produtividade&segmento=Com%C3%A9rcio+eletr%C3%B4nico&contatos=com&ordem=contatos&busca=a',
    )

    // Fit ou Não fit, de Produtividade ou Comércio eletrônico, com Contatos e "a" no nome ou domínio: Miro fica fora
    expect((await nomesNaTabela()).toSorted()).toEqual(['Asana', 'Mercado Livre', 'monday.com'])
    expect(screen.getByRole('searchbox', { name: 'Buscar contas' })).toHaveValue('a')
    expect(screen.getByRole('combobox', { name: 'Ordenar por' })).toHaveDisplayValue('Ordenar por: Contatos')
    expect(chips()).toEqual([
      'Aderência: Fit',
      'Aderência: Não fit',
      'Segmento: Comércio eletrônico',
      'Segmento: Produtividade',
      'Com contatos',
    ])

    const painel = await abrirFiltros(usuario)
    expect(within(painel).getByRole('checkbox', { name: 'Fit' })).toBeChecked()
    expect(within(painel).getByRole('checkbox', { name: 'Produtividade' })).toBeChecked()
    expect(within(painel).getByRole('radio', { name: 'Com contatos' })).toBeChecked()
    expect(within(painel).getByRole('radio', { name: 'Com sinal' })).not.toBeChecked()
  })

  it('filtros desconhecidos no endereço são ignorados', async () => {
    renderizarApp('/contas?aderencia=morna&sinal=talvez')

    expect(await nomesNaTabela()).toHaveLength(30)
    expect(chips()).toEqual([])
  })
})

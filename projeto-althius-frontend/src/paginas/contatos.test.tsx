import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from '@/App'
import type { FonteDeContas } from '@/fonte/contas-tipos'
import { criarFonteDeContasSimulada } from '@/fonte/simulada-contas'
import { criarFonteSimulada } from '@/fonte/simulada'
import { DATA_HOJE_TESTES, renderizarApp } from '@/test/renderizar'

/** As linhas da tabela de Contatos, sem o cabeçalho. */
async function linhasDosContatos() {
  const tabela = await screen.findByRole('table', { name: 'Tabela de Contatos' })
  return within(tabela).getAllByRole('row').slice(1)
}

/** As células da linha de um Contato, achada pelo nome da pessoa. */
async function celulasDoContato(nome: string) {
  const tabela = await screen.findByRole('table', { name: 'Tabela de Contatos' })
  const linha = within(tabela).getByText(nome, { exact: true }).closest('tr')!
  return within(linha).getAllByRole('cell')
}

describe('Abas do módulo Contas e Contatos', () => {
  it('as abas Contas e Contatos aparecem sublinhadas, cada uma com o seu endereço, e Contas é a aberta por padrão', async () => {
    const { usuario } = renderizarApp('/')

    await usuario.click(screen.getByRole('link', { name: 'Contas e Contatos' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Contas' })).toBeInTheDocument()

    const abas = screen.getByRole('navigation', { name: 'Abas de contas e contatos' })
    const abaContas = within(abas).getByRole('link', { name: 'Contas' })
    const abaContatos = within(abas).getByRole('link', { name: 'Contatos' })
    expect(abaContas).toHaveAttribute('href', '/contas')
    expect(abaContatos).toHaveAttribute('href', '/contatos')
    expect(abaContas).toHaveAttribute('aria-current', 'page')
    expect(abaContatos).not.toHaveAttribute('aria-current')

    await usuario.click(abaContatos)
    expect(await screen.findByRole('heading', { level: 1, name: 'Contatos' })).toBeInTheDocument()
    const abasNosContatos = screen.getByRole('navigation', { name: 'Abas de contas e contatos' })
    expect(within(abasNosContatos).getByRole('link', { name: 'Contatos' })).toHaveAttribute('aria-current', 'page')
    expect(within(abasNosContatos).getByRole('link', { name: 'Contas' })).not.toHaveAttribute('aria-current')
  })

  it('o endereço /contatos abre direto a aba Contatos', async () => {
    renderizarApp('/contatos')
    expect(await screen.findByRole('heading', { level: 1, name: 'Contatos' })).toBeInTheDocument()
    expect(await screen.findByRole('table', { name: 'Tabela de Contatos' })).toBeInTheDocument()
  })

  it('o item da sidebar fica ativo nas duas abas', async () => {
    const { usuario } = renderizarApp('/contas')
    const itemDaSidebar = () =>
      within(screen.getByRole('navigation', { name: 'Workspace' })).getByRole('link', { name: 'Contas e Contatos' })

    await screen.findByRole('table', { name: 'Tabela de Contas' })
    expect(itemDaSidebar()).toHaveAttribute('aria-current', 'page')

    await usuario.click(screen.getByRole('link', { name: 'Contatos' }))
    await screen.findByRole('table', { name: 'Tabela de Contatos' })
    expect(itemDaSidebar()).toHaveAttribute('aria-current', 'page')
  })
})

describe('Aba Contatos', () => {
  it('mostra o título, a descrição, a contagem "N contatos" e as sete colunas nessa ordem', async () => {
    renderizarApp('/contatos')

    const tabela = await screen.findByRole('table', { name: 'Tabela de Contatos' })
    expect(screen.getByText('Pessoas das Contas-alvo, organizadas para a próxima abordagem.')).toBeInTheDocument()
    expect(
      screen.getByText((_, elemento) => elemento?.tagName === 'SPAN' && /^\d+ contatos?$/.test(elemento.textContent ?? '')),
    ).toHaveTextContent(/^94 contatos$/)

    const cabecalhos = within(tabela)
      .getAllByRole('columnheader')
      .map((th) => th.textContent?.trim())
    expect(cabecalhos).toEqual([
      'Nome',
      'Cargo',
      'Empresa',
      'Área',
      'Persona',
      'Dados de contato',
      'Último contato',
    ])
  })

  it('cada linha mostra o nome, o cargo, a empresa, a área, a Persona e o Último contato que a fonte entrega', async () => {
    renderizarApp('/contatos')

    const alex = await celulasDoContato('Alex Rivera')
    expect(alex[0]).toHaveTextContent('Alex Rivera')
    expect(alex[1]).toHaveTextContent('Enterprise Sales Director')
    expect(alex[2]).toHaveTextContent('Anthropic')
    expect(alex[3]).toHaveTextContent('Vendas')
    expect(alex[4]).toHaveTextContent('Patrocinador executivo')
    // Há dez dias, na regra de datas do módulo
    expect(alex[6]).toHaveTextContent('Há 1 semana')

    // Sem Persona e sem Interação
    const clara = await celulasDoContato('Clara Dupont')
    expect(clara[4]).toHaveTextContent(/^—$/)
    expect(clara[6]).toHaveTextContent(/^Nunca$/)
  })

  it('sem cargo, área ou Persona, a célula mostra "—"', async () => {
    // Todos os Contatos da demo têm cargo e área: só neste teste, a fonte entrega a Clara Dupont sem eles
    const fonteDeContas = criarFonteDeContasSimulada({ atrasoMs: 0, hoje: DATA_HOJE_TESTES })
    const semDadosNaClara: FonteDeContas = {
      ...fonteDeContas,
      contatos: async () =>
        (await fonteDeContas.contatos()).map((contato) =>
          contato.nome === 'Clara Dupont' ? { ...contato, cargo: undefined, area: undefined, persona: undefined } : contato,
        ),
    }
    render(
      <App
        fonte={criarFonteSimulada({ atrasoMs: 0 })}
        fonteDeContas={semDadosNaClara}
        rotaInicial="/contatos"
        animarDigitacao={false}
      />,
    )

    const clara = await celulasDoContato('Clara Dupont')
    expect(clara[1]).toHaveTextContent(/^—$/)
    expect(clara[3]).toHaveTextContent(/^—$/)
    expect(clara[4]).toHaveTextContent(/^—$/)
  })

  it('Dados de contato mostra os três canais com o nome acessível do estado, sem valores nem links', async () => {
    renderizarApp('/contatos')

    // Alex Rivera: e-mail e LinkedIn, sem telefone
    const canais = (await celulasDoContato('Alex Rivera'))[5]
    const icones = within(canais).getAllByRole('img')
    expect(icones.map((icone) => icone.getAttribute('aria-label'))).toEqual([
      'E-mail disponível',
      'Telefone não disponível',
      'LinkedIn disponível',
    ])
    expect(within(canais).queryByRole('link')).not.toBeInTheDocument()
    expect(canais).toHaveTextContent(/^$/)

    // Maya Lin tem os três
    const todos = (await celulasDoContato('Maya Lin'))[5]
    expect(within(todos).getByRole('img', { name: 'Telefone disponível' })).toBeInTheDocument()
  })

  it('a linha não é clicável', async () => {
    const { usuario } = renderizarApp('/contatos')

    const linhas = await linhasDosContatos()
    expect(linhas[0]).not.toHaveClass('cursor-pointer')
    await usuario.click(within(linhas[0]).getAllByRole('cell')[3])
    expect(screen.getByRole('heading', { level: 1, name: 'Contatos' })).toBeInTheDocument()
  })

  it('o nome da empresa é um link que abre aquela Conta-alvo', async () => {
    const { usuario } = renderizarApp('/contatos')

    const empresa = within((await celulasDoContato('Alex Rivera'))[2]).getByRole('link', { name: 'Anthropic' })
    expect(empresa).toHaveAttribute('href', '/contas/anthropic')
    await usuario.click(empresa)

    expect(await screen.findByRole('heading', { level: 1, name: 'Anthropic' })).toBeInTheDocument()
  })

  it('a ordem é a Aderência da empresa, depois o nome da empresa e depois o nome da pessoa', async () => {
    renderizarApp('/contatos')

    const linhas = await linhasDosContatos()
    const empresas = linhas.map((linha) => within(linha).getAllByRole('cell')[2].textContent)
    // O nome da pessoa, sem as iniciais do avatar
    const pessoas = linhas.map((linha) => within(linha).getAllByRole('cell')[0].lastElementChild?.lastElementChild?.textContent)

    // As empresas em blocos: Quentes, depois Fit, depois Não fit e por último a não avaliada, cada grupo pelo nome
    expect([...new Set(empresas)]).toEqual([
      'Anthropic',
      'Brex',
      'Canva',
      'Cloudflare',
      'Databricks',
      'Deel',
      'Figma',
      'GitLab',
      'HubSpot',
      'MongoDB',
      'Notion',
      'Nubank',
      'OpenAI',
      'Ramp',
      'Rippling',
      'Snowflake',
      'Stripe',
      'Vercel',
      'Asana',
      'monday.com',
      'Okta',
      'Oracle',
      'SAP',
      'Twilio',
      'Zendesk',
      'Mercado Livre',
      'BBVA México',
    ])
    // Cada empresa num bloco só
    expect(empresas.filter((empresa, i) => empresa !== empresas[i - 1])).toHaveLength(27)

    // Dentro da empresa, pelo nome da pessoa
    expect(pessoas.slice(0, 4)).toEqual(['Alex Rivera', 'Clara Dupont', 'Maya Lin', 'Arthur Rios'])
    expect(pessoas.filter((_, i) => empresas[i] === 'Stripe')).toEqual([
      'David Kim',
      'Rachel Green',
      'Robert Thorne',
      'Sofia Mendez',
    ])
    expect(pessoas.slice(-2)).toEqual(['Carlos Mendoza', 'Sofia Ortiz'])
  })

  it('enquanto carrega, aparece o pulso do app', async () => {
    renderizarApp('/contatos', { atrasoMs: 150 })

    expect(screen.getByRole('status')).toHaveTextContent('Carregando')

    expect(await screen.findByRole('table', { name: 'Tabela de Contatos' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('com a fonte vazia, exibe mensagem explicativa sem botões', async () => {
    renderizarApp('/contatos', { vazia: true })

    expect(
      await screen.findByText(
        'Nenhum Contato ainda. As pessoas aparecem aqui quando vierem do CRM, de enriquecimento ou de um Agente.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /configurar|novo|adicionar|tentar/i })).not.toBeInTheDocument()
  })

  it('com a fonte em falha, exibe mensagem curta de erro com "Tentar de novo" que recupera os dados', async () => {
    const { fonteDeContas, usuario } = renderizarApp('/contatos', { falha: true })

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar os contatos.')

    fonteDeContas.definirFalha(false)
    await usuario.click(screen.getByRole('button', { name: 'Tentar de novo' }))

    expect(await screen.findByRole('table', { name: 'Tabela de Contatos' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

type Usuario = ReturnType<typeof renderizarApp>['usuario']

/** Os nomes das pessoas na tabela de Contatos, na ordem exibida, sem as iniciais do avatar. */
async function nomesDosContatos() {
  return (await linhasDosContatos()).map(
    (linha) => within(linha).getAllByRole('cell')[0].lastElementChild?.lastElementChild?.textContent,
  )
}

/** A contagem ao lado do título: "N contatos" ou, com busca ou filtro, "N de M contatos". */
function contagem() {
  return screen.getByText(
    (_, elemento) => elemento?.tagName === 'SPAN' && /^\d+( de \d+)? contatos?$/.test(elemento.textContent ?? ''),
  )
}

/** Abre o menu "Filtros" da aba Contatos e devolve o painel. */
async function abrirFiltros(usuario: Usuario) {
  await usuario.click(await screen.findByRole('button', { name: /^Filtros/ }))
  return screen.findByRole('dialog', { name: 'Filtrar contatos' })
}

/** Marca uma opção do grupo de filtros com esse nome. */
async function filtrar(usuario: Usuario, grupo: string, opcao: string) {
  const painel = screen.queryByRole('dialog', { name: 'Filtrar contatos' }) ?? (await abrirFiltros(usuario))
  await usuario.click(within(within(painel).getByRole('group', { name: grupo })).getByRole('checkbox', { name: opcao }))
}

/** Os rótulos dos chips de filtros ativos, na ordem em que aparecem. */
function chips() {
  return screen
    .queryAllByRole('button', { name: /^Remover filtro / })
    .map((botao) => botao.getAttribute('aria-label')?.replace(/^Remover filtro /, ''))
}

/** O app sobre a demo, com essas pessoas (por padrão, a Clara Dupont e o Carlos Mendoza) sem nenhum canal. */
function renderizarComContatosSemCanais(rota: string, semCanal = ['Clara Dupont', 'Carlos Mendoza']) {
  const fonteDeContas = criarFonteDeContasSimulada({ atrasoMs: 0, hoje: DATA_HOJE_TESTES })
  const semCanais: FonteDeContas = {
    ...fonteDeContas,
    contatos: async () =>
      (await fonteDeContas.contatos()).map((contato) =>
        semCanal.includes(contato.nome)
          ? { ...contato, canais: { email: false, telefone: false, linkedin: false } }
          : contato,
      ),
  }
  const usuario = userEvent.setup()
  render(
    <App fonte={criarFonteSimulada({ atrasoMs: 0 })} fonteDeContas={semCanais} rotaInicial={rota} animarDigitacao={false} />,
  )
  return { usuario }
}

describe('Busca da aba Contatos', () => {
  it('a busca encontra pelo nome ignorando maiúsculas e acentos, e a contagem mostra "N de M contatos"', async () => {
    const { usuario } = renderizarApp('/contatos')

    await usuario.type(await screen.findByRole('searchbox', { name: 'Buscar contatos' }), 'JOAO')

    expect(await nomesDosContatos()).toEqual(['João Bosco'])
    expect(contagem()).toHaveTextContent(/^1 de 94 contatos$/)
  })

  it('a busca encontra pelo cargo', async () => {
    const { usuario } = renderizarApp('/contatos')

    await usuario.type(await screen.findByRole('searchbox', { name: 'Buscar contatos' }), 'cfo')

    expect(await nomesDosContatos()).toEqual(['Robert Thorne'])
  })

  it('a busca encontra pela empresa, e mantém a ordem fixa', async () => {
    const { usuario } = renderizarApp('/contatos')

    await usuario.type(await screen.findByRole('searchbox', { name: 'Buscar contatos' }), 'mexico')

    expect(await nomesDosContatos()).toEqual(['Carlos Mendoza', 'Sofia Ortiz'])
    expect(contagem()).toHaveTextContent(/^2 de 94 contatos$/)
  })

  it('uma busca sem resultado mostra a mensagem e "Limpar busca e filtros" restaura a lista', async () => {
    const { usuario } = renderizarApp('/contatos')

    await filtrar(usuario, 'Aderência da empresa', 'Fit')
    await usuario.keyboard('{Escape}')
    await usuario.type(screen.getByRole('searchbox', { name: 'Buscar contatos' }), 'xyz')

    expect(screen.getByText('Nenhum contato encontrado para “xyz”.')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Tabela de Contatos' })).not.toBeInTheDocument()
    expect(contagem()).toHaveTextContent(/^0 de 94 contatos$/)

    await usuario.click(screen.getByRole('button', { name: 'Limpar busca e filtros' }))

    expect(await nomesDosContatos()).toHaveLength(94)
    expect(screen.getByRole('searchbox', { name: 'Buscar contatos' })).toHaveValue('')
    expect(chips()).toEqual([])
    expect(contagem()).toHaveTextContent(/^94 contatos$/)
  })
})

describe('Filtros da aba Contatos', () => {
  it('"Filtros" abre um menu com a Aderência da empresa e os Dados de contato, sem Persona nem ordenação', async () => {
    const { usuario } = renderizarApp('/contatos')

    const painel = await abrirFiltros(usuario)

    expect(within(painel).getAllByRole('group').map((g) => g.querySelector('legend')?.textContent)).toEqual([
      'Aderência da empresa',
      'Dados de contato',
    ])
    const opcoes = (grupo: string, nomes: string[]) => {
      const doGrupo = within(within(painel).getByRole('group', { name: grupo }))
      expect(doGrupo.getAllByRole('checkbox')).toEqual(nomes.map((nome) => doGrupo.getByRole('checkbox', { name: nome })))
    }
    opcoes('Aderência da empresa', ['Quente', 'Fit', 'Não fit'])
    opcoes('Dados de contato', ['Com algum canal'])
    expect(screen.queryByRole('combobox', { name: 'Ordenar por' })).not.toBeInTheDocument()
  })

  it('a Aderência da empresa reduz a lista, e opções marcadas juntas se combinam com "ou"', async () => {
    const { usuario } = renderizarApp('/contatos')

    await filtrar(usuario, 'Aderência da empresa', 'Não fit')
    expect(await nomesDosContatos()).toEqual(['Gustavo Lima', 'Renan Coelho', 'Sandra Esteves'])
    expect(contagem()).toHaveTextContent(/^3 de 94 contatos$/)

    await filtrar(usuario, 'Aderência da empresa', 'Fit')
    expect(await nomesDosContatos()).toHaveLength(23)
    expect(screen.getByRole('button', { name: 'Filtros, 2 ativos' })).toBeInTheDocument()
  })

  it('"Com algum canal" deixa só quem tem pelo menos um canal disponível', async () => {
    const { usuario } = renderizarComContatosSemCanais('/contatos')

    await filtrar(usuario, 'Dados de contato', 'Com algum canal')

    const nomes = await nomesDosContatos()
    expect(nomes).toHaveLength(92)
    expect(nomes).not.toContain('Clara Dupont')
    expect(nomes).not.toContain('Carlos Mendoza')
    expect(chips()).toEqual(['Com dados de contato'])
  })

  it('cada filtro ativo aparece como um chip, e remover o chip desfaz o filtro', async () => {
    const { usuario } = renderizarComContatosSemCanais('/contatos')

    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).not.toBeInTheDocument()

    await filtrar(usuario, 'Aderência da empresa', 'Quente')
    await filtrar(usuario, 'Dados de contato', 'Com algum canal')
    await usuario.keyboard('{Escape}')

    expect(chips()).toEqual(['Aderência: Quente', 'Com dados de contato'])
    expect(await nomesDosContatos()).toHaveLength(68)

    await usuario.click(screen.getByRole('button', { name: 'Remover filtro Com dados de contato' }))
    expect(chips()).toEqual(['Aderência: Quente'])
    expect(await nomesDosContatos()).toContain('Clara Dupont')

    // O menu reflete a remoção
    const painel = await abrirFiltros(usuario)
    expect(within(painel).getByRole('checkbox', { name: 'Com algum canal' })).not.toBeChecked()
    expect(within(painel).getByRole('checkbox', { name: 'Quente' })).toBeChecked()
  })

  it('"Limpar filtros" desfaz todos os filtros e mantém a busca', async () => {
    const { usuario } = renderizarApp('/contatos')

    await usuario.type(await screen.findByRole('searchbox', { name: 'Buscar contatos' }), 'head')
    const comBusca = (await nomesDosContatos()).length
    await filtrar(usuario, 'Aderência da empresa', 'Fit')
    await filtrar(usuario, 'Dados de contato', 'Com algum canal')
    await usuario.keyboard('{Escape}')

    await usuario.click(screen.getByRole('button', { name: 'Limpar filtros' }))

    expect(chips()).toEqual([])
    expect(screen.getByRole('searchbox', { name: 'Buscar contatos' })).toHaveValue('head')
    expect(await nomesDosContatos()).toHaveLength(comBusca)
  })

  it('só com filtros, a mensagem sem resultado não menciona busca', async () => {
    renderizarComContatosSemCanais('/contatos?aderencia=nao-fit&dados=com', ['Gustavo Lima', 'Sandra Esteves', 'Renan Coelho'])

    expect(await screen.findByText('Nenhum contato encontrado.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Limpar busca e filtros' })).toBeInTheDocument()
  })

  it('abrir o endereço com busca e filtros reconstrói a lista, os chips e o menu', async () => {
    const { usuario } = renderizarComContatosSemCanais('/contatos?aderencia=quente&aderencia=fit&dados=com&busca=head')

    const nomes = await nomesDosContatos()
    expect(nomes).toContain('Sarah Chen')
    expect(nomes).toContain('Eduardo Pires')
    expect(nomes).not.toContain('Andre Prado')
    expect(screen.getByRole('searchbox', { name: 'Buscar contatos' })).toHaveValue('head')
    expect(chips()).toEqual(['Aderência: Quente', 'Aderência: Fit', 'Com dados de contato'])

    const painel = await abrirFiltros(usuario)
    expect(within(painel).getByRole('checkbox', { name: 'Fit' })).toBeChecked()
    expect(within(painel).getByRole('checkbox', { name: 'Não fit' })).not.toBeChecked()
    expect(within(painel).getByRole('checkbox', { name: 'Com algum canal' })).toBeChecked()
  })

  it('filtros desconhecidos no endereço são ignorados', async () => {
    renderizarApp('/contatos?aderencia=morna&dados=talvez&segmento=Produtividade')

    expect(await nomesDosContatos()).toHaveLength(94)
    expect(chips()).toEqual([])
  })
})

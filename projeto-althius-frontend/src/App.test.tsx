import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderizarApp } from '@/test/renderizar'

const ESPECIALISTAS = ['Scopus', 'Ethos', 'Rhetor', 'Oraculum']
const AGENTES_CRIADOS = [
  'Scopus · Enterprise LATAM',
  'Ethos · Comitê financeiro',
  'Rhetor · Sequências outbound',
  'Rhetor · Anúncios Meta',
  'Oraculum · Concorrência Snowflake',
]

async function grade() {
  const lista = await screen.findByRole('list', { name: 'Agentes do Workspace' })
  await within(lista).findByRole('link', { name: 'Scopus' })
  return lista
}

describe('Grade de Agentes', () => {
  it('mostra os 9 Agentes do Workspace, padrão e criados', async () => {
    renderizarApp('/')
    expect(await screen.findByRole('heading', { level: 1, name: 'Agentes' })).toBeInTheDocument()
    const lista = await grade()
    expect(within(lista).getAllByRole('listitem')).toHaveLength(9)
    for (const nome of [...ESPECIALISTAS, ...AGENTES_CRIADOS]) {
      expect(within(lista).getByRole('link', { name: nome })).toBeInTheDocument()
    }
  })

  it('cada cartão mostra o estado, quando roda, as execuções exatas e os logos das Integrações', async () => {
    renderizarApp('/')
    const lista = await grade()

    const scopus = within(lista).getByRole('link', { name: 'Scopus' })
    expect(within(scopus).getByText('Detectou algo')).toBeInTheDocument()
    expect(
      within(scopus).getByText('Define o ICP a partir dos seus melhores clientes e dá nota de aderência a cada Conta-alvo.'),
    ).toBeInTheDocument()
    expect(within(scopus).getByText('Toda terça às 08:00')).toBeInTheDocument()
    expect(within(scopus).getByText('312')).toBeInTheDocument()
    for (const integracao of ['HubSpot', 'Clay', 'Apollo', 'Lusha']) {
      expect(within(scopus).getByRole('img', { name: integracao })).toBeInTheDocument()
    }

    const rhetor = within(lista).getByRole('link', { name: 'Rhetor' })
    expect(within(rhetor).getByText('Trabalhando')).toBeInTheDocument()
    expect(within(rhetor).getByText('Todo dia às 07:30')).toBeInTheDocument()

    // A Rotina do Ethos está pausada: ele roda sob demanda.
    const ethos = within(lista).getByRole('link', { name: 'Ethos' })
    expect(within(ethos).getByText('Disponível')).toBeInTheDocument()
    expect(within(ethos).getByText('Sob demanda')).toBeInTheDocument()

    // No Agente criado, a descrição são as instruções dele, e os logos são só os das Integrações que usa.
    const anuncios = within(lista).getByRole('link', { name: 'Rhetor · Anúncios Meta' })
    expect(within(anuncios).getByText(/copy de anúncios para o Meta Ads/)).toBeInTheDocument()
    expect(within(anuncios).getByText('Sob demanda')).toBeInTheDocument()
    expect(within(anuncios).getByText('17')).toBeInTheDocument()
    expect(within(anuncios).getByRole('img', { name: 'Meta Ads' })).toBeInTheDocument()
    expect(within(anuncios).queryByRole('img', { name: 'Google Ads' })).not.toBeInTheDocument()
  })

  it('não tem painel de métricas, barra de comando nem busca', async () => {
    const { usuario } = renderizarApp('/')
    await grade()
    expect(screen.queryByRole('region', { name: 'Painel' })).not.toBeInTheDocument()
    expect(screen.queryByText('Horas economizadas')).not.toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    await usuario.keyboard('{Control>}k{/Control}')
    expect(screen.queryByRole('combobox', { name: 'Comando' })).not.toBeInTheDocument()
  })

  it('abre a página de um Agente criado, e as sub-abas mostram os dados dele', async () => {
    const { usuario } = renderizarApp('/')
    await usuario.click(within(await grade()).getByRole('link', { name: 'Scopus · Enterprise LATAM' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Scopus · Enterprise LATAM' })).toBeInTheDocument()
    const subabas = screen.getByRole('navigation', { name: 'Seções do agente' })

    await usuario.click(within(subabas).getByRole('link', { name: 'Memória' }))
    expect(await screen.findByText(/Contas-alvo no México/)).toBeInTheDocument()

    await usuario.click(within(subabas).getByRole('link', { name: 'Rotinas' }))
    expect(await screen.findByText(/Toda segunda às 08:30/)).toBeInTheDocument()

    await usuario.click(within(subabas).getByRole('link', { name: 'Configuração' }))
    expect(await screen.findByRole('textbox', { name: 'Instruções adicionais' })).toHaveValue(
      'Pontue só Contas-alvo enterprise no Brasil, no México e na Colômbia, com mais de 5.000 funcionários.',
    )

    await usuario.click(within(subabas).getByRole('link', { name: 'Atividade' }))
    expect(await screen.findByText(/Reavaliou 40 Contas-alvo enterprise/)).toBeInTheDocument()
  })
})

describe('Casca', () => {
  it('a sidebar tem o Workspace, o selo de demonstração, os Especialistas e o Workspace', async () => {
    renderizarApp('/')
    const sidebar = await screen.findByRole('complementary', { name: 'Navegação' })
    expect(await within(sidebar).findByText('Databricks')).toBeInTheDocument()
    expect(within(sidebar).getByText('Demonstração')).toBeInTheDocument()

    const especialistas = within(sidebar).getByRole('navigation', { name: 'Especialistas' })
    await within(especialistas).findByRole('link', { name: 'Scopus' })
    expect(within(especialistas).getAllByRole('link').map((l) => l.textContent)).toEqual(ESPECIALISTAS)

    const workspace = within(sidebar).getByRole('navigation', { name: 'Workspace' })
    expect(within(workspace).getByRole('link', { name: 'Agentes' })).toBeInTheDocument()
    expect(within(workspace).getByRole('link', { name: 'Conexões' })).toBeInTheDocument()
    expect(await within(workspace).findByRole('link', { name: 'Aprovações, 2 pendentes' })).toBeInTheDocument()
  })

  it('a contagem de Aprovações pendentes acompanha as decisões', async () => {
    const { usuario } = renderizarApp('/aprovacoes')
    const proposta = await screen.findByRole('article', { name: /Subir campanha no Meta Ads/ })
    await usuario.click(within(proposta).getByRole('button', { name: 'Aprovar' }))
    const workspace = screen.getByRole('navigation', { name: 'Workspace' })
    expect(await within(workspace).findByRole('link', { name: 'Aprovações, 1 pendente' })).toBeInTheDocument()
  })

  it('um Especialista na sidebar abre a página do Agente padrão', async () => {
    const { usuario } = renderizarApp('/')
    const especialistas = await screen.findByRole('navigation', { name: 'Especialistas' })
    await usuario.click(await within(especialistas).findByRole('link', { name: 'Oraculum' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Oraculum' })).toBeInTheDocument()
  })
})

async function criarAgente(
  usuario: ReturnType<typeof renderizarApp>['usuario'],
  { especialidade, complemento, instrucoes }: { especialidade: string; complemento: string; instrucoes?: string },
) {
  await usuario.click(await screen.findByRole('button', { name: 'Novo agente' }))
  const dialogo = await screen.findByRole('dialog', { name: 'Novo agente' })
  await usuario.click(within(dialogo).getByRole('radio', { name: new RegExp(`^${especialidade}`) }))
  await usuario.type(within(dialogo).getByRole('textbox', { name: 'Complemento do nome' }), complemento)
  if (instrucoes) await usuario.type(within(dialogo).getByRole('textbox', { name: /Instruções/ }), instrucoes)
  await usuario.click(within(dialogo).getByRole('button', { name: 'Criar agente' }))
}

describe('Criar Agente', () => {
  it('Novo agente abre o formulário com as 4 Especialidades, sem opção de criar Especialidade', async () => {
    const { usuario } = renderizarApp('/')
    await grade()
    await usuario.click(screen.getByRole('button', { name: 'Novo agente' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Novo agente' })
    const especialidades = within(dialogo).getByRole('radiogroup', { name: 'Especialidade' })
    expect(within(especialidades).getAllByRole('radio').map((r) => r.getAttribute('aria-label'))).toEqual(ESPECIALISTAS)
    expect(within(dialogo).queryByRole('button', { name: /especialidade/i })).not.toBeInTheDocument()
    expect(within(dialogo).queryByRole('textbox', { name: /especialidade/i })).not.toBeInTheDocument()
  })

  it('só cria com uma Especialidade e um complemento', async () => {
    const { usuario } = renderizarApp('/')
    await grade()
    await usuario.click(screen.getByRole('button', { name: 'Novo agente' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Novo agente' })
    const criar = within(dialogo).getByRole('button', { name: 'Criar agente' })
    expect(criar).toBeDisabled()
    await usuario.click(within(dialogo).getByRole('radio', { name: 'Ethos' }))
    expect(criar).toBeDisabled()
    await usuario.type(within(dialogo).getByRole('textbox', { name: 'Complemento do nome' }), '   ')
    expect(criar).toBeDisabled()
    await usuario.type(within(dialogo).getByRole('textbox', { name: 'Complemento do nome' }), 'Saúde')
    expect(within(dialogo).getByText('Ethos · Saúde')).toBeInTheDocument()
    expect(criar).toBeEnabled()
  })

  it('o Agente criado entra na grade, sob demanda e sem execuções, e a página dele abre', async () => {
    const { usuario } = renderizarApp('/')
    await grade()
    await criarAgente(usuario, { especialidade: 'Ethos', complemento: 'Saúde', instrucoes: 'Foque em hospitais privados.' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Ethos · Saúde' })).toBeInTheDocument()

    await usuario.click(within(screen.getByRole('navigation', { name: 'Workspace' })).getByRole('link', { name: 'Agentes' }))
    const cartao = within(await grade()).getByRole('link', { name: 'Ethos · Saúde' })
    expect(within(cartao).getByText('Foque em hospitais privados.')).toBeInTheDocument()
    expect(within(cartao).getByText('Sob demanda')).toBeInTheDocument()
    expect(within(cartao).getByText('0')).toBeInTheDocument()
  })

  it('começa com a Personalização, as Permissões e as Habilidades do padrão, sem Memória nem Rotinas', async () => {
    const { usuario } = renderizarApp('/')
    await grade()
    await criarAgente(usuario, { especialidade: 'Rhetor', complemento: 'Eventos', instrucoes: 'Convites para eventos de dados.' })
    await screen.findByRole('heading', { level: 1, name: 'Rhetor · Eventos' })
    const subabas = screen.getByRole('navigation', { name: 'Seções do agente' })

    await usuario.click(within(subabas).getByRole('link', { name: 'Configuração' }))
    expect(await screen.findByRole('textbox', { name: 'Instruções adicionais' })).toHaveValue('Convites para eventos de dados.')
    expect(screen.getByRole('textbox', { name: 'Tom de voz' })).toHaveValue('Técnico e direto, como a Databricks fala com engenheiros.')
    const metaAds = screen.getByRole('radiogroup', { name: 'Permissão em Meta Ads' })
    expect(within(metaAds).getByRole('radio', { name: 'Propor' })).toBeChecked()
    expect(screen.getByRole('radiogroup', { name: 'Permissão em Google Ads' })).toBeInTheDocument()

    await usuario.click(within(subabas).getByRole('link', { name: 'Habilidades' }))
    expect(await screen.findByRole('switch', { name: /E-mail frio curto/ })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /Sequência por persona/ })).toBeInTheDocument()

    await usuario.click(within(subabas).getByRole('link', { name: 'Memória' }))
    expect(await screen.findByText('Rhetor · Eventos ainda não guardou nenhum fato.')).toBeInTheDocument()

    await usuario.click(within(subabas).getByRole('link', { name: 'Rotinas' }))
    expect(await screen.findByText('Nenhuma rotina ainda.')).toBeInTheDocument()
  })

  it('mudar a Personalização do Agente criado não muda a do Agente padrão', async () => {
    const { usuario } = renderizarApp('/')
    await grade()
    await criarAgente(usuario, { especialidade: 'Rhetor', complemento: 'Eventos' })
    await screen.findByRole('heading', { level: 1, name: 'Rhetor · Eventos' })
    const subabas = screen.getByRole('navigation', { name: 'Seções do agente' })
    await usuario.click(within(subabas).getByRole('link', { name: 'Configuração' }))
    const tom = await screen.findByRole('textbox', { name: 'Tom de voz' })
    await usuario.clear(tom)
    await usuario.type(tom, 'Leve e convidativo.')
    await usuario.click(screen.getByRole('button', { name: 'Salvar personalização' }))
    await screen.findByText('Personalização salva.')

    const especialistas = screen.getByRole('navigation', { name: 'Especialistas' })
    await usuario.click(within(especialistas).getByRole('link', { name: 'Rhetor' }))
    await screen.findByRole('heading', { level: 1, name: 'Rhetor' })
    await usuario.click(within(screen.getByRole('navigation', { name: 'Seções do agente' })).getByRole('link', { name: 'Configuração' }))
    expect(await screen.findByRole('textbox', { name: 'Tom de voz' })).toHaveValue(
      'Técnico e direto, como a Databricks fala com engenheiros.',
    )
  })
})

describe('Excluir Agente', () => {
  it('um Agente criado oferece a exclusão, com confirmação, e some da grade', async () => {
    const { usuario } = renderizarApp('/agentes/rhetor-anuncios-meta/conversa')
    await screen.findByRole('heading', { level: 1, name: 'Rhetor · Anúncios Meta' })
    await usuario.click(screen.getByRole('button', { name: 'Excluir agente' }))
    const confirmacao = await screen.findByRole('dialog', { name: 'Excluir Rhetor · Anúncios Meta?' })
    await usuario.click(within(confirmacao).getByRole('button', { name: 'Excluir' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Agentes' })).toBeInTheDocument()
    const lista = await grade()
    await waitFor(() => expect(within(lista).getAllByRole('listitem')).toHaveLength(8))
    expect(within(lista).queryByRole('link', { name: 'Rhetor · Anúncios Meta' })).not.toBeInTheDocument()
  })

  it('cancelar a confirmação mantém o Agente', async () => {
    const { usuario } = renderizarApp('/agentes/rhetor-anuncios-meta/conversa')
    await screen.findByRole('heading', { level: 1, name: 'Rhetor · Anúncios Meta' })
    await usuario.click(screen.getByRole('button', { name: 'Excluir agente' }))
    const confirmacao = await screen.findByRole('dialog', { name: 'Excluir Rhetor · Anúncios Meta?' })
    await usuario.click(within(confirmacao).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { level: 1, name: 'Rhetor · Anúncios Meta' })).toBeInTheDocument()
  })

  it('o Agente excluído sai do autocompletar de @', async () => {
    const { usuario } = renderizarApp('/agentes/rhetor-anuncios-meta/conversa')
    await screen.findByRole('heading', { level: 1, name: 'Rhetor · Anúncios Meta' })
    await usuario.click(screen.getByRole('button', { name: 'Excluir agente' }))
    await usuario.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Excluir' }))
    await usuario.click(within(await grade()).getByRole('link', { name: 'Scopus' }))
    await usuario.type(await screen.findByRole('textbox', { name: 'Mensagem para Scopus' }), '@Rhe')
    const opcoes = await screen.findByRole('listbox', { name: 'Agentes' })
    expect(within(opcoes).getByRole('option', { name: 'Rhetor' })).toBeInTheDocument()
    expect(within(opcoes).queryByRole('option', { name: 'Rhetor · Anúncios Meta' })).not.toBeInTheDocument()
  })

  it('o Agente padrão não oferece exclusão, e nenhum Agente pode ser renomeado', async () => {
    renderizarApp('/agentes/rhetor/configuracao')
    await screen.findByRole('heading', { level: 2, name: 'Configuração' })
    expect(screen.queryByRole('button', { name: 'Excluir agente' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /nome/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /renomear/i })).not.toBeInTheDocument()
  })

  it('um Agente criado também não pode ser renomeado', async () => {
    renderizarApp('/agentes/scopus-enterprise-latam/configuracao')
    await screen.findByRole('heading', { level: 2, name: 'Configuração' })
    expect(screen.queryByRole('textbox', { name: /nome/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /renomear/i })).not.toBeInTheDocument()
  })
})

describe('Página do Agente', () => {
  it('abre um Agente pela galeria e navega pelas 7 sub-abas', async () => {
    const { usuario } = renderizarApp('/')
    await usuario.click(within(await grade()).getByRole('link', { name: 'Scopus' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Scopus' })).toBeInTheDocument()
    const subabas = screen.getByRole('navigation', { name: 'Seções do agente' })
    for (const nome of ['Conversa', 'Memória', 'Habilidades', 'Rotinas', 'Canais', 'Configuração', 'Atividade']) {
      expect(within(subabas).getByRole('link', { name: nome })).toBeInTheDocument()
    }
    await usuario.click(within(subabas).getByRole('link', { name: 'Memória' }))
    expect(await screen.findByRole('heading', { level: 2, name: 'Memória' })).toBeInTheDocument()
  })
})

describe('Conversa', () => {
  it('uma sugestão dispara a resposta roteirizada, com as ferramentas usadas', async () => {
    const { usuario } = renderizarApp('/agentes/scopus/conversa')
    await usuario.click(await screen.findByRole('button', { name: /aderência da OpenAI/ }))
    expect(await screen.findByText(/Consultando HubSpot/)).toBeInTheDocument()
    expect(await screen.findByText(/Aderência ao ICP: 87/)).toBeInTheDocument()
  })

  it('texto livre recebe uma resposta genérica do Agente atual', async () => {
    const { usuario } = renderizarApp('/agentes/rhetor/conversa')
    const campo = await screen.findByRole('textbox', { name: 'Mensagem para Rhetor' })
    await usuario.type(campo, 'qual é a previsão do tempo?{Enter}')
    expect(await screen.findByText('qual é a previsão do tempo?')).toBeInTheDocument()
    expect(await screen.findByText(/Ainda não tenho um roteiro para esse pedido/)).toBeInTheDocument()
  })

  it('@menção mostra o autocompletar e traz outro Agente para a Conversa', async () => {
    const { usuario } = renderizarApp('/agentes/scopus/conversa')
    const campo = await screen.findByRole('textbox', { name: 'Mensagem para Scopus' })
    await usuario.type(campo, '@Et')
    await usuario.click(await screen.findByRole('option', { name: 'Ethos' }))
    expect(campo).toHaveValue('@Ethos ')
    await usuario.type(campo, 'complementa isso{Enter}')
    const repasse = await screen.findByRole('note', { name: 'Repasse de Scopus para Ethos' })
    expect(repasse).toBeInTheDocument()
    expect(await screen.findByText(/Ethos entrou na Conversa/)).toBeInTheDocument()
  })

  it('o roteiro de Colaboração vai de Scopus a Rhetor e termina numa Aprovação', async () => {
    const { usuario } = renderizarApp('/agentes/scopus/conversa')
    await usuario.click(await screen.findByRole('button', { name: /abordagem completa/ }))
    expect(await screen.findByRole('note', { name: 'Repasse de Scopus para Ethos' })).toBeInTheDocument()
    expect(await screen.findByRole('note', { name: 'Repasse de Ethos para Rhetor' })).toBeInTheDocument()
    const aprovacao = await screen.findByRole('article', { name: /Aprovação pendente/ })
    expect(within(aprovacao).getByText(/HubSpot/)).toBeInTheDocument()
    expect(within(aprovacao).getByText(/Slack/)).toBeInTheDocument()
  })
})

describe('Conversa com Agentes criados e Menções', () => {
  it('uma sugestão na Conversa de um Agente criado produz o roteiro da Especialidade, em nome dele', async () => {
    const { usuario } = renderizarApp('/agentes/scopus-enterprise-latam/conversa')
    await usuario.click(await screen.findByRole('button', { name: /aderência da OpenAI/ }))
    const conversa = screen.getByRole('region', { name: 'Conversa' })
    expect(await within(conversa).findByText(/Consultando HubSpot/)).toBeInTheDocument()
    expect(await within(conversa).findByText(/Aderência ao ICP: 87/)).toBeInTheDocument()
    expect(within(conversa).getByText('Scopus · Enterprise LATAM')).toBeInTheDocument()
  })

  it('texto livre na Conversa de um Agente criado recebe a resposta genérica, em nome dele', async () => {
    const { usuario } = renderizarApp('/agentes/ethos-comite-financeiro/conversa')
    await usuario.type(await screen.findByRole('textbox', { name: 'Mensagem para Ethos · Comitê financeiro' }), 'e o CFO da Nubank?{Enter}')
    expect(await screen.findByText(/No produto, Ethos · Comitê financeiro responderia/)).toBeInTheDocument()
  })

  it('o autocompletar de @ lista os Agentes criados pelo nome completo e filtra enquanto se digita', async () => {
    const { usuario } = renderizarApp('/agentes/ethos/conversa')
    const campo = await screen.findByRole('textbox', { name: 'Mensagem para Ethos' })
    await usuario.type(campo, '@Scop')
    const opcoes = await screen.findByRole('listbox', { name: 'Agentes' })
    expect(within(opcoes).getAllByRole('option').map((o) => o.getAttribute('aria-label'))).toEqual([
      'Scopus',
      'Scopus · Enterprise LATAM',
    ])
    await usuario.type(campo, 'us ent')
    await waitFor(() =>
      expect(within(screen.getByRole('listbox', { name: 'Agentes' })).getAllByRole('option').map((o) => o.getAttribute('aria-label'))).toEqual([
        'Scopus · Enterprise LATAM',
      ]),
    )
    await usuario.click(screen.getByRole('option', { name: 'Scopus · Enterprise LATAM' }))
    expect(campo).toHaveValue('@Scopus · Enterprise LATAM ')
  })

  it('"@Scopus · Enterprise LATAM" traz o Agente criado; "@Scopus" traz o Agente padrão', async () => {
    const { usuario } = renderizarApp('/agentes/ethos/conversa')
    const campo = await screen.findByRole('textbox', { name: 'Mensagem para Ethos' })
    await usuario.type(campo, '@Scopus · Enterprise LATAM prioriza a Stripe?{Enter}')
    expect(await screen.findByRole('note', { name: 'Repasse de Ethos para Scopus · Enterprise LATAM' })).toBeInTheDocument()
    expect(await screen.findByText(/Scopus · Enterprise LATAM entrou na Conversa/)).toBeInTheDocument()

    await waitFor(() => expect(screen.queryByText(/está trabalhando/)).not.toBeInTheDocument())
    await usuario.type(campo, '@Scopus e a aderência dela?{Enter}')
    expect(await screen.findByRole('note', { name: 'Repasse de Ethos para Scopus' })).toBeInTheDocument()
    expect(await screen.findByText(/^Scopus entrou na Conversa/)).toBeInTheDocument()
  })

  it('o trabalho do Agente mencionado entra na Atividade dele com o gatilho Menção', async () => {
    const { usuario } = renderizarApp('/agentes/ethos/conversa')
    await usuario.type(await screen.findByRole('textbox', { name: 'Mensagem para Ethos' }), '@Scopus · Enterprise LATAM prioriza a Stripe?{Enter}')
    await screen.findByText(/Scopus · Enterprise LATAM entrou na Conversa/)
    await waitFor(() => expect(screen.queryByText(/está trabalhando/)).not.toBeInTheDocument())

    await usuario.click(within(screen.getByRole('navigation', { name: 'Workspace' })).getByRole('link', { name: 'Agentes' }))
    await usuario.click(within(await grade()).getByRole('link', { name: 'Scopus · Enterprise LATAM' }))
    await usuario.click(within(await screen.findByRole('navigation', { name: 'Seções do agente' })).getByRole('link', { name: 'Atividade' }))
    const item = (await screen.findByText(/Foi mencionado por Ethos/)).closest('li')!
    expect(within(item).getByText('Menção')).toBeInTheDocument()
  })
})

describe('Memória, Habilidades, Rotinas e Atividade', () => {
  it('edita e apaga um fato da Memória', async () => {
    const { usuario } = renderizarApp('/agentes/scopus/memoria')
    const fato = await screen.findByRole('listitem', { name: /ciclo de venda/ })
    expect(within(fato).getByText(/Aprendido na Conversa/)).toBeInTheDocument()
    await usuario.click(within(fato).getByRole('button', { name: 'Editar' }))
    const campo = within(fato).getByRole('textbox', { name: 'Fato' })
    await usuario.clear(campo)
    await usuario.type(campo, 'O ciclo de venda enterprise leva 7 meses.')
    await usuario.click(within(fato).getByRole('button', { name: 'Salvar' }))
    const editado = await screen.findByRole('listitem', { name: /leva 7 meses/ })
    await usuario.click(within(editado).getByRole('button', { name: 'Apagar' }))
    await waitFor(() => expect(screen.queryByText(/leva 7 meses/)).not.toBeInTheDocument())
  })

  it('desativa uma Habilidade', async () => {
    const { usuario } = renderizarApp('/agentes/scopus/habilidades')
    const chave = await screen.findByRole('switch', { name: /Pontuar aderência ao ICP/ })
    expect(chave).toBeChecked()
    await usuario.click(chave)
    await waitFor(() => expect(screen.getByRole('switch', { name: /Pontuar aderência ao ICP/ })).not.toBeChecked())
  })

  it('cria e pausa uma Rotina', async () => {
    const { usuario } = renderizarApp('/agentes/oraculum/rotinas')
    await usuario.click(await screen.findByRole('button', { name: 'Nova rotina' }))
    const formulario = screen.getByRole('form', { name: 'Nova rotina' })
    await usuario.type(within(formulario).getByRole('textbox', { name: 'Tarefa' }), 'Comparar citações com a Snowflake')
    await usuario.selectOptions(within(formulario).getByRole('combobox', { name: 'Frequência' }), 'diaria')
    await usuario.selectOptions(within(formulario).getByRole('combobox', { name: 'Canal de destino' }), 'slack')
    await usuario.click(within(formulario).getByRole('button', { name: 'Criar rotina' }))
    const rotina = await screen.findByRole('listitem', { name: /Comparar citações com a Snowflake/ })
    expect(within(rotina).getByText(/Todo dia/)).toBeInTheDocument()
    await usuario.click(within(rotina).getByRole('button', { name: 'Pausar' }))
    expect(await within(rotina).findByText('Pausada')).toBeInTheDocument()
  })

  it('filtra a Atividade por gatilho', async () => {
    const { usuario } = renderizarApp('/agentes/oraculum/atividade')
    await screen.findByRole('list', { name: 'Linha do tempo' })
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Gatilho' }), 'rotina')
    await waitFor(() => {
      const itens = within(screen.getByRole('list', { name: 'Linha do tempo' })).getAllByRole('listitem')
      expect(itens).toHaveLength(1)
      expect(within(itens[0]).getByText('Rotina')).toBeInTheDocument()
    })
  })
})

describe('Personalização e Permissões', () => {
  it('não permite renomear o Agente', async () => {
    renderizarApp('/agentes/rhetor/configuracao')
    await screen.findByRole('heading', { level: 2, name: 'Configuração' })
    expect(screen.queryByRole('textbox', { name: /nome/i })).not.toBeInTheDocument()
  })

  it('usa Ler e Propor como padrão e guarda a Permissão alterada na sessão', async () => {
    const { usuario } = renderizarApp('/agentes/rhetor/configuracao')
    const metaAds = await screen.findByRole('radiogroup', { name: 'Permissão em Meta Ads' })
    expect(within(metaAds).getByRole('radio', { name: 'Propor' })).toBeChecked()
    // O Notion recebe pautas: escreve, então também começa em Propor.
    const notion = screen.getByRole('radiogroup', { name: 'Permissão em Notion' })
    expect(within(notion).getByRole('radio', { name: 'Propor' })).toBeChecked()
    await usuario.click(within(metaAds).getByRole('radio', { name: 'Executar' }))
    await usuario.click(screen.getByRole('button', { name: 'Salvar personalização' }))
    expect(await screen.findByText('Personalização salva.')).toBeInTheDocument()

    const subabas = screen.getByRole('navigation', { name: 'Seções do agente' })
    await usuario.click(within(subabas).getByRole('link', { name: 'Memória' }))
    await usuario.click(within(subabas).getByRole('link', { name: 'Configuração' }))
    const denovo = await screen.findByRole('radiogroup', { name: 'Permissão em Meta Ads' })
    expect(within(denovo).getByRole('radio', { name: 'Executar' })).toBeChecked()
  })

  it('integração que só lê começa em Ler', async () => {
    renderizarApp('/agentes/scopus/configuracao')
    const clay = await screen.findByRole('radiogroup', { name: 'Permissão em Clay' })
    expect(within(clay).getByRole('radio', { name: 'Ler' })).toBeChecked()
  })

  it('escolhe em quais Canais o Agente atende', async () => {
    const { usuario } = renderizarApp('/agentes/ethos/canais')
    const teams = await screen.findByRole('switch', { name: /Microsoft Teams/ })
    expect(teams).not.toBeChecked()
    await usuario.click(teams)
    await waitFor(() => expect(screen.getByRole('switch', { name: /Microsoft Teams/ })).toBeChecked())
  })
})

describe('Conexões e Aprovações', () => {
  it('conecta um Canal por um fluxo simulado', async () => {
    const { usuario } = renderizarApp('/conexoes')
    const whatsapp = await screen.findByRole('article', { name: 'WhatsApp' })
    await usuario.click(within(whatsapp).getByRole('button', { name: 'Conectar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Conectar WhatsApp' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Autorizar' }))
    expect(await within(whatsapp).findByText('Conectado')).toBeInTheDocument()
  })

  it('mostra Integrações por categoria, incluindo as futuras', async () => {
    renderizarApp('/conexoes')
    const integracoes = await screen.findByRole('region', { name: 'Integrações' })
    await within(integracoes).findByRole('article', { name: 'HubSpot' })
    for (const nome of ['HubSpot', 'Clay', 'Apollo', 'Lusha', 'Notion', 'Meta Ads', 'Google Ads']) {
      expect(within(integracoes).getByRole('article', { name: nome })).toBeInTheDocument()
    }
    expect(within(integracoes).getAllByText('Em breve').length).toBeGreaterThan(0)
  })

  it('aprova uma proposta e o resultado aparece na Atividade do Agente', async () => {
    const { usuario } = renderizarApp('/aprovacoes')
    const proposta = await screen.findByRole('article', { name: /Subir campanha no Meta Ads/ })
    await usuario.click(within(proposta).getByRole('button', { name: 'Aprovar' }))
    expect(await within(proposta).findByText('Aprovada')).toBeInTheDocument()

    await usuario.click(within(proposta).getByRole('link', { name: 'Rhetor' }))
    const subabas = await screen.findByRole('navigation', { name: 'Seções do agente' })
    await usuario.click(within(subabas).getByRole('link', { name: 'Atividade' }))
    expect(await screen.findByText(/Aprovada: Subir campanha no Meta Ads/)).toBeInTheDocument()
  })

  it('a Aprovação criada na Colaboração chega na thread do Slack', async () => {
    const { usuario } = renderizarApp('/agentes/scopus/conversa')
    await usuario.click(await screen.findByRole('button', { name: /abordagem completa/ }))
    await screen.findByRole('article', { name: /Aprovação pendente/ })
    await usuario.click(screen.getByRole('link', { name: 'Conexões' }))
    const slack = await screen.findByRole('article', { name: 'Slack' })
    await usuario.click(within(slack).getByRole('button', { name: 'Ver prévia' }))
    const previa = await screen.findByRole('dialog', { name: /Prévia do Slack/ })
    expect(await within(previa).findByText(/Criar sequência de 3 e-mails no HubSpot/)).toBeInTheDocument()
  })

  it('a decisão registra na Atividade o Canal onde foi tomada, com link', async () => {
    const { usuario } = renderizarApp('/conexoes')
    const slack = await screen.findByRole('article', { name: 'Slack' })
    await usuario.click(within(slack).getByRole('button', { name: 'Ver prévia' }))
    const previa = await screen.findByRole('dialog', { name: /Prévia do Slack/ })
    await usuario.click(await within(previa).findByRole('button', { name: 'Aprovar' }))
    await within(previa).findByText('Aprovada')
    await usuario.keyboard('{Escape}')
    await usuario.click(screen.getByRole('link', { name: 'Agentes' }))
    await usuario.click(within(await grade()).getByRole('link', { name: 'Scopus' }))
    const subabas = await screen.findByRole('navigation', { name: 'Seções do agente' })
    await usuario.click(within(subabas).getByRole('link', { name: 'Atividade' }))
    const item = (await screen.findByText(/Aprovada: Atualizar 14 Contas-alvo/)).closest('li')!
    expect(within(item).getByText('Canal')).toBeInTheDocument()
    expect(within(item).getByRole('link', { name: 'Ver Aprovações' })).toBeInTheDocument()
  })

  it('rejeita uma proposta pela prévia do Slack', async () => {
    const { usuario } = renderizarApp('/conexoes')
    const slack = await screen.findByRole('article', { name: 'Slack' })
    await usuario.click(within(slack).getByRole('button', { name: 'Ver prévia' }))
    const previa = await screen.findByRole('dialog', { name: /Prévia do Slack/ })
    await usuario.click(within(previa).getByRole('button', { name: 'Rejeitar' }))
    expect(await within(previa).findByText('Rejeitada')).toBeInTheDocument()
  })
})

describe('Tema', () => {
  it('começa no escuro e troca para o claro pelo menu do usuário', async () => {
    const { usuario } = renderizarApp('/')
    await grade()
    expect(document.documentElement.dataset.theme).toBe('escuro')
    await usuario.click(screen.getByRole('button', { name: /Menu do usuário/ }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Tema claro' }))
    expect(document.documentElement.dataset.theme).toBe('claro')
  })
})

async function pedirNoComposer(usuario: ReturnType<typeof renderizarApp>['usuario'], texto: string) {
  await usuario.type(await screen.findByRole('textbox', { name: 'Peça algo aos agentes' }), `${texto}{Enter}`)
  await screen.findByRole('heading', { level: 1, name: 'Conversa' })
}

/** Os Agentes chamados, na ordem das etapas (sem as consultas de cada um), no único pedido ou no indicado. */
function agentesChamados(etapas = screen.getByRole('list', { name: 'Agentes chamados' })) {
  return Array.from(etapas.children, (etapa) => etapa.getAttribute('aria-label'))
}

/** Abre a Atividade de um Especialista, filtrada pelo gatilho Coordenação. */
async function atividadeDaCoordenacao(usuario: ReturnType<typeof renderizarApp>['usuario'], especialista: string) {
  await usuario.click(within(screen.getByRole('navigation', { name: 'Especialistas' })).getByRole('link', { name: especialista }))
  await usuario.click(within(await screen.findByRole('navigation', { name: 'Seções do agente' })).getByRole('link', { name: 'Atividade' }))
  await screen.findByRole('list', { name: 'Linha do tempo' })
  await usuario.selectOptions(screen.getByRole('combobox', { name: 'Gatilho' }), 'Coordenação')
}

async function coordenacaoTerminada() {
  await waitFor(() => expect(screen.queryByText('Trabalhando')).not.toBeInTheDocument())
}

describe('Composer e Coordenação', () => {
  it('o composer fica abaixo da grade, com o Workspace, as Especialidades e o Enviar apagado', async () => {
    renderizarApp('/')
    await grade()
    const composer = screen.getByRole('form', { name: 'Pedido aos agentes' })
    expect(within(composer).getByText('Databricks')).toBeInTheDocument()
    const especialidades = within(composer).getByRole('list', { name: 'Especialidades disponíveis' })
    expect(within(especialidades).getAllByRole('listitem').map((e) => e.getAttribute('title'))).toEqual(ESPECIALISTAS)
    expect(within(composer).getByRole('button', { name: 'Enviar' })).toBeDisabled()
  })

  it('o pedido da OpenAI chama Scopus, Ethos e Rhetor, consolida e termina numa Aprovação no HubSpot', async () => {
    const { usuario } = renderizarApp('/')
    await grade()
    await usuario.click(screen.getByRole('button', { name: 'Monte a abordagem completa para a OpenAI' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Conversa' })).toBeInTheDocument()

    const aprovacao = await screen.findByRole('article', { name: /Aprovação pendente: Criar sequência de 3 e-mails/ })
    expect(within(aprovacao).getByText('Rhetor')).toBeInTheDocument()
    expect(within(aprovacao).getByRole('img', { name: 'HubSpot' })).toBeInTheDocument()
    await coordenacaoTerminada()

    expect(agentesChamados()).toEqual(['Scopus', 'Ethos', 'Rhetor'])
    const etapas = screen.getByRole('list', { name: 'Agentes chamados' })
    expect(screen.getByText('Coordenação · 3 agentes chamados')).toBeInTheDocument()
    expect(within(etapas).getByText(/Deu aderência de 87 ao ICP/)).toBeInTheDocument()
    expect(within(etapas).getByText('2 consultas')).toBeInTheDocument()
    const resposta = screen.getByRole('region', { name: 'Resposta consolidada' })
    expect(within(resposta).getByText(/A OpenAI é Conta-alvo prioritária/)).toBeInTheDocument()

    await usuario.click(within(screen.getByRole('navigation', { name: 'Workspace' })).getByRole('link', { name: /Aprovações/ }))
    expect(await screen.findByRole('article', { name: /Criar sequência de 3 e-mails no HubSpot/ })).toBeInTheDocument()
  })

  it('com a Permissão Executar no HubSpot, o Rhetor age sem pedir Aprovação', async () => {
    const { usuario } = renderizarApp('/agentes/rhetor/configuracao')
    const hubspot = await screen.findByRole('radiogroup', { name: 'Permissão em HubSpot' })
    await usuario.click(within(hubspot).getByRole('radio', { name: 'Executar' }))
    await usuario.click(screen.getByRole('button', { name: 'Salvar personalização' }))
    await screen.findByText('Personalização salva.')

    await usuario.click(within(screen.getByRole('navigation', { name: 'Workspace' })).getByRole('link', { name: 'Agentes' }))
    await pedirNoComposer(usuario, 'Monte a abordagem completa para a OpenAI')
    expect(await screen.findByRole('note', { name: /Executada: Criar sequência de 3 e-mails/ })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: /Aprovação pendente/ })).not.toBeInTheDocument()
  })

  it('com a Permissão Ler no HubSpot, o Rhetor não age e nada é alterado', async () => {
    const { usuario } = renderizarApp('/agentes/rhetor/configuracao')
    const hubspot = await screen.findByRole('radiogroup', { name: 'Permissão em HubSpot' })
    await usuario.click(within(hubspot).getByRole('radio', { name: 'Ler' }))
    await usuario.click(screen.getByRole('button', { name: 'Salvar personalização' }))
    await screen.findByText('Personalização salva.')

    await usuario.click(within(screen.getByRole('navigation', { name: 'Workspace' })).getByRole('link', { name: 'Agentes' }))
    await pedirNoComposer(usuario, 'Monte a abordagem completa para a OpenAI')
    expect(await screen.findByRole('note', { name: /Sem Permissão para agir: Criar sequência de 3 e-mails/ })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: /Aprovação pendente/ })).not.toBeInTheDocument()
  })

  it('texto livre sem @ recebe resposta direta, sem chamar nenhum Agente', async () => {
    const { usuario } = renderizarApp('/')
    await grade()
    await pedirNoComposer(usuario, 'o que é ICP?')
    expect(await screen.findByText(/responderia direto/)).toBeInTheDocument()
    await coordenacaoTerminada()
    expect(screen.getByText('o que é ICP?')).toBeInTheDocument()
    expect(screen.getByText('Resposta direta · nenhum agente chamado')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Agentes chamados' })).not.toBeInTheDocument()
  })

  it('um @Agente no composer é sempre incluído, e o Agente criado pelo nome completo no lugar do padrão', async () => {
    const { usuario } = renderizarApp('/')
    await grade()
    const campo = screen.getByRole('textbox', { name: 'Peça algo aos agentes' })
    await usuario.type(campo, '@Scopus · Ent')
    await usuario.click(await screen.findByRole('option', { name: 'Scopus · Enterprise LATAM' }))
    expect(campo).toHaveValue('@Scopus · Enterprise LATAM ')
    await usuario.type(campo, 'e o Nubank?{Enter}')
    await screen.findByRole('heading', { level: 1, name: 'Conversa' })
    await screen.findByRole('region', { name: 'Resposta consolidada' })
    await coordenacaoTerminada()

    expect(agentesChamados()).toEqual(['Scopus · Enterprise LATAM'])
    expect(within(screen.getByRole('list', { name: 'Agentes chamados' })).getByText(/No produto, Scopus · Enterprise LATAM responderia/)).toBeInTheDocument()
  })

  it('no pedido roteirizado, o Agente criado mencionado substitui o padrão, e outro mencionado também é chamado', async () => {
    const { usuario } = renderizarApp('/')
    await grade()
    await pedirNoComposer(usuario, '@Scopus · Enterprise LATAM @Oraculum monte a abordagem completa para a OpenAI')
    await screen.findByRole('article', { name: /Aprovação pendente/ })
    await coordenacaoTerminada()
    expect(agentesChamados()).toEqual(['Scopus · Enterprise LATAM', 'Ethos', 'Rhetor', 'Oraculum'])
  })

  it('o trabalho de cada Agente chamado entra na Atividade dele com o gatilho Coordenação', async () => {
    const { usuario } = renderizarApp('/')
    await grade()
    await usuario.click(screen.getByRole('button', { name: 'Monte a abordagem completa para a OpenAI' }))
    await screen.findByRole('article', { name: /Aprovação pendente/ })
    await coordenacaoTerminada()

    await usuario.click(within(screen.getByRole('navigation', { name: 'Especialistas' })).getByRole('link', { name: 'Ethos' }))
    await usuario.click(within(await screen.findByRole('navigation', { name: 'Seções do agente' })).getByRole('link', { name: 'Atividade' }))
    await screen.findByRole('list', { name: 'Linha do tempo' })
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Gatilho' }), 'Coordenação')
    await waitFor(() => {
      const itens = within(screen.getByRole('list', { name: 'Linha do tempo' })).getAllByRole('listitem')
      expect(itens).toHaveLength(1)
      expect(within(itens[0]).getByText('Coordenação')).toBeInTheDocument()
      expect(within(itens[0]).getByText(/Monte a abordagem completa para a OpenAI/)).toBeInTheDocument()
    })
  })

  it('o fio continua depois de abrir um Agente e voltar', async () => {
    const { usuario } = renderizarApp('/')
    await grade()
    await pedirNoComposer(usuario, 'o que é ICP?')
    await screen.findByText(/responderia direto/)
    await coordenacaoTerminada()

    await usuario.click(screen.getByRole('link', { name: 'Voltar para a grade' }))
    await usuario.click(within(await grade()).getByRole('link', { name: 'Oraculum' }))
    await screen.findByRole('heading', { level: 1, name: 'Oraculum' })
    await usuario.click(within(screen.getByRole('navigation', { name: 'Workspace' })).getByRole('link', { name: 'Agentes' }))

    const aviso = await screen.findByRole('region', { name: 'Conversa coordenada em andamento' })
    expect(within(aviso).getByText('o que é ICP?')).toBeInTheDocument()
    await usuario.click(within(aviso).getByRole('link', { name: 'Abrir conversa' }))
    expect(await screen.findByText('o que é ICP?')).toBeInTheDocument()
    expect(screen.getByText(/responderia direto/)).toBeInTheDocument()
  })

  it('o pedido do Perplexity, pela sugestão, chama o Oraculum e o Rhetor e consolida', async () => {
    const { usuario } = renderizarApp('/')
    await grade()
    await usuario.click(screen.getByRole('button', { name: 'Como estamos no Perplexity e o que publicar?' }))
    await screen.findByRole('region', { name: 'Resposta consolidada' })
    await coordenacaoTerminada()

    expect(agentesChamados()).toEqual(['Oraculum', 'Rhetor'])
    const etapas = screen.getByRole('list', { name: 'Agentes chamados' })
    expect(within(etapas).getByText(/Auditou 12 prompts-alvo no Perplexity/)).toBeInTheDocument()
    expect(within(etapas).getByText(/Propôs 3 conteúdos/)).toBeInTheDocument()
    const resposta = screen.getByRole('region', { name: 'Resposta consolidada' })
    expect(within(resposta).getByText(/lakehouse vs\. data warehouse em 2026/)).toBeInTheDocument()
  })

  it('o composer da Conversa continua o fio, só com o chip do Workspace', async () => {
    const { usuario } = renderizarApp('/')
    await grade()
    await pedirNoComposer(usuario, 'o que é ICP?')
    const composer = screen.getByRole('form', { name: 'Continuar o fio' })
    expect(within(composer).getByText('Databricks')).toBeInTheDocument()
    expect(within(composer).queryByRole('list', { name: 'Especialidades disponíveis' })).not.toBeInTheDocument()
    expect(within(composer).getByRole('button', { name: 'Enviar' })).toBeDisabled()
    await coordenacaoTerminada()
    await usuario.type(within(composer).getByRole('textbox', { name: 'Continue o fio' }), 'e o que é GEO?')
    expect(within(composer).getByRole('button', { name: 'Enviar' })).toBeEnabled()
  })

  it('um pedido seguinte aparece abaixo da resposta anterior e continua a partir dela', async () => {
    const { usuario } = renderizarApp('/')
    await grade()
    await usuario.click(screen.getByRole('button', { name: 'Monte a abordagem completa para a OpenAI' }))
    await screen.findByRole('article', { name: /Aprovação pendente/ })
    await coordenacaoTerminada()

    await usuario.type(screen.getByRole('textbox', { name: 'Continue o fio' }), 'agora faz um e-mail pro CFO{Enter}')
    await waitFor(() => expect(screen.getAllByRole('region', { name: 'Resposta consolidada' })).toHaveLength(2))
    await coordenacaoTerminada()

    const [primeira, segunda] = screen.getAllByRole('list', { name: 'Agentes chamados' })
    expect(agentesChamados(primeira)).toEqual(['Scopus', 'Ethos', 'Rhetor'])
    expect(agentesChamados(segunda)).toEqual(['Rhetor'])
    expect(screen.getByText('Coordenação · 1 agente chamado')).toBeInTheDocument()

    const [anterior, seguinte] = screen.getAllByRole('region', { name: 'Resposta consolidada' })
    const pedido = screen.getByText('agora faz um e-mail pro CFO')
    expect(anterior.compareDocumentPosition(pedido) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(seguinte).getByText(/E-mail para o CFO da OpenAI/)).toBeInTheDocument()
    expect(within(segunda).getByText(/Comitê de compra já levantados no fio/)).toBeInTheDocument()

    // O fio inteiro continua lá depois de voltar para a grade.
    await usuario.click(screen.getByRole('link', { name: 'Voltar para a grade' }))
    const aviso = await screen.findByRole('region', { name: 'Conversa coordenada em andamento' })
    expect(within(aviso).getByText('agora faz um e-mail pro CFO')).toBeInTheDocument()
    await usuario.click(within(aviso).getByRole('link', { name: 'Abrir conversa' }))
    expect(await screen.findByText('Monte a abordagem completa para a OpenAI')).toBeInTheDocument()
    expect(screen.getAllByRole('region', { name: 'Resposta consolidada' })).toHaveLength(2)
  })

  it('a continuação chama o mesmo Agente criado que trabalhou no pedido anterior', async () => {
    const { usuario } = renderizarApp('/')
    await grade()
    await pedirNoComposer(usuario, '@Rhetor · Sequências outbound monte a abordagem completa para a OpenAI')
    await screen.findByRole('article', { name: /Aprovação pendente/ })
    await coordenacaoTerminada()

    await usuario.type(screen.getByRole('textbox', { name: 'Continue o fio' }), 'agora faz um e-mail pro CFO{Enter}')
    await waitFor(() => expect(screen.getAllByRole('list', { name: 'Agentes chamados' })).toHaveLength(2))
    await coordenacaoTerminada()
    expect(agentesChamados(screen.getAllByRole('list', { name: 'Agentes chamados' })[1])).toEqual(['Rhetor · Sequências outbound'])
  })

  it('o trabalho da continuação e do pedido do Perplexity entra na Atividade com o gatilho Coordenação', async () => {
    const { usuario } = renderizarApp('/')
    await grade()
    await usuario.click(screen.getByRole('button', { name: 'Como estamos no Perplexity e o que publicar?' }))
    await screen.findByRole('region', { name: 'Resposta consolidada' })
    await coordenacaoTerminada()

    // Um pedido na página de Agentes começa um fio novo; o seguinte continua esse.
    await usuario.click(screen.getByRole('link', { name: 'Voltar para a grade' }))
    await grade()
    await usuario.click(screen.getByRole('button', { name: 'Monte a abordagem completa para a OpenAI' }))
    await screen.findByRole('article', { name: /Aprovação pendente/ })
    await coordenacaoTerminada()
    expect(screen.queryByText('Como estamos no Perplexity e o que publicar?')).not.toBeInTheDocument()
    await usuario.type(screen.getByRole('textbox', { name: 'Continue o fio' }), 'agora faz um e-mail pro CFO{Enter}')
    await waitFor(() => expect(screen.getAllByRole('region', { name: 'Resposta consolidada' })).toHaveLength(2))
    await coordenacaoTerminada()

    await atividadeDaCoordenacao(usuario, 'Rhetor')
    await waitFor(() => {
      const itens = within(screen.getByRole('list', { name: 'Linha do tempo' })).getAllByRole('listitem')
      expect(itens.map((item) => item.textContent)).toEqual([
        expect.stringContaining('agora faz um e-mail pro CFO'),
        expect.stringContaining('Monte a abordagem completa para a OpenAI'),
        expect.stringContaining('Como estamos no Perplexity e o que publicar?'),
      ])
    })

    await atividadeDaCoordenacao(usuario, 'Oraculum')
    await waitFor(() => {
      const itens = within(screen.getByRole('list', { name: 'Linha do tempo' })).getAllByRole('listitem')
      expect(itens).toHaveLength(1)
      expect(within(itens[0]).getByText(/Como estamos no Perplexity/)).toBeInTheDocument()
    })
  })

  it('sem Conversa coordenada, a página da Conversa volta para a grade', async () => {
    renderizarApp('/conversa')
    expect(await screen.findByRole('heading', { level: 1, name: 'Agentes' })).toBeInTheDocument()
  })
})

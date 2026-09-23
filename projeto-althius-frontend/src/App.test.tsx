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

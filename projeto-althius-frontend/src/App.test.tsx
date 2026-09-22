import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderizarApp } from '@/test/renderizar'

const AGENTES = ['Scopus', 'Ethos', 'Rhetor', 'Oraculum']

describe('Painel e galeria', () => {
  it('mostra o painel com aprovações, rotinas, atividade e horas economizadas', async () => {
    renderizarApp('/')
    expect(await screen.findByRole('heading', { level: 1, name: 'Agentes' })).toBeInTheDocument()
    const painel = screen.getByRole('region', { name: 'Painel' })
    expect(within(painel).getByText('Aprovações pendentes')).toBeInTheDocument()
    expect(within(painel).getByText('Rotinas de hoje')).toBeInTheDocument()
    expect(within(painel).getByText('Atividade recente')).toBeInTheDocument()
    expect(within(painel).getByText('Horas economizadas')).toBeInTheDocument()
  })

  it('mostra os 4 Agentes na galeria, com a especialidade de cada um', async () => {
    renderizarApp('/')
    const galeria = await screen.findByRole('region', { name: 'Galeria de agentes' })
    await within(galeria).findByRole('link', { name: /Scopus/ })
    for (const nome of AGENTES) {
      expect(within(galeria).getByRole('link', { name: new RegExp(nome) })).toBeInTheDocument()
    }
    expect(within(galeria).getByText('Especialista em ICP')).toBeInTheDocument()
    expect(within(galeria).getByText('Especialista em GEO')).toBeInTheDocument()
  })

  it('mostra o selo de demonstração e o Workspace da Databricks', async () => {
    renderizarApp('/')
    const cabecalho = await screen.findByRole('banner')
    expect(within(cabecalho).getByText('Demonstração')).toBeInTheDocument()
    expect(await within(cabecalho).findByText('Databricks')).toBeInTheDocument()
  })

  it('não oferece criar nem renomear Agentes', async () => {
    renderizarApp('/')
    await screen.findByRole('region', { name: 'Galeria de agentes' })
    expect(screen.queryByRole('button', { name: /criar agente/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /criar agente/i })).not.toBeInTheDocument()
  })
})

describe('Página do Agente', () => {
  it('abre um Agente pela galeria e navega pelas 7 sub-abas', async () => {
    const { usuario } = renderizarApp('/')
    await usuario.click(await screen.findByRole('link', { name: /Scopus/ }))
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
    await usuario.click(await screen.findByRole('option', { name: /Ethos/ }))
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

describe('Barra de comando', () => {
  it('Ctrl+K abre a barra, e uma @menção leva ao Agente com a resposta', async () => {
    const { usuario } = renderizarApp('/')
    await screen.findByRole('region', { name: 'Galeria de agentes' })
    await usuario.keyboard('{Control>}k{/Control}')
    const campo = await screen.findByRole('combobox', { name: 'Comando' })
    await usuario.type(campo, '@Oraculum como estamos no Perplexity?{Enter}')
    expect(await screen.findByRole('heading', { level: 1, name: 'Oraculum' })).toBeInTheDocument()
    expect(await screen.findByText('@Oraculum como estamos no Perplexity?')).toBeInTheDocument()
    expect(await screen.findByText(/Consultando Perplexity/)).toBeInTheDocument()
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

    await usuario.click(screen.getByRole('link', { name: /Rhetor/ }))
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
    await usuario.click(await screen.findByRole('link', { name: /Scopus/ }))
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
    await screen.findByRole('region', { name: 'Galeria de agentes' })
    expect(document.documentElement.dataset.theme).toBe('escuro')
    await usuario.click(screen.getByRole('button', { name: /Menu do usuário/ }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Tema claro' }))
    expect(document.documentElement.dataset.theme).toBe('claro')
  })
})

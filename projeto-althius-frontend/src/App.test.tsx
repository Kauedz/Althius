import { act, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { AgenteId, FonteDeAgentes } from '@/fonte/tipos'
import { navegarPara } from '@/test/navegar'
import { renderizarApp, renderizarAppNoNavegador } from '@/test/renderizar'

// Sinais first 10: os quatro Agentes saíram da interface. A / guarda só o composer da Coordenação (sem grade, sem Novo
// agente), a barra lateral não lista Especialistas, e as páginas antigas de cada Agente abrem pelo endereço, só para
// leitura. O que continua vivo (Coordenação, Aprovações, Atividade, Permissões, Execuções) é testado pelo caminho de hoje.

const AVISO_SOMENTE_LEITURA = /Este Agente foi retirado do produto/

type Usuario = ReturnType<typeof renderizarApp>['usuario']

afterEach(() => window.history.replaceState(null, '', '/'))

/** A / pronta: o composer da Coordenação, que nunca sai dela. */
async function composerDaRaiz() {
  return screen.findByRole('form', { name: 'Pedido aos agentes' })
}

/** As execuções de um Agente, lidas da Fonte: a grade que as mostrava saiu da / no Sinais first 10. */
async function execucoes(fonte: FonteDeAgentes, id: AgenteId) {
  return (await fonte.agentes()).find((agente) => agente.id === id)?.execucoes
}

/** Grava uma Permissão do Agente pela Fonte: a aba Configuração, que a editava, saiu da página do Agente. */
async function definirPermissao(fonte: FonteDeAgentes, id: AgenteId, integracao: string, nivel: 'ler' | 'propor' | 'executar') {
  const atual = await fonte.personalizacao(id)
  await act(() => fonte.salvarPersonalizacao(id, { ...atual, permissoes: { ...atual.permissoes, [integracao]: nivel } }))
}

describe('Página de Agentes (/)', () => {
  it('mostra o composer da Coordenação, sem a grade dos 9 Agentes nem os cartões deles', async () => {
    renderizarApp('/')
    expect(await screen.findByRole('heading', { level: 1, name: 'Agentes' })).toBeInTheDocument()
    expect(await composerDaRaiz()).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Agentes do Workspace' })).not.toBeInTheDocument()
    const principal = screen.getByRole('main')
    for (const nome of ['Scopus · Enterprise LATAM', 'Rhetor · Anúncios Meta', 'Detectou algo', 'Toda terça às 08:00']) {
      expect(within(principal).queryByText(nome)).not.toBeInTheDocument()
    }
  })

  it('não tem painel de métricas, barra de comando nem busca', async () => {
    const { usuario } = renderizarApp('/')
    await composerDaRaiz()
    expect(screen.queryByRole('region', { name: 'Painel' })).not.toBeInTheDocument()
    expect(screen.queryByText('Horas economizadas')).not.toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    await usuario.keyboard('{Control>}k{/Control}')
    expect(screen.queryByRole('combobox', { name: 'Comando' })).not.toBeInTheDocument()
  })

  it('a página de um Agente criado ainda abre pelo endereço, e as sub-abas mostram os dados dele, só para leitura', async () => {
    const { usuario } = renderizarApp('/agentes/scopus-enterprise-latam/conversa')
    expect(await screen.findByRole('heading', { level: 1, name: 'Scopus · Enterprise LATAM' })).toBeInTheDocument()
    expect(screen.getByText(AVISO_SOMENTE_LEITURA)).toBeInTheDocument()
    const subabas = screen.getByRole('navigation', { name: 'Seções do agente' })

    await usuario.click(within(subabas).getByRole('link', { name: 'Memória' }))
    expect(await screen.findByText(/Contas-alvo no México/)).toBeInTheDocument()

    await usuario.click(within(subabas).getByRole('link', { name: 'Rotinas' }))
    expect(await screen.findByText(/Toda segunda às 08:30/)).toBeInTheDocument()

    await usuario.click(within(subabas).getByRole('link', { name: 'Atividade' }))
    expect(await screen.findByText(/Reavaliou 40 Contas-alvo enterprise/)).toBeInTheDocument()
    expect(within(subabas).queryByRole('link', { name: 'Configuração' })).not.toBeInTheDocument()
  })
})

describe('Casca', () => {
  it('a sidebar tem o Workspace e o selo de demonstração, sem a seção de Especialistas', async () => {
    renderizarApp('/')
    const sidebar = await screen.findByRole('complementary', { name: 'Navegação' })
    expect(await within(sidebar).findByText('Databricks')).toBeInTheDocument()
    expect(within(sidebar).getByText('Demonstração')).toBeInTheDocument()
    expect(within(sidebar).getByRole('img', { name: 'Althius' })).toBeInTheDocument()

    expect(within(sidebar).queryByRole('navigation', { name: 'Especialistas' })).not.toBeInTheDocument()
    for (const nome of ['Scopus', 'Ethos', 'Rhetor', 'Oraculum']) {
      expect(within(sidebar).queryByRole('link', { name: nome })).not.toBeInTheDocument()
    }

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

  it('a página de um Agente padrão abre pelo endereço, com o aviso de só leitura', async () => {
    renderizarApp('/agentes/oraculum')
    expect(await screen.findByRole('heading', { level: 1, name: 'Oraculum' })).toBeInTheDocument()
    expect(screen.getByText(AVISO_SOMENTE_LEITURA)).toBeInTheDocument()
  })
})

describe('Criar e excluir Agente', () => {
  it('não há mais como criar Agente: nem Novo agente na / nem na página de um Agente', async () => {
    const { fonte } = renderizarApp('/')
    await composerDaRaiz()
    expect(screen.queryByRole('button', { name: 'Novo agente' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Novo agente' })).not.toBeInTheDocument()
    expect(await fonte.agentes()).toHaveLength(9)
  })

  it('um Agente criado não oferece mais a exclusão, e continua no Workspace', async () => {
    const { fonte } = renderizarApp('/agentes/rhetor-anuncios-meta/conversa')
    await screen.findByRole('heading', { level: 1, name: 'Rhetor · Anúncios Meta' })
    expect(screen.getByText(AVISO_SOMENTE_LEITURA)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Excluir agente' })).not.toBeInTheDocument()
    expect((await fonte.agentes()).map((agente) => agente.id)).toContain('rhetor-anuncios-meta')
  })

  it('nenhum Agente pode ser renomeado, padrão ou criado', async () => {
    for (const rota of ['/agentes/rhetor/conversa', '/agentes/scopus-enterprise-latam/conversa']) {
      const { unmount } = renderizarApp(rota)
      expect(await screen.findByText(AVISO_SOMENTE_LEITURA)).toBeInTheDocument()
      expect(screen.queryByRole('textbox', { name: /nome/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /renomear/i })).not.toBeInTheDocument()
      unmount()
    }
  })
})

describe('Página do Agente', () => {
  it('mostra 5 sub-abas, sem Canais nem Configuração', async () => {
    const { usuario } = renderizarApp('/agentes/scopus')
    expect(await screen.findByRole('heading', { level: 1, name: 'Scopus' })).toBeInTheDocument()
    const subabas = screen.getByRole('navigation', { name: 'Seções do agente' })
    expect(within(subabas).getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Conversa',
      'Memória',
      'Habilidades',
      'Rotinas',
      'Atividade',
    ])
    await usuario.click(within(subabas).getByRole('link', { name: 'Memória' }))
    expect(await screen.findByRole('heading', { level: 2, name: 'Memória' })).toBeInTheDocument()
  })
})

describe('Conversa direta com um Agente', () => {
  it('não oferece sugestões nem campo de mensagem, no Agente padrão e no criado', async () => {
    for (const [rota, nome] of [
      ['/agentes/scopus/conversa', 'Scopus'],
      ['/agentes/scopus-enterprise-latam/conversa', 'Scopus · Enterprise LATAM'],
      ['/agentes/rhetor/conversa', 'Rhetor'],
    ]) {
      const { unmount } = renderizarApp(rota)
      expect(await screen.findByText(AVISO_SOMENTE_LEITURA)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /aderência da OpenAI/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /abordagem completa/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('textbox', { name: `Mensagem para ${nome}` })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Enviar' })).not.toBeInTheDocument()
      unmount()
    }
  })
})

describe('Memória, Habilidades, Rotinas e Atividade', () => {
  it('a Memória do Agente aparece sem editar nem apagar fatos', async () => {
    renderizarApp('/agentes/scopus/memoria')
    const fato = await screen.findByRole('listitem', { name: /ciclo de venda/ })
    expect(within(fato).getByText(/Aprendido na Conversa/)).toBeInTheDocument()
    expect(within(fato).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    expect(within(fato).queryByRole('button', { name: 'Apagar' })).not.toBeInTheDocument()
  })

  it('as Habilidades aparecem, mas não se ligam nem se desligam', async () => {
    const { usuario, fonte } = renderizarApp('/agentes/scopus/habilidades')
    const chave = await screen.findByRole('switch', { name: /Pontuar aderência ao ICP/ })
    expect(chave).toBeChecked()
    expect(chave).toHaveAttribute('aria-disabled', 'true')
    const antes = await fonte.habilidades('scopus')
    await usuario.click(chave)
    expect(screen.getByRole('switch', { name: /Pontuar aderência ao ICP/ })).toBeChecked()
    expect(await fonte.habilidades('scopus')).toEqual(antes)
  })

  it('as Rotinas aparecem, sem criar Rotina nova', async () => {
    renderizarApp('/agentes/oraculum/rotinas')
    expect(await screen.findByText(AVISO_SOMENTE_LEITURA)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nova rotina' })).not.toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Nova rotina' })).not.toBeInTheDocument()
  })

  it('filtra a Atividade por gatilho', async () => {
    const { usuario } = renderizarApp('/agentes/oraculum/atividade')
    await screen.findByRole('list', { name: 'Linha do tempo' })
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Gatilho' }), 'rotina')
    await waitFor(() => {
      const itens = within(screen.getByRole('list', { name: 'Linha do tempo' })).getAllByRole('listitem')
      expect(itens).toHaveLength(1)
      expect(within(itens[0]).getByText('Rotina')).toBeInTheDocument()
      expect(within(itens[0]).getByRole('link', { name: 'Ver Conversa' })).toBeInTheDocument()
    })
  })
})

describe('Personalização, Permissões e Canais', () => {
  it('a Configuração e os Canais do Agente levam à Conversa, sem editar Personalização nem Permissões', async () => {
    for (const aba of ['configuracao', 'canais']) {
      const { unmount } = renderizarAppNoNavegador(`/agentes/rhetor/${aba}`)
      expect(await screen.findByText(AVISO_SOMENTE_LEITURA)).toBeInTheDocument()
      await waitFor(() => expect(window.location.pathname).toBe('/agentes/rhetor/conversa'))
      expect(screen.queryByRole('textbox', { name: 'Tom de voz' })).not.toBeInTheDocument()
      expect(screen.queryByRole('radiogroup', { name: 'Permissão em Meta Ads' })).not.toBeInTheDocument()
      expect(screen.queryByRole('switch', { name: /Microsoft Teams/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Salvar personalização' })).not.toBeInTheDocument()
      unmount()
    }
  })
})

// A thread do Slack da demonstração recebia as Aprovações pedidas na Conversa direta com um Agente, que saiu no Sinais
// first 10. A prévia segue decidindo as Aprovações que já estão lá (gatilho Canal), testadas abaixo.
describe('Conexões e Aprovações', () => {
  it('conecta um Canal por um fluxo simulado', async () => {
    const { usuario } = renderizarApp('/conexoes')
    const whatsapp = await screen.findByRole('article', { name: 'WhatsApp' })
    await usuario.click(within(whatsapp).getByRole('button', { name: 'Conectar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Conectar WhatsApp' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Autorizar' }))
    expect(await within(whatsapp).findByText('Conectado')).toBeInTheDocument()
  })

  it('mostra HubSpot e Notion por categoria, sem Integrações futuras', async () => {
    renderizarApp('/conexoes')
    const integracoes = await screen.findByRole('region', { name: 'Integrações' })
    await within(integracoes).findByRole('article', { name: 'HubSpot' })
    for (const nome of ['HubSpot', 'Notion']) {
      expect(within(integracoes).getByRole('article', { name: nome })).toBeInTheDocument()
    }
    expect(within(integracoes).getAllByRole('article')).toHaveLength(2)
    expect(within(integracoes).queryByText('Em breve')).not.toBeInTheDocument()
  })

  it('aprova uma proposta e o resultado aparece na Atividade do Agente', async () => {
    const { usuario } = renderizarApp('/aprovacoes')
    const proposta = await screen.findByRole('article', { name: /Subir campanha no Meta Ads/ })
    await usuario.click(within(proposta).getByRole('button', { name: 'Aprovar' }))
    expect(await within(proposta).findByText('Aprovada')).toBeInTheDocument()

    await usuario.click(within(proposta).getByRole('link', { name: 'Rhetor' }))
    const subabas = await screen.findByRole('navigation', { name: 'Seções do agente' })
    await usuario.click(within(subabas).getByRole('link', { name: 'Atividade' }))
    expect(await screen.findByText(/Aprovada na fila: Subir campanha no Meta Ads/)).toBeInTheDocument()
  })

  it('a decisão no Canal entra na Atividade com o gatilho Canal e o lugar da decisão, com link', async () => {
    const { usuario } = renderizarAppNoNavegador('/conexoes')
    const slack = await screen.findByRole('article', { name: 'Slack' })
    await usuario.click(within(slack).getByRole('button', { name: 'Ver prévia' }))
    const previa = await screen.findByRole('dialog', { name: /Prévia do Slack/ })
    await usuario.click(await within(previa).findByRole('button', { name: 'Aprovar' }))
    await within(previa).findByText('Aprovada')
    await usuario.keyboard('{Escape}')

    const item = await itemDaAtividade('scopus', /Aprovada no Slack: Atualizar 14 Contas-alvo/)
    expect(within(item).getByText('Canal')).toBeInTheDocument()
    expect(within(item).getByRole('link', { name: 'Ver Aprovações' })).toBeInTheDocument()
  })

  it('rejeita uma proposta pela prévia do Slack', async () => {
    const { usuario } = renderizarApp('/conexoes')
    const slack = await screen.findByRole('article', { name: 'Slack' })
    await usuario.click(within(slack).getByRole('button', { name: 'Ver prévia' }))
    const previa = await screen.findByRole('dialog', { name: /Prévia do Slack/ })
    await usuario.click(within(previa).getByRole('button', { name: 'Recusar' }))
    expect(await within(previa).findByText('Recusada')).toBeInTheDocument()
  })
})

describe('Tema', () => {
  it('começa no claro e troca para o escuro pelo menu do usuário', async () => {
    const { usuario } = renderizarApp('/')
    await composerDaRaiz()
    expect(document.documentElement.dataset.theme).toBe('claro')
    await usuario.click(screen.getByRole('button', { name: /Menu do usuário/ }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Tema escuro' }))
    expect(document.documentElement.dataset.theme).toBe('escuro')
  })

  it('um tema gravado no navegador volta na abertura seguinte', () => {
    localStorage.setItem('althius:tema', 'escuro')
    renderizarApp('/')
    expect(document.documentElement.dataset.theme).toBe('escuro')
  })

  it('a escolha de tema persiste depois de a app ser remontada', async () => {
    const { usuario, unmount } = renderizarApp('/')
    await composerDaRaiz()
    await usuario.click(screen.getByRole('button', { name: /Menu do usuário/ }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Tema escuro' }))
    expect(document.documentElement.dataset.theme).toBe('escuro')

    unmount()
    renderizarApp('/')
    expect(document.documentElement.dataset.theme).toBe('escuro')
  })
})

/**
 * Pede no composer inicial. Desde o ticket 07 ele classifica a intenção: só uma pergunta sem palavras de monitoramento
 * segue para a Conversa coordenada; um pedido imperativo vira sugestão de Modelo ou aviso de novo Sinal.
 */
async function pedirNoComposer(usuario: Usuario, texto: string) {
  await usuario.type(await screen.findByRole('textbox', { name: 'Peça algo aos agentes' }), `${texto}{Enter}`)
  await screen.findByRole('heading', { level: 1, name: 'Conversa' })
}

/** Pede pela sugestão clicável, que segue direto para a Conversa coordenada sem passar pela classificação. */
async function pedirPelaSugestao(usuario: Usuario, sugestao: string) {
  await usuario.click(await screen.findByRole('button', { name: sugestao }))
  await screen.findByRole('heading', { level: 1, name: 'Conversa' })
}

/** Os Agentes chamados, na ordem das etapas (sem as consultas de cada um), no único pedido ou no indicado. */
function agentesChamados(etapas = screen.getByRole('list', { name: 'Agentes chamados' })) {
  return Array.from(etapas.children, (etapa) => etapa.getAttribute('aria-label'))
}

/** Abre, pelo endereço, a Atividade de um Agente filtrada pelo gatilho Coordenação (no app sobre o histórico do navegador). */
async function atividadeDaCoordenacao(usuario: Usuario, id: AgenteId) {
  navegarPara(`/agentes/${id}/atividade`)
  await screen.findByRole('list', { name: 'Linha do tempo' })
  await usuario.selectOptions(screen.getByRole('combobox', { name: 'Gatilho' }), 'Coordenação')
}

/** Abre, pelo endereço, a Atividade de um Agente e devolve o item com o texto (no app sobre o histórico do navegador). */
async function itemDaAtividade(id: AgenteId, texto: RegExp) {
  navegarPara(`/agentes/${id}/atividade`)
  return (await screen.findByText(texto)).closest('li')!
}

async function coordenacaoTerminada() {
  await waitFor(() => expect(screen.queryByText('Trabalhando')).not.toBeInTheDocument())
}

/** O voltar do navegador, no app montado com o histórico real. */
async function voltarPeloNavegador() {
  const voltou = new Promise((resolver) => window.addEventListener('popstate', resolver, { once: true }))
  await act(async () => {
    window.history.back()
    await voltou
  })
}

describe('Composer e Coordenação', () => {
  it('o composer fica na /, com o Workspace, sem as Especialidades e com o Enviar apagado', async () => {
    renderizarApp('/')
    const composer = await composerDaRaiz()
    expect(await within(composer).findByText('Databricks')).toBeInTheDocument()
    expect(within(composer).queryByRole('list', { name: 'Especialidades disponíveis' })).not.toBeInTheDocument()
    expect(within(composer).getByRole('button', { name: 'Enviar' })).toBeDisabled()
  })

  it('um pedido de monitorar vai para a Coordenação, nunca para o Briefing de um Sinal novo', async () => {
    const { usuario } = renderizarAppNoNavegador('/')
    await pedirNoComposer(usuario, 'Quero monitorar empresas que abriram vaga de RevOps')
    expect(await screen.findByRole('heading', { level: 1, name: 'Conversa' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/conversa')
    expect(screen.getByText('Quero monitorar empresas que abriram vaga de RevOps')).toBeInTheDocument()
    await coordenacaoTerminada()
  })

  it('/agentes volta para a /', async () => {
    renderizarAppNoNavegador('/agentes')
    await composerDaRaiz()
    expect(window.location.pathname).toBe('/')
  })

  it('o pedido da OpenAI chama Scopus, Ethos e Rhetor, consolida e termina numa Aprovação no HubSpot', async () => {
    const { usuario } = renderizarApp('/')
    await pedirPelaSugestao(usuario, 'Monte a abordagem completa para a OpenAI')

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
    const { usuario, fonte } = renderizarApp('/')
    await composerDaRaiz()
    await definirPermissao(fonte, 'rhetor', 'hubspot', 'executar')
    await pedirPelaSugestao(usuario, 'Monte a abordagem completa para a OpenAI')
    expect(await screen.findByRole('note', { name: /Executada: Criar sequência de 3 e-mails/ })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: /Aprovação pendente/ })).not.toBeInTheDocument()
  })

  it('com a Permissão Ler no HubSpot, o Rhetor não age e nada é alterado', async () => {
    const { usuario, fonte } = renderizarApp('/')
    await composerDaRaiz()
    await definirPermissao(fonte, 'rhetor', 'hubspot', 'ler')
    await pedirPelaSugestao(usuario, 'Monte a abordagem completa para a OpenAI')
    expect(await screen.findByRole('note', { name: /Sem Permissão para agir: Criar sequência de 3 e-mails/ })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: /Aprovação pendente/ })).not.toBeInTheDocument()
  })

  it('texto livre sem @ recebe resposta direta, sem chamar nenhum Agente', async () => {
    const { usuario } = renderizarApp('/')
    await pedirNoComposer(usuario, 'o que é ICP?')
    expect(await screen.findByText(/ICP é o perfil da empresa/)).toBeInTheDocument()
    await coordenacaoTerminada()
    expect(screen.getByText('o que é ICP?')).toBeInTheDocument()
    expect(screen.getByText('Resposta direta · nenhum agente chamado')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Agentes chamados' })).not.toBeInTheDocument()
  })

  it('um @Agente digitado no composer é sempre incluído, e o Agente criado pelo nome completo no lugar do padrão', async () => {
    const { usuario } = renderizarApp('/')
    await pedirNoComposer(usuario, '@Scopus · Enterprise LATAM e o Nubank?')
    await screen.findByRole('region', { name: 'Resposta consolidada' })
    await coordenacaoTerminada()

    expect(agentesChamados()).toEqual(['Scopus · Enterprise LATAM'])
    expect(within(screen.getByRole('list', { name: 'Agentes chamados' })).getByText(/Scopus · Enterprise LATAM: ICP é o perfil/)).toBeInTheDocument()
  })

  it('no pedido roteirizado, o Agente criado mencionado substitui o padrão, e outro mencionado também é chamado', async () => {
    const { usuario } = renderizarApp('/')
    await pedirNoComposer(usuario, '@Scopus · Enterprise LATAM @Oraculum monte a abordagem completa para a OpenAI?')
    await screen.findByRole('article', { name: /Aprovação pendente/ })
    await coordenacaoTerminada()
    expect(agentesChamados()).toEqual(['Scopus · Enterprise LATAM', 'Ethos', 'Rhetor', 'Oraculum'])
  })

  it('o trabalho de cada Agente chamado entra na Atividade dele com o gatilho Coordenação', async () => {
    const { usuario } = renderizarAppNoNavegador('/')
    await pedirPelaSugestao(usuario, 'Monte a abordagem completa para a OpenAI')
    await screen.findByRole('article', { name: /Aprovação pendente/ })
    await coordenacaoTerminada()

    await atividadeDaCoordenacao(usuario, 'ethos')
    await waitFor(() => {
      const itens = within(screen.getByRole('list', { name: 'Linha do tempo' })).getAllByRole('listitem')
      expect(itens).toHaveLength(1)
      expect(within(itens[0]).getByText('Coordenação')).toBeInTheDocument()
      expect(within(itens[0]).getByText(/Monte a abordagem completa para a OpenAI/)).toBeInTheDocument()
    })
  })

  it('a Conversa coordenada continua depois de abrir um Agente e voltar', async () => {
    const { usuario } = renderizarAppNoNavegador('/')
    await pedirNoComposer(usuario, 'o que é ICP?')
    await screen.findByText(/ICP é o perfil da empresa/)
    await coordenacaoTerminada()

    await usuario.click(screen.getByRole('link', { name: 'Voltar para Agentes' }))
    await composerDaRaiz()
    navegarPara('/agentes/oraculum')
    await screen.findByRole('heading', { level: 1, name: 'Oraculum' })
    await usuario.click(within(screen.getByRole('navigation', { name: 'Workspace' })).getByRole('link', { name: 'Agentes' }))

    await composerDaRaiz()
    expect(screen.queryByRole('region', { name: 'Conversa coordenada em andamento' })).not.toBeInTheDocument()
    for (let i = 0; i < 6 && !screen.queryByRole('heading', { level: 1, name: 'Conversa' }); i++) {
      await voltarPeloNavegador()
    }
    expect(await screen.findByText('o que é ICP?')).toBeInTheDocument()
    expect(screen.getByText(/ICP é o perfil da empresa/)).toBeInTheDocument()
  })

  it('o pedido do Perplexity, pela sugestão, chama o Oraculum e o Rhetor e consolida', async () => {
    const { usuario } = renderizarApp('/')
    await pedirPelaSugestao(usuario, 'Como estamos no Perplexity e o que publicar?')
    await screen.findByRole('region', { name: 'Resposta consolidada' })
    await coordenacaoTerminada()

    expect(agentesChamados()).toEqual(['Oraculum', 'Rhetor'])
    const etapas = screen.getByRole('list', { name: 'Agentes chamados' })
    expect(within(etapas).getByText(/Auditou 12 prompts-alvo no Perplexity/)).toBeInTheDocument()
    expect(within(etapas).getByText(/Propôs 3 conteúdos/)).toBeInTheDocument()
    const resposta = screen.getByRole('region', { name: 'Resposta consolidada' })
    expect(within(resposta).getByText(/lakehouse vs\. data warehouse em 2026/)).toBeInTheDocument()
  })

  it('o composer continua a Conversa, só com o chip do Workspace', async () => {
    const { usuario } = renderizarApp('/')
    await pedirNoComposer(usuario, 'o que é ICP?')
    const composer = screen.getByRole('form', { name: 'Continuar a Conversa' })
    expect(within(composer).getByText('Databricks')).toBeInTheDocument()
    expect(within(composer).queryByRole('list', { name: 'Especialidades disponíveis' })).not.toBeInTheDocument()
    expect(within(composer).getByRole('button', { name: 'Enviar' })).toBeDisabled()
    await coordenacaoTerminada()
    await usuario.type(within(composer).getByRole('textbox', { name: 'Continue a Conversa' }), 'e o que é GEO?')
    expect(within(composer).getByRole('button', { name: 'Enviar' })).toBeEnabled()
  })

  it('um pedido seguinte aparece abaixo da resposta anterior e continua a partir dela', async () => {
    const { usuario } = renderizarAppNoNavegador('/')
    await pedirPelaSugestao(usuario, 'Monte a abordagem completa para a OpenAI')
    await screen.findByRole('article', { name: /Aprovação pendente/ })
    await coordenacaoTerminada()

    await usuario.type(screen.getByRole('textbox', { name: 'Continue a Conversa' }), 'agora faz um e-mail pro CFO{Enter}')
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
    expect(within(segunda).getByText(/Comitê de compra já levantados nesta Conversa/)).toBeInTheDocument()

    // A Conversa inteira continua lá depois de voltar para a /, pelo histórico do navegador.
    await usuario.click(screen.getByRole('link', { name: 'Voltar para Agentes' }))
    await composerDaRaiz()
    expect(screen.queryByRole('region', { name: 'Conversa coordenada em andamento' })).not.toBeInTheDocument()
    await voltarPeloNavegador()
    expect(await screen.findByText('Monte a abordagem completa para a OpenAI')).toBeInTheDocument()
    expect(screen.getAllByRole('region', { name: 'Resposta consolidada' })).toHaveLength(2)
  })

  it('a continuação chama o mesmo Agente criado que trabalhou no pedido anterior', async () => {
    const { usuario } = renderizarApp('/')
    await pedirNoComposer(usuario, '@Rhetor · Sequências outbound monte a abordagem completa para a OpenAI?')
    await screen.findByRole('article', { name: /Aprovação pendente/ })
    await coordenacaoTerminada()

    await usuario.type(screen.getByRole('textbox', { name: 'Continue a Conversa' }), 'agora faz um e-mail pro CFO{Enter}')
    await waitFor(() => expect(screen.getAllByRole('list', { name: 'Agentes chamados' })).toHaveLength(2))
    await coordenacaoTerminada()
    expect(agentesChamados(screen.getAllByRole('list', { name: 'Agentes chamados' })[1])).toEqual(['Rhetor · Sequências outbound'])
  })

  it('o trabalho da continuação e do pedido do Perplexity entra na Atividade com o gatilho Coordenação', async () => {
    const { usuario } = renderizarAppNoNavegador('/')
    await pedirPelaSugestao(usuario, 'Como estamos no Perplexity e o que publicar?')
    await screen.findByRole('region', { name: 'Resposta consolidada' })
    await coordenacaoTerminada()

    // Um pedido na página de Agentes começa uma Conversa nova; o seguinte continua essa.
    await usuario.click(screen.getByRole('link', { name: 'Voltar para Agentes' }))
    await pedirPelaSugestao(usuario, 'Monte a abordagem completa para a OpenAI')
    await screen.findByRole('article', { name: /Aprovação pendente/ })
    await coordenacaoTerminada()
    expect(screen.queryByText('Como estamos no Perplexity e o que publicar?')).not.toBeInTheDocument()
    await usuario.type(screen.getByRole('textbox', { name: 'Continue a Conversa' }), 'agora faz um e-mail pro CFO{Enter}')
    await waitFor(() => expect(screen.getAllByRole('region', { name: 'Resposta consolidada' })).toHaveLength(2))
    await coordenacaoTerminada()

    await atividadeDaCoordenacao(usuario, 'rhetor')
    await waitFor(() => {
      const itens = within(screen.getByRole('list', { name: 'Linha do tempo' })).getAllByRole('listitem')
      expect(itens.map((item) => item.textContent)).toEqual([
        expect.stringContaining('agora faz um e-mail pro CFO'),
        expect.stringContaining('Monte a abordagem completa para a OpenAI'),
        expect.stringContaining('Como estamos no Perplexity e o que publicar?'),
      ])
    })

    await atividadeDaCoordenacao(usuario, 'oraculum')
    await waitFor(() => {
      const itens = within(screen.getByRole('list', { name: 'Linha do tempo' })).getAllByRole('listitem')
      expect(itens).toHaveLength(1)
      expect(within(itens[0]).getByText(/Como estamos no Perplexity/)).toBeInTheDocument()
    })
  })

  it('sem Conversa coordenada, a página da Conversa volta para a /, com o composer', async () => {
    renderizarApp('/conversa')
    expect(await screen.findByRole('heading', { level: 1, name: 'Agentes' })).toBeInTheDocument()
    expect(await composerDaRaiz()).toBeInTheDocument()
  })
})

// Os números esperados são os da demo mais as Execuções do teste (ex.: Rhetor tem 244 na demo).
describe('Execuções', () => {
  it('um pedido coordenado aumenta em 1 as execuções de cada Agente chamado; o que o Agente executa sozinho não conta', async () => {
    const { usuario, fonte } = renderizarApp('/')
    await composerDaRaiz()
    await definirPermissao(fonte, 'rhetor', 'hubspot', 'executar')
    await pedirPelaSugestao(usuario, 'Monte a abordagem completa para a OpenAI')
    await screen.findByRole('note', { name: /Executada: Criar sequência de 3 e-mails/ })
    await coordenacaoTerminada()

    await waitFor(async () => expect(await execucoes(fonte, 'scopus')).toBe(313))
    expect(await execucoes(fonte, 'ethos')).toBe(188)
    expect(await execucoes(fonte, 'rhetor')).toBe(245)
    expect(await execucoes(fonte, 'oraculum')).toBe(96)
  })
})

describe('Gatilho das ações', () => {
  it('decidir uma Aprovação registra uma ação na Atividade e não muda as execuções', async () => {
    const { usuario, fonte } = renderizarAppNoNavegador('/aprovacoes')
    const proposta = await screen.findByRole('article', { name: /Subir campanha no Meta Ads/ })
    await usuario.click(within(proposta).getByRole('button', { name: 'Aprovar' }))
    await within(proposta).findByText('Aprovada')

    expect(await execucoes(fonte, 'rhetor')).toBe(244)
    const item = await itemDaAtividade('rhetor', /Aprovada na fila: Subir campanha no Meta Ads/)
    expect(within(item).getByText('Conversa')).toBeInTheDocument()
  })

  it('a Aprovação da Coordenação, decidida na página da Conversa, entra na Atividade com o gatilho Coordenação', async () => {
    const { usuario } = renderizarAppNoNavegador('/')
    await pedirPelaSugestao(usuario, 'Monte a abordagem completa para a OpenAI')
    const aprovacao = await screen.findByRole('article', { name: /Aprovação pendente: Criar sequência de 3 e-mails/ })
    await coordenacaoTerminada()
    await usuario.click(within(aprovacao).getByRole('button', { name: 'Aprovar' }))
    await screen.findByRole('article', { name: /Aprovada: Criar sequência de 3 e-mails/ })

    const item = await itemDaAtividade('rhetor', /Aprovada na Conversa: Criar sequência de 3 e-mails/)
    expect(within(item).getByText('Coordenação')).toBeInTheDocument()
  })

  it('a Aprovação da Coordenação, decidida na fila, entra na Atividade com o gatilho Coordenação', async () => {
    const { usuario } = renderizarAppNoNavegador('/')
    await pedirPelaSugestao(usuario, 'Monte a abordagem completa para a OpenAI')
    await screen.findByRole('article', { name: /Aprovação pendente: Criar sequência de 3 e-mails/ })
    await coordenacaoTerminada()
    await usuario.click(within(screen.getByRole('navigation', { name: 'Workspace' })).getByRole('link', { name: /Aprovações/ }))
    const proposta = await screen.findByRole('article', { name: /Criar sequência de 3 e-mails no HubSpot/ })
    await usuario.click(within(proposta).getByRole('button', { name: 'Recusar' }))
    await within(proposta).findByText('Recusada')

    const item = await itemDaAtividade('rhetor', /Recusada na fila: Criar sequência de 3 e-mails/)
    expect(within(item).getByText('Coordenação')).toBeInTheDocument()
  })

  it('a Aprovação pedida num Canal, decidida na fila, mantém o gatilho Canal', async () => {
    const { usuario } = renderizarAppNoNavegador('/aprovacoes')
    const proposta = await screen.findByRole('article', { name: /Atualizar 14 Contas-alvo/ })
    await usuario.click(within(proposta).getByRole('button', { name: 'Aprovar' }))
    await within(proposta).findByText('Aprovada')

    const item = await itemDaAtividade('scopus', /Aprovada na fila: Atualizar 14 Contas-alvo/)
    expect(within(item).getByText('Canal')).toBeInTheDocument()
  })
})

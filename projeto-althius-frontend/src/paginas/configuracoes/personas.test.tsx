import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { criarFonteSimulada, type OpcoesFonteSimulada } from '@/fonte/simulada'
import { armazenamentoEmMemoria, armazenamentoQueFalha } from '@/test/armazenamento'
import { renderizarApp } from '@/test/renderizar'

/** Abre a app numa rota com a identidade (e, se preciso, o papel) escolhida para o cenário. */
function abrir(rota: string, opcoesFonte: OpcoesFonteSimulada = {}) {
  return renderizarApp(rota, {}, {}, {}, {}, opcoesFonte)
}

describe('Memória do Workspace: Personas vigentes', () => {
  it('mostra as definições de Personas, mantidas pelo Ethos, sem edição direta e distintas dos participantes e dos Contatos', async () => {
    const { usuario } = abrir('/configuracoes/memoria', { sessao: { contaId: 'lucas' } })

    const documentos = within(await screen.findByRole('navigation', { name: 'Documentos da Memória do Workspace' }))
    await usuario.click(documentos.getByRole('link', { name: 'Personas' }))
    const personas = within(await screen.findByRole('region', { name: 'Personas vigentes' }))
    expect(personas.getByText('Decisor técnico')).toBeInTheDocument()
    expect(
      personas.getByText('CTO, VP de Engenharia ou Head de Dados. Avalia arquitetura, custo de nuvem e governança antes de recomendar a compra.'),
    ).toBeInTheDocument()
    expect(personas.getByText('Patrocinador executivo')).toBeInTheDocument()
    expect(personas.getByText('Campeão interno')).toBeInTheDocument()
    expect(personas.getByText(/Aprovadas em 5 de setembro de 2026 por Rafael Couto · mantidas pelo Ethos/)).toBeInTheDocument()
    expect(personas.getByText(/classificam os Contatos em Contas e Contatos e não são participantes do Workspace/)).toBeInTheDocument()
    expect(personas.getByRole('button', { name: 'Solicitar revisão ao Ethos' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'ICP vigente' })).not.toBeInTheDocument()

    const dependentes = within(screen.getByRole('list', { name: 'Configurações que usam as Personas' }))
    expect(dependentes.getByRole('listitem', { name: 'Classificação de Contatos por Persona' })).toHaveTextContent('Contas e Contatos')
    expect(dependentes.getByRole('listitem', { name: 'Habilidade “Sequência por persona”' })).toHaveTextContent('Rhetor')
    expect(dependentes.getByRole('listitem', { name: 'Contexto do Workspace na Memória dos Agentes' })).toBeInTheDocument()

    await usuario.click(documentos.getByRole('link', { name: 'ICP' }))
    expect(await screen.findByRole('region', { name: 'ICP vigente' })).toBeInTheDocument()
  })
})

type Usuario = ReturnType<typeof renderizarApp>['usuario']

/** Na aba Personas da Memória do Workspace, pede a revisão ao Ethos pela Conversa do diálogo. */
async function pedirRevisaoAoEthos(usuario: Usuario, pedido = 'Governança de dados aparece em quase todas as objeções.') {
  await usuario.click(await screen.findByRole('button', { name: 'Solicitar revisão ao Ethos' }))
  const dialogo = within(await screen.findByRole('dialog', { name: 'Revisão das Personas' }))
  await usuario.type(dialogo.getByRole('textbox', { name: 'O que deveria mudar?' }), pedido)
  await usuario.click(dialogo.getByRole('button', { name: 'Enviar ao Ethos' }))
  const conversa = within(await dialogo.findByRole('list', { name: 'Conversa com o Ethos' }))
  expect(await conversa.findByText(/aguardando a decisão de um Administrador/)).toBeInTheDocument()
  return conversa
}

describe('Revisão das Personas pelo Ethos', () => {
  it('um Membro pede a revisão numa Conversa com o Ethos; a proposta fica pendente em Aprovações e as Personas não mudam', async () => {
    const { usuario } = abrir('/configuracoes/memoria/personas', { sessao: { contaId: 'lucas' } })
    const conversa = await pedirRevisaoAoEthos(usuario)
    expect(conversa.getByText('Lucas Moreira')).toBeInTheDocument()
    expect(conversa.getByText(/governança apareceu em quase todas as objeções/)).toBeInTheDocument()
    await usuario.keyboard('{Escape}')

    const personas = within(screen.getByRole('region', { name: 'Personas vigentes' }))
    expect(personas.queryByText('Líder de governança de dados')).not.toBeInTheDocument()
    expect(personas.getByText(/Proposta pendente do Ethos/)).toBeInTheDocument()
    expect(personas.getByText(/as Personas abaixo continuam valendo em todo o Workspace/)).toBeInTheDocument()
    expect(personas.queryByRole('button', { name: 'Solicitar revisão ao Ethos' })).not.toBeInTheDocument()

    await usuario.click(personas.getByRole('link', { name: 'Ver proposta pendente' }))
    const cartao = within(await screen.findByRole('article', { name: 'Revisar as Personas do Workspace' }))
    expect(cartao.getByText(/Pedido por Lucas Moreira/)).toBeInTheDocument()
    expect(cartao.getByText('“Governança de dados aparece em quase todas as objeções.”')).toBeInTheDocument()
    const alteracoes = within(cartao.getByRole('region', { name: 'Alterações propostas' }))
    expect(alteracoes.getByText('Líder de governança de dados')).toHaveTextContent('Nova')
    expect(alteracoes.getByText(/Head de Governança ou DPO/)).toBeInTheDocument()
    expect(alteracoes.getByText(/Sem mudança: Decisor técnico, Patrocinador executivo/)).toBeInTheDocument()
    const alcance = within(cartao.getByRole('region', { name: 'Alcance' }))
    expect(alcance.getByText(/Aprovar substitui as Personas vigentes e atualiza de uma vez estas 3 configurações/)).toBeInTheDocument()
    expect(alcance.getByText(/Classificação de Contatos por Persona/)).toBeInTheDocument()
    expect(alcance.getByText(/Uma variação para cada uma das 8 Personas/)).toBeInTheDocument()

    expect(cartao.queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument()
    expect(cartao.queryByRole('button', { name: 'Recusar' })).not.toBeInTheDocument()
    expect(await cartao.findByText(/Somente Administradores aprovam ou recusam revisões do ICP e das Personas/)).toHaveTextContent(
      'Aguardando: Marina Alves ou Rafael Couto.',
    )
  })
})

const navegacao = () => within(screen.getByRole('complementary', { name: 'Navegação' }))

/** A Habilidade preexistente "Sequência por persona" de um Agente do Rhetor. */
async function habilidadeSequenciaPorPersona(usuario: Usuario, agente: string) {
  await usuario.click(navegacao().getByRole('link', { name: /Agentes/ }))
  await usuario.click((await screen.findAllByRole('link', { name: new RegExp(`^${agente}`) }))[0])
  await usuario.click(await screen.findByRole('link', { name: 'Habilidades' }))
  return screen.findByRole('listitem', { name: 'Sequência por persona' })
}

/** O Contexto do Workspace na Memória de um Agente. */
async function contextoDoWorkspace(usuario: Usuario, agente: string) {
  await usuario.click(navegacao().getByRole('link', { name: /Agentes/ }))
  await usuario.click((await screen.findAllByRole('link', { name: new RegExp(`^${agente}`) }))[0])
  await usuario.click(await screen.findByRole('link', { name: 'Memória' }))
  return screen.findByRole('region', { name: 'Contexto do Workspace' })
}

async function abrirDocumento(usuario: Usuario, documento: 'ICP' | 'Personas') {
  await usuario.click(navegacao().getByRole('link', { name: /Configurações/ }))
  await usuario.click(await screen.findByRole('link', { name: 'Memória do Workspace' }))
  await usuario.click(within(await screen.findByRole('navigation', { name: 'Documentos da Memória do Workspace' })).getByRole('link', { name: documento }))
  return within(await screen.findByRole('region', { name: documento === 'ICP' ? 'ICP vigente' : 'Personas vigentes' }))
}

describe('Aprovação da revisão das Personas', () => {
  it('Membro pede, o Ethos propõe, um Administrador aprova: a Memória, o Rhetor e os Agentes passam a usar as novas Personas, e o ICP não muda', async () => {
    const armazenamento = armazenamentoEmMemoria()
    const membro = abrir('/configuracoes/memoria/personas', { armazenamento, sessao: { contaId: 'lucas' } })
    await pedirRevisaoAoEthos(membro.usuario)
    membro.unmount()

    const { usuario, fonte } = abrir('/aprovacoes', { armazenamento, sessao: { contaId: 'rafael' } })
    const cartao = within(await screen.findByRole('article', { name: 'Revisar as Personas do Workspace' }))
    await usuario.click(cartao.getByRole('button', { name: 'Aprovar' }))
    expect(await cartao.findByText(/Aprovada por Rafael Couto · as Personas vigentes foram substituídas/)).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Pendentes · 2' })).toBeInTheDocument()
    expect((await fonte.aprovacoes()).filter((a) => a.revisao)).toHaveLength(1)

    const personas = await abrirDocumento(usuario, 'Personas')
    expect(personas.getByText('Líder de governança de dados')).toBeInTheDocument()
    expect(personas.getByText('Decisor técnico')).toBeInTheDocument()
    expect(personas.getByText(/Aprovadas em .* por Rafael Couto/)).toBeInTheDocument()
    expect(personas.getByText(/Estas Personas substituíram as anteriores/)).toBeInTheDocument()
    const icp = await abrirDocumento(usuario, 'ICP')
    expect(icp.getByText('Empresas com 2.000 funcionários ou mais.')).toBeInTheDocument()
    expect(icp.getByText(/Aprovado em 12 de setembro de 2026 por Marina Alves/)).toBeInTheDocument()

    expect(await habilidadeSequenciaPorPersona(usuario, 'Rhetor')).toHaveTextContent(
      'Uma variação para cada uma das 8 Personas: Decisor técnico, Patrocinador executivo, Líder técnico, Comitê executivo, Decisor comercial, Campeão interno, Usuário-chave, Líder de governança de dados',
    )
    expect(await habilidadeSequenciaPorPersona(usuario, 'Rhetor · Sequências outbound')).toHaveTextContent('Líder de governança de dados')
    const contexto = within(await contextoDoWorkspace(usuario, 'Ethos'))
    expect(contexto.getByText('Líder de governança de dados')).toBeInTheDocument()
    expect(contexto.getByText(/Head de Governança ou DPO/)).toBeInTheDocument()
    expect(contexto.getByText('Empresas com 2.000 funcionários ou mais.')).toBeInTheDocument()
  })
})

/** Abre Aprovações como Administrador e decide a revisão pendente das Personas. */
async function decidirNaFila(usuario: Usuario, botao: 'Aprovar' | 'Recusar') {
  await usuario.click(navegacao().getByRole('link', { name: /Aprovações/ }))
  // As pendentes vêm primeiro na fila.
  const cartao = within((await screen.findAllByRole('article', { name: 'Revisar as Personas do Workspace' }))[0])
  await usuario.click(cartao.getByRole('button', { name: botao }))
  return cartao
}

describe('Recusa e pendência da revisão das Personas', () => {
  it('recusar mantém as Personas e as configurações que dependem delas, e a Memória avisa quem recusou', async () => {
    const { usuario } = abrir('/configuracoes/memoria/personas')
    await pedirRevisaoAoEthos(usuario)
    await usuario.keyboard('{Escape}')

    const cartao = await decidirNaFila(usuario, 'Recusar')
    expect(await cartao.findByText(/Recusada por Marina Alves · as Personas vigentes continuam as mesmas/)).toBeInTheDocument()

    const personas = await abrirDocumento(usuario, 'Personas')
    expect(personas.queryByText('Líder de governança de dados')).not.toBeInTheDocument()
    expect(personas.getByText(/A última proposta do Ethos foi recusada por Marina Alves. As Personas vigentes não mudaram./)).toBeInTheDocument()
    expect(personas.getByRole('button', { name: 'Solicitar revisão ao Ethos' })).toBeInTheDocument()
    expect(await habilidadeSequenciaPorPersona(usuario, 'Rhetor')).toHaveTextContent('Uma variação para cada uma das 7 Personas')
  })

  it('enquanto pendente, a proposta não muda as configurações que dependem das Personas', async () => {
    const { usuario } = abrir('/configuracoes/memoria/personas')
    await pedirRevisaoAoEthos(usuario)
    await usuario.keyboard('{Escape}')

    const habilidade = await habilidadeSequenciaPorPersona(usuario, 'Rhetor')
    expect(habilidade).toHaveTextContent('Uma variação para cada uma das 7 Personas')
    expect(habilidade).not.toHaveTextContent('governança')
    expect(within(await contextoDoWorkspace(usuario, 'Scopus')).queryByText('Líder de governança de dados')).not.toBeInTheDocument()
  })
})

/** Abre a tabela de Contatos e, no primeiro classificado pela Persona, a definição que ela mostra. */
async function personaNosContatos(usuario: Usuario, persona: string) {
  await usuario.click(navegacao().getByRole('link', { name: /Contas/ }))
  await usuario.click(within(await screen.findByRole('navigation', { name: 'Abas de contas e contatos' })).getByRole('link', { name: 'Contatos' }))
  const tabela = within(await screen.findByRole('table', { name: 'Tabela de Contatos' }))
  const classificados = await tabela.findAllByRole('button', { name: persona })
  await usuario.click(classificados[0])
  return { classificados, definicao: await screen.findByRole('dialog', { name: persona }) }
}

describe('Revisões sucessivas das Personas', () => {
  it('o Administrador aprova a própria solicitação; a segunda aprovação substitui a primeira, e os Contatos classificados só passam a usar a nova definição depois de aprovada', async () => {
    const { usuario, fonte, fonteDeContas } = abrir('/configuracoes/memoria/personas')
    const contatosAntes = (await fonteDeContas.contatos()).map(({ id, persona }) => ({ id, persona }))
    const icpAntes = (await fonte.memoriaDoWorkspace()).icp

    await pedirRevisaoAoEthos(usuario)
    await usuario.keyboard('{Escape}')
    expect(await (await decidirNaFila(usuario, 'Aprovar')).findByText(/Aprovada por Marina Alves/)).toBeInTheDocument()

    await abrirDocumento(usuario, 'Personas')
    await pedirRevisaoAoEthos(usuario, 'O Decisor técnico está entrando só depois da prova de conceito.')
    await usuario.keyboard('{Escape}')
    // Pendente, a proposta não muda a definição que os Contatos mostram.
    const pendente = await personaNosContatos(usuario, 'Decisor técnico')
    expect(pendente.definicao).toHaveAccessibleDescription(
      'CTO, VP de Engenharia ou Head de Dados. Avalia arquitetura, custo de nuvem e governança antes de recomendar a compra.',
    )
    await usuario.keyboard('{Escape}')
    await decidirNaFila(usuario, 'Aprovar')
    await waitFor(() => expect(screen.getAllByText(/Aprovada por Marina Alves/)).toHaveLength(2))

    const personas = await abrirDocumento(usuario, 'Personas')
    const novaDefinicao =
      'CTO, VP de Engenharia ou Head de Dados. Entra depois da prova de conceito e decide pela arquitetura e pelo custo de nuvem.'
    expect(personas.getByText(novaDefinicao)).toBeInTheDocument()
    expect(personas.queryByText(/Avalia arquitetura, custo de nuvem e governança/)).not.toBeInTheDocument()
    expect(personas.getByText('Líder de governança de dados')).toBeInTheDocument()
    expect(personas.getAllByText('Decisor técnico')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /Restaurar|Versões|Histórico/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/versão anterior/i)).not.toBeInTheDocument()

    // Os Contatos já classificados continuam os mesmos e passam a mostrar a definição vigente.
    const { classificados, definicao } = await personaNosContatos(usuario, 'Decisor técnico')
    expect(classificados).toHaveLength(contatosAntes.filter((c) => c.persona === 'Decisor técnico').length)
    expect(definicao).toHaveAccessibleDescription(novaDefinicao)
    expect(within(definicao).getByRole('link', { name: 'Ver na Memória do Workspace' })).toHaveAttribute(
      'href',
      '/configuracoes/memoria/personas',
    )
    expect((await fonteDeContas.contatos()).map(({ id, persona }) => ({ id, persona }))).toEqual(contatosAntes)

    // Revisar as Personas não toca no ICP.
    expect((await fonte.memoriaDoWorkspace()).icp).toEqual(icpAntes)
  })
})

describe('Revisão das Personas pelo contrato da fonte', () => {
  it('um Membro não aprova nem recusa, mesmo sem passar pela tela; a proposta continua pendente e as Personas não mudam', async () => {
    const fonte = criarFonteSimulada({ atrasoMs: 0, sessao: { contaId: 'lucas' } })
    const antes = (await fonte.memoriaDoWorkspace()).personas
    const proposta = await fonte.solicitarRevisao('personas', 'Incluir governança de dados.')

    for (const decisao of ['aprovada', 'rejeitada'] as const) {
      await expect(fonte.decidirAprovacao(proposta.id, decisao, 'fila')).rejects.toThrow(
        'Somente Administradores aprovam ou recusam revisões do ICP e das Personas.',
      )
    }
    expect((await fonte.aprovacoes()).find((a) => a.id === proposta.id)?.estado).toBe('pendente')
    expect((await fonte.memoriaDoWorkspace()).personas).toEqual(antes)
  })

  it('ICP e Personas têm propostas independentes: aprovar uma não muda o outro documento nem a outra proposta', async () => {
    const fonte = criarFonteSimulada({ atrasoMs: 0 })
    const inicial = await fonte.memoriaDoWorkspace()
    const doIcp = await fonte.solicitarRevisao('icp', 'Incluir a Colômbia.')
    const dasPersonas = await fonte.solicitarRevisao('personas', 'Incluir governança de dados.')

    await fonte.decidirAprovacao(dasPersonas.id, 'aprovada', 'fila')
    const depoisDasPersonas = await fonte.memoriaDoWorkspace()
    expect(depoisDasPersonas.icp).toEqual(inicial.icp)
    expect(depoisDasPersonas.personas.secoes.map((p) => p.titulo)).toContain('Líder de governança de dados')
    expect((await fonte.aprovacoes()).find((a) => a.id === doIcp.id)?.estado).toBe('pendente')

    await fonte.decidirAprovacao(doIcp.id, 'aprovada', 'fila')
    const depoisDoIcp = await fonte.memoriaDoWorkspace()
    expect(depoisDoIcp.personas).toEqual(depoisDasPersonas.personas)
    expect(depoisDoIcp.icp.secoes).toContainEqual({ titulo: 'Porte', texto: 'Empresas com 1.000 funcionários ou mais.' })
  })

  it('solicitação, decisão e falha ficam disponíveis para o consumidor de notificações, pelas Aprovações e pela Atividade do Ethos', async () => {
    const { armazenamento, falharAGravacao } = armazenamentoQueFalha()
    const membro = criarFonteSimulada({ atrasoMs: 0, armazenamento, sessao: { contaId: 'lucas' } })
    const execucoesAntes = (await membro.agente('ethos')).execucoes

    // Solicitação: uma Aprovação pendente com o solicitante, que é o resultado de uma Execução do Ethos.
    const proposta = await membro.solicitarRevisao('personas', 'Incluir governança de dados.')
    expect(proposta).toMatchObject({
      agenteId: 'ethos',
      estado: 'pendente',
      revisao: { documento: 'personas', solicitante: { contaId: 'lucas', nome: 'Lucas Moreira' } },
    })
    expect((await membro.agente('ethos')).execucoes).toBe(execucoesAntes + 1)
    expect((await membro.atividade('ethos'))[0]).toMatchObject({ tipo: 'execucao', gatilho: 'conversa' })

    // Falha: nada muda, a proposta segue pendente e a falha entra na Atividade do Ethos.
    const administrador = criarFonteSimulada({ atrasoMs: 0, armazenamento, sessao: { contaId: 'rafael' } })
    const personasAntes = (await administrador.memoriaDoWorkspace()).personas
    const execucoesDoAdministrador = (await administrador.agente('ethos')).execucoes
    falharAGravacao(true)
    await expect(administrador.decidirAprovacao(proposta.id, 'aprovada', 'fila')).rejects.toThrow(
      'Não foi possível concluir a decisão. As Personas vigentes e as configurações que dependem delas continuam como estavam; a proposta segue pendente.',
    )
    expect((await administrador.memoriaDoWorkspace()).personas).toEqual(personasAntes)
    expect((await administrador.aprovacoes()).find((a) => a.id === proposta.id)?.estado).toBe('pendente')
    expect((await administrador.atividade('ethos'))[0]).toMatchObject({
      descricao: 'Falhou ao decidir na fila: Revisar as Personas do Workspace',
      falhou: true,
    })

    // Decisão: quem decidiu fica na Aprovação, e a decisão é uma ação da Execução de origem, sem contar outra.
    falharAGravacao(false)
    await administrador.decidirAprovacao(proposta.id, 'aprovada', 'fila')
    expect((await administrador.aprovacoes()).find((a) => a.id === proposta.id)).toMatchObject({
      estado: 'aprovada',
      revisao: { decididaPor: { contaId: 'rafael', nome: 'Rafael Couto' } },
    })
    const [decisao] = await administrador.atividade('ethos')
    expect(decisao).toMatchObject({
      tipo: 'acao',
      gatilho: 'conversa',
      descricao: 'Aprovada na fila: Revisar as Personas do Workspace',
      link: { para: '/configuracoes/memoria/personas' },
    })
    expect(decisao.resultado).toMatch(/As Personas vigentes foram substituídas e as configurações que dependem delas já usam as novas/)
    expect((await administrador.agente('ethos')).execucoes).toBe(execucoesDoAdministrador)
  })

  it('a Memória salva antes das Personas mantém o ICP aprovado e as revisões, e começa pelas Personas de exemplo', async () => {
    const armazenamento = armazenamentoEmMemoria()
    const antes = criarFonteSimulada({ atrasoMs: 0, armazenamento })
    const personasDeExemplo = (await antes.memoriaDoWorkspace()).personas
    const proposta = await antes.solicitarRevisao('icp', 'Incluir a Colômbia.')
    await antes.decidirAprovacao(proposta.id, 'aprovada', 'fila')
    const icpAprovado = (await antes.memoriaDoWorkspace()).icp
    // O formato que o ticket 05 gravou no navegador: o ICP e as revisões, ainda sem as Personas.
    const chave = 'althius:memoria:databricks'
    const { personas: _, ...salvaNoTicket05 } = JSON.parse(armazenamento.getItem(chave)!)
    armazenamento.setItem(chave, JSON.stringify(salvaNoTicket05))

    const depois = criarFonteSimulada({ atrasoMs: 0, armazenamento })
    expect(await depois.memoriaDoWorkspace()).toEqual({ icp: icpAprovado, personas: personasDeExemplo })
    expect(icpAprovado.secoes).toContainEqual({ titulo: 'Porte', texto: 'Empresas com 1.000 funcionários ou mais.' })
    expect((await depois.aprovacoes()).find((a) => a.id === proposta.id)?.estado).toBe('aprovada')
  })

  it('todo Contato com Persona aponta para uma Persona definida na Memória do Workspace', async () => {
    const { fonte, fonteDeContas } = abrir('/contatos')
    const definidas = (await fonte.memoriaDoWorkspace()).personas.secoes.map((p) => p.titulo)
    const usadas = new Set((await fonteDeContas.contatos()).flatMap((c) => (c.persona ? [c.persona] : [])))
    expect(usadas.size).toBeGreaterThan(0)
    expect([...usadas].filter((persona) => !definidas.includes(persona))).toEqual([])
  })
})

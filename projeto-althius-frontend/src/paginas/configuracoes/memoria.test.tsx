import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { criarFonteSimulada, type OpcoesFonteSimulada } from '@/fonte/simulada'
import { armazenamentoEmMemoria, armazenamentoQueFalha } from '@/test/armazenamento'
import { renderizarApp } from '@/test/renderizar'

/** Abre a app numa rota com a identidade (e, se preciso, o papel) escolhida para o cenário. */
function abrir(rota: string, opcoesFonte: OpcoesFonteSimulada = {}) {
  return renderizarApp(rota, {}, {}, {}, {}, opcoesFonte)
}

describe('Memória do Workspace: ICP vigente', () => {
  it('mostra o ICP vigente, mantido pelo Scopus, sem edição direta e separado da Memória dos Agentes', async () => {
    abrir('/configuracoes/memoria', { sessao: { contaId: 'lucas' } })

    expect(await screen.findByRole('heading', { level: 2, name: 'Memória do Workspace' })).toBeInTheDocument()
    const icp = within(await screen.findByRole('region', { name: 'ICP vigente' }))
    expect(icp.getByText('Porte')).toBeInTheDocument()
    expect(icp.getByText('Empresas com 2.000 funcionários ou mais.')).toBeInTheDocument()
    expect(icp.getByText('Brasil e México.')).toBeInTheDocument()
    expect(icp.getByText(/mantido pelo Scopus/)).toBeInTheDocument()
    expect(icp.getByRole('button', { name: 'Solicitar revisão ao Scopus' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})

type Usuario = ReturnType<typeof renderizarApp>['usuario']

/** Na Memória do Workspace, pede a revisão do ICP ao Scopus pela Conversa do diálogo. */
async function pedirRevisaoAoScopus(usuario: Usuario, pedido = 'Estamos fechando com empresas menores na Colômbia e no Chile.') {
  await usuario.click(await screen.findByRole('button', { name: 'Solicitar revisão ao Scopus' }))
  const dialogo = within(await screen.findByRole('dialog', { name: 'Revisão do ICP' }))
  await usuario.type(dialogo.getByRole('textbox', { name: 'O que deveria mudar?' }), pedido)
  await usuario.click(dialogo.getByRole('button', { name: 'Enviar ao Scopus' }))
  const conversa = within(await dialogo.findByRole('list', { name: 'Conversa com o Scopus' }))
  expect(await conversa.findByText(/aguardando a decisão de um Administrador/)).toBeInTheDocument()
  return { dialogo, conversa }
}

describe('Revisão do ICP pelo Scopus', () => {
  it('um Membro pede a revisão numa Conversa com o Scopus; a proposta fica pendente em Aprovações e o ICP não muda', async () => {
    const { usuario } = abrir('/configuracoes/memoria', { sessao: { contaId: 'lucas' } })
    const { conversa } = await pedirRevisaoAoScopus(usuario)
    expect(conversa.getByText('Lucas Moreira')).toBeInTheDocument()
    expect(conversa.getByText(/empresas menores e a região andina estão convertendo/)).toBeInTheDocument()
    await usuario.keyboard('{Escape}')

    const icp = within(screen.getByRole('region', { name: 'ICP vigente' }))
    expect(icp.getByText('Empresas com 2.000 funcionários ou mais.')).toBeInTheDocument()
    expect(icp.getByText(/Proposta pendente do Scopus/)).toBeInTheDocument()
    expect(icp.queryByRole('button', { name: 'Solicitar revisão ao Scopus' })).not.toBeInTheDocument()

    await usuario.click(icp.getByRole('link', { name: 'Ver proposta pendente' }))
    const cartao = within(await screen.findByRole('article', { name: 'Revisar o ICP do Workspace' }))
    expect(cartao.getByText(/Pedido por Lucas Moreira/)).toBeInTheDocument()
    expect(cartao.getByText('“Estamos fechando com empresas menores na Colômbia e no Chile.”')).toBeInTheDocument()
    const alteracoes = within(cartao.getByRole('region', { name: 'Alterações propostas' }))
    expect(alteracoes.getByText('Empresas com 1.000 funcionários ou mais.')).toBeInTheDocument()
    expect(alteracoes.getByText('Empresas com 2.000 funcionários ou mais.')).toBeInTheDocument()
    expect(alteracoes.getByText('Brasil, México, Colômbia e Chile.')).toBeInTheDocument()
    const alcance = within(cartao.getByRole('region', { name: 'Alcance' }))
    expect(alcance.getByText(/Aprovar substitui o ICP vigente e atualiza de uma vez estas 3 configurações/)).toBeInTheDocument()
    expect(alcance.getByText(/Público recomendado dos Monitoramentos/)).toBeInTheDocument()

    expect(cartao.queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument()
    expect(cartao.queryByRole('button', { name: 'Recusar' })).not.toBeInTheDocument()
    expect(await cartao.findByText(/Somente Administradores aprovam ou recusam revisões do ICP.*Aguardando/)).toHaveTextContent(
      'Aguardando: Marina Alves ou Rafael Couto.',
    )
  })
})

/** O preexistente "Vagas de engenharia de dados" descobre empresas pelo público recomendado. */
async function publicoDoMonitoramentoPreexistente(usuario: Usuario) {
  await usuario.click(within(await screen.findByRole('complementary', { name: 'Navegação' })).getByRole('link', { name: /Sinais/ }))
  await usuario.click(await within(await screen.findByRole('region', { name: 'Catálogo de sinais' })).findByRole('link', { name: /Abertura de vagas/ }))
  await usuario.click(await screen.findByRole('link', { name: /Vagas de engenharia de dados/ }))
  return screen.findByRole('complementary', { name: 'Público recomendado' })
}

describe('Aprovação da revisão do ICP', () => {
  it('Membro pede, o Scopus propõe, um Administrador aprova: a Memória, Sinais e os Agentes passam a usar o novo ICP', async () => {
    const armazenamento = armazenamentoEmMemoria()
    const membro = abrir('/configuracoes/memoria', { armazenamento, sessao: { contaId: 'lucas' } })
    await pedirRevisaoAoScopus(membro.usuario)
    membro.unmount()

    const { usuario, fonte } = abrir('/aprovacoes', { armazenamento, sessao: { contaId: 'rafael' } })
    const cartao = within(await screen.findByRole('article', { name: 'Revisar o ICP do Workspace' }))
    expect(cartao.getByText(/Pedido por Lucas Moreira/)).toBeInTheDocument()
    await usuario.click(cartao.getByRole('button', { name: 'Aprovar' }))
    expect(await cartao.findByText(/Aprovada por Rafael Couto/)).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Pendentes · 2' })).toBeInTheDocument()
    expect((await fonte.aprovacoes()).filter((a) => a.revisao)).toHaveLength(1)

    await usuario.click(within(screen.getByRole('complementary', { name: 'Navegação' })).getByRole('link', { name: /Configurações/ }))
    await usuario.click(await screen.findByRole('link', { name: 'Memória do Workspace' }))
    const icp = within(await screen.findByRole('region', { name: 'ICP vigente' }))
    expect(icp.getByText('Empresas com 1.000 funcionários ou mais.')).toBeInTheDocument()
    expect(icp.queryByText('Empresas com 2.000 funcionários ou mais.')).not.toBeInTheDocument()
    expect(icp.getByText(/por Rafael Couto/)).toBeInTheDocument()

    const publico = await publicoDoMonitoramentoPreexistente(usuario)
    expect(publico).toHaveTextContent('Empresas com 1.000 funcionários ou mais')
    expect(publico).toHaveTextContent('Brasil, México, Colômbia e Chile')
    expect(publico).not.toHaveTextContent('2.000')

    await usuario.click(within(screen.getByRole('complementary', { name: 'Navegação' })).getByRole('link', { name: /Agentes/ }))
    await usuario.click((await screen.findAllByRole('link', { name: /Ethos/ }))[0])
    await usuario.click(await screen.findByRole('link', { name: 'Memória' }))
    const contexto = within(await screen.findByRole('region', { name: 'Contexto do Workspace' }))
    expect(contexto.getByText('Empresas com 1.000 funcionários ou mais.')).toBeInTheDocument()
    await usuario.click(within(screen.getByRole('complementary', { name: 'Navegação' })).getByRole('link', { name: /Agentes/ }))
    await usuario.click((await screen.findAllByRole('link', { name: /Scopus/ }))[0])
    await usuario.click(await screen.findByRole('link', { name: 'Habilidades' }))
    const habilidade = within(await screen.findByRole('listitem', { name: 'Pontuar aderência ao ICP' }))
    expect(habilidade.getByText(/Empresas com 1.000 funcionários ou mais · Brasil, México, Colômbia e Chile/)).toBeInTheDocument()
  })
})

describe('Decisão da revisão do ICP pelo contrato da fonte', () => {
  it('um Membro não aprova nem recusa, mesmo sem passar pela tela; a proposta continua pendente e o ICP não muda', async () => {
    const fonte = criarFonteSimulada({ atrasoMs: 0, sessao: { contaId: 'lucas' } })
    const proposta = await fonte.solicitarRevisao('icp', 'Incluir a Colômbia.')

    for (const decisao of ['aprovada', 'rejeitada'] as const) {
      await expect(fonte.decidirAprovacao(proposta.id, decisao, 'fila')).rejects.toThrow(
        'Somente Administradores aprovam ou recusam revisões do ICP e das Personas.',
      )
    }
    expect((await fonte.aprovacoes()).find((a) => a.id === proposta.id)?.estado).toBe('pendente')
    expect((await fonte.memoriaDoWorkspace()).icp.secoes).toContainEqual({
      titulo: 'Porte',
      texto: 'Empresas com 2.000 funcionários ou mais.',
    })
  })

  it('a restrição vale só para revisões da Memória: um Membro continua decidindo as outras Aprovações como antes', async () => {
    const fonte = criarFonteSimulada({ atrasoMs: 0, sessao: { contaId: 'lucas' } })
    await fonte.decidirAprovacao('ap1', 'aprovada', 'fila')
    expect((await fonte.aprovacoes()).find((a) => a.id === 'ap1')?.estado).toBe('aprovada')
  })

  it('quem não participa do Workspace não pede revisão, e não há segundo pedido enquanto um estiver pendente', async () => {
    const armazenamento = armazenamentoEmMemoria()
    await criarFonteSimulada({ atrasoMs: 0, armazenamento }).removerDoWorkspace('lucas')
    const removido = criarFonteSimulada({ atrasoMs: 0, armazenamento, sessao: { contaId: 'lucas' } })
    await expect(removido.solicitarRevisao('icp', 'Incluir a Colômbia.')).rejects.toThrow('Você não participa deste Workspace.')

    const membro = criarFonteSimulada({ atrasoMs: 0, sessao: { contaId: 'beatriz' } })
    await membro.solicitarRevisao('icp', 'Incluir a Colômbia.')
    await expect(membro.solicitarRevisao('icp', 'Incluir o Chile.')).rejects.toThrow(/Já existe uma proposta do ICP pendente/)
    expect((await membro.aprovacoes()).filter((a) => a.revisao)).toHaveLength(1)
  })

  it('pedir é uma Execução do Scopus; decidir é uma ação dessa Execução, sem contar outra', async () => {
    const fonte = criarFonteSimulada({ atrasoMs: 0 })
    const antes = (await fonte.agente('scopus')).execucoes
    const proposta = await fonte.solicitarRevisao('icp', 'Incluir a Colômbia.')
    expect((await fonte.agente('scopus')).execucoes).toBe(antes + 1)

    await fonte.decidirAprovacao(proposta.id, 'aprovada', 'fila')
    expect((await fonte.agente('scopus')).execucoes).toBe(antes + 1)
    const decidida = (await fonte.aprovacoes()).find((a) => a.id === proposta.id)
    expect(decidida?.revisao).toMatchObject({ pedido: 'Incluir a Colômbia.', decididaPor: { nome: 'Marina Alves' } })
    expect(decidida?.revisao).not.toHaveProperty('proposto')
    expect(decidida?.revisao).not.toHaveProperty('vigenteNoPedido')
    const [decisao, execucao] = await fonte.atividade('scopus')
    expect(decisao).toMatchObject({ tipo: 'acao', gatilho: 'conversa', descricao: 'Aprovada na fila: Revisar o ICP do Workspace' })
    expect(decisao.resultado).toMatch(/Nenhuma ação externa foi refeita/)
    expect(execucao).toMatchObject({ tipo: 'execucao', gatilho: 'conversa' })
  })
})

/** Abre Aprovações como Administrador e decide a revisão pendente do ICP. */
async function decidirNaFila(usuario: Usuario, botao: 'Aprovar' | 'Recusar') {
  await usuario.click(within(screen.getByRole('complementary', { name: 'Navegação' })).getByRole('link', { name: /Aprovações/ }))
  // As pendentes vêm primeiro na fila.
  const cartao = within((await screen.findAllByRole('article', { name: 'Revisar o ICP do Workspace' }))[0])
  await usuario.click(cartao.getByRole('button', { name: botao }))
  return cartao
}

async function voltarParaAMemoria(usuario: Usuario) {
  await usuario.click(within(screen.getByRole('complementary', { name: 'Navegação' })).getByRole('link', { name: /Configurações/ }))
  await usuario.click(await screen.findByRole('link', { name: 'Memória do Workspace' }))
  return within(await screen.findByRole('region', { name: 'ICP vigente' }))
}

describe('Recusa, pendência e revisões sucessivas', () => {
  it('recusar mantém o ICP e as configurações que dependem dele, e a Memória avisa quem recusou', async () => {
    const { usuario } = abrir('/configuracoes/memoria')
    await pedirRevisaoAoScopus(usuario)
    await usuario.keyboard('{Escape}')

    const cartao = await decidirNaFila(usuario, 'Recusar')
    expect(await cartao.findByText(/Recusada por Marina Alves/)).toBeInTheDocument()

    const icp = await voltarParaAMemoria(usuario)
    expect(icp.getByText('Empresas com 2.000 funcionários ou mais.')).toBeInTheDocument()
    expect(icp.getByText(/A última proposta do Scopus foi recusada por Marina Alves/)).toBeInTheDocument()
    expect(icp.getByRole('button', { name: 'Solicitar revisão ao Scopus' })).toBeInTheDocument()
    const publico = await publicoDoMonitoramentoPreexistente(usuario)
    expect(publico).toHaveTextContent('Empresas com 2.000 funcionários ou mais · Time de dados próprio, com engenharia e ciência de dados · Brasil e México')
  })

  it('enquanto pendente, a proposta não muda as configurações que dependem do ICP', async () => {
    const { usuario } = abrir('/configuracoes/memoria')
    await pedirRevisaoAoScopus(usuario)
    await usuario.keyboard('{Escape}')

    const publico = await publicoDoMonitoramentoPreexistente(usuario)
    expect(publico).toHaveTextContent('Empresas com 2.000 funcionários ou mais')
    expect(publico).not.toHaveTextContent('Colômbia')
  })

  it('o Administrador aprova a própria solicitação; a segunda aprovação substitui a primeira, sem lista de versões nem restauração', async () => {
    const { usuario, fonteDeSinais, fonteDeContas } = abrir('/configuracoes/memoria')
    const sinaisAntes = await fonteDeSinais.sinaisEncontrados()
    const contasAntes = (await fonteDeContas.contas()).map(({ id, aderencia, quente }) => ({ id, aderencia, quente }))

    await pedirRevisaoAoScopus(usuario)
    await usuario.keyboard('{Escape}')
    expect(await (await decidirNaFila(usuario, 'Aprovar')).findByText(/Aprovada por Marina Alves/)).toBeInTheDocument()

    await voltarParaAMemoria(usuario)
    await pedirRevisaoAoScopus(usuario, 'O varejo parou de avançar; saúde está fechando.')
    await usuario.keyboard('{Escape}')
    await decidirNaFila(usuario, 'Aprovar')
    await waitFor(() => expect(screen.getAllByText(/Aprovada por Marina Alves/)).toHaveLength(2))
    // Decididas, as revisões ficam só como registro na fila: nem o ICP substituído nem o aprovado ficam guardados nelas.
    for (const cartao of screen.getAllByRole('article', { name: 'Revisar o ICP do Workspace' })) {
      expect(within(cartao).queryByRole('region', { name: 'Alterações propostas' })).not.toBeInTheDocument()
      expect(cartao).not.toHaveTextContent('2.000 funcionários')
      expect(cartao).not.toHaveTextContent('Serviços financeiros, varejo e telecomunicações.')
    }

    const icp = await voltarParaAMemoria(usuario)
    expect(icp.getByText('Serviços financeiros, saúde e telecomunicações.')).toBeInTheDocument()
    expect(icp.getByText('Empresas com 1.000 funcionários ou mais.')).toBeInTheDocument()
    expect(icp.queryByText('Serviços financeiros, varejo e telecomunicações.')).not.toBeInTheDocument()
    expect(icp.getAllByText('Porte')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /Restaurar|Versões|Histórico/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/versão anterior/i)).not.toBeInTheDocument()
    const dependentes = within(screen.getByRole('list', { name: 'Configurações que usam o ICP' }))
    expect(dependentes.getByText('Segmentos: Serviços financeiros, saúde e telecomunicações')).toBeInTheDocument()

    // Atualizar o ICP não dispara Sinal nem muda Aderência ou Quente das Contas-alvo.
    expect(await fonteDeSinais.sinaisEncontrados()).toEqual(sinaisAntes)
    expect((await fonteDeContas.contas()).map(({ id, aderencia, quente }) => ({ id, aderencia, quente }))).toEqual(contasAntes)
  })
})

describe('Falha ao aplicar a revisão do ICP', () => {
  it('se a aprovação falha, nenhuma área publica o ICP proposto, a proposta segue pendente e a falha entra na Atividade', async () => {
    const { armazenamento, falharAGravacao } = armazenamentoQueFalha()
    const { usuario, fonte } = abrir('/configuracoes/memoria', { armazenamento })
    await pedirRevisaoAoScopus(usuario)
    await usuario.keyboard('{Escape}')

    falharAGravacao(true)
    const cartao = await decidirNaFila(usuario, 'Aprovar')
    expect(await cartao.findByRole('alert')).toHaveTextContent(
      'Não foi possível concluir a decisão. O ICP vigente e as configurações que dependem dele continuam como estavam; a proposta segue pendente.',
    )
    expect(cartao.getByRole('button', { name: 'Aprovar' })).toBeInTheDocument()
    expect((await fonte.atividade('scopus'))[0]).toMatchObject({
      descricao: 'Falhou ao decidir na fila: Revisar o ICP do Workspace',
      falhou: true,
    })

    const icp = await voltarParaAMemoria(usuario)
    expect(icp.getByText('Empresas com 2.000 funcionários ou mais.')).toBeInTheDocument()
    expect(icp.getByText(/Proposta pendente do Scopus/)).toBeInTheDocument()
    expect(await publicoDoMonitoramentoPreexistente(usuario)).toHaveTextContent('Empresas com 2.000 funcionários ou mais')

    falharAGravacao(false)
    await decidirNaFila(usuario, 'Aprovar')
    expect(await screen.findByText(/Aprovada por Marina Alves/)).toBeInTheDocument()
    expect(await publicoDoMonitoramentoPreexistente(usuario)).toHaveTextContent('Empresas com 1.000 funcionários ou mais')
  })

  it('se o pedido não pode ser registrado, nenhuma proposta entra em Aprovações e a falha entra na Atividade', async () => {
    const { armazenamento, falharAGravacao } = armazenamentoQueFalha()
    const fonte = criarFonteSimulada({ atrasoMs: 0, armazenamento })
    falharAGravacao(true)

    await expect(fonte.solicitarRevisao('icp', 'Incluir a Colômbia.')).rejects.toThrow(/Não foi possível registrar a proposta/)
    expect((await fonte.aprovacoes()).some((a) => a.revisao)).toBe(false)
    expect((await fonte.atividade('scopus'))[0]).toMatchObject({ falhou: true })
  })
})

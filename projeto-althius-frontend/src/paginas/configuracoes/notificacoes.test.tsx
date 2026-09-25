import { act, fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { criarFonteSimulada, type OpcoesFonteSimulada } from '@/fonte/simulada'
import type { AvisoDoWorkspace, FonteDeAgentes } from '@/fonte/tipos'
import { armazenamentoEmMemoria, armazenamentoQueFalha } from '@/test/armazenamento'
import { navegadorComNotificacoes } from '@/test/notificacoes'
import { renderizarApp } from '@/test/renderizar'

/** Abre a app numa rota com a identidade (e, se preciso, o papel) escolhida para o cenário. */
function abrir(rota: string, opcoesFonte: OpcoesFonteSimulada = {}) {
  return renderizarApp(rota, {}, {}, {}, {}, opcoesFonte)
}

const interruptor = () => screen.findByRole('switch', { name: 'Ativar notificações do navegador' })
/** O bloco de notificações em Preferências, depois de carregar a preferência (quando o interruptor aparece). */
async function blocoDeNotificacoes() {
  await interruptor()
  return within(screen.getByRole('region', { name: 'Notificações do navegador' }))
}

type Usuario = ReturnType<typeof renderizarApp>['usuario']

/** Em Preferências, ativa as notificações num navegador que concede a permissão. */
async function ativarNotificacoes(usuario: Usuario) {
  await usuario.click(await interruptor())
  expect(await (await blocoDeNotificacoes()).findByText('Ativadas')).toBeInTheDocument()
}

/** Da seção atual de Configurações, pede ao Scopus a revisão do ICP pela Conversa da Memória do Workspace. */
async function pedirRevisaoAoScopus(usuario: Usuario) {
  await usuario.click(await screen.findByRole('link', { name: 'Memória do Workspace' }))
  await usuario.click(await screen.findByRole('button', { name: 'Solicitar revisão ao Scopus' }))
  const dialogo = within(await screen.findByRole('dialog', { name: 'Revisão do ICP' }))
  await usuario.type(dialogo.getByRole('textbox', { name: 'O que deveria mudar?' }), 'Estamos fechando na Colômbia.')
  await usuario.click(dialogo.getByRole('button', { name: 'Enviar ao Scopus' }))
  expect(await dialogo.findByText(/aguardando a decisão de um Administrador/)).toBeInTheDocument()
  await usuario.keyboard('{Escape}')
}

/** Abre Aprovações pela navegação e decide a revisão pendente do ICP. */
async function decidirRevisaoDoIcp(usuario: Usuario, botao: 'Aprovar' | 'Recusar') {
  await usuario.click(within(screen.getByRole('complementary', { name: 'Navegação' })).getByRole('link', { name: /Aprovações/ }))
  const cartao = within((await screen.findAllByRole('article', { name: 'Revisar o ICP do Workspace' }))[0])
  await usuario.click(cartao.getByRole('button', { name: botao }))
  return cartao
}

describe('Preferência de notificações do navegador', () => {
  it('começa desligada, e abrir Configurações não pede permissão ao navegador', async () => {
    const navegador = navegadorComNotificacoes()
    abrir('/configuracoes/preferencias')

    expect(await interruptor()).not.toBeChecked()
    expect((await blocoDeNotificacoes()).getByText('Desligadas')).toBeInTheDocument()
    expect(navegador.pedidos).not.toHaveBeenCalled()
  })

  it('ativar pede a permissão uma vez; concedida, as notificações ficam ativadas e a preferência volta depois de recarregar', async () => {
    const navegador = navegadorComNotificacoes()
    const armazenamento = armazenamentoEmMemoria()
    const { usuario, unmount } = abrir('/configuracoes/preferencias', { armazenamento })

    await usuario.click(await interruptor())
    expect(navegador.pedidos).toHaveBeenCalledTimes(1)
    const bloco = await blocoDeNotificacoes()
    expect(await bloco.findByText('Ativadas')).toBeInTheDocument()
    expect(await interruptor()).toBeChecked()

    unmount()
    abrir('/configuracoes/preferencias', { armazenamento })
    expect(await interruptor()).toBeChecked()
    expect((await blocoDeNotificacoes()).getByText('Ativadas')).toBeInTheDocument()
    expect(navegador.pedidos).toHaveBeenCalledTimes(1)
  })

  it('negada pelo navegador, não declara ativação: mostra bloqueadas, não grava a preferência e não pergunta de novo', async () => {
    const navegador = navegadorComNotificacoes({ resposta: 'denied' })
    const armazenamento = armazenamentoEmMemoria()
    const { usuario, unmount } = abrir('/configuracoes/preferencias', { armazenamento })

    await usuario.click(await interruptor())
    const bloco = await blocoDeNotificacoes()
    expect(await bloco.findByText('Bloqueadas pelo navegador')).toBeInTheDocument()
    expect(await interruptor()).not.toBeChecked()
    expect(bloco.getByRole('alert')).toHaveTextContent('O navegador bloqueou as notificações da Althius.')
    expect(bloco.queryByText('Ativadas')).not.toBeInTheDocument()

    // Com a permissão negada, o navegador nem perguntaria: a tela explica o que fazer.
    await usuario.click(await interruptor())
    expect(await bloco.findByRole('status')).toHaveTextContent(
      'O navegador ainda bloqueia as notificações. Libere a Althius nas configurações do site e ative de novo.',
    )
    expect(navegador.pedidos).toHaveBeenCalledTimes(1)

    unmount()
    abrir('/configuracoes/preferencias', { armazenamento })
    expect((await blocoDeNotificacoes()).getByText('Bloqueadas pelo navegador')).toBeInTheDocument()
    expect(await interruptor()).not.toBeChecked()
  })

  it('se a pessoa fecha o pedido do navegador sem responder, as notificações continuam desligadas', async () => {
    navegadorComNotificacoes({ resposta: 'default' })
    const { usuario } = abrir('/configuracoes/preferencias')

    await usuario.click(await interruptor())
    const bloco = await blocoDeNotificacoes()
    expect(await bloco.findByText('O navegador não concedeu a permissão. As notificações continuam desligadas.')).toBeInTheDocument()
    expect(bloco.getByText('Desligadas')).toBeInTheDocument()
    expect(await interruptor()).not.toBeChecked()
  })

  it('num navegador sem a API de notificações, mostra não suportadas e não há o que ativar', async () => {
    const { usuario } = abrir('/configuracoes/preferencias')

    const bloco = await blocoDeNotificacoes()
    expect(bloco.getByText('Não suportadas')).toBeInTheDocument()
    expect(bloco.getByText(/Este navegador não oferece notificações/)).toBeInTheDocument()
    const controle = await interruptor()
    expect(controle).toHaveAttribute('aria-disabled', 'true')
    await usuario.click(controle)
    expect(controle).not.toBeChecked()
    expect(bloco.queryByText('Ativadas')).not.toBeInTheDocument()
  })

  it('ativadas, lista os avisos que a pessoa recebe pelo papel: só Administradores recebem as revisões para decidir', async () => {
    navegadorComNotificacoes({ permissao: 'granted' })
    const administrador = abrir('/configuracoes/preferencias')
    await ativarNotificacoes(administrador.usuario)
    const doAdministrador = (await blocoDeNotificacoes()).getByRole('list', { name: 'Avisos que você recebe' })
    expect(doAdministrador).toHaveTextContent('Revisões do ICP e das Personas aguardando sua decisão')
    expect(doAdministrador).toHaveTextContent('O resultado das Aprovações que você pediu')
    administrador.unmount()

    const membro = abrir('/configuracoes/preferencias', { sessao: { contaId: 'lucas' } })
    await ativarNotificacoes(membro.usuario)
    const doMembro = (await blocoDeNotificacoes()).getByRole('list', { name: 'Avisos que você recebe' })
    expect(doMembro).not.toHaveTextContent('Revisões do ICP e das Personas')
    expect(doMembro).toHaveTextContent('Outras Aprovações aguardando decisão no Workspace')
    expect(doMembro).toHaveTextContent('Falhas de Execução nos seus pedidos aos Agentes')
  })

  it('a preferência gravada não passa por cima do navegador: bloqueadas no site, nada é mostrado; liberadas, voltam sem perguntar de novo', async () => {
    const navegador = navegadorComNotificacoes({ permissao: 'granted' })
    const { usuario } = abrir('/configuracoes/preferencias')
    await ativarNotificacoes(usuario)

    navegador.mudarPermissao('denied')
    fireEvent.focus(window)
    const bloco = await blocoDeNotificacoes()
    expect(await bloco.findByText('Bloqueadas pelo navegador')).toBeInTheDocument()
    expect(await interruptor()).not.toBeChecked()
    await pedirRevisaoAoScopus(usuario)
    expect(navegador.mostradas).toEqual([])

    navegador.mudarPermissao('granted')
    await usuario.click(await screen.findByRole('link', { name: 'Preferências' }))
    expect(await (await blocoDeNotificacoes()).findByText('Ativadas')).toBeInTheDocument()
    expect(navegador.pedidos).not.toHaveBeenCalled()
  })

  it('se o navegador não grava a preferência, avisa e as notificações continuam desligadas', async () => {
    navegadorComNotificacoes({ permissao: 'granted' })
    const { armazenamento, falharAGravacao } = armazenamentoQueFalha()
    const { usuario } = abrir('/configuracoes/preferencias', { armazenamento })
    falharAGravacao(true)

    await usuario.click(await interruptor())
    const bloco = await blocoDeNotificacoes()
    expect(await bloco.findByRole('alert')).toHaveTextContent('Não foi possível salvar a preferência neste navegador. Nada mudou.')
    expect(bloco.getByText('Desligadas')).toBeInTheDocument()
    expect(await interruptor()).not.toBeChecked()
  })
})

describe('Avisos pelo navegador', () => {
  it('o Administrador é avisado da revisão do ICP aguardando decisão, e clicar no aviso abre Aprovações', async () => {
    const navegador = navegadorComNotificacoes({ permissao: 'granted' })
    const { usuario } = abrir('/configuracoes/preferencias')
    await ativarNotificacoes(usuario)
    expect(navegador.pedidos).not.toHaveBeenCalled()

    await pedirRevisaoAoScopus(usuario)
    expect(navegador.mostradas).toEqual([
      expect.objectContaining({
        titulo: 'Revisão do ICP aguardando Aprovação',
        texto: 'O Scopus propôs um novo ICP a pedido de Marina Alves. Decida em Aprovações.',
      }),
    ])

    act(() => navegador.mostradas[0].clicar())
    expect(await screen.findByRole('article', { name: 'Revisar o ICP do Workspace' })).toBeInTheDocument()
  })

  it('quem pediu a revisão é avisado do resultado, também o Administrador que aprova o próprio pedido', async () => {
    const navegador = navegadorComNotificacoes({ permissao: 'granted' })
    const { usuario } = abrir('/configuracoes/preferencias')
    await ativarNotificacoes(usuario)
    await pedirRevisaoAoScopus(usuario)

    const cartao = await decidirRevisaoDoIcp(usuario, 'Aprovar')
    expect(await cartao.findByText(/Aprovada por Marina Alves/)).toBeInTheDocument()
    expect(navegador.mostradas.at(-1)).toMatchObject({
      titulo: 'Sua revisão do ICP foi aprovada',
      texto: 'Aprovada por Marina Alves. O ICP vigente foi substituído e as configurações que dependem dele já usam o novo.',
    })

    act(() => navegador.mostradas.at(-1)!.clicar())
    expect(await screen.findByRole('region', { name: 'ICP vigente' })).toHaveTextContent('Colômbia')
  })

  it('pelo papel: o Membro que pede não recebe o aviso para decidir, e o Administrador que decide o pedido de outra pessoa não recebe o resultado', async () => {
    const navegador = navegadorComNotificacoes({ permissao: 'granted' })
    const armazenamento = armazenamentoEmMemoria()
    const membro = abrir('/configuracoes/preferencias', { armazenamento, sessao: { contaId: 'lucas' } })
    await ativarNotificacoes(membro.usuario)
    await pedirRevisaoAoScopus(membro.usuario)
    expect(navegador.mostradas).toEqual([])
    membro.unmount()

    // A preferência é de cada Conta de usuário: a de Lucas não liga as notificações de Rafael.
    const administrador = abrir('/configuracoes/preferencias', { armazenamento, sessao: { contaId: 'rafael' } })
    expect(await interruptor()).not.toBeChecked()
    await ativarNotificacoes(administrador.usuario)
    const cartao = await decidirRevisaoDoIcp(administrador.usuario, 'Recusar')
    expect(await cartao.findByText(/Recusada por Rafael Couto/)).toBeInTheDocument()
    expect(navegador.mostradas).toEqual([])
  })

  it('desativar interrompe os avisos e grava a preferência, sem alegar revogar a permissão do navegador', async () => {
    const navegador = navegadorComNotificacoes({ permissao: 'granted' })
    const armazenamento = armazenamentoEmMemoria()
    const { usuario, unmount } = abrir('/configuracoes/preferencias', { armazenamento })
    await ativarNotificacoes(usuario)

    await usuario.click(await interruptor())
    const bloco = await blocoDeNotificacoes()
    expect(await bloco.findByText('Desligadas')).toBeInTheDocument()
    expect(
      bloco.getByText('Avisos desligados. A permissão do navegador continua como estava; só a Althius deixa de avisar.'),
    ).toBeInTheDocument()
    expect(bloco.queryByText(/revog/i)).not.toBeInTheDocument()

    await pedirRevisaoAoScopus(usuario)
    expect(navegador.mostradas).toEqual([])
    unmount()

    abrir('/configuracoes/preferencias', { armazenamento })
    expect(await interruptor()).not.toBeChecked()
    expect((await blocoDeNotificacoes()).getByText('Desligadas')).toBeInTheDocument()
  })

  it('uma falha de execução avisa quem pediu a ação, e o aviso leva ao que continua valendo', async () => {
    const navegador = navegadorComNotificacoes({ permissao: 'granted' })
    const { armazenamento, falharAGravacao } = armazenamentoQueFalha()
    const { usuario } = abrir('/configuracoes/preferencias', { armazenamento })
    await ativarNotificacoes(usuario)
    await pedirRevisaoAoScopus(usuario)

    falharAGravacao(true)
    const cartao = await decidirRevisaoDoIcp(usuario, 'Aprovar')
    expect(await cartao.findByRole('alert')).toHaveTextContent('Não foi possível concluir a decisão.')
    expect(navegador.mostradas.at(-1)).toMatchObject({
      titulo: 'Falha na Execução do Scopus',
      texto:
        'Falhou ao decidir na fila: Revisar o ICP do Workspace. Nada foi alterado: o ICP vigente e as configurações que dependem dele continuam como estavam.',
    })

    act(() => navegador.mostradas.at(-1)!.clicar())
    expect(await screen.findByRole('region', { name: 'ICP vigente' })).not.toHaveTextContent('Colômbia')
  })

  it('os avisos não criam Aprovações nem mudam o resultado, mesmo quando o navegador se recusa a mostrá-los', async () => {
    const navegador = navegadorComNotificacoes({ permissao: 'granted' })
    const { usuario, fonte } = abrir('/configuracoes/preferencias')
    await ativarNotificacoes(usuario)
    const antes = await fonte.aprovacoes()
    navegador.falharAoMostrar(true)

    await pedirRevisaoAoScopus(usuario)
    const cartao = await decidirRevisaoDoIcp(usuario, 'Aprovar')
    expect(await cartao.findByText(/Aprovada por Marina Alves/)).toBeInTheDocument()
    expect(navegador.mostradas).toEqual([])
    expect(await fonte.aprovacoes()).toHaveLength(antes.length + 1)
    await usuario.click(within(screen.getByRole('complementary', { name: 'Navegação' })).getByRole('link', { name: /Configurações/ }))
    await usuario.click(await screen.findByRole('link', { name: 'Memória do Workspace' }))
    expect(await screen.findByRole('region', { name: 'ICP vigente' })).toHaveTextContent('Colômbia')
  })
})

/** Os avisos que a fonte emitir daqui em diante. */
function avisosDe(fonte: FonteDeAgentes): AvisoDoWorkspace[] {
  const avisos: AvisoDoWorkspace[] = []
  fonte.observarAvisos((aviso) => avisos.push(aviso))
  return avisos
}

describe('Destinatários dos avisos, pelo contrato da fonte', () => {
  it('a revisão pedida por um Membro vai aos Administradores ativos, e o resultado, a quem pediu', async () => {
    const armazenamento = armazenamentoEmMemoria()
    const membro = criarFonteSimulada({ atrasoMs: 0, armazenamento, sessao: { contaId: 'lucas' } })
    const avisosDoMembro = avisosDe(membro)
    const proposta = await membro.solicitarRevisao('personas', 'Incluir governança de dados.')
    expect(avisosDoMembro).toEqual([
      expect.objectContaining({
        tipo: 'aprovacao-solicitada',
        destinatarios: ['marina', 'rafael'],
        titulo: 'Revisão das Personas aguardando Aprovação',
        texto: 'O Ethos propôs novas Personas a pedido de Lucas Moreira. Decida em Aprovações.',
        para: '/aprovacoes',
      }),
    ])

    const administrador = criarFonteSimulada({ atrasoMs: 0, armazenamento, sessao: { contaId: 'rafael' } })
    const avisosDoAdministrador = avisosDe(administrador)
    await administrador.decidirAprovacao(proposta.id, 'rejeitada', 'fila')
    expect(avisosDoAdministrador).toEqual([
      expect.objectContaining({
        tipo: 'aprovacao-decidida',
        destinatarios: ['lucas'],
        titulo: 'Sua revisão das Personas foi recusada',
        texto: 'Recusada por Rafael Couto. As Personas vigentes não mudaram.',
        para: '/configuracoes/memoria/personas',
      }),
    ])
  })

  it('quem saiu do Workspace não recebe o resultado do que pediu', async () => {
    const armazenamento = armazenamentoEmMemoria()
    const proposta = await criarFonteSimulada({ atrasoMs: 0, armazenamento, sessao: { contaId: 'lucas' } }).solicitarRevisao(
      'icp',
      'Incluir a Colômbia.',
    )
    const administrador = criarFonteSimulada({ atrasoMs: 0, armazenamento, sessao: { contaId: 'rafael' } })
    await administrador.removerDoWorkspace('lucas')
    const avisos = avisosDe(administrador)

    await administrador.decidirAprovacao(proposta.id, 'aprovada', 'fila')
    expect(avisos).toEqual([expect.objectContaining({ tipo: 'aprovacao-decidida', destinatarios: [] })])
  })

  it('o aviso não concede a decisão: quem o recebeu como Administrador e depois virou Membro não decide', async () => {
    const fonte = criarFonteSimulada({ atrasoMs: 0 })
    const avisos = avisosDe(fonte)
    const proposta = await fonte.solicitarRevisao('icp', 'Incluir a Colômbia.')
    expect(avisos[0].destinatarios).toContain('marina')

    await fonte.mudarPapel('marina', 'membro')
    await expect(fonte.decidirAprovacao(proposta.id, 'aprovada', 'fila')).rejects.toThrow(
      'Somente Administradores aprovam ou recusam revisões do ICP e das Personas.',
    )
    expect((await fonte.aprovacoes()).find((a) => a.id === proposta.id)?.estado).toBe('pendente')
    expect(avisos).toHaveLength(1)
  })

  it('nas demais categorias de Aprovação, o pedido vai a todos os participantes ativos, e o resultado, a quem conversou com o Agente', async () => {
    const fonte = criarFonteSimulada({ atrasoMs: 0, sessao: { contaId: 'lucas' } })
    const avisos = avisosDe(fonte)
    for await (const _ of fonte.conversar('scopus', { texto: 'Monte a abordagem completa para a OpenAI', sugestaoId: 'colaboracao-openai' })) {
      // Só consome a Conversa até o fim.
    }
    const acao = 'Criar sequência de 3 e-mails no HubSpot para o Comitê de compra da OpenAI'
    expect(avisos).toEqual([
      expect.objectContaining({
        tipo: 'aprovacao-solicitada',
        destinatarios: ['marina', 'rafael', 'lucas', 'beatriz', 'thiago'],
        titulo: 'Aprovação pendente do Rhetor',
        texto: `${acao}. Decida em Aprovações.`,
        para: '/aprovacoes',
      }),
    ])

    const aprovacao = (await fonte.aprovacoes()).find((a) => a.acao === acao)!
    await fonte.decidirAprovacao(aprovacao.id, 'aprovada', 'fila')
    expect(avisos.at(-1)).toMatchObject({
      tipo: 'aprovacao-decidida',
      destinatarios: ['lucas'],
      titulo: `Aprovada: ${acao}`,
      texto: 'Decidida por Lucas Moreira na fila. Ação executada.',
      para: '/aprovacoes',
    })

    // Uma Aprovação que ninguém pediu na Althius (ex.: vinda de um Canal) não tem a quem avisar do resultado.
    const doCanal = (await fonte.aprovacoes()).find((a) => a.gatilho === 'canal' && a.estado === 'pendente')!
    await fonte.decidirAprovacao(doCanal.id, 'rejeitada', 'fila')
    expect(avisos.at(-1)).toMatchObject({ tipo: 'aprovacao-decidida', destinatarios: [] })
  })
})

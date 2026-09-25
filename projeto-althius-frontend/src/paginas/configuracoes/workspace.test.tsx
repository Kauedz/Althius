import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { criarFonteSimulada, type OpcoesFonteSimulada } from '@/fonte/simulada'
import { armazenamentoEmMemoria } from '@/test/armazenamento'
import { renderizarApp } from '@/test/renderizar'

/** Abre Workspace / Pessoas e acesso com a identidade (e, se preciso, o papel) escolhida para o cenário. */
function abrirParticipantes(opcoesFonte: OpcoesFonteSimulada = {}) {
  return renderizarApp('/configuracoes/workspace', {}, {}, {}, {}, opcoesFonte)
}

function linhaDe(nome: string) {
  return screen.getByRole('row', { name: nome })
}

describe('Workspace / Pessoas e acesso', () => {
  it('um Membro consulta as informações e quem participa, com o papel de cada um, sem ações administrativas', async () => {
    abrirParticipantes({ sessao: { contaId: 'lucas' } })

    expect(await screen.findByRole('heading', { level: 2, name: 'Pessoas e acesso' })).toBeInTheDocument()
    const informacoes = within(await screen.findByRole('region', { name: 'Workspace' }))
    expect(informacoes.getByText('Databricks')).toBeInTheDocument()
    expect(informacoes.getByText('Membro')).toBeInTheDocument()

    expect(within(await screen.findByRole('row', { name: 'Marina Alves' })).getByText('Administrador')).toBeInTheDocument()
    expect(within(linhaDe('Lucas Moreira')).getByText('Membro')).toBeInTheDocument()
    expect(within(linhaDe('Lucas Moreira')).getByText('Você')).toBeInTheDocument()

    expect(screen.getByText(/Você é Membro/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Convidar pessoa' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /Papel de/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remover do Workspace' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar informações' })).not.toBeInTheDocument()
  })
})

describe('Convite demonstrativo', () => {
  it('um Administrador convida com papel definido; o convite fica pendente, sem e-mail enviado e sem contar como participante', async () => {
    const { usuario } = abrirParticipantes()
    const informacoes = within(await screen.findByRole('region', { name: 'Workspace' }))
    expect(informacoes.getByText('5')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Convidar pessoa' }))
    const dialogo = within(await screen.findByRole('dialog', { name: 'Convidar pessoa' }))
    await usuario.type(dialogo.getByRole('textbox', { name: 'E-mail' }), 'Julia.Prado@Databricks.com')
    await usuario.click(dialogo.getByRole('radio', { name: 'Administrador' }))
    await usuario.click(dialogo.getByRole('button', { name: 'Registrar convite' }))

    expect(await screen.findByText(/Convite registrado para julia.prado@databricks.com como Administrador/)).toHaveTextContent(
      'Demonstração: nenhum e-mail foi enviado.',
    )
    expect(screen.queryByRole('dialog', { name: 'Convidar pessoa' })).not.toBeInTheDocument()
    const convite = within(within(screen.getByRole('list', { name: 'Convites pendentes' })).getByRole('listitem', { name: 'julia.prado@databricks.com' }))
    expect(convite.getByText('Convite pendente')).toBeInTheDocument()
    expect(convite.getByText(/Administrador/)).toBeInTheDocument()
    expect(screen.queryByRole('row', { name: /julia/i })).not.toBeInTheDocument()
    expect(informacoes.getByText('5')).toBeInTheDocument()
  })

  it('recusa e-mail inválido e quem já participa, sem registrar convite', async () => {
    const { usuario } = abrirParticipantes()
    await usuario.click(await screen.findByRole('button', { name: 'Convidar pessoa' }))
    const dialogo = within(await screen.findByRole('dialog', { name: 'Convidar pessoa' }))
    const email = dialogo.getByRole('textbox', { name: 'E-mail' })

    await usuario.type(email, 'sem-arroba')
    await usuario.click(dialogo.getByRole('button', { name: 'Registrar convite' }))
    expect(await dialogo.findByRole('alert')).toHaveTextContent('Informe um e-mail em formato válido')

    await usuario.clear(email)
    await usuario.type(email, 'lucas.moreira@databricks.com')
    await usuario.click(dialogo.getByRole('button', { name: 'Registrar convite' }))
    expect(await dialogo.findByRole('alert')).toHaveTextContent('lucas.moreira@databricks.com já participa deste Workspace.')

    await usuario.click(dialogo.getByRole('button', { name: 'Cancelar' }))
    expect(within(screen.getByRole('list', { name: 'Convites pendentes' })).getAllByRole('listitem')).toHaveLength(1)
  })

  it('um Administrador cancela um convite pendente', async () => {
    const { usuario } = abrirParticipantes()
    const convite = within(await screen.findByRole('listitem', { name: 'carla.nunes@databricks.com' }))
    await usuario.click(convite.getByRole('button', { name: 'Cancelar convite' }))
    expect(await screen.findByText('nenhum convite esperando resposta')).toBeInTheDocument()
  })
})

describe('Papéis de acesso', () => {
  it('um Administrador alterna o papel de alguém entre Membro e Administrador, só com esses dois papéis', async () => {
    const { usuario } = abrirParticipantes()
    const papel = await screen.findByRole('combobox', { name: 'Papel de Beatriz Santos' })
    expect(within(papel).getAllByRole('option').map((o) => o.textContent)).toEqual(['Administrador', 'Membro'])

    await usuario.selectOptions(papel, 'Administrador')
    expect(await screen.findByText('Beatriz Santos agora é Administrador neste Workspace.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Papel de Beatriz Santos' })).toHaveValue('administrador'))

    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Papel de Beatriz Santos' }), 'Membro')
    expect(await screen.findByText('Beatriz Santos agora é Membro neste Workspace.')).toBeInTheDocument()
  })

  it('o último Administrador não pode ser rebaixado nem removido pela interface', async () => {
    const { usuario } = abrirParticipantes()
    await usuario.selectOptions(await screen.findByRole('combobox', { name: 'Papel de Rafael Couto' }), 'Membro')
    await screen.findByText('Rafael Couto agora é Membro neste Workspace.')

    const marina = within(linhaDe('Marina Alves'))
    await waitFor(() => expect(marina.getByRole('combobox', { name: 'Papel de Marina Alves' })).toBeDisabled())
    expect(marina.getByText('Último Administrador')).toBeInTheDocument()
    expect(marina.getByRole('button', { name: 'Remover do Workspace' })).toBeDisabled()
  })

  it('quem se rebaixa a Membro deixa de ver as ações administrativas, e a Casca mostra o novo papel', async () => {
    const { usuario } = abrirParticipantes()
    await usuario.click(await screen.findByRole('button', { name: /Menu do usuário/ }))
    expect(await screen.findByText('Administrador neste Workspace')).toBeInTheDocument()
    await usuario.keyboard('{Escape}')

    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Papel de Marina Alves' }), 'Membro')
    expect(await screen.findByText(/Você é Membro/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Convidar pessoa' })).not.toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: /Menu do usuário/ }))
    expect(await screen.findByText('Membro neste Workspace')).toBeInTheDocument()
  })
})

describe('Remover do Workspace', () => {
  it('explica que a Conta de usuário é mantida e encerra só a Participação, preservando o outro Workspace', async () => {
    const { usuario, fonte } = abrirParticipantes()
    await usuario.click(within(await screen.findByRole('row', { name: 'Thiago Ramos' })).getByRole('button', { name: 'Remover do Workspace' }))

    const dialogo = within(await screen.findByRole('dialog', { name: 'Remover do Workspace' }))
    expect(dialogo.getByText(/A Conta de usuário será mantida/)).toBeInTheDocument()
    expect(dialogo.getByText('Workspace Evolut Trading · Membro')).toBeInTheDocument()
    await usuario.click(dialogo.getByRole('button', { name: 'Remover do Workspace' }))

    expect(
      await screen.findByText(
        'O acesso de Thiago Ramos ao Workspace Databricks foi encerrado. A Conta de usuário continua ativa, assim como a participação em Evolut Trading.',
      ),
    ).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('row', { name: 'Thiago Ramos' })).not.toBeInTheDocument())
    expect(within(screen.getByRole('region', { name: 'Workspace' })).getByText('4')).toBeInTheDocument()

    const thiago = await fonte.contaDeUsuario('thiago')
    expect(thiago.conta).toMatchObject({ nome: 'Thiago Ramos', email: 'thiago.ramos@databricks.com' })
    expect(thiago.participacoes).toEqual([{ workspaceId: 'evolut-trading', nomeDoWorkspace: 'Evolut Trading', papel: 'membro', atual: false }])
    // Remover não troca a sessão, o plano nem cria Workspace: a pessoa removida só deixa este Workspace.
    expect((await fonte.workspace()).cliente).toBe('Databricks')
  })

  it('cancelar a remoção mantém a pessoa no Workspace', async () => {
    const { usuario } = abrirParticipantes()
    await usuario.click(within(await screen.findByRole('row', { name: 'Lucas Moreira' })).getByRole('button', { name: 'Remover do Workspace' }))
    await usuario.click(within(await screen.findByRole('dialog', { name: 'Remover do Workspace' })).getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByRole('row', { name: 'Lucas Moreira' })).toBeInTheDocument()
  })
})

describe('Contrato da fonte: operações administrativas validam a Participação e o papel', () => {
  it('um Membro não convida, não muda papéis, não remove e não altera o Workspace, mesmo sem passar pelos botões', async () => {
    const fonte = criarFonteSimulada({ atrasoMs: 0, sessao: { contaId: 'lucas' } })
    const antes = await fonte.participantesDoWorkspace()

    await expect(fonte.convidarParaWorkspace({ email: 'nova@databricks.com', papel: 'administrador' })).rejects.toThrow(
      /Só Administradores/,
    )
    await expect(fonte.mudarPapel('lucas', 'administrador')).rejects.toThrow(/Só Administradores/)
    await expect(fonte.removerDoWorkspace('beatriz')).rejects.toThrow(/Só Administradores/)
    await expect(fonte.cancelarConvite(antes.convites[0].id)).rejects.toThrow(/Só Administradores/)
    await expect(fonte.salvarInformacoesDoWorkspace({ nome: 'Outro nome', descricao: 'Outra descrição' })).rejects.toThrow(
      /Só Administradores/,
    )

    expect(await fonte.participantesDoWorkspace()).toEqual(antes)
  })

  it('o último Administrador não pode ser rebaixado nem removido também pela operação, não só pela interface', async () => {
    const fonte = criarFonteSimulada({ atrasoMs: 0, sessao: { contaId: 'rafael' } })
    await fonte.mudarPapel('marina', 'membro')

    await expect(fonte.mudarPapel('rafael', 'membro')).rejects.toThrow('O Workspace precisa de pelo menos um Administrador.')
    await expect(fonte.removerDoWorkspace('rafael')).rejects.toThrow('O Workspace precisa de pelo menos um Administrador.')

    const { participantes } = await fonte.participantesDoWorkspace()
    expect(participantes.find((p) => p.conta.id === 'rafael')?.papel).toBe('administrador')
  })

  it('a preparação escolhe o papel da sessão: Marina como Membro não administra', async () => {
    const fonte = criarFonteSimulada({ atrasoMs: 0, sessao: { contaId: 'marina', papel: 'membro' } })
    expect((await fonte.workspace()).papel).toBe('membro')
    await expect(fonte.removerDoWorkspace('lucas')).rejects.toThrow(/Só Administradores/)
  })
})

describe('Contrato da fonte: identidade e Participação', () => {
  it('quem não participa do Workspace não vê Participantes nem convites e não administra', async () => {
    const armazenamento = armazenamentoEmMemoria()
    await criarFonteSimulada({ atrasoMs: 0, armazenamento }).removerDoWorkspace('thiago')
    const semParticipacao = criarFonteSimulada({ atrasoMs: 0, armazenamento, sessao: { contaId: 'thiago' } })

    const visto = await semParticipacao.participantesDoWorkspace()
    expect(visto).toMatchObject({ papel: null, participantes: [], convites: [] })
    await expect(semParticipacao.convidarParaWorkspace({ email: 'nova@databricks.com', papel: 'membro' })).rejects.toThrow(
      'Você não participa deste Workspace.',
    )
  })

  it('o e-mail de uma Conta de usuário não pode ser o de outra', async () => {
    const fonte = criarFonteSimulada({ atrasoMs: 0 })
    await expect(fonte.salvarPerfil({ nome: 'Marina Alves', email: 'Lucas.Moreira@databricks.com' })).rejects.toThrow(
      'Este e-mail já pertence a outra Conta de usuário.',
    )
  })

  it('o perfil salvo é da Conta de usuário: outra sessão no mesmo armazenamento não o herda', async () => {
    const armazenamento = armazenamentoEmMemoria()
    await criarFonteSimulada({ atrasoMs: 0, armazenamento }).salvarPerfil({ nome: 'Marina A. Costa', email: 'marina.costa@databricks.com' })

    const deLucas = criarFonteSimulada({ atrasoMs: 0, armazenamento, sessao: { contaId: 'lucas' } })
    expect((await deLucas.workspace()).usuario).toMatchObject({ nome: 'Lucas Moreira', email: 'lucas.moreira@databricks.com' })
    const deMarina = criarFonteSimulada({ atrasoMs: 0, armazenamento })
    expect((await deMarina.workspace()).usuario.nome).toBe('Marina A. Costa')
  })

  it('o papel escolhido na preparação não vira estado salvo do Workspace', async () => {
    const armazenamento = armazenamentoEmMemoria()
    await criarFonteSimulada({ atrasoMs: 0, armazenamento }).convidarParaWorkspace({ email: 'julia.prado@databricks.com', papel: 'membro' })
    const comoMembro = criarFonteSimulada({ atrasoMs: 0, armazenamento, sessao: { contaId: 'marina', papel: 'membro' } })
    expect((await comoMembro.workspace()).papel).toBe('administrador')
  })
})

describe('Estado demonstrativo do Workspace', () => {
  it('papéis, remoções, convites e informações persistem depois de a app ser remontada com o mesmo armazenamento', async () => {
    const armazenamento = armazenamentoEmMemoria()
    const primeira = abrirParticipantes({ armazenamento })
    await primeira.usuario.selectOptions(await screen.findByRole('combobox', { name: 'Papel de Lucas Moreira' }), 'Administrador')
    await screen.findByText('Lucas Moreira agora é Administrador neste Workspace.')
    await primeira.fonte.removerDoWorkspace('beatriz')
    await primeira.fonte.convidarParaWorkspace({ email: 'julia.prado@databricks.com', papel: 'membro' })
    await primeira.fonte.salvarInformacoesDoWorkspace({ nome: 'Databricks LATAM', descricao: 'Time comercial da América Latina' })
    primeira.unmount()

    abrirParticipantes({ armazenamento })
    expect(await screen.findByRole('combobox', { name: 'Papel de Lucas Moreira' })).toHaveValue('administrador')
    expect(screen.queryByRole('row', { name: 'Beatriz Santos' })).not.toBeInTheDocument()
    expect(screen.getByRole('listitem', { name: 'julia.prado@databricks.com' })).toBeInTheDocument()
    const informacoes = within(screen.getByRole('region', { name: 'Workspace' }))
    expect(informacoes.getByText('Databricks LATAM')).toBeInTheDocument()
    expect(informacoes.getByText('Time comercial da América Latina')).toBeInTheDocument()
  })

  it('sem armazenamento, cada cenário começa dos dados de exemplo', async () => {
    const primeira = abrirParticipantes()
    await primeira.fonte.removerDoWorkspace('beatriz')
    primeira.unmount()

    abrirParticipantes()
    expect(await screen.findByRole('row', { name: 'Beatriz Santos' })).toBeInTheDocument()
  })
})

describe('Consumidores das pessoas do Workspace', () => {
  it('o perfil salvo em Meu perfil aparece na lista de participantes, sem cópia divergente da Conta de usuário', async () => {
    const { usuario } = renderizarApp('/configuracoes/perfil')
    const nome = await screen.findByRole('textbox', { name: 'Nome' })
    await usuario.clear(nome)
    await usuario.type(nome, 'Marina A. Costa')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    await screen.findByText(/Perfil salvo/)

    await usuario.click(within(screen.getByRole('navigation', { name: 'Seções de Configurações' })).getByRole('link', { name: 'Workspace' }))
    expect(await screen.findByRole('row', { name: 'Marina A. Costa' })).toBeInTheDocument()
  })

  it('Meu perfil mostra as Participações da Conta de usuário, com o papel em cada Workspace', async () => {
    renderizarApp('/configuracoes/perfil', {}, {}, {}, {}, { sessao: { contaId: 'thiago' } })
    const seus = within(await screen.findByRole('region', { name: 'Seus Workspaces' }))
    const atual = within(await seus.findByRole('listitem', { name: 'Databricks' }))
    expect(atual.getByText('Membro')).toBeInTheDocument()
    expect(atual.getByText('Atual')).toBeInTheDocument()
    expect(within(seus.getByRole('listitem', { name: 'Evolut Trading' })).getByText('Membro')).toBeInTheDocument()
  })

  it('um Administrador altera o nome e a descrição do Workspace; a Casca e os Agentes leem da mesma fonte', async () => {
    const { usuario } = abrirParticipantes()
    await usuario.click(await screen.findByRole('button', { name: 'Editar informações' }))
    const formulario = within(screen.getByRole('form', { name: 'Informações do Workspace' }))
    const nome = formulario.getByRole('textbox', { name: 'Nome' })
    await usuario.clear(nome)
    await usuario.type(nome, 'Databricks LATAM')
    const descricao = formulario.getByRole('textbox', { name: 'Descrição' })
    await usuario.clear(descricao)
    await usuario.type(descricao, 'Time comercial da América Latina')
    await usuario.click(formulario.getByRole('button', { name: 'Salvar' }))

    expect(await screen.findByText(/Informações do Workspace salvas/)).toBeInTheDocument()
    const informacoes = within(screen.getByRole('region', { name: 'Workspace' }))
    expect(await informacoes.findByText('Databricks LATAM')).toBeInTheDocument()
    expect(informacoes.getByText('Time comercial da América Latina')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Workspace: Databricks LATAM' }))
    expect(await screen.findByRole('menu')).toHaveTextContent('Time comercial da América Latina')
    await usuario.keyboard('{Escape}')

    await usuario.click(within(screen.getByRole('complementary', { name: 'Navegação' })).getByRole('link', { name: /Agentes/ }))
    await usuario.click((await screen.findAllByRole('link', { name: /Scopus/ }))[0])
    await usuario.click(await screen.findByRole('link', { name: 'Memória' }))
    expect(await screen.findByText(/O que Scopus aprendeu sobre a Databricks LATAM/)).toBeInTheDocument()
  })

  it('o nome do Workspace não fica vazio: nada muda e o erro é anunciado', async () => {
    const { usuario, fonte } = abrirParticipantes()
    await usuario.click(await screen.findByRole('button', { name: 'Editar informações' }))
    const formulario = within(screen.getByRole('form', { name: 'Informações do Workspace' }))
    await usuario.clear(formulario.getByRole('textbox', { name: 'Nome' }))
    await usuario.click(formulario.getByRole('button', { name: 'Salvar' }))

    expect(await formulario.findByRole('alert')).toHaveTextContent('Informe o nome do Workspace.')
    expect((await fonte.participantesDoWorkspace()).informacoes.nome).toBe('Databricks')
  })
})


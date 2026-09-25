import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { criarFonteSimulada, type OpcoesFonteSimulada } from '@/fonte/simulada'
import { armazenamentoEmMemoria } from '@/test/armazenamento'
import { renderizarApp } from '@/test/renderizar'

/** Abre a app numa rota com a identidade (e, se preciso, o papel) escolhida para o cenário. */
function abrir(rota: string, opcoesFonte: OpcoesFonteSimulada = {}) {
  return renderizarApp(rota, {}, {}, {}, {}, opcoesFonte)
}

type Usuario = ReturnType<typeof renderizarApp>['usuario']

async function irPara(usuario: Usuario, secao: string) {
  const abas = screen.getByRole('navigation', { name: 'Seções de Configurações' })
  await usuario.click(within(abas).getByRole('link', { name: secao }))
}

async function irParaONavegacao(usuario: Usuario, item: RegExp) {
  await usuario.click(within(screen.getByRole('navigation', { name: 'Workspace' })).getByRole('link', { name: item }))
}

/** Um indicador de uso do Workspace ("Participantes ativos", "Execuções de Agentes"). */
async function indicador(nome: string) {
  return within(await screen.findByRole('group', { name: nome }))
}

describe('Plano do Workspace', () => {
  it('mostra o plano atual do Workspace, o mesmo para qualquer participante, sem ligá-lo à Conta de usuário', async () => {
    const primeira = abrir('/configuracoes/plano')
    expect(await screen.findByRole('heading', { level: 2, name: 'Plano' })).toBeInTheDocument()
    expect(screen.getByText('Compartilhado com o Workspace')).toBeInTheDocument()
    const doAdministrador = await screen.findByRole('region', { name: 'Plano atual' })
    expect(doAdministrador).toHaveTextContent('Demonstração')
    expect(doAdministrador).toHaveTextContent('Workspace Databricks')
    primeira.unmount()

    // Thiago é Membro aqui e também participa da Evolut Trading: vê o plano deste Workspace, não um plano seu.
    abrir('/configuracoes/plano', { sessao: { contaId: 'thiago' } })
    const doMembro = await screen.findByRole('region', { name: 'Plano atual' })
    expect(doMembro).toHaveTextContent('Demonstração')
    expect(doMembro).toHaveTextContent('Workspace Databricks')
    expect(doMembro).not.toHaveTextContent('Evolut Trading')
  })

  it('conta só os participantes ativos: um convite registrado em Pessoas e acesso fica fora da contagem', async () => {
    const { usuario } = abrir('/configuracoes/plano')
    const antes = await indicador('Participantes ativos')
    expect(await antes.findByText('5')).toBeInTheDocument()
    expect(antes.getByText('1 convite pendente, fora da contagem')).toBeInTheDocument()

    await irPara(usuario, 'Workspace')
    await usuario.click(await screen.findByRole('button', { name: 'Convidar pessoa' }))
    const dialogo = within(await screen.findByRole('dialog', { name: 'Convidar pessoa' }))
    await usuario.type(dialogo.getByRole('textbox', { name: 'E-mail' }), 'julia.prado@databricks.com')
    await usuario.click(dialogo.getByRole('button', { name: 'Registrar convite' }))
    await screen.findByText(/Convite registrado para julia.prado@databricks.com/)

    await irPara(usuario, 'Plano')
    const depois = await indicador('Participantes ativos')
    expect(await depois.findByText('2 convites pendentes, fora da contagem')).toBeInTheDocument()
    expect(depois.getByText('5')).toBeInTheDocument()
  })

  it('a remoção em Pessoas e acesso muda a contagem pela mesma fonte, também depois de recarregar', async () => {
    const armazenamento = armazenamentoEmMemoria()
    const primeira = abrir('/configuracoes/workspace', { armazenamento })
    const thiago = within(await screen.findByRole('row', { name: 'Thiago Ramos' }))
    await primeira.usuario.click(thiago.getByRole('button', { name: 'Remover do Workspace' }))
    const dialogo = within(await screen.findByRole('dialog', { name: 'Remover do Workspace' }))
    await primeira.usuario.click(dialogo.getByRole('button', { name: 'Remover do Workspace' }))
    await screen.findByText(/O acesso de Thiago Ramos ao Workspace Databricks foi encerrado/)

    await irPara(primeira.usuario, 'Plano')
    expect(await (await indicador('Participantes ativos')).findByText('4')).toBeInTheDocument()
    primeira.unmount()

    abrir('/configuracoes/plano', { armazenamento })
    expect(await (await indicador('Participantes ativos')).findByText('4')).toBeInTheDocument()
  })

  it('mostra as Execuções de Agentes no período indicado, por Especialidade', async () => {
    abrir('/configuracoes/plano')
    const uso = within(await screen.findByRole('region', { name: 'Uso do Workspace' }))
    expect(uso.getByText(/Período: 1 a 23 de setembro de 2026/)).toBeInTheDocument()
    expect((await indicador('Execuções de Agentes')).getByText('230')).toBeInTheDocument()

    const porEspecialidade = within(uso.getByRole('table', { name: 'Execuções por Especialidade no período' }))
    for (const linha of ['Scopus 92', 'Ethos 46', 'Rhetor 69', 'Oraculum 23']) {
      expect(porEspecialidade.getByRole('row', { name: linha })).toBeInTheDocument()
    }
  })

  it('uma Execução nova entra no período; decidir Aprovações não conta como Execução', async () => {
    const armazenamento = armazenamentoEmMemoria()
    const { usuario, unmount } = abrir('/configuracoes/memoria', { armazenamento })

    // Pedir a revisão do ICP é uma Conversa com o Scopus: uma Execução dele.
    await usuario.click(await screen.findByRole('button', { name: 'Solicitar revisão ao Scopus' }))
    const dialogo = within(await screen.findByRole('dialog', { name: 'Revisão do ICP' }))
    await usuario.type(dialogo.getByRole('textbox', { name: 'O que deveria mudar?' }), 'Incluir a Colômbia.')
    await usuario.click(dialogo.getByRole('button', { name: 'Enviar ao Scopus' }))
    await dialogo.findByText(/aguardando a decisão de um Administrador/)
    await usuario.keyboard('{Escape}')
    await irPara(usuario, 'Plano')
    expect(await (await indicador('Execuções de Agentes')).findByText('231')).toBeInTheDocument()
    expect(screen.getByRole('row', { name: 'Scopus 93' })).toBeInTheDocument()

    await irParaONavegacao(usuario, /Aprovações/)
    const campanha = within(await screen.findByRole('article', { name: /Subir campanha no Meta Ads/ }))
    await usuario.click(campanha.getByRole('button', { name: 'Aprovar' }))
    expect(await campanha.findByText('Aprovada')).toBeInTheDocument()
    const revisao = within(await screen.findByRole('article', { name: 'Revisar o ICP do Workspace' }))
    await usuario.click(revisao.getByRole('button', { name: 'Aprovar' }))
    expect(await revisao.findByText(/Aprovada por Marina Alves/)).toBeInTheDocument()

    await irParaONavegacao(usuario, /Configurações/)
    await irPara(usuario, 'Plano')
    expect(await (await indicador('Execuções de Agentes')).findByText('231')).toBeInTheDocument()
    expect(screen.getByRole('row', { name: 'Scopus 93' })).toBeInTheDocument()
    expect(screen.getByRole('row', { name: 'Rhetor 69' })).toBeInTheDocument()
    unmount()

    // Depois de recarregar, a revisão continua na fila e a Execução que a propôs continua no período e no Scopus.
    const { fonte } = abrir('/configuracoes/plano', { armazenamento })
    expect(await (await indicador('Execuções de Agentes')).findByText('231')).toBeInTheDocument()
    expect(screen.getByRole('row', { name: 'Scopus 93' })).toBeInTheDocument()
    const semARevisao = await criarFonteSimulada({ atrasoMs: 0 }).agente('scopus')
    expect((await fonte.agente('scopus')).execucoes).toBe(semARevisao.execucoes + 1)
  })

  it('quem não participa do Workspace vê só o plano, sem o uso, como em Pessoas e acesso', async () => {
    const armazenamento = armazenamentoEmMemoria()
    await criarFonteSimulada({ atrasoMs: 0, armazenamento }).removerDoWorkspace('thiago')
    abrir('/configuracoes/plano', { armazenamento, sessao: { contaId: 'thiago' } })

    expect(await screen.findByRole('region', { name: 'Plano atual' })).toHaveTextContent('Demonstração')
    expect(screen.getByText(/Você não participa deste Workspace/)).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Participantes ativos' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Execuções de Agentes' })).not.toBeInTheDocument()
  })

  it('o upgrade aparece como “Em breve”, sem destino, checkout ou preço', async () => {
    const { usuario } = abrir('/configuracoes/plano', { sessao: { contaId: 'lucas' } })
    const plano = within(await screen.findByRole('region', { name: 'Plano atual' }))
    const upgrade = plano.getByRole('button', { name: 'Fazer upgrade' })
    expect(upgrade).toHaveAttribute('aria-disabled', 'true')
    expect(upgrade).toHaveAccessibleDescription(/Em breve/)

    await usuario.click(upgrade)
    expect(screen.getByRole('heading', { level: 2, name: 'Plano' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /upgrade|planos|preços|assinar/i })).not.toBeInTheDocument()

    const secao = screen.getByRole('region', { name: 'Plano' })
    expect(secao).not.toHaveTextContent(/R\$|US\$|por mês|\/mês/)
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import { renderizarApp, renderizarAppNoNavegador } from '@/test/renderizar'

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
})

// Sinais first 10: a /, a barra lateral e o @menção não oferecem mais os quatro Agentes, e as páginas antigas deles
// mostram o que já existia, só para leitura, sem gravar nada.
describe('Agentes retirados da interface', () => {
  it('mantém a Coordenação e remove o catálogo de Agentes da página inicial', async () => {
    const { usuario } = renderizarApp('/')

    expect(await screen.findByRole('form', { name: 'Pedido aos agentes' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Agentes do Workspace' })).not.toBeInTheDocument()
    expect(screen.queryByText('Especialistas')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Novo agente' })).not.toBeInTheDocument()
    expect(screen.queryByText('Especialidades disponíveis')).not.toBeInTheDocument()

    const navegacao = await screen.findByRole('complementary', { name: 'Navegação' })
    for (const item of ['Contas e Contatos', 'Sequências', 'Agentes', 'Sinais', 'Aprovações', 'Conexões']) {
      expect(within(navegacao).getByRole('link', { name: new RegExp(item) })).toBeInTheDocument()
    }
    expect(within(navegacao).queryByText('Especialistas')).not.toBeInTheDocument()

    const composer = screen.getByRole('textbox', { name: 'Peça algo aos agentes' })
    for (const texto of ['@', '@S', '@Sco', '@Eth', '@Rhe', '@Ora']) {
      await usuario.clear(composer)
      await usuario.type(composer, texto)
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    }
  })

  it('não oferece menções na Conversa coordenada', async () => {
    const { usuario } = renderizarApp('/conversa')
    const composer = await screen.findByRole('textbox', { name: 'Peça algo aos agentes' })
    for (const texto of ['@', '@S', '@Sco', '@Eth', '@Rhe', '@Ora']) {
      await usuario.clear(composer)
      await usuario.type(composer, texto)
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    }
  })

  it('expõe todos os Agentes e dados existentes somente para leitura', async () => {
    const inicial = renderizarApp('/')
    const agentes = await inicial.fonte.agentes()
    const escritas = [
      'criarAgente',
      'excluirAgente',
      'editarFato',
      'apagarFato',
      'definirHabilidadeAtiva',
      'criarRotina',
      'editarRotina',
      'definirRotinaPausada',
      'excluirRotina',
      'tentarDeNovo',
      'salvarPersonalizacao',
      'conversar',
    ] as const
    const estadosAntes = []
    const estadosDepois = []
    for (const agente of agentes) {
      cleanup()
      const app = renderizarApp(`/agentes/${agente.id}/conversa`)
      const antes = {
        id: agente.id,
        memoria: await app.fonte.memoria(agente.id),
        habilidades: await app.fonte.habilidades(agente.id),
        rotinas: await app.fonte.rotinas(agente.id),
        atividade: await app.fonte.atividade(agente.id),
      }
      estadosAntes.push(antes)
      const espias = escritas
        .filter((nome) => typeof app.fonte[nome] === 'function')
        .map((nome) => vi.spyOn(app.fonte, nome as never))
      const abas = await screen.findByRole('navigation', { name: 'Seções do agente' })
      for (const secao of ['Conversa', 'Memória', 'Habilidades', 'Rotinas', 'Atividade']) {
        await app.usuario.click(within(abas).getByRole('link', { name: secao }))
        expect(await screen.findByText(/só para leitura/i)).toBeInTheDocument()
        expect(abas).toHaveTextContent(
          'ConversaMemóriaHabilidadesRotinasAtividade',
        )
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
        for (const nome of ['Enviar', 'Nova conversa', 'Nova rotina', 'Editar', 'Apagar', 'Pausar', 'Retomar', 'Excluir', 'Tentar de novo']) {
          expect(screen.queryByRole('button', { name: new RegExp(`^${nome}$`, 'i') })).not.toBeInTheDocument()
        }
        if (secao === 'Memória' && antes.memoria[0]) expect(screen.getByText(antes.memoria[0].texto)).toBeInTheDocument()
        if (secao === 'Habilidades' && antes.habilidades[0]) {
          expect(screen.getByText(antes.habilidades[0].nome)).toBeInTheDocument()
          // O Switch do base-ui é um span: desligado, ele diz aria-disabled.
          expect(screen.getByRole('switch', { name: new RegExp(antes.habilidades[0].nome) })).toHaveAttribute('aria-disabled', 'true')
        }
        if (secao === 'Rotinas' && antes.rotinas[0]) expect(screen.getByText(antes.rotinas[0].tarefa)).toBeInTheDocument()
        if (secao === 'Atividade' && antes.atividade[0]) expect(screen.getByText(antes.atividade[0].descricao)).toBeInTheDocument()
      }
      estadosDepois.push({
        id: agente.id,
        memoria: await app.fonte.memoria(agente.id),
        habilidades: await app.fonte.habilidades(agente.id),
        rotinas: await app.fonte.rotinas(agente.id),
        atividade: await app.fonte.atividade(agente.id),
      })
      for (const espia of espias) expect(espia).not.toHaveBeenCalled()
    }
    expect(estadosDepois).toEqual(estadosAntes)
    // Nenhum Agente some nem muda: o dado de antes continua lá.
    expect(await inicial.fonte.agentes()).toEqual(agentes)

    for (const agente of agentes) {
      for (const secao of ['configuracao', 'canais']) {
        cleanup()
        renderizarAppNoNavegador(`/agentes/${agente.id}/${secao}`)
        await screen.findByText(/só para leitura/i)
        expect(window.location.pathname).toBe(`/agentes/${agente.id}/conversa`)
      }
    }
  })
})

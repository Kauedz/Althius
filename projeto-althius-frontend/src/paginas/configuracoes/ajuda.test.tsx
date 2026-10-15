import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { observarRastros } from '@/test/rastros'
import { renderizarApp } from '@/test/renderizar'

type Usuario = ReturnType<typeof renderizarApp>['usuario']

async function irPara(usuario: Usuario, secao: string) {
  const abas = await screen.findByRole('navigation', { name: 'Seções de Configurações' })
  await usuario.click(within(abas).getByRole('link', { name: secao }))
}

describe('Documentação da Ajuda', () => {
  it('abre pela aba Ajuda e informações na primeira página, com grupos, "Atualizado em" e notas', async () => {
    const { usuario } = renderizarApp('/configuracoes/perfil')
    await irPara(usuario, 'Ajuda e informações')

    expect(await screen.findByRole('heading', { level: 2, name: 'Ajuda e informações' })).toBeInTheDocument()
    const pagina = await screen.findByRole('article', { name: 'Começar' })
    expect(within(pagina).getByText('Atualizado em 14/10/2026')).toBeInTheDocument()
    expect(within(pagina).getAllByRole('note').length).toBeGreaterThan(0)
    const paginas = within(screen.getByRole('navigation', { name: 'Páginas de Ajuda e informações' }))
    for (const titulo of ['Créditos e Automação', 'Sinais', 'Descoberta', 'Contas e Comitê', 'Sequências', 'Agentes', 'Contexto do Workspace', 'Conexões']) {
      expect(paginas.getByRole('link', { name: titulo })).toBeInTheDocument()
    }
    expect(screen.queryByText(/CRM/)).not.toBeInTheDocument()
  })

  it('"Nesta página" lista as âncoras dos títulos e leva o foco até a seção', async () => {
    const { usuario } = renderizarApp('/configuracoes/ajuda/creditos')
    const indice = within(await screen.findByRole('navigation', { name: 'Seções de Créditos e Automação' }))
    const link = indice.getByRole('link', { name: 'Renovação mensal' })
    expect(link).toHaveAttribute('href', '#renovacao-mensal')
    await usuario.click(link)
    expect(screen.getByRole('heading', { level: 4, name: 'Renovação mensal' })).toHaveFocus()
  })

  it('a busca (Ctrl+K) acha o termo nos títulos e no texto, com destaque, e abre a página', async () => {
    const { usuario } = renderizarApp('/configuracoes/ajuda/comecar')
    await screen.findByRole('article', { name: 'Começar' })
    await usuario.keyboard('{Control>}k{/Control}')
    const busca = screen.getByRole('searchbox', { name: 'Buscar na Ajuda' })
    expect(busca).toHaveFocus()
    await usuario.type(busca, 'aquecimento')
    const resultados = within(screen.getByRole('list', { name: 'Resultados da busca' }))
    const primeiro = resultados.getAllByRole('link')[0]
    expect(primeiro).toHaveTextContent('Sequências')
    expect(primeiro.querySelector('mark')).toHaveTextContent('aquecimento')
    await usuario.click(primeiro)
    expect(await screen.findByRole('article', { name: 'Sequências' })).toBeInTheDocument()
  })

  it('a rota antiga da Central de ajuda leva à página equivalente', async () => {
    renderizarApp('/configuracoes/ajuda/central')
    expect(await screen.findByRole('article', { name: 'Começar' })).toBeInTheDocument()
  })
})

describe('Páginas de Ajuda e informações', () => {
  it('abre cada página pelas abas e volta às outras seções de Configurações', async () => {
    const { usuario } = renderizarApp('/configuracoes/ajuda')
    const paginas = within(await screen.findByRole('navigation', { name: 'Páginas de Ajuda e informações' }))

    await usuario.click(paginas.getByRole('link', { name: 'Enviar feedback' }))
    expect(await screen.findByRole('form', { name: 'Feedback' })).toBeInTheDocument()
    // Abrir o formulário não tira o foco da aba: quem navega por teclado continua de onde estava.
    expect(paginas.getByRole('link', { name: 'Enviar feedback' })).toHaveFocus()
    await usuario.click(paginas.getByRole('link', { name: 'Termos de serviço' }))
    expect(await screen.findByRole('heading', { level: 3, name: 'Termos de serviço' })).toBeInTheDocument()
    await usuario.click(paginas.getByRole('link', { name: 'Política de privacidade' }))
    expect(await screen.findByRole('heading', { level: 3, name: 'Política de privacidade' })).toBeInTheDocument()
    await usuario.click(paginas.getByRole('link', { name: 'Começar' }))
    expect(await screen.findByRole('article', { name: 'Começar' })).toBeInTheDocument()

    await irPara(usuario, 'Meu perfil')
    expect(await screen.findByRole('heading', { level: 2, name: 'Meu perfil' })).toBeInTheDocument()
  })

  it('um endereço de página que não existe leva à primeira página, em vez de uma página quebrada', async () => {
    renderizarApp('/configuracoes/ajuda/manual')
    expect(await screen.findByRole('article', { name: 'Começar' })).toBeInTheDocument()
  })
})

describe('Enviar feedback', () => {
  it('recusa uma mensagem vazia ou só com espaços, indicando o campo e levando o foco até ele', async () => {
    const { usuario } = renderizarApp('/configuracoes/ajuda/feedback')
    const formulario = within(await screen.findByRole('form', { name: 'Feedback' }))
    await usuario.type(formulario.getByRole('textbox', { name: 'Mensagem' }), '   ')
    await usuario.click(formulario.getByRole('button', { name: 'Enviar feedback' }))

    const mensagem = formulario.getByRole('textbox', { name: 'Mensagem' })
    expect(mensagem).toBeInvalid()
    expect(mensagem).toHaveAccessibleDescription('Escreva seu feedback antes de enviar.')
    expect(mensagem).toHaveFocus()
    expect(screen.queryByText(/Obrigado/)).not.toBeInTheDocument()

    // O erro sai assim que a pessoa volta a escrever.
    await usuario.type(mensagem, 'Faltou um atalho')
    expect(mensagem).toBeValid()
  })

  it('conclui com uma confirmação demonstrativa, sem enviar nem guardar o que foi escrito', async () => {
    const observados = observarRastros()
    try {
      const { usuario } = renderizarApp('/configuracoes/ajuda/feedback', {}, {}, {}, {}, {
        armazenamento: observados.armazenamento,
      })
      const formulario = within(await screen.findByRole('form', { name: 'Feedback' }))
      await usuario.click(formulario.getByRole('radio', { name: 'Problema' }))
      await usuario.type(formulario.getByRole('textbox', { name: 'Mensagem' }), 'A fila de Aprovações demora a abrir')
      await usuario.click(formulario.getByRole('button', { name: 'Enviar feedback' }))

      const confirmacao = within(screen.getByRole('region', { name: 'Enviar feedback' })).getByRole('status')
      expect(confirmacao).toHaveTextContent(/Demonstração: seu feedback não foi enviado a ninguém nem guardado/)
      expect(confirmacao).not.toHaveTextContent(/equipe|recebemos|enviado com sucesso/i)
      expect(screen.queryByRole('form', { name: 'Feedback' })).not.toBeInTheDocument()
      const outro = screen.getByRole('button', { name: 'Enviar outro' })
      expect(outro).toHaveFocus()

      for (const rastro of observados.rastros()) expect(rastro).not.toContain('demora a abrir')
      expect(observados.envio).not.toHaveBeenCalled()

      // Um novo feedback começa do zero.
      await usuario.click(outro)
      const novo = within(screen.getByRole('form', { name: 'Feedback' }))
      expect(novo.getByRole('textbox', { name: 'Mensagem' })).toHaveValue('')
      expect(novo.getByRole('textbox', { name: 'Mensagem' })).toHaveFocus()
      expect(novo.getByRole('radio', { name: 'Sugestão' })).toBeChecked()
      expect(within(screen.getByRole('region', { name: 'Enviar feedback' })).getByRole('status')).toBeEmptyDOMElement()
    } finally {
      observados.restaurar()
    }
  })

  it('cancelar descarta o tipo, a mensagem e o erro, sem confirmar nada', async () => {
    const { usuario } = renderizarApp('/configuracoes/ajuda/feedback')
    const formulario = within(await screen.findByRole('form', { name: 'Feedback' }))
    expect(formulario.getByRole('button', { name: 'Cancelar' })).toBeDisabled()

    await usuario.click(formulario.getByRole('radio', { name: 'Elogio' }))
    await usuario.click(formulario.getByRole('button', { name: 'Enviar feedback' }))
    expect(formulario.getByRole('textbox', { name: 'Mensagem' })).toBeInvalid()
    await usuario.type(formulario.getByRole('textbox', { name: 'Mensagem' }), 'Rascunho que desisti de mandar')
    await usuario.click(formulario.getByRole('button', { name: 'Cancelar' }))

    const mensagem = formulario.getByRole('textbox', { name: 'Mensagem' })
    expect(mensagem).toHaveValue('')
    expect(mensagem).toBeValid()
    expect(mensagem).toHaveFocus()
    expect(formulario.getByRole('radio', { name: 'Sugestão' })).toBeChecked()
    expect(formulario.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
    expect(screen.queryByText(/Obrigado/)).not.toBeInTheDocument()
  })
})

describe('Termos de serviço e Política de privacidade', () => {
  it.each([
    ['termos', 'Termos de serviço', ['Aceitação dos termos', 'Uso aceitável', 'Encerramento'], 'Encerramento'],
    ['privacidade', 'Política de privacidade', ['Quem somos', 'Dados tratados', 'Direitos do titular'], 'Retenção'],
  ])('%s: seções com texto provisório identificado e um índice que leva até cada uma', async (pagina, titulo, secoes, destino) => {
    const { usuario } = renderizarApp(`/configuracoes/ajuda/${pagina}`)
    const documento = await screen.findByRole('article', { name: titulo })

    expect(within(documento).getByRole('note')).toHaveTextContent(/Conteúdo provisório.*Nada abaixo descreve práticas reais/)
    expect(within(documento).getByText('Versão provisória · sem data de vigência')).toBeInTheDocument()
    for (const secao of secoes) {
      expect(within(documento).getByRole('region', { name: secao })).toHaveTextContent('[Texto provisório]')
    }

    const indice = within(screen.getByRole('navigation', { name: `Seções de ${titulo}` }))
    await usuario.click(indice.getByRole('link', { name: destino }))
    expect(within(documento).getByRole('heading', { level: 4, name: destino })).toHaveFocus()
  })
})

describe('Links de Ajuda e informações', () => {
  it('nenhuma página tem link quebrado nem depende de serviço externo', async () => {
    const envio = vi.spyOn(globalThis, 'fetch')
    try {
      const { usuario } = renderizarApp('/configuracoes/ajuda/central')
      for (const pagina of ['Começar', 'Créditos e Automação', 'Sequências', 'Enviar feedback', 'Termos de serviço', 'Política de privacidade']) {
        const paginas = within(await screen.findByRole('navigation', { name: 'Páginas de Ajuda e informações' }))
        await usuario.click(paginas.getByRole('link', { name: pagina }))
        const secao = await screen.findByRole('region', { name: 'Ajuda e informações' })

        for (const link of within(secao).getAllByRole('link')) {
          const destino = link.getAttribute('href') ?? ''
          if (destino.startsWith('#')) {
            expect(document.getElementById(destino.slice(1)), destino).not.toBeNull()
          } else {
            expect(destino, link.textContent ?? '').toMatch(/^\/configuracoes\/ajuda\/(comecar|creditos|sinais|descoberta|contas-e-comite|sequencias|agentes|contexto|conexoes|feedback|termos|privacidade)$/)
          }
        }
      }
      expect(envio).not.toHaveBeenCalled()
    } finally {
      envio.mockRestore()
    }
  })
})

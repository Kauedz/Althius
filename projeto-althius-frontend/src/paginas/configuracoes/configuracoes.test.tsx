import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ArmazenamentoDoPerfil } from '@/fonte/simulada'
import { renderizarApp } from '@/test/renderizar'

function memoria(): ArmazenamentoDoPerfil {
  const dados = new Map<string, string>()
  return {
    getItem: (chave) => dados.get(chave) ?? null,
    setItem: (chave, valor) => {
      dados.set(chave, valor)
    },
  }
}

function arquivoDeImagem(nome = 'foto.png') {
  return new File(['conteudo'], nome, { type: 'image/png' })
}

describe('Navegação até Configurações', () => {
  it('o item Configurações abre Meu perfil, e o menu pessoal também leva até lá', async () => {
    const { usuario } = renderizarApp('/')
    const workspace = within(screen.getByRole('navigation', { name: 'Workspace' }))
    await usuario.click(workspace.getByRole('link', { name: 'Configurações' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Configurações' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Meu perfil' })).toBeInTheDocument()

    await usuario.click(screen.getByRole('link', { name: 'Agentes' }))
    await screen.findByRole('heading', { level: 1, name: 'Agentes' })
    await usuario.click(screen.getByRole('button', { name: /Menu do usuário/ }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Meu perfil' }))
    expect(await screen.findByRole('heading', { level: 2, name: 'Meu perfil' })).toBeInTheDocument()
  })

  it('lista as seções aprovadas no mockup, com as não implementadas mostrando que ainda não funcionam', async () => {
    const { usuario } = renderizarApp('/configuracoes/perfil')
    const abas = await screen.findByRole('navigation', { name: 'Seções de Configurações' })
    for (const rotulo of ['Meu perfil', 'Preferências', 'Workspace', 'Memória do Workspace', 'Plano', 'Ajuda e informações']) {
      expect(within(abas).getByRole('link', { name: rotulo })).toBeInTheDocument()
    }
    await usuario.click(within(abas).getByRole('link', { name: 'Plano' }))
    expect(await screen.findByText(/ainda não foi implementada nesta demonstração/)).toBeInTheDocument()
  })
})

describe('Meu perfil', () => {
  it('mostra nome, e-mail e iniciais da mesma fonte usada no menu pessoal', async () => {
    renderizarApp('/configuracoes/perfil')
    expect(await screen.findByRole('textbox', { name: 'Nome' })).toHaveValue('Marina Alves')
    expect(screen.getByRole('textbox', { name: 'E-mail' })).toHaveValue('marina.alves@databricks.com')
    expect(screen.getAllByRole('img', { name: 'Marina Alves' }).length).toBeGreaterThan(0)
  })

  it('salva nome, e-mail e foto, refletindo no menu pessoal da Casca', async () => {
    const { usuario } = renderizarApp('/configuracoes/perfil')
    const nome = await screen.findByRole('textbox', { name: 'Nome' })
    const email = screen.getByRole('textbox', { name: 'E-mail' })
    const salvar = screen.getByRole('button', { name: 'Salvar' })
    expect(salvar).toBeDisabled()

    await usuario.clear(nome)
    await usuario.type(nome, 'Marina A. Costa')
    await usuario.clear(email)
    await usuario.type(email, 'marina.costa@databricks.com')
    await usuario.upload(screen.getByLabelText('Arquivo da foto'), arquivoDeImagem())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Trocar foto' })).toBeInTheDocument())

    expect(salvar).toBeEnabled()
    await usuario.click(salvar)
    expect(await screen.findByText(/Perfil salvo/)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Nome' })).toHaveValue('Marina A. Costa')

    // A Casca lê da mesma fonte; ela recarrega de forma assíncrona depois do aviso de mudança.
    expect(await screen.findByRole('button', { name: 'Menu do usuário: Marina A. Costa' })).toBeInTheDocument()
    expect(within(screen.getByRole('complementary', { name: 'Navegação' })).getByText('Marina A. Costa')).toBeInTheDocument()
  })

  it('adiciona uma foto e depois a remove, voltando a mostrar as iniciais', async () => {
    const { usuario } = renderizarApp('/configuracoes/perfil')
    await usuario.upload(await screen.findByLabelText('Arquivo da foto'), arquivoDeImagem())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Trocar foto' })).toBeInTheDocument())

    await usuario.click(screen.getByRole('button', { name: 'Remover foto' }))
    expect(screen.getByRole('button', { name: 'Adicionar foto' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Trocar foto' })).not.toBeInTheDocument()
  })

  it('recusa um arquivo que não é imagem, sem alterar a foto salva', async () => {
    renderizarApp('/configuracoes/perfil')
    const arquivo = await screen.findByLabelText('Arquivo da foto')
    // O seletor do sistema ainda deixa escolher "Todos os arquivos", apesar do accept do input.
    await userEvent
      .setup({ applyAccept: false })
      .upload(arquivo, new File(['x'], 'documento.pdf', { type: 'application/pdf' }))
    expect(await screen.findByText(/Escolha um arquivo de imagem/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adicionar foto' })).toBeInTheDocument()
  })

  it('valida nome vazio e formato de e-mail sem alterar os dados salvos', async () => {
    const { usuario } = renderizarApp('/configuracoes/perfil')
    const nome = await screen.findByRole('textbox', { name: 'Nome' })
    const email = screen.getByRole('textbox', { name: 'E-mail' })
    await usuario.clear(nome)
    await usuario.clear(email)
    await usuario.type(email, 'não é um e-mail')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(await screen.findByText('Informe seu nome.')).toBeInTheDocument()
    expect(screen.getByText(/Informe um e-mail em formato válido/)).toBeInTheDocument()
    expect(screen.queryByText(/Perfil salvo/)).not.toBeInTheDocument()

    // Nada foi persistido: reabrir a seção mostra os dados anteriores.
    await usuario.click(screen.getByRole('link', { name: 'Preferências' }))
    await usuario.click(screen.getByRole('link', { name: 'Meu perfil' }))
    expect(await screen.findByRole('textbox', { name: 'Nome' })).toHaveValue('Marina Alves')
  })

  it('cancelar descarta as alterações não salvas', async () => {
    const { usuario } = renderizarApp('/configuracoes/perfil')
    const nome = await screen.findByRole('textbox', { name: 'Nome' })
    await usuario.clear(nome)
    await usuario.type(nome, 'Outro nome')
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(nome).toHaveValue('Marina Alves')
  })

  it('o perfil salvo persiste depois de a app ser remontada, quando há armazenamento', async () => {
    const armazenamento = memoria()
    const primeira = renderizarApp('/configuracoes/perfil', {}, {}, {}, {}, { armazenamento })
    const nome = await screen.findByRole('textbox', { name: 'Nome' })
    await primeira.usuario.clear(nome)
    await primeira.usuario.type(nome, 'Marina Persistida')
    await primeira.usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    await screen.findByText(/Perfil salvo/)
    primeira.unmount()

    renderizarApp('/configuracoes/perfil', {}, {}, {}, {}, { armazenamento })
    expect(await screen.findByRole('textbox', { name: 'Nome' })).toHaveValue('Marina Persistida')
  })
})

describe('Preferências', () => {
  it('troca o tema pela seção de Preferências, e a Casca acompanha', async () => {
    const { usuario } = renderizarApp('/configuracoes/preferencias')
    expect(document.documentElement.dataset.theme).toBe('escuro')
    await usuario.click(await screen.findByRole('radio', { name: 'Claro' }))
    expect(document.documentElement.dataset.theme).toBe('claro')
    expect(within(screen.getByRole('complementary', { name: 'Navegação' })).getByText('Tema claro')).toBeInTheDocument()
  })

  it('escolher a opção já marcada mantém o tema, em vez de alternar', async () => {
    const { usuario } = renderizarApp('/configuracoes/preferencias')
    const escuro = await screen.findByRole('radio', { name: 'Escuro' })
    expect(escuro).toBeChecked()
    await usuario.click(escuro)
    expect(document.documentElement.dataset.theme).toBe('escuro')
    await usuario.click(screen.getByRole('radio', { name: 'Claro' }))
    await usuario.click(screen.getByRole('radio', { name: 'Escuro' }))
    expect(document.documentElement.dataset.theme).toBe('escuro')
    expect(screen.getByRole('radio', { name: 'Escuro' })).toBeChecked()
  })
})

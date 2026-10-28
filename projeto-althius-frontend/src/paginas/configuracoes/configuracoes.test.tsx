import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { armazenamentoEmMemoria } from '@/test/armazenamento'
import { observarRastros } from '@/test/rastros'
import { renderizarApp } from '@/test/renderizar'

function arquivoDeImagem(nome = 'foto.png') {
  return new File(['conteudo'], nome, { type: 'image/png' })
}

describe('Navegação até Configurações', () => {
  it('o item Configurações abre Meu perfil, e o menu pessoal também leva até lá', async () => {
    const { usuario } = renderizarApp('/conversa')
    const workspace = within(screen.getByRole('navigation', { name: 'Workspace' }))
    await usuario.click(workspace.getByRole('link', { name: 'Configurações' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Configurações' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Meu perfil' })).toBeInTheDocument()

    await usuario.click(screen.getByRole('link', { name: 'Agentes' }))
    await screen.findByRole('heading', { level: 1, name: 'Agente' })
    await usuario.click(screen.getByRole('button', { name: /Menu do usuário/ }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Meu perfil' }))
    expect(await screen.findByRole('heading', { level: 2, name: 'Meu perfil' })).toBeInTheDocument()
  })

  it('abre cada uma das seis seções aprovadas no mockup pelas abas', async () => {
    const { usuario } = renderizarApp('/configuracoes/perfil')
    const abas = await screen.findByRole('navigation', { name: 'Seções de Configurações' })
    for (const [rotulo, titulo] of [
      ['Preferências', 'Preferências'],
      ['Workspace', 'Pessoas e acesso'],
      ['Memória do Workspace', 'Memória do Workspace'],
      ['Plano', 'Plano'],
      ['Ajuda e informações', 'Ajuda e informações'],
      ['Meu perfil', 'Meu perfil'],
    ]) {
      await usuario.click(within(abas).getByRole('link', { name: rotulo }))
      expect(await screen.findByRole('heading', { level: 2, name: titulo })).toBeInTheDocument()
    }
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
    const armazenamento = armazenamentoEmMemoria()
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

describe('Alteração de senha (demonstrativa)', () => {
  const CAMPOS_DE_SENHA = ['Senha atual', 'Nova senha', 'Confirmar nova senha']

  async function abrirFormularioDeSenha(usuario: ReturnType<typeof renderizarApp>['usuario']) {
    await usuario.click(await screen.findByRole('button', { name: 'Alterar senha' }))
    return within(screen.getByRole('form', { name: 'Alterar senha' }))
  }

  it('abre com senha atual, nova senha e confirmação mascaradas e vazias', async () => {
    const { usuario } = renderizarApp('/configuracoes/perfil')
    const formulario = await abrirFormularioDeSenha(usuario)
    for (const campo of CAMPOS_DE_SENHA) {
      expect(formulario.getByLabelText(campo)).toHaveAttribute('type', 'password')
      expect(formulario.getByLabelText(campo)).toHaveValue('')
    }
    expect(formulario.getByLabelText('Senha atual')).toHaveFocus()
  })

  it('exige os três campos antes de concluir, levando o foco ao primeiro com erro', async () => {
    const { usuario } = renderizarApp('/configuracoes/perfil')
    const formulario = await abrirFormularioDeSenha(usuario)
    await usuario.type(formulario.getByLabelText('Senha atual'), 'antiga-123')
    await usuario.click(formulario.getByRole('button', { name: 'Alterar senha' }))

    expect(formulario.getByLabelText('Nova senha')).toHaveAccessibleDescription('Informe a nova senha.')
    expect(formulario.getByLabelText('Nova senha')).toBeInvalid()
    expect(formulario.getByLabelText('Confirmar nova senha')).toHaveAccessibleDescription('Repita a nova senha.')
    expect(formulario.getByLabelText('Senha atual')).toBeValid()
    expect(formulario.getByLabelText('Nova senha')).toHaveFocus()
    expect(screen.queryByText(/Demonstração: nenhuma senha foi alterada/)).not.toBeInTheDocument()
  })

  it('recusa uma confirmação diferente da nova senha', async () => {
    const { usuario } = renderizarApp('/configuracoes/perfil')
    const formulario = await abrirFormularioDeSenha(usuario)
    await usuario.type(formulario.getByLabelText('Senha atual'), 'antiga-123')
    await usuario.type(formulario.getByLabelText('Nova senha'), 'nova-senha-1')
    await usuario.type(formulario.getByLabelText('Confirmar nova senha'), 'outra-coisa')
    await usuario.click(formulario.getByRole('button', { name: 'Alterar senha' }))

    const confirmacao = formulario.getByLabelText('Confirmar nova senha')
    expect(confirmacao).toHaveAccessibleDescription('A confirmação não é igual à nova senha.')
    expect(confirmacao).toHaveFocus()
    expect(screen.queryByText(/Demonstração: nenhuma senha foi alterada/)).not.toBeInTheDocument()
  })

  it('concluir limpa os campos e avisa que é demonstração, sem alegar troca nem conferência da senha', async () => {
    const { usuario } = renderizarApp('/configuracoes/perfil')
    let formulario = await abrirFormularioDeSenha(usuario)
    await usuario.type(formulario.getByLabelText('Senha atual'), 'antiga-123')
    await usuario.type(formulario.getByLabelText('Nova senha'), 'nova-senha-1')
    await usuario.type(formulario.getByLabelText('Confirmar nova senha'), 'nova-senha-1')
    await usuario.click(formulario.getByRole('button', { name: 'Alterar senha' }))

    const aviso = within(screen.getByRole('region', { name: 'Senha' })).getByRole('status')
    expect(aviso).toHaveTextContent(/Demonstração: nenhuma senha foi alterada/)
    expect(aviso).toHaveTextContent(/senha atual não foi conferida/)
    expect(screen.queryByText(/senha (foi )?alterada com sucesso/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Alterar senha' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Alterar senha' })).toHaveFocus()

    formulario = await abrirFormularioDeSenha(usuario)
    for (const campo of CAMPOS_DE_SENHA) expect(formulario.getByLabelText(campo)).toHaveValue('')
    expect(screen.queryByText(/Demonstração: nenhuma senha foi alterada/)).not.toBeInTheDocument()
  })

  it('cancelar limpa os campos e não altera nenhum dado do perfil', async () => {
    const { usuario } = renderizarApp('/configuracoes/perfil')
    let formulario = await abrirFormularioDeSenha(usuario)
    await usuario.type(formulario.getByLabelText('Senha atual'), 'antiga-123')
    await usuario.type(formulario.getByLabelText('Nova senha'), 'nova-senha-1')
    await usuario.click(formulario.getByRole('button', { name: 'Alterar senha' }))
    await usuario.click(formulario.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('form', { name: 'Alterar senha' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Alterar senha' })).toHaveFocus()
    expect(screen.queryByText(/Demonstração: nenhuma senha foi alterada/)).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Nome' })).toHaveValue('Marina Alves')
    expect(screen.getByRole('textbox', { name: 'E-mail' })).toHaveValue('marina.alves@databricks.com')
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()

    formulario = await abrirFormularioDeSenha(usuario)
    for (const campo of CAMPOS_DE_SENHA) {
      expect(formulario.getByLabelText(campo)).toHaveValue('')
      expect(formulario.getByLabelText(campo)).toBeValid()
    }
  })

  it('não guarda nem registra as senhas digitadas na persistência usada pela experiência', async () => {
    const observados = observarRastros()
    try {
      const { usuario } = renderizarApp('/configuracoes/perfil', {}, {}, {}, {}, { armazenamento: observados.armazenamento })

      const formulario = await abrirFormularioDeSenha(usuario)
      await usuario.type(formulario.getByLabelText('Senha atual'), 'Atual-Secreta-1')
      await usuario.type(formulario.getByLabelText('Nova senha'), 'Nova-Secreta-2')
      await usuario.type(formulario.getByLabelText('Confirmar nova senha'), 'Nova-Secreta-2')
      await usuario.click(formulario.getByRole('button', { name: 'Alterar senha' }))
      await screen.findByText(/Demonstração: nenhuma senha foi alterada/)

      // Salvar o perfil depois garante que a persistência foi de fato usada na mesma sessão.
      const nome = screen.getByRole('textbox', { name: 'Nome' })
      await usuario.clear(nome)
      await usuario.type(nome, 'Marina Depois da Senha')
      await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
      await screen.findByText(/Perfil salvo/)
      expect(observados.gravacoes.some((g) => g.includes('Marina Depois da Senha'))).toBe(true)

      for (const rastro of observados.rastros()) expect(rastro).not.toContain('Secreta')
      expect(observados.envio).not.toHaveBeenCalled()
    } finally {
      observados.restaurar()
    }
  })
})

describe('Preferências', () => {
  it('troca o tema pela seção de Preferências, e a Casca acompanha', async () => {
    const { usuario } = renderizarApp('/configuracoes/preferencias')
    expect(document.documentElement.dataset.theme).toBe('claro')
    await usuario.click(await screen.findByRole('radio', { name: 'Escuro' }))
    expect(document.documentElement.dataset.theme).toBe('escuro')
    expect(within(screen.getByRole('complementary', { name: 'Navegação' })).getByText('Tema escuro')).toBeInTheDocument()
  })

  it('escolher a opção já marcada mantém o tema, em vez de alternar', async () => {
    const { usuario } = renderizarApp('/configuracoes/preferencias')
    const claro = await screen.findByRole('radio', { name: 'Claro' })
    expect(claro).toBeChecked()
    await usuario.click(claro)
    expect(document.documentElement.dataset.theme).toBe('claro')
    await usuario.click(screen.getByRole('radio', { name: 'Escuro' }))
    await usuario.click(screen.getByRole('radio', { name: 'Claro' }))
    expect(document.documentElement.dataset.theme).toBe('claro')
    expect(screen.getByRole('radio', { name: 'Claro' })).toBeChecked()
  })
})

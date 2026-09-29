import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Contato, EdicaoDoContato, FonteDeContas } from '@/fonte/contas-tipos'
import { renderizarApp, renderizarAppCom } from '@/test/renderizar'

const CLARA_ANTES = { email: 'clara@anthropic.com', linkedin: 'https://www.linkedin.com/in/clara-dupont' }

interface Opcoes {
  podeEditar?: boolean
  podeArquivar?: boolean
  /** O que a edição faz; sem ela, o Contato só recebe os campos. */
  editarContato?: (contatoId: string, campos: EdicaoDoContato) => Promise<void>
  comFoto?: boolean
}

/**
 * Os Contatos da demo com o que a fonte operacional acrescenta (as permissões e os dados de contato da Clara) e a edição
 * que grava na própria lista e avisa quem observa, como a fonte real faz depois do banco.
 */
function comEdicao({ podeEditar = true, podeArquivar = false, editarContato, comFoto = false }: Opcoes = {}) {
  return (base: FonteDeContas): FonteDeContas => {
    const ouvintes = new Set<() => void>()
    let atuais: Contato[] | null = null
    const todos = async () =>
      (atuais ??= (await base.contatos()).map((contato) => ({
        ...contato,
        ...(contato.nome === 'Clara Dupont' ? CLARA_ANTES : {}),
        ...(podeEditar ? { podeEditar: true } : {}),
        ...(podeArquivar ? { podeArquivar: true } : {}),
      })))
    return {
      ...base,
      observar: (ouvinte) => {
        ouvintes.add(ouvinte)
        return () => ouvintes.delete(ouvinte)
      },
      contatos: todos,
      contatosDaConta: async (contaId) => (await todos()).filter((c) => c.contaId === contaId),
      arquivarContato: vi.fn(),
      ...(comFoto ? { consultarFotoDoContato: vi.fn(async () => {}) } : {}),
      async editarContato(contatoId, campos) {
        await editarContato?.(contatoId, campos)
        const lista = await todos()
        const indice = lista.findIndex((c) => c.id === contatoId)
        const opcional = (valor?: string) => valor?.trim() || undefined
        const atualizado: Contato = {
          ...lista[indice],
          cargo: undefined,
          email: undefined,
          whatsapp: undefined,
          linkedin: undefined,
          nome: campos.nome.trim(),
          ...(opcional(campos.cargo) ? { cargo: opcional(campos.cargo) } : {}),
          ...(opcional(campos.email) ? { email: opcional(campos.email) } : {}),
          ...(opcional(campos.whatsapp) ? { whatsapp: opcional(campos.whatsapp) } : {}),
          ...(opcional(campos.linkedin) ? { linkedin: opcional(campos.linkedin) } : {}),
          canais: { email: !!opcional(campos.email), telefone: !!opcional(campos.whatsapp), linkedin: !!opcional(campos.linkedin) },
        }
        lista[indice] = atualizado
        for (const ouvinte of ouvintes) ouvinte()
        return atualizado
      },
    }
  }
}

const dialogoDeEdicao = () => screen.getByRole('dialog', { name: 'Editar Clara Dupont' })
const campo = (nome: string) => within(dialogoDeEdicao()).getByRole('textbox', { name: nome })

describe('Editar um Contato', () => {
  it('a Demonstração não oferece editar, nem na tabela de Contatos nem no detalhe da Conta', async () => {
    renderizarApp('/contatos')
    await screen.findByRole('table', { name: 'Tabela de Contatos' })
    expect(screen.queryByRole('button', { name: /^Editar / })).not.toBeInTheDocument()
  })

  it('a Demonstração não oferece editar no detalhe da Conta', async () => {
    renderizarApp('/contas/anthropic')
    await screen.findByRole('table', { name: 'Contatos da Conta-alvo' })
    expect(screen.queryByRole('button', { name: /^Editar / })).not.toBeInTheDocument()
  })

  it('abre com os valores de agora, na tabela de Contatos', async () => {
    const { usuario } = renderizarAppCom('/contatos', { contas: comEdicao() })

    await usuario.click(await screen.findByRole('button', { name: 'Editar Clara Dupont' }))

    expect(dialogoDeEdicao()).toHaveTextContent('Vale para o Contato em todas as Contas em que ele atua.')
    expect(campo('Nome')).toHaveValue('Clara Dupont')
    expect(campo('Cargo (opcional)')).toHaveValue('Staff AI Safety Engineer')
    expect(campo('E-mail (opcional)')).toHaveValue('clara@anthropic.com')
    expect(campo('Telefone (opcional)')).toHaveValue('')
    expect(campo('LinkedIn (opcional)')).toHaveValue('https://www.linkedin.com/in/clara-dupont')
  })

  it('salva os campos, esvaziado apaga o canal, fecha o diálogo e a tabela mostra o novo valor', async () => {
    const editarContato = vi.fn(async () => {})
    const { usuario, fonteDeContas } = renderizarAppCom('/contatos', { contas: comEdicao({ editarContato }) })
    const clara = (await fonteDeContas.contatos()).find((c) => c.nome === 'Clara Dupont')!

    await usuario.click(await screen.findByRole('button', { name: 'Editar Clara Dupont' }))
    await usuario.clear(campo('Cargo (opcional)'))
    await usuario.type(campo('Cargo (opcional)'), 'Diretora de Segurança')
    await usuario.clear(campo('E-mail (opcional)'))
    await usuario.type(campo('Telefone (opcional)'), '(11) 98888-7777')
    await usuario.click(within(dialogoDeEdicao()).getByRole('button', { name: 'Salvar' }))

    expect(editarContato).toHaveBeenCalledWith(clara.id, {
      nome: 'Clara Dupont',
      cargo: 'Diretora de Segurança',
      email: '',
      whatsapp: '(11) 98888-7777',
      linkedin: 'https://www.linkedin.com/in/clara-dupont',
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const tabela = screen.getByRole('table', { name: 'Tabela de Contatos' })
    const linha = within(tabela).getByRole('row', { name: /Clara Dupont/ })
    expect(within(linha).getByText('Diretora de Segurança')).toBeInTheDocument()
    expect(within(linha).getByRole('img', { name: 'E-mail não disponível' })).toBeInTheDocument()
    expect(within(linha).getByRole('img', { name: 'Telefone disponível' })).toBeInTheDocument()
  })

  it('recusar o nome vazio no formulário, sem chamar a fonte', async () => {
    const editarContato = vi.fn(async () => {})
    const { usuario } = renderizarAppCom('/contatos', { contas: comEdicao({ editarContato }) })

    await usuario.click(await screen.findByRole('button', { name: 'Editar Clara Dupont' }))
    await usuario.clear(campo('Nome'))
    await usuario.type(campo('Nome'), '   ')
    await usuario.click(within(dialogoDeEdicao()).getByRole('button', { name: 'Salvar' }))

    expect(await within(dialogoDeEdicao()).findByRole('alert')).toHaveTextContent('Informe o nome do Contato.')
    expect(editarContato).not.toHaveBeenCalled()
  })

  it('a recusa do banco fica no diálogo, com a razão, que continua aberto com o que foi digitado', async () => {
    const editarContato = vi.fn(async () => {
      throw new Error('Já existe um Contato com este e-mail neste Workspace.')
    })
    const { usuario } = renderizarAppCom('/contatos', { contas: comEdicao({ editarContato }) })

    await usuario.click(await screen.findByRole('button', { name: 'Editar Clara Dupont' }))
    await usuario.clear(campo('E-mail (opcional)'))
    await usuario.type(campo('E-mail (opcional)'), 'outra@anthropic.com')
    await usuario.click(within(dialogoDeEdicao()).getByRole('button', { name: 'Salvar' }))

    expect(await within(dialogoDeEdicao()).findByRole('alert')).toHaveTextContent('Já existe um Contato com este e-mail neste Workspace.')
    expect(campo('E-mail (opcional)')).toHaveValue('outra@anthropic.com')
    expect(within(dialogoDeEdicao()).getByRole('button', { name: 'Salvar' })).toBeEnabled()
  })

  it('cancelar não grava e reabrir volta aos valores guardados', async () => {
    const editarContato = vi.fn(async () => {})
    const { usuario } = renderizarAppCom('/contatos', { contas: comEdicao({ editarContato }) })

    await usuario.click(await screen.findByRole('button', { name: 'Editar Clara Dupont' }))
    await usuario.type(campo('Cargo (opcional)'), ' Sênior')
    await usuario.click(within(dialogoDeEdicao()).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Editar Clara Dupont' }))

    expect(editarContato).not.toHaveBeenCalled()
    expect(campo('Cargo (opcional)')).toHaveValue('Staff AI Safety Engineer')
  })

  it('quem não pode editar nem arquivar não vê a ação', async () => {
    renderizarAppCom('/contatos', { contas: comEdicao({ podeEditar: false }) })

    await screen.findByRole('table', { name: 'Tabela de Contatos' })
    expect(screen.queryByRole('button', { name: /^Editar / })).not.toBeInTheDocument()
  })

  it('quem responde só por uma das Contas do Contato vê Editar desligado, com o motivo', async () => {
    renderizarAppCom('/contatos', { contas: comEdicao({ podeEditar: false, podeArquivar: true }) })

    const botao = await screen.findByRole('button', { name: 'Editar Clara Dupont' })
    expect(botao).toBeDisabled()
    expect(botao).toHaveAccessibleDescription(
      'Só um Administrador ou o Vendedor responsável por todas as Contas deste Contato pode editá-lo.',
    )
  })

  it('edita também na lista de Contatos do detalhe da Conta, e o LinkedIn novo libera a busca da foto', async () => {
    const editarContato = vi.fn(async () => {})
    const { usuario } = renderizarAppCom('/contas/anthropic', { contas: comEdicao({ editarContato, comFoto: true }) })
    const tabela = await screen.findByRole('table', { name: 'Contatos da Conta-alvo' })
    const camera = () => within(tabela).queryByRole('button', { name: 'Buscar foto de Clara Dupont' })
    // A Clara já tem LinkedIn: a busca da foto aparece. Sem LinkedIn, some; com um novo, volta.
    expect(camera()).toBeInTheDocument()

    await usuario.click(within(tabela).getByRole('button', { name: 'Editar Clara Dupont' }))
    await usuario.clear(campo('LinkedIn (opcional)'))
    await usuario.click(within(dialogoDeEdicao()).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(camera()).not.toBeInTheDocument())

    await usuario.click(within(tabela).getByRole('button', { name: 'Editar Clara Dupont' }))
    await usuario.type(campo('LinkedIn (opcional)'), 'linkedin.com/in/clara-d')
    await usuario.click(within(dialogoDeEdicao()).getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(camera()).toBeInTheDocument())
    expect(editarContato).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ linkedin: 'linkedin.com/in/clara-d' }))
  })
})

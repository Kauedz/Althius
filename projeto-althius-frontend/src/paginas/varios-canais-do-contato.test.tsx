import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CanaisDoContato } from '@/fonte/canais-do-contato'
import type { Contato, EdicaoDoContato, FonteDeContas } from '@/fonte/contas-tipos'
import { renderizarAppCom } from '@/test/renderizar'

const CLARA_ANTES = {
  email: 'clara@anthropic.com',
  whatsapp: '+5511988887777',
  linkedin: 'https://www.linkedin.com/in/clara-dupont',
}

const CANAIS_DA_CLARA: CanaisDoContato = {
  emails: [
    { valor: 'clara@anthropic.com', rotulo: 'trabalho' },
    { valor: 'clara.dupont@gmail.com', rotulo: 'pessoal' },
    { valor: 'clara@outro.com', rotulo: 'outro' },
  ],
  telefones: [
    { valor: '+5511988887777', tipo: 'celular', whatsapp: true },
    { valor: '+551133334444', tipo: 'fixo', whatsapp: false },
  ],
}

interface Opcoes {
  canais?: CanaisDoContato
  /** A fonte não trouxe as listas (a leitura delas falhou): o Contato só tem o principal. */
  semListas?: boolean
  salvarCanais?: (contatoId: string, canais: CanaisDoContato) => Promise<void>
  editarContato?: (contatoId: string, campos: EdicaoDoContato) => Promise<void>
}

/** Os Contatos da demo com as listas de e-mails e telefones da Clara e as duas ações de edição que a fonte real oferece. */
function comListas({ canais = CANAIS_DA_CLARA, semListas = false, salvarCanais, editarContato }: Opcoes = {}) {
  return (base: FonteDeContas): FonteDeContas => {
    const ouvintes = new Set<() => void>()
    let atuais: Contato[] | null = null
    const todos = async () =>
      (atuais ??= (await base.contatos()).map((contato) => ({
        ...contato,
        podeEditar: true,
        ...(contato.nome === 'Clara Dupont'
          ? { ...CLARA_ANTES, canais: { email: true, telefone: true, linkedin: true }, ...(semListas ? {} : { emails: canais.emails, telefones: canais.telefones }) }
          : {}),
      })))
    return {
      ...base,
      observar: (ouvinte) => {
        ouvintes.add(ouvinte)
        return () => ouvintes.delete(ouvinte)
      },
      contatos: todos,
      contatosDaConta: async (contaId) => (await todos()).filter((c) => c.contaId === contaId),
      async salvarCanaisDoContato(contatoId, novos) {
        await salvarCanais?.(contatoId, novos)
        const lista = await todos()
        const indice = lista.findIndex((c) => c.id === contatoId)
        lista[indice] = { ...lista[indice], emails: novos.emails, telefones: novos.telefones }
        for (const ouvinte of ouvintes) ouvinte()
        return lista[indice]
      },
      async editarContato(contatoId, campos) {
        await editarContato?.(contatoId, campos)
        return (await todos()).find((c) => c.id === contatoId)!
      },
    }
  }
}

const dialogo = () => screen.getByRole('dialog', { name: 'Editar Clara Dupont' })
const caixa = (nome: string) => within(dialogo()).getByRole('textbox', { name: nome })
const botao = (nome: string) => within(dialogo()).getByRole('button', { name: nome })
const seletor = (nome: string) => within(dialogo()).getByRole('combobox', { name: nome })

async function abrir(opcoes?: Opcoes) {
  const renderizado = renderizarAppCom('/contatos', { contas: comListas(opcoes) })
  await renderizado.usuario.click(await screen.findByRole('button', { name: 'Editar Clara Dupont' }))
  return renderizado
}

describe('Vários e-mails e telefones por Contato', () => {
  it('a edição mostra as listas com o rótulo, o tipo e a marca de WhatsApp, o principal primeiro', async () => {
    await abrir()

    expect(caixa('E-mail 1')).toHaveValue('clara@anthropic.com')
    expect(seletor('Rótulo do e-mail 1')).toHaveValue('trabalho')
    expect(caixa('E-mail 2')).toHaveValue('clara.dupont@gmail.com')
    expect(seletor('Rótulo do e-mail 2')).toHaveValue('pessoal')
    expect(seletor('Rótulo do e-mail 3')).toHaveValue('outro')
    expect(caixa('Telefone 1')).toHaveValue('+5511988887777')
    expect(seletor('Tipo do telefone 1')).toHaveValue('celular')
    expect(seletor('Tipo do telefone 2')).toHaveValue('fixo')
    expect(within(dialogo()).getByRole('checkbox', { name: /Usa WhatsApp \(telefone 1\)/ })).toBeChecked()
    expect(within(dialogo()).getByRole('checkbox', { name: /Usa WhatsApp \(telefone 2\)/ })).not.toBeChecked()
    // O nome, o cargo e o LinkedIn continuam campos de texto; o e-mail e o telefone soltos saem.
    expect(caixa('Nome')).toHaveValue('Clara Dupont')
    expect(caixa('LinkedIn (opcional)')).toBeInTheDocument()
    expect(within(dialogo()).queryByRole('textbox', { name: 'E-mail (opcional)' })).not.toBeInTheDocument()
    expect(within(dialogo()).getAllByText('Principal')).toHaveLength(2)
    expect(within(dialogo()).queryByRole('button', { name: 'Tornar principal o e-mail 1' })).not.toBeInTheDocument()
  })

  it('respeita o limite de 3: com três e-mails, adicionar fica desligado e diz o motivo', async () => {
    const { usuario } = await abrir()

    expect(botao('Adicionar e-mail')).toBeDisabled()
    expect(within(dialogo()).getByText('Limite de 3 e-mails.')).toBeInTheDocument()
    expect(botao('Adicionar telefone')).toBeEnabled()

    await usuario.click(botao('Adicionar telefone'))
    expect(caixa('Telefone 3')).toHaveValue('')
    expect(botao('Adicionar telefone')).toBeDisabled()
    expect(within(dialogo()).getByText('Limite de 3 telefones.')).toBeInTheDocument()

    await usuario.click(botao('Remover e-mail 3'))
    expect(botao('Adicionar e-mail')).toBeEnabled()
  })

  it('tornar principal troca o e-mail de lugar, e salvar grava as listas na nova ordem e o resto sem e-mail nem telefone', async () => {
    const salvarCanais = vi.fn(async () => {})
    const editarContato = vi.fn(async () => {})
    const { usuario, fonteDeContas } = await abrir({ salvarCanais, editarContato })
    const clara = (await fonteDeContas.contatos()).find((c) => c.nome === 'Clara Dupont')!

    await usuario.click(botao('Tornar principal o e-mail 2'))
    expect(caixa('E-mail 1')).toHaveValue('clara.dupont@gmail.com')
    expect(caixa('E-mail 2')).toHaveValue('clara@anthropic.com')
    await usuario.selectOptions(seletor('Rótulo do e-mail 3'), 'trabalho')
    await usuario.selectOptions(seletor('Tipo do telefone 2'), 'celular')
    await usuario.click(within(dialogo()).getByRole('checkbox', { name: /Usa WhatsApp \(telefone 2\)/ }))
    await usuario.click(botao('Salvar'))

    expect(salvarCanais).toHaveBeenCalledWith(clara.id, {
      emails: [
        { valor: 'clara.dupont@gmail.com', rotulo: 'pessoal' },
        { valor: 'clara@anthropic.com', rotulo: 'trabalho' },
        { valor: 'clara@outro.com', rotulo: 'trabalho' },
      ],
      telefones: [
        { valor: '+5511988887777', tipo: 'celular', whatsapp: true },
        { valor: '+551133334444', tipo: 'celular', whatsapp: true },
      ],
    })
    expect(editarContato).toHaveBeenCalledWith(clara.id, {
      nome: 'Clara Dupont',
      cargo: 'Staff AI Safety Engineer',
      linkedin: 'https://www.linkedin.com/in/clara-dupont',
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('remover e linha em branco: a linha em branco não é gravada e o principal passa ao seguinte', async () => {
    const salvarCanais = vi.fn(async (_contatoId: string, _canais: CanaisDoContato) => {})
    const { usuario } = await abrir({ salvarCanais })

    await usuario.click(botao('Remover e-mail 1'))
    await usuario.click(botao('Remover e-mail 2'))
    await usuario.click(botao('Adicionar e-mail'))
    await usuario.click(botao('Salvar'))

    await waitFor(() => expect(salvarCanais).toHaveBeenCalled())
    expect(salvarCanais.mock.calls[0][1].emails).toEqual([{ valor: 'clara.dupont@gmail.com', rotulo: 'pessoal' }])
  })

  it('sem mudar as listas, salvar não chama a troca das listas', async () => {
    const salvarCanais = vi.fn(async () => {})
    const editarContato = vi.fn(async () => {})
    const { usuario } = await abrir({ salvarCanais, editarContato })

    await usuario.type(caixa('Cargo (opcional)'), ' Sênior')
    await usuario.click(botao('Salvar'))

    await waitFor(() => expect(editarContato).toHaveBeenCalled())
    expect(salvarCanais).not.toHaveBeenCalled()
  })

  it('a recusa do banco fica no diálogo, com a razão, e nada mais é gravado', async () => {
    const salvarCanais = vi.fn(async () => {
      throw new Error('Já existe um Contato com este e-mail neste Workspace.')
    })
    const editarContato = vi.fn(async () => {})
    const { usuario } = await abrir({ salvarCanais, editarContato })

    await usuario.clear(caixa('E-mail 2'))
    await usuario.type(caixa('E-mail 2'), 'de.outro@empresa.com')
    await usuario.click(botao('Salvar'))

    expect(await within(dialogo()).findByRole('alert')).toHaveTextContent('Já existe um Contato com este e-mail neste Workspace.')
    expect(caixa('E-mail 2')).toHaveValue('de.outro@empresa.com')
    expect(editarContato).not.toHaveBeenCalled()
    expect(botao('Salvar')).toBeEnabled()
  })

  it('sem as listas (a leitura falhou), a edição volta aos campos de sempre e nunca grava uma lista incompleta', async () => {
    const salvarCanais = vi.fn(async () => {})
    const editarContato = vi.fn(async () => {})
    const { usuario } = await abrir({ semListas: true, salvarCanais, editarContato })

    expect(caixa('E-mail (opcional)')).toHaveValue('clara@anthropic.com')
    expect(within(dialogo()).queryByRole('button', { name: 'Adicionar e-mail' })).not.toBeInTheDocument()
    await usuario.click(botao('Salvar'))

    await waitFor(() => expect(editarContato).toHaveBeenCalled())
    expect(salvarCanais).not.toHaveBeenCalled()
  })

  it('a tabela de Contatos mostra o principal e um +N para os demais', async () => {
    renderizarAppCom('/contatos', { contas: comListas() })

    const tabela = await screen.findByRole('table', { name: 'Tabela de Contatos' })
    const linha = within(tabela).getByRole('row', { name: /Clara Dupont/ })
    expect(within(linha).getByRole('img', { name: 'E-mail disponível, mais 2' })).toBeInTheDocument()
    expect(within(linha).getByRole('img', { name: 'Telefone disponível, mais 1' })).toBeInTheDocument()
    expect(within(linha).getByText('+2')).toBeInTheDocument()
    expect(within(linha).getByText('+1')).toBeInTheDocument()
  })

  it('a lista do detalhe da Conta também mostra o +N', async () => {
    renderizarAppCom('/contas/anthropic', { contas: comListas() })

    const tabela = await screen.findByRole('table', { name: 'Contatos da Conta-alvo' })
    const linha = within(tabela).getByRole('row', { name: /Clara Dupont/ })
    expect(within(linha).getByRole('img', { name: 'E-mail disponível, mais 2' })).toBeInTheDocument()
  })
})

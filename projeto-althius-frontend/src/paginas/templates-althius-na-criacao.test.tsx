import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SINAIS_MOCK } from '@/paginas/sinais/dados-mock'
import { renderizarApp } from '@/test/renderizar'

const FRASE_DA_FIGMA = SINAIS_MOCK.find((sinal) => sinal.contaId === 'figma')!.frase

async function abrirNova(usuario: ReturnType<typeof renderizarApp>['usuario']) {
  await usuario.click(screen.getByRole('button', { name: /Nova sequência/i }))
  return screen.findByRole('dialog')
}

describe('Templates da Althius na Nova sequência', () => {
  it('mantém o diálogo atual e só acrescenta a escolha do template dentro do formulário', async () => {
    const { usuario } = renderizarApp('/sequencias')
    expect(await screen.findByText('7 sequências')).toBeInTheDocument()
    const dialog = await abrirNova(usuario)

    expect(dialog.className).toContain('sm:max-w-xl')
    expect(within(dialog).getByRole('heading', { name: 'Nova sequência' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('link')).not.toBeInTheDocument()
    const form = dialog.querySelector('form')
    expect(form).not.toBeNull()
    expect(within(form!).getByRole('combobox', { name: 'Conta-alvo' })).toBeInTheDocument()
    expect(within(form!).getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
    expect(within(form!).getByRole('button', { name: /Criar sequência/i })).toHaveAttribute('type', 'submit')

    await usuario.selectOptions(within(form!).getByRole('combobox', { name: 'Conta-alvo' }), 'figma')
    expect(await within(form!).findByText(/Gabriel Siqueira/i)).toBeInTheDocument()
    expect(await within(form!).findByRole('combobox', { name: 'Template da Althius' })).toBeInTheDocument()
    expect(within(form!).getByRole('button', { name: 'Sugerir com os dados da Conta' })).toBeInTheDocument()
    expect(within(form!).getByRole('checkbox', { name: /Usar a Cadência do Playbook/ })).toBeInTheDocument()
  })

  it('sugere só o template existente, com o Sinal da Conta, e criar a cópia não ativa envio', async () => {
    const { fonteDeSequencias, usuario } = renderizarApp('/sequencias')
    expect(await screen.findByText('7 sequências')).toBeInTheDocument()
    const dialog = await abrirNova(usuario)
    await usuario.selectOptions(within(dialog).getByRole('combobox', { name: 'Conta-alvo' }), 'figma')
    await within(dialog).findByText(/Gabriel Siqueira/i)

    await usuario.click(within(dialog).getByRole('button', { name: 'Sugerir com os dados da Conta' }))

    expect(within(dialog).getByRole('combobox', { name: 'Template da Althius' })).toHaveValue('abertura-por-sinal')
    expect(within(dialog).getByText(new RegExp(FRASE_DA_FIGMA))).toBeInTheDocument()
    expect(within(dialog).getByText(/Não há medida de resultado deste template/)).toBeInTheDocument()
    expect(dialog).not.toHaveTextContent(/comprovado|aumenta a conversão|\d+\s*%/i)

    await usuario.click(within(dialog).getByRole('button', { name: /Criar sequência/i }))
    await screen.findByRole('heading', { level: 2, name: /Figma/i })

    const criada = await fonteDeSequencias.sequenciaPorConta('figma')
    expect(criada?.steps.map((passo) => passo.titulo)).toEqual(['Abertura com o Sinal', 'Retomada', 'Último toque'])
    expect(criada?.steps.every((passo) => passo.contatoId === 'contato-figma-1')).toBe(true)
    expect(await fonteDeSequencias.autorizacao(criada!.id)).toBeNull()
    const catalogo = await fonteDeSequencias.templatesDaAlthius!()
    expect(catalogo[0].passos[0].titulo).toBe('Abertura com o Sinal')
    expect(catalogo[0].passos.every((passo) => !('contatoId' in passo))).toBe(true)
  })

  it('sem Sinal e sem Playbook obrigatório, a escolha manual da cópia continua', async () => {
    const { fonteDeSequencias, usuario } = renderizarApp('/sequencias')
    expect(await screen.findByText('7 sequências')).toBeInTheDocument()
    const dialog = await abrirNova(usuario)
    await usuario.selectOptions(within(dialog).getByRole('combobox', { name: 'Conta-alvo' }), 'canva')
    await within(dialog).findByRole('checkbox', { name: /Usar a Cadência do Playbook/ })

    await usuario.click(within(dialog).getByRole('button', { name: 'Sugerir com os dados da Conta' }))
    expect(await within(dialog).findByRole('status')).toHaveTextContent(/escolha manual continua/i)
    expect(within(dialog).getByRole('combobox', { name: 'Template da Althius' })).toHaveValue('')
    expect(within(dialog).getByRole('button', { name: /Criar sequência/i })).toBeEnabled()

    await usuario.click(within(dialog).getByRole('checkbox', { name: /Usar a Cadência do Playbook/ }))
    await usuario.selectOptions(within(dialog).getByRole('combobox', { name: 'Template da Althius' }), 'retomada-curta')
    expect(within(dialog).getByRole('checkbox', { name: /Paula Gomes/ })).toBeEnabled()
    await usuario.click(within(dialog).getByRole('button', { name: /Criar sequência/i }))

    await screen.findByRole('heading', { level: 2, name: /Canva/i })
    const criada = await fonteDeSequencias.sequenciaPorConta('canva')
    expect(criada?.steps.map((passo) => passo.titulo)).toEqual(['Primeiro e-mail', 'Segundo e-mail'])
    expect(criada?.steps.some((passo) => passo.titulo === 'Conexão')).toBe(false)
  })

  it('do zero continua disponível e não grava o template', async () => {
    const { fonteDeSequencias, usuario } = renderizarApp('/sequencias')
    expect(await screen.findByText('7 sequências')).toBeInTheDocument()
    const dialog = await abrirNova(usuario)
    await usuario.selectOptions(within(dialog).getByRole('combobox', { name: 'Conta-alvo' }), 'canva')
    await usuario.click(await within(dialog).findByRole('checkbox', { name: /Usar a Cadência do Playbook/ }))
    expect(within(dialog).getByRole('combobox', { name: 'Template da Althius' })).toHaveValue('')
    await usuario.click(within(dialog).getByRole('button', { name: /Criar sequência/i }))

    await screen.findByRole('heading', { level: 2, name: /Canva/i })
    expect((await fonteDeSequencias.sequenciaPorConta('canva'))?.steps).toEqual([])
  })
})

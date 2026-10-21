import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderizarApp } from '@/test/renderizar'
import { criarFonteDeSequenciasSimulada } from '@/fonte/simulada-sequencias'

async function abrirNova(usuario: ReturnType<typeof renderizarApp>['usuario']) {
  await usuario.click(screen.getByRole('button', { name: /Nova sequência/i }))
  return screen.findByRole('dialog')
}

describe('Templates próprios na Nova sequência', () => {
  it('mantém o diálogo e só acrescenta salvar e usar dentro do formulário', async () => {
    const { usuario } = renderizarApp('/sequencias')
    expect(await screen.findByText('7 sequências')).toBeInTheDocument()
    const dialog = await abrirNova(usuario)

    expect(dialog.className).toContain('sm:max-w-xl')
    expect(within(dialog).queryByRole('link')).not.toBeInTheDocument()
    expect(within(dialog).getByRole('heading', { name: 'Nova sequência' })).toBeInTheDocument()

    await usuario.selectOptions(within(dialog).getByRole('combobox', { name: 'Conta-alvo' }), 'figma')
    const form = dialog.querySelector('form')
    expect(form).not.toBeNull()
    expect(within(form!).getByRole('combobox', { name: 'Template da Althius' })).toBeInTheDocument()
    expect(within(form!).getByRole('combobox', { name: 'Meu template' })).toBeInTheDocument()
    expect(within(form!).getByRole('button', { name: 'Salvar esta estrutura como meu template' })).toBeInTheDocument()
    expect(within(form!).getByRole('button', { name: 'Sugerir meu template' })).toBeInTheDocument()
    expect(within(form!).getByRole('button', { name: /Criar sequência/i })).toHaveAttribute('type', 'submit')
  })

  it('exige a prévia antes de salvar, e a cópia não altera o template nem autoriza envio', async () => {
    const { fonteDeSequencias, usuario } = renderizarApp('/sequencias')
    expect(await screen.findByText('7 sequências')).toBeInTheDocument()
    const dialog = await abrirNova(usuario)
    await usuario.selectOptions(within(dialog).getByRole('combobox', { name: 'Conta-alvo' }), 'figma')
    await within(dialog).findByText(/Gabriel Siqueira/i)
    await usuario.selectOptions(within(dialog).getByRole('combobox', { name: 'Template da Althius' }), 'abertura-por-sinal')

    await usuario.click(within(dialog).getByRole('button', { name: 'Salvar esta estrutura como meu template' }))
    const previa = await within(dialog).findByRole('region', { name: 'Prévia do template' })
    expect(previa).not.toHaveTextContent(/contato-figma|98888|@/)
    expect(within(previa).getByText(/Abertura com o Sinal/)).toBeInTheDocument()
    expect(fonteDeSequencias.templatesProprios).toBeDefined()
    expect(await fonteDeSequencias.templatesProprios!()).toEqual([])

    await usuario.click(within(previa).getByRole('button', { name: 'Confirmar salvamento' }))
    expect(await within(dialog).findByRole('combobox', { name: 'Meu template' })).not.toHaveValue('')
    const salvos = await fonteDeSequencias.templatesProprios!()
    expect(salvos).toHaveLength(1)
    expect(salvos[0].passos.every((passo) => !('contatoId' in passo))).toBe(true)
    const titulos = salvos[0].passos.map((passo) => passo.titulo)

    await usuario.click(within(dialog).getByRole('button', { name: /Criar sequência/i }))
    await screen.findByRole('heading', { level: 2, name: /Figma/i })
    const criada = await fonteDeSequencias.sequenciaPorConta('figma')
    expect(criada?.steps.map((passo) => passo.titulo)).toEqual(titulos)
    expect(criada?.steps.every((passo) => passo.contatoId === 'contato-figma-1')).toBe(true)
    expect(await fonteDeSequencias.autorizacao(criada!.id)).toBeNull()
    expect((await fonteDeSequencias.templatesProprios!())[0].passos.map((passo) => passo.titulo)).toEqual(titulos)
  })

  it('a sugestão própria só escolhe um template que esta fonte pode ler', async () => {
    const { fonteDeSequencias, usuario } = renderizarApp('/sequencias')
    expect(await screen.findByText('7 sequências')).toBeInTheDocument()
    const dialog = await abrirNova(usuario)
    await usuario.selectOptions(within(dialog).getByRole('combobox', { name: 'Conta-alvo' }), 'canva')
    await within(dialog).findByRole('checkbox', { name: /Usar a Cadência do Playbook/ })

    await usuario.click(within(dialog).getByRole('button', { name: 'Sugerir meu template' }))
    expect(await within(dialog).findByRole('status')).toHaveTextContent(/escolha manual/i)
    expect(within(dialog).getByRole('combobox', { name: 'Meu template' })).toHaveValue('')
    expect(within(dialog).getByRole('combobox', { name: 'Template da Althius' })).toBeInTheDocument()

    const outra = criarFonteDeSequenciasSimulada()
    expect(await outra.templatesProprios()).toEqual([])
    expect(fonteDeSequencias).not.toBe(outra)
  })
})

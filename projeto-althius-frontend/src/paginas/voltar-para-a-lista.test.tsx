import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderizarApp, renderizarAppNoNavegador } from '@/test/renderizar'

afterEach(() => window.history.replaceState(null, '', '/'))

/** O quadro que rola a tabela da aba. */
const quadroDaTabela = (nome: string) => screen.getByRole('table', { name: nome }).parentElement!

/** Rola o quadro como o usuário: a posição muda e o evento de rolagem dispara. */
function rolar(quadro: HTMLElement, posicao: number) {
  quadro.scrollTop = posicao
  fireEvent.scroll(quadro)
}

async function voltarPeloNavegador() {
  const voltou = new Promise((resolver) => window.addEventListener('popstate', resolver, { once: true }))
  await act(async () => {
    window.history.back()
    await voltou
  })
}

const chips = () =>
  screen
    .queryAllByRole('button', { name: /^Remover filtro / })
    .map((botao) => botao.getAttribute('aria-label')!.replace('Remover filtro ', ''))

const RECORTE_DAS_CONTAS = '/contas?busca=a&ordem=ultimo-contato&aderencia=fit'

async function abrirPrimeiraConta(usuario: ReturnType<typeof renderizarApp>['usuario']) {
  const tabela = await screen.findByRole('table', { name: 'Tabela de Contas' })
  const linha = within(tabela).getAllByRole('row')[1]
  const linkDaEmpresa = within(linha).getAllByRole('link')[0]
  const empresa = linkDaEmpresa.textContent!
  rolar(quadroDaTabela('Tabela de Contas'), 240)
  await usuario.click(linkDaEmpresa)
  expect(await screen.findByRole('heading', { level: 1, name: empresa })).toBeInTheDocument()
}

async function esperarAListaDasContasComORecorte() {
  expect(await screen.findByRole('table', { name: 'Tabela de Contas' })).toBeInTheDocument()
  expect(screen.getByRole('searchbox', { name: 'Buscar contas' })).toHaveValue('a')
  expect(screen.getByRole('combobox', { name: 'Ordenar por' })).toHaveValue('ultimo-contato')
  expect(chips()).toEqual(['Aderência: Fit'])
  expect(quadroDaTabela('Tabela de Contas').scrollTop).toBe(240)
}

describe('Voltar do detalhe para a aba Contas', () => {
  it('a migalha "Contas" devolve a lista com a busca, os filtros, a ordenação e a rolagem', async () => {
    const { usuario } = renderizarApp(RECORTE_DAS_CONTAS)
    await abrirPrimeiraConta(usuario)

    const migalha = screen.getByRole('link', { name: 'Contas' })
    expect(migalha).toHaveAttribute('href', RECORTE_DAS_CONTAS)
    await usuario.click(migalha)

    await esperarAListaDasContasComORecorte()
  })

  it('o voltar do navegador devolve o mesmo recorte e a rolagem', async () => {
    const { usuario } = renderizarAppNoNavegador(RECORTE_DAS_CONTAS)
    await abrirPrimeiraConta(usuario)

    await voltarPeloNavegador()

    await esperarAListaDasContasComORecorte()
  })

  it('vindo pela célula Contatos, a migalha também devolve o recorte', async () => {
    const { usuario } = renderizarApp(RECORTE_DAS_CONTAS)
    const tabela = await screen.findByRole('table', { name: 'Tabela de Contas' })
    const celulaContatos = within(within(tabela).getAllByRole('row')[1]).getAllByRole('link').at(-1)!
    await usuario.click(celulaContatos)

    expect(await screen.findByRole('link', { name: 'Contas' })).toHaveAttribute('href', RECORTE_DAS_CONTAS)
  })

  it('entrar de novo pela sidebar abre a lista no topo', async () => {
    const { usuario } = renderizarApp('/contas')
    await abrirPrimeiraConta(usuario)

    await usuario.click(within(screen.getByRole('navigation', { name: 'Workspace' })).getByRole('link', { name: /Contas e Contatos/ }))

    expect(await screen.findByRole('table', { name: 'Tabela de Contas' })).toBeInTheDocument()
    expect(quadroDaTabela('Tabela de Contas').scrollTop).toBe(0)
  })

  it('aberto direto pelo endereço, o detalhe volta para a aba Contas sem recorte', async () => {
    renderizarApp('/contas/openai')

    expect(await screen.findByRole('link', { name: 'Contas' })).toHaveAttribute('href', '/contas')
  })
})

const RECORTE_DOS_CONTATOS = '/contatos?busca=a&aderencia=quente'

async function abrirEmpresaDoPrimeiroContato(usuario: ReturnType<typeof renderizarApp>['usuario']) {
  const tabela = await screen.findByRole('table', { name: 'Tabela de Contatos' })
  const linkDaEmpresa = within(within(tabela).getAllByRole('row')[1]).getByRole('link')
  const empresa = linkDaEmpresa.textContent!
  rolar(quadroDaTabela('Tabela de Contatos'), 180)
  await usuario.click(linkDaEmpresa)
  expect(await screen.findByRole('heading', { level: 1, name: empresa })).toBeInTheDocument()
}

async function esperarAListaDosContatosComORecorte() {
  expect(await screen.findByRole('table', { name: 'Tabela de Contatos' })).toBeInTheDocument()
  expect(screen.getByRole('searchbox', { name: 'Buscar contatos' })).toHaveValue('a')
  expect(chips()).toEqual(['Aderência: Quente'])
  expect(quadroDaTabela('Tabela de Contatos').scrollTop).toBe(180)
}

describe('Voltar do detalhe para a aba Contatos', () => {
  it('a migalha "Contatos" devolve a aba Contatos com a busca, os filtros e a rolagem', async () => {
    const { usuario } = renderizarApp(RECORTE_DOS_CONTATOS)
    await abrirEmpresaDoPrimeiroContato(usuario)

    expect(screen.queryByRole('link', { name: 'Contas' })).not.toBeInTheDocument()
    const migalha = screen.getByRole('link', { name: 'Contatos' })
    expect(migalha).toHaveAttribute('href', RECORTE_DOS_CONTATOS)
    await usuario.click(migalha)

    await esperarAListaDosContatosComORecorte()
  })

  it('o voltar do navegador devolve a aba Contatos com o mesmo recorte e a rolagem', async () => {
    const { usuario } = renderizarAppNoNavegador(RECORTE_DOS_CONTATOS)
    await abrirEmpresaDoPrimeiroContato(usuario)

    await voltarPeloNavegador()

    await esperarAListaDosContatosComORecorte()
  })
})

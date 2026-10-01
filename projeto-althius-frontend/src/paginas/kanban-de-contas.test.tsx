import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { FonteDeContas } from '@/fonte/contas-tipos'
import { renderizarApp, renderizarAppCom } from '@/test/renderizar'

const colunas = () => within(screen.getByRole('list', { name: 'Kanban de Contas' })).getAllByRole('listitem')
const coluna = (rotulo: string) =>
  colunas().find((c) => c.getAttribute('aria-label')?.startsWith(`${rotulo},`)) as HTMLElement

describe('Kanban de Contas', () => {
  it('a vista Kanban mostra as oito colunas do funil e a Tabela continua a padrão', async () => {
    const { usuario } = renderizarApp('/contas')
    expect(await screen.findByRole('table', { name: 'Tabela de Contas' })).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Kanban' }))
    expect(await screen.findByRole('list', { name: 'Kanban de Contas' })).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Tabela de Contas' })).not.toBeInTheDocument()
    expect(colunas().map((c) => c.querySelector('h3 span')?.textContent)).toEqual([
      'Descoberta', 'Quente', 'Fit', 'Em abordagem', 'Respondeu', 'Reunião', 'No CRM', 'Descartada',
    ])

    await usuario.click(screen.getByRole('button', { name: 'Tabela' }))
    expect(await screen.findByRole('table', { name: 'Tabela de Contas' })).toBeInTheDocument()
  })

  it('a Demonstração traz um kanban de exemplo, com Contas em mais de uma coluna', async () => {
    renderizarApp('/contas?vista=kanban')
    await screen.findByRole('list', { name: 'Kanban de Contas' })
    const ocupadas = colunas().filter((c) => within(c).queryAllByRole('article').length > 0)
    expect(ocupadas.length).toBeGreaterThan(1)
  })

  it('escolher o estágio no cartão move a Conta de coluna', async () => {
    const { usuario } = renderizarApp('/contas?vista=kanban')
    await screen.findByRole('list', { name: 'Kanban de Contas' })
    const cartao = within(coluna('Fit')).getAllByRole('article')[0]
    const nome = cartao.getAttribute('aria-label')!

    await usuario.selectOptions(within(cartao).getByRole('combobox', { name: `Mover ${nome}` }), 'em_abordagem')
    expect(await within(coluna('Em abordagem')).findByRole('article', { name: nome })).toBeInTheDocument()
    expect(within(coluna('Fit')).queryByRole('article', { name: nome })).not.toBeInTheDocument()
  })

  it('arrastar o cartão para outra coluna move a Conta', async () => {
    renderizarApp('/contas?vista=kanban')
    await screen.findByRole('list', { name: 'Kanban de Contas' })
    const cartao = within(coluna('Descoberta')).getAllByRole('article')[0]
    const nome = cartao.getAttribute('aria-label')!
    const dados = new Map<string, string>()
    const dataTransfer = {
      setData: (tipo: string, valor: string) => dados.set(tipo, valor),
      getData: (tipo: string) => dados.get(tipo) ?? '',
      effectAllowed: '',
    }

    fireEvent.dragStart(cartao, { dataTransfer })
    fireEvent.dragOver(coluna('Reunião'), { dataTransfer })
    fireEvent.drop(coluna('Reunião'), { dataTransfer })
    expect(await within(coluna('Reunião')).findByRole('article', { name: nome })).toBeInTheDocument()
  })

  it('No CRM não se escolhe à mão', async () => {
    renderizarApp('/contas?vista=kanban')
    await screen.findByRole('list', { name: 'Kanban de Contas' })
    const cartao = within(coluna('Fit')).getAllByRole('article')[0]
    expect(within(cartao).getByRole('option', { name: 'No CRM' })).toBeDisabled()
  })

  it('a recusa do banco aparece em português e o cartão fica onde estava', async () => {
    const { usuario } = renderizarAppCom('/contas?vista=kanban', {
      contas: (fonte): FonteDeContas =>
        Object.assign(Object.create(fonte) as FonteDeContas, {
          moverEstagio: () => Promise.reject(new Error('Só o Vendedor responsável pode mover esta Conta no kanban.')),
        }),
    })
    await screen.findByRole('list', { name: 'Kanban de Contas' })
    const cartao = within(coluna('Fit')).getAllByRole('article')[0]
    const nome = cartao.getAttribute('aria-label')!

    await usuario.selectOptions(within(cartao).getByRole('combobox', { name: `Mover ${nome}` }), 'reuniao')
    expect(await screen.findByRole('alert')).toHaveTextContent('Só o Vendedor responsável pode mover esta Conta no kanban.')
    expect(within(coluna('Fit')).getByRole('article', { name: nome })).toBeInTheDocument()
  })

  it('sem o kanban na fonte, não há a escolha de vista e o endereço com vista=kanban mostra a tabela', async () => {
    renderizarAppCom('/contas?vista=kanban', {
      contas: (fonte): FonteDeContas => Object.assign(Object.create(fonte) as FonteDeContas, { moverEstagio: undefined }),
    })
    expect(await screen.findByRole('table', { name: 'Tabela de Contas' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Vista' })).not.toBeInTheDocument()
  })

  it('o cartão mostra o critério do Playbook para o próximo Estágio, e só quando o SLA e metas o traz', async () => {
    renderizarApp('/contas?vista=kanban')
    await screen.findByRole('list', { name: 'Kanban de Contas' })
    const doFit = within(coluna('Fit')).getAllByRole('article')[0]
    expect(await within(doFit).findByText('Para Em abordagem: 3 perfis mapeados e telefone válido')).toBeInTheDocument()
    const daDescoberta = within(coluna('Descoberta')).getAllByRole('article')[0]
    expect(within(daDescoberta).queryByText(/^Para /)).not.toBeInTheDocument()
  })

  it('mover para um Estágio com critério avisa o que o Playbook pede e deixa a Conta seguir', async () => {
    const { usuario } = renderizarApp('/contas?vista=kanban')
    await screen.findByRole('list', { name: 'Kanban de Contas' })
    const cartao = within(coluna('Fit')).getAllByRole('article')[0]
    const nome = cartao.getAttribute('aria-label')!

    await usuario.selectOptions(within(cartao).getByRole('combobox', { name: `Mover ${nome}` }), 'em_abordagem')
    expect(await screen.findByRole('status')).toHaveTextContent(
      `${nome} foi para Em abordagem. O Playbook pede: 3 perfis mapeados e telefone válido.`,
    )
    expect(await within(coluna('Em abordagem')).findByRole('article', { name: nome })).toBeInTheDocument()
  })
})

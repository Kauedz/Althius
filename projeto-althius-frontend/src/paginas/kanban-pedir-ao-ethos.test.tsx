// A oferta de completar o critério de passagem (kanban 04): no cartão com critério para o próximo Estágio e no aviso de
// quem moveu para um Estágio com critério, "Pedir ao Ethos" abre uma Conversa nova com o Ethos já com o pedido (a Conta,
// o Estágio e o critério do Playbook). Sem critério, ou sem Ethos no Workspace, nada é oferecido.
import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi, type MockInstance } from 'vitest'
import type { FonteDeAgentes } from '@/fonte/tipos'
import { renderizarAppCom } from '@/test/renderizar'

const colunas = () => within(screen.getByRole('list', { name: 'Kanban de Contas' })).getAllByRole('listitem')
const coluna = (rotulo: string) =>
  colunas().find((c) => c.getAttribute('aria-label')?.startsWith(`${rotulo},`)) as HTMLElement

function abrir({ semEthos = false } = {}) {
  let conversar: MockInstance<FonteDeAgentes['conversar']> | undefined
  const { usuario } = renderizarAppCom('/contas?vista=kanban', {
    fonte: (fonte) => {
      const ajustada = semEthos
        ? { ...fonte, agentes: async () => (await fonte.agentes()).filter((a) => a.especialidade.id !== 'ethos') }
        : fonte
      conversar = vi.spyOn(ajustada, 'conversar')
      return ajustada
    },
  })
  return { usuario, conversar: () => conversar! }
}

describe('Pedir ao Ethos para completar o critério de passagem', () => {
  it('o cartão com critério oferece pedir ao Ethos, que recebe a Conta, o Estágio e o critério numa Conversa nova', async () => {
    const { usuario, conversar } = abrir()
    await screen.findByRole('list', { name: 'Kanban de Contas' })
    const cartao = within(coluna('Fit')).getAllByRole('article')[0]
    const nome = cartao.getAttribute('aria-label')!

    await usuario.click(await within(cartao).findByRole('button', { name: `Pedir ao Ethos para completar ${nome}` }))

    expect(conversar()).toHaveBeenCalledTimes(1)
    const [agenteId, mensagem] = conversar().mock.calls[0]
    expect(agenteId).toBe('ethos')
    expect(mensagem.texto).toContain(`Conta-alvo ${nome} (id `)
    expect(mensagem.texto).toContain('entrar em Em abordagem: 3 perfis mapeados e telefone válido')
    // A Conversa do Ethos abre com o pedido.
    expect((await screen.findAllByText(/O Playbook pede, para a Conta-alvo/)).length).toBeGreaterThan(0)
  })

  it('o cartão sem critério para o próximo Estágio não oferece nada', async () => {
    abrir()
    await screen.findByRole('list', { name: 'Kanban de Contas' })
    const daDescoberta = within(coluna('Descoberta')).getAllByRole('article')[0]
    await within(coluna('Fit')).findAllByRole('button', { name: /^Pedir ao Ethos/ })
    expect(within(daDescoberta).queryByRole('button', { name: /^Pedir ao Ethos/ })).not.toBeInTheDocument()
  })

  it('o aviso de quem moveu para um Estágio com critério também oferece pedir ao Ethos', async () => {
    const { usuario, conversar } = abrir()
    await screen.findByRole('list', { name: 'Kanban de Contas' })
    const cartao = within(coluna('Fit')).getAllByRole('article')[0]
    const nome = cartao.getAttribute('aria-label')!

    await usuario.selectOptions(within(cartao).getByRole('combobox', { name: `Mover ${nome}` }), 'em_abordagem')
    await screen.findByRole('status')
    await usuario.click(screen.getByRole('button', { name: 'Pedir ao Ethos para completar' }))

    expect(conversar()).toHaveBeenCalledWith(
      'ethos',
      expect.objectContaining({ texto: expect.stringContaining(`Conta-alvo ${nome} (id `) }),
    )
    expect(conversar().mock.calls[0][1].texto).toContain('entrar em Em abordagem: 3 perfis mapeados e telefone válido')
  })

  it('sem Ethos no Workspace, o critério aparece e a oferta não', async () => {
    abrir({ semEthos: true })
    await screen.findByRole('list', { name: 'Kanban de Contas' })
    const doFit = within(coluna('Fit')).getAllByRole('article')[0]
    expect(await within(doFit).findByText('Para Em abordagem: 3 perfis mapeados e telefone válido')).toBeInTheDocument()
    expect(within(doFit).queryByRole('button', { name: /^Pedir ao Ethos/ })).not.toBeInTheDocument()
  })
})

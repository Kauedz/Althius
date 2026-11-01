import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FonteProvider } from '@/fonte/contexto'
import type { AgenteId, FonteDeAgentes, ResumoDeConversa } from '@/fonte/tipos'
import { GavetaDeHistorico, POR_PAGINA, temHistorico } from './gaveta-de-historico'

const agora = new Date(2026, 9, 23, 15, 0, 0)

function conversa(id: string, atualizadaEm: Date, extra: Partial<ResumoDeConversa> = {}): ResumoDeConversa {
  return {
    id,
    titulo: null,
    primeiroPedido: `Pedido ${id}`,
    atualizadaEm: atualizadaEm.toISOString(),
    emAndamento: false,
    ...extra,
  }
}

function fonteDe(parcial: Partial<FonteDeAgentes>): FonteDeAgentes {
  return parcial as FonteDeAgentes
}

function Cena({
  fonte,
  aoAbrir = () => {},
  agenteId = null,
  nome,
  atual = null,
  abertoInicial = true,
}: {
  fonte: Partial<FonteDeAgentes>
  aoAbrir?: (conversa: ResumoDeConversa) => void
  agenteId?: AgenteId | null
  nome?: string
  atual?: string | null
  abertoInicial?: boolean
}) {
  const [aberto, setAberto] = useState(abertoInicial)
  return (
    <FonteProvider fonte={fonteDe(fonte)}>
      <button type="button" onClick={() => setAberto(true)}>
        Abrir histórico
      </button>
      <GavetaDeHistorico
        aberto={aberto}
        aoMudar={setAberto}
        agenteId={agenteId}
        nome={nome}
        atual={atual}
        aoAbrir={aoAbrir}
        agora={agora}
      />
    </FonteProvider>
  )
}

function renderizar(fonte: Partial<FonteDeAgentes>, ui: ReactNode) {
  return render(<FonteProvider fonte={fonteDe(fonte)}>{ui}</FonteProvider>)
}

afterEach(cleanup)

describe('GavetaDeHistorico', () => {
  const lista = [
    conversa('hoje', new Date(2026, 9, 23, 14, 48), { titulo: 'Presença da Althius vs. concorrentes' }),
    conversa('semana', new Date(2026, 9, 20, 10, 15), { titulo: 'Previsão do trimestre' }),
    conversa('antiga', new Date(2026, 9, 2, 8, 0), { titulo: 'Auditoria antiga' }),
  ]

  it('abre como dialog do Agente e da Coordenação, com o título certo', async () => {
    const historico = vi.fn(async () => lista)
    const { rerender } = renderizar(
      { historicoDeConversas: historico },
      <GavetaDeHistorico aberto aoMudar={() => {}} agenteId="agente-oraculum" nome="Oraculum" aoAbrir={() => {}} agora={agora} />,
    )
    const doAgente = await screen.findByRole('dialog', { name: 'Conversas do Oraculum' })
    expect(doAgente).toHaveAttribute('aria-modal', 'true')
    expect(historico).toHaveBeenCalledWith('agente-oraculum')
    expect(within(doAgente).getByRole('textbox', { name: 'Buscar conversas' })).toHaveFocus()

    rerender(
      <FonteProvider fonte={fonteDe({ historicoDeConversas: historico })}>
        <GavetaDeHistorico aberto aoMudar={() => {}} agenteId={null} aoAbrir={() => {}} agora={agora} />
      </FonteProvider>,
    )
    expect(await screen.findByRole('dialog', { name: 'Conversas coordenadas' })).toHaveAttribute('aria-modal', 'true')
  })

  it('fecha com Esc, com o X e com o véu, e devolve o foco ao gatilho', async () => {
    const usuario = userEvent.setup()
    render(<Cena fonte={{ historicoDeConversas: async () => lista }} abertoInicial={false} />)
    const gatilho = screen.getByRole('button', { name: 'Abrir histórico' })

    await usuario.click(gatilho)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await usuario.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(gatilho).toHaveFocus()

    await usuario.click(gatilho)
    await usuario.click(await screen.findByRole('button', { name: 'Fechar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(gatilho).toHaveFocus()

    await usuario.click(gatilho)
    await screen.findByRole('dialog')
    await usuario.click(document.querySelector('[data-slot="gaveta-veu"]')!)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(gatilho).toHaveFocus()
  })

  it('o Tab e o Shift+Tab não saem da gaveta', async () => {
    const usuario = userEvent.setup()
    render(<Cena fonte={{ historicoDeConversas: async () => lista }} />)
    const gaveta = await screen.findByRole('dialog')
    await waitFor(() => expect(within(gaveta).getByRole('textbox', { name: 'Buscar conversas' })).toHaveFocus())
    // O dialog devolve o foco no quadro seguinte, quando o Tab chega no guarda.
    const quadro = () => act(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))))
    for (let i = 0; i < 8; i++) {
      await usuario.tab()
      await quadro()
      expect(gaveta.contains(document.activeElement)).toBe(true)
    }
    for (let i = 0; i < 8; i++) {
      await usuario.tab({ shift: true })
      await quadro()
      expect(gaveta.contains(document.activeElement)).toBe(true)
    }
  })

  it('clicar numa linha chama aoAbrir e fecha a gaveta; a atual tem aria-current', async () => {
    const usuario = userEvent.setup()
    const aoAbrir = vi.fn()
    render(<Cena fonte={{ historicoDeConversas: async () => lista }} aoAbrir={aoAbrir} atual="semana" />)
    const gaveta = await screen.findByRole('dialog')
    expect(within(gaveta).getByRole('button', { name: /Previsão do trimestre/ })).toHaveAttribute('aria-current', 'true')
    expect(within(gaveta).getByRole('button', { name: /Presença da Althius/ })).not.toHaveAttribute('aria-current')

    await usuario.click(within(gaveta).getByRole('button', { name: /Presença da Althius/ }))
    expect(aoAbrir).toHaveBeenCalledWith(expect.objectContaining({ id: 'hoje' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('mostra respondendo só na Conversa em andamento', async () => {
    const emCurso = [
      conversa('roda', new Date(2026, 9, 23, 14, 59), { titulo: 'Auditoria no Perplexity', emAndamento: true }),
      conversa('parada', new Date(2026, 9, 23, 12, 0), { titulo: 'Pauta pronta', emAndamento: false }),
    ]
    render(<Cena fonte={{ historicoDeConversas: async () => emCurso }} />)
    const gaveta = await screen.findByRole('dialog')
    const rodando = within(gaveta).getByRole('button', { name: /Auditoria no Perplexity/ })
    const parada = within(gaveta).getByRole('button', { name: /Pauta pronta/ })
    expect(within(rodando).getByText('respondendo')).toBeInTheDocument()
    expect(within(parada).queryByText('respondendo')).not.toBeInTheDocument()
  })

  it('a busca filtra e os grupos ficam na ordem Hoje, Últimos 7 dias e Mais antigas', async () => {
    const usuario = userEvent.setup()
    render(<Cena fonte={{ historicoDeConversas: async () => lista }} />)
    const gaveta = await screen.findByRole('dialog')
    const nomes = () => within(gaveta).getAllByRole('heading', { level: 3 }).map((titulo) => titulo.textContent)
    expect(nomes()).toEqual(['Hoje', 'Últimos 7 dias', 'Mais antigas'])
    expect(within(gaveta).getByText('há 12 min')).toBeInTheDocument()
    expect(within(gaveta).getByText('terça, 10:15')).toBeInTheDocument()
    expect(within(gaveta).getByText('2 out')).toBeInTheDocument()

    await usuario.type(within(gaveta).getByRole('textbox', { name: 'Buscar conversas' }), 'previsao')
    expect(within(gaveta).queryByText('Presença da Althius vs. concorrentes')).not.toBeInTheDocument()
    expect(within(gaveta).getByText('Previsão do trimestre')).toBeInTheDocument()
    expect(nomes()).toEqual(['Últimos 7 dias'])
  })

  it('renomear e arquivar funcionam pelo teclado, e o Esc da edição não fecha a gaveta', async () => {
    const usuario = userEvent.setup()
    const renomearConversa = vi.fn(async () => {})
    const arquivarConversa = vi.fn(async () => {})
    const uma = [conversa('c1', new Date(2026, 9, 23, 14, 0), { titulo: 'Presença da Althius vs. concorrentes' })]
    const { rerender } = render(
      <Cena fonte={{ historicoDeConversas: async () => uma, renomearConversa, arquivarConversa }} />,
    )
    const gaveta = await screen.findByRole('dialog')
    await waitFor(() => expect(within(gaveta).getByRole('textbox', { name: 'Buscar conversas' })).toHaveFocus())
    await usuario.tab()
    await usuario.tab()
    expect(within(gaveta).getByRole('button', { name: 'Renomear Presença da Althius vs. concorrentes' })).toHaveFocus()
    await usuario.keyboard('{Enter}')
    const campo = within(gaveta).getByRole('textbox', { name: 'Novo nome da Conversa' })
    await usuario.clear(campo)
    await usuario.type(campo, 'Nome novo{Enter}')
    expect(renomearConversa).toHaveBeenCalledWith('c1', 'Nome novo')
    expect(gaveta).toBeInTheDocument()

    rerender(<Cena fonte={{ historicoDeConversas: async () => uma, renomearConversa, arquivarConversa }} />)
    const deNovo = await screen.findByRole('dialog')
    within(deNovo).getByRole('textbox', { name: 'Buscar conversas' }).focus()
    await usuario.tab()
    await usuario.tab()
    expect(within(deNovo).getByRole('button', { name: 'Renomear Presença da Althius vs. concorrentes' })).toHaveFocus()
    await usuario.keyboard('{Enter}')
    expect(within(deNovo).getByRole('textbox', { name: 'Novo nome da Conversa' })).toHaveFocus()
    await usuario.keyboard('{Escape}')
    expect(deNovo).toBeInTheDocument()
    expect(within(deNovo).queryByRole('textbox', { name: 'Novo nome da Conversa' })).not.toBeInTheDocument()

    within(deNovo).getByRole('textbox', { name: 'Buscar conversas' }).focus()
    await usuario.tab()
    await usuario.tab()
    await usuario.tab()
    expect(within(deNovo).getByRole('button', { name: 'Arquivar Presença da Althius vs. concorrentes' })).toHaveFocus()
    await usuario.keyboard('{Enter}')
    expect(arquivarConversa).toHaveBeenCalledWith('c1')
    expect(within(deNovo).queryByText('Presença da Althius vs. concorrentes')).not.toBeInTheDocument()
  })

  it('carregar mais pede a página seguinte com antesDe e não duplica linhas', async () => {
    const usuario = userEvent.setup()
    const primeira = Array.from({ length: POR_PAGINA }, (_, indice) =>
      conversa(`p${indice}`, new Date(2026, 9, 23, 14, 0, POR_PAGINA - indice), { titulo: `Conversa ${indice}` }),
    )
    const extra = conversa('extra', new Date(2026, 8, 2, 10, 0), { titulo: 'Conversa extra' })
    const historicoDeConversas = vi.fn(async (_agente: AgenteId | null, antesDe?: string) => {
      if (!antesDe) return primeira
      return [primeira[POR_PAGINA - 1], extra]
    })
    render(<Cena fonte={{ historicoDeConversas }} />)
    const gaveta = await screen.findByRole('dialog')
    await usuario.click(within(gaveta).getByRole('button', { name: 'Carregar mais' }))
    expect(historicoDeConversas).toHaveBeenLastCalledWith(null, primeira[POR_PAGINA - 1].atualizadaEm)
    expect(await within(gaveta).findByText('Conversa extra')).toBeInTheDocument()
    expect(within(gaveta).getAllByText(`Conversa ${POR_PAGINA - 1}`)).toHaveLength(1)
  })

  it('mostra o skeleton enquanto a lista não chega, e o alerta quando falha', async () => {
    let resolver: (lista: ResumoDeConversa[]) => void = () => {}
    const pendente = new Promise<ResumoDeConversa[]>((resolve) => {
      resolver = resolve
    })
    const { rerender } = render(<Cena fonte={{ historicoDeConversas: () => pendente }} />)
    expect(await screen.findAllByRole('status')).not.toHaveLength(0)
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThanOrEqual(4)

    resolver([])
    expect(await screen.findByText('Nenhuma Conversa ainda.')).toBeInTheDocument()
    expect(document.querySelector('[data-slot="skeleton"]')).not.toBeInTheDocument()

    rerender(
      <Cena
        fonte={{ historicoDeConversas: () => Promise.reject(new Error('Não foi possível carregar as Conversas.')) }}
      />,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar as Conversas.')
  })

  it('a Conversa do Slack mostra a marca e abre com doSlack', async () => {
    const usuario = userEvent.setup()
    const aoAbrir = vi.fn()
    const doSlack = {
      ...conversa('c-slack', new Date(2026, 9, 23, 14, 0), { primeiroPedido: 'Quem são as Contas Quentes?' }),
      doSlack: { agenteId: 'agente-scopus' },
    }
    render(<Cena fonte={{ historicoDeConversas: async () => [doSlack] }} aoAbrir={aoAbrir} />)
    const gaveta = await screen.findByRole('dialog')
    const linha = within(gaveta).getByRole('button', { name: /^Quem são as Contas Quentes/ })
    expect(within(linha).getByText('Slack')).toBeInTheDocument()
    await usuario.click(linha)
    expect(aoAbrir).toHaveBeenCalledWith(expect.objectContaining({ id: 'c-slack', doSlack: { agenteId: 'agente-scopus' } }))
  })

  it('sem historicoDeConversas, não renderiza nada', () => {
    const fonte = fonteDe({})
    expect(temHistorico(fonte)).toBe(false)
    renderizar(fonte, <GavetaDeHistorico aberto aoMudar={() => {}} agenteId={null} aoAbrir={() => {}} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Buscar conversas' })).not.toBeInTheDocument()
  })
})
